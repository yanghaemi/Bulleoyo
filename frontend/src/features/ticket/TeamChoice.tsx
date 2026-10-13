/**
 * A-04 예매 — 티켓별 응원 팀 배분.
 *
 * 정본 — 와이어프레임 A-04R(모바일 360) · A-04DR(1440) · 화면설계 v6 §4 A-04
 *        · API 명세 v6 API-ticket-01(주문 생성 시 선택 팀을 함께 보낸다)
 *
 * **이 화면이 이 서비스의 핵심이다.** 관객이 산 티켓 수를 참여팀별로 나누고,
 * 그 배분은 결제 뒤 정산 가중치가 된다. 배분 합계는 반드시 주문 티켓 수와 같아야 한다.
 *
 * - 공동 공연에만 나온다. 단독 공연은 A-03에서 곧바로 A-05로 간다(화면설계 v6 A-03 흐름)
 * - 미선택 상태에서는 다음으로 갈 수 없다
 *
 * 관객 화면이라 블록체인 용어를 노출하지 않는다 — "정산에 반영된다"까지만 말한다.
 */

import { useState } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'
import './booking-selection.css'

import { OrderSummary } from '@/features/ticket/OrderSummary'
import type { OrderSummaryData } from '@/features/ticket/OrderSummary'
import {
  BOOKING_STEPS,
  Button,
  FixedBottom,
  MobileHeader,
  Poster,
  QuantityStepper,
  Stepper,
} from '@/shared/ui'

export interface TeamOption {
  teamId: number
  teamName: string
  /**
   * createShow 시점 참여팀 순서. 온체인 `purchase` 인자로 그대로 들어간다.
   *
   * ⚠ **공연 상세(performance_03)의 `ParticipantSummary`에는 이 값이 없다**(teamId·teamName·host뿐).
   * 화면이 배열 순서로 지어내면 안 되는 값이라 선택으로 둔다 — 주문 생성 요청은 `chosenTeamId`만
   * 보내고, 확정된 `teamIndex`는 `POST /orders` 201 응답이 돌려준다(API-ticket-01).
   */
  teamIndex?: number
  posterImageUrl?: string | null
}

export interface TeamChoiceView {
  showTitle: string
  teams: TeamOption[]
  /** 우측 주문 요약(PC) — A-03에서 고른 값 */
  summary: Omit<OrderSummaryData, 'teamName'>
}

interface Props {
  data: TeamChoiceView
  onContinue: (allocations: TeamAllocation[]) => void
}

export interface TeamAllocation {
  teamId: number
  quantity: number
}

export function TeamChoice({ data, onContinue }: Props) {
  const { text } = useLocale()
  const [quantityByTeam, setQuantityByTeam] = useState<Record<number, number>>(() =>
    Object.fromEntries(data.teams.map((team) => [team.teamId, 0])),
  )
  const totalQuantity = data.summary.quantity
  const assignedQuantity = data.teams.reduce(
    (sum, team) => sum + (quantityByTeam[team.teamId] ?? 0),
    0,
  )
  const allocations = data.teams
    .map((team) => ({ teamId: team.teamId, quantity: quantityByTeam[team.teamId] ?? 0 }))
    .filter((allocation) => allocation.quantity > 0)
  const summaryAllocations = allocations.map((allocation) => ({
    teamName: data.teams.find((team) => team.teamId === allocation.teamId)?.teamName ?? '',
    quantity: allocation.quantity,
  }))
  const canContinue = totalQuantity > 0 && assignedQuantity === totalQuantity

  const updateQuantity = (teamId: number, next: number) => {
    setQuantityByTeam((current) => {
      const assignedWithoutTeam = data.teams.reduce(
        (sum, team) =>
          team.teamId === teamId ? sum : sum + (current[team.teamId] ?? 0),
        0,
      )
      const maxForTeam = Math.max(0, totalQuantity - assignedWithoutTeam)
      return { ...current, [teamId]: Math.min(maxForTeam, Math.max(0, next)) }
    })
  }

  return (
    <div className="booking-selection-page min-h-dvh">
      <MobileHeader title={text('티켓 배분', 'Allocate tickets')} />

      <main className="booking-selection-shell">
        <div className="booking-selection-layout">
          <section className="booking-selection-main">
            <Stepper steps={BOOKING_STEPS} active={1} />

            <h1 className="booking-selection-title">
              {text('티켓별 응원 팀 배분', 'Allocate tickets by team')}
            </h1>
            <p className="booking-selection-description">
              {text(
                '구매할 티켓 수만큼 응원할 팀에 나눠 주세요. 결제 후에는 변경할 수 없습니다.',
                'Assign every ticket to a team. You cannot change the allocation after payment.',
              )}
            </p>

            <div className="booking-allocation-progress" aria-live="polite">
              <span>{text('배분 현황', 'Allocation')}</span>
              <strong>
                {text(
                  `${totalQuantity}장 중 ${assignedQuantity}장 배분`,
                  `${assignedQuantity} of ${totalQuantity} tickets assigned`,
                )}
              </strong>
            </div>

            <div
              role="group"
              aria-label={text('팀별 티켓 배분', 'Ticket allocation by team')}
              className="booking-selection-options"
            >
              {data.teams.map((team) => {
                const value = quantityByTeam[team.teamId] ?? 0
                const remaining = totalQuantity - assignedQuantity
                return (
                  <div
                    key={team.teamId}
                    role="group"
                    aria-label={`${team.teamName} ${text('티켓 배분', 'ticket allocation')}`}
                    className="booking-allocation-row"
                    data-assigned={value > 0 || undefined}
                >
                  <span className="w-[52px] shrink-0 md:w-[60px]">
                    {/* 이 자리의 그림은 공연이 아니라 팀이다. 행끼리 구분돼야 하므로
                        팀 ID로 seed를 잡고, 공연 ID와 섞이지 않게 접두사를 붙인다 */}
                    <Poster
                      src={team.posterImageUrl}
                      seed={`team-${team.teamId}`}
                      label={team.teamName}
                      ratio="2/3"
                      className="rounded-[4px]"
                    />
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="block font-sans text-sm font-semibold text-ink md:text-base">
                      {team.teamName}
                    </span>
                    <span className="mt-0.5 block font-sans text-[11px] text-muted md:text-xs">
                      {data.showTitle}
                    </span>
                  </span>
                    <QuantityStepper
                      value={value}
                      min={0}
                      max={value + remaining}
                      onChange={(next) => updateQuantity(team.teamId, next)}
                    />
                  </div>
                )
              })}
            </div>

            <div className="mt-6 hidden md:block">
              <Button disabled={!canContinue} onClick={() => canContinue && onContinue(allocations)}>
                {text('주문 확인', 'Continue to review')}
              </Button>
            </div>

            <div className="h-[72px] md:hidden" />
          </section>

          <aside className="booking-selection-summary hidden min-w-0 [overflow-wrap:anywhere] md:sticky md:top-6 md:block md:self-start">
            <OrderSummary data={{ ...data.summary, teamAllocations: summaryAllocations }} />
          </aside>
        </div>
      </main>

      <FixedBottom>
        <Button
          full
          disabled={!canContinue}
          onClick={() => canContinue && onContinue(allocations)}
        >
          {text('주문 확인', 'Continue to review')}
        </Button>
      </FixedBottom>
    </div>
  )
}
