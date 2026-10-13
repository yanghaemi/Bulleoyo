/**
 * 잔액 패널 — 화면설계 v6 §5.10.
 *
 * 사용 화면: C-03 · A-05 · A-06 · A-13 · P-01 · P-02.
 * (C-05의 환영 카드는 등록 직후 1회만 뜨는 별도 패널이라 여기 해당하지 않는다.)
 *
 * 규칙 —
 *   · 구성은 **원 값(큰 위계) + 환산 병기(작은 위계) + 갱신 시각**
 *   · **액션 버튼이 없다.** 잔액을 늘리는 경로가 이 세계에 없으므로 붙일 액션이 없다
 *     (§1.2 원칙 12). 충전·출금·요청 버튼을 두지 않는다
 *   · 조회 실패 시 금액 자리에만 `—`와 "다시 시도"를 두고 **다른 정보는 그대로 렌더한다**
 *     — 패널 전체를 에러로 덮지 않는다
 *   · 진행 중 항목이 있으면 하단에 "처리 중 −15,000 YoYo"(결제) · "처리 중 +15,000 YoYo"(환불·지급)
 *     보류 줄을 한 줄 붙인다
 *   · **관객 화면에서는 지갑·주소·체인 정보를 넣지 않는다**(§1.2 원칙 2). 제목은 `Balance` / "잔액".
 *     공연자 화면(P-02)에서만 축약 주소·provider 배지를 함께 보여준다
 *
 * 환산값은 서버가 준 문자열을 그대로 쓴다 — 클라이언트가 환율을 재계산하지 않는다(§5.4).
 *
 * 2026-09-08 정돈 — 반경 하드코딩(`rounded-[8px]`)을 토큰 `rounded-card`로 되돌리고,
 * 금액에 `tabular-nums`를 걸었다. 잔액은 갱신될 때마다 자릿수가 바뀌는데 비례폭 숫자는
 * 그때마다 폭이 흔들려 옆의 환산값이 밀린다. 재시도 링크에는 hover 색 전환을 넣었다.
 *
 * A-05·A-06은 이 패널이 생기기 전에 만들어져 자체 마크업을 쓰고 있다. 같은 규칙을 따르므로
 * 동작 차이는 없지만, API를 붙일 때 이 컴포넌트로 모으는 편이 낫다.
 *
 * 2026-09-21 — 잔액은 조회 결과를 즉시 표시한다. 카운트업·틸트·광택은 사용하지 않는다.
 */

import type { ReactNode } from 'react'

import { useLocale } from '@/shared/i18n/useLocale'
import { BalanceLedger } from '@/shared/ui/BalanceLedger'
import type { LedgerSummary } from '@/shared/ui/BalanceLedger'
import { formatYoyo } from '@/shared/ui/format'

export interface BalancePending {
  /** 결제는 음수, 환불·지급은 양수 */
  amount: number
  label?: string
}

interface Props {
  /** 원 단위 잔액. `undefined`면 조회 실패로 본다 */
  balanceKrw?: number
  /** 서버가 준 환산 문자열. 예 `$63.00` */
  approxLabel?: string
  /** 갱신 시각 표시 문자열 */
  updatedAtLabel?: string
  pending?: BalancePending
  /** 조회 실패 시 재시도 */
  onRetry?: () => void
  /** 공연자 화면에서 provider 배지·축약 주소를 넣을 자리 */
  meta?: ReactNode
  /**
   * 들어온 돈 / 나간 돈 요약. A-13이 확정 거래를 합산해 넘긴다. 0건이면 안 그린다.
   * ⚠ §5.10 표에 없는 표시 전용 요소 — 채택 시 명세에 한 줄 추가(BalanceLedger 주석)
   */
  ledger?: LedgerSummary
  className?: string
}

export function BalancePanel({
  balanceKrw,
  approxLabel,
  updatedAtLabel,
  pending,
  onRetry,
  meta,
  ledger,
  className = '',
}: Props) {
  const { text } = useLocale()
  const failed = balanceKrw == null

  return (
    <section
      className={`ui-balance-panel rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5 ${className}`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('잔액', 'Balance')}
        </h2>
        {meta}
      </div>

      {failed ? (
        <div className="flex items-baseline gap-2.5">
          <span
            aria-label={text('잔액을 불러오지 못했습니다', 'Could not load your balance')}
            className="font-num tabular-nums text-2xl font-bold text-faint tabular-nums"
          >
            —
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="cursor-pointer font-sans text-xs font-semibold text-sel underline-offset-2 transition-colors duration-150 ease-out hover:text-ink hover:underline md:text-[13px]"
            >
              {text('다시 시도', 'Retry')}
            </button>
          )}
        </div>
      ) : (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2">
          <span className="ui-balance-amount font-num tabular-nums text-2xl font-bold text-ink md:text-[28px]">
            {formatYoyo(balanceKrw)}
          </span>
          {approxLabel && (
            <span className="font-sans text-xs text-muted md:text-[13px]">≈ {approxLabel}</span>
          )}
          {/* 처리 중 금액을 잔액 **옆**에 유령 숫자로 둔다. §5.10은 패널 하단 한 줄로 적었는데,
              결제 직후 이 화면에 오면 하단은 눈에 안 들어온다 — 곧 빠져나갈 돈은 남은 돈 옆에
              있어야 "지금 쓸 수 있는 진짜 금액"이 읽힌다. 확정 잔액과 헷갈리지 않게 흐리고 작게,
              괄호 대신 여백으로 떼어 놓는다. ⚠ 명세와 위치가 달라 §5.10 개정이 필요하다 */}
          {pending && (
            <span className="font-sans text-xs text-muted">
              <span className="font-num font-semibold tabular-nums">
                {pending.amount < 0 ? '−' : '+'}
                {formatYoyo(Math.abs(pending.amount))}
              </span>{' '}
              {pending.label ?? text('처리 중', 'Processing')}
            </span>
          )}
        </p>
      )}

      {/* 들어온 돈 / 나간 돈 — 목록이 만든 크기를 두 줄로. 조회 실패 시에는 그리지 않는다 */}
      {!failed && ledger && (
        <BalanceLedger summary={ledger} className="mt-3.5 border-t border-line pt-3" />
      )}

      {/* 갱신 시각은 조회 실패와 무관하게 그대로 렌더한다(§5.10) */}
      {updatedAtLabel && (
        <p className="mt-3 mb-0 font-sans text-xs text-muted">
          {text('갱신', 'Updated')} {updatedAtLabel}
        </p>
      )}
    </section>
  )
}
