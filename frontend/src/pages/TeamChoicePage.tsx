/**
 * A-04 관람 목적 팀 선택 페이지 — 라우트 `/performances/:id/order/choice`.
 *
 * ── API (S15P21B204-100) ────────────────────────────────────────────────
 *   참여팀: `GET /api/v1/performances/{performanceId}` (API-performance-03)의 `participants[]`
 *   주문   : `POST /api/v1/orders` (API-ticket-01) — **Idempotency-Key 필수**(§0.8)
 *
 * **주문은 이 화면 끝에서 한 번 만든다.** `OrderCreateRequest`가
 * `{performanceId, items[], chosenTeamId, totalAmount}`를 **한 요청에** 받기 때문이다 —
 * `items`는 A-03, `chosenTeamId`는 여기서 나오므로 둘이 다 모이는 지점이 여기뿐이다.
 * 성공하면 201의 `orderId`로 A-05(`/orders/:orderId/payment?from=:performanceId`)로 간다.
 *
 * ── A-03에서 온 선택 ──────────────────────────────────────────────────
 * `location.state = { ticketTypeId, quantity }`로 받는다(A-03 머리말에 방식과 이유).
 * **없으면 A-03으로 되돌린다.** 새로고침·주소 직접 입력·뒤로가기로 state가 날아간 경우가
 * 그렇다. 수량 1·첫 옵션 같은 기본값을 지어내면 관객이 고르지 않은 티켓을 사게 된다.
 * 이름·단가는 state로 나르지 않고 performance_03을 다시 읽어 맞춘다.
 *
 * ── 멱등키 (§0.8) ─────────────────────────────────────────────────────
 * `newIdempotencyKey()`로 만든 키를 **요청 본문과 짝지어** 보관한다. 실패 후 같은 본문으로
 * 재시도하면 같은 키를 다시 써서 주문이 두 번 생기지 않고, 팀·수량을 바꿔 본문이 달라지면
 * 새 키를 만든다(같은 키 + 다른 본문은 서버가 409로 거절한다).
 *
 * ── 남은 명세 공백 ────────────────────────────────────────────────────
 * 화면설계 v6은 단독 공연이면 A-04를 건너뛰고 A-03 → A-05라고 적었지만, A-05는 `orderId`가
 * 있어야 열리고 주문 생성에는 `chosenTeamId`가 필수다. 단독 공연의 주문을 A-03에서 만들면
 * 생성 지점이 둘로 갈라지므로, 지금은 참여팀이 하나여도 이 화면을 거친다(탭 한 번 더).
 */

import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'

import { formatApprox } from '@/features/member/localeOptions'
import { TeamChoice } from '@/features/ticket/TeamChoice'
import type { TeamAllocation, TeamChoiceView } from '@/features/ticket/TeamChoice'
import { isApiError, newIdempotencyKey } from '@/shared/api/client'
import { PerformanceCode } from '@/shared/api/domains/performance'
import type { PerformanceDetail } from '@/shared/api/domains/performance'
import type { OrderCreateRequest } from '@/shared/api/domains/order'
import { isDemo } from '@/shared/config'
import { useCreateOrder } from '@/shared/queries/order'
import { usePerformanceDetail } from '@/shared/queries/performance'
import { useLocale } from '@/shared/i18n/useLocale'
import { formatKst, PageSkeleton } from '@/shared/ui'

import { demoBookingFlowFor } from './demoBookingFlow'

/** A-03이 넘긴 선택. 둘 중 하나라도 어긋나면 "선택이 없다"로 본다 */
interface OrderSelection {
  ticketTypeId: number
  quantity: number
}

function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** history state는 사용자가 조작할 수도 있는 값이라 모양을 확인하고 받는다 */
function readSelection(state: unknown): OrderSelection | undefined {
  if (typeof state !== 'object' || state === null) return undefined
  const { ticketTypeId, quantity } = state as Record<string, unknown>
  if (!Number.isSafeInteger(ticketTypeId) || (ticketTypeId as number) <= 0) return undefined
  // 수량 상한 4는 요구사항 v6 §7.3 (openapi OrderItemRequest: 1~4)
  if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 4) {
    return undefined
  }
  return { ticketTypeId: ticketTypeId as number, quantity: quantity as number }
}

export function TeamChoicePage() {
  const { text } = useLocale()
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const performanceId = toPerformanceId(id)
  const selection = readSelection(location.state)

  const query = usePerformanceDetail(performanceId ?? 0, {
    enabled: !isDemo && performanceId !== undefined,
  })
  const createOrder = useCreateOrder()
  /** 본문과 짝지은 멱등키. 본문이 그대로면 재시도에도 같은 키를 다시 쓴다(§0.8) */
  const keyRef = useRef<{ signature: string; key: string } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  /* ── 데모 모드는 실행 가능한 fixture를 쓰는 별도 모드라 그대로 둔다 ── */
  if (isDemo) {
    const flow = demoBookingFlowFor(id)
    return (
      <TeamChoice
        data={flow.teamChoice}
        onContinue={() => navigate(`/orders/5501/payment?from=${id ?? '12'}`)}
      />
    )
  }

  // 고르지 않은 티켓을 사게 하지 않는다 — 기본값을 만들지 말고 A-03으로 되돌린다
  if (performanceId === undefined) return <Navigate replace to="/performances" />
  if (!selection) return <Navigate replace to={`/performances/${performanceId}/order`} />

  if (query.isPending) {
    return (
      <main className="mx-auto min-h-dvh max-w-[1200px] px-4 py-12">
        <PageSkeleton variant="form" />
      </main>
    )
  }

  const notFound = isApiError(query.error) && query.error.code === PerformanceCode.NOT_FOUND
  if (notFound) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">공연을 찾을 수 없습니다.</p>
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

  const view = query.data && !query.error ? toChoiceView(query.data, selection) : undefined
  if (!view) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">참여팀 정보를 불러오지 못했습니다.</p>
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

  // 보관된 선택/history로 판매 종료 후 들어와도 주문 화면을 열지 않는다.
  if (query.data?.status !== 'ON_SALE')
    return <Navigate replace to={`/performances/${performanceId}`} />

  // 단가를 모르면 `totalAmount`를 계산할 수 없다. 넘겨짚어 보내면 결제 단계에서
  // PAYMENT_AMOUNT_MISMATCH로 튕기므로 주문을 아예 만들지 않는다
  if (view.totalAmount === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">티켓 가격을 확인하지 못했습니다.</p>
          <p className="mt-1 text-sm text-muted">옵션을 다시 골라 주세요.</p>
          <Link
            to={`/performances/${performanceId}/order`}
            className="mt-4 inline-flex min-h-11 items-center rounded-button border border-line px-4 text-sm font-semibold text-ink"
          >
            옵션 다시 고르기
          </Link>
        </div>
      </main>
    )
  }

  const submit = (allocations: TeamAllocation[]) => {
    const assignedQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)
    if (assignedQuantity !== selection.quantity) {
      setFailure(text('모든 티켓을 팀에 배분해 주세요.', 'Assign every ticket to a team.'))
      return
    }

    const body: OrderCreateRequest = {
      performanceId,
      items: allocations.map(({ teamId, quantity }) => ({
        ticketTypeId: selection.ticketTypeId,
        quantity,
        chosenTeamId: teamId,
      })),
      totalAmount: view.totalAmount as number,
    }
    // 같은 본문이면 같은 키, 본문이 바뀌면 새 키 (§0.8)
    const signature = JSON.stringify(body)
    if (keyRef.current?.signature !== signature) {
      keyRef.current = { signature, key: newIdempotencyKey() }
    }

    setFailure(null)
    createOrder.mutate(
      { body, idempotencyKey: keyRef.current.key },
      {
        onSuccess: (order) => {
          const groupId = order.orderGroupId ?? order.orderId
          if (groupId == null) {
            setFailure('주문 번호를 받지 못했습니다. 잠시 후 다시 시도해 주세요.')
            return
          }
          // 잔액이 모자라도(`shortfall > 0`) 주문은 살아 있다(v5 §7). 안내는 A-05가 한다
          navigate(`/orders/${groupId}/payment?from=${performanceId}`)
        },
        onError: (error) => {
          setFailure(
            isApiError(error) ? error.msg : '주문을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
          )
        },
      },
    )
  }

  return (
    <>
      {failure && (
        <p role="alert" className="bg-danger/10 px-4 py-3 text-center text-sm text-danger">
          {failure}
        </p>
      )}
      <TeamChoice
        data={view}
        onContinue={(allocations) => {
          if (createOrder.isPending) return
          submit(allocations)
        }}
      />
    </>
  )
}

/**
 * performance_03 + A-03 선택 → A-04 뷰.
 *
 * 합계는 **여기서 계산한다** — 주문 생성 전이라 서버 `display`가 없다(§5.4 예외).
 * 고른 옵션이 응답에서 사라졌거나 단가를 모르면 `totalAmount`를 `undefined`로 둔다(0이 아니다).
 */
function toChoiceView(
  data: PerformanceDetail,
  selection: OrderSelection,
): (TeamChoiceView & { totalAmount?: number }) | undefined {
  if (data.performanceId == null || !data.title) return undefined

  const chosen = (data.ticketTypes ?? []).find((t) => t.ticketTypeId === selection.ticketTypeId)
  const unitPrice = chosen?.price?.amount
  const totalAmount = unitPrice != null ? unitPrice * selection.quantity : undefined

  // teamId·teamName이 없는 참여팀은 고를 수 없다(요청이 `chosenTeamId`로 지목한다)
  const teams = (data.participants ?? [])
    .filter((p) => p.teamId != null && p.teamName)
    .map((p) => ({ teamId: p.teamId as number, teamName: p.teamName as string }))
  if (teams.length === 0) return undefined

  return {
    showTitle: data.title,
    teams,
    totalAmount,
    summary: {
      performanceId: String(data.performanceId),
      showTitle: data.title,
      dateLabel: data.startAt ? formatKst(data.startAt) : '—',
      venue: data.venueName ?? '—',
      posterImageUrl: data.posterImageUrl,
      ticketTypeName: chosen?.name ?? '티켓',
      quantity: selection.quantity,
      // 합계를 모르면 요약에 0 YoYo 대신 아무것도 못 그리지만, 그 경우 위에서 주문을 막는다
      totalAmount: totalAmount ?? 0,
      totalApprox: chosen?.price?.display
        ? formatApprox(
            chosen.price.display.currency,
            chosen.price.display.approx * selection.quantity,
          )
        : undefined,
    },
  }
}

export default TeamChoicePage
