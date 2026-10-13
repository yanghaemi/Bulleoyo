/**
 * member 도메인 — 인증·회원 정보 (API v6 §1).
 *
 * 정본: `docs/design/api/openapi.yaml`(operationId `member_01`·`02`·`04`·`05`·`06`·`08`) ·
 *      `docs/design/06_API_명세서_v6.md` §1
 *
 * ─────────────────────────── 이 파일의 경계 ───────────────────────────
 * · 응답 래퍼 `{code,data,msg}`는 `shared/api/client`가 이미 벗긴다. 여기서는 `data`만 다룬다.
 * · 응답 타입을 손으로 쓰지 않는다. 전부 `ApiData<'member_xx'>`(생성 타입)에서 꺼낸다.
 * · 화면은 DTO를 직접 보지 않고 아래 **뷰모델**을 본다. 이유는 두 가지다.
 *   ① openapi.yaml의 응답 스키마에 `required:`가 거의 없어 생성 타입의 필드가 **전부 optional**이다.
 *      화면마다 `?.`와 `?? ''`를 다시 쓰면 기본값이 제각각이 된다.
 *   ② `undefined`와 `null`이 섞이면 조건문이 두 갈래가 된다. 뷰모델은 **없음을 항상 `null`로** 모은다.
 *   필드 이름은 응답과 1:1로 유지한다 — QA가 백엔드 출력과 대조할 때 이름이 달라지면 대조가 안 된다.
 *
 * ──────────────────────────── 토큰 재발급 ────────────────────────────
 * **`member_03`(POST /auth/refresh)은 이 파일에 없다.** `shared/api/client`가 401
 * `AUTH_TOKEN_EXPIRED`에서 single-flight로 직접 호출한다. 훅·함수로 또 노출하면 재발급이
 * 두 번 나가고, 서버는 회전된 refresh token의 재사용을 탈취로 보아 그 회원의 토큰을
 * **전량 폐기**한다(API-member-03). 그래서 의도적으로 비워 둔다.
 */

import { NetworkError, api } from '@/shared/api/client'
import type { ApiBody, ApiData, Display } from '@/shared/api/schema'
import { isGenre } from '@/shared/i18n/genres'
import type { Genre } from '@/shared/i18n/genres'

/* ============================== 공통 파생 타입 ============================== */

/** 역할·제공자·로케일은 생성 타입에서 꺼내 쓴다. 손으로 적으면 명세가 바뀔 때 조용히 어긋난다. */
export type MemberRole = NonNullable<ApiData<'member_05'>['roles']>[number]
export type AuthProvider = NonNullable<ApiData<'member_05'>['authProvider']>
export type MemberLocale = NonNullable<ApiData<'member_05'>['locale']>
export type MemberWalletProvider = NonNullable<
  NonNullable<ApiData<'member_05'>['wallet']>['provider']
>
export type MemberWalletStatus = NonNullable<NonNullable<ApiData<'member_05'>['wallet']>['status']>

/**
 * 금액 한 덩어리(§0.5). 원본은 **YoYo 정수** 하나뿐이고 `display`는 표시 전용이다.
 * `display`가 없는 경우(회원 통화가 KRW이거나 환율 레코드 없음)는 오류가 아니라 정상이다.
 */
export interface MoneyView {
  /** YoYo 정수. 계산·검증은 항상 이 값만 쓴다(P-17) */
  amount: number
  currency: 'KRW'
  /** 표시 환산. 없으면 null — 화면은 원 값만 그린다 */
  display: Display | null
}

/** `{ amount, currency, display }` 모양(MemberBalance·WalletBalance·WalletSignupGrant 공용). */
export function toMoneyView(
  dto: { amount?: number; currency?: 'KRW'; display?: Display } | undefined,
): MoneyView | null {
  if (!dto) return null
  return {
    amount: dto.amount ?? 0,
    currency: dto.currency ?? 'KRW',
    display: dto.display ?? null,
  }
}

/* ============================== 에러 코드 ============================== */

/**
 * member 도메인 전용 코드.
 *
 * 공통 코드(`COMMON_*`)와 인증 코드(`AUTH_TOKEN_*`)는 `shared/api/errorCodes`가 정본이고,
 * 여기에는 **그 파일에 없는 도메인 코드**만 둔다(errorCodes.ts 머리말 규칙).
 */
export const MemberCode = {
  /** 409 — 이미 가입된 이메일 (member_08) */
  EMAIL_DUPLICATED: 'AUTH_EMAIL_DUPLICATED',
} as const

/**
 * 로그아웃 응답의 `clientAction` 값.
 *
 * ⚠ 명세는 이 필드를 "프론트가 수행해야 할 후속 조치"라고만 적고 **enum을 고정하지 않았다**
 * (openapi.yaml `MemberLogoutResponse.clientAction`: `type: string`). 예시에 나온 값이
 * 이것 하나라 상수로 두되, 모르는 값이 오면 화면은 아무것도 하지 않는다.
 */
export const CLIENT_ACTION_CLEAR_WEB3AUTH_SESSION = 'CLEAR_WEB3AUTH_SESSION'

/* ============================== 뷰모델 ============================== */

/** 로그인 응답에 담기는 지갑 요약(등록 전이면 상위에서 null). */
export interface MemberWalletBriefView {
  provider: MemberWalletProvider | null
  address: string | null
  status: MemberWalletStatus | null
  explorerUrl: string | null
}

/** 내 정보 조회(member_05)의 지갑 요약 — 잔액 캐시까지 포함한다. */
export interface MemberWalletSummaryView {
  provider: MemberWalletProvider | null
  address: string | null
  status: MemberWalletStatus | null
  /** Redis `wallet:balance` 캐시값. 실시간 값은 API-wallet-01이다(§0.12) */
  balance: MoneyView | null
  cachedAt: string | null
}

export interface MemberTeamView {
  teamId: number
  teamName: string
  leader: boolean
}

/** 세션 토큰 묶음. 저장은 `tokenStore`가 하고 화면은 이 값을 보관하지 않는다. */
export interface SessionTokens {
  accessToken: string
  accessTokenExpiresAt: string | null
  refreshToken: string
  refreshTokenExpiresAt: string | null
}

/**
 * 로그인·가입 성공 세션(member_01 · member_02 공통 뷰).
 *
 * 두 응답의 필드 집합이 서로 다르다(`_workspace/fe_member-wallet-chain_api-usage.md`의
 * "계약 어긋남" 참고). 화면이 그 차이를 매번 분기하지 않도록 여기서 하나로 모으고,
 * 한쪽에만 있는 필드는 기본값을 명시한다.
 */
export interface MemberSessionView {
  memberId: number | null
  name: string | null
  /** member_02 응답에는 `email` 필드가 없다 → null */
  email: string | null
  roles: MemberRole[]
  authProvider: AuthProvider | null
  /** member_02 응답에는 `countryCode` 필드가 없다 → null */
  countryCode: string | null
  locale: MemberLocale | null
  displayCurrency: string | null
  timezone: string | null
  /** member_01만 내려준다. member_02는 항상 false */
  isNewMember: boolean
  /** member_01만 내려준다(보조 폼 1회 노출 조건). member_02는 항상 false */
  profileCompletionRequired: boolean
  wallet: MemberWalletBriefView | null
  /**
   * 지갑 등록 온보딩(C-05)으로 보내야 하는가.
   * member_02는 서버가 내려주고, **member_01은 이 필드가 없어 `wallet === null`에서 파생**한다
   * — 명세 §1 API-member-01 "`wallet`이 `null`이면 홈에 닿기 전에 C-05로 보낸다"가 근거다.
   */
  walletLinkRequired: boolean
  tokens: SessionTokens
}

export interface MemberMeView {
  memberId: number | null
  email: string | null
  name: string | null
  roles: MemberRole[]
  authProvider: AuthProvider | null
  countryCode: string | null
  locale: MemberLocale | null
  displayCurrency: string | null
  timezone: string | null
  wallet: MemberWalletSummaryView | null
  walletLinkRequired: boolean
  teams: MemberTeamView[]
  /**
   * **[v7]** 선호 장르 0~3개(API-member-05). 고르지 않은 회원은 **빈 배열**이며,
   * 전역 `non_null` 직렬화라 키 자체가 없을 수 있다 — 없음도 빈 배열로 모은다.
   */
  preferredGenres: Genre[]
  createdAt: string | null
}

export interface MemberUpdateResultView {
  memberId: number | null
  name: string | null
  countryCode: string | null
  locale: MemberLocale | null
  displayCurrency: string | null
  /** 등록된 환율이 없는 통화면 false. **오류가 아니라** 원 값만 표시하라는 뜻이다 */
  displaySupported: boolean
  timezone: string | null
  appliedRate: { currency: string; rate: number; asOf: string | null } | null
}

export interface MemberLogoutResultView {
  loggedOut: boolean
  revokedCount: number
  /** 예: `CLEAR_WEB3AUTH_SESSION`. 모르는 값이면 화면은 아무것도 하지 않는다 */
  clientAction: string | null
}

export interface MemberSignupResultView {
  memberId: number | null
  email: string | null
  name: string | null
  authProvider: 'LOCAL' | null
  locale: MemberLocale | null
  walletLinkRequired: boolean
}

/* ============================== 매퍼 ============================== */

function toWalletBriefView(
  dto: NonNullable<ApiData<'member_01'>['wallet']> | null | undefined,
): MemberWalletBriefView | null {
  if (!dto) return null
  return {
    provider: dto.provider ?? null,
    address: dto.address ?? null,
    status: dto.status ?? null,
    explorerUrl: dto.explorerUrl ?? null,
  }
}

function toTokens(dto: {
  accessToken?: string
  accessTokenExpiresAt?: string
  refreshToken?: string
  refreshTokenExpiresAt?: string
}): SessionTokens {
  return {
    accessToken: dto.accessToken ?? '',
    accessTokenExpiresAt: dto.accessTokenExpiresAt ?? null,
    refreshToken: dto.refreshToken ?? '',
    refreshTokenExpiresAt: dto.refreshTokenExpiresAt ?? null,
  }
}

/** member_01 응답 → 세션 뷰. */
export function toSessionFromWeb3Auth(dto: ApiData<'member_01'>): MemberSessionView {
  const wallet = toWalletBriefView(dto.wallet)
  return {
    memberId: dto.memberId ?? null,
    name: dto.name ?? null,
    email: dto.email ?? null,
    roles: dto.roles ?? [],
    authProvider: dto.authProvider ?? null,
    countryCode: dto.countryCode ?? null,
    locale: dto.locale ?? null,
    displayCurrency: dto.displayCurrency ?? null,
    timezone: dto.timezone ?? null,
    isNewMember: dto.isNewMember ?? false,
    profileCompletionRequired: dto.profileCompletionRequired ?? false,
    wallet,
    walletLinkRequired: wallet === null,
    tokens: toTokens(dto),
  }
}

/** member_02 응답 → 세션 뷰. */
export function toSessionFromEmailLogin(dto: ApiData<'member_02'>): MemberSessionView {
  const wallet = toWalletBriefView(dto.wallet)
  return {
    memberId: dto.memberId ?? null,
    name: dto.name ?? null,
    email: null, // member_02 응답에 email이 없다(계약 어긋남 항목)
    roles: dto.roles ?? [],
    authProvider: dto.authProvider ?? null,
    countryCode: null, // member_02 응답에 countryCode가 없다
    locale: dto.locale ?? null,
    displayCurrency: dto.displayCurrency ?? null,
    timezone: dto.timezone ?? null,
    isNewMember: false,
    profileCompletionRequired: false,
    wallet,
    walletLinkRequired: dto.walletLinkRequired ?? wallet === null,
    tokens: toTokens(dto),
  }
}

export function toMemberMeView(dto: ApiData<'member_05'>): MemberMeView {
  const wallet: MemberWalletSummaryView | null = dto.wallet
    ? {
        provider: dto.wallet.provider ?? null,
        address: dto.wallet.address ?? null,
        status: dto.wallet.status ?? null,
        balance: toMoneyView(dto.wallet.balance),
        cachedAt: dto.wallet.cachedAt ?? null,
      }
    : null

  return {
    memberId: dto.memberId ?? null,
    email: dto.email ?? null,
    name: dto.name ?? null,
    roles: dto.roles ?? [],
    authProvider: dto.authProvider ?? null,
    countryCode: dto.countryCode ?? null,
    locale: dto.locale ?? null,
    displayCurrency: dto.displayCurrency ?? null,
    timezone: dto.timezone ?? null,
    wallet,
    walletLinkRequired: dto.walletLinkRequired ?? wallet === null,
    teams: (dto.teams ?? []).map((team) => ({
      teamId: team.teamId ?? 0,
      teamName: team.teamName ?? '',
      leader: team.leader ?? false,
    })),
    // 모르는 코드가 폼 상태로 새면 그 값이 그대로 PATCH로 되돌아가 400이 된다
    preferredGenres: (dto.preferredGenres ?? []).filter(isGenre),
    createdAt: dto.createdAt ?? null,
  }
}

export function toMemberUpdateResultView(dto: ApiData<'member_06'>): MemberUpdateResultView {
  return {
    memberId: dto.memberId ?? null,
    name: dto.name ?? null,
    countryCode: dto.countryCode ?? null,
    locale: dto.locale ?? null,
    displayCurrency: dto.displayCurrency ?? null,
    displaySupported: dto.displaySupported ?? true,
    timezone: dto.timezone ?? null,
    appliedRate: dto.appliedRate
      ? {
          currency: dto.appliedRate.currency ?? '',
          rate: dto.appliedRate.rate ?? 0,
          asOf: dto.appliedRate.asOf ?? null,
        }
      : null,
  }
}

/* ============================== 요청 타입 ============================== */

export type Web3AuthLoginRequest = ApiBody<'member_01'>
export type EmailLoginRequest = ApiBody<'member_02'>
export type LogoutRequest = ApiBody<'member_04'>
export type MemberUpdateRequest = ApiBody<'member_06'>
export type SignupRequest = ApiBody<'member_08'>

/**
 * `locale`·`displayCurrency`·`timezone`은 바꾸는 즉시 **이후 모든 응답의 `display`·`msg`·시간
 * 오프셋**이 달라진다(§0.5·§0.6, API-member-06 요구사항). 캐시에 남은 다른 도메인 응답의
 * `display`가 옛 통화로 그려지므로 무효화 범위를 넓혀야 한다 — 그 판단을 여기서 한 번만 한다.
 */
export function affectsDisplayFormat(body: MemberUpdateRequest): boolean {
  if (!body) return false
  return (
    body.locale !== undefined || body.displayCurrency !== undefined || body.timezone !== undefined
  )
}

/* ============================== fetch 함수 ============================== */

/** 로그인 응답에 토큰이 비면 세션을 만들 수 없다. 규격 위반이므로 네트워크 오류로 취급한다. */
function assertTokens(tokens: SessionTokens): void {
  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new NetworkError('로그인 응답이 규격과 다릅니다.')
  }
}

/**
 * API-member-01 · `POST /api/v1/auth/web3auth` — Web3Auth 로그인/가입.
 *
 * 공개 API라 Authorization을 붙이지 않고 인증 실패도 기존 회원 세션의 강제 로그아웃으로
 * 해석하지 않는다(`public`). 요청의 `address`는 서버가 idToken
 * 지갑 클레임과 대조하는 **검증용**이며, 이 API는 지갑을 등록하지 않는다(v6 §14-35).
 * 개인키·니모닉·MPC 샤드는 어떤 필드로도 보내지 않는다.
 */
export async function loginWithWeb3Auth(body: Web3AuthLoginRequest): Promise<MemberSessionView> {
  const data = await api.post<ApiData<'member_01'>>('/auth/web3auth', body, { public: true })
  const session = toSessionFromWeb3Auth(data)
  assertTokens(session.tokens)
  return session
}

/** API-member-02 · `POST /api/v1/auth/login` — 자체 이메일 로그인(P1 보조). */
export async function loginWithEmail(body: EmailLoginRequest): Promise<MemberSessionView> {
  const data = await api.post<ApiData<'member_02'>>('/auth/login', body, { skipAuth: true })
  const session = toSessionFromEmailLogin(data)
  assertTokens(session.tokens)
  return session
}

/**
 * API-member-04 · `POST /api/v1/auth/logout` — 로그아웃.
 *
 * 본문의 `refreshToken`은 **보내지 않는다.** 토큰은 `shared/api/client`의 `tokenStore` 안에만
 * 있고 밖으로 내보내지 않기 때문이다. 명세가 "생략 시 현재 access token의 세션"을 폐기한다고
 * 규정하므로 `allDevices`만 전달하면 된다.
 * Web3Auth 세션 종료(`clientAction`)는 서버가 하지 않는다 — 호출부가 WalletAdapter로 처리한다.
 */
export async function logout(
  options: { allDevices?: boolean } = {},
): Promise<MemberLogoutResultView> {
  const body: LogoutRequest = { allDevices: options.allDevices ?? false }
  const data = await api.post<ApiData<'member_04'>>('/auth/logout', body)
  return {
    loggedOut: data.loggedOut ?? true,
    revokedCount: data.revokedCount ?? 0,
    clientAction: data.clientAction ?? null,
  }
}

/** API-member-05 · `GET /api/v1/members/me` — 내 정보. C-03·C-04가 이 응답 하나로 그려진다. */
export async function getMyMember(
  options: { signal?: AbortSignal; silentAuthFailure?: boolean } = {},
): Promise<MemberMeView> {
  const data = await api.get<ApiData<'member_05'>>('/members/me', {
    signal: options.signal,
    silentAuthFailure: options.silentAuthFailure,
  })
  return toMemberMeView(data)
}

/** API-member-06 · `PATCH /api/v1/members/me` — 전달한 필드만 부분 수정한다. */
export async function updateMyMember(body: MemberUpdateRequest): Promise<MemberUpdateResultView> {
  const data = await api.patch<ApiData<'member_06'>>('/members/me', body)
  return toMemberUpdateResultView(data)
}

/**
 * API-member-08 · `POST /api/v1/auth/signup` — 자체 이메일 가입(P1 보조).
 * **가입만으로 로그인되지 않는다.** 토큰이 없으므로 호출부는 이어서 member_02를 부른다.
 */
export async function signup(body: SignupRequest): Promise<MemberSignupResultView> {
  const data = await api.post<ApiData<'member_08'>>('/auth/signup', body, { skipAuth: true })
  return {
    memberId: data.memberId ?? null,
    email: data.email ?? null,
    name: data.name ?? null,
    authProvider: data.authProvider ?? null,
    locale: data.locale ?? null,
    walletLinkRequired: data.walletLinkRequired ?? true,
  }
}
