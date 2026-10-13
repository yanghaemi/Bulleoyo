/**
 * V-03 정산 공유(공개) 본문.
 *
 * 정본 — 화면설계 v6 §4 V-03(1542~1591행: 영역 구성·레이아웃·컴포넌트 표 7행·상태·접근성)
 *        · §5.1 상태 배지 · §5.13 KST 병기 · §5.21 표 → 패널 접기
 *        · API 명세 v6 `settlement_07` `GET /api/v1/public/settlement/{shareToken}`
 *
 * **링크를 받은 비로그인 누구나 본다.** 팀 리더가 밴드 멤버 등 참여팀 밖 사람에게 정산 결과를
 * 보여주려고 P-08에서 발급한 링크다. 그래서 이 화면은 아래를 지킨다 —
 *   · **로그인 유도·예매 CTA를 두지 않는다**(1549·1591행). 404 안내에도 홈 이동 같은 다른
 *     CTA를 두지 않는다(1582행) — 링크를 받은 사람이 관객이 아닐 수 있고, 이 화면의 목적은
 *     회원·매출 전환이 아니라 정산 결과 공유다. 전역 헤더(`AppHeader`)를 쓰지 않는 이유도 같다:
 *     그 헤더에는 로그인 버튼과 예매 내비게이션이 들어 있다
 *   · **관객 개인정보가 없다.** 응답에 팀 ID·지갑 주소·회원 정보가 없고 `teamName`만 있다(1548행).
 *     없는 값을 화면에서 만들지 않는다
 *   · 주소·해시류를 노출하지 않는다(1550행). 예외는 `RELEASED`일 때의 release tx 패널 하나뿐이고,
 *     `releaseTxHash`·`explorerUrl` 중 하나라도 없으면 **패널 자체를 감춘다**(1583행)
 *
 * 본문 순서는 V-03 **영역 구성**(1554행) 그대로다 —
 * 공연 정보·상태 배지 → 매출 요약 → 배분 비율 안내 → 팀별 분배 목록 → release tx → 시연 고지.
 * 하단 고정 액션은 없다.
 *
 * 문구는 일상어를 우선한다(1550행) — 대상 독자가 심사위원이 아니라 밴드 멤버다.
 * 상태는 색이 아니라 배지 문구·배너 위치로 구분한다(1591행).
 */

import type { ReactNode } from 'react'

import { useLocale } from '@/shared/i18n/useLocale'
import {
  InfoRow,
  Money,
  SettlementStatusBadge,
  formatYoyo,
  formatKst,
  shortenHex,
} from '@/shared/ui'
import {
  SHARE_COLUMNS,
  bpToPercent,
  formatApprox,
  formatCount,
  isUnsettled,
  shareErrorText,
} from '@/features/settlement/publicShare'
import type {
  PublicSettlement,
  PublicSettlementError,
  PublicSettlementShare,
} from '@/features/settlement/publicShare'

import './operations-refresh.css'

interface Props {
  data?: PublicSettlement
  loading?: boolean
  /** 조회 실패. 명세가 이 화면에 정한 코드는 `COMMON_NOT_FOUND`(404) 하나다 */
  error?: PublicSettlementError
}

/* ── 조각 ─────────────────────────────────────────────────────────────── */

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4"
    >
      <h2 className="m-0 mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * 매출 요약 지표 한 칸. 숫자를 큰 위계로 둔다(1591행).
 * PC는 가로 타일 3개, 모바일은 세로로 쌓인다(1558·1559행).
 */
function SummaryTile({
  label,
  amount,
  approx,
  strong,
}: {
  label: string
  amount: number
  approx?: string
  strong?: boolean
}) {
  return (
    <div className="min-w-0 flex-1 rounded-card border border-line bg-surface px-4 py-3">
      <span className="block font-sans text-[11px] text-muted md:text-xs">{label}</span>
      <Money
        amount={amount}
        approx={approx}
        strong={strong}
        className={`mt-1 block font-num text-ink ${strong ? 'text-xl md:text-2xl' : 'text-base md:text-lg'}`}
      />
    </div>
  )
}

/** 팀별 수령 여부 — §5.1 `settlement_share.released` 행의 라벨 그대로다 */
function ReceivedBadge({ received }: { received: boolean }) {
  const { text } = useLocale()
  return (
    <span
      className={[
        'inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip border px-2',
        'font-sans text-[11px] font-semibold',
        received ? 'border-ok text-ok' : 'border-line text-muted',
      ].join(' ')}
    >
      {received ? text('수령 완료', 'Received') : text('지급 대기', 'Pending')}
    </span>
  )
}

/** 셀 값 6개를 PC 표와 모바일 패널이 같은 순서로 쓰도록 한 곳에서 만든다(§5.21) */
function shareCells(share: PublicSettlementShare): ReactNode[] {
  return [
    <span className="font-num tabular-nums">{formatYoyo(share.fixedAmount)}</span>,
    <span className="font-num tabular-nums">{formatYoyo(share.choiceAmount)}</span>,
    <span className="font-num tabular-nums">{formatYoyo(share.dustAmount)}</span>,
    <span className="font-num font-bold tabular-nums">{formatYoyo(share.totalAmount)}</span>,
    <span className="font-num tabular-nums">{formatCount(share.choiceCount)}</span>,
    <ReceivedBadge received={share.released} />,
  ]
}

function TeamShareList({ data }: { data: PublicSettlement }) {
  const { language, text } = useLocale()
  const shares = data.shares ?? []
  const columns =
    language === 'ko'
      ? SHARE_COLUMNS
      : ([
          'Fixed share',
          'Audience share',
          'Remainder',
          'Total',
          'Audience picks',
          'Status',
        ] as const)

  return (
    <section aria-label={text('팀별 분배 목록', 'Distribution ledger')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('팀별 분배 금액', 'Team distribution')}
      </h2>

      {/*
        정산 미확정 단계 안내 — V-03 상태 항목(1579행). **목록 위**에 둔다.
        ⚠ 이 단계의 `shares` 값이 잠정치인지, 확정 뒤에만 채워지는지는 스키마·설명에 없다 `(확인 필요)`.
        그래서 "확정된 값이 아니다"까지만 말한다 — 두 해석 중 어느 쪽이어도 참인 문장이다.
        값이 비어 오는 해석이면 아래 빈 상태 문구가 받는다.
      */}
      {isUnsettled(data.settlementStatus) && (
        <p
          role="status"
          className="m-0 mb-2 rounded-card border border-line bg-ground-2 px-4 py-3 font-sans text-[13px] leading-relaxed text-ink"
        >
          {text(
            '정산이 아직 확정되지 않았습니다. 아래 금액은 확정된 값이 아니라 달라질 수 있습니다.',
            'Settlement is not final. The amounts below may still change.',
          )}
        </p>
      )}

      {shares.length === 0 ? (
        <p
          role="status"
          className="m-0 rounded-card border border-line bg-surface px-4 py-14 text-center font-sans text-[13px] text-muted"
        >
          {text('아직 팀별 분배 금액이 나오지 않았습니다', 'No distribution is available yet.')}
        </p>
      ) : (
        <>
          {/* ── PC: 폭 100% 표(1558행) ── */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {/* 한글은 `break-keep`으로 단어 단위로만 끊는다 — 기본값은 글자 단위라 팀명이 쪼개진다 */}
                  <th
                    scope="col"
                    className="px-2.5 py-2.5 font-sans text-[11px] font-semibold break-keep text-muted"
                  >
                    {text('팀', 'Team')}
                  </th>
                  {columns.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="px-2.5 py-2.5 font-sans text-[11px] font-semibold break-keep text-muted"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shares.map((s) => (
                  // ⚠ 응답에 팀 ID가 없다(공개 화면이라 담지 않는다). 키는 팀명 + 합계로 만든다
                  <tr
                    key={`${s.teamName}-${s.totalAmount}`}
                    className="border-b border-line last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="px-2.5 py-3 font-sans text-[13px] font-bold break-keep text-ink"
                    >
                      {s.teamName}
                    </th>
                    {shareCells(s).map((cell, i) => (
                      <td key={columns[i]} className="px-2.5 py-3 text-[13px] text-ink">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 모바일: 행 하나 = 패널 하나(§5.21). 열 순서는 PC 표와 같다 ── */}
          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
            {shares.map((s) => (
              <li
                key={`${s.teamName}-${s.totalAmount}`}
                className="rounded-card border border-line bg-surface px-4 py-3"
              >
                <span className="block font-sans text-[13px] font-bold text-ink">{s.teamName}</span>
                {shareCells(s).map((cell, i) => (
                  <InfoRow key={columns[i]} label={columns[i]}>
                    {cell}
                  </InfoRow>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * release tx 패널 — `settlementStatus = RELEASED`이고 해시·링크가 둘 다 있을 때만 나온다(1572·1583행).
 * 값이 없으면 패널 자체를 감춘다. 이 화면에서 해시를 보여주는 유일한 자리다.
 */
function ReleaseTxPanel({ data }: { data: PublicSettlement }) {
  const { text } = useLocale()
  if (data.settlementStatus !== 'RELEASED') return null
  if (!data.releaseTxHash || !data.explorerUrl) return null

  return (
    <Panel title={text('정산금 지급 기록', 'Payout transaction')}>
      <InfoRow label={text('거래 번호', 'Transaction')}>
        <a
          href={data.explorerUrl}
          target="_blank"
          rel="noreferrer"
          title={data.releaseTxHash}
          // 44px 터치 타겟(1591행)
          className="inline-flex min-h-11 items-center font-mono text-[13px] text-primary underline underline-offset-2 md:min-h-0"
        >
          {shortenHex(data.releaseTxHash)}
        </a>
      </InfoRow>
      <p className="m-0 font-sans text-[11px] leading-relaxed text-muted md:text-xs">
        {text(
          '지급 기록은 누구나 확인할 수 있게 공개되어 있습니다. 위 번호를 누르면 기록 페이지가 열립니다.',
          'This payout record is public. Open the transaction above to inspect it.',
        )}
      </p>
    </Panel>
  )
}

function Skeleton() {
  const { text } = useLocale()
  return (
    <div
      aria-busy="true"
      aria-label={text('정산 결과를 불러오는 중', 'Loading settlement report')}
      className="flex flex-col gap-4"
    >
      <div className="h-20 animate-pulse rounded-card bg-ground-2" />
      <div className="flex flex-col gap-3 md:flex-row">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 flex-1 animate-pulse rounded-card bg-ground-2" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-card bg-ground-2" />
    </div>
  )
}

/**
 * 조회 실패 — 안내만 둔다. **버튼·링크를 두지 않는다**(1582행).
 * 다시 시도 버튼도 두지 않는다: 무효화된 토큰은 다시 눌러도 같은 404다.
 */
function NotAvailable({ error }: { error: PublicSettlementError }) {
  const { language } = useLocale()
  const localized =
    language === 'ko'
      ? shareErrorText(error)
      : error.code === 'COMMON_NOT_FOUND'
        ? {
            title: 'This settlement report is unavailable',
            body:
              error.msg ??
              'The link may have expired or been replaced. Ask the team that shared it for a new link.',
          }
        : {
            title: 'Could not load the settlement report',
            body: error.msg ?? `Try opening it again later. (code ${error.code})`,
          }
  return (
    <section
      role="alert"
      className="rounded-card border border-line bg-surface px-5 py-14 text-center"
    >
      <p className="m-0 mb-2 font-sans text-base font-semibold text-ink">{localized.title}</p>
      <p className="m-0 mx-auto max-w-[36ch] font-sans text-[13px] leading-relaxed text-muted">
        {localized.body}
      </p>
    </section>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

export function SettlementShareView({ data, loading = false, error }: Props) {
  const { text } = useLocale()
  const rate = data?.rate

  return (
    // 검증 V 화면군은 PC 우선(§1.5)이라 최대폭 960px 중앙 1열이다(1558행)
    <main className="settlement-share mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-6 md:gap-5 md:px-6 md:py-10">
      {/* 서비스 이름은 글자로만 둔다 — 홈으로 가는 링크를 두면 그것이 곧 유입 CTA가 된다 */}
      <p className="m-0 font-sans text-[11px] font-semibold tracking-wide text-muted">
        {text('불러요 정산 결과 공유', 'BULLEOYO settlement report')}
      </p>

      {loading ? (
        <Skeleton />
      ) : error || !data ? (
        <NotAvailable error={error ?? { code: 'COMMON_NOT_FOUND' }} />
      ) : (
        <>
          {/* 공연 정보 패널 + 정산 상태 배지 */}
          <header className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="m-0 font-sans text-lg font-bold break-keep text-ink md:text-2xl">
                {data.performanceTitle}
              </h1>
              <SettlementStatusBadge status={data.settlementStatus} />
            </div>
            <p className="m-0 mt-1 font-sans text-[13px] text-muted md:text-sm">
              {formatKst(data.performedAt)}
            </p>
          </header>

          {/* 매출 요약 패널 — 원 값이 먼저, 표시 환율 환산은 `≈`로 병기(§5.4) */}
          <section
            aria-label={text('매출 요약', 'Revenue summary')}
            className="flex flex-col gap-3 md:flex-row"
          >
            <SummaryTile
              label={text('티켓 판매 금액', 'Ticket sales')}
              amount={data.grossRevenueAmount}
              approx={formatApprox(data.grossRevenueAmount, rate)}
            />
            <SummaryTile
              label={text('환불 금액', 'Refunds')}
              amount={data.refundedAmount}
              approx={formatApprox(data.refundedAmount, rate)}
            />
            <SummaryTile
              label={text('나눌 금액', 'Net distribution')}
              amount={data.netRevenueAmount}
              approx={formatApprox(data.netRevenueAmount, rate)}
              strong
            />
          </section>

          {rate && (
            <p className="m-0 font-sans text-[11px] text-muted md:text-xs">
              {text('표시 환율', 'Display rate')} 1 {rate.currency} = {formatYoyo(rate.rate)} ·{' '}
              {text('기준', 'as of')} {formatKst(rate.asOf)} ·{' '}
              {text(
                '환산은 보기용이며 실제 지급 금액은 YoYo 그대로입니다.',
                'Conversion is for display only. Payouts remain in YoYo.',
              )}
            </p>
          )}

          {/* 배분 비율 안내 — bp를 %로 환산해 적는다(1570행) */}
          <p className="m-0 rounded-card border border-line bg-surface px-4 py-3 font-sans text-[13px] leading-relaxed text-ink md:px-5 md:text-sm">
            {text('나눌 금액은 참여한 팀들에게', 'Net revenue is split')}{' '}
            <strong>{bpToPercent(data.fixedRatioBp)}</strong>{' '}
            {text('기본 몫과', 'as a fixed share and')}{' '}
            <strong>{bpToPercent(data.selectionRatioBp)}</strong>{' '}
            {text('관객 선택 몫으로 나눕니다.', 'as an audience-choice share.')}
          </p>

          <TeamShareList data={data} />

          <ReleaseTxPanel data={data} />

          {/*
            가정 기반 시연 고지 — 접지 않고 항상 노출한다(1559·1573행).
            문구는 서버가 주는 `simulationNotice`를 그대로 쓴다. 값이 없으면 문장을 지어내지 않는다.
          */}
          {data.simulationNotice && (
            <p className="m-0 rounded-card border border-warning bg-surface px-4 py-3 font-sans text-[13px] leading-relaxed text-ink md:px-5">
              {data.simulationNotice}
            </p>
          )}

          {/*
            ⚠ `HALTED`에는 아무 문장도 덧붙이지 않는다 — 중단 사유 필드가 `SettlementPublic`
            스키마에 없어 사유를 지어낼 수 없다(1581행 `(확인 필요)`). 상태 배지가 "정산 중단"을 말한다.
            로그인·예매 유도는 어떤 상태에서도 두지 않는다(1549행). 하단 고정 액션도 없다(1554행).
          */}
        </>
      )}
    </main>
  )
}
