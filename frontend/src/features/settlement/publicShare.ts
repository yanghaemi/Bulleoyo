/**
 * V-03 정산 공유(공개)의 타입·표 — 화면 컴포넌트가 아닌 값만 둔다.
 *
 * 정본 — 화면설계 v6 §4 V-03(1542행~) · API 명세 v6 `settlement_07`
 *        `GET /api/v1/public/settlement/{shareToken}` → `SettlementPublic`
 *        (`docs/design/api/parts/11_settlement.yaml` 429행·`SettlementPublic`·`SettlementPublicShare`)
 *
 * 컴포넌트 파일과 나눠 둔 이유는 Fast Refresh다 — 컴포넌트 파일은 컴포넌트만 export한다.
 *
 * ⚠ 화면 ID `V-03`은 **제안값**이다(화면설계 v6 1544행, 신현경·이강륜 확인 전).
 *   확정 전까지 다른 문서·코드에서 이 ID를 재사용하지 않는다.
 */

import type { SettlementStatus } from '@/shared/ui'

/* ── 응답 타입 ────────────────────────────────────────────────────────

   2026-09-16 실 API 연결(S15P21B204-102)에서 손으로 옮겨 적은 타입을 지우고
   `@/shared/api/domains/settlement`의 도메인 타입 별칭으로 바꿨다. 손으로 쓴 쪽은
   `releaseTxHash`·`explorerUrl`을 `?: string | null`로 적었는데 매퍼는 둘 다
   `string | null`로 좁혀 준다 — 화면이 "없음"을 한 가지 모양으로만 다루면 된다.  */

export type {
  SettlementRate as PublicSettlementRate,
  PublicSettlement,
  PublicSettlementShare,
} from '@/shared/api/domains/settlement'

import type { SettlementRate as PublicSettlementRate } from '@/shared/api/domains/settlement'

/** 조회 실패. 분기는 `code`로만 한다(응답 규격 §1) */
export interface PublicSettlementError {
  code: string
  /** 서버 `msg`. 있으면 그대로 노출한다(§5.5) */
  msg?: string
}

/* ── 상태 판정 ────────────────────────────────────────────────────────── */

/**
 * "정산이 아직 확정되지 않았습니다" 안내를 붙이는 단계 — V-03 **상태** 항목이 적은 세 값 그대로다.
 *
 * `NONE`은 여기 넣지 않았다. 명세가 세 값만 열거했고, 공유 링크는 정산이 `AGGREGATED` 이상이어야
 * 발급되므로 `NONE`으로는 도달하지 않는다고 적혀 있다(1579행). 도달하면 목록 빈 상태 문구가 받는다.
 */
const UNSETTLED: readonly SettlementStatus[] = ['AGGREGATED', 'LOCKED', 'DISPUTE_OPEN']

export function isUnsettled(status: SettlementStatus): boolean {
  return UNSETTLED.includes(status)
}

/* ── 표시 문구 ────────────────────────────────────────────────────────── */

/**
 * 팀별 분배 목록의 열 이름 — 컴포넌트 표(1571행)의 필드 순서 그대로다.
 * 첫 열(`teamName`)은 패널 제목이 되므로 여기에 없다. PC 표와 모바일 패널이 **같은 순서**를
 * 쓰게 하려고 배열 하나를 두 곳에서 쓴다(§5.21 "접었을 때도 열 순서를 바꾸지 않는다").
 *
 * 대상 독자가 밴드 멤버라 일상어를 우선했다(1550행) — `fixed`·`dust` 같은 말을 그대로 쓰지 않는다.
 */
export const SHARE_COLUMNS = ['고정 몫', '선택 몫', '잔여', '합계', '관객 선택 수', '수령'] as const

/**
 * 조회 실패 문구 — V-03 **상태** 항목이 정한 에러는 `COMMON_NOT_FOUND` 하나다(1582행).
 * "존재하지 않거나 무효화된 토큰"(settlement_07 404 설명)이며 재발급으로 무효가 된 이전 토큰도 여기로 온다.
 *
 * **다른 CTA(로그인·홈 이동)를 두지 않는다.** 링크를 받은 사람이 관객이 아닐 수 있다(1549·1582행).
 */
export const NOT_FOUND_CODE = 'COMMON_NOT_FOUND'

export const NOT_FOUND_TITLE = '이 링크로는 정산 결과를 볼 수 없습니다'
export const NOT_FOUND_BODY =
  '링크가 만료됐거나 새 링크가 발급돼 이전 링크가 더는 쓰이지 않습니다. 링크를 보내 준 팀에 다시 요청해 주세요.'

/**
 * 표에 없는 코드는 문구를 지어내지 않는다 — 코드를 그대로 담아 보여준다(P-08 `settlementMessages`와 같은 규칙).
 * 명세가 이 화면에 정한 에러는 404 하나뿐이라 그 밖의 값은 "지금은 볼 수 없다"까지만 말한다.
 */
export function shareErrorText(error: PublicSettlementError): { title: string; body: string } {
  if (error.code === NOT_FOUND_CODE) {
    return { title: NOT_FOUND_TITLE, body: error.msg || NOT_FOUND_BODY }
  }
  return {
    title: '정산 결과를 불러오지 못했습니다',
    body: error.msg || `잠시 후 다시 열어 주세요. (코드 ${error.code})`,
  }
}

/* ── 숫자 표기 ────────────────────────────────────────────────────────── */

/**
 * bp → %. 10000bp = 100%다(V-03 컴포넌트 표 "bp → % 환산 표시").
 *
 * 같은 함수가 `features/studio/SettlementDashboard`에도 있다. features끼리 import하지 않는
 * 구조 규칙(기술 스택 §3.2) 때문에 옮겨 적었다 — 공유가 필요해지면 `shared/ui/format`으로 올린다.
 */
export function bpToPercent(bp: number): string {
  const pct = bp / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`
}

export function formatCount(n: number): string {
  return n.toLocaleString('ko-KR')
}

/**
 * 표시 통화 환산 문자열(§5.4 병기용). 원 값이 언제나 먼저 오고 이 값은 `≈`로 뒤에 붙는다.
 *
 * ⚠ §5.4는 "서버가 준 `display` 객체를 그대로 쓰고 클라이언트가 재계산하지 않는다"고 정했지만,
 *   `SettlementPublic`에는 `display`가 없고 축약형 `rate`만 있다(§0.5 "항목마다 display를 반복하지
 *   않는다"). 그래서 이 화면은 축약형 환율로 **매출 요약 3개 지표만** 환산해 병기한다.
 *   팀별 분배액은 환산하지 않는다 — 명세가 `rate` 병기를 매출 요약 패널 행에만 적었다(1569행).
 *
 * 통화 코드가 Intl이 모르는 값이면 기호 없이 코드만 붙인다 — 던지고 화면을 깨뜨리지 않는다.
 */
export function formatApprox(amountKrw: number, rate?: PublicSettlementRate): string | undefined {
  if (!rate || !rate.rate || !Number.isFinite(rate.rate)) return undefined
  const converted = amountKrw / rate.rate
  try {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: rate.currency,
      maximumFractionDigits: 2,
    }).format(converted)
  } catch {
    return `${converted.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${rate.currency}`
  }
}
