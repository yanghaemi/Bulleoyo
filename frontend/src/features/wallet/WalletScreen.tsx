/**
 * A-13 내 지갑(화면 라벨은 "잔액").
 *
 * 정본 — 화면설계 v6 §4 A-13 · §5.10 잔액 패널 · §5.18 탭바
 *        · API 명세 v6 wallet-01(내 지갑) · wallet-02(거래 이력)
 *
 * **화면 라벨은 `Balance` / "잔액"이다**(§1.2 원칙 2). 문서상 화면명만 "내 지갑"이고,
 * 화면에는 **주소도 tx 해시도 노출하지 않는다.**
 * ⚠ wallet-02 응답에는 `txHash`·`explorerUrl`·`signerType`·`feeDelegated`가 들어 있지만
 * **관객 화면이라 렌더하지 않는다.** tx 링크는 P·M·V 화면에만 노출한다(§1.2 원칙 11).
 * 데이터가 온다고 화면에 올리지 않는다.
 *
 * 잔액을 늘리는 버튼·이력 진입은 v5에서 전부 삭제됐다(§1.2 원칙 12).
 *
 * 레이아웃 —
 *   · 모바일(<768px): 잔액 패널을 상단에 크게, 필터는 가로 스크롤 한 줄, 이력 1열. 탭바 유지
 *   · PC(≥768px): 최대폭 960px. 큰 잔액 요약 아래 가로 필터와 단일 거래 원장.
 */

import { useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { useLocale } from '@/shared/i18n/useLocale'

import { SegmentedFilter } from '@/features/wallet/SegmentedFilter'
import { AppHeader, BalancePanel, BottomNav, MotionDisclosure, formatYoyo } from '@/shared/ui'

import { groupByDay } from './walletGrouping'
import type { BalancePending } from '@/shared/ui/BalancePanel'
import type { LedgerSummary } from '@/shared/ui/BalanceLedger'
import './wallet-refresh.css'

/** §7 `WalletTx.type` 6종. v4의 가스 유형은 없다 — 수수료는 운영지갑이 대납한다 */
export type WalletTxType =
  'GRANT' | 'PURCHASE' | 'REFUND' | 'RELEASE' | 'DEPOSIT' | 'DEPOSIT_RETURN'

/** wallet-02의 `status`. A-13 상태 절은 `PAYING`·`PROCESSING`으로 적었는데 그건 주문·환불
 *  상태값이고, 지갑 거래 행의 상태는 이 4종이다. 처리 중 배지는 PENDING·SUBMITTED에 붙인다. */
export type WalletTxStatus = 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED'

export interface WalletTx {
  walletTxId: string
  type: WalletTxType
  direction: 'IN' | 'OUT'
  amount: number
  status: WalletTxStatus
  /** 공연명 등 설명 */
  title: string
  /**
   * 거래 시각(ISO 8601). **묶음·정렬은 이 값으로만 한다.**
   * 표시 문자열을 잘라 쓰면(예전 방식) 표기 형식을 바꾸는 순간 날짜 묶음이 조용히 깨진다 —
   * 2026-09-09에 §5.13 표기로 통일하면서 실제로 그랬다. wallet-02도 ISO를 준다.
   */
  occurredAt: string
  /** 회원 시간대 + KST 병기(§5.13). 표시 전용 — 파싱하지 않는다 */
  occurredAtLabel: string
  /** 서버가 준 환산 문자열 */
  approxLabel?: string
  /** 탭 시 이동할 경로. 없으면 이동하지 않는다 */
  linkTo?: string
  /** GRANT 행에서만 — 관리자 추가 지급이면 그 메모 */
  grantMemo?: string
}

export type WalletFilter = 'ALL' | 'GRANT' | 'PURCHASE' | 'REFUND' | 'RELEASE' | 'DEPOSIT'

const FILTERS: { key: WalletFilter; en: string; ko: string; leaderOnly?: boolean }[] = [
  { key: 'ALL', en: 'All', ko: '전체' },
  { key: 'GRANT', en: 'Credit', ko: '지급' },
  { key: 'PURCHASE', en: 'Payment', ko: '결제' },
  { key: 'REFUND', en: 'Refund', ko: '환불' },
  { key: 'RELEASE', en: 'Payout', ko: '정산 수령', leaderOnly: true },
  { key: 'DEPOSIT', en: 'Deposit', ko: '보증금', leaderOnly: true },
]

const TYPE_LABEL: Record<WalletTxType, { en: string; ko: string }> = {
  GRANT: { en: 'Credit', ko: '지급' },
  PURCHASE: { en: 'Payment', ko: '결제' },
  REFUND: { en: 'Refund', ko: '환불' },
  RELEASE: { en: 'Payout', ko: '정산 수령' },
  DEPOSIT: { en: 'Deposit', ko: '보증금' },
  DEPOSIT_RETURN: { en: 'Deposit returned', ko: '보증금 반환' },
}

/** `Deposit` 필터는 DEPOSIT·DEPOSIT_RETURN 둘을 함께 본다(A-13 컴포넌트 표) */
function matches(tx: WalletTx, f: WalletFilter): boolean {
  if (f === 'ALL') return true
  if (f === 'DEPOSIT') return tx.type === 'DEPOSIT' || tx.type === 'DEPOSIT_RETURN'
  return tx.type === f
}

const IN_PROGRESS: WalletTxStatus[] = ['PENDING', 'SUBMITTED']

/**
 * 들어온 돈 / 나간 돈 합계. **확정(CONFIRMED)** 거래만 센다 — 처리 중은 아직 잔액을 움직이지
 * 않았고(패널 하단 보류 줄이 따로 알린다), 실패는 영영 움직이지 않는다.
 * 표시 전용 파생값이다(원장은 체인, §5.4).
 */
function ledgerSummary(txs: WalletTx[]): LedgerSummary {
  let inAmt = 0
  let outAmt = 0
  let count = 0
  for (const tx of txs) {
    if (tx.status !== 'CONFIRMED') continue
    if (tx.direction === 'IN') inAmt += tx.amount
    else outAmt += tx.amount
    count += 1
  }
  return { in: inAmt, out: outAmt, count }
}

/**
 * 처리 중 합계. 결제는 음수, 환불·지급은 양수로 모은다. 0이면 표시하지 않는다.
 * 실패(FAILED)는 영영 움직이지 않으므로 세지 않는다.
 */
function pendingSummary(txs: WalletTx[]): BalancePending | undefined {
  let amount = 0
  for (const tx of txs) {
    if (!IN_PROGRESS.includes(tx.status)) continue
    amount += tx.direction === 'IN' ? tx.amount : -tx.amount
  }
  return amount === 0 ? undefined : { amount }
}

function TxRow({ tx, index }: { tx: WalletTx; index: number }) {
  const { text } = useLocale()
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const inProgress = IN_PROGRESS.includes(tx.status)
  const failed = tx.status === 'FAILED'
  const label = TYPE_LABEL[tx.type]
  // GRANT 행은 이동 대신 설명을 펼친다(A-13 "지급 내역 설명")
  const expandable = tx.type === 'GRANT'

  return (
    <li
      className="border-b border-line last:border-b-0"
      style={{ '--i': String(Math.min(index, 10)) } as CSSProperties}
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? detailId : undefined}
        className="wallet-tx-row flex min-h-11 w-full items-start gap-4 px-5 py-5 text-left"
      >
        {/* 타임라인 레일의 점 — 방향은 색이 아니라 부호·라벨로 구분한다는 규칙은 지킨다(부호는 그대로).
            점은 그 위에 얹는 보조 신호다. 효과 파일이 없으면 8px 빈 자리만 남는다 */}
        <span
          aria-hidden
          className="fx-ledger-dot"
          data-dir={tx.direction}
          data-failed={failed || undefined}
        />
        <span className="min-w-0 flex-1">
          <span className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <span className="font-sans text-[11px] font-semibold text-muted">
              {text(label.ko, label.en)}
            </span>
            {inProgress && (
              <span className="inline-flex h-[18px] items-center rounded-[4px] bg-sel-soft px-1.5 font-sans text-[10px] font-semibold text-ink">
                {text('처리 중', 'Processing')}
              </span>
            )}
            {failed && (
              <span className="inline-flex h-[18px] items-center rounded-[4px] border border-danger px-1.5 font-sans text-[10px] font-semibold text-danger">
                {text('실패', 'Failed')}
              </span>
            )}
          </span>
          <span className="block break-words font-sans text-[13px] font-semibold text-ink">
            {tx.title}
          </span>
          <span className="block font-sans text-[11px] text-faint">{tx.occurredAtLabel}</span>
        </span>

        <span className="shrink-0 text-right">
          <span
            className={[
              'block font-num tabular-nums text-[13px] font-bold',
              failed ? 'text-faint line-through' : tx.direction === 'IN' ? 'text-ok' : 'text-ink',
            ].join(' ')}
          >
            {tx.direction === 'IN' ? '+' : '−'}
            {formatYoyo(tx.amount)}
          </span>
          {tx.approxLabel && (
            <span className="block font-sans text-[10px] text-muted">≈ {tx.approxLabel}</span>
          )}
        </span>
      </button>
      {expandable && (
        <MotionDisclosure open={open} id={detailId}>
          <p className="m-0 px-11 pb-3.5 font-sans text-[11px] leading-relaxed text-muted">
            {tx.grantMemo ??
              text('가입할 때 지갑에 들어온 금액이에요.', 'Added to your wallet when you joined.')}
          </p>
        </MotionDisclosure>
      )}
    </li>
  )
}

interface Props {
  balanceKrw?: number
  balanceStale?: boolean
  approxLabel?: string
  updatedAtLabel?: string
  transactions: WalletTx[]
  /** 팀 리더에게만 Payout·Deposit 필터를 더한다 */
  isTeamLeader?: boolean
  /**
   * 날짜 묶음을 계산할 시간대(IANA). **`occurredAtLabel`을 만든 것과 같은 시간대여야 한다.**
   *
   * 행에 찍히는 시각은 서버가 회원 시간대로 만들어 준 `occurredAtLabel`이다. 묶음 머리글을
   * 다른 시간대로 계산하면 둘이 어긋난다 — 브라우저 로컬로 계산하다 실제로 그랬다
   * (MR !61 자동 리뷰). API를 붙이면 회원 설정의 시간대를 여기로 넘긴다.
   */
  timeZone?: string
  onRetryBalance: () => void
}

/** 한 번에 보여줄 개수. API 연결 시 pageInfo 기반 페이지네이션으로 바꾼다 */
const PAGE = 8

export function WalletScreen({
  balanceKrw,
  balanceStale = false,
  approxLabel,
  updatedAtLabel,
  transactions,
  isTeamLeader,
  onRetryBalance,
  // 목 데이터의 occurredAtLabel이 KST라 기본값도 KST다. 회원 시간대 API가 붙으면 그 값이 온다
  timeZone = 'Asia/Seoul',
}: Props) {
  const { text, language } = useLocale()
  const [filter, setFilter] = useState<WalletFilter>('ALL')
  const [shown, setShown] = useState(PAGE)

  const filters = FILTERS.filter((f) => !f.leaderOnly || isTeamLeader)
  const list = transactions.filter((t) => matches(t, filter))
  const visible = list.slice(0, shown)
  const ledger = ledgerSummary(transactions)
  const pending = pendingSummary(transactions)
  const groups = groupByDay(visible, timeZone, language)

  const changeFilter = (key: WalletFilter) => {
    setFilter(key)
    setShown(PAGE)
  }

  const historyList =
    list.length === 0 ? (
      <p className="px-4 py-14 text-center font-sans text-[13px] text-muted">
        {text('아직 내역이 없어요', 'No activity yet.')}
      </p>
    ) : (
      <>
        {/* key에 filter를 넣어 필터를 바꾸면 타임라인이 다시 들어온다(짧은 스태거).
            묶음마다 ul을 따로 두는 이유 — 레일의 세로선이 날짜 머리글을 관통하지 않게 한다 */}
        <div key={filter}>
          {groups.map((g) => {
            // 스태거는 목록 전체를 통틀어 이어져야 한다. 묶음이 바뀔 때마다 0으로 돌아가면 계단이 끊긴다
            const base = visible.indexOf(g.items[0])
            return (
              <section key={g.key}>
                <h3 className="fx-ledger-day wallet-ledger-day sticky top-0 z-10 m-0 border-b border-line bg-ground-2/85 px-4 py-1.5 font-sans text-[10px] font-semibold tracking-wide text-muted backdrop-blur-sm md:text-[11px]">
                  {g.label}
                </h3>
                <ul data-fx="ledger" className="m-0 list-none p-0">
                  {g.items.map((tx, i) => (
                    <TxRow key={tx.walletTxId} tx={tx} index={base + i} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
        {shown < list.length && (
          <div className="border-t border-line p-3 text-center">
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="min-h-11 min-w-11 px-5 font-sans text-[13px] font-semibold text-primary"
            >
              {text('더 보기', 'More')}
            </button>
          </div>
        )}
      </>
    )

  return (
    <div className="wallet-screen min-h-dvh min-w-0 max-w-full pb-16 md:pb-0">
      <AppHeader signedIn />

      <main className="wallet-workspace">
        <h1 className="mb-5 font-sans text-3xl font-bold tracking-tight text-ink">
          {text('잔액', 'Balance')}
        </h1>

        <div>
          <BalancePanel
            className="wallet-balance-summary"
            balanceKrw={balanceKrw}
            approxLabel={approxLabel}
            updatedAtLabel={updatedAtLabel}
            ledger={ledger}
            pending={pending}
            onRetry={onRetryBalance}
          />
          {balanceStale && (
            <div
              role="alert"
              className="mt-3 rounded-card border border-warning/30 bg-warning/10 p-3 text-sm text-ink"
            >
              <p>
                {text(
                  '최신 잔액을 확인하지 못해 마지막으로 확인한 잔액을 표시하고 있어요.',
                  'We could not refresh your balance. Showing the last confirmed balance.',
                )}
              </p>
              <button
                type="button"
                className="mt-1 min-h-11 font-semibold underline"
                onClick={onRetryBalance}
              >
                {text('다시 시도', 'Retry')}
              </button>
            </div>
          )}

          {/* 잔액 설명 — 충전을 권하지 않는다(§5.16 "어떻게 채우세요"라고 안내하지 않는다) */}
          <div className="wallet-balance-note">
            <p>{text('잔액은 공연 예매에 사용할 수 있어요.', 'Use your balance to book shows.')}</p>
            {/* 이 화면의 유일한 다음 행동. 잔액을 늘리는 경로가 없으므로(§1.2 원칙 12) 남은 행동은
                "쓰러 가기"뿐이고, 그 자리를 비워 두면 화면이 막다른 길이 된다 */}
            <Link
              to="/"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 font-semibold text-primary"
            >
              {text('공연 보러 가기', 'Browse shows')}
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path
                  d="m8 5 5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </div>

        <section className="wallet-activity" aria-labelledby="wallet-activity-title">
          <header className="wallet-activity-heading">
            <h2 id="wallet-activity-title">{text('거래 내역', 'Activity')}</h2>
            <p>
              {text(
                '날짜별로 들어오고 나간 금액을 확인하세요.',
                'Track your payments and credits by day.',
              )}
            </p>
          </header>
          <div className="wallet-filter-band">
            <SegmentedFilter
              items={filters}
              value={filter}
              onChange={changeFilter}
              orientation="row"
              ariaLabel={text('거래 이력 필터', 'Activity filters')}
            />
          </div>
          <div className="wallet-ledger rounded-card border border-line bg-surface">
            {historyList}
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
