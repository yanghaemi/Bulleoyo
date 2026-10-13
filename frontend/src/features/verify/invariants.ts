/**
 * 불변식 4행 뷰모델 — 결정 문서 v2 §3.8, 화면설계 v6 V-01 "불변식 대사 패널" · V-02 "불변식 4행 목록".
 *
 * V-01과 V-02가 **같은 4행을 다른 소스로** 만든다. 그래서 두 화면이 같은 행 모양
 * (`InvariantRow`)을 쓰고, 만드는 함수만 다르다 —
 *   · V-02: `GET /api/v1/coin/supply`의 `invariants[]` 4건을 그대로 옮긴다
 *   · V-01: ②·③은 verify_01의 대사 블록에서, ①·④는 **coin/supply와 같은 소스**에서 가져온다
 *     (V-01 컴포넌트 표 "④는 전역 값이므로 V-02와 같은 소스를 쓴다")
 *
 * ── 이 파일의 핵심 규칙: 모르면 모른다고 말한다 ────────────────────────────
 * 상태는 **일치·불일치·확인 중 셋**이다. 서버가 준 `matched`가 boolean이라고 해서
 * 언제나 둘 중 하나로 찍지 않는다. 아래 세 경우에는 `matched`를 신뢰할 수 없으므로
 * `unknown`("확인 중")으로 둔다 —
 *   ⓐ 값이 `null`이다 — `CoinSupplyInvariant`의 `expected`·`actual`·`checkedShows`·`maxDiff`가
 *     전부 nullable이고, V-02 **상태** 항목이 "값 일부 실패: 실패한 값만 `—`"라고 정했다
 *   ⓑ `stale: true`다 — 노드 장애로 마지막 인덱싱·캐시 값을 보는 중이라 지금 체인 상태가 아니다
 *   ⓒ 소스 자체를 못 받았다 — V-01에서 coin/supply 호출이 실패하면 ①·④를 판정할 수 없다
 * ⓑ·ⓒ는 **명세에 문장이 없는 해석**이다(보고 목록에 올렸다). 같은 규칙을 P-07
 * `SalesStatus`가 `onchainAvailable === false`에서 이미 쓰고 있어 문구를 맞췄다.
 *
 * 컴포넌트가 아니라 순수 함수 모듈이다(Fast Refresh 규칙).
 */

import type {
  CoinSupply,
  CoinSupplyInvariant,
  VerificationData,
  VerificationEscrowReconciliation,
  VerificationReleaseReconciliation,
} from '@/features/verify/verifyTypes'
import { formatYoyo } from '@/shared/ui/format'

/** 일치·불일치·확인 중. `SalesStatus`의 `MatchState`와 같은 세 값이다 */
export type MatchState = 'matched' | 'mismatched' | 'unknown'

/** 화면에 그대로 찍는 라벨. 색이 아니라 **문구**로 구분한다(V-01·V-02 접근성 항목) */
export const MATCH_LABEL: Record<MatchState, string> = {
  matched: '일치',
  mismatched: '불일치',
  unknown: '확인 중',
}

/** 불변식 한 행 */
export interface InvariantRow {
  no: 1 | 2 | 3 | 4
  /** 결정 문서 v2 §3.8 문구 — 전문 용어를 그대로 쓴다(§1.2 원칙 2의 명시적 예외) */
  title: string
  state: MatchState
  /** 대조한 두 값. `unknown`이면 읽지 못한 쪽이 `undefined`다 */
  expected?: number
  actual?: number
  /** 대조 값의 라벨(행마다 다르다 — "장부값 / 온체인" 등) */
  expectedLabel: string
  actualLabel: string
  /**
   * 대조 값의 단위. **금액이 아닌 행이 있다** — V-02의 ②는 공연 "건수"를 센다.
   * 건수를 `YoYo`로 찍으면 읽는 사람이 금액으로 오해한다.
   */
  unit: 'krw' | 'count'
  /** 차액(actual − expected). 판정 불가면 `undefined` */
  diff?: number
  /**
   * 불일치 심각도. 기본 불일치는 warning이지만, ④에서 차액이 음수면
   * 장부 합계가 발행량보다 큰 상태라 시스템 정지급 danger로 올린다.
   */
  severity?: 'warning' | 'danger'
  /** 판정 불가 사유. `state === 'unknown'`일 때만 있다 */
  unknownReason?: string
  /** 이 행이 세는 공연 수(②·③ 전역 요약에서만) */
  scope?: string
  scopeCount?: number
  /** 서버가 붙인 설명(`note`). 있으면 보조 줄로 그대로 노출한다 */
  note?: string
}

/** 결정 문서 v2 §3.8 4행의 제목. V-01·V-02가 같은 문장을 쓴다 */
export const INVARIANT_TITLE: Record<1 | 2 | 3 | 4, string> = {
  1: '① totalSupply = Σ Minted (시연용 지급 합, 단조 증가)',
  2: '② escrowOf(showId) = Σpurchase − Σrefund − Σrelease (보증금은 별도 계정)',
  3: '③ 공연별 Σ Released = 잠긴 규칙 × 카운터 재계산 합 (dust 포함, 1 YoYo 오차 0)',
  4: '④ totalSupply와 등록 지갑 잔액 + 공연 에스크로·보증금 대조',
}

/** 값이 실제로 왔는가. `null`·`undefined`를 함께 거른다 */
function present(v: number | null | undefined): v is number {
  return typeof v === 'number'
}

/* ── V-02: coin/supply의 invariants[] → 행 4개 ────────────────────────── */

/**
 * `CoinSupplyInvariant` 한 건을 행으로.
 *
 * ①·④는 `expected`/`actual` 두 값을 대조하고, ②는 `checkedShows`/`mismatchedShows`,
 * ③은 `checkedShows`/`maxDiff`를 쓴다(coin_01 예시가 그렇게 채워 온다).
 * 각 행이 쓰는 값이 하나라도 비면 판정하지 않는다.
 */
function rowFromCoinInvariant(inv: CoinSupplyInvariant, stale: boolean): InvariantRow {
  const base = {
    no: inv.no,
    title: INVARIANT_TITLE[inv.no],
    note: inv.note,
  }

  const staleReason = '체인 조회가 지연돼 마지막 캐시 값을 보고 있습니다'

  // `null`을 여기서 한 번에 `undefined`로 정규화한다 — 아래 분기가 값 유무만 보게 된다
  const checkedShows = present(inv.checkedShows) ? inv.checkedShows : undefined
  const mismatchedShows = present(inv.mismatchedShows) ? inv.mismatchedShows : undefined
  const maxDiff = present(inv.maxDiff) ? inv.maxDiff : undefined
  const expected = present(inv.expected) ? inv.expected : undefined
  const actual = present(inv.actual) ? inv.actual : undefined
  const scope = checkedShows != null ? `공연 ${checkedShows}건` : undefined

  if (inv.no === 2) {
    const known = checkedShows != null && mismatchedShows != null
    return {
      ...base,
      expectedLabel: '검사한 공연',
      actualLabel: '어긋난 공연',
      unit: 'count' as const,
      expected: checkedShows,
      actual: mismatchedShows,
      scope,
      scopeCount: checkedShows,
      state: !known ? 'unknown' : stale ? 'unknown' : inv.matched ? 'matched' : 'mismatched',
      unknownReason: !known ? '공연별 에스크로를 읽지 못했습니다' : stale ? staleReason : undefined,
      // 이 행의 "차액"은 금액이 아니라 어긋난 공연 수다 — 그대로 둔다
      diff: known && !stale ? mismatchedShows : undefined,
    }
  }

  if (inv.no === 3) {
    const known = maxDiff != null
    return {
      ...base,
      expectedLabel: '허용 오차',
      actualLabel: '최대 차액',
      unit: 'krw' as const,
      expected: 0,
      actual: maxDiff,
      scope,
      scopeCount: checkedShows,
      state: !known ? 'unknown' : stale ? 'unknown' : inv.matched ? 'matched' : 'mismatched',
      unknownReason: !known ? 'Released 이벤트를 읽지 못했습니다' : stale ? staleReason : undefined,
      diff: known && !stale ? maxDiff : undefined,
    }
  }

  const known = expected != null && actual != null
  const diff = expected != null && actual != null && !stale ? actual - expected : undefined

  return {
    ...base,
    expectedLabel: inv.no === 1 ? 'Σ Minted' : 'Σ등록 지갑 + Σ에스크로',
    actualLabel: 'totalSupply',
    unit: 'krw' as const,
    expected,
    actual,
    state: !known ? 'unknown' : stale ? 'unknown' : inv.matched ? 'matched' : 'mismatched',
    unknownReason: !known ? '온체인 값을 읽지 못했습니다' : stale ? staleReason : undefined,
    diff,
    severity: inv.no === 4 && diff != null && diff < 0 ? 'danger' : undefined,
  }
}

/**
 * V-02 불변식 4행.
 *
 * 응답 `invariants[]`가 4건을 다 담지 않을 수 있으므로 **1~4번 자리를 화면이 먼저 잡고**
 * 없는 번호는 판정 불가로 남긴다 — 빠진 행을 조용히 감추면 "네 개를 다 봤다"고 오해한다.
 */
export function buildSupplyInvariantRows(supply: CoinSupply): InvariantRow[] {
  const nos: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]
  return nos.map((no) => {
    const found = supply.invariants.find((i) => i.no === no)
    if (!found) {
      return {
        no,
        title: INVARIANT_TITLE[no],
        state: 'unknown' as const,
        expectedLabel: '기대값',
        actualLabel: '실제값',
        unit: 'krw' as const,
        unknownReason: '이 불변식의 검사 결과가 응답에 없습니다',
      }
    }
    return rowFromCoinInvariant(found, supply.stale)
  })
}

/* ── V-01: verify_01 + coin/supply → 행 4개 ───────────────────────────── */

/** 불변식 ② — 공연 하나의 에스크로 잔액 대조 */
function rowFromEscrow(esc: VerificationEscrowReconciliation, stale: boolean): InvariantRow {
  const known =
    esc.matched != null && esc.expectedEscrowBalance != null && esc.escrowBalanceOnchain != null
  const diff =
    !stale && known && esc.escrowBalanceOnchain != null && esc.expectedEscrowBalance != null
      ? esc.escrowBalanceOnchain - esc.expectedEscrowBalance
      : undefined
  return {
    no: 2,
    title: INVARIANT_TITLE[2],
    expectedLabel: '기대 잔액(Σpurchase − Σrefund − Σrelease)',
    actualLabel: 'escrowOf(showId)',
    unit: 'krw',
    expected: esc.expectedEscrowBalance ?? undefined,
    actual: esc.escrowBalanceOnchain ?? undefined,
    state: stale || !known ? 'unknown' : esc.matched ? 'matched' : 'mismatched',
    unknownReason: stale
      ? '체인 조회가 지연돼 마지막 인덱싱 값을 보고 있습니다'
      : !known
        ? '대조에 필요한 값을 읽지 못했습니다'
        : undefined,
    diff,
    note: esc.note,
  }
}

/** 불변식 ③ — Released 이벤트 합 vs 재계산 합. 1원도 다르면 안 된다 */
function rowFromRelease(rel: VerificationReleaseReconciliation, stale: boolean): InvariantRow {
  const known =
    rel.matched != null &&
    rel.recalculatedTotal != null &&
    rel.releasedEventTotal != null &&
    rel.difference != null
  return {
    no: 3,
    title: INVARIANT_TITLE[3],
    expectedLabel: '재계산 합',
    actualLabel: 'Σ Released',
    unit: 'krw',
    expected: rel.recalculatedTotal ?? undefined,
    actual: rel.releasedEventTotal ?? undefined,
    state: stale || !known ? 'unknown' : rel.matched ? 'matched' : 'mismatched',
    unknownReason: stale
      ? '체인 조회가 지연돼 마지막 인덱싱 값을 보고 있습니다'
      : !known
        ? '아직 지급되지 않았거나 대조에 필요한 값이 없습니다'
        : undefined,
    // 응답이 준 `difference`를 그대로 쓴다 — 화면이 다시 빼면 서버와 다른 수가 나올 수 있다
    diff: stale || !known ? undefined : (rel.difference ?? undefined),
  }
}

/**
 * V-01 불변식 4행.
 *
 * `supply`가 `undefined`면 coin/supply를 못 받은 것이다 — ①·④를 **판정 불가**로 둔다.
 * 이 화면에서 가장 중요한 정직성 규칙이다: 전역 값을 모르는 채로 "일치"라고 쓰지 않는다.
 */
export function buildVerificationInvariantRows(
  data: VerificationData,
  supply?: CoinSupply,
): InvariantRow[] {
  const globalRows = ([1, 4] as const).map((no): InvariantRow => {
    if (!supply) {
      return {
        no,
        title: INVARIANT_TITLE[no],
        state: 'unknown',
        expectedLabel: no === 1 ? 'Σ Minted' : 'Σ지갑 + Σ에스크로',
        actualLabel: 'totalSupply',
        unit: 'krw',
        unknownReason: '발행량·에스크로 공시를 불러오지 못해 대조하지 못했습니다',
      }
    }
    const found = supply.invariants.find((i) => i.no === no)
    if (!found) {
      return {
        no,
        title: INVARIANT_TITLE[no],
        state: 'unknown',
        expectedLabel: no === 1 ? 'Σ Minted' : 'Σ지갑 + Σ에스크로',
        actualLabel: 'totalSupply',
        unit: 'krw',
        unknownReason: '이 불변식의 검사 결과가 공시 응답에 없습니다',
      }
    }
    return rowFromCoinInvariant(found, supply.stale)
  })

  const rows: InvariantRow[] = [
    globalRows[0],
    rowFromEscrow(data.escrowReconciliation, data.stale),
    rowFromRelease(data.releaseReconciliation, data.stale),
    globalRows[1],
  ]
  return rows
}

/* ── 종합 판정 ────────────────────────────────────────────────────────── */

/**
 * V-02 "대사 결과 배지" 3값 — `Balanced` / `Checking` / `Mismatch`.
 *
 * ⚠ 명세는 배지 값을 셋으로 정했는데 응답에는 `supplyMatched`(boolean)뿐이다.
 * 그래서 `Checking`을 **"아직 판정할 수 없는 상태"** 로 해석했다 — 확인 중 행이 하나라도
 * 있거나 `stale`이면 확인 중이다. 불일치가 하나라도 있으면 그쪽이 우선한다(감추지 않는다).
 */
export type SupplyVerdict = 'balanced' | 'checking' | 'mismatch'

export function verdictOf(rows: InvariantRow[], supplyMatched: boolean): SupplyVerdict {
  if (rows.some((r) => r.state === 'mismatched') || !supplyMatched) return 'mismatch'
  if (rows.some((r) => r.state === 'unknown')) return 'checking'
  return 'balanced'
}

/** V-01 상단 배너 조건 — "①·④가 깨지면" (V-01 **상태** 항목) */
export function isGlobalInvariantBroken(rows: InvariantRow[]): boolean {
  return rows.some((r) => (r.no === 1 || r.no === 4) && r.state === 'mismatched')
}

/** 차액 표기. 0은 `0`, 양수는 `+`, 음수는 `−`(하이픈이 아니라 마이너스 기호) */
export function signedAmount(diff: number): string {
  if (diff === 0) return formatYoyo(0)
  return formatYoyo(Math.abs(diff), diff > 0 ? '+' : '−')
}
