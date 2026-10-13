import { KlaytnTxFactory, TxType } from '@kaiachain/ethers-ext/v6'
import { keccak256, Signature } from 'ethers'

import type {
  SignTransactionRequest,
  SocialLoginProvider,
  WalletConnection,
  Web3AuthConnection,
  Web3AuthWalletAdapter as Web3AuthWalletAdapterContract,
} from './WalletAdapter'
import { WalletError } from './WalletAdapter'
import { beginWalletPrompt } from './signingActivity'
import { createSdkWeb3AuthClient } from './web3authSdk.js'

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
const AUTH_CONNECTOR = 'auth' as const

const AUTH_CONNECTION_BY_PROVIDER = {
  GOOGLE: 'google',
  FACEBOOK: 'facebook',
  KAKAO: 'kakao',
} as const satisfies Record<SocialLoginProvider, string>

export interface Web3AuthProvider {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>
}

/** 테스트가 SDK 전역 상태 없이 어댑터 경계를 검증할 수 있게 하는 최소 Web3Auth v10 표면. */
export interface Web3AuthClient {
  /**
   * ⚠️ **"연결됨"의 신호가 아니다.** v10의 getter는 `status !== NOT_READY && commonJRPCProvider`
   * 면 돌려주는데, 그 provider는 세션 유무와 무관하게 `init()` 안에서 만들어진다
   * (`no-modal/dist/lib.esm/noModal.js:70·150·617`). 깨끗한 init 뒤에도 truthy다.
   * 연결 여부는 {@link Web3AuthClient.connected}로 본다.
   */
  readonly provider: Web3AuthProvider | null
  /** `Boolean(connectedConnector)` — 세션이 실제로 붙어 있는가(`noModal.js:67`). */
  readonly connected: boolean
  init(): Promise<void>
  /**
   * 저장소에 캐시된 세션의 복원이 끝날 때까지 기다린다. 기다릴 것이 없으면 즉시 돌아온다.
   *
   * ⚠️ **`init()`은 복원을 기다리지 않는다.** v10 modal 빌드는 커넥터 초기화를
   * `CONNECTORS_UPDATED` 리스너에서 **await 없이** 시작한다
   * (`modal/dist/lib.esm/packages/modal/src/modalManager.js:163·174`). 그래서 `init()`이
   * resolve된 뒤에도 인증 커넥터는 세션을 복원하는 중일 수 있고, 그 창에서는
   * `connected`가 false인 채 `eth_accounts`가 빈 배열로 오거나 `connectTo`가 커넥터를
   * 찾지 못해 던진다 — 서명이 그 자리에서 깨진다.
   *
   * ⚠️ **사용자 클릭에서 이어지는 로그인 경로에서는 기다리지 않는다.** 이 대기는 초 단위라
   * 클릭 핸들러가 그만큼 멈추면 사용자 활성화가 만료돼 로그인 창이 열리지 않는다.
   */
  awaitRestoredSession(): Promise<void>
  connectTo(
    connector: typeof AUTH_CONNECTOR,
    params: { authConnection: string },
  ): Promise<Web3AuthProvider | null>
  getIdentityToken(): Promise<{ idToken: string }>
  logout(options: { cleanup: boolean }): Promise<void>
  /**
   * SDK 인스턴스를 버린다 — 다음 `init()`이 **새 인스턴스**를 만든다.
   *
   * v10 은 `logout({ cleanup: true })` 에서 auth 커넥터를 `NOT_READY` 로 내리고 `authInstance` 를
   * 지운다(`authConnector.disconnect` :227). 그 인스턴스는 다시 `READY` 가 되지 않으므로 같은 탭의
   * 다음 `connectTo` 는 "Wallet connector is not ready yet" 로 거절된다(D-75). 새 탭이 되는 이유가
   * "SDK 를 새로 만들기 때문" 이라, 로그아웃 뒤에는 같은 일을 여기서 한다.
   */
  dispose(): void
}

export interface CreateWeb3AuthAdapterOptions {
  clientId: string
  rpcUrl: string
  chainId: number
  chainIdHex: string
  explorerUrl: string
}

function createSdkClient(options: CreateWeb3AuthAdapterOptions): Web3AuthClient {
  return createSdkWeb3AuthClient(options)
}

export function createWeb3AuthWalletAdapter(
  options: CreateWeb3AuthAdapterOptions,
): Web3AuthWalletAdapter {
  if (!options.clientId.trim()) {
    throw new WalletError('NOT_CONFIGURED', 'Web3Auth client ID is not configured.')
  }
  return new Web3AuthWalletAdapter(createSdkClient(options), options.chainId)
}

function walletError(
  kind: ConstructorParameters<typeof WalletError>[0],
  message: string,
): WalletError {
  return new WalletError(kind, message)
}

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
}

/**
 * 운영 진단용 한 줄. **원인을 삼키면 재로그인 말고 손쓸 방법이 없다** — 리허설 2에서 서명 직전
 * 실패가 전부 "계정 없음"으로 뭉개져 무엇이 실패했는지 아무 데도 남지 않았다.
 *
 * 주소·서명값·SDK 메시지는 넣지 않는다. 메시지에는 idToken이 섞여 올 수 있어
 * {@link sanitizeSdkError}도 같은 이유로 복사하지 않는다(스택 v3 §3.2).
 */
function logWalletFailure(method: string, error: unknown): void {
  console.warn(
    `[wallet] ${method} 실패 — code=${String(errorCode(error) ?? 'none')} ` +
      `name=${error instanceof Error ? error.name : typeof error}`,
  )
}

function sanitizeSdkError(error: unknown, fallbackKind: 'AUTH_FAILED' | 'UNKNOWN'): WalletError {
  if (error instanceof WalletError) return error
  const code = errorCode(error)
  if (code === 4001 || code === '4001' || code === 5113 || code === '5113') {
    return walletError('USER_REJECTED', 'The wallet request was rejected.')
  }
  return walletError(fallbackKind, 'The wallet request could not be completed.')
}

/**
 * 세션 복원이 `awaitRestoredSession()`이 돌아온 뒤에도 몇 초 더 이어지는 창이 있다
 * (`web3authSdk.js` 주석 — 커넥터 초기화가 `init()`과 나란히 돌고 이벤트를 놓칠 수 있다).
 * 그 창에 걸린 서명은 `NOT_CONNECTED`로 즉시 떨어졌고, 화면은 "다시 시도"를 띄웠다. 사용자는
 * 붙을 때까지 3~5번을 직접 눌러야 했다 — 기능이 고장 난 것처럼 보인다.
 *
 * 그 기다림을 여기서 대신한다. 서명 경로는 세션이 실제로 붙었는지를 상한까지 다시 확인하고,
 * 그래도 없으면 그때 `NOT_CONNECTED`를 던진다. 총 대기는 약 4초다.
 */
const CONNECT_ATTEMPTS = 10
const CONNECT_RETRY_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseChainId(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, value.toLowerCase().startsWith('0x') ? 16 : 10)
        : Number.NaN
  if (!Number.isSafeInteger(parsed)) {
    throw walletError('WRONG_CHAIN', 'The wallet did not report a valid chain ID.')
  }
  return parsed
}

function firstAddress(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const address = value[0]
  return typeof address === 'string' && ADDRESS_PATTERN.test(address) ? address : null
}

function rpcQuantity(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw walletError('UNKNOWN', `The wallet returned an invalid ${field}.`)
  }
  return value
}

export class Web3AuthWalletAdapter implements Web3AuthWalletAdapterContract {
  readonly provider = 'WEB3AUTH' as const
  private initialization: Promise<void> | null = null
  private restoration: Promise<void> | null = null
  private activeSocialProvider: SocialLoginProvider | null = null
  private readonly client: Web3AuthClient
  private readonly expectedChainId: number

  constructor(client: Web3AuthClient, expectedChainId: number) {
    this.client = client
    this.expectedChainId = expectedChainId
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization

    const attempt = Promise.resolve()
      .then(() => this.client.init())
      .catch(() => {
        if (this.initialization === attempt) this.initialization = null
        throw walletError('AUTH_FAILED', 'Web3Auth could not be initialized.')
      })
    this.initialization = attempt
    return attempt
  }

  /**
   * 초기화 + 캐시 세션 복원 대기. **주소를 읽거나 서명하는 경로만** 이것을 기다린다.
   *
   * 복원이 끝난 뒤에야 "세션이 있는가"에 참으로 답할 수 있다(`awaitRestoredSession` 주석).
   *
   * ⚠️ **로그인 경로는 여기에 들어오지 않는다.** 복원 대기는 초 단위이고, 클릭 핸들러에서
   * 그만큼 `await`하면 브라우저의 사용자 활성화(user activation)가 만료돼 `connectTo`가 여는
   * 로그인 창이 **아예 뜨지 않는다** — "계정 없음"을 "창이 안 뜸"으로 바꿀 뿐이다. 로그인은
   * 복원된 세션을 쓰지도 않는다(살아 있으면 끊고 새로 붙는다).
   *
   * 대기 자체가 실패한 것은 초기화 실패가 아니다 — 복원되지 않은 상태로 진행한다.
   */
  private restored(): Promise<void> {
    if (this.restoration) return this.restoration

    const attempt = this.initialize()
      .then(() => this.client.awaitRestoredSession().catch(() => undefined))
      .catch((error: unknown) => {
        if (this.restoration === attempt) this.restoration = null
        throw error
      })
    this.restoration = attempt
    return attempt
  }

  /** {@link restored} 의 공개 창. 결과·실패를 돌려주지 않는다 — 준비가 끝났다는 신호만이다(계약 주석). */
  warmUp(): Promise<void> {
    return this.restored().catch(() => undefined)
  }

  async connectSocial(socialProvider: SocialLoginProvider): Promise<Web3AuthConnection> {
    // 복원 대기(`restored()`)는 부르지 않는다 — 아래 `connectTo`가 여는 로그인 창은 사용자
    // 활성화가 살아 있을 때만 뜬다. 복원 결과도 여기서는 쓰지 않는다(붙어 있으면 끊고 새로 붙는다).
    await this.initialize()

    let provider: Web3AuthProvider | null
    try {
      if (this.activeSocialProvider === socialProvider && this.client.connected) {
        // POST /auth/web3auth가 실패해도 SDK 연결 자체는 살아 있다. 같은 버튼의 재시도는
        // connectTo를 다시 부르지 않아 v10의 Already connected 오류를 피한다.
        provider = this.client.provider
      } else {
        // **SDK 세션이 살아 있으면 무조건 끊고 새로 붙는다.** 새로고침하면 어댑터의
        // `activeSocialProvider`는 null로 돌아가지만 SDK는 `init()`에서 저장소의 세션을
        // 복원해 `provider`를 채운다. 그 상태로 `connectTo`를 부르면 v10이
        // `Already connected`로 던져 로그인 창이 아예 뜨지 않는다.
        // 복원된 세션이 어느 소셜 계정인지 여기서는 알 수 없으므로 재사용하지 않는다 —
        // 다른 계정 세션을 그대로 쓰면 엉뚱한 지갑으로 로그인된다.
        if (this.client.connected) {
          // 정리는 best-effort다. logout이 던져도 connectTo로 진행한다 — 여기서 멈추면
          // 세션은 살아 있는 채 다음 클릭도 같은 자리에서 막혀 탭을 닫기 전까지 못 고친다.
          // cleanup:false — 세션은 authInstance.logout() 이 끊고, 커넥터는 READY 로 돌아온다
          // ("ready to be connected again", authConnector.disconnect). cleanup:true 면 커넥터가
          // NOT_READY 가 되어 바로 아래 connectTo 가 "not ready yet" 으로 거절된다(D-75). 여기서
          // SDK 를 다시 초기화해 기다리면 사용자 활성화가 만료돼 로그인 창이 안 뜬다 — 그래서
          // 인스턴스를 버리는 정리는 disconnect() 에서만 한다.
          try {
            await this.client.logout({ cleanup: false })
          } catch {
            /* 이미 끊겼거나 못 끊었다. 어느 쪽이든 아래에서 다시 붙여 본다. */
          }
          // 끊었으면 어댑터 상태도 같이 비운다. 아래 connectTo가 실패해도(팝업을 닫는 등)
          // SDK와 어댑터가 **둘 다 "연결 없음"**으로 남아야 다음 클릭이 다시 로그인창을 연다.
          this.activeSocialProvider = null
        }
        provider = await this.client.connectTo(AUTH_CONNECTOR, {
          authConnection: AUTH_CONNECTION_BY_PROVIDER[socialProvider],
        })
      }
    } catch (error) {
      // 여기서 상태를 따로 비우지 않는다 — 이 자리에 오는 경로(logout·connectTo 실패)는
      // 위의 logout 분기가 이미 `activeSocialProvider`를 null로 만들어 두었다.
      throw sanitizeSdkError(error, 'AUTH_FAILED')
    }
    if (!provider) {
      throw walletError('NOT_CONNECTED', 'Web3Auth did not provide a wallet connection.')
    }
    this.activeSocialProvider = socialProvider

    let tokenInfo: { idToken: string }
    try {
      tokenInfo = await this.client.getIdentityToken()
    } catch (error) {
      throw sanitizeSdkError(error, 'AUTH_FAILED')
    }
    if (!tokenInfo.idToken.trim()) {
      throw walletError('AUTH_FAILED', 'Web3Auth did not provide an identity token.')
    }

    // Web3Auth v10의 연결 상태는 이후 지갑 서명과 명시적 로그아웃에도 필요하다. 토큰은 이 호출의
    // 반환값으로만 넘기고 앱 저장소에는 복사하지 않는다.
    const connection = await this.readConnection(provider)
    return { ...connection, socialProvider, idToken: tokenInfo.idToken }
  }

  async connect(): Promise<WalletConnection> {
    await this.restored()
    const provider = this.connectedProvider()
    if (!provider) {
      throw walletError('NOT_CONNECTED', 'There is no restored Web3Auth wallet connection.')
    }
    return this.readConnection(provider)
  }

  /**
   * 현재 주소. **`null`은 "세션이 없다"뿐이고, 물어보다 실패한 것은 던진다.**
   *
   * 둘을 하나로 뭉개면(이전 구현의 `catch { return null }`) RPC 오류·레이트 리밋·복원 실패가
   * 전부 "계정 없음"이 되어 호출부가 `NOT_CONNECTED`만 던진다 — 사용자에게는 원인도
   * 다음 행동도 남지 않는다(리허설 2 D-64).
   *
   * 실패 뒤에 지갑 팝업을 여는 호출(`eth_requestAccounts` 등)은 하지 않는다. 사용자 제스처
   * 없이 열면 팝업 차단·무한 대기가 된다 — 다시 붙이는 일은 명시적인 "다시 연결"(로그인)이 한다.
   */
  async getAddress(): Promise<string | null> {
    await this.restored()
    const provider = this.connectedProvider()
    // 세션이 없다. 정상적인 미연결이고 원인이 따로 없다
    if (!provider) return null
    try {
      return firstAddress(await provider.request({ method: 'eth_accounts' }))
    } catch (error) {
      logWalletFailure('eth_accounts', error)
      throw sanitizeSdkError(error, 'UNKNOWN')
    }
  }

  /**
   * 서명·조회에 쓸 수 있는 프로바이더. **`client.provider`는 연결 신호가 아니다**(위 주석) —
   * `init()`만 끝난 상태에서도 채워져 있고, 그 프로바이더에 `eth_accounts`를 물으면 지갑이
   * 아니라 공개 RPC가 답해 **빈 배열**이 온다. 세션 여부는 `connected`로 본다.
   */
  private connectedProvider(): Web3AuthProvider | null {
    return this.client.connected ? this.client.provider : null
  }

  /**
   * 서명 경로 전용 — 세션이 붙을 때까지 {@link CONNECT_ATTEMPTS}번 다시 본다.
   *
   * 화면 진입 판정({@link getAddress})은 이것을 쓰지 않는다. 정말 로그인하지 않은 방문자를
   * 4초간 붙잡을 이유가 없고, 그 화면은 실패해도 잃는 것이 없다.
   */
  private async awaitConnectedProvider(): Promise<Web3AuthProvider | null> {
    for (let attempt = 1; ; attempt += 1) {
      const provider = this.connectedProvider()
      if (provider || attempt >= CONNECT_ATTEMPTS) return provider
      await delay(CONNECT_RETRY_MS)
    }
  }

  async signMessage(message: string): Promise<string> {
    await this.restored()
    const provider = await this.awaitConnectedProvider()
    if (!provider) {
      throw walletError('NOT_CONNECTED', 'Web3Auth wallet is not connected.')
    }
    const address = await this.getAddress()
    if (!address) {
      throw walletError('NOT_CONNECTED', 'Web3Auth wallet did not provide an account.')
    }

    try {
      const signature = await provider.request({
        method: 'personal_sign',
        params: [message, address],
      })
      if (typeof signature !== 'string' || !signature.startsWith('0x')) {
        throw walletError('UNKNOWN', 'Web3Auth wallet returned an invalid signature.')
      }
      return signature
    } catch (error) {
      throw sanitizeSdkError(error, 'UNKNOWN')
    }
  }

  /**
   * 지갑 확인 구간 신호(`signingActivity`)로 감싼다. 신호 시작은 **동기**라 서명 앞에 await가 늘지 않는다.
   * 이 구간만으로는 오버레이가 켜지지 않는다 — 이미 보이는 중일 때만 비차단으로 이어 간다.
   */
  async signTransaction(request: SignTransactionRequest): Promise<string> {
    const endWalletPrompt = beginWalletPrompt()
    try {
      return await this.signTransactionInner(request)
    } finally {
      endWalletPrompt()
    }
  }

  private async signTransactionInner(request: SignTransactionRequest): Promise<string> {
    await this.restored()
    const provider = await this.awaitConnectedProvider()
    if (!provider) {
      throw walletError('NOT_CONNECTED', 'Web3Auth wallet is not connected.')
    }
    if (request.txType !== 'FEE_DELEGATED_SMART_CONTRACT_EXECUTION') {
      throw walletError('UNSUPPORTED_OPERATION', 'The requested transaction type is not supported.')
    }

    const requestChainId = parseChainId(request.chainId)
    if (requestChainId !== this.expectedChainId) {
      throw walletError('WRONG_CHAIN', 'The signing request is not for Kaia Kairos.')
    }
    if (!ADDRESS_PATTERN.test(request.to) || !ADDRESS_PATTERN.test(request.feePayer)) {
      throw walletError('UNKNOWN', 'The signing request contains an invalid address.')
    }

    const address = await this.getAddress()
    if (!address) {
      throw walletError('NOT_CONNECTED', 'Web3Auth wallet did not provide an account.')
    }

    try {
      const [nonceValue, gasPriceValue, estimatedGasValue] = await Promise.all([
        provider.request({
          method: 'eth_getTransactionCount',
          params: [address, 'pending'],
        }),
        provider.request({ method: 'eth_gasPrice' }),
        request.gas
          ? Promise.resolve(request.gas)
          : provider.request({
              method: 'eth_estimateGas',
              params: [
                {
                  from: address,
                  to: request.to,
                  data: request.data,
                  value: request.value,
                },
              ],
            }),
      ])

      const transaction = KlaytnTxFactory.fromObject({
        type: TxType.FeeDelegatedSmartContractExecution,
        nonce: rpcQuantity(nonceValue, 'nonce'),
        gasPrice: rpcQuantity(gasPriceValue, 'gas price'),
        gasLimit: rpcQuantity(estimatedGasValue, 'gas limit'),
        to: request.to,
        value: request.value,
        from: address,
        data: request.data,
        chainId: requestChainId,
        txSignatures: [],
      })
      const digest = keccak256(transaction.sigRLP())
      const compactSignature = await provider.request({
        method: 'eth_sign',
        params: [address, digest],
      })
      if (typeof compactSignature !== 'string') {
        throw walletError('UNKNOWN', 'Web3Auth wallet returned an invalid transaction signature.')
      }

      const signature = Signature.from(compactSignature)
      transaction.addSenderSig({
        r: signature.r,
        s: signature.s,
        v: requestChainId * 2 + 35 + signature.yParity,
      })
      return transaction.senderTxHashRLP()
    } catch (error) {
      throw sanitizeSdkError(error, 'UNKNOWN')
    }
  }

  /**
   * 로그아웃. 세션을 끊고 **SDK 인스턴스를 버린다** — 다음 로그인이 새 인스턴스로 초기화되게.
   *
   * `cleanup: true` 는 auth 커넥터를 `NOT_READY` 로 내리고 다시 올리지 않는다(D-75). 그대로 두면
   * 같은 탭의 재로그인이 "not ready yet" 으로 막히고 새 탭에서만 된다. 메모이즈한 초기화·복원
   * 대기도 함께 비운다 — 다음 `initialize()`/`warmUp()` 이 처음처럼 돈다. logout 이 던져도 정리는
   * 한다: 끊는 데 실패한 세션을 들고 있는 것보다 새로 시작하는 쪽이 안전하다.
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.logout({ cleanup: true })
    } catch (error) {
      throw sanitizeSdkError(error, 'UNKNOWN')
    } finally {
      this.activeSocialProvider = null
      this.initialization = null
      this.restoration = null
      this.client.dispose()
    }
  }

  private async readConnection(
    provider: Web3AuthProvider,
  ): Promise<WalletConnection & { provider: 'WEB3AUTH' }> {
    let accounts: unknown
    let chainIdValue: unknown
    try {
      ;[accounts, chainIdValue] = await Promise.all([
        provider.request({ method: 'eth_accounts' }),
        provider.request({ method: 'eth_chainId' }),
      ])
    } catch (error) {
      logWalletFailure('eth_accounts·eth_chainId', error)
      throw sanitizeSdkError(error, 'UNKNOWN')
    }

    const address = firstAddress(accounts)
    if (!address) {
      throw walletError('NOT_CONNECTED', 'Web3Auth wallet did not provide an account.')
    }
    const chainId = parseChainId(chainIdValue)
    if (chainId !== this.expectedChainId) {
      throw walletError('WRONG_CHAIN', 'Web3Auth wallet must be connected to Kaia Kairos.')
    }
    return { provider: this.provider, address, chainId }
  }
}
