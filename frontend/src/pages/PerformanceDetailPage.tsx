/**
 * A-02 공연 상세 페이지 — 라우트 `/performances/:id`.
 *
 * ── API (S15P21B204-99) ────────────────────────────────────────────────
 *   상세 : `GET /api/v1/performances/{performanceId}` (API-performance-03) — `usePerformanceDetail`
 *
 * 공개 API지만 **토큰을 떼지 않는다.** DRAFT·PENDING_AGREEMENT는 관계자에게만 보이고 그 밖에는
 * 404 `PERFORMANCE_NOT_FOUND`라, 로그인 여부로 응답이 달라진다(도메인 함수 주석 참조).
 *
 * 식별자·제목·상태가 없는 응답은 **그리지 않는다.** 기본값으로 채우면 취소된 공연이 판매 중으로
 * 보이고 그 화면에서 예매 버튼이 열린다(§5.10). 최저가도 마찬가지다 — 가격을 모르면 `—`이지 0원이 아니다.
 *
 * `pnpm dev:demo`(isDemo)는 실행 가능한 fixture를 쓰는 별도 모드라 그대로 둔다.
 */

import { Link, useNavigate, useParams } from 'react-router'

import { formatApprox } from '@/features/member/localeOptions'
import { PerformanceDetail } from '@/features/performance/PerformanceDetail'
import type { PerformanceDetailView } from '@/features/performance/PerformanceDetail'
import { SHOW_STATUS } from '@/features/studio/showStatus'
import type { PerformanceDetail as PerformanceDetailData } from '@/shared/api/domains/performance'
import { isApiError } from '@/shared/api/client'
import { PerformanceCode } from '@/shared/api/domains/performance'
import { isDemo } from '@/shared/config'
import { usePerformanceDetail } from '@/shared/queries/performance'
import { formatYoyo, formatKst, PageSkeleton } from '@/shared/ui'

import { demoBookingFlowFor } from './demoBookingFlow'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * performance_03 → A-02 뷰. 필수 값이 없으면 `undefined`를 돌려 화면이 오류로 그리게 한다.
 *
 * 금액 환산은 서버가 준 `price.display`를 그대로 쓴다 — 클라이언트가 환율을 다시 계산하지 않는다(§5.4).
 */
function toDetailView(data: PerformanceDetailData): PerformanceDetailView | undefined {
  if (data.performanceId == null || !data.title || !data.status) return undefined

  const ticketTypes = data.ticketTypes ?? []
  // 가격을 아는 옵션 중 가장 싼 것. 하나도 모르면 최저가를 지어내지 않고 `—`로 남긴다
  const cheapest = ticketTypes
    .filter((t) => t.price?.amount != null)
    .sort((a, b) => (a.price?.amount ?? 0) - (b.price?.amount ?? 0))[0]
  const display = cheapest?.price?.display

  // 잔여 수량을 **모든 옵션에서** 알 때만 매진을 판정한다. 하나라도 모르면 "모름"이지 매진이 아니다
  const remainings = ticketTypes.map((t) => t.remainingQuantity)
  const soldOut =
    ticketTypes.length > 0 &&
    remainings.every((q) => q != null) &&
    remainings.reduce<number>((sum, q) => sum + (q ?? 0), 0) === 0

  const blockedReason =
    data.status === 'CANCELLED'
      ? '취소된 공연입니다.'
      : data.status === 'ENDED'
        ? '이미 끝난 공연입니다.'
        : data.status === 'SALE_CLOSED'
          ? '예매가 마감됐습니다.'
          : data.status !== 'ON_SALE'
            ? '아직 예매를 시작하지 않았습니다.'
            : soldOut
              ? '모든 좌석이 팔렸습니다.'
              : undefined

  return {
    performanceId: data.performanceId,
    title: data.title,
    status: soldOut && data.status === 'ON_SALE' ? 'sold-out' : SHOW_STATUS[data.status],
    dateLabel: data.startAt ? formatKst(data.startAt) : '—',
    venue: data.venueName ?? '—',
    teamNames: (data.participants ?? []).flatMap((p) => (p.teamName ? [p.teamName] : [])),
    minPriceLabel: cheapest?.price?.amount != null ? formatYoyo(cheapest.price.amount) : '—',
    minPriceApprox: display ? formatApprox(display.currency, display.approx) : undefined,
    description: data.description ?? '',
    posterImageUrl: data.posterImageUrl,
    bookingDisabled: blockedReason !== undefined,
    bookingDisabledReason: blockedReason,
  }
}

export function PerformanceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const performanceId = toPerformanceId(id)
  const query = usePerformanceDetail(performanceId ?? 0, {
    enabled: !isDemo && performanceId !== undefined,
  })

  // 데모 모드는 홈 목록의 7개 공연과 같은 ID로 골라 준다(실행 가능한 fixture)
  if (isDemo) {
    const data = demoBookingFlowFor(id).detail
    return (
      <PerformanceDetail
        data={data}
        onBook={() => navigate(`/performances/${id ?? data.performanceId}/order`)}
      />
    )
  }

  if (query.isPending && performanceId !== undefined) {
    return (
      <main className="mx-auto min-h-dvh max-w-[1200px] px-4 py-12"><PageSkeleton variant="detail" /></main>
    )
  }

  // 다시 시도해도 낫지 않는 두 경우는 재시도 버튼을 주지 않는다.
  //   · 주소가 공연 번호가 아니다 — `refetch`가 꺼진 쿼리를 되살려 0번 공연을 부른다
  //   · 404 `PERFORMANCE_NOT_FOUND` — 없는 공연이라 몇 번을 눌러도 같은 404다
  //     (비공개 상태를 숨기는 404이기도 해서 "권한 없음"으로 단정하지 않는다)
  const notFound = isApiError(query.error) && query.error.code === PerformanceCode.NOT_FOUND
  if (performanceId === undefined || notFound) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">
            {notFound ? '공연을 찾을 수 없습니다.' : '잘못된 공연 주소입니다.'}
          </p>
          <p className="mt-1 text-sm text-muted">주소를 다시 확인하거나 목록에서 골라 주세요.</p>
          <Link
            to="/performances"
            className="mt-4 inline-flex min-h-11 items-center rounded-button border border-line px-4 text-sm font-semibold text-ink"
          >
            Shows / 공연 목록으로
          </Link>
        </div>
      </main>
    )
  }

  const view = query.data ? toDetailView(query.data) : undefined
  if (!view) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">공연 정보를 불러오지 못했습니다.</p>
          <button
            type="button"
            className="mt-4 rounded-button border border-line px-4 py-2 text-sm font-semibold text-ink"
            onClick={() => void query.refetch()}
          >
            Retry / 다시 시도
          </button>
        </div>
      </main>
    )
  }

  return (
    <PerformanceDetail
      data={view}
      onBook={() => navigate(`/performances/${view.performanceId}/order`)}
    />
  )
}

export default PerformanceDetailPage
