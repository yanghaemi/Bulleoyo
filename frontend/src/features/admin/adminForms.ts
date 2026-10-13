/**
 * M-03 두 폼(시연용 지급 · 표시 환율 등록)의 **상수 · 검증 · 표시 포맷** 순수 함수.
 *
 * 정본 — 화면설계 v6 §4 M-03 **입력 검증** 항목 · `08_coin.yaml`의
 *        `CoinGrantRequest`(amount 1~1,000,000, memo maxLength 100) ·
 *        `ExchangeRateRegisterItem`(rate > 0 소수 6자리, pair `^[A-Z]{3}_KRW$`, effectiveFrom)
 *
 * 컴포넌트에서 분리한 이유는 P-08의 `settlementRuleCalc.ts`와 같다 —
 * **돈이 걸린 판정은 렌더 밖에서 단위로 검증할 수 있어야 한다.** 여기 함수는 부수효과가 없다.
 *
 * 이 파일은 컴포넌트를 export하지 않는다(Fast Refresh).
 */

import type { CoinGrantRequest, ExchangeRateRegisterItem } from '@/features/admin/adminTypes'

/* ────────────────────────── 상수 ────────────────────────── */

/**
 * 지급 한도 — M-03 "지급 한도 안내" 텍스트와 `CoinGrantRequest.amount`의 minimum·maximum.
 * 화면 문구와 검증이 **같은 숫자**를 보게 여기 한 곳에 둔다.
 */
export const GRANT_MIN_AMOUNT = 1
export const GRANT_MAX_AMOUNT = 1_000_000
/** 가입 기본 지급(자동·1회). 화면설계 M-03 안내 문구의 값이다 */
export const SIGNUP_GRANT_AMOUNT = 100_000
/** `CoinGrantRequest.memo` maxLength */
export const GRANT_MEMO_MAX = 100

/** admin_06 `adminComment` — minLength 10 / maxLength 1000 */
export const DISPUTE_COMMENT_MIN = 10
export const DISPUTE_COMMENT_MAX = 1000

/**
 * 통화쌍 — 화면설계 M-03이 못박은 세 개.
 * `ExchangeRateRegisterItem.pair` 패턴은 더 넓지만(`^[A-Z]{3}_KRW$`) 화면은 목록으로만 받는다.
 */
export const RATE_PAIRS = ['USD_KRW', 'JPY_KRW', 'EUR_KRW'] as const
export type RatePair = (typeof RATE_PAIRS)[number]

/** 환율 소수 자릿수 상한 — `ExchangeRateRegisterItem.rate` 설명("소수 6자리까지") */
export const RATE_MAX_SCALE = 6

/** 지갑 주소 = `0x` + 40 hex (API v6 §0.1) */
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

export function isAddressLike(value: string): boolean {
  return ADDRESS_PATTERN.test(value.trim())
}

/* ────────────────────── 지급 폼 검증 ────────────────────── */

/** 폼 필드 이름. 오류를 필드 아래에 붙이기 위한 키다 */
export type GrantField = 'target' | 'amount' | 'memo'

/** 지급 폼 입력값(문자열 그대로). 숫자 변환은 검증에서 한 번만 한다 */
export interface GrantFormValues {
  /** 회원 검색으로 고른 대상. 주소 직접 입력과 **택일**이다 */
  memberId: number | null
  /** 지갑 주소 직접 입력 */
  address: string
  /** 금액(원 정수) — 입력 문자열 */
  amount: string
  /** 지급 사유. 화면설계 M-03이 필수라고 정했다 */
  memo: string
}

export type GrantErrors = Partial<Record<GrantField, string>>

/**
 * 지급 폼 검증 — M-03 **입력 검증** 항목 그대로.
 *
 * · 대상: 회원 선택 또는 주소 직접 입력 중 하나. **둘 다 채우면 400**(coin_07)이라 여기서 막는다
 * · 금액: 1 이상 1,000,000 이하 **정수**(원). 소수·콤마·음수를 모두 거른다
 * · 메모: 필수(감사 로그에 남는다) · 100자 이하
 *
 * ⚠ 명세는 "주소 직접 입력은 형식 검사 후 **잔액 조회로 존재를 확인**한다"고 적었지만,
 *   임의 주소의 잔액을 읽는 API가 v6에 없다(wallet_01은 "내 지갑"이다).
 *   그래서 화면은 **형식 검사까지만** 하고 존재 확인은 서버 응답(404 `WALLET_NOT_FOUND`)에 맡긴다.
 */
export function validateGrant(values: GrantFormValues, language: 'ko' | 'en' = 'ko'): GrantErrors {
  const text = (ko: string, en: string) => (language === 'ko' ? ko : en)
  const errors: GrantErrors = {}
  const address = values.address.trim()

  if (values.memberId != null && address) {
    errors.target = text(
      '회원 선택과 주소 직접 입력 중 하나만 사용할 수 있습니다.',
      'Use either a selected member or a wallet address, not both.',
    )
  } else if (values.memberId == null && !address) {
    errors.target = text(
      '지급 대상을 고르거나 지갑 주소를 입력해 주세요.',
      'Choose a recipient or enter a wallet address.',
    )
  } else if (address && !isAddressLike(address)) {
    errors.target = text(
      '지갑 주소 형식이 아닙니다. 0x로 시작하는 42자여야 합니다.',
      'Enter a 42-character wallet address beginning with 0x.',
    )
  }

  const raw = values.amount.trim()
  if (!raw) {
    errors.amount = text('지급 금액을 입력해 주세요.', 'Enter a grant amount.')
  } else if (!/^\d+$/.test(raw)) {
    errors.amount = text(
      '금액은 YoYo 단위 정수로만 입력합니다. 소수점·기호를 뺀 숫자만 넣어 주세요.',
      'Enter a whole YoYo amount using digits only.',
    )
  } else {
    const amount = Number(raw)
    if (amount < GRANT_MIN_AMOUNT || amount > GRANT_MAX_AMOUNT) {
      errors.amount = text(
        `금액은 ${GRANT_MIN_AMOUNT.toLocaleString('ko-KR')} 이상 ${GRANT_MAX_AMOUNT.toLocaleString('ko-KR')} 이하여야 합니다.`,
        `Amount must be between ${GRANT_MIN_AMOUNT.toLocaleString('en-US')} and ${GRANT_MAX_AMOUNT.toLocaleString('en-US')} YoYo.`,
      )
    }
  }

  const memo = values.memo.trim()
  if (!memo) {
    errors.memo = text(
      '지급 사유는 필수입니다. 감사 로그에 그대로 남습니다.',
      'A grant reason is required and will be recorded in the audit log.',
    )
  } else if (memo.length > GRANT_MEMO_MAX) {
    errors.memo = text(
      `지급 사유는 ${GRANT_MEMO_MAX}자 이하로 적어 주세요.`,
      `Keep the grant reason to ${GRANT_MEMO_MAX} characters or fewer.`,
    )
  }

  return errors
}

/**
 * 검증을 통과한 폼을 `coin_07` 요청 본문으로 옮긴다.
 *
 * `memberId`·`address`는 **택일이므로 하나만 담는다** — 둘 다 담으면 400이다.
 * 금액은 여기서 딱 한 번 숫자가 된다(문자열이 요청에 실려 나가지 않게).
 */
export function toGrantRequest(values: GrantFormValues): CoinGrantRequest {
  const address = values.address.trim()
  return {
    ...(values.memberId != null ? { memberId: values.memberId } : { address }),
    amount: Number(values.amount.trim()),
    memo: values.memo.trim(),
  }
}

/**
 * 같은 지급 요청인지 — 대상·금액·메모가 모두 같으면 같은 요청이다.
 *
 * M-03 **상태** 항목: "같은 대상·금액·메모의 연속 요청은 멱등키(`grantRef`)로 1건 처리되며
 * 화면은 '이미 처리된 지급'으로 안내한다". 그러려면 **멱등키를 새로 만들지 말아야** 하므로,
 * 직전 요청과 같은지 판단하는 자리가 필요하다.
 */
export function isSameGrant(a: CoinGrantRequest, b: CoinGrantRequest): boolean {
  return (
    (a.memberId ?? null) === (b.memberId ?? null) &&
    (a.address ?? '').toLowerCase() === (b.address ?? '').toLowerCase() &&
    a.amount === b.amount &&
    (a.memo ?? '') === (b.memo ?? '')
  )
}

/*
 * `Idempotency-Key`(§0.8)는 여기서 만들지 않는다 — `@/shared/api/client`의 `newIdempotencyKey`가
 * 정본이다(결제·환불도 그것을 쓴다). 같은 구실의 함수가 두 벌이면 한쪽만 고쳐질 뿐이다.
 */

/* ────────────────────── 환율 폼 검증 ────────────────────── */

export type RateField = 'pair' | 'rate' | 'effectiveFrom'

export interface RateFormValues {
  pair: RatePair
  /** 1 base = n KRW — 입력 문자열 */
  rate: string
  /** `datetime-local` 값(`YYYY-MM-DDTHH:mm`). 비우면 서버가 now로 채운다 */
  effectiveFrom: string
}

export type RateErrors = Partial<Record<RateField, string>>

/**
 * 환율 폼 검증.
 *
 * ⚠ **적용 시각 규칙이 두 문서에서 정반대다.**
 *   · 화면설계 v6 M-03 입력 검증: "적용 시각은 **과거·현재만**(미래 예약 없음)"
 *   · `coin_03` 설명·400 사유: "effectiveFrom은 **미래 시각도 허용**하고 **과거 시각은 거부**한다"
 *   과거 시각을 보내면 서버가 400을 낸다는 것은 확정적이므로, 화면이 과거를 허용하면
 *   관리자는 무조건 실패하는 값을 입력하게 된다. 그래서 **API 쪽(현재 이후)** 을 따르고,
 *   미래 예약을 권하지 않기 위해 기본값은 비워 둔다(= 서버가 now로 채운다).
 *   이 판단은 명세 불일치 목록에 올려 두었다.
 *
 * ⚠ **비교 기준은 `now`가 아니라 `now`가 속한 분의 시작이다**(MR !65 리뷰 지적).
 *   `datetime-local`은 분 단위까지만 받는다. 즉 관리자가 입력으로 표현할 수 있는 가장 이른
 *   시각은 "지금 이 분"이다. 그런데 14:07을 고르고 환율을 마저 채워 14:07:40에 저장을 누르면
 *   `at(14:07:00) < now(14:07:40)`가 되어 **유효한 입력이 튕긴다.** 입력이 표현할 수 있는
 *   해상도에 맞춰 비교한다. 지금 이 분을 고른 경우는 `toRateRegisterItem`이 필드를 아예 빼서
 *   서버가 자기 `now`로 채우게 하므로, 이 관문을 통과한 값이 서버에서 과거로 판정될 일은 없다.
 */
export function validateRate(
  values: RateFormValues,
  now: number = Date.now(),
  language: 'ko' | 'en' = 'ko',
): RateErrors {
  const text = (ko: string, en: string) => (language === 'ko' ? ko : en)
  const errors: RateErrors = {}

  if (!RATE_PAIRS.includes(values.pair)) {
    errors.pair = text('등록할 수 있는 통화쌍이 아닙니다.', 'This currency pair is not supported.')
  }

  const raw = values.rate.trim()
  if (!raw) {
    errors.rate = text('환율을 입력해 주세요.', 'Enter an exchange rate.')
  } else if (!/^\d+(\.\d+)?$/.test(raw)) {
    errors.rate = text('환율은 양수로 입력합니다.', 'Enter a positive exchange rate.')
  } else {
    const rate = Number(raw)
    if (!(rate > 0)) {
      errors.rate = text(
        '환율은 0보다 커야 합니다.',
        'The exchange rate must be greater than zero.',
      )
    } else if (scaleOf(raw) > RATE_MAX_SCALE) {
      errors.rate = text(
        `환율은 소수점 ${RATE_MAX_SCALE}자리까지만 입력할 수 있습니다.`,
        `Use no more than ${RATE_MAX_SCALE} decimal places.`,
      )
    }
  }

  if (values.effectiveFrom) {
    const at = new Date(values.effectiveFrom).getTime()
    if (Number.isNaN(at)) {
      errors.effectiveFrom = text(
        '적용 시각을 다시 확인해 주세요.',
        'Check the effective time and try again.',
      )
    } else if (at < startOfMinute(now)) {
      // coin_03 400 — "적용 시각은 현재 이후여야 합니다"
      errors.effectiveFrom = text(
        '적용 시각은 현재 이후여야 합니다. 비워 두면 지금부터 적용됩니다.',
        'The effective time must be now or later. Leave it blank to apply immediately.',
      )
    }
  }

  return errors
}

const MINUTE_MS = 60_000

/** `ms`가 속한 분의 시작. 시간대 오프셋은 모두 분 단위라 UTC 기준으로 잘라도 같은 자리다 */
function startOfMinute(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS
}

/**
 * 고른 적용 시각이 **지금 이 분** 안인가.
 *
 * `datetime-local`이 분 단위라 "지금부터"를 시각으로 고르면 이 값이 된다. 그대로 보내면
 * 서버가 자기 `now`(초가 더 흐른)와 비교해 과거로 보고 400을 낼 수 있으므로,
 * 이때는 `effectiveFrom`을 **보내지 않고** 서버가 now로 채우게 한다 — 관리자가 뜻한 바와 같고,
 * 확인 모달도 이 경우 "지금부터"라고 적는다.
 */
export function isNowMinute(effectiveFrom: string, now: number = Date.now()): boolean {
  if (!effectiveFrom) return false
  const at = new Date(effectiveFrom).getTime()
  if (Number.isNaN(at)) return false
  return startOfMinute(at) === startOfMinute(now)
}

/** 소수 자릿수. `"9.12"` → 2 */
function scaleOf(raw: string): number {
  const dot = raw.indexOf('.')
  return dot === -1 ? 0 : raw.length - dot - 1
}

/**
 * 검증을 통과한 환율 폼을 `coin_03` 요청 항목으로 옮긴다.
 *
 * `coin_03`은 배열(`{ rates: [...] }`)을 받고 부분 실패 없이 전량 롤백한다.
 * 화면은 한 번에 하나만 등록하므로 호출부가 이 값을 배열에 담는다.
 * `source`는 화면설계 환율 이력의 출처 열이 `MANUAL` 하나뿐이라 그대로 고정한다.
 *
 * `asNow`는 호출부가 확인 모달을 **열 때** 정해 넘긴다. 모달이 떠 있는 동안 분이 넘어가도
 * 미리보기("지금부터")와 실제로 보내는 값이 갈라지지 않게 하기 위해서다.
 */
export function toRateRegisterItem(
  values: RateFormValues,
  asNow = isNowMinute(values.effectiveFrom),
): ExchangeRateRegisterItem {
  return {
    pair: values.pair,
    rate: Number(values.rate.trim()),
    // 비어 있거나 "지금 이 분"이면 필드를 아예 넣지 않는다 — 서버가 now로 채운다(스키마 설명)
    ...(values.effectiveFrom && !asNow
      ? { effectiveFrom: new Date(values.effectiveFrom).toISOString() }
      : {}),
    source: 'MANUAL',
  }
}

/* ────────────────────── 표시 포맷 ────────────────────── */

/**
 * 환산 병기 문자열(§5.4 `≈ $11.10`의 `$11.10` 부분).
 *
 * §5.4는 "API 응답의 `display`를 그대로 쓰고 클라이언트가 환율을 재계산하지 않는다"고 정했다.
 * 그런데 §0.5의 **목록 축약형**(`coin_08`의 루트 `rate` 하나)은 항목마다 `display`를 주지 않아,
 * 목록에서는 클라이언트가 그 `rate`로 나누는 것 말고 방법이 없다. 축약형이 그러라고 있는 형태다.
 * 항목별 `display`가 오는 자리에서는 이 함수를 쓰지 않고 응답 값을 그대로 쓴다.
 *
 * 환율이 없거나 0이면 `undefined` — 원 값만 보여준다(§5.4 "환산값만 감춘다").
 */
export function approxText(amount: number, rate?: number, currency = 'USD'): string | undefined {
  if (!rate || rate <= 0) return undefined
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / rate)
  } catch {
    // 알 수 없는 통화 코드면 기호 없이 숫자만 — 값을 숨기지 않는다
    return `${(amount / rate).toFixed(2)} ${currency}`
  }
}

/**
 * 마감까지 남은 시간 — M-02 상세 패널의 "이의제기 마감 시각(48h)" 옆에 붙인다.
 *
 * 서버는 남은 시간을 주지 않고 마감 시각(`disputeClosesAt`)만 준다. 시각 자체는 §5.13대로
 * 그대로 찍고, 여기서는 **차이**만 만든다.
 *
 * 이미 지났거나 값이 없으면 `undefined`다 — "0분 남음"이라고 말하면 아직 남은 것처럼 읽힌다.
 */
export function remainingText(
  iso?: string | null,
  now: number = Date.now(),
  language: 'ko' | 'en' = 'ko',
): string | undefined {
  if (!iso) return undefined
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return undefined
  const ms = target - now
  if (ms <= 0) return undefined

  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (language === 'en') {
    return hours === 0 ? `${minutes} min remaining` : `${hours} hr ${minutes} min remaining`
  }
  return hours === 0 ? `${minutes}분 남음` : `${hours}시간 ${minutes}분 남음`
}

/** 환율 표시 — 뒤따르는 0을 지우고 최대 6자리까지 보여준다(`1350` → `1,350`) */
export function formatRate(rate: number): string {
  return rate.toLocaleString('ko-KR', { maximumFractionDigits: RATE_MAX_SCALE })
}
