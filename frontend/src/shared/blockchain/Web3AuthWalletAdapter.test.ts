import { parseTransaction } from '@kaiachain/ethers-ext/v6'
import { computeAddress, getAddress, SigningKey } from 'ethers'
import { describe, expect, it, vi } from 'vitest'

import type { SignTransactionRequest } from './WalletAdapter'
import { WalletError } from './WalletAdapter'
import {
  Web3AuthWalletAdapter,
  type Web3AuthClient,
  type Web3AuthProvider,
} from './Web3AuthWalletAdapter'

const ADDRESS = '0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a'
const ID_TOKEN = 'header.payload.signature'
const FEE_PAYER = '0x1234567890abcdef1234567890abcdef12345678'
const TARGET = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const TEST_PRIVATE_KEY = '0x59c6995e998f97a5a0044976f0945389dc9e86dae88c7a8412f4603b6b78690d'

function providerDouble(chainId: unknown = '0x3e9', accounts: unknown = [ADDRESS]) {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === 'eth_accounts') return accounts
    if (method === 'eth_chainId') return chainId
    if (method === 'personal_sign') return '0xsigned'
    throw new Error(`Unexpected method: ${method}`)
  })

  return { request } satisfies Web3AuthProvider
}

/**
 * 실제 v10 의 계약을 그대로 흉내 낸다.
 *
 * - **`provider` 는 연결 신호가 아니다.** `init()` 이 `commonJRPCProvider` 를 만들어 두므로
 *   세션이 없어도 채워져 있다(`no-modal/dist/lib.esm/noModal.js:70·150·617`).
 * - **`connected` 가 연결 신호다** — `Boolean(connectedConnector)`(`:67`).
 * - `logout()` 은 연결돼 있지 않으면 던진다(`:358`).
 *
 * 더블이 "연결 전엔 provider 가 null" 로 굳어 있으면 그 전제를 쓰는 결함이 초록으로 통과한다.
 *
 * @param restored 저장소 세션이 복원된 상태로 시작한다(= 새로고침 직후)
 */
function clientDouble(
  provider: Web3AuthProvider | null = providerDouble(),
  { restored = false }: { restored?: boolean } = {},
) {
  // 인터페이스가 readonly 라 getter 로 노출하고 상태는 따로 든다.
  const state = { connected: restored }
  const client: Web3AuthClient = {
    // init 뒤에는 세션 유무와 무관하게 채워져 있다.
    get provider() {
      return provider
    },
    get connected() {
      return state.connected
    },
    init: vi.fn(async () => undefined),
    // 복원할 세션이 없으면 즉시 돌아온다. 복원 중인 창을 흉내 내는 테스트는 이것을 덮어쓴다.
    awaitRestoredSession: vi.fn(async () => undefined),
    connectTo: vi.fn(async () => {
      state.connected = true
      return provider
    }),
    getIdentityToken: vi.fn(async () => ({ idToken: ID_TOKEN })),
    logout: vi.fn(async () => {
      if (!state.connected) throw new Error('No wallet is connected')
      state.connected = false
    }),
    dispose: vi.fn(),
  }
  return client
}

describe('Web3AuthWalletAdapter', () => {
  it.each([
    ['GOOGLE', 'google'],
    ['FACEBOOK', 'facebook'],
    ['KAKAO', 'kakao'],
  ] as const)('connects %s through the AUTH connector', async (socialProvider, authConnection) => {
    const provider = providerDouble()
    const client = clientDouble(provider)
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    const connection = await adapter.connectSocial(socialProvider)

    expect(client.init).toHaveBeenCalledTimes(1)
    expect(client.connectTo).toHaveBeenCalledWith('auth', { authConnection })
    expect(connection).toEqual({
      provider: 'WEB3AUTH',
      address: ADDRESS,
      chainId: 1001,
      socialProvider,
      idToken: ID_TOKEN,
    })
  })

  it('initializes the SDK only once across repeated calls', async () => {
    const client = clientDouble()
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await Promise.all([adapter.initialize(), adapter.initialize()])
    await adapter.connectSocial('GOOGLE')

    expect(client.init).toHaveBeenCalledTimes(1)
  })

  it('reuses the active provider when the same social login is retried after an API failure', async () => {
    const provider = providerDouble()
    const client = clientDouble(provider)
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await adapter.connectSocial('GOOGLE')
    await adapter.connectSocial('GOOGLE')

    expect(client.connectTo).toHaveBeenCalledTimes(1)
    expect(client.getIdentityToken).toHaveBeenCalledTimes(2)
    expect(client.logout).not.toHaveBeenCalled()
  })

  it('cleans up the active connector before switching social providers', async () => {
    const provider = providerDouble()
    const client = clientDouble(provider)
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await adapter.connectSocial('GOOGLE')
    await adapter.connectSocial('KAKAO')

    expect(client.logout).toHaveBeenCalledWith({ cleanup: false })
    expect(client.connectTo).toHaveBeenCalledTimes(2)
  })

  it('does not log out when there is no session — provider 가 채워져 있어도 최초 로그인이다', async () => {
    // v10 은 init() 만 해도 provider 가 채워진다. 그걸 연결 신호로 쓰면 최초 로그인에서
    // logout 이 불리고, 실제 SDK 는 거기서 notConnectedError 를 던진다.
    const client = clientDouble()
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await adapter.connectSocial('GOOGLE')

    expect(client.logout).not.toHaveBeenCalled()
    expect(client.connectTo).toHaveBeenCalledTimes(1)
  })

  it('keeps the live connection when a retry fails at the token stage', async () => {
    // 토큰 단계 실패는 **SDK 연결과 무관하다**(서버·토큰 서비스 쪽이다). 같은 버튼의 재시도는
    // 살아 있는 연결을 그대로 쓴다 — 여기서 다시 connectTo 를 부르면 v10 이 Already connected 다.
    const provider = providerDouble()
    const client = clientDouble(provider)
    const adapter = new Web3AuthWalletAdapter(client, 1001)
    await adapter.connectSocial('GOOGLE')

    client.getIdentityToken = vi.fn(async () => {
      throw new Error('token service down')
    }) as unknown as typeof client.getIdentityToken
    await expect(adapter.connectSocial('GOOGLE')).rejects.toBeInstanceOf(WalletError)

    client.getIdentityToken = vi.fn(async () => ({ idToken: ID_TOKEN }))
    await adapter.connectSocial('GOOGLE')

    expect(client.connectTo).toHaveBeenCalledTimes(1)
    expect(client.logout).not.toHaveBeenCalled()
  })

  it('logs out a session restored by the SDK before connecting again', async () => {
    // 새로고침 뒤의 상태 — 어댑터는 방금 만들어졌지만(activeSocialProvider = null)
    // SDK 는 init() 에서 저장소 세션을 복원해 provider 를 이미 들고 있다.
    // 이때 그대로 connectTo 를 부르면 v10 이 "Already connected" 로 던진다.
    const provider = providerDouble()
    const client = clientDouble(provider, { restored: true })
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await adapter.connectSocial('GOOGLE')

    expect(client.logout).toHaveBeenCalledWith({ cleanup: false })
    expect(client.connectTo).toHaveBeenCalledTimes(1)
  })

  it('leaves no reusable state when the social login fails after a logout', async () => {
    // 복원된 세션을 끊은 뒤 사용자가 팝업을 닫은 경우. 어댑터가 옛 provider 를 재사용하러
    // 가면 죽은 연결로 로그인한 척하게 된다 — 다음 시도도 connectTo 로 가야 한다.
    const provider = providerDouble()
    const client = clientDouble(provider, { restored: true })
    const failing = vi.fn(async () => {
      throw new Error('user closed popup')
    })
    client.connectTo = failing as unknown as typeof client.connectTo
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await expect(adapter.connectSocial('GOOGLE')).rejects.toBeInstanceOf(WalletError)
    expect(client.logout).toHaveBeenCalledWith({ cleanup: false })

    client.connectTo = vi.fn(async () => provider) as unknown as typeof client.connectTo
    await expect(adapter.connectSocial('GOOGLE')).resolves.toMatchObject({ address: ADDRESS })
    expect(client.connectTo).toHaveBeenCalledTimes(1)
  })

  it('disposes the SDK on disconnect so the next login re-initializes (D-75)', async () => {
    // v10 은 logout({cleanup:true}) 뒤 커넥터를 NOT_READY 로 두고 다시 올리지 않는다. 같은 탭의
    // 재로그인은 새 인스턴스로만 된다 — 새 탭에서 되는 이유가 그것이다.
    const provider = providerDouble()
    const client = clientDouble(provider)
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await adapter.connectSocial('GOOGLE')
    await adapter.disconnect()

    expect(client.logout).toHaveBeenLastCalledWith({ cleanup: true })
    expect(client.dispose).toHaveBeenCalledOnce()

    await adapter.warmUp()
    await adapter.connectSocial('GOOGLE')
    expect(client.init).toHaveBeenCalledTimes(2)
    expect(client.connectTo).toHaveBeenCalledTimes(2)
  })

  it('still disposes when logout throws — a dead session is not worth keeping', async () => {
    const client = clientDouble(providerDouble())
    client.logout = vi.fn(async () => {
      throw new Error('network')
    }) as unknown as typeof client.logout
    const adapter = new Web3AuthWalletAdapter(client, 1001)
    await adapter.connectSocial('GOOGLE')

    await expect(adapter.disconnect()).rejects.toBeInstanceOf(WalletError)
    expect(client.dispose).toHaveBeenCalledOnce()
    await adapter.initialize()
    expect(client.init).toHaveBeenCalledTimes(2)
  })

  it('retries SDK initialization after the cached attempt rejects', async () => {
    const client = clientDouble(undefined, { restored: true })
    vi.mocked(client.init)
      .mockRejectedValueOnce(new Error('temporary initialization failure'))
      .mockResolvedValueOnce(undefined)
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await expect(adapter.initialize()).rejects.toMatchObject({ kind: 'AUTH_FAILED' })
    await expect(adapter.initialize()).resolves.toBeUndefined()

    expect(client.init).toHaveBeenCalledTimes(2)
  })

  it('restores an existing provider without starting another social login', async () => {
    const client = clientDouble(undefined, { restored: true })
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await expect(adapter.connect()).resolves.toEqual({
      provider: 'WEB3AUTH',
      address: ADDRESS,
      chainId: 1001,
    })
    expect(client.connectTo).not.toHaveBeenCalled()
  })

  it('returns the current address and signs a challenge through personal_sign', async () => {
    const provider = providerDouble()
    const client = clientDouble(provider, { restored: true })
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await expect(adapter.getAddress()).resolves.toBe(ADDRESS)
    await expect(adapter.signMessage('challenge')).resolves.toBe('0xsigned')
    expect(provider.request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: ['challenge', ADDRESS],
    })
  })

  it.each([
    ['missing provider', null, '0x3e9', [ADDRESS], 'NOT_CONNECTED'],
    ['missing account', 'provider', '0x3e9', [], 'NOT_CONNECTED'],
    ['missing identity token', 'provider', '0x3e9', [ADDRESS], 'AUTH_FAILED'],
    ['wrong chain', 'provider', '0x1', [ADDRESS], 'WRONG_CHAIN'],
  ] as const)(
    'rejects %s with a typed wallet error',
    async (_label, providerState, chainId, accounts, kind) => {
      const provider = providerState === null ? null : providerDouble(chainId, accounts)
      const client = clientDouble(provider)
      if (kind === 'AUTH_FAILED') {
        vi.mocked(client.getIdentityToken).mockResolvedValue({ idToken: '' })
      }
      const adapter = new Web3AuthWalletAdapter(client, 1001)

      const error = await adapter.connectSocial('GOOGLE').catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(WalletError)
      expect((error as WalletError).kind).toBe(kind)
    },
  )

  it('consumes the identity token before connection validation can fail', async () => {
    const provider = providerDouble('0x1')
    const client = clientDouble(provider)
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await expect(adapter.connectSocial('GOOGLE')).rejects.toMatchObject({ kind: 'WRONG_CHAIN' })

    expect(client.getIdentityToken).toHaveBeenCalledTimes(1)
    expect(vi.mocked(client.getIdentityToken).mock.invocationCallOrder[0]).toBeLessThan(
      provider.request.mock.invocationCallOrder[0],
    )
  })

  it.each([5113, '5113'])(
    'treats Web3Auth popupClosed code %s as a user cancellation',
    async (code) => {
      const client = clientDouble()
      vi.mocked(client.connectTo).mockRejectedValue({ code })
      const adapter = new Web3AuthWalletAdapter(client, 1001)

      await expect(adapter.connectSocial('GOOGLE')).rejects.toMatchObject({
        kind: 'USER_REJECTED',
      })
    },
  )

  it.each([4001, '4001'])(
    'treats provider rejection code %s as a user cancellation',
    async (code) => {
      const client = clientDouble()
      vi.mocked(client.connectTo).mockRejectedValue({ code })
      const adapter = new Web3AuthWalletAdapter(client, 1001)

      await expect(adapter.connectSocial('GOOGLE')).rejects.toMatchObject({
        kind: 'USER_REJECTED',
      })
    },
  )

  it('does not treat Web3Auth popup blocked as a user cancellation', async () => {
    const client = clientDouble()
    vi.mocked(client.connectTo).mockRejectedValue({ code: 5115 })
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await expect(adapter.connectSocial('GOOGLE')).rejects.toMatchObject({ kind: 'AUTH_FAILED' })
  })

  it('returns a Kaia fee-delegated sender-signed RLP without exporting the wallet key', async () => {
    const signingKey = new SigningKey(TEST_PRIVATE_KEY)
    const signerAddress = computeAddress(TEST_PRIVATE_KEY)
    const provider: Web3AuthProvider = {
      request: vi.fn(async ({ method, params }) => {
        if (method === 'eth_accounts') return [signerAddress]
        if (method === 'eth_chainId') return '0x3e9'
        if (method === 'eth_getTransactionCount') return '0x7'
        if (method === 'eth_gasPrice') return '0x5d21dba00'
        if (method === 'eth_sign') {
          const [, digest] = params as readonly [string, string]
          return signingKey.sign(digest).serialized
        }
        throw new Error(`Unexpected method: ${method}`)
      }),
    }
    const adapter = new Web3AuthWalletAdapter(clientDouble(provider, { restored: true }), 1001)
    const request: SignTransactionRequest = {
      kind: 'PURCHASE',
      required: true,
      txType: 'FEE_DELEGATED_SMART_CONTRACT_EXECUTION',
      to: TARGET,
      data: '0x1234abcd',
      value: '0x0',
      chainId: '0x3e9',
      gas: '0x11170',
      feePayer: FEE_PAYER,
      summary: { title: 'Purchase ticket' },
    }

    const senderSignedRlp = await adapter.signTransaction(request)
    const parsed = parseTransaction(senderSignedRlp)

    expect(senderSignedRlp).toMatch(/^0x31/)
    expect(parsed).toMatchObject({
      type: 49,
      nonce: 7,
      gasLimit: '0x11170',
      gasPrice: '0x5d21dba00',
      from: signerAddress,
      to: getAddress(TARGET),
      data: '0x1234abcd',
      value: '0x0',
    })
    expect(parsed.txSignatures).toHaveLength(1)
    expect([2037n, 2038n]).toContain(BigInt(parsed.txSignatures[0][0]))
    expect(parsed.feePayer).toBeUndefined()
    expect(provider.request).not.toHaveBeenCalledWith({ method: 'eth_private_key' })
  })

  it('classifies rejection of the fee-delegated sender signature as user cancellation', async () => {
    const provider: Web3AuthProvider = {
      request: vi.fn(async ({ method }) => {
        if (method === 'eth_accounts') return [ADDRESS]
        if (method === 'eth_getTransactionCount') return '0x1'
        if (method === 'eth_gasPrice') return '0x5d21dba00'
        if (method === 'eth_sign') throw { code: 4001 }
        throw new Error(`Unexpected method: ${method}`)
      }),
    }
    const adapter = new Web3AuthWalletAdapter(clientDouble(provider, { restored: true }), 1001)

    await expect(
      adapter.signTransaction({
        kind: 'AGREE',
        required: true,
        txType: 'FEE_DELEGATED_SMART_CONTRACT_EXECUTION',
        to: TARGET,
        data: '0x1234',
        value: '0x0',
        chainId: '0x3e9',
        gas: '0x11170',
        feePayer: FEE_PAYER,
        summary: { title: 'Accept rules' },
      }),
    ).rejects.toMatchObject({ kind: 'USER_REJECTED' })
  })

  it('separates an empty account list from a failed eth_accounts call', async () => {
    // 둘을 하나로 뭉개면(이전 구현의 `catch { return null }`) RPC 오류·레이트 리밋이 전부
    // "계정 없음"이 되고, 사용자에게는 원인도 다음 행동도 남지 않는다(리허설 2 D-64).
    const empty = new Web3AuthWalletAdapter(
      clientDouble(providerDouble('0x3e9', []), { restored: true }),
      1001,
    )
    await expect(empty.getAddress()).resolves.toBeNull()

    const failing: Web3AuthProvider = {
      request: vi.fn(async () => {
        throw { code: -32005, message: 'request limit exceeded' }
      }),
    }
    const broken = new Web3AuthWalletAdapter(clientDouble(failing, { restored: true }), 1001)
    const error = await broken.getAddress().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WalletError)
    expect((error as WalletError).kind).toBe('UNKNOWN')
  })

  it.each([
    ['signMessage', (adapter: Web3AuthWalletAdapter) => adapter.signMessage('challenge')],
    [
      'signTransaction',
      (adapter: Web3AuthWalletAdapter) =>
        adapter.signTransaction({
          kind: 'AGREE',
          required: true,
          txType: 'FEE_DELEGATED_SMART_CONTRACT_EXECUTION',
          to: TARGET,
          data: '0x1234',
          value: '0x0',
          chainId: '0x3e9',
          gas: '0x11170',
          feePayer: FEE_PAYER,
          summary: { title: 'Accept rules' },
        }),
    ],
  ] as const)(
    '%s tells a missing session apart from a failed account read',
    async (_label, sign) => {
      // 두 호출부가 같은 판정을 쓴다 — 한쪽만 고치면 갈린다.
      const noSession = new Web3AuthWalletAdapter(
        clientDouble(providerDouble('0x3e9', []), { restored: true }),
        1001,
      )
      await expect(sign(noSession)).rejects.toMatchObject({ kind: 'NOT_CONNECTED' })

      const failing = new Web3AuthWalletAdapter(
        clientDouble(
          {
            request: vi.fn(async () => {
              throw { code: -32005 }
            }),
          },
          { restored: true },
        ),
        1001,
      )
      await expect(sign(failing)).rejects.toMatchObject({ kind: 'UNKNOWN' })
    },
  )

  it('waits for a late session instead of failing the first signature', async () => {
    // 복원은 awaitRestoredSession() 이 돌아온 뒤에도 이어질 수 있다. 예전에는 그 창에 걸린
    // 서명이 곧바로 NOT_CONNECTED 였고, 사용자가 붙을 때까지 "다시 시도"를 3~5번 눌렀다.
    const provider = providerDouble()
    const client = clientDouble(provider)
    const adapter = new Web3AuthWalletAdapter(client, 1001)
    setTimeout(() => void client.connectTo('auth', { authConnection: 'google' }), 900)

    await expect(adapter.signMessage('challenge')).resolves.toBe('0xsigned')
  })

  it('treats an initialized provider without a session as not connected', async () => {
    // v10 은 init() 만 해도 provider 를 채워 둔다. 그것을 연결 신호로 여기면 지갑이 아니라
    // 공개 RPC 가 eth_accounts 에 답해 빈 배열이 오고, 화면은 그것을 "계정 없음"으로 보여 준다.
    const provider = providerDouble()
    const adapter = new Web3AuthWalletAdapter(clientDouble(provider), 1001)

    await expect(adapter.getAddress()).resolves.toBeNull()
    await expect(adapter.connect()).rejects.toMatchObject({ kind: 'NOT_CONNECTED' })
    expect(provider.request).not.toHaveBeenCalled()
  })

  it('asks for the account only after a restored session settles', async () => {
    // v10 modal 빌드는 커넥터 초기화를 await 없이 시작한다 — init() 이 resolve 된 뒤에도 세션은
    // 복원 중이고, 그 창에서 물으면 계정이 빈 상태로 온다. 그래서 복원이 끝난 뒤에 묻는다.
    const provider = providerDouble()
    const client = clientDouble(provider)
    vi.mocked(client.awaitRestoredSession).mockImplementation(async () => {
      await Promise.resolve()
      Object.defineProperty(client, 'connected', { value: true, configurable: true })
    })
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await expect(adapter.getAddress()).resolves.toBe(ADDRESS)

    expect(vi.mocked(client.awaitRestoredSession).mock.invocationCallOrder[0]).toBeLessThan(
      provider.request.mock.invocationCallOrder[0],
    )
  })

  it('opens the login popup without waiting for a restored session', async () => {
    // 복원 대기는 초 단위다. 클릭 핸들러가 그만큼 멈추면 브라우저의 사용자 활성화가 만료돼
    // `connectTo`가 여는 로그인 창이 아예 뜨지 않는다 — 증상이 "계정 없음"에서 "창이 안 뜸"으로
    // 옮겨갈 뿐이다. 재로그인은 복원 결과를 쓰지도 않는다.
    const client = clientDouble()
    let releaseRestore = () => {}
    vi.mocked(client.awaitRestoredSession).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseRestore = resolve
        }),
    )
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    await expect(adapter.connectSocial('GOOGLE')).resolves.toMatchObject({ address: ADDRESS })

    expect(client.connectTo).toHaveBeenCalledTimes(1)
    releaseRestore()
  })

  it('does not directly write an identity token to browser storage or the console', async () => {
    const client = clientDouble()
    const adapter = new Web3AuthWalletAdapter(client, 1001)
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await adapter.connectSocial('GOOGLE')
    await adapter.disconnect()

    expect(client.logout).toHaveBeenCalledWith({ cleanup: true })
    expect(localStorageSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('does not copy an SDK error message that could contain an identity token', async () => {
    const client = clientDouble()
    vi.mocked(client.getIdentityToken).mockRejectedValue(new Error(ID_TOKEN))
    const adapter = new Web3AuthWalletAdapter(client, 1001)

    const error = await adapter.connectSocial('GOOGLE').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WalletError)
    expect((error as WalletError).message).not.toContain(ID_TOKEN)
  })
})
