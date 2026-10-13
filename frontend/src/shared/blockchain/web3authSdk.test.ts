import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSdkWeb3AuthClient } from './web3authSdk.js'

type Listener = () => void

const sdk = vi.hoisted(() => ({
  provider: null,
  connected: false,
  cachedConnector: null as string | null,
  /** `CONNECTOR_STATUS`. 깨끗한 인스턴스는 `not_ready`에서 시작한다(`noModal.js:30`) */
  status: 'not_ready',
  listeners: new Map<string, Set<() => void>>(),
  on: vi.fn(function on(event: string, listener: () => void) {
    const bucket = sdk.listeners.get(event) ?? new Set<() => void>()
    bucket.add(listener)
    sdk.listeners.set(event, bucket)
  }),
  removeListener: vi.fn(function removeListener(event: string, listener: () => void) {
    sdk.listeners.get(event)?.delete(listener)
  }),
  emit(event: string) {
    for (const listener of [...(sdk.listeners.get(event) ?? [])]) listener()
  },
  init: vi.fn(async () => undefined),
  connectTo: vi.fn(async () => null),
  getIdentityToken: vi.fn(async () => ({ idToken: 'header.payload.signature' })),
  logout: vi.fn(async () => undefined),
  clearCache: vi.fn(),
}))

/** 복원 대기가 실제로 붙는 이벤트 — `CONNECTOR_EVENTS`의 값이다 */
const SETTLED_EVENTS = ['connected', 'rehydration_error', 'errored', 'ready']

const Web3Auth = vi.hoisted(() =>
  vi.fn(function Web3AuthMock() {
    return sdk
  }),
)

vi.mock('@web3auth/modal', () => ({ Web3Auth }))

const OPTIONS = {
  clientId: 'client-id',
  rpcUrl: 'https://public-en-kairos.node.kaia.io',
  chainId: 1001,
  chainIdHex: '0x3e9',
  explorerUrl: 'https://kairos.kaiascan.io',
}

describe('Web3Auth v10 runtime bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    sdk.connected = false
    sdk.cachedConnector = null
    sdk.status = 'not_ready'
    sdk.listeners.clear()
    // clearAllMocks는 호출 기록만 지운다 — 던지게 바꾼 구현이 다음 테스트로 새지 않게 되돌린다
    sdk.removeListener.mockImplementation((event: string, listener: Listener) => {
      sdk.listeners.get(event)?.delete(listener)
    })
  })

  /** 캐시된 auth 세션이 복원되는 중인 탭 — `init()`이 끝나도 아직 `connected`가 아니다 */
  async function restoringClient() {
    sdk.cachedConnector = 'auth'
    const client = createSdkWeb3AuthClient(OPTIONS)
    await client.init()
    return client
  }

  it('provides Node browser shims before the Web3Auth SDK initializes in Vite', async () => {
    vi.stubGlobal('Buffer', undefined)
    vi.stubGlobal('process', undefined)
    vi.stubGlobal('global', undefined)
    Web3Auth.mockImplementationOnce(function Web3AuthNeedsBrowserShims() {
      if (typeof globalThis.Buffer !== 'function') {
        throw new ReferenceError('Buffer is not defined')
      }
      if (typeof globalThis.process !== 'object') {
        throw new ReferenceError('process is not defined')
      }
      if (globalThis.global !== globalThis) {
        throw new ReferenceError('global is not defined')
      }
      return sdk
    })
    const client = createSdkWeb3AuthClient(OPTIONS)

    await expect(client.init()).resolves.toBeUndefined()
  })

  it('dispose 뒤에는 인스턴스가 없다 — connected 는 false, provider 는 null (D-75)', async () => {
    const client = createSdkWeb3AuthClient(OPTIONS)
    await client.init()
    client.dispose()
    expect(client.connected).toBe(false)
    expect(client.provider).toBeNull()
    await expect(client.logout({ cleanup: true })).resolves.toBeUndefined()
  })

  it('keeps the SDK connection state after initialization so wallet operations remain available', async () => {
    const client = createSdkWeb3AuthClient(OPTIONS)

    await client.init()

    expect(sdk.init).toHaveBeenCalledTimes(1)
    expect(sdk.clearCache).not.toHaveBeenCalled()
    expect(Web3Auth).toHaveBeenCalledWith(expect.objectContaining({ storageType: 'session' }))
  })

  describe('복원 대기', () => {
    it('이미 붙어 있으면 기다리지 않는다', async () => {
      sdk.cachedConnector = 'auth'
      sdk.connected = true
      const client = createSdkWeb3AuthClient(OPTIONS)
      await client.init()

      await expect(client.awaitRestoredSession()).resolves.toBeUndefined()

      expect(sdk.on).not.toHaveBeenCalled()
    })

    it('복원할 캐시 커넥터가 없으면 기다리지 않는다', async () => {
      const client = createSdkWeb3AuthClient(OPTIONS)
      await client.init()

      await expect(client.awaitRestoredSession()).resolves.toBeUndefined()

      expect(sdk.on).not.toHaveBeenCalled()
    })

    it('ready가 오면 리스너를 모두 해제하고 푼다', async () => {
      const client = await restoringClient()

      const waiting = client.awaitRestoredSession()
      expect(sdk.on.mock.calls.map(([event]) => event)).toEqual(SETTLED_EVENTS)

      sdk.emit('ready')
      await expect(waiting).resolves.toBeUndefined()

      expect(sdk.removeListener.mock.calls.map(([event]) => event)).toEqual(SETTLED_EVENTS)
      expect([...sdk.listeners.values()].every((bucket) => bucket.size === 0)).toBe(true)
    })

    it('리스너 해제가 던져도 대기는 풀린다', async () => {
      // 정리가 resolve를 막으면 타이머도 이미 지워져 promise가 영영 pending이 된다.
      // 초기화는 메모이즈돼 있어 그 탭의 지갑 동작이 전부 멈춘다.
      const client = await restoringClient()
      sdk.removeListener.mockImplementation(() => {
        throw new Error('listener registry is gone')
      })

      const waiting = client.awaitRestoredSession()
      sdk.emit('connected')

      await expect(waiting).resolves.toBeUndefined()
    })

    it('이벤트를 이미 놓쳤으면(status가 복원 뒤 상태) 상한까지 기다리지 않는다', async () => {
      // 리스너는 init()이 resolve된 뒤에 붙는데 커넥터 초기화는 그와 나란히 돈다. 그 사이에
      // ready가 지나갔으면 다시 올 이벤트가 없다.
      sdk.status = 'ready'
      const client = await restoringClient()

      await expect(client.awaitRestoredSession()).resolves.toBeUndefined()

      expect(sdk.on).not.toHaveBeenCalled()
    })

    it('복원이 붙는 중(connecting)이면 계속 기다린다', async () => {
      // `authConnector.connect()`가 복원 도중 거쳐 가는 상태다 — 끝난 것이 아니다.
      sdk.status = 'connecting'
      const client = await restoringClient()
      let settled = false

      const waiting = client.awaitRestoredSession().then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)

      sdk.emit('connected')
      await waiting
      expect(settled).toBe(true)
    })
  })

  it('returns the identity token without clearing the active connector', async () => {
    const client = createSdkWeb3AuthClient(OPTIONS)
    await client.init()

    await expect(client.getIdentityToken()).resolves.toEqual({
      idToken: 'header.payload.signature',
    })

    expect(sdk.clearCache).not.toHaveBeenCalled()
  })
})
