/**
 * V-02 발행량·에스크로 공시.
 *
 * 정본 — 화면설계 v6 §4 V-02(영역 구성·레이아웃·컴포넌트 표 9행·상태·접근성)
 *        · §1.1 가정 기반 시연 고지 · §5.3 주소 축약·tx 링크 · §5.13 KST 병기 · §5.4 금액 표기
 *        · API 정본 coin_01 `GET /api/v1/coin/supply`
 *
 * **로그인 없이 열린다.** coin_01은 `security: []`(공개)이고 `x-role: GUEST`다. 화면설계도
 * "사용자 GUEST(로그인 불필요)"라고 못박았다. 그래서 이 컴포넌트와 페이지는 세션·토큰을 읽지
 * 않고, 401 처리도 하지 않는다(받을 일이 없다). A-01·A-02 하단 링크와 헤더 시트에서 들어온다.
 *
 * 이 화면은 §1.2 원칙 2의 **명시적 예외**다. 다만 관객이 눌러 들어오므로 **첫 문단은 일상어**로
 * 쓰고 주소·이벤트 같은 전문 항목은 하단 접기 영역에 둔다(V-02 세 번째 불릿).
 *
 * ── 정직성 규칙 ─────────────────────────────────────────────────────────
 * 대사 배지 3값 중 `Checking`("확인 중")이 **판정 불가** 자리다. `stale`이거나 불변식 값이
 * 비어 있으면 "일치"라고 쓰지 않는다. 값 일부가 없으면 그 값만 `—`로 두고 나머지는 그대로
 * 렌더한다(V-02 상태 항목) — 패널 전체를 에러로 덮지 않는다.
 *
 * ── 명세에 없어 해석한 것(전부 보고 목록에 있다) ──────────────────────────
 * ① **`CoinSupply`에 정산 컨트랙트 주소가 없다.** 전문 항목 접기 영역이 요구하므로 §5.3
 *    `[팀 9/2]`("체인·컨트랙트 주소는 프론트 환경변수로 고정한다")에 따라 `shared/config` 값을 쓴다.
 * ② **`CoinSupply`에 `Minted` 이벤트 목록이 없다.** "최근 Minted 이벤트 요약" 자리는 응답이 주는
 *    `grantCount`·`grantNotice`로 대신하고 ⚠로 표시했다. 이벤트를 지어내지 않았다.
 * ③ **`≈` 병기는 `totalSupply`에만 붙는다.** 컴포넌트 표는 세 값 모두에 병기하라고 했지만
 *    응답의 `display.approx`는 한 값뿐이고, §5.4가 "클라이언트가 환율을 재계산하지 않는다"고
 *    금지한다. 나머지 두 값은 원 값만 쓴다.
 */

import { useState } from 'react'

import { InvariantList } from '@/features/verify/InvariantList'
import { addressUrl, explorerBaseFrom } from '@/features/verify/explorerLinks'
import { buildSupplyInvariantRows, verdictOf } from '@/features/verify/invariants'
import type { SupplyVerdict } from '@/features/verify/invariants'
import { isChainDelay, verifyErrorView } from '@/features/verify/verifyErrors'
import type { CoinSupply } from '@/features/verify/verifyTypes'
import { config } from '@/shared/config'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, Money, MotionDisclosure, formatYoyo, formatKst, shortenHex } from '@/shared/ui'

import './operations-refresh.css'

/* ── 고정 문구 — 화면설계 v6이 문자열까지 정한 자리다. 고쳐 쓰지 않는다 ──── */

const HEADLINE_EN = "All the money in this world is on-chain. Here's where it is right now."
const HEADLINE_KO =
  '이 세계의 돈은 전부 온체인에 있습니다. 지금 그 돈이 어디에 있는지 그대로 공개합니다.'

/** §1.1 가정 기반 시연 고지. **항상 노출한다**(접지 않는다) */
const DEMO_NOTICE_EN =
  'Test network (Kaia Kairos). A demo that assumes a future where money is a coin. No real assets, no real currency.'
const DEMO_NOTICE_KO =
  '테스트넷(Kaia Kairos) 시연입니다. 화폐가 코인인 미래를 가정했으며 실가상자산·실화폐가 아닙니다.'

const HALT_BANNER_EN = 'Coin grants and payouts are paused while we verify.'
const HALT_BANNER_KO = '확인이 끝날 때까지 코인 지급과 정산금 지급이 중단됩니다.'

const VERIFY_HINT_EN = "Participating teams can verify each show's settlement in detail."
const VERIFY_HINT_KO = '공연별 정산 상세 검증은 참여팀 리더가 볼 수 있어요.'

/** 대사 결과 배지 3값 */
const VERDICT: Record<SupplyVerdict, { ko: string; en: string; tone: string }> = {
  balanced: { en: 'Balanced', ko: '일치', tone: 'border-ok text-ok' },
  checking: { en: 'Checking', ko: '확인 중', tone: 'border-line text-muted' },
  mismatch: { en: 'Mismatch', ko: '불일치', tone: 'border-warning text-warning' },
}

/* ── 조각 ─────────────────────────────────────────────────────────────── */

/**
 * 값 타일 하나.
 *
 * `value`가 숫자가 아니면 `—`로 둔다 — V-02 상태 항목 "값 일부 실패: 실패한 값만 `—`로 두고
 * 나머지는 그대로 렌더한다". 스키마상 이 값들은 non-nullable이지만, 그렇다고 화면이 `NaN`이나
 * `undefined YoYo`를 찍게 두지 않는다.
 */
function SupplyTile({
  en,
  ko,
  value,
  approx,
  share,
  strong,
}: {
  en: string
  ko: string
  value?: number
  approx?: string
  /** 모바일에서 각 단에 덧붙이는 전체 대비 비중(V-02 레이아웃) */
  share?: string
  strong?: boolean
}) {
  const { text } = useLocale()
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4">
      <p className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text(ko, en)}
      </p>
      <p
        className={`m-0 mt-1 font-sans tabular-nums text-ink ${
          strong ? 'text-2xl font-bold md:text-3xl' : 'text-xl font-bold md:text-2xl'
        }`}
      >
        {value == null || !Number.isFinite(value) ? (
          <span className="text-muted">—</span>
        ) : (
          <Money amount={value} approx={approx} />
        )}
      </p>
      {/* 비중은 좁은 폭에서만 필요하다(3열 타일이 세로로 쌓일 때 크기 비교가 안 되기 때문) */}
      {share && <p className="m-0 mt-0.5 font-sans text-[11px] text-muted md:hidden">{share}</p>}
    </div>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  data?: CoinSupply
  loading?: boolean
  /** 실패 응답의 `code`. 있으면 에러 화면을 그린다 */
  errorCode?: string
  /** 실패 응답의 `msg`. 그대로 노출한다(§5.5) */
  errorMsg?: string
  /**
   * 마지막으로 성공한 조회 시각(ISO).
   * V-02 상태 항목이 체인 조회 지연 시 "마지막 성공 조회 시각 안내"를 요구한다.
   */
  lastSuccessAt?: string
  onRetry?: () => void
}

export function SupplyDisclosure({
  data,
  loading = false,
  errorCode,
  errorMsg,
  lastSuccessAt,
  onRetry,
}: Props) {
  const { language, text } = useLocale()
  // 최대폭 960px 중앙 1열(V-02 레이아웃). 하단 고정 액션이 없다
  const frame = 'mx-auto flex w-full max-w-[960px] flex-col gap-4 px-3 pt-3 pb-10 md:gap-5 md:px-6'

  if (loading) {
    return (
      <div className={`evidence-workbench ${frame}`}>
        <div
          aria-busy="true"
          aria-label={text('발행량 공시를 불러오는 중', 'Loading coin supply')}
          className="flex flex-col gap-4"
        >
          <div className="h-14 animate-pulse rounded-card bg-ground-2" />
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-card bg-ground-2" />
            ))}
          </div>
          <div className="h-32 animate-pulse rounded-card bg-ground-2" />
        </div>
      </div>
    )
  }

  if (errorCode || !data) {
    const view = verifyErrorView(errorCode ?? 'COMMON_INTERNAL_ERROR')
    const englishView =
      errorCode === 'COMMON_UNAUTHORIZED'
        ? { title: 'Sign in required', hint: 'Sign in to return to this disclosure.' }
        : errorCode === 'COMMON_FORBIDDEN'
          ? { title: 'You do not have access to this evidence', hint: undefined }
          : errorCode === 'CHAIN_TX_TIMEOUT' || errorCode === 'COMMON_EXTERNAL_SERVICE_ERROR'
            ? {
                title: 'On-chain data is delayed',
                hint: 'The latest on-chain values are not available yet. Try again.',
              }
            : { title: 'Could not load the disclosure', hint: 'Please try again in a moment.' }
    const copy = language === 'ko' ? view : englishView
    return (
      <div className={`evidence-workbench ${frame}`}>
        <section
          role="alert"
          className="rounded-card border border-danger bg-surface px-4 py-10 text-center"
        >
          <p className="m-0 mb-1 font-sans text-sm font-semibold text-ink">{copy.title}</p>
          {copy.hint && <p className="m-0 mb-1 font-sans text-[13px] text-muted">{copy.hint}</p>}
          {errorMsg && <p className="m-0 mb-1 font-sans text-[13px] text-muted">{errorMsg}</p>}
          {/* 체인 조회 지연이면 마지막 성공 조회 시각을 알린다(V-02 상태 항목) */}
          {errorCode && isChainDelay(errorCode) && lastSuccessAt && (
            <p className="m-0 mb-4 font-sans text-[13px] text-muted">
              {text('마지막 성공 조회', 'Last successful update')}{' '}
              <span className="font-mono">{formatKst(lastSuccessAt, undefined, language)}</span>
            </p>
          )}
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              {text('다시 시도', 'Retry')}
            </Button>
          )}
        </section>

        {/* 값을 못 받아도 §1.1 고지는 남긴다 — 이 화면이 그 고지를 대표로 노출한다 */}
        <DemoNotice />
      </div>
    )
  }

  const rows = buildSupplyInvariantRows(data)
  const verdict = verdictOf(rows, data.supplyMatched)
  // ⚠ 셋을 다 OR로 묶는다. `supplyMatched` 하나로 판단하면 안 된다(2026-09-10 팀 확인) —
  //   불변식 ③(정산 재계산)이 어긋나면 `releaseHalted`만 켜지고 `supplyMatched`는 true로
  //   남는다. 그러면 정산금 지급이 멈춘 채로 공시 화면이 "정상"이라고 말한다.
  //
  // ── M-03과의 관계 (MR !75 리뷰 지적) ────────────────────────────────
  // `features/admin/haltState.ts`의 필드로 옮기면 이 식은 정확히 이렇다:
  //
  //     halted(V-02) === anyHalted || !supplyMatched
  //
  // **M-03의 배너 조건(`anyHalted`)보다 일부러 넓다.** 이유는 두 화면의 목적이 다르기
  // 때문이다 — M-03은 관리자에게 "지금 무엇이 막혔는가"를 알리므로 실제로 멈춘 것만
  // 말해야 하고(멀쩡한 mint까지 중단이라고 하면 안 된다), V-02는 대외 공시라 총량 대사가
  // 깨졌다면 서버가 아직 막지 않았더라도 "정상"이라고 말하지 않는 쪽이 맞다.
  //
  // 공용 레이어로 올릴 때(후속 리팩터) **이 차이를 없애지 말고 이름을 붙여 남긴다** —
  // 예: `operationsHalted`(M-03) / `disclosureHalted`(V-02). 하나로 합치면 둘 중 한 화면이
  // 반드시 틀린 말을 하게 된다. 지금 여기서 import하지 않는 것은 feature 간 참조 격리 때문이다.
  const halted = !data.supplyMatched || data.mintHalted || data.releaseHalted

  const total = data.totalSupply
  // 지갑 잔액을 못 읽으면 서버는 walletTotal 0 + 불변식 4 미평가(expected null)로 준다. stale 은
  // 켜지 않는다(켜면 불변식 3 불일치가 가려진다). 0원을 그대로 그리면 "지갑 보유 0원"이 공시된다(!106).
  const inv4 = data.invariants.find((i) => i.no === 4)
  const walletTotal = inv4 && inv4.expected == null ? undefined : data.walletTotal
  // 에스크로를 못 읽으면 escrowTotal 0 + 불변식 2 미평가(checkedShows null). 같은 가드.
  const inv2 = data.invariants.find((i) => i.no === 2)
  const escrowTotal = inv2 && inv2.checkedShows == null ? undefined : data.escrowTotal
  // 서버 불변식 ④는 등록 지갑만 관측한다. 양의 차액만 관측 범위 밖 보유분으로 설명한다.
  // stale/미평가/실제 불일치이면 이 금액을 보유분이라고 단정하지 않는다.
  const outsideHoldings =
    !data.stale &&
    inv4?.matched &&
    inv4.expected != null &&
    inv4.actual != null &&
    inv4.actual >= inv4.expected
      ? inv4.actual - inv4.expected
      : undefined
  const shareOf = (v: number): string | undefined => {
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(v)) return undefined
    const percentage = ((v / total) * 100).toFixed(1)
    return text(`전체의 ${percentage}%`, `${percentage}% of total`)
  }

  /** `display.approx`는 `totalSupply` 한 값에만 온다(§5.4 — 클라이언트가 환율을 재계산하지 않는다) */
  const approxLabel = data.display
    ? `${data.display.approx.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${data.display.currency}`
    : undefined

  return (
    <div className={`evidence-workbench ${frame}`}>
      {/* ── 상단 고정: 대사 배지 + 중단 배너(§5.17의 유일한 sticky 예외) ── */}
      <div className="sticky top-0 z-30 -mx-3 flex flex-col gap-2 bg-ground px-3 py-2 md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 font-sans text-lg font-bold text-ink md:text-xl">
            {text('발행량·에스크로 공시', 'Coin supply & escrow')}
          </h1>
          <span
            role="status"
            className={`ml-auto inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-chip border bg-surface px-2.5 font-sans text-[11px] font-semibold tracking-tight ${VERDICT[verdict].tone}`}
          >
            {text(VERDICT[verdict].ko, VERDICT[verdict].en)}
          </span>
        </div>

        {halted && (
          <p
            role="alert"
            className="m-0 rounded-card border border-danger bg-surface px-4 py-2.5 font-sans text-[13px] font-semibold text-ink"
          >
            {text(HALT_BANNER_KO, HALT_BANNER_EN)}
          </p>
        )}
      </div>

      {/* ── 한 줄 요약 — 일상어. 전문 용어는 아래 접기 영역에 있다 ── */}
      <section aria-label={text('요약', 'Summary')}>
        <p className="m-0 font-sans text-base font-semibold text-ink md:text-lg">
          {text(HEADLINE_KO, HEADLINE_EN)}
        </p>
      </section>

      {/* ── 발행량 구성: PC 3열 타일 / 모바일 세로 3단 + 비중 ── */}
      <section
        aria-label={text('발행량 구성', 'Supply composition')}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <SupplyTile
            en="Total supply"
            ko="총 발행량"
            value={data.totalSupply}
            approx={approxLabel}
            strong
          />
          <SupplyTile
            en="In escrow"
            ko="에스크로 합계"
            value={escrowTotal}
            share={escrowTotal == null ? undefined : shareOf(escrowTotal)}
          />
          <SupplyTile
            en="Registered wallets"
            ko="등록 지갑 보유량"
            value={walletTotal}
            share={walletTotal == null ? undefined : shareOf(walletTotal)}
          />
        </div>

        {/* 세 값의 관계를 한 줄로(V-02 레이아웃) */}
        <p className="m-0 font-sans text-[11px] text-muted md:text-xs">
          {text('조회한 에스크로·등록 지갑 합계', 'Observed escrow and registered-wallet total')}
          {' · '}
          <span className="font-num tabular-nums">
            {escrowTotal == null ? '—' : formatYoyo(escrowTotal)} +{' '}
            {walletTotal == null ? '—' : formatYoyo(walletTotal)} ={' '}
            {escrowTotal == null || walletTotal == null
              ? '—'
              : formatYoyo(escrowTotal + walletTotal)}
          </span>
        </p>
        {outsideHoldings != null && outsideHoldings > 0 && (
          <p className="m-0 font-sans text-[11px] text-muted md:text-xs">
            {text('등록 지갑 조회 범위 밖 보유분', 'Holdings outside the registered-wallet scope')}:{' '}
            {formatYoyo(outsideHoldings)}
            {' · '}
            {text(
              '미등록·정지 지갑 주소는 등록 지갑 합계에 포함되지 않습니다.',
              'Unregistered and suspended wallet addresses are excluded from the registered-wallet total.',
            )}
          </p>
        )}
        <p className="m-0 font-sans text-[11px] text-muted md:text-xs">
          {text(
            '에스크로 합계는 공연에 잠긴 금액과 보증금입니다. 지갑 합계는 등록된 LINKED 지갑을 조회한 값입니다.',
            'Escrow includes funds held for shows and deposits. The wallet total covers registered LINKED wallets.',
          )}
        </p>
      </section>

      {/* ── 불변식 4행 — 기본 접힘. 불일치·판정 불가가 있으면 펼친 채로 연다 ── */}
      <InvariantList rows={rows} collapsible defaultOpen={verdict !== 'balanced'} />

      {/* ── 지급 요약 ── */}
      <section
        aria-label={text('지급 요약', 'Grants')}
        className="rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4"
      >
        <p className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('지급 요약', 'Grants')}
        </p>
        <p className="m-0 mt-1 font-sans text-[13px] text-ink md:text-sm">
          {text('지급', 'Grants')}{' '}
          <span className="font-num tabular-nums">
            {data.grantCount.toLocaleString(language)}
            {text('건', '')}
          </span>
          {' · '}
          {text('합계', 'Total')}{' '}
          <span className="font-num tabular-nums">{formatYoyo(data.totalSupply)}</span>
        </p>
        <p className="m-0 mt-0.5 font-sans text-[11px] text-muted md:text-xs">
          {text(
            '가입 기본 지급 + 관리자 추가 지급의 합이 곧 총 발행량입니다. 누가 받았는지는 담지 않습니다.',
            'Total supply is the sum of signup grants and additional admin grants. Recipients are not disclosed.',
          )}
        </p>
        {/* 서버가 내려준 지급 안내(`grantNotice`)를 그대로 옮긴다 */}
        <p className="m-0 mt-1 font-sans text-[11px] text-muted md:text-xs">{data.grantNotice}</p>
      </section>

      {/* ── 갱신 시각 ── */}
      <p className="m-0 font-sans text-[11px] text-muted md:text-xs">
        {text('갱신 시각', 'Updated')}{' '}
        <span className="font-mono">{formatKst(data.asOf, undefined, language)}</span>
        {' · '}
        {text('1분 동안 같은 값을 보여줍니다', 'Values are cached for one minute')}
        {data.nextRefreshAt && (
          <>
            {' · '}
            {text('다음 갱신', 'Next refresh')}{' '}
            <span className="font-mono">{formatKst(data.nextRefreshAt, undefined, language)}</span>
          </>
        )}
        {data.stale && (
          <span className="ml-1 font-semibold text-ink">
            <span aria-hidden>⚠ </span>
            {text(
              '지금은 마지막으로 읽은 값입니다 — 대조 결과를 알 수 없습니다',
              'Showing the last available values; reconciliation cannot be assessed.',
            )}
          </span>
        )}
      </p>

      {/* ── 가정 기반 시연 고지 — 접지 않는다 ── */}
      <DemoNotice serverDisclosure={data.disclosure} />

      {/* ── 전문 항목 접기 영역 ── */}
      <TechnicalDetails data={data} />

      {/* ── 검증 페이지 안내 (V-01은 로그인 필요) ── */}
      <p className="m-0 font-sans text-[11px] text-muted md:text-xs">
        {text(VERIFY_HINT_KO, VERIFY_HINT_EN)}
      </p>
    </div>
  )
}

/** §1.1 고지. 값을 못 받았을 때도 남기려고 따로 뺐다 */
function DemoNotice({ serverDisclosure }: { serverDisclosure?: string }) {
  const { text } = useLocale()
  return (
    <section
      aria-label={text('가정 기반 시연 고지', 'Demo notice')}
      className="rounded-card border border-line bg-ground-2 px-4 py-3 md:px-5"
    >
      <p className="m-0 font-sans text-[11px] font-semibold text-ink md:text-xs">
        {text(DEMO_NOTICE_KO, DEMO_NOTICE_EN)}
      </p>
      {/*
        ⚠ 서버 `disclosure`는 컴포넌트 표에 자리가 없다. 고정 고지에 없는 사실
        ("잔액 수치는 플랫폼 서버를 통해 읽는다")이 들어 있어 감추지 않고 아래에 덧붙였다.
      */}
      {serverDisclosure && (
        <p className="m-0 mt-1 font-sans text-[11px] text-faint md:text-xs">{serverDisclosure}</p>
      )}
    </section>
  )
}

/** 전문 항목 접기 영역 — 토큰 주소·정산 컨트랙트 주소·chainId·익스플로러 링크 */
function TechnicalDetails({ data }: { data: CoinSupply }) {
  const { language, text } = useLocale()
  const [open, setOpen] = useState(false)
  const tokenHref = data.explorerUrl || ''
  /** ⚠ 정산 컨트랙트 주소는 응답에 없다 — 프론트 환경변수 고정값을 쓴다(§5.3 `[팀 9/2]`) */
  const splitter = config.chain.splitterAddress
  /** 익스플로러 base는 서버가 준 토큰 URL에서 떼어 쓴다 — 도메인을 화면에 적어 두지 않는다 */
  const splitterHref = addressUrl(explorerBaseFrom(tokenHref), splitter)

  return (
    <section aria-label={text('전문 항목', 'On-chain details')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="supply-technical-details"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-card border border-line bg-surface px-4 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-ground-2"
      >
        <span className="font-sans text-[13px] font-semibold text-ink md:text-sm">
          {text('전문 항목', 'On-chain details')}
        </span>
        <span className="ml-auto font-sans text-[11px] text-muted">
          {open ? text('접기', 'Collapse') : text('펼치기', 'Expand')}
        </span>
        <span
          aria-hidden
          className={`font-sans text-[11px] text-muted transition-transform duration-150 ease-out ${open ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>

      <MotionDisclosure open={open} id="supply-technical-details" enterMs={200} exitMs={160}>
        <div className="mt-2 rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4">
          <dl className="m-0 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
            <dt className="font-sans text-[11px] text-muted md:text-xs">
              {data.tokenSymbol} {text('토큰', 'token')}
            </dt>
            <dd className="m-0">
              {tokenHref ? (
                <a
                  href={tokenHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 items-center font-mono text-[11px] text-primary underline underline-offset-2 md:min-h-0 md:text-xs"
                >
                  {shortenHex(data.tokenAddress)}
                </a>
              ) : (
                <span className="font-mono text-[11px] text-ink">
                  {shortenHex(data.tokenAddress)}
                </span>
              )}
            </dd>

            <dt className="font-sans text-[11px] text-muted md:text-xs">
              {text('정산 컨트랙트', 'Settlement contract')}
            </dt>
            <dd className="m-0">
              {splitter && splitterHref ? (
                <a
                  href={splitterHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 items-center font-mono text-[11px] text-primary underline underline-offset-2 md:min-h-0 md:text-xs"
                >
                  {shortenHex(splitter)}
                </a>
              ) : splitter ? (
                <span className="font-mono text-[11px] text-ink">{shortenHex(splitter)}</span>
              ) : (
                <span className="font-sans text-[11px] text-muted">
                  ⚠{' '}
                  {text(
                    '이 앱에 설정된 정산 컨트랙트 주소가 없습니다',
                    'No settlement contract address is configured.',
                  )}
                </span>
              )}
            </dd>

            <dt className="font-sans text-[11px] text-muted md:text-xs">
              {text('네트워크', 'Network')}
            </dt>
            <dd className="m-0 font-mono text-[11px] text-ink md:text-xs">
              {data.network} · chainId {data.chainId} (0x{data.chainId.toString(16)})
            </dd>

            <dt className="font-sans text-[11px] text-muted md:text-xs">
              {text('소수 자리', 'Decimals')}
            </dt>
            <dd className="m-0 font-num text-[11px] tabular-nums text-ink md:text-xs">
              {data.tokenDecimals} —{' '}
              {text('금액은 YoYo 정수입니다', 'Amounts are whole YoYo integers')}
            </dd>

            <dt className="font-sans text-[11px] text-muted md:text-xs">
              {text('발행 주체', 'Issuer')}
            </dt>
            <dd className="m-0 font-sans text-[11px] text-ink md:text-xs">
              {data.issuer.label}
              <span className="ml-1 text-muted">
                ({data.issuer.type}
                {data.issuer.replaceable ? text(' · 교체 가능', ' · replaceable') : ''})
              </span>
            </dd>

            <dt className="font-sans text-[11px] text-muted md:text-xs">Minted</dt>
            <dd className="m-0 font-sans text-[11px] text-muted md:text-xs">
              {/* 이벤트 목록은 API에 없으므로 실제 지급 건수만 표시한다. */}
              {text(
                '이 API는 이벤트 목록을 제공하지 않습니다 — 확정된 지급',
                'This API does not provide an event list — confirmed grants',
              )}{' '}
              <span className="font-num tabular-nums text-ink">
                {data.grantCount.toLocaleString(language)}
                {text('건', '')}
              </span>
            </dd>
          </dl>

          {data.perPerformanceEscrow.length > 0 && (
            <>
              <p className="m-0 mt-3 mb-1 font-sans text-[11px] font-semibold text-muted md:text-xs">
                {text('공연별 에스크로', 'Escrow by show')}
              </p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {data.perPerformanceEscrow.map((p) => (
                  <li key={p.performanceId} className="font-sans text-[11px] text-muted md:text-xs">
                    {text('공연', 'Show')} #{p.performanceId} · {text('에스크로', 'Escrow')}{' '}
                    <span className="font-num tabular-nums text-ink">
                      {formatYoyo(p.escrowAmount)}
                    </span>
                    {' · '}
                    {text('보증금', 'Deposit')}{' '}
                    <span className="font-num tabular-nums text-ink">
                      {formatYoyo(p.depositAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </MotionDisclosure>
    </section>
  )
}
