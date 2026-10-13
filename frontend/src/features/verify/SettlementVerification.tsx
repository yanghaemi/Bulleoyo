/**
 * V-01 정산 검증.
 *
 * 정본 — 화면설계 v6 §4 V-01(영역 구성·레이아웃·컴포넌트 표 11행·상태·입력 검증·접근성)
 *        · §5.3 tx 링크·주소 축약 · §5.13 KST 병기 · §5.4 금액 표기 · §5.21 표 → 패널 접기
 *        · §5.19 액션 버튼 배치(이 화면은 **하단 고정 액션이 없다**)
 *        · API 정본 verify_01 `GET /api/v1/performances/{performanceId}/verification`
 *          + coin_01 `GET /api/v1/coin/supply`(불변식 ①·④)
 *
 * 이 화면은 §1.2 원칙 2의 **명시적 예외**다 — 컨트랙트·토큰·이벤트·해시를 그대로 쓴다.
 * 참여팀 리더 전용이고 로그인이 필요하다.
 *
 * ── 이 화면이 지키는 정직성 규칙 ─────────────────────────────────────────
 * 온체인 대조 결과를 모를 때 **"일치한다"고 말하지 않는다.** `stale: true`(마지막 인덱싱 값을
 * 보는 중)이거나 coin/supply를 못 받았으면 그 행은 "판정 불가 / 대조 결과를 알 수 없습니다"다.
 * P-08 `SettlementDashboard`·P-07 `SalesStatus`가 쓰는 문구를 그대로 따랐다.
 *
 * ── 명세에 없어 해석한 것(전부 보고 목록에 있다) ──────────────────────────
 * ① **보증금 패널·release 패널·동의 tx 목록이 PC 2열 중 어느 쪽인지 레이아웃 항목에 없다.**
 *    레이아웃은 좌측에 "컨트랙트·토큰 주소·에스크로 잔액·잠긴 규칙·온체인 카운터", 우측에
 *    "팀별 산출액 표·재계산 위젯·불변식 대사 4행"만 정했다. 나머지 셋은 성격이 가까운 쪽에 붙였고
 *    **영역 구성의 순서는 각 열 안에서 유지**했다.
 * ② **`guarantees`·`simulationNotice`가 컴포넌트 표에 없다.** verify_01은 이 둘을 내려주는데
 *    화면 표에는 자리가 없다. 보장하지 않는 것을 감추면 이 화면의 목적과 어긋나므로 하단에 두되
 *    ⚠로 표시했다.
 * ③ **빈 상태의 "다음 단계 예정 시각"이 응답에 없다.** `performedAt`(공연 일시)만 있어 그것으로
 *    대신하고 화면에 근거를 적었다.
 *
 * 껍데기(헤더)는 페이지가 씌운다. 관객 하단 탭바는 쓰지 않는다.
 */

import { InvariantList } from '@/features/verify/InvariantList'
import { MatchBadge } from '@/features/verify/MatchBadge'
import { RecalculationWidget } from '@/features/verify/RecalculationWidget'
import { addressUrl, compareAddress, txUrl } from '@/features/verify/explorerLinks'
import type { AddressCheck } from '@/features/verify/explorerLinks'
import {
  buildVerificationInvariantRows,
  isGlobalInvariantBroken,
  signedAmount,
} from '@/features/verify/invariants'
import { bpToPercentLabel, draftFrom } from '@/features/verify/recalc'
import { verifyErrorView } from '@/features/verify/verifyErrors'
import type { CoinSupply, VerificationData } from '@/features/verify/verifyTypes'
import { config, isChainConfigured } from '@/shared/config'
import { useLocale } from '@/shared/i18n/useLocale'
import {
  Button,
  DepositStatusBadge,
  InfoRow,
  SettlementStatusBadge,
  formatYoyo,
  formatKst,
  shortenHex,
} from '@/shared/ui'
import type { DepositStatus } from '@/shared/ui'

import './operations-refresh.css'

/* ── 공통 조각 ────────────────────────────────────────────────────────── */

/** 패널 제목. 두 화면에서 같은 위계를 쓴다 */
function PanelTitle({ en, ko }: { en: string; ko: string }) {
  const { text } = useLocale()
  return (
    <h2 className="m-0 mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
      {text(ko, en)}
    </h2>
  )
}

const PANEL = 'rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4'

/**
 * 익스플로러 링크 — §5.3. 축약해 보여주고 새 창으로 연다.
 * `href`가 비면(익스플로러 주소를 모르면) 링크를 만들지 않고 축약 문자열만 남긴다.
 */
function ExplorerLink({ href, value, label }: { href: string; value: string; label: string }) {
  const { text } = useLocale()
  const short = shortenHex(value)
  if (!href) return <span className="font-mono text-[11px] text-ink md:text-xs">{short}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${label} ${short} — ${text('익스플로러에서 열기', 'Open in explorer')}`}
      className="inline-flex min-h-11 items-center font-mono text-[11px] text-primary underline underline-offset-2 transition-colors duration-150 ease-out hover:text-primary-bright md:min-h-0 md:text-xs"
    >
      {short}
    </a>
  )
}

/** 환경변수 대조 결과 한 마디 — V-01 컴포넌트 표 `[팀 9/2]` */
function AddressCheckNote({ check }: { check: AddressCheck }) {
  const { text } = useLocale()
  if (check === 'unset') {
    return (
      <span className="ml-1.5 font-sans text-[10px] text-muted">
        ⚠{' '}
        {text(
          '앱에 설정된 주소가 없어 대조하지 못했습니다',
          'No app address is configured for comparison',
        )}
      </span>
    )
  }
  if (check === 'same') {
    return (
      <span className="ml-1.5 font-sans text-[10px] text-ok">
        {text('앱 설정과 같음', 'Matches app configuration')}
      </span>
    )
  }
  return (
    <span className="ml-1.5 font-sans text-[10px] font-semibold text-danger">
      ⚠ {text('앱에 설정된 주소와 다릅니다', 'Does not match app configuration')}
    </span>
  )
}

/* ── 좌측 패널들 ──────────────────────────────────────────────────────── */

/** 컨트랙트·토큰 주소 패널 — 응답값과 프론트 환경변수를 화면에서 대조한다 */
function ContractPanel({ data }: { data: VerificationData }) {
  const { text } = useLocale()
  const { contracts } = data
  const explorer = contracts.explorerBaseUrl
  const tokenCheck = compareAddress(contracts.tokenAddress, config.chain.yoyoAddress)
  const splitterCheck = compareAddress(contracts.revenueSplitter, config.chain.splitterAddress)

  return (
    <section
      className={PANEL}
      aria-label={text('컨트랙트·토큰 주소', 'Contracts and token addresses')}
    >
      <PanelTitle en="Contracts" ko="컨트랙트·토큰 주소" />

      {!isChainConfigured && (
        // `shared/config`의 규칙 — 주소가 비면 "체인 설정 대기"를 알린다
        <p className="m-0 mb-2 rounded-card border border-line bg-ground px-3 py-2 font-sans text-[11px] text-muted">
          {text(
            '이 앱에 컨트랙트 주소가 설정되지 않아 응답값과 대조하지 못했습니다.',
            'Contract addresses are not configured in this app, so the response cannot be compared.',
          )}
        </p>
      )}

      <InfoRow label={text(`${contracts.tokenSymbol} 토큰`, `${contracts.tokenSymbol} token`)}>
        <ExplorerLink
          href={addressUrl(explorer, contracts.tokenAddress)}
          value={contracts.tokenAddress}
          label={text('토큰 주소', 'Token address')}
        />
        <AddressCheckNote check={tokenCheck} />
      </InfoRow>
      <InfoRow label={text('정산 컨트랙트', 'Settlement contract')}>
        <ExplorerLink
          href={addressUrl(explorer, contracts.revenueSplitter)}
          value={contracts.revenueSplitter}
          label={text('정산 컨트랙트 주소', 'Settlement contract address')}
        />
        <AddressCheckNote check={splitterCheck} />
      </InfoRow>
      <InfoRow label={text('네트워크', 'Network')}>
        <span className="font-mono text-[11px] md:text-xs">
          {data.network} · chainId {data.chainId} (0x{data.chainId.toString(16)})
        </span>
      </InfoRow>
      <InfoRow label={text('소수 자리', 'Decimals')}>
        <span className="font-num tabular-nums">
          {contracts.tokenDecimals} — {text('금액은 YoYo 정수입니다', 'Amounts use whole YoYo units')}
        </span>
      </InfoRow>
    </section>
  )
}

/** 에스크로 잔액 패널 — 불변식 ②의 수치를 그대로 나열한다 */
function EscrowPanel({ data }: { data: VerificationData }) {
  const { text } = useLocale()
  const esc = data.escrowReconciliation
  const row = buildVerificationInvariantRows(data)[1]
  const state = row.state
  const diff = row.diff

  return (
    <section className={PANEL} aria-label={text('에스크로 잔액', 'Escrow balance')}>
      <div className="mb-2 flex items-center gap-2">
        <PanelTitle en="Escrow" ko="에스크로 잔액" />
        <span className="mb-2 ml-auto">
          <MatchBadge state={state} />
        </span>
      </div>

      <InfoRow label="escrowOf">
        {data.stale || esc.escrowBalanceOnchain == null ? '—' : formatYoyo(esc.escrowBalanceOnchain)}
      </InfoRow>
      <InfoRow label="Σ purchase">{formatYoyo(esc.purchasedTotal)}</InfoRow>
      <InfoRow label="Σ refund">{formatYoyo(esc.refundedTotal)}</InfoRow>
      <InfoRow label="Σ release">
        {esc.releasedTotal == null ? '—' : formatYoyo(esc.releasedTotal)}
      </InfoRow>
      <InfoRow label={text('기대 잔액', 'Expected balance')}>
        {esc.expectedEscrowBalance == null ? '—' : formatYoyo(esc.expectedEscrowBalance)}
      </InfoRow>
      {diff != null && diff !== 0 && (
        <InfoRow label={text('차액', 'Difference')}>{signedAmount(diff)}</InfoRow>
      )}

      {data.stale && (
        <p className="m-0 mt-1 font-sans text-[11px] font-semibold text-ink md:text-xs">
          {text('대조 결과를 알 수 없습니다', 'The reconciliation result is unavailable')}
          <span className="font-normal text-muted">
            {' '}
            ·{' '}
            {text(
              '체인 조회가 지연돼 마지막 인덱싱 값을 보고 있습니다',
              'Chain reads are delayed, so this is the latest indexed value',
            )}
          </span>
        </p>
      )}

      <p className="m-0 mt-1 font-mono text-[10px] leading-4 text-faint md:text-[11px]">
        {esc.note}
      </p>
    </section>
  )
}

/** 잠긴 규칙 패널 — 1단계·2단계 비율, 규칙 해시, dust 귀속 규칙 */
function LockedRulePanel({ data }: { data: VerificationData }) {
  const { language, text } = useLocale()
  const rule = data.lockedRule
  const input = data.recalculationInput
  const explorer = data.contracts.explorerBaseUrl
  const teamName = (teamId: number) =>
    data.shares.find((s) => s.teamId === teamId)?.teamName ??
    data.agreements.find((a) => a.teamId === teamId)?.teamName ??
    text(`팀 ${teamId}`, `Team ${teamId}`)

  return (
    <section className={PANEL} aria-label={text('잠긴 규칙', 'Locked rule')}>
      <div className="mb-2 flex items-center gap-2">
        <PanelTitle en="Locked rule" ko="잠긴 규칙" />
        <span className="mb-2 ml-auto">
          {/* 규칙 해시 대조는 응답이 `hashMatched`로 준다. stale이면 온체인 해시도 캐시값이다 */}
          <MatchBadge
            state={data.stale ? 'unknown' : rule.hashMatched ? 'matched' : 'mismatched'}
          />
        </span>
      </div>

      <InfoRow label={text('1단계', 'Step 1')}>
        {text('고정', 'Fixed')} {bpToPercentLabel(rule.raw.fixedRatioBp)}
        {` (bp_f ${rule.raw.fixedRatioBp}) · `}
        {text('관객 선택', 'Audience choice')} {bpToPercentLabel(rule.raw.selectionRatioBp)}
        {` (bp_s ${rule.raw.selectionRatioBp})`}
      </InfoRow>
      <InfoRow label={text('2단계', 'Step 2')}>
        <span className="flex flex-col gap-0.5">
          {rule.raw.teamShares.map((s) => (
            <span key={s.teamId}>
              {teamName(s.teamId)} {bpToPercentLabel(s.shareBp)}
              <span className="text-muted"> (w_i {s.shareBp})</span>
            </span>
          ))}
        </span>
      </InfoRow>
      <InfoRow label={text('규칙 해시', 'Rules hash')}>
        <span className="font-mono text-[11px] md:text-xs">{shortenHex(rule.rulesHash)}</span>
      </InfoRow>
      <InfoRow label={text('온체인 해시', 'On-chain hash')}>
        <span className="font-mono text-[11px] md:text-xs">
          {data.stale ? '—' : shortenHex(rule.onchainRulesHash)}
        </span>
      </InfoRow>
      <InfoRow label={text('dust 귀속', 'Remainder recipient')}>
        {input.remainderRule} → {teamName(input.hostTeamId)}
      </InfoRow>
      <InfoRow label={text('반올림', 'Rounding')}>{input.roundingRule}</InfoRow>
      <InfoRow label={text('잠근 시각', 'Locked at')}>
        <span className="font-mono">{formatKst(rule.lockedAt, undefined, language)}</span>
      </InfoRow>
      <InfoRow label={text('판매 시작 tx', 'Sale-start transaction')}>
        <ExplorerLink
          href={txUrl(explorer, rule.startSaleTxHash)}
          value={rule.startSaleTxHash}
          label={text('판매 시작 tx', 'Sale-start transaction')}
        />
      </InfoRow>
    </section>
  )
}

/** 팀별 동의 tx 목록 — §5.21(PC 표 / 모바일 패널). 열 순서를 두 폭에서 같게 둔다 */
function AgreementList({ data }: { data: VerificationData }) {
  const { language, text } = useLocale()
  const explorer = data.contracts.explorerBaseUrl
  const agreementColumns = [
    text('리더 지갑', 'Leader wallet'),
    text('동의 tx', 'Agreement transaction'),
    text('동의 시각', 'Agreed at'),
  ] as const
  const sectionLabel = text('팀별 동의 tx', 'Team agreement transactions')

  if (data.agreements.length === 0) {
    return (
      <section className={PANEL} aria-label={sectionLabel}>
        <PanelTitle en="Agreements" ko="팀별 동의 tx" />
        <p role="status" className="m-0 py-6 text-center font-sans text-[13px] text-muted">
          {text('동의 기록이 없습니다', 'No agreement records yet')}
        </p>
      </section>
    )
  }

  return (
    <section aria-label={sectionLabel}>
      <PanelTitle en="Agreements" ko="팀별 동의 tx" />

      {/* PC: 표 */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
              >
                {text('팀명', 'Team')}
              </th>
              {agreementColumns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.agreements.map((a) => (
              <tr key={a.teamId} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-4 py-3 font-sans text-[13px] font-bold text-ink">
                  {a.teamName}
                  {/* 누가 서명했는지 — 운영자 대리 서명이면 그 사실을 감추지 않는다 */}
                  <span className="ml-1.5 font-sans text-[10px] font-normal text-muted">
                    {a.signerType === 'USER'
                      ? text('리더 서명', 'Leader signature')
                      : text('운영자 실행', 'Operator action')}
                  </span>
                </th>
                <td className="px-4 py-3">
                  <ExplorerLink
                    href={addressUrl(explorer, a.walletAddress)}
                    value={a.walletAddress}
                    label={text('리더 지갑 주소', 'Leader wallet address')}
                  />
                </td>
                <td className="px-4 py-3">
                  <ExplorerLink
                    href={txUrl(explorer, a.txHash)}
                    value={a.txHash}
                    label={text('동의 tx', 'Agreement transaction')}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-ink">
                  {formatKst(a.agreedAt, undefined, language)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 행 하나 = 패널 하나(§5.21). 열 순서는 PC와 같다 */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {data.agreements.map((a) => (
          <li key={a.teamId} className="rounded-card border border-line bg-surface px-4 py-3">
            <span className="block font-sans text-[13px] font-bold text-ink">
              {a.teamName}
              <span className="ml-1.5 font-sans text-[10px] font-normal text-muted">
                {a.signerType === 'USER'
                  ? text('리더 서명', 'Leader signature')
                  : text('운영자 실행', 'Operator action')}
              </span>
            </span>
            <InfoRow label={agreementColumns[0]}>
              <ExplorerLink
                href={addressUrl(explorer, a.walletAddress)}
                value={a.walletAddress}
                label={text('리더 지갑 주소', 'Leader wallet address')}
              />
            </InfoRow>
            <InfoRow label={agreementColumns[1]}>
              <ExplorerLink
                href={txUrl(explorer, a.txHash)}
                value={a.txHash}
                label={text('동의 tx', 'Agreement transaction')}
              />
            </InfoRow>
            <InfoRow label={agreementColumns[2]}>
              <span className="font-mono text-[11px]">
                {formatKst(a.agreedAt, undefined, language)}
              </span>
            </InfoRow>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 온체인 선택 카운터 패널 — 팀별 선택 수·유효 티켓 수·총 매출 */
function CounterPanel({ data }: { data: VerificationData }) {
  const { text, language } = useLocale()
  const input = data.recalculationInput
  const teamName = (teamId: number) =>
    data.shares.find((s) => s.teamId === teamId)?.teamName ?? text(`팀 ${teamId}`, `Team ${teamId}`)
  const countLabel = (value: number) =>
    language === 'ko' ? `${value.toLocaleString('ko-KR')}건` : value.toLocaleString('en-US')

  return (
    <section className={PANEL} aria-label={text('온체인 선택 카운터', 'On-chain counters')}>
      <PanelTitle en="On-chain counters" ko="온체인 선택 카운터" />
      <p className="m-0 mb-1.5 font-sans text-[11px] text-muted">
        {text(
          'Purchased 이벤트 합에서 Refunded를 뺀 값입니다.',
          'Purchased events minus Refunded events.',
        )}
      </p>
      {data.onchainCounters.map((c) => (
        <InfoRow key={c.teamId} label={teamName(c.teamId)}>
          <span className="font-num tabular-nums">
            {c.choiceCount == null ? '—' : countLabel(c.choiceCount)}
          </span>
          <span className="ml-1.5 text-[10px] text-muted">index {c.teamIndex}</span>
        </InfoRow>
      ))}
      <InfoRow label={text('선택 합', 'Audience choices')}>
        <span className="font-num tabular-nums">{countLabel(input.totalChoiceCount)}</span>
      </InfoRow>
      <InfoRow label={text('총 매출', 'Gross revenue')}>
        {formatYoyo(input.grossRevenueAmount)}
      </InfoRow>
      <InfoRow label={text('환불', 'Refunds')}>{formatYoyo(input.refundedAmount)}</InfoRow>
      <InfoRow label={text('분배 대상', 'Distributable')}>
        {input.distributableAmount == null ? '—' : formatYoyo(input.distributableAmount)}
      </InfoRow>
    </section>
  )
}

/** 보증금 패널 — 예치 tx·반환 tx·상태. 보증금은 에스크로와 **별도 계정**이다 */
function DepositPanel({ data }: { data: VerificationData }) {
  const { text } = useLocale()
  const dep = data.depositReconciliation
  const explorer = data.contracts.explorerBaseUrl
  /**
   * ⚠ 스키마의 `status`가 자유 문자열이라 §5.1의 세 값이 아닌 값이 올 수 있다.
   * 아는 값이면 배지를, 모르는 값이면 문자열을 그대로 노출한다 — 임의로 매핑하지 않는다.
   */
  const known: DepositStatus[] = ['UNPAID', 'PAID', 'RETURNED']
  const isKnown = (known as string[]).includes(dep.status)

  return (
    <section className={PANEL} aria-label={text('보증금', 'Deposit')}>
      <div className="mb-2 flex items-center gap-2">
        <PanelTitle en="Deposit" ko="보증금" />
        <span className="mb-2 ml-auto">
          <MatchBadge
            state={
              data.stale || dep.matched == null ? 'unknown' : dep.matched ? 'matched' : 'mismatched'
            }
          />
        </span>
      </div>
      <InfoRow label={text('상태', 'Status')}>
        {isKnown ? (
          <DepositStatusBadge status={dep.status as DepositStatus} />
        ) : (
          <span className="font-mono text-[11px]">{dep.status}</span>
        )}
      </InfoRow>
      <InfoRow label={text('금액', 'Amount')}>{formatYoyo(dep.amount)}</InfoRow>
      <InfoRow label={text('예치 tx', 'Deposit transaction')}>
        <ExplorerLink
          href={txUrl(explorer, dep.paidTxHash)}
          value={dep.paidTxHash}
          label={text('예치 tx', 'Deposit transaction')}
        />
      </InfoRow>
      <InfoRow label={text('반환 tx', 'Return transaction')}>
        {dep.returnTxHash ? (
          <ExplorerLink
            href={txUrl(explorer, dep.returnTxHash)}
            value={dep.returnTxHash}
            label={text('반환 tx', 'Return transaction')}
          />
        ) : (
          '—'
        )}
      </InfoRow>
    </section>
  )
}

/* ── 우측: 팀별 산출액 · release ──────────────────────────────────────── */

/** 팀별 산출액·입금 주소 목록. 종단 표시는 **수령 완료(`released`)** 다 */
function ShareList({ data }: { data: VerificationData }) {
  const { language, text } = useLocale()
  const explorer = data.contracts.explorerBaseUrl
  const receiptOf = (teamId: number) => data.receiptSummary.find((r) => r.teamId === teamId)
  const shareColumns = [
    text('입금 지갑', 'Payout wallet'),
    text('고정분', 'Fixed share'),
    text('관객 선택분', 'Audience share'),
    text('dust', 'Remainder'),
    text('최종 분배액', 'Total payout'),
    text('수령', 'Receipt'),
  ] as const
  const sectionLabel = text('팀별 산출액', 'Team payouts')

  if (data.shares.length === 0) {
    return (
      <section aria-label={sectionLabel}>
        <PanelTitle en="Team shares" ko="팀별 산출액·입금 주소" />
        <p
          role="status"
          className="m-0 rounded-card border border-line bg-surface px-4 py-10 text-center font-sans text-[13px] text-muted"
        >
          {text('아직 산출된 분배액이 없습니다', 'No calculated payouts yet')}
        </p>
      </section>
    )
  }

  /** 수령 여부 한 마디. §5.1 `settlement_share` 라벨(지급 대기 / 수령 완료) 그대로 */
  const receiptLabel = (teamId: number) => {
    const r = receiptOf(teamId)
    if (!r) return '—'
    if (!r.received) return text('지급 대기', 'Pending')
    return r.receivedAt
      ? `${text('수령 완료', 'Received')} · ${formatKst(r.receivedAt, undefined, language)}`
      : text('수령 완료', 'Received')
  }

  return (
    <section aria-label={sectionLabel}>
      <PanelTitle en="Team shares" ko="팀별 산출액·입금 주소" />

      {/* PC: 표. **가로 스크롤 없이 열 폭을 나눈다**(V-01 레이아웃) */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="px-3 py-2.5 font-sans text-[11px] font-semibold text-muted"
              >
                {text('팀명', 'Team')}
              </th>
              {shareColumns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="px-3 py-2.5 font-sans text-[11px] font-semibold text-muted"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.shares.map((s) => {
              const receipt = receiptOf(s.teamId)
              return (
                <tr key={s.teamId} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-3 py-3 font-sans text-[13px] font-bold text-ink">
                    {s.teamName}
                  </th>
                  <td className="px-3 py-3">
                    {receipt ? (
                      <ExplorerLink
                        href={addressUrl(explorer, receipt.walletAddress)}
                        value={receipt.walletAddress}
                        label={text('입금 지갑 주소', 'Payout wallet address')}
                      />
                    ) : (
                      // 입금 주소는 `receiptSummary`에만 있다. 없으면 만들어 내지 않는다
                      <span className="font-mono text-[11px] text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-num text-[13px] tabular-nums text-ink">
                    {formatYoyo(s.fixedAmount)}
                  </td>
                  <td className="px-3 py-3 font-num text-[13px] tabular-nums text-ink">
                    {formatYoyo(s.choiceAmount)}
                  </td>
                  <td className="px-3 py-3 font-num text-[13px] tabular-nums text-ink">
                    {formatYoyo(s.dustAmount)}
                  </td>
                  <td className="px-3 py-3 font-num text-[13px] font-bold tabular-nums text-ink">
                    {formatYoyo(s.totalAmount)}
                  </td>
                  <td className="px-3 py-3 font-sans text-[11px] text-ink">
                    {receiptLabel(s.teamId)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일: 팀별 패널(§5.21). 열 순서는 PC 표와 같다 */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {data.shares.map((s) => {
          const r = receiptOf(s.teamId)
          return (
            <li key={s.teamId} className="rounded-card border border-line bg-surface px-4 py-3">
              <span className="block font-sans text-[13px] font-bold text-ink">{s.teamName}</span>
              <InfoRow label={shareColumns[0]}>
                {r ? (
                  <ExplorerLink
                    href={addressUrl(explorer, r.walletAddress)}
                    value={r.walletAddress}
                    label={text('입금 지갑 주소', 'Payout wallet address')}
                  />
                ) : (
                  '—'
                )}
              </InfoRow>
              <InfoRow label={shareColumns[1]}>{formatYoyo(s.fixedAmount)}</InfoRow>
              <InfoRow label={shareColumns[2]}>{formatYoyo(s.choiceAmount)}</InfoRow>
              <InfoRow label={shareColumns[3]}>{formatYoyo(s.dustAmount)}</InfoRow>
              <InfoRow label={shareColumns[4]}>
                <span className="font-bold">{formatYoyo(s.totalAmount)}</span>
              </InfoRow>
              <InfoRow label={shareColumns[5]}>{receiptLabel(s.teamId)}</InfoRow>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** release tx · `Released(showId, teamWallet, amount)` 이벤트 목록 */
function ReleasePanel({ data }: { data: VerificationData }) {
  const { language, text } = useLocale()
  const rel = data.releaseReconciliation
  const explorer = data.contracts.explorerBaseUrl
  const tx = data.releaseTx

  return (
    <section
      className={PANEL}
      aria-label={text('release tx·Released 이벤트', 'Release transaction and events')}
    >
      <div className="mb-2 flex items-center gap-2">
        <PanelTitle en="Release" ko="release tx · Released 이벤트" />
        <span className="mb-2 ml-auto">
          <MatchBadge state={buildVerificationInvariantRows(data)[2].state} />
        </span>
      </div>

      <InfoRow label="release tx">
        {tx?.txHash ? (
          <ExplorerLink
            // 응답이 완성된 URL을 주면 그것을 쓴다 — 화면이 다시 조립하지 않는다
            href={tx.explorerUrl || txUrl(explorer, tx.txHash)}
            value={tx.txHash}
            label="release tx"
          />
        ) : (
          '—'
        )}
      </InfoRow>
      <InfoRow label={text('확정 시각', 'Confirmed at')}>
        {tx?.releasedAt ? (
          <span className="font-mono">{formatKst(tx.releasedAt, undefined, language)}</span>
        ) : (
          '—'
        )}
      </InfoRow>
      <InfoRow label="Σ Released">
        {rel.releasedEventTotal == null ? '—' : formatYoyo(rel.releasedEventTotal)}
      </InfoRow>
      <InfoRow label={text('재계산 합', 'Recalculated total')}>
        {rel.recalculatedTotal == null ? '—' : formatYoyo(rel.recalculatedTotal)}
      </InfoRow>
      <InfoRow label={text('차액', 'Difference')}>
        {data.stale || rel.difference == null ? '—' : signedAmount(rel.difference)}
      </InfoRow>

      {rel.releasedEvents.length > 0 && (
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 border-t border-line pt-2 p-0">
          {rel.releasedEvents.map((e) => (
            <li
              key={`${e.teamWallet}-${e.amount}`}
              className="flex flex-wrap items-center gap-x-2 font-sans text-[11px] text-muted md:text-xs"
            >
              <span className="font-mono">Released</span>
              <ExplorerLink
                href={addressUrl(explorer, e.teamWallet)}
                value={e.teamWallet}
                label={text('수령 지갑 주소', 'Recipient wallet address')}
              />
              <span className="font-num tabular-nums text-ink">{formatYoyo(e.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ── 상태 화면 ────────────────────────────────────────────────────────── */

/** V-01 **상태** — 로딩은 스켈레톤. PC 2열 골격과 같은 자리를 잡는다 */
function Skeleton() {
  const { text } = useLocale()
  return (
    <div
      aria-busy="true"
      aria-label={text('정산 검증 데이터를 불러오는 중', 'Loading settlement verification')}
      className="grid gap-4 md:grid-cols-2 md:gap-6"
    >
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-card bg-ground-2" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-card bg-ground-2" />
        ))}
      </div>
    </div>
  )
}

/**
 * 에러 화면.
 *
 * `denied`(403)에서는 **데이터를 일절 노출하지 않는다** — V-01 상태 항목의 명시 요구다.
 * 그래서 이 컴포넌트는 `data`를 아예 받지 않는다(실수로 새어 나갈 자리를 없앤다).
 */
function ErrorPanel({
  code,
  msg,
  onRetry,
  onSignIn,
}: {
  code: string
  msg?: string
  onRetry?: () => void
  onSignIn?: () => void
}) {
  const { text } = useLocale()
  const view = verifyErrorView(code)
  return (
    <section
      role="alert"
      className={`rounded-card border bg-surface px-4 py-10 text-center ${
        view.kind === 'denied' ? 'border-line' : 'border-danger'
      }`}
    >
      <p className="m-0 mb-1 font-sans text-sm font-semibold text-ink">{view.title}</p>
      {view.hint && <p className="m-0 mb-1 font-sans text-[13px] text-muted">{view.hint}</p>}
      {/* 서버 msg는 그대로 노출한다(§5.5). 분기에는 쓰지 않는다 */}
      {msg && <p className="m-0 mb-4 font-sans text-[13px] text-muted">{msg}</p>}
      {view.kind === 'retry' && onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {text('다시 시도', 'Retry')}
        </Button>
      )}
      {view.kind === 'signin' && onSignIn && (
        <Button onClick={onSignIn}>{text('로그인하러 가기', 'Sign in')}</Button>
      )}
    </section>
  )
}

/** 빈 상태 — 정산 전 단계 */
function EmptyState({ data }: { data: VerificationData }) {
  const { language, text } = useLocale()
  return (
    <section
      role="status"
      className="rounded-card border border-line bg-surface px-4 py-10 text-center"
    >
      <p className="m-0 mb-2 font-sans text-sm font-semibold text-ink">
        {text('아직 정산 데이터가 없습니다', 'Settlement data is not available yet')}
      </p>
      <p className="m-0 font-sans text-[13px] text-muted">
        {text('현재 단계', 'Current stage')}{' '}
        <SettlementStatusBadge status={data.settlementStatus} />
      </p>
      {/*
        ⚠ "다음 단계 예정 시각"이 응답에 없다. 공연이 끝난 뒤에 집계가 열리므로
        `performedAt`(공연 일시)을 근거로 적고, 그것이 근거임을 문장으로 밝힌다.
      */}
      <p className="m-0 mt-1 font-sans text-[13px] text-muted">
        {text('공연 일시', 'Show time')}{' '}
        <span className="font-mono">{formatKst(data.performedAt, undefined, language)}</span> —{' '}
        {text('공연이 끝난 뒤 집계가 열립니다', 'Aggregation opens after the show ends')}
      </p>
    </section>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  data?: VerificationData
  /**
   * 불변식 ①·④의 소스. **없으면 그 두 행은 판정 불가**다(V-01 컴포넌트 표:
   * "④는 전역 값이므로 V-02와 같은 소스를 쓴다").
   */
  supply?: CoinSupply
  loading?: boolean
  /** 실패 응답의 `code`. 있으면 에러 화면을 그린다 */
  errorCode?: string
  /** 실패 응답의 `msg`. 그대로 노출한다(§5.5) */
  errorMsg?: string
  onRetry?: () => void
  onSignIn?: () => void
  /** 발행량·에스크로 공시(V-02)로 이동 */
  onOpenSupply?: () => void
}

export function SettlementVerification({
  data,
  supply,
  loading = false,
  errorCode,
  errorMsg,
  onRetry,
  onSignIn,
  onOpenSupply,
}: Props) {
  const { language, text } = useLocale()
  // 하단 고정 액션이 없는 화면이다(V-01 영역 구성) — 바닥 여백을 비워 두지 않는다
  const frame = 'mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 pt-3 pb-10 md:gap-6 md:px-6'

  if (loading) {
    return (
      <div className={`evidence-workbench ${frame}`}>
        <Skeleton />
      </div>
    )
  }

  if (errorCode || !data) {
    return (
      <div className={`evidence-workbench ${frame}`}>
        <ErrorPanel
          code={errorCode ?? 'COMMON_INTERNAL_ERROR'}
          msg={errorMsg}
          onRetry={onRetry}
          onSignIn={onSignIn}
        />
      </div>
    )
  }

  const rows = buildVerificationInvariantRows(data, supply)
  const halted = isGlobalInvariantBroken(rows)
  const settled = data.settlementStatus !== 'NONE'

  const recalcDraft = draftFrom({
    fixedRatioBp: data.recalculationInput.fixedRatioBp,
    selectionRatioBp: data.recalculationInput.selectionRatioBp,
    distributableAmount: data.recalculationInput.distributableAmount,
    teams: data.recalculationInput.teamShares.map((s) => ({
      teamId: s.teamId,
      teamName:
        data.shares.find((x) => x.teamId === s.teamId)?.teamName ??
        text(`팀 ${s.teamId}`, `Team ${s.teamId}`),
      shareBp: s.shareBp,
      choiceCount: data.onchainCounters.find((c) => c.teamId === s.teamId)?.choiceCount ?? null,
    })),
  })

  return (
    <div className={`evidence-workbench ${frame}`}>
      {/* ── 헤더: 공연명 · 타이틀 · 참여팀 전용 배지 ── */}
      <header className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
            {text('정산 검증', 'Settlement verification')}
          </p>
          <h1 className="m-0 font-sans text-xl font-bold text-ink md:text-2xl">
            {data.performanceTitle}
          </h1>
        </div>
        <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip bg-sel-soft px-2 font-sans text-[11px] font-semibold tracking-tight text-ink">
          {text('참여팀 전용', 'Participating teams only')}
        </span>
        <SettlementStatusBadge status={data.settlementStatus} />
        <span className="w-full font-sans text-[11px] text-muted md:ml-auto md:w-auto md:text-xs">
          {text('갱신 시각', 'Updated')}{' '}
          <span className="font-mono">{formatKst(data.refreshedAt, undefined, language)}</span>
        </span>
      </header>

      {/* ── 상단 배너 ── */}
      {halted && (
        // V-01 상태 항목의 문구 그대로. ①·④가 깨진 상태다(M-03에서 처리)
        <p
          role="alert"
          className="m-0 rounded-card border border-danger bg-surface px-4 py-3 font-sans text-[13px] font-semibold text-ink md:text-sm"
        >
          {text(
            '관리자 확인 중 — 지급·release 중단',
            'Under admin review — payouts and release are paused',
          )}
          <span className="ml-1 font-normal text-muted">
            · {text('발행량 대사(①·④)가 어긋났습니다', 'Supply checks ① and ④ do not match')}
          </span>
        </p>
      )}

      {data.stale && (
        <p
          role="status"
          className="m-0 rounded-card border border-line bg-surface px-4 py-3 font-sans text-[13px] font-semibold text-ink md:text-sm"
        >
          <span aria-hidden>⚠ </span>
          {text(
            '체인 조회가 지연돼 마지막 인덱싱 값을 보고 있습니다',
            'Chain reads are delayed, so this is the latest indexed value',
          )}
          <span className="ml-1 font-normal text-muted">
            · {text('온체인 대조 결과를 알 수 없습니다', 'The on-chain comparison is unavailable')}
          </span>
        </p>
      )}

      {!settled ? (
        <EmptyState data={data} />
      ) : (
        <>
          {/*
            PC 2열(V-01 레이아웃). 좌측 = 컨트랙트·에스크로·잠긴 규칙·카운터 계열,
            우측 = 팀별 산출액·재계산·불변식. 모바일은 1열이며 영역 구성 순서대로 이어진다.
          */}
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <div className="flex min-w-0 flex-col gap-4 md:gap-6">
              <ContractPanel data={data} />
              <EscrowPanel data={data} />
              <LockedRulePanel data={data} />
              <AgreementList data={data} />
              <CounterPanel data={data} />
              <DepositPanel data={data} />
            </div>

            <div className="flex min-w-0 flex-col gap-4 md:gap-6">
              <ShareList data={data} />
              <ReleasePanel data={data} />
              <RecalculationWidget
                key={JSON.stringify([
                  data.performanceId,
                  recalcDraft,
                  data.shares,
                  data.recalculationInput.hostTeamId,
                ])}
                initialDraft={recalcDraft}
                hostTeamId={data.recalculationInput.hostTeamId}
                serverShares={data.shares}
                roundingRule={data.recalculationInput.roundingRule}
                remainderRule={data.recalculationInput.remainderRule}
              />
              <InvariantList rows={rows} />
            </div>
          </div>

          {/*
            ⚠ `guarantees`·`simulationNotice`는 V-01 컴포넌트 표에 없다. verify_01이 내려주는
            값이고, "보장하지 않는 것"을 감추면 이 화면의 목적과 어긋나므로 하단에 뒀다.
          */}
          <section className={PANEL} aria-label={text('보장 범위', 'Verification scope')}>
            <PanelTitle en="Scope" ko="이 검증이 보장하는 것·보장하지 않는 것" />
            <p className="m-0 mb-1 font-sans text-[11px] font-semibold text-ink md:text-xs">
              {text('보장합니다', 'Verified')}
            </p>
            <ul className="m-0 mb-2 list-disc pl-5">
              {data.guarantees.guaranteed.map((g) => (
                <li key={g} className="font-sans text-[11px] text-muted md:text-xs">
                  {g}
                </li>
              ))}
            </ul>
            <p className="m-0 mb-1 font-sans text-[11px] font-semibold text-ink md:text-xs">
              {text('보장하지 않습니다', 'Not verified')}
            </p>
            <ul className="m-0 list-disc pl-5">
              {data.guarantees.notGuaranteed.map((g) => (
                <li key={g} className="font-sans text-[11px] text-muted md:text-xs">
                  {g}
                </li>
              ))}
            </ul>
            <p className="m-0 mt-2 font-sans text-[11px] text-muted md:text-xs">
              {data.simulationNotice}
            </p>
          </section>
        </>
      )}

      {/* 발행량·에스크로 공시 링크 — V-02로 */}
      <div className="flex justify-center md:justify-end">
        <Button variant="secondary" onClick={onOpenSupply}>
          {text('발행량·에스크로 공시', 'Coin supply & escrow')}
        </Button>
      </div>
    </div>
  )
}
