/**
 * Web3Auth v10 runtime bridge.
 *
 * The package's transitive declaration files do not pass this repository's strict TypeScript build, so the SDK is
 * deliberately loaded behind this small JavaScript boundary. `web3authSdk.d.ts` is the complete surface the typed
 * adapter is allowed to consume.
 *
 * Web3Auth v10 owns the connector session that is required by later wallet operations. Storage is limited to the
 * current tab (`session`); application code never copies the identity token into local/session storage. Do not call
 * `clearCache()` after connecting: v10 clears the active connector and chain together with the token, so signing and
 * explicit logout would no longer address the session that produced the login.
 */

import { Buffer as BrowserBuffer } from 'buffer/'
import processShim from 'process/browser'

const AUTH_CONNECTOR = 'auth'

/**
 * 복원이 끝났음을 알리는 v10 이벤트. 값은 `no-modal/dist/lib.esm/base/connector/constants.js`의
 * `CONNECTOR_EVENTS`다 — 성공은 `connected`, 실패는 `rehydration_error`·`errored`이고
 * 복원할 세션이 없었으면 커넥터 초기화 끝에 `ready`가 온다.
 */
const RESTORE_SETTLED_EVENTS = ['connected', 'rehydration_error', 'errored', 'ready']

/**
 * 복원 시도가 **이미 끝난** SDK 상태. 값은 `CONNECTOR_STATUS`다.
 *
 * 리스너는 `init()`이 resolve된 뒤에 붙으므로 그 사이에 난 이벤트는 놓친다 — 커넥터 초기화는
 * `init()`과 나란히 돌고(`modalManager.js:174` await 없음), 커넥터 `init()` 예외는
 * `initInAppAndCachedConnectors`가 삼켜 다시 올 이벤트가 없다. 그대로 두면 올 리 없는 이벤트를
 * 상한까지 기다린다.
 *
 * `not_ready`(아직 시작 전)와 `connecting`(복원이 붙는 중 — `authConnector.js:147`의
 * `connect()`가 거쳐 간다)은 **끝난 것이 아니므로 넣지 않는다.**
 */
const RESTORE_SETTLED_STATUS = ['ready', 'errored']

/**
 * 복원 대기 상한. 복원은 ws-embed iframe 적재와 세션 조회를 포함해 `init()`이 끝난 뒤에도 몇 초
 * 더 걸린다. 상한에 닿으면 기다리기를 멈추고 "복원되지 않음"으로 진행한다 — 여기서 영영 막히면
 * 로그인 화면이 열리지 않는다.
 */
const RESTORE_TIMEOUT_MS = 8_000

function providerBoundary(provider) {
  if (!provider) return null
  return {
    request: (args) => provider.request(args),
  }
}

export function createSdkWeb3AuthClient(options) {
  let sdk = null

  return {
    get provider() {
      return providerBoundary(sdk?.provider ?? null)
    },
    // provider 는 init 뒤 항상 채워지므로 연결 판정에 쓸 수 없다. connectedConnector 를 본다.
    get connected() {
      return Boolean(sdk?.connected)
    },
    async init() {
      if (typeof globalThis.Buffer !== 'function') {
        globalThis.Buffer = BrowserBuffer
      }
      if (typeof globalThis.process !== 'object') {
        globalThis.process = processShim
      }
      if (globalThis.global !== globalThis) {
        globalThis.global = globalThis
      }
      const { Web3Auth } = await import('@web3auth/modal')
      sdk = new Web3Auth({
        clientId: options.clientId,
        web3AuthNetwork: 'sapphire_devnet',
        chains: [
          {
            chainNamespace: 'eip155',
            chainId: options.chainIdHex,
            rpcTarget: options.rpcUrl,
            displayName: 'Kaia Kairos',
            blockExplorerUrl: options.explorerUrl,
            ticker: 'KAIA',
            tickerName: 'Kaia',
          },
        ],
        defaultChainId: options.chainIdHex,
        enableLogging: false,
        disableAnalytics: true,
        // Bound the SDK-owned connector state to this browser tab.
        storageType: 'session',
      })
      await sdk.init()
    },
    /**
     * 캐시된 세션 복원이 끝날 때까지 기다린다. 기다릴 것이 없으면 즉시 돌아온다.
     *
     * `init()`은 복원을 기다리지 않는다 — modal 빌드는 커넥터 초기화를 `CONNECTORS_UPDATED`
     * 리스너에서 **await 없이** 시작한다(`modalManager.js:163·174`). 그 창에서는 세션이 곧
     * 붙을 예정인데도 `connected`가 false라, 서명은 "계정 없음"으로 실패하고 다시 로그인하면
     * 커넥터가 아직 없어 `connectTo`가 던진다.
     *
     * 끝났는지는 상태로 본다 — 성공하면 `connected`가 켜지고, 실패하면 v10이 캐시를 비운다
     * (`noModal.js` REHYDRATION_ERROR → `clearCache()`). 둘 다 아니면 아직 진행 중이다.
     */
    async awaitRestoredSession() {
      if (!sdk || sdk.connected || sdk.cachedConnector !== AUTH_CONNECTOR) return
      if (RESTORE_SETTLED_STATUS.includes(sdk.status)) return
      if (typeof sdk.on !== 'function') return
      await new Promise((resolve) => {
        const settle = () => {
          clearTimeout(timer)
          // **resolve가 먼저다.** 정리가 던지면 타이머는 이미 지워졌고 resolve에 닿지 못해
          // promise가 영영 pending으로 남는다 — 초기화가 메모이즈돼 있어 그 탭의 지갑 동작이
          // 전부 멈춘다. 정리 실패는 리스너가 한 번 더 불리는 것뿐이고 resolve는 멱등이다.
          resolve()
          try {
            for (const event of RESTORE_SETTLED_EVENTS) sdk.removeListener(event, settle)
          } catch {
            /* 해제에 실패해도 기다림은 이미 끝났다. */
          }
        }
        const timer = setTimeout(settle, RESTORE_TIMEOUT_MS)
        for (const event of RESTORE_SETTLED_EVENTS) sdk.on(event, settle)
      })
    },
    async connectTo(_connector, params) {
      if (!sdk) return null
      return providerBoundary(await sdk.connectTo(AUTH_CONNECTOR, params))
    },
    async getIdentityToken() {
      if (!sdk) return { idToken: '' }
      return sdk.getIdentityToken()
    },
    async logout(logoutOptions) {
      if (!sdk) return
      await sdk.logout(logoutOptions)
    },
    /** 인스턴스를 버린다 — 다음 init() 이 새 Web3Auth 를 만든다(계약 주석, D-75). */
    dispose() {
      sdk = null
    },
  }
}
