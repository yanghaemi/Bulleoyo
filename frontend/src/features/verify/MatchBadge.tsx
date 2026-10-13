/**
 * 대조 결과 배지 — 일치 · 불일치 · **확인 중** 세 값.
 *
 * V-01·V-02 접근성 항목이 "일치/불일치는 색과 함께 문구로도 알린다"·"불일치는 색이 아니라
 * 배지 문구·배너 위치로 구분한다"고 정했다. 그래서 색은 보조이고 **라벨이 본체**다.
 *
 * `unknown`("확인 중")이 이 두 화면의 핵심이다. 온체인 값을 읽지 못했거나 캐시를 보고 있을 때
 * `matched` 필드를 그대로 믿고 "일치"라고 쓰면 화면이 거짓말을 한다. P-07 `SalesStatus`가
 * `onchainAvailable === false`에서 이미 같은 규칙을 쓰고 있어 색·문구를 맞췄다.
 *
 * 색은 토큰만 쓴다(hex 금지) — ok/warning/danger/line.
 */

import { MATCH_LABEL } from '@/features/verify/invariants'
import type { MatchState } from '@/features/verify/invariants'
import { useLocale } from '@/shared/i18n/useLocale'

const TONE: Record<MatchState, string> = {
  matched: 'border-ok text-ok',
  // 불일치는 사람이 손대야 하는 상태다 — 경고색(주의·대기)
  mismatched: 'border-warning text-warning',
  // 확인 중은 "나쁘다"가 아니라 "모른다"다. 중립 테두리로 두고 문구가 말하게 한다
  unknown: 'border-line text-muted',
}

export function MatchBadge({
  state,
  severity = 'warning',
}: {
  state: MatchState
  severity?: 'warning' | 'danger'
}) {
  const { text } = useLocale()
  const tone =
    state === 'mismatched' && severity === 'danger' ? 'border-danger text-danger' : TONE[state]
  const label =
    state === 'mismatched' && severity === 'danger'
      ? text('장부 초과', 'Ledger excess')
      : text(
          MATCH_LABEL[state],
          { matched: 'Matched', mismatched: 'Mismatch', unknown: 'Checking' }[state],
        )

  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip border bg-surface px-2 font-sans text-[11px] font-semibold tracking-tight ${tone}`}
    >
      {label}
    </span>
  )
}
