/**
 * WalletAdapter - 지갑 SDK 격리 경계.
 *
 * 정본: 기술 스택 v3 §3(지갑) · §3.2 · API v6 §0.4
 *
 * 화면·feature는 `@web3auth/modal`이나 Kaia Wallet 주입 프로바이더를 **직접 부르지 않는다.**
 * 전부 이 인터페이스 뒤에 둔다. 이유는 셋이다.
 *  1. 지갑이 두 종류(Web3Auth 소셜 3종 / Kaia Wallet 확장)인데 화면 코드는 같아야 한다.
 *  2. PoC 1~3(Web3Auth v10 x React 19, ethers-ext 대납 RLP, Kaia Wallet 동일 RLP) 결과에 따라
 *     구현체가 바뀔 수 있다. 실패 시 외부 지갑을 P1로 내리는 "방안 C"가 예정돼 있다.
 *  3. `@kaiachain/ethers-ext`는 **반드시 `/v6` 서브패스로 import**해야 한다. 루트로 import하면
 *     ethers v5 API로 동작해 타입이 조용히 어긋난다. 그 import를 이 폴더 한 곳에 가둔다.
 *
 * 구현체(Web3AuthWalletAdapter · KaiaWalletAdapter)는 **이번 골격 작업에서 만들지 않는다.**
 * PoC 1~3 이후에 이 폴더 안에서만 추가한다.
 *
 * 보안 - 이 인터페이스는 개인키·니모닉·MPC 샤드를 **반환하지 않고 받지도 않는다.**
 * `signTransaction`이 돌려주는 `senderSignedRlp`는 서버에 보고한 즉시 버린다.
 * localStorage·sessionStorage·로그·에러 리포트 어디에도 남기지 않는다(기술 스택 v3 §3.2).
 */

import type { SignRequest } from '@/shared/api/schema'

/** MVP 2종. Web3Auth의 외부 지갑 어댑터는 쓰지 않는다(결정 v2 §14-35, 자체 챌린지). */
export type WalletProvider = 'WEB3AUTH' | 'KAIA_WALLET'

export interface WalletConnection {
  provider: WalletProvider
  /** `0x` + 40 hex = 42자. 체크섬 표기 그대로 (API v6 §0.1) */
  address: string
  /** 지갑이 현재 붙어 있는 체인. 1001(Kairos)이 아니면 화면이 전환을 요청한다 */
  chainId: number
}

/** API-member-01이 허용하는 Web3Auth 소셜 로그인 제공자. */
export type SocialLoginProvider = 'GOOGLE' | 'FACEBOOK' | 'KAKAO'

/**
 * 소셜 인증을 막 끝낸 연결.
 *
 * `idToken`은 API-member-01 요청을 만드는 호출부에 한 번 전달하기 위한 값이다. 일반 지갑 연결에는
 * 존재하지 않으며 어댑터도 보관하지 않는다.
 */
export interface Web3AuthConnection extends WalletConnection {
  provider: 'WEB3AUTH'
  socialProvider: SocialLoginProvider
  idToken: string
}

/**
 * 서명 대상. API v6 §0.4의 `signRequests[]` 한 건을 그대로 넘긴다.
 * `txType`은 항상 `FEE_DELEGATED_SMART_CONTRACT_EXECUTION`이며 프론트는
 * **발신자 서명만** 만든다. 수수료는 `feePayer`(운영지갑)가 전액 대납한다.
 */
export type SignTransactionRequest = SignRequest

export interface WalletAdapter {
  readonly provider: WalletProvider

  /** 지갑 연결·로그인. 이미 연결돼 있으면 기존 연결을 반환한다. */
  connect(): Promise<WalletConnection>

  /**
   * 현재 연결된 주소. 연결돼 있지 않으면 null.
   *
   * **`null`은 "연결 없음"뿐이다. 물어보다 실패하면 {@link WalletError}를 던진다** — RPC 오류·
   * 레이트 리밋·세션 복원 실패를 null로 뭉개면 호출부가 원인을 잃는다(리허설 2 D-64).
   * 화면 진입처럼 연결 여부만 보는 호출도 반드시 감싼다.
   */
  getAddress(): Promise<string | null>

  /**
   * 임의 메시지 서명. 지갑 소유 증명(자체 챌린지 - API-wallet-03·04)에 쓴다.
   * 서버가 발급한 챌린지 메시지를 그대로 넣고 서명값을 돌려받는다.
   */
  signMessage(message: string): Promise<string>

  /**
   * Kaia `FeeDelegatedSmartContractExecution` **발신자 서명**.
   *
   * 반환값은 `0x`로 시작하는 발신자 서명 RLP(`senderSignedRlp`, 최대 8KB)이며
   * `POST .../signed-tx {kind, senderSignedRlp}`로 보고한다(§0.4 ③).
   * 사용자가 팝업을 닫으면(거부) 서버에 아무것도 보고하지 않고 주문을 15분 만료에 맡긴다.
   */
  signTransaction(request: SignTransactionRequest): Promise<string>

  disconnect(): Promise<void>
}

/** Web3Auth 소셜 인증 전용 확장. 일반 WalletAdapter 계약에 idToken을 섞지 않는다. */
export interface Web3AuthWalletAdapter extends WalletAdapter {
  readonly provider: 'WEB3AUTH'
  initialize(): Promise<void>
  /**
   * 로그인 화면이 뜰 때 미리 부른다 — 초기화와 캐시 세션 복원 대기를 **클릭 전에** 끝내 둔다.
   *
   * v10 은 `init()` 이 resolve 된 뒤에도 커넥터가 몇 초 더 준비 중이라, 그 창에 눌린 로그인은
   * `Wallet connector is not ready yet` 로 떨어진다(D-73). 클릭 핸들러에서 기다리면 사용자
   * 활성화가 만료돼 로그인 창이 안 뜨므로, 기다림은 마운트에서 하고 버튼을 그동안 잠근다.
   * **절대 던지지 않는다** — 초기화 실패는 클릭 시 `connectSocial` 이 원인과 함께 던진다.
   */
  warmUp(): Promise<void>
  connectSocial(provider: SocialLoginProvider): Promise<Web3AuthConnection>
}

/** 지갑 연결·서명 단계의 실패를 화면 문구로 나누기 위한 최소 분류. */
export type WalletErrorKind =
  | 'USER_REJECTED'
  | 'NOT_INSTALLED'
  | 'WRONG_CHAIN'
  | 'NOT_CONNECTED'
  | 'NOT_CONFIGURED'
  | 'AUTH_FAILED'
  | 'UNSUPPORTED_OPERATION'
  | 'UNKNOWN'

export class WalletError extends Error {
  readonly kind: WalletErrorKind
  constructor(kind: WalletErrorKind, message: string) {
    super(message)
    this.name = 'WalletError'
    this.kind = kind
  }
}

/**
 * 사용자가 지갑·소셜 팝업을 닫은 것인가.
 *
 * **취소는 실패가 아니다.** 자기가 한 일이라 사유를 알고 있고, 그 자리에 "문제가 생겼어요"를
 * 띄우면 있지도 않은 원인을 찾게 만든다(§1.2 원칙 6). 화면은 조용히 직전 상태로 돌아간다.
 * C-01(소셜 로그인)과 C-05(챌린지 서명)가 같은 판정을 써야 해서 여기 둔다.
 */
export function isUserRejected(error: unknown): boolean {
  return error instanceof WalletError && error.kind === 'USER_REJECTED'
}

/**
 * 지갑 세션이 없는 것인가 — **기다림으로는 풀리지 않는 실패다.**
 *
 * 마운트 게이트(`useWalletReady`, D-77)는 복원이 **진행 중**인 창을 먹는다. 그 게이트를 지나고도
 * `NOT_CONNECTED`면 복원할 세션이 아예 없다는 뜻이고, 같은 화면의 "다시 시도"는 몇 번을 눌러도
 * 같은 자리에 선다. 화면은 이것을 재로그인으로 보내야 한다(`useGoToLogin`).
 */
export function isWalletDisconnected(error: unknown): boolean {
  return error instanceof WalletError && error.kind === 'NOT_CONNECTED'
}
