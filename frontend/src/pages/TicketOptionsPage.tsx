/**
 * A-03 예매 옵션 페이지 — 라우트 `/performances/:id/order`.
 *
 * ── API (S15P21B204-100) ────────────────────────────────────────────────
 *   조회: `GET /api/v1/performances/{performanceId}` (API-performance-03) — `usePerformanceDetail`
 *
 * **performance-15(`GET …/ticket-types`)를 쓰지 않는 이유** — 그 절은 P-03 수정 폼을 위한
 * **생성자 전용**이고(openapi `performance_15` 설명: "관객용 목록은 performance_03의
 * ticketTypes다"), 관객이 부르면 권한 오류다. 금액 shape도 다르다 — 03은 중첩
 * `price.amount`·`price.display`, 15는 평면 `priceAmount`로 환산 문자열이 없다.
 *
 * **이 화면은 주문을 만들지 않는다.** `OrderCreateRequest`는 `items`(A-03)와 `teamAllocations`(A-04)를
 * **한 요청에** 받으므로 주문은 A-04 끝에서 한 번 생성된다. 여기서는 고른 값만 다음 화면으로 넘긴다.
 *
 * ── A-03 → A-04 선택 전달: `navigate(state)` ──────────────────────────────
 * 화면설계 v6 §4 A-04에 이 파라미터가 없어(명세 공백) 방식을 여기서 정했다.
 *   · `navigate(path, { state: { ticketTypeId, quantity } })` — URL을 더럽히지 않고 history에 산다
 *   · 넘기는 것은 **식별자와 수량뿐**이다. 이름·단가·합계는 A-04가 같은 performance_03을
 *     다시 읽어 만든다. 금액을 state로 나르면 뒤로 가기로 되살아난 옛 가격으로 주문하게 된다
 *   · **한계 — 새로고침·직접 진입이면 state가 없다.** 그때 수량 1·첫 옵션 같은 기본값을
 *     지어내지 않고 A-03으로 되돌린다(A-04 참고). 고르지 않은 티켓을 사게 하는 것이 최악이다
 *   · sessionStorage로 새로고침까지 살릴 수도 있으나, 탭 하나에서 공연 두 개를 예매할 때
 *     남의 선택을 물려받는 경로가 생겨 택하지 않았다
 */

import { Link, Navigate, useNavigate, useParams } from 'react-router'

import { formatApprox } from '@/features/member/localeOptions'
import { TicketOptions } from '@/features/ticket/TicketOptions'
import type { TicketOptionsView } from '@/features/ticket/TicketOptions'
import { isApiError } from '@/shared/api/client'
import { PerformanceCode } from '@/shared/api/domains/performance'
import type { PerformanceDetail } from '@/shared/api/domains/performance'
import { isDemo } from '@/shared/config'
import { usePerformanceDetail } from '@/shared/queries/performance'
import { formatKst, PageSkeleton } from '@/shared/ui'

import { demoBookingFlowFor } from './demoBookingFlow'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * performance_03 → A-03 뷰.
 *
 * 필수 값(식별자·제목)이 없으면 `undefined`를 돌려 화면이 오류로 그리게 한다.
 * 단가·잔여는 **모르면 모르는 채로** 넘긴다 — 0으로 채우면 없는 매진과 0 YoYo 티켓이 생긴다.
 */
function toOptionsView(data: PerformanceDetail): TicketOptionsView | undefined {
  if (data.performanceId == null || !data.title) return undefined

  return {
    performanceId: String(data.performanceId),
    showTitle: data.title,
    dateLabel: data.startAt ? formatKst(data.startAt) : '—',
    venue: data.venueName ?? '—',
    posterImageUrl: data.posterImageUrl,
    // ticketTypeId가 없는 줄은 주문 항목이 될 수 없다(요청이 `ticketTypeId`로 지목한다).
    // 그 외에는 버리지 않는다 — 가격·잔여를 몰라도 이름은 보여 주고 고르지 못하게만 막는다
    ticketTypes: (data.ticketTypes ?? [])
      .filter((t) => t.ticketTypeId != null)
      .map((t) => ({
        ticketTypeId: String(t.ticketTypeId),
        name: t.name ?? '티켓',
        price: t.price?.amount,
        priceApprox: t.price?.display
          ? formatApprox(t.price.display.currency, t.price.display.approx)
          : undefined,
        remaining: t.remainingQuantity,
      })),
  }
}

export function TicketOptionsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const performanceId = toPerformanceId(id)
  const query = usePerformanceDetail(performanceId ?? 0, {
    enabled: !isDemo && performanceId !== undefined,
  })

  const goNext = (selection: { ticketTypeId: string; quantity: number }, routeId: string) =>
    navigate(`/performances/${routeId}/order/choice`, {
      state: { ticketTypeId: Number(selection.ticketTypeId), quantity: selection.quantity },
    })

  // 데모 모드(`pnpm dev:demo`)는 실행 가능한 fixture를 쓰는 별도 모드라 그대로 둔다
  if (isDemo) {
    const flow = demoBookingFlowFor(id)
    return (
      <TicketOptions
        data={flow.ticketOptions}
        onNext={(selection) => goNext(selection, id ?? '12')}
      />
    )
  }

  if (query.isPending && performanceId !== undefined) {
    return (
      <main className="mx-auto min-h-dvh max-w-[1200px] px-4 py-12">
        <PageSkeleton variant="form" />
      </main>
    )
  }

  // 다시 눌러도 낫지 않는 두 경우는 재시도 버튼을 주지 않는다(A-02와 같은 규칙).
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

  const view = query.data && !query.error ? toOptionsView(query.data) : undefined
  if (!view) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">티켓 정보를 불러오지 못했습니다.</p>
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

  // 직접 주소를 열어도 상세 화면과 같은 판매 상태를 요구한다. 최종 판단은 주문 API가 한다.
  if (query.data?.status !== 'ON_SALE')
    return <Navigate replace to={`/performances/${performanceId}`} />

  return (
    <TicketOptions data={view} onNext={(selection) => goNext(selection, String(performanceId))} />
  )
}

export default TicketOptionsPage
