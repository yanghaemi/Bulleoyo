/**
 * M-03 발행량 상태 패널 · 중단 배너.
 *
 * 정본 — 화면설계 v6 §4 M-03(1576행~) 컴포넌트 표 1·2행 · V-02(1483행~) "발행량 구성 패널"·
 *        "불변식 4행 목록"(M-03 표가 "V-02와 같은 값"이라고 명시) · §5.3 tx·주소 축약 ·
 *        §5.13 KST 병기 · §5.17(M-03 중단 배너는 스크롤 고정 예외)
 *        API — `coin_01 GET /api/v1/coin/supply` → `CoinSupply`
 *
 * 이 패널은 **조회 전용**이다. 값을 바꾸는 것은 지급 폼뿐이고, 여기서는 새로고침만 한다.
 *
 * 숫자를 색으로 꾸미지 않는다. 불일치는 **배지 문구와 배너 위치**로 알린다
 * (M-03 접근성 항목: "중단 경고는 색이 아니라 문구와 배너 위치로 구분한다").
 */

import {
  AdminErrorPanel,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminSkeleton,
  TxLink,
} from '@/features/admin/AdminStates'
import {
  INVARIANT_TITLE,
  adminFailureText,
  invariantDiffText,
} from '@/features/admin/adminMessages'
import type { AdminError, CoinSupply } from '@/features/admin/adminTypes'
import { haltStateOf } from '@/features/admin/haltState'
import { SupplyCompositionChart } from '@/shared/charts'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, Money, formatYoyo, formatKst } from '@/shared/ui'

const INVARIANT_TITLE_EN: Record<string, string> = {
  SUPPLY_EQUALS_GRANTS: 'Supply equals confirmed grants',
  ESCROW_EQUALS_SHOWS: 'Escrow equals show balances',
  SETTLEMENT_RECALC_MATCHES: 'Settlement recalculation matches',
  SUPPLY_EQUALS_WALLETS_PLUS_ESCROW: 'Supply equals wallets plus escrow',
}

/**
 * 발행량 상태 패널 — 총 발행량 · 에스크로 합계 · 지갑 보유 합계 · 갱신 시각 · 불변식 4행.
 *
 * 세 값의 관계(`totalSupply = escrowTotal + walletTotal`)를 한 줄로 함께 적는다(V-02 표).
 *
 * ⚠ 환산 병기(§5.4)는 `totalSupply`에만 붙는다. `coin_01`의 `display`는 총 발행량 하나에
 *   대한 환산이고(예시 5,290,000 ÷ 1,350 = 3,918.52), 에스크로·지갑 보유용 `display`는 응답에 없다.
 *   §5.4가 "클라이언트가 환율을 재계산하지 않는다"고 정했으므로 나머지 둘은 원 값만 보여준다.
 */
export function CoinSupplyPanel({
  loading,
  error,
  supply,
  refreshing,
  onRefresh,
}: {
  loading: boolean
  error?: AdminError | null
  supply: CoinSupply | null
  refreshing?: boolean
  onRefresh: () => void
}) {
  const { language, text } = useLocale()

  if (loading) {
    return (
      <AdminPanel title={text('발행량 상태', 'Supply status')}>
        <AdminSkeleton label={text('발행량을 불러오는 중', 'Loading supply')} rows={2} />
      </AdminPanel>
    )
  }

  if (error || !supply) {
    return (
      <AdminPanel title={text('발행량 상태', 'Supply status')}>
        <AdminErrorPanel
          title={text('발행량을 불러오지 못했습니다', 'Could not load supply')}
          msg={
            language === 'ko'
              ? (adminFailureText(error?.code, error?.msg) ?? '발행량을 불러오지 못했습니다.')
              : (error?.msg ?? 'Could not load supply. Please try again.')
          }
          onRetry={onRefresh}
        />
      </AdminPanel>
    )
  }

  // 지갑을 못 읽으면 서버는 walletTotal 0 + 불변식 4 미평가(expected null)로 준다. V-02 와 같은 가드(!106).
  const inv4 = supply.invariants.find((i) => i.no === 4)
  const walletTotal = inv4 && inv4.expected == null ? undefined : supply.walletTotal
  const inv2 = supply.invariants.find((i) => i.no === 2)
  const escrowTotal = inv2 && inv2.checkedShows == null ? undefined : supply.escrowTotal
  const approx = supply.display
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: supply.display.currency,
      }).format(supply.display.approx)
    : undefined

  const halt = haltStateOf(supply)

  return (
    <AdminPanel
      title={text('발행량 상태', 'Supply status')}
      description={
        <>
          {text(
            '총 발행량 = 에스크로 합계 + 지갑 보유 합계',
            'Total supply = escrow + wallet holdings',
          )}{' '}
          · {text('갱신', 'Updated')} {formatKst(supply.asOf, undefined, language)}
          {supply.stale && ` · ${text('캐시된 값입니다', 'Cached value')}`}
        </>
      }
      action={
        <Button sm variant="secondary" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? text('새로고침 중', 'Refreshing') : text('새로고침', 'Refresh')}
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-card border border-line bg-ground px-3 py-3">
          <p className="m-0 font-sans text-[11px] text-muted">
            {text('총 발행량', 'Total supply')}
          </p>
          <p className="m-0 mt-1 font-sans text-lg font-bold text-ink">
            <Money amount={supply.totalSupply} approx={approx} strong />
          </p>
        </div>
        <div className="rounded-card border border-line bg-ground px-3 py-3">
          <p className="m-0 font-sans text-[11px] text-muted">
            {text('에스크로 합계', 'Escrow total')}
          </p>
          <p className="m-0 mt-1 font-sans text-lg font-bold text-ink tabular-nums">
            {escrowTotal == null ? '—' : formatYoyo(escrowTotal)}
          </p>
          <p className="m-0 mt-0.5 font-sans text-[11px] text-muted">
            {text('판매 중·정산 전 + 보증금', 'On sale or unsettled + deposits')}
          </p>
        </div>
        <div className="rounded-card border border-line bg-ground px-3 py-3">
          <p className="m-0 font-sans text-[11px] text-muted">
            {text('지갑 보유 합계', 'Wallet holdings')}
          </p>
          <p className="m-0 mt-1 font-sans text-lg font-bold text-ink tabular-nums">
            {walletTotal == null ? '—' : formatYoyo(walletTotal)}
          </p>
        </div>
      </div>

      <SupplyCompositionChart
        totalSupply={supply.totalSupply}
        escrowTotal={supply.escrowTotal}
        walletTotal={supply.walletTotal}
      />

      <div className="mt-3 flex flex-col">
        {/* ⚠ `supplyMatched`로 판단하지 않는다(2026-09-10 팀 확인). 그 값은 **불변식 ①·④만**
            본다. ③(정산 재계산)이 어긋나면 `supplyMatched`는 true인데 아래 목록에는 불일치가
            찍힌다 — 여기서 "일치"라고 쓰면 한 화면 안에서 모순이 난다. 판정은 haltState가 한다 */}
        {/* 문구는 haltState가 만든다 — 번호가 비었을 때 문장이 잘리던 자리다(MR !75 리뷰) */}
        <AdminRow label={text('대사 결과', 'Reconciliation')}>
          {language === 'ko'
            ? halt.mismatchText
            : halt.mismatch
              ? `Mismatch in invariants ${halt.brokenNos.join(', ')}`
              : 'All checked invariants match'}
        </AdminRow>
        <AdminRow label={text('지급 건수', 'Grant count')}>
          {supply.grantCount.toLocaleString(language)} {text('건', 'grants')} —{' '}
          {text(
            '가입 기본 지급과 관리자 추가 지급의 합이 총 발행량입니다',
            'Total supply is the sum of signup and administrator grants',
          )}
        </AdminRow>
        <AdminRow label={text('코인 지급(mint)', 'Coin grants (mint)')}>
          {supply.mintHalted ? text('중단됨', 'Halted') : text('정상', 'Operating')}
        </AdminRow>
        <AdminRow label={text('정산금 지급(release)', 'Settlement payouts (release)')}>
          {supply.releaseHalted ? text('중단됨', 'Halted') : text('정상', 'Operating')}
        </AdminRow>
      </div>

      {/* 불변식 4행. V-02는 "기본 접힘"이고, M-03에서도 같은 값을 쓴다.
          다만 **불일치거나 지급이 막혀 있으면 펼친 채로** 둔다 — 지급이 막힌 이유가 여기 있다.
          ⚠ 예전에는 `!supply.supplyMatched`로 열었다. ③만 깨져 release만 멈춘 경우
          `supplyMatched`가 true라 **막힌 이유가 접힌 채로 숨었다**(2026-09-10 팀 확인) */}
      <details
        className="mt-3 rounded-card border border-line bg-ground px-3 py-2"
        open={halt.mismatch || halt.anyHalted}
      >
        <summary className="cursor-pointer font-sans text-[12px] font-semibold text-ink">
          {text('불변식 4행 판정', 'Four invariant checks')}
        </summary>
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {supply.invariants.map((inv) => (
            <li key={inv.no} className="border-t border-line pt-2 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-sans text-[12px] font-semibold text-ink">
                  {language === 'ko'
                    ? (INVARIANT_TITLE[inv.name] ?? `${inv.no}. ${inv.name}`)
                    : (INVARIANT_TITLE_EN[inv.name] ?? `${inv.no}. ${inv.name}`)}
                </span>
                <span className="font-sans text-[12px] font-semibold text-ink">
                  {inv.matched ? text('일치', 'Match') : text('불일치', 'Mismatch')}
                </span>
              </div>
              <p className="m-0 font-sans text-[11px] leading-relaxed text-muted">
                {language === 'ko' ? (
                  <>
                    {invariantDiffText(inv) && <span>{invariantDiffText(inv)} · </span>}
                    {inv.note}
                  </>
                ) : (
                  <>
                    {inv.expected != null && `Expected ${inv.expected.toLocaleString('en-US')}`}
                    {inv.expected != null && inv.actual != null && ' · '}
                    {inv.actual != null && `Actual ${inv.actual.toLocaleString('en-US')}`}
                    {inv.checkedShows != null && `Checked shows ${inv.checkedShows}`}
                    {inv.mismatchedShows != null && ` · Mismatched ${inv.mismatchedShows}`}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      </details>

      {/* 전문 항목 — M-03은 블록체인 어휘를 노출해도 되는 화면이다(§1.2 원칙 11) */}
      <details className="mt-2 rounded-card border border-line bg-ground px-3 py-2">
        <summary className="cursor-pointer font-sans text-[12px] font-semibold text-ink">
          {text('체인·컨트랙트', 'Chain and contracts')}
        </summary>
        <div className="mt-2 flex flex-col">
          <AdminRow label={text('네트워크', 'Network')}>
            {supply.network} · chainId {supply.chainId} (0x{supply.chainId.toString(16)})
          </AdminRow>
          <AdminRow label={text('토큰', 'Token')}>
            {supply.tokenSymbol} · decimals {supply.tokenDecimals} ·{' '}
            <TxLink
              value={supply.tokenAddress}
              url={supply.explorerUrl}
              label={text('토큰 컨트랙트', 'Token contract')}
            />
          </AdminRow>
          <AdminRow label={text('발행 주체', 'Issuer')}>
            {supply.issuer.label} ({supply.issuer.type})
          </AdminRow>
        </div>
      </details>
    </AdminPanel>
  )
}

/**
 * 중단 배너 — M-03 컴포넌트 표 2행.
 *
 * 문구는 명세 그대로다: "발행량 대사가 맞지 않아 코인 지급(mint)과 정산금 지급(release)이
 * 중단되었습니다. 원인 확인 후 해제하세요." + **감지 시각·차액·깨진 불변식 번호**.
 *
 * §5.17이 "헤더는 스크롤에 따라붙지 않는다. 예외는 V-02의 중단 배너와 **M-03의 중단 배너**"라고
 * 정했으므로 `sticky`로 올린다 — 배너가 뜬 동안 지급 버튼이 비활성이라 이유가 항상 보여야 한다.
 *
 * ⚠ 두 가지가 명세에 없어 그대로 만들지 못했다(불일치 목록에 올렸다).
 *   ① **"감지 시각" 전용 필드가 없다.** `coin_01`이 주는 시각은 `asOf`(마지막 조회 시각)뿐이라
 *      그것을 쓰고 라벨을 "확인 시각"으로 적었다 — "감지 시각"이라고 쓰면 없는 정보를 가리킨다.
 *   ② **"확인 처리"에 연결 API가 없다.** 컴포넌트 표의 연결 API가 `GET /coin/supply` 하나이고
 *      감사 로그 `STATUS_CHANGE`를 남기는 엔드포인트가 v6에 없다. 그래서 확인 처리는
 *      **확인 모달을 거쳐 호출부 콜백**으로만 넘기고, 눌러도 **지급 버튼은 계속 비활성**이다 —
 *      해제는 대사가 다시 맞을 때(`mintHalted: false`) 서버가 푸는 것이고, 화면이 풀 수 없다.
 */
export function CoinHaltBanner({
  supply,
  acknowledged,
  onAcknowledge,
}: {
  supply: CoinSupply
  acknowledged: boolean
  onAcknowledge: () => void
}) {
  const { language, text } = useLocale()
  const halt = haltStateOf(supply)
  const diffs = supply.invariants
    .filter((i) => !i.matched)
    .map((inv) => {
      const text = invariantDiffText(inv)
      if (language === 'en') {
        if (inv.expected != null && inv.actual != null) {
          return `Invariant ${inv.no} expected ${inv.expected.toLocaleString('en-US')}, actual ${inv.actual.toLocaleString('en-US')}`
        }
        return `Invariant ${inv.no}`
      }
      return text ? `불변식 ${inv.no} ${text}` : `불변식 ${inv.no}`
    })
    .join(' · ')

  return (
    <AdminNotice
      sticky
      tone="danger"
      id="coin-halt-banner"
      // ⚠ **실제로 막힌 것만 이름을 부른다.** 예전에는 둘 다 중단됐다고 못박아 두었는데,
      // ③만 깨지면 release만 멈추고 mint는 정상이다 — 그때 "코인 지급도 중단"이라고 하면
      // 관리자가 멀쩡한 지급을 포기한다(2026-09-10 팀 확인)
      title={
        language === 'ko'
          ? halt.bannerTitle
          : halt.mintHalted && halt.releaseHalted
            ? 'Coin grants and settlement payouts are halted'
            : halt.mintHalted
              ? 'Coin grants are halted'
              : 'Settlement payouts are halted'
      }
      action={
        acknowledged ? (
          <span className="font-sans text-[11px] font-semibold text-ink">
            {text(
              '확인 처리했습니다 · 대사가 다시 맞을 때까지 계속 중단됩니다',
              'Acknowledged · processing remains halted until reconciliation matches',
            )}
          </span>
        ) : (
          <Button sm variant="danger" onClick={onAcknowledge}>
            {text('확인 처리', 'Acknowledge')}
          </Button>
        )
      }
    >
      <span className="block">
        {text('확인 시각', 'Checked')} {formatKst(supply.asOf, undefined, language)}
      </span>
      {/* 무엇이 멈췄는지 한 줄로 못박는다 — 제목만으로는 mint가 살아 있는지 알기 어렵다 */}
      <span className="block">
        {text('코인 지급(mint)', 'Coin grants (mint)')}{' '}
        {halt.mintHalted ? text('중단됨', 'halted') : text('정상', 'operating')} ·{' '}
        {text('정산금 지급(release)', 'Settlement payouts (release)')}{' '}
        {halt.releaseHalted ? text('중단됨', 'halted') : text('정상', 'operating')}
      </span>
      <span className="block">
        {text('깨진 불변식', 'Failed invariants')} {halt.brokenNos.join('·') || '—'}
        {diffs && ` · ${diffs}`}
      </span>
    </AdminNotice>
  )
}
