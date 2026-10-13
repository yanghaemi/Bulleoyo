import { useLocale } from '@/shared/i18n/useLocale'
/**
 * P-08 정산 대시보드.
 *
 * 정본 — 화면설계 v6 §4 P-08(영역 구성·레이아웃·컴포넌트 표 11행·상태·입력 검증·접근성)
 *        · §5.1 상태 배지 · §5.13 KST 병기 · §5.19 액션 버튼 배치 · §5.21 표 → 패널 접기
 *        · API 명세 v6 `settlement_01`(조회) · `settlement_02`(집계 확정) · `settlement_03`(잠금)
 *          · `settlement_04`(이의제기) · `settlement_05`(release) · `settlement_06`(공유 링크)
 *
 * 본문 순서는 P-08 **영역 구성** 그대로다 —
 * 정산 단계 표시 → 팀별 분배액 목록 → release tx 패널 → 보증금 반환 패널 → 이의제기 내역 →
 * 정산 공유 링크 패널. 레이아웃 항목이 PC에서 이 여섯을 좌 2/3(목록·이의)와 우 1/3(패널들)로
 * 나누라고 정했으므로 **순서를 지키면서 두 열에 나눠 담는다**.
 *
 * **버튼 활성은 상태(`status`)가 아니라 `actions.{...}.available`로만 판단한다.**
 * 어떤 단계에서 무엇이 가능한지는 서버가 정한다(settlement_01 설명: "버튼 활성 조건을 서버가 정한다").
 * 화면이 상태로 추론하면 서버 규칙이 바뀔 때 조용히 어긋난다.
 *
 * **낙관적 UI를 쓰지 않는다.** `available: true`여도 실행은 409로 실패할 수 있다 —
 * 집계 대사(`SETTLEMENT_AGGREGATE_MISMATCH`)와 release 직전 에스크로 잔액
 * (`COIN_ESCROW_INSUFFICIENT`)은 체인을 읽어야 알 수 있어 조회 시점에 미리 판단하지 못한다(BE 확인).
 * 그래서 눌린 즉시 단계를 넘기지 않고, 실행 결과가 돌아온 뒤에만 상태를 갱신한다.
 *
 * 막힌 이유(`blockedReason`)와 실행 실패(`code`)는 **같은 표**(`settlementMessages.ts`)를 쓴다.
 * 사전 차단 안내와 사후 실패 안내가 다른 말을 하면 안 된다.
 *
 * `HALTED`에는 재개 버튼이 없다(v6 변경 ①) — 되돌아올 수 없는 종단이다.
 * 모바일에서는 하단 고정을 비우고 중단 사유 배너를 상단 고정으로 올린다(P-08 레이아웃).
 *
 * 이 화면의 액션은 전부 **운영자 실행(서명 없음)** 이다(컴포넌트 표). 서명 단계 컴포넌트(§5.14)를
 * 쓰지 않고 `senderSignedRlp`·개인키를 다루지 않는다.
 *
 * 껍데기(사이드 메뉴·드로어)는 `StudioShell`이 맡는다. 관객 하단 탭바는 쓰지 않는다.
 *
 * 이 컴포넌트는 데이터를 직접 받지 않는다 — `pages/SettlementPage`가 훅으로 받아 넘긴다.
 * 아래는 그 페이지가 무엇에 붙어 있는지와 **화면이 다뤄야 할 에러 코드 목록**이다(연결 완료).
 *
 * 붙은 API
 *   조회:   settlement_01 `GET /api/v1/performances/{performanceId}/settlement` → `SettlementData`
 *           에러 `SETTLEMENT_NOT_PARTICIPANT`(403) · `PERFORMANCE_NOT_FOUND`(404) · `COMMON_UNAUTHORIZED`(401)
 *   집계:   settlement_02 `POST …/settlement/aggregate` → 202 7필드(S15P21B204-92로 명세를 실제
 *           응답에 맞췄다. 도메인 함수는 그중 `jobId`·`status`·`pollAfterMs`만 좁혀 받는다)
 *           409 `PERFORMANCE_INVALID_STATUS` · `COMMON_CONFLICT` · `COIN_MINT_PENDING` · `SETTLEMENT_AGGREGATE_MISMATCH`
 *   잠금:   settlement_03 `POST …/settlement/lock` → 202
 *           409 `SETTLEMENT_NOT_LOCKED` · `SETTLEMENT_AGGREGATE_MISMATCH` · `COMMON_CONFLICT` · `PERFORMANCE_INVALID_STATUS`
 *   동의:   settlement_08 `POST …/settlement/approvals` → **201 동기**(온체인 작업이 아니다)
 *           `{ teamId, approvedAt, approvedCount, requiredCount, releaseUnlocked }`. 참여팀 리더만.
 *           전원(주최팀 포함)이 동의하면 48시간 이의제기 기간을 기다리지 않고 release가 열린다
 *           403 `COMMON_FORBIDDEN`·`SETTLEMENT_NOT_PARTICIPANT` · 409 `SETTLEMENT_NOT_LOCKED`
 *               · `COMMON_CONFLICT`(이미 동의 / 이의를 취소해야 함 — 서버 `msg`가 구분한다, §5.5)
 *   이의:   settlement_04 `POST …/disputes` → **201 동기**(온체인 작업이 아니다) `{ disputeId, status, releaseHeld }`
 *           400 `COMMON_VALIDATION_FAILED`(사유 길이) · 403 `COMMON_FORBIDDEN`·`SETTLEMENT_NOT_PARTICIPANT`
 *           409 `SETTLEMENT_NOT_LOCKED` · `SETTLEMENT_ALREADY_RELEASED` · `COMMON_CONFLICT`(= `SETTLEMENT_DISPUTE_CLOSED`)
 *   release: settlement_05 `POST …/settlement/release` → 202. **`Idempotency-Key` 헤더 필수**(없으면 400)
 *           409 `SETTLEMENT_NOT_LOCKED` · `SETTLEMENT_DISPUTE_PERIOD` · `SETTLEMENT_ALREADY_RELEASED`
 *               · `COIN_ESCROW_INSUFFICIENT` · `COIN_RESERVE_MISMATCH`(= `COIN_SUPPLY_MISMATCH`)
 *   공유:   settlement_06 `POST …/settlement/share-link` → 201 `{ shareUrl, shareToken, issuedAt }`
 *           409 `PERFORMANCE_INVALID_STATUS`(정산이 아직 NONE). 재발급하면 이전 토큰이 무효화된다
 *   폴링:   202를 받은 뒤 `GET /api/v1/chain/jobs/{jobId}`를 `pollAfterMs` 간격으로 조회한다.
 *           `status`가 CONFIRMED/FAILED가 될 때까지 "처리 중"을 유지하고, release는 팀별 부분 성공이
 *           `results` 배열로 오므로 그것으로 팀별 `released`를 갱신한다.
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { TeamPayoutChart } from '@/shared/charts'
import { StudioHeading } from '@/features/studio/StudioStates'
import { PageSkeleton } from '@/shared/ui/PageSkeleton'
import {
  Button,
  ConfirmDialog,
  DepositStatusBadge,
  FixedBottom,
  InfoRow,
  SettlementStatusBadge,
  formatYoyo,
  formatKst,
  shortenHex,
} from '@/shared/ui'
import type { DepositStatus, SettlementStatus } from '@/shared/ui'
import { useClipboard } from '@/features/studio/useClipboard'
import { ReleaseDoneDialog } from '@/features/studio/ReleaseDoneDialog'
import { useReleaseDoneNotice } from '@/features/studio/useReleaseDoneNotice'
import type { Clipboard } from '@/features/studio/useClipboard'
import {
  SETTLEMENT_ACTION_LABEL,
  formatRemaining,
  settlementMessage,
} from '@/features/studio/settlementMessages'
import type { SettlementActionKey } from '@/features/studio/settlementMessages'

/* ── 타입 ─────────────────────────────────────────────────────────────

   2026-09-16 실 API 연결(S15P21B204-102)에서 **손으로 옮겨 적은 응답 타입을 지우고**
   `@/shared/api/domains/settlement`의 도메인 타입 별칭으로 바꿨다. 손으로 쓴 쪽은
   `dustTeamId`·`rulesHash`를 필수로 적었는데 서버는 집계 전 정산에서 둘 다 null로 준다.
   좁히기는 매퍼(`toSettlementData`)가 한 번만 한다 — 여기서 다시 좁히지 않는다.

   재export를 남기는 이유는 호출부(페이지·테스트)가 이미 이 이름들을 여기서 가져가기 때문이다.  */

export type {
  SettlementActionState,
  SettlementActions,
  SettlementData,
  SettlementDeposit,
  SettlementDispute,
  SettlementMyTeam,
  SettlementRate,
  SettlementShareLink,
  SettlementShareRow,
  SettlementTransaction,
} from '@/shared/api/domains/settlement'

import type {
  SettlementData,
  SettlementDispute,
  SettlementShareLink,
} from '@/shared/api/domains/settlement'

/**
 * 액션 실행 결과. 성공이면 `ok`, 실패면 응답 `code`(분기 키)와 `msg`(표시용, §5.5)를 담는다.
 *
 * 202 → 폴링 → 확정까지 끝난 뒤에 resolve하는 것을 전제로 한다. 접수만으로 성공이라고
 * 말하면 체인에서 실패한 작업이 성공으로 보인다.
 */
export interface SettlementActionResult {
  ok: boolean
  code?: string
  msg?: string
  /**
   * [2026-09-24] 사용자가 본인 확인(패스키)을 닫았다 — **실패가 아니다.** 문구 없이 원래 상태로 돌린다.
   */
  cancelled?: boolean
}

/** 공유 링크 생성 결과 */
export interface SettlementShareLinkResult extends SettlementActionResult {
  link?: SettlementShareLink
}

/* ── 포맷 ─────────────────────────────────────────────────────────────── */

/** basis point → 퍼센트 문자열. 6000 → "60%" (10000 = 100%) */
function bpToPercent(bp: number): string {
  const pct = bp / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`
}

function formatCount(n: number): string {
  return n.toLocaleString('ko-KR')
}

/** 값이 없을 때의 자리표시. 빈칸으로 두면 "0"인지 "없음"인지 구분되지 않는다 */
const EMPTY = '—'

/* ── 클립보드 ─────────────────────────────────────────────────────────── */

/*
 * 복사 훅은 `useClipboard.ts`로 올라갔다(2026-09-09 P-02 작업).
 * P-02 리더 지갑 패널·거래 이력도 같은 규칙으로 복사하므로 구현이 한 벌이어야 한다.
 */

/* ── 정산 단계 표시 ───────────────────────────────────────────────────── */

/** 진행 단계. §5.1 라벨을 그대로 쓴다. `HALTED`는 이 줄 밖의 종단이라 여기 없다 */
const STEP_ORDER: SettlementStatus[] = ['NONE', 'AGGREGATED', 'LOCKED', 'DISPUTE_OPEN', 'RELEASED']

const STEP_LABEL: Record<SettlementStatus, [string, string]> = {
  NONE: ['정산 전', 'Not started'],
  AGGREGATED: ['집계 확정', 'Aggregated'],
  LOCKED: ['정산 잠금', 'Locked'],
  DISPUTE_OPEN: ['이의제기 기간', 'Dispute window'],
  RELEASED: ['수령 완료', 'Received'],
  HALTED: ['정산 중단', 'Halted'],
}

/** 단계마다 붙는 시각. `disputeClosesAt`만 지난 일이 아니라 **마감**이라 라벨이 다르다 */
function stepTime(
  step: SettlementStatus,
  data: SettlementData,
  text: (ko: string, en: string) => string,
): { label: string; iso: string } | undefined {
  const pick = (label: string, iso?: string | null) => (iso ? { label, iso } : undefined)
  switch (step) {
    case 'AGGREGATED':
      return pick(text('확정', 'Confirmed'), data.aggregatedAt)
    case 'LOCKED':
      return pick(text('잠금', 'Locked'), data.lockedAt)
    case 'DISPUTE_OPEN':
      return pick(text('마감', 'Closed'), data.disputeClosesAt)
    case 'RELEASED':
      return pick(text('수령', 'Received'), data.releasedAt)
    default:
      return undefined
  }
}

/**
 * 정산 단계 표시 — P-08 컴포넌트 표 1행.
 *
 * PC는 폭 100% 가로 스텝, 모바일은 가로 스크롤 스텝 바(레이아웃 항목).
 * 상태를 **색으로만** 알리지 않는다 — 지난 단계에 `✓`, 현재 단계에 "현재" 글자를 함께 둔다.
 *
 * ⚠ `HALTED`가 다섯 단계 중 어디에 놓이는지는 명세에 없다. 되돌아올 수 없는 종단이므로
 * 진행선 끝에 별도 종단 칸으로 붙이고, 그때까지 실제로 지난 단계만 `✓`로 남긴다
 * (상태값이 `HALTED`면 진행 위치를 알 수 없어 시각 유무로 판단한다).
 */
function StepBar({ data }: { data: SettlementData }) {
  const { text } = useLocale()
  const halted = data.status === 'HALTED'
  const currentIndex = halted ? -1 : STEP_ORDER.indexOf(data.status)

  /** 지난 단계인가. `HALTED`는 진행 위치가 없으므로 기록된 시각으로만 판단한다 */
  const isDone = (step: SettlementStatus, index: number): boolean => {
    if (!halted) return index < currentIndex
    if (step === 'NONE') return true
    if (step === 'AGGREGATED') return Boolean(data.aggregatedAt)
    if (step === 'LOCKED' || step === 'DISPUTE_OPEN') return Boolean(data.lockedAt)
    return Boolean(data.releasedAt)
  }

  return (
    <section aria-label={text('정산 단계', 'Settlement progress')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('정산 단계', 'Settlement progress')}
      </h2>
      {/*
        모바일은 가로 스크롤(레이아웃 항목). 스크롤 컨테이너(바깥)와 넓어지는 내용(안쪽 `min-w-max`)을
        **다른 요소로 나눠야** 한다 — 같은 요소에 둘 다 걸면 스크롤이 생기지 않고 부모를 뚫고 나간다.
        PC에서는 `md:min-w-0`으로 풀어 다섯 칸이 폭 100%를 나눠 갖는다.
      */}
      <div className="overflow-x-auto">
        <ol className="m-0 flex w-full min-w-max list-none gap-2 p-0 md:min-w-0 md:gap-3">
          {STEP_ORDER.map((step, index) => {
            const done = isDone(step, index)
            const current = index === currentIndex
            const when = stepTime(step, data, text)
            return (
              <li
                key={step}
                aria-current={current ? 'step' : undefined}
                className={[
                  'min-w-32 flex-1 rounded-card border bg-surface px-3 py-2.5 md:px-4',
                  current ? 'border-primary' : done ? 'border-line' : 'border-line opacity-60',
                ].join(' ')}
              >
                <p className="m-0 flex items-center gap-1 font-sans text-[11px] font-semibold text-muted">
                  {/* 색만으로 알리지 않는다 — 지난 단계는 글자로도 표시한다 */}
                  <span aria-hidden>{done ? '✓' : `${index + 1}`}</span>
                  <span>
                    {current
                      ? text('현재', 'Current')
                      : done
                        ? text('완료', 'Complete')
                        : text('대기', 'Pending')}
                  </span>
                </p>
                <p className="m-0 mt-0.5 font-sans text-[13px] font-bold text-ink">
                  {text(...STEP_LABEL[step])}
                </p>
                {when && (
                  <p className="m-0 mt-0.5 font-sans text-[11px] text-muted">
                    {when.label} <span className="font-mono">{formatKst(when.iso)}</span>
                  </p>
                )}
              </li>
            )
          })}

          {halted && (
            // 종단 중단 칸. 진행선의 끝이지만 `RELEASED`와 다른 끝이라는 것이 보여야 한다
            <li className="min-w-32 flex-1 rounded-card border border-danger bg-surface px-3 py-2.5 md:px-4">
              <p className="m-0 font-sans text-[11px] font-semibold text-muted">
                {text('종단', 'Final')}
              </p>
              <p className="m-0 mt-0.5 font-sans text-[13px] font-bold text-ink">
                {text(...STEP_LABEL.HALTED)}
              </p>
              <p className="m-0 mt-0.5 font-sans text-[11px] text-muted">
                {text('재개할 수 없습니다', 'Cannot be resumed')}
              </p>
            </li>
          )}
        </ol>
      </div>
    </section>
  )
}

/* ── HALTED 중단 배너 ─────────────────────────────────────────────────── */

/**
 * `HALTED` 중단 사유 배너 — P-08 **상태** 항목.
 *
 * 모바일에서는 **상단 고정**(레이아웃 항목)이라 `sticky top-0`이고, PC에서는 본문 흐름에 둔다.
 *
 * 중단 경로는 둘이다(v6 변경 ①) — ⓐ 공연 취소 ⓑ 관리자가 집계를 되돌릴 수 없다고 판정해
 * 전액 환불을 결정. 둘을 구분하는 필드가 응답에 없으므로 두 경로를 모두 적는다.
 *
 * ⚠ **일괄 환불 진행률을 표시하지 못한다.** P-08 상태 항목은 "일괄 환불 진행률·보증금 반환 예정"을
 * 요구하는데 `Settlement` 스키마에 진행률(환불 완료 건수/전체) 필드도 중단 사유 필드도 없다.
 * 값을 지어내지 않고, 있는 사실(전 티켓 환불 → 환불 완료 후 보증금 반환, P-10 절)만 적었다.
 * 명세 개정이 필요한 지점이다.
 */
function HaltedBanner() {
  const { text } = useLocale()
  return (
    <section
      role="alert"
      aria-label={text('정산 중단', 'Settlement halted')}
      className="sticky top-0 z-10 rounded-card border border-danger bg-surface px-4 py-3 md:static md:px-5"
    >
      <p className="m-0 font-sans text-[13px] font-semibold text-ink md:text-sm">
        {text(
          '정산이 중단됐습니다 — 되돌릴 수 없습니다',
          'Settlement has been halted and cannot be resumed',
        )}
      </p>
      <p className="m-0 mt-1 font-sans text-[11px] leading-relaxed text-muted md:text-xs">
        {text(
          '공연이 취소됐거나, 관리자가 집계를 되돌릴 수 없다고 판정해 전액 환불을 결정한 경우입니다. 집계 확정·정산 잠금·release를 모두 실행할 수 없고 재개 경로도 없습니다. 전 티켓이 관객 지갑으로 일괄 환불되며, 환불이 끝나면 보증금이 반환됩니다.',
          'The show was cancelled, or an administrator determined that settlement cannot proceed and approved full refunds. Aggregation, locking and release are disabled. All tickets are refunded to audience wallets, followed by the deposit.',
        )}
      </p>
    </section>
  )
}

/* ── 팀별 분배액 목록 ─────────────────────────────────────────────────── */

/**
 * 표의 열 머리글. 이 배열이 PC 표와 모바일 패널의 **공통 순서**를 갖는다(§5.21).
 * 첫 열(팀명)은 패널 제목이 되므로 여기 없다. 순서는 컴포넌트 표의 나열 순서 그대로다 —
 * 팀명 · 분배액 · 입금 지갑 주소 · Received 배지 · 수령 시각 · release tx 링크.
 *
 * ⚠ **동의 열은 표에 없던 것을 더한 것이다**(settlement_08). 배지 두 개(동의·수령)를 붙여 두면
 * 한 줄에서 "동의했는데 아직 못 받았다"가 바로 읽힌다. 동의가 수령보다 먼저 일어나므로 앞에 둔다.
 */
const SHARE_COLUMNS = [
  ['분배액', 'Payout'],
  ['입금 지갑 주소', 'Receiving wallet'],
  ['동의', 'Approved'],
  ['수령', 'Received'],
  ['수령 시각', 'Received at'],
  ['release tx', 'Release transaction'],
] as const

/**
 * `Received` 배지 — 컴포넌트 표가 이름까지 못박은 배지다(`released === true`).
 *
 * ⚠ `SettlementStatusBadge`·`DepositStatusBadge`에는 이 값이 없다. 팀 한 줄의 수령 여부는
 * 정산 상태·보증금 상태와 다른 축이라 기존 배지에 값을 더하지 않고 여기 지역 배지로 뒀다.
 * 미수령도 **빈칸으로 두지 않는다** — 색·유무로만 알리면 "아직"인지 "값 없음"인지 모른다.
 */
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
      {received ? text('수령 완료', 'Received') : text('수령 전', 'Pending')}
    </span>
  )
}

/**
 * 조기 동의 배지 — `shares[].approved`(settlement_08). `ReceivedBadge`와 같은 규격이다.
 *
 * 미동의도 빈칸으로 두지 않는다. 전원이 차야 48시간을 건너뛰므로 "누가 안 했는가"가 정보다.
 * 동의 시각은 `title`로만 둔다 — 열을 하나 더 늘리면 좌측 2/3 폭을 넘긴다(수령 시각에서 겪었다).
 */
function ApprovedBadge({ approved, at }: { approved?: boolean; at?: string | null }) {
  const { text } = useLocale()
  // 서버가 안 알려준 것(`undefined`)을 "동의 전"으로 단정하지 않는다 — 빈칸이 낫다
  if (approved === undefined) return <span className="text-muted">{EMPTY}</span>
  return (
    <span
      title={approved && at ? formatKst(at) : undefined}
      className={[
        'inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip border px-2',
        'font-sans text-[11px] font-semibold',
        approved ? 'border-ok text-ok' : 'border-line text-muted',
      ].join(' ')}
    >
      {approved ? text('동의함', 'Approved') : text('동의 전', 'Not yet')}
    </span>
  )
}

/**
 * 동의한 팀 수 / 전체 팀 수. `shares[]`가 유일한 근거다 — 조회 응답에 합계 필드가 없다.
 *
 * 한 팀이라도 `approved`가 `undefined`면 **세지 않는다**. 모르는 것을 0으로 세면
 * "3개 팀이 남았습니다" 같은 틀린 단정이 화면에 나간다.
 */
function approvalCount(data: SettlementData): { approved: number; total: number } | undefined {
  if (data.shares.length === 0) return undefined
  if (data.shares.some((s) => s.approved === undefined)) return undefined
  return { approved: data.shares.filter((s) => s.approved).length, total: data.shares.length }
}

/**
 * 헤더 우측에 무엇을 둘까 — 이의제기 마감 카운트다운 / 전원 동의 안내 / 아무것도.
 *
 * **전원 동의 && 열린 이의 없음이면 카운트다운을 숨긴다**(9/24 사용자 요청). 그때 release 게이트는
 * 48시간을 건너뛰고(API-settlement-05 · `SettlementGates#release`) 자동 release 스케줄 후보가 된다
 * (API-settlement-08 처리 4) — 남은 시간은 더는 지급 시점을 말하지 않는다.
 *
 * ⚠ **열린 이의가 있으면 카운트다운을 남긴다.** 명세 API-settlement-05 409 표가 "열린 이의 존재
 * (전원 동의여도 막힘)"이라 적었다 — 그때 "곧 지급됩니다"는 거짓이다. 동의한 팀도 마감 전에는
 * 이의를 낼 수 있으므로(`SettlementShare#approvedAt` javadoc) 마감은 그 동안 여전히 의미가 있다.
 * 명세에 카운트다운 규칙 자체는 없어 이 조건은 화면설계 v8.6 P-08 상태 항목에 함께 적었다.
 *
 * 끝난 정산(`RELEASED`·`HALTED`)에는 둘 다 두지 않는다 — 전원 동의로 일찍 지급되면
 * `disputeClosesAt`이 아직 미래라, 종전에는 "지급 완료" 화면에 마감 카운트다운이 남았다.
 */
function headerNotice(
  data: SettlementData,
  now: number = Date.now(),
): { kind: 'countdown'; remaining: string } | { kind: 'allApproved' } | undefined {
  if (data.status === 'RELEASED' || data.status === 'HALTED') return undefined
  const counts = approvalCount(data)
  const allApproved = counts !== undefined && counts.approved === counts.total
  const openDispute = data.disputes.some((d) => d.status === 'OPEN')
  if (allApproved && !openDispute) return { kind: 'allApproved' }
  const remaining = formatRemaining(data.disputeClosesAt, now)
  return remaining ? { kind: 'countdown', remaining } : undefined
}

/** 지갑 주소 — 축약 표시 + 전체 복사. 공연자 화면이라 주소 노출이 허용된다(§1.2 원칙 11) */
function WalletAddress({
  address,
  copyKey,
  clipboard,
}: {
  address: string
  copyKey: string
  clipboard: Clipboard
}) {
  const { text } = useLocale()
  const active = clipboard.copiedKey === copyKey
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[13px] text-ink" title={address}>
        {shortenHex(address)}
      </span>
      <button
        type="button"
        aria-label={text('입금 지갑 주소 복사', 'Copy receiving wallet address')}
        title={address}
        onClick={() => clipboard.copy(copyKey, address)}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-control text-muted transition-colors duration-150 ease-out hover:bg-ground-2 hover:text-ink md:h-8 md:w-8"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <rect
            x="4.5"
            y="4.5"
            width="7"
            height="7"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M9.5 2.5H3a1 1 0 0 0-1 1v6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      </button>
      {active && (
        <span role="status" className="font-sans text-[11px] text-muted">
          {clipboard.failed ? text('복사 실패', 'Copy failed') : text('복사됨', 'Copied')}
        </span>
      )}
    </span>
  )
}

/** release tx 링크. `shares[]`에 팀별 해시가 없어 정산 단위 RELEASE tx로 보낸다(아래 ⚠ 참고) */
function TxLink({ url, hash }: { url?: string; hash?: string | null }) {
  if (!url || !hash) return <span className="font-sans text-[13px] text-muted">{EMPTY}</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[13px] text-primary underline underline-offset-2"
    >
      {shortenHex(hash)}
    </a>
  )
}

function TeamShareList({ data, clipboard }: { data: SettlementData; clipboard: Clipboard }) {
  const { text } = useLocale()
  /**
   * ⚠ `SettlementShare`에는 팀별 release txHash가 없다. 정산 단위 `releaseTxHash` 하나뿐이라
   * 수령한 팀은 모두 같은 tx를 가리킨다. release는 팀별 부분 성공을 허용하므로(settlement_05)
   * 실제로는 팀마다 다른 tx일 수 있다 — 응답에 팀별 해시를 더하는 명세 개정이 필요하다.
   */
  const releaseTx = data.transactions.find((t) => t.type === 'RELEASE')
  const teams = data.shares

  return (
    <section aria-label={text('팀별 분배액', 'Team payouts')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('팀별 분배액', 'Team payouts')}
      </h2>

      {/*
        ⚠ 이 요약 줄은 컴포넌트 표에 없다. 표가 요구한 6개 열은 그대로 두고, 열을 늘리는 대신
        "무엇을 나눈 것인가"(분배 대상액)와 규칙 비율만 목록 머리에 한 줄로 뒀다.
        전부 응답 필드 그대로이며 계산하지 않는다(`distributableAmount`·`fixedRatioBp`·`selectionRatioBp`).
      */}
      <p className="m-0 mb-2 font-sans text-[11px] text-muted md:text-xs">
        {text('분배 대상액', 'Distributable amount')}{' '}
        <span className="font-num tabular-nums text-ink">
          {formatYoyo(data.distributableAmount)}
        </span>
        {' · '}
        {text('고정', 'Fixed')}{' '}
        <span className="font-num tabular-nums text-ink">{bpToPercent(data.fixedRatioBp)}</span>
        {' / '}
        {text('선택', 'Choice')}{' '}
        <span className="font-num tabular-nums text-ink">{bpToPercent(data.selectionRatioBp)}</span>
      </p>

      {teams.length === 0 ? (
        // §5.7 — 아이콘 없이 안내 문구만. 집계 전에는 분배액 자체가 없다
        <p
          role="status"
          className="m-0 rounded-card border border-line bg-surface px-4 py-14 text-center font-sans text-[13px] text-muted"
        >
          {text(
            '집계가 확정되면 팀별 분배액이 나옵니다',
            'Team payouts appear after aggregation is confirmed.',
          )}
        </p>
      ) : (
        <>
          <TeamPayoutChart shares={teams} distributableAmount={data.distributableAmount} />

          {/* ── PC: 표 ── */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {/* 한글은 `break-keep`(word-break: keep-all)으로 **단어 단위**로만 끊는다.
                      기본값은 글자 단위라 좁은 열에서 "블 루 노 트"처럼 쪼개졌다(1280px에서 확인).
                      줄바꿈 자체를 막으면(nowrap) 이번엔 표가 좌측 2/3 폭을 넘어 잘린다 — 실측 662px vs 543px */}
                  <th
                    scope="col"
                    className="px-2.5 py-2.5 font-sans text-[11px] font-semibold text-muted break-keep"
                  >
                    {text('팀명', 'Team name')}
                  </th>
                  {SHARE_COLUMNS.map((c) => (
                    <th
                      key={c[0]}
                      scope="col"
                      className="px-2.5 py-2.5 font-sans text-[11px] font-semibold text-muted break-keep"
                    >
                      {text(c[0], c[1])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.teamId} className="border-b border-line last:border-b-0">
                    <th
                      scope="row"
                      className="px-2.5 py-3 font-sans text-[13px] font-bold text-ink break-keep"
                    >
                      {t.teamName}
                      {t.teamId === data.myTeam?.teamId && (
                        <span className="ml-1 font-normal text-muted">
                          {text('(우리 팀)', '(Your team)')}
                        </span>
                      )}
                    </th>
                    <td className="px-2.5 py-3 font-num text-[13px] tabular-nums text-ink">
                      {formatYoyo(t.totalAmount)}
                    </td>
                    <td className="px-2.5 py-3">
                      <WalletAddress
                        address={t.walletAddress}
                        copyKey={`addr-${t.teamId}`}
                        clipboard={clipboard}
                      />
                    </td>
                    <td className="px-2.5 py-3">
                      <ApprovedBadge approved={t.approved} at={t.approvedAt} />
                    </td>
                    <td className="px-2.5 py-3">
                      <ReceivedBadge received={t.released} />
                    </td>
                    <td className="px-2.5 py-3 font-sans text-[13px] text-ink">
                      {t.releasedAt ? formatKst(t.releasedAt) : EMPTY}
                    </td>
                    <td className="px-2.5 py-3">
                      <TxLink
                        url={t.released ? releaseTx?.explorerUrl : undefined}
                        hash={t.released ? releaseTx?.txHash : undefined}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 모바일: 행 하나 = 패널 하나(§5.21). 열 순서는 PC 표와 같다 ── */}
          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
            {teams.map((t) => (
              <li key={t.teamId} className="rounded-card border border-line bg-surface px-4 py-3">
                <span className="block font-sans text-[13px] font-bold text-ink">
                  {t.teamName}
                  {t.teamId === data.myTeam?.teamId && (
                    <span className="ml-1 font-normal text-muted">
                      {text('(우리 팀)', '(Your team)')}
                    </span>
                  )}
                </span>
                <InfoRow label={text(...SHARE_COLUMNS[0])}>
                  <span className="font-num tabular-nums">{formatYoyo(t.totalAmount)}</span>
                </InfoRow>
                <InfoRow label={text(...SHARE_COLUMNS[1])}>
                  <WalletAddress
                    address={t.walletAddress}
                    copyKey={`m-addr-${t.teamId}`}
                    clipboard={clipboard}
                  />
                </InfoRow>
                <InfoRow label={text(...SHARE_COLUMNS[2])}>
                  <ApprovedBadge approved={t.approved} at={t.approvedAt} />
                </InfoRow>
                <InfoRow label={text(...SHARE_COLUMNS[3])}>
                  <ReceivedBadge received={t.released} />
                </InfoRow>
                <InfoRow label={text(...SHARE_COLUMNS[4])}>
                  {t.releasedAt ? formatKst(t.releasedAt) : EMPTY}
                </InfoRow>
                <InfoRow label={text(...SHARE_COLUMNS[5])}>
                  <TxLink
                    url={t.released ? releaseTx?.explorerUrl : undefined}
                    hash={t.released ? releaseTx?.txHash : undefined}
                  />
                </InfoRow>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 수령 완료 안내 — 컴포넌트 표의 문장을 한 글자도 바꾸지 않고 그대로 쓴다 */}
      <p className="m-0 mt-2 font-sans text-[11px] leading-relaxed text-muted md:text-xs">
        {text(
          'release가 확정되면 정산금이 각 팀 리더 지갑에 그대로 들어옵니다. 이후 별도 절차는 없습니다.',
          'Once release is confirmed, payouts arrive directly in each team leader’s wallet. No further action is needed.',
        )}
      </p>
    </section>
  )
}

/* ── 정산 조기 동의 ───────────────────────────────────────────────────── */

/**
 * 정산 조기 동의 — settlement_08. 좌측(참여자 열)에 둔다.
 *
 * **왜 `OPERATOR_ACTIONS`(우측 액션 패널)가 아닌가.** 컴포넌트 표는 운영자 실행 3종
 * (집계 확정·정산 잠금·release)을 한 행으로, 참여팀 리더가 누르는 이의제기를 다른 행으로
 * 나눠 놓았다. 동의는 **참여팀 리더**가 자기 팀 몫에 대해 누르는 액션이라 이의제기와 같은 부류다 —
 * 우측 패널에 끼워 넣으면 "여기 있는 버튼은 주최자 것"이라는 그 구분이 깨진다. 그래서
 * 이의제기 바로 위, 팀별 분배액 표 아래에 둔다(동의 → (문제가 있으면) 이의 순서로 읽힌다).
 *
 * 활성 판단은 다른 액션과 똑같이 **오직 `actions.approve.available`** 이다. `myTeam.approved`는
 * 조건이 아니라 표시다 — 이미 동의한 팀에 무엇을 보여줄지만 정한다.
 *
 * 동의 현황 `n/m`을 버튼 옆에 둔다. release가 왜 아직 막혀 있는지를 설명하는 숫자다.
 */
function ApprovalSection({
  data,
  pending,
  hideButton,
  failure,
  onRequest,
}: {
  data: SettlementData
  pending: boolean
  /** 모바일 하단 고정으로 올라간 경우 — 같은 버튼을 화면에 두 번 두지 않는다 */
  hideButton: boolean
  failure?: string
  onRequest: () => void
}) {
  const { text } = useLocale()
  const action = data.actions.approve
  const blocked = settlementMessage(action.blockedReason, { disputeClosesAt: data.disputeClosesAt })
  const counts = approvalCount(data)
  const mine = data.myTeam?.approved === true
  /**
   * 우리 팀에 열린 이의가 있어 막힌 경우를 따로 말한다.
   *
   * 서버는 이 경우도 이미-동의도 같은 `COMMON_CONFLICT`로 내려주고, `actions[].blockedReason`은
   * **코드만** 싣는다(§11-01 — 실행 4xx의 `msg`는 여기 없다). 표의 기본 문구는 "이미 처리됐거나
   * 같은 작업이 진행 중입니다"라 **무엇을 해야 다음으로 갈 수 있는지**가 사라진다. 이의를 낸
   * 리더에게 그 문장은 막다른 길이다 — 이의를 취소해야 한다는 것을 알 방법이 없다.
   * 화면이 이미 갖고 있는 `disputes[]`·`myTeam.teamId`로 그 한 갈래만 갈라 준다.
   *
   * ⚠ **`COMMON_CONFLICT`일 때만 갈라야 한다.** 코드를 안 보면 열린 이의가 있는 팀에게는
   * `SETTLEMENT_NOT_LOCKED`(분배 행 없음)·`SETTLEMENT_ALREADY_RELEASED`·`PERFORMANCE_INVALID_STATUS`
   * (HALTED)까지 전부 이 문구로 덮여, 이의를 취소해도 아무 일도 안 일어나는 상황에서
   * 이의 취소를 시키게 된다.
   */
  const myTeamId = data.myTeam?.teamId
  const myOpenDispute =
    action.blockedReason === 'COMMON_CONFLICT' &&
    myTeamId != null &&
    data.disputes.some((d) => d.teamId === myTeamId && d.status === 'OPEN')
  const blockedText = mine
    ? undefined // 버튼이 이미 '동의 완료'다. 같은 사실을 두 번 적지 않는다
    : myOpenDispute
      ? text(
          '접수한 이의를 취소한 뒤 동의할 수 있습니다.',
          'Withdraw your open dispute before approving.',
        )
      : blocked

  return (
    <section aria-label={text('정산 동의', 'Settlement approval')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('정산 동의', 'Settlement approval')}
      </h2>

      <div className="rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4">
        {/* 현황이 먼저다 — 지급이 왜 막혀 있는지가 이 숫자로 설명된다 */}
        <p className="m-0 font-sans text-[13px] text-ink">
          {text('참여팀 동의', 'Teams approved')}{' '}
          <span className="font-num tabular-nums font-bold">
            {counts ? `${counts.approved}/${counts.total}` : EMPTY}
          </span>
          {counts && counts.approved < counts.total && (
            <span className="ml-1 text-muted">
              {text(
                `· ${counts.total - counts.approved}개 팀이 남았습니다`,
                `· ${counts.total - counts.approved} team(s) remaining`,
              )}
            </span>
          )}
        </p>
        <p className="m-0 mt-1 font-sans text-[11px] leading-relaxed text-muted md:text-xs">
          {text(
            '주최팀을 포함한 참여팀 전원이 동의하면 48시간 이의제기 기간을 기다리지 않고 정산금 지급이 열립니다.',
            'Once every participating team including the host approves, payouts open without waiting out the 48-hour dispute window.',
          )}
        </p>

        <div className={hideButton ? 'hidden md:block' : ''}>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={!action.available || pending} onClick={onRequest}>
              {mine ? text('동의 완료', 'Approved') : text(...SETTLEMENT_ACTION_LABEL.approve)}
            </Button>
            {/* 막힌 이유는 버튼 옆에 문장으로. 비활성 색만으로는 이유를 알 수 없다 */}
            {!action.available && blockedText && (
              <p className="m-0 flex-1 font-sans text-[11px] text-muted md:text-xs">
                {blockedText}
              </p>
            )}
          </div>
        </div>

        {failure && (
          <p
            role="alert"
            className="m-0 mt-2 font-sans text-[11px] leading-relaxed text-danger md:text-xs"
          >
            {failure}
          </p>
        )}
      </div>
    </section>
  )
}

/* ── 이의제기 ─────────────────────────────────────────────────────────── */

const DISPUTE_STATUS_LABEL: Record<SettlementDispute['status'], [string, string]> = {
  OPEN: ['검토 대기', 'Open'],
  RESOLVED: ['처리 완료', 'Resolved'],
  REJECTED: ['반려', 'Rejected'],
}

/** 이의 상태 배지. 색으로만 구분하지 않고 라벨이 정보를 갖는다 */
function DisputeStatusBadge({ status }: { status: SettlementDispute['status'] }) {
  const { text } = useLocale()
  const tone =
    status === 'OPEN'
      ? 'border-warning text-ink'
      : status === 'RESOLVED'
        ? 'border-ok text-ok'
        : 'border-line text-muted'
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip border bg-surface px-2 font-sans text-[11px] font-semibold ${tone}`}
    >
      {text(...DISPUTE_STATUS_LABEL[status])}
    </span>
  )
}

/** 이의제기 사유 최소 길이 — `DisputeCreateRequest.reason` minLength 10 */
const DISPUTE_REASON_MIN = 10
/** 최대 길이 — maxLength 1000 */
const DISPUTE_REASON_MAX = 1000

/**
 * 이의제기 버튼·폼 + 이의제기 내역 목록 — 컴포넌트 표 2행.
 *
 * 폼은 `actions.dispute.available`일 때만 연다(= `LOCKED`·`DISPUTE_OPEN` 기간). 상태로 직접
 * 판단하지 않는다. 막혀 있으면 버튼을 비활성으로 두고 `blockedReason` 문구를 옆에 적는다.
 *
 * ⚠ **내역 목록에 "사유"를 표시하지 못한다.** 컴포넌트 표는 제기팀·사유·상태를 요구하는데
 * `Dispute` 스키마에는 `reason`이 없다(요청 본문에만 있다). 사유를 지어낼 수 없으므로
 * 제기팀·상태·접수 시각·release 보류 여부만 싣는다. 응답에 `reason`을 더하는 명세 개정이 필요하다.
 *
 * 제기팀 이름도 응답에 없다 — `teamId`뿐이라 `shares[]`에서 같은 `teamId`의 `teamName`을 찾는다.
 * 못 찾으면 팀 번호를 그대로 보여준다(이름을 만들어내지 않는다).
 */
function DisputeSection({
  data,
  pending,
  open,
  failure,
  onOpenChange,
  onSubmit,
}: {
  data: SettlementData
  pending: boolean
  /** 폼이 열려 있는가. 모바일 하단 고정 버튼이 이 폼을 여는 경우가 있어 상위가 들고 있다 */
  open: boolean
  /** 제출이 4xx로 되돌아왔을 때의 안내. `blockedReason`과 같은 표에서 뽑은 문구다 */
  failure?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (reason: string) => void
}) {
  const { text } = useLocale()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const setOpen = onOpenChange

  // 닫히면 입력을 비운다 — 제출한 사유가 폼에 남아 있으면 다시 열었을 때 또 낸다고 오해한다
  useEffect(() => {
    if (open) return
    setReason('')
    setTouched(false)
  }, [open])

  const action = data.actions.dispute
  const blocked = settlementMessage(action.blockedReason, { disputeClosesAt: data.disputeClosesAt })
  const trimmed = reason.trim()
  const invalid = trimmed.length < DISPUTE_REASON_MIN

  const teamName = (teamId: number): string =>
    data.shares.find((s) => s.teamId === teamId)?.teamName ??
    text(`팀 #${teamId}`, `Team #${teamId}`)

  return (
    // 모바일 하단 고정의 "이의제기"가 이 자리로 스크롤해 온다
    <section id="dispute-section" aria-label={text('이의제기', 'Disputes')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('이의제기', 'Disputes')}
      </h2>

      <div className="rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4">
        {/* ── 버튼·폼 ── */}
        {!open ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={!action.available || pending}
              onClick={() => {
                setOpen(true)
                setTouched(false)
              }}
            >
              {text('이의제기', 'Disputes')}
            </Button>
            {/* 막힌 이유는 버튼 옆에 문장으로. 비활성 색만으로는 이유를 알 수 없다 */}
            {!action.available && blocked && (
              <p className="m-0 flex-1 font-sans text-[11px] text-muted md:text-xs">{blocked}</p>
            )}
          </div>
        ) : (
          <div>
            <label
              htmlFor="dispute-reason"
              className="block font-sans text-[11px] font-semibold text-muted md:text-xs"
            >
              {text('이의 사유', 'Reason for dispute')}
              <span className="text-danger">*</span>
            </label>
            {/*
              ⚠ 공용 `Input`은 단일 행 전용이라 1000자 사유를 담지 못한다. 규격(높이·반경·경계선·
              포커스 처리)은 `Input`과 같은 값을 그대로 쓰고, 여러 줄만 다르다.
              공용 `Textarea`가 생기면 이 자리를 교체한다.
            */}
            <textarea
              id="dispute-reason"
              rows={4}
              value={reason}
              maxLength={DISPUTE_REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && invalid ? true : undefined}
              aria-describedby="dispute-reason-help"
              placeholder={text(
                '집계가 현장과 맞지 않는 부분을 구체적으로 적어 주세요.',
                'Describe specifically how the figures differ from what happened at the show.',
              )}
              className={[
                'mt-1 w-full rounded-control border bg-ground px-3.5 py-2.5 font-sans text-sm text-ink',
                'transition-colors duration-150 ease-out placeholder:text-faint',
                touched && invalid
                  ? 'border-danger'
                  : 'border-line hover:border-muted focus:border-primary',
              ].join(' ')}
            />
            <p id="dispute-reason-help" className="m-0 mt-1 font-sans text-[11px] text-muted">
              {touched && invalid
                ? text(
                    `사유를 ${DISPUTE_REASON_MIN}자 이상 입력해 주세요.`,
                    `Enter at least ${DISPUTE_REASON_MIN} characters.`,
                  )
                : text(
                    `${formatCount(trimmed.length)} / ${formatCount(DISPUTE_REASON_MAX)}자`,
                    `${formatCount(trimmed.length)} / ${formatCount(DISPUTE_REASON_MAX)} characters`,
                  )}
            </p>

            <div className="mt-3 flex flex-col gap-2 md:flex-row-reverse">
              <Button
                disabled={pending}
                onClick={() => {
                  setTouched(true)
                  if (invalid) return
                  onSubmit(trimmed)
                }}
              >
                {text('이의 제출', 'Submit dispute')}
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setOpen(false)
                  setReason('')
                }}
              >
                {text('취소', 'Cancel')}
              </Button>
            </div>
          </div>
        )}

        {/* 제출 실패. 사전 차단 안내와 같은 표를 쓴다 — 같은 코드에 다른 말을 하지 않는다 */}
        {failure && (
          <p
            role="alert"
            className="m-0 mt-2 font-sans text-[11px] leading-relaxed text-danger md:text-xs"
          >
            {failure}
          </p>
        )}

        {/* ── 내역 목록 ── */}
        <div className="mt-3 border-t border-line pt-3">
          {data.disputes.length === 0 ? (
            <p role="status" className="m-0 font-sans text-[13px] text-muted">
              {text('접수된 이의가 없습니다', 'No disputes submitted')}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {data.disputes.map((d) => (
                <li key={d.disputeId} className="flex flex-wrap items-center gap-2">
                  <span className="font-sans text-[13px] font-bold text-ink">
                    {teamName(d.teamId)}
                  </span>
                  <DisputeStatusBadge status={d.status} />
                  <span className="font-sans text-[11px] text-muted">{formatKst(d.createdAt)}</span>
                  {d.releaseHeld && (
                    <span className="font-sans text-[11px] text-muted">
                      {text('· release 보류 중', '· Release on hold')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

/* ── 우측 패널: 액션 ──────────────────────────────────────────────────── */

/** 우측 패널의 공통 껍데기. 제목 + 본문 한 벌 */
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

/** 운영자 액션 3종. 이의제기는 좌측 폼이 갖는다(컴포넌트 표가 둘을 다른 행으로 나눴다) */
const OPERATOR_ACTIONS: SettlementActionKey[] = ['aggregate', 'lock', 'release']

/**
 * 단계별 액션 버튼 — 컴포넌트 표 6행. PC는 우측 패널 **상단**(레이아웃 항목).
 *
 * 활성 판단은 오직 `actions[key].available`이다. 막힌 것은 비활성으로 두되 **왜 막혔는지**를
 * 문장으로 함께 둔다 — 회색 버튼만으로는 다음에 무엇을 해야 하는지 알 수 없다.
 *
 * `primary`(모바일 하단 고정으로 올라간 액션)는 이 패널에서 PC에서만 보인다 —
 * 같은 버튼이 화면에 두 번 있으면 어느 것을 눌러야 할지 헷갈린다(P-08 레이아웃).
 */
function ActionPanel({
  data,
  primary,
  pending,
  failure,
  onRequest,
}: {
  data: SettlementData
  primary?: SettlementActionKey
  pending?: SettlementActionKey
  failure?: { action: SettlementActionKey; text: string }
  onRequest: (action: SettlementActionKey) => void
}) {
  const { text } = useLocale()
  const halted = data.status === 'HALTED'

  return (
    <Panel title={text('단계별 액션', 'Settlement actions')}>
      {/* 처리 중 표시 — 컴포넌트 표 11행. 202 접수 후 job 폴링이 도는 구간이다 */}
      {pending && (
        <p
          role="status"
          className="m-0 mb-2 inline-flex h-6 items-center rounded-chip border border-primary bg-surface px-2 font-sans text-[11px] font-semibold text-ink"
        >
          {text('처리 중 ·', 'Processing ·')}
          {text(...SETTLEMENT_ACTION_LABEL[pending])}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {OPERATOR_ACTIONS.map((key) => {
          const action = data.actions[key]
          const blocked = settlementMessage(action.blockedReason, {
            disputeClosesAt: data.disputeClosesAt,
          })
          // HALTED에서는 세 버튼이 모두 비활성이다(P-08 상태 항목). 재개 버튼은 두지 않는다
          const enabled = action.available && !halted && !pending
          return (
            <div key={key} className={primary === key ? 'hidden md:block' : ''}>
              <Button
                variant={key === 'release' ? 'primary' : 'secondary'}
                full
                disabled={!enabled}
                onClick={() => onRequest(key)}
              >
                {text(...SETTLEMENT_ACTION_LABEL[key])}
              </Button>
              {!action.available && blocked && (
                <p className="m-0 mt-1 font-sans text-[11px] leading-relaxed text-muted">
                  {blocked}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/*
        실행이 4xx로 되돌아온 경우. 사전 차단 안내와 **같은 표**를 쓴다.
        버튼 옆이 아니라 패널 바닥에 두는 이유 — 주 액션의 버튼은 모바일에서 하단 고정으로 올라가
        본문에서 `hidden`이다. 실패 문구를 그 안에 넣으면 정작 실패한 액션의 안내가 모바일에서 사라진다.
      */}
      {failure && (
        <p role="alert" className="m-0 mt-2 font-sans text-[11px] leading-relaxed text-danger">
          {text(...SETTLEMENT_ACTION_LABEL[failure.action])} {text('실패 —', 'Failed —')}
          {failure.text}
        </p>
      )}

      {/*
        ⚠ `counterMatched`는 컴포넌트 표에 없지만 `false`면 집계 확정·잠금이 막힌다(settlement_02·03).
        서버가 `blockedReason`을 주지 않는 경우에도 왜 진행이 안 되는지 알 수 있게 보조 줄로만 뒀다.
        판단은 여전히 `available`이 한다 — 이 줄은 설명이지 조건이 아니다.
      */}
      {!data.counterMatched && (
        <p className="m-0 mt-2 font-sans text-[11px] leading-relaxed text-muted">
          {text(
            '서버 집계와 온체인 선택 카운터가 일치하지 않습니다. 이 상태에서는 집계 확정·정산 잠금이 막힙니다.',
            'Server totals do not match on-chain audience choices. Aggregation and locking are blocked until resolved.',
          )}
        </p>
      )}
    </Panel>
  )
}

/* ── 우측 패널: release tx · 보증금 · 검증 · 공유 링크 ────────────────── */

/** release tx 패널 — 컴포넌트 표 4행. 해시(축약)·확정 시각(KST)·익스플로러 링크 */
function ReleaseTxPanel({ data }: { data: SettlementData }) {
  const { text } = useLocale()
  const tx = data.transactions.find((t) => t.type === 'RELEASE')
  return (
    <Panel title={text('release 트랜잭션', 'Release transaction')}>
      {data.releaseTxHash ? (
        <>
          <InfoRow label={text('tx 해시', 'Transaction hash')}>
            <TxLink url={tx?.explorerUrl} hash={data.releaseTxHash} />
          </InfoRow>
          <InfoRow label={text('확정 시각', 'Confirmed at')}>
            {data.releasedAt ? formatKst(data.releasedAt) : EMPTY}
          </InfoRow>
        </>
      ) : (
        <p className="m-0 font-sans text-[13px] text-muted">
          {text(
            'release가 확정되면 트랜잭션이 표시됩니다',
            'The transaction appears once release is confirmed.',
          )}
        </p>
      )}
    </Panel>
  )
}

/**
 * 보증금 반환 패널 — 컴포넌트 표 5행. 금액·상태·반환 tx 링크·반환 시각.
 *
 * 반환 tx의 익스플로러 URL은 `deposit`에 없어 `transactions[]`에서 같은 해시를 찾는다 —
 * URL을 클라이언트가 조립하지 않는다(서버가 완성해 준 값만 쓴다).
 */
function DepositPanel({ data }: { data: SettlementData }) {
  const { text } = useLocale()
  const { deposit } = data
  const tx = deposit.returnTxHash
    ? data.transactions.find((t) => t.txHash === deposit.returnTxHash)
    : undefined
  // 배지는 3값만 안다(§5.1). 그 밖의 값이 오면 배지 대신 원문을 그대로 보여준다
  const known =
    deposit.status === 'UNPAID' || deposit.status === 'PAID' || deposit.status === 'RETURNED'

  return (
    <Panel title={text('보증금 반환', 'Deposit return')}>
      <InfoRow label={text('금액', 'Amount')}>
        <span className="font-num tabular-nums">{formatYoyo(deposit.amount)}</span>
      </InfoRow>
      <InfoRow label={text('상태', 'Status')}>
        {known ? (
          <DepositStatusBadge status={deposit.status as DepositStatus} />
        ) : (
          <span className="font-mono text-[13px]">{deposit.status}</span>
        )}
      </InfoRow>
      <InfoRow label={text('반환 tx', 'Return transaction')}>
        <TxLink url={tx?.explorerUrl} hash={deposit.returnTxHash} />
      </InfoRow>
      <InfoRow label={text('반환 시각', 'Returned at')}>
        {deposit.returnedAt ? formatKst(deposit.returnedAt) : EMPTY}
      </InfoRow>
    </Panel>
  )
}

/**
 * 정산 검증 페이지 링크 — 컴포넌트 표 9행. V-01(`/verify/:performanceId`)로 간다.
 *
 * **참여팀 리더만 노출**이므로 `myTeam`이 있을 때만 그린다(참여팀 여부를 알 수 있는 유일한 필드다).
 * **`LOCKED` 이상일 때만 활성** — 잠금 전에는 검증할 확정 분배액이 없다.
 *
 * ⚠ `HALTED`가 "`LOCKED` 이상"인지는 명세에 없다. 진행선 밖의 종단이라 잠금 시각(`lockedAt`)이
 * 기록된 경우에만 활성으로 본다 — 잠금을 지나 중단됐다면 그때까지의 산출은 검증할 수 있다.
 */
function VerifyLinkPanel({ data }: { data: SettlementData }) {
  const { text } = useLocale()
  if (!data.myTeam) return null
  const active =
    data.status === 'LOCKED' ||
    data.status === 'DISPUTE_OPEN' ||
    data.status === 'RELEASED' ||
    (data.status === 'HALTED' && Boolean(data.lockedAt))

  return (
    <Panel title={text('정산 검증', 'Settlement verification')}>
      {active ? (
        <Link
          to={`/verify/${data.performanceId}`}
          className="flex h-11 w-full items-center justify-center rounded-control border border-line bg-surface font-sans text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-ground-2"
        >
          {text('정산 검증 페이지 열기', 'Open settlement verification')}
        </Link>
      ) : (
        <>
          <Button variant="secondary" full disabled>
            {text('정산 검증 페이지 열기', 'Open settlement verification')}
          </Button>
          <p className="m-0 mt-1 font-sans text-[11px] text-muted">
            {text(
              '정산이 잠긴 뒤에 분배액을 검증할 수 있습니다.',
              'Payouts can be verified after the settlement is locked.',
            )}
          </p>
        </>
      )}
    </Panel>
  )
}

/**
 * 정산 공유 링크 패널 — 컴포넌트 표 10행.
 *
 * "링크 생성" → `share_token` 발급, "복사" → 클립보드, **재생성 시 이전 링크 무효화 안내**.
 * 재생성은 되돌릴 수 없으므로(이전 링크를 받은 사람이 즉시 못 보게 된다) 확인 모달을 거친다(§5.6).
 *
 * ⚠ `settlement_01` 응답에는 `shareToken`이 없다. 그래서 **이미 발급된 링크가 있는지 화면이 알 수 없고**,
 * 새로고침하면 "아직 만들지 않음"으로 보인다. 조회 응답에 발급 여부(또는 토큰)를 더하는 명세 개정이 필요하다.
 */
function ShareLinkPanel({
  data,
  link,
  pending,
  failure,
  clipboard,
  onCreate,
}: {
  data: SettlementData
  link?: SettlementShareLink
  pending: boolean
  failure?: string
  clipboard: Clipboard
  onCreate: () => void
}) {
  const { text } = useLocale()
  // settlement_06은 정산이 `NONE`이면 409다(PERFORMANCE_INVALID_STATUS) — 미리 막고 이유를 적는다
  const allowed = data.status !== 'NONE'
  const copied = clipboard.copiedKey === 'share'

  return (
    <Panel title={text('정산 공유 링크', 'Settlement sharing')}>
      {link ? (
        <>
          {/* URL은 잘리면 쓸모가 없다 — 줄바꿈을 허용하고 전체를 보여준다 */}
          <p className="m-0 break-all font-mono text-[11px] text-ink">{link.shareUrl}</p>
          <p className="m-0 mt-1 font-sans text-[11px] text-muted">
            {text('발급', 'Issued')}
            {formatKst(link.issuedAt)}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" sm onClick={() => clipboard.copy('share', link.shareUrl)}>
              {text('복사', 'Copy')}
            </Button>
            <Button variant="secondary" sm disabled={pending} onClick={onCreate}>
              {text('다시 생성', 'Regenerate')}
            </Button>
            {copied && (
              <span role="status" className="self-center font-sans text-[11px] text-muted">
                {clipboard.failed ? text('복사 실패', 'Copy failed') : text('복사됨', 'Copied')}
              </span>
            )}
          </div>
        </>
      ) : (
        <Button variant="secondary" full disabled={!allowed || pending} onClick={onCreate}>
          {pending ? text('생성 중…', 'Creating…') : text('링크 생성', 'Create link')}
        </Button>
      )}

      {!allowed && (
        <p className="m-0 mt-1 font-sans text-[11px] text-muted">
          {text(
            '집계가 확정된 뒤에 공유 링크를 만들 수 있습니다.',
            'A sharing link can be created after aggregation is confirmed.',
          )}
        </p>
      )}
      {/* 재생성 안내는 링크가 있을 때만 의미가 있다 */}
      {link && (
        <p className="m-0 mt-1 font-sans text-[11px] leading-relaxed text-muted">
          {text(
            '다시 생성하면 이전 링크는 즉시 무효화됩니다. 이미 전달한 링크는 열리지 않습니다.',
            'Regenerating immediately invalidates the previous link, including copies already shared.',
          )}
        </p>
      )}
      {failure && (
        <p role="alert" className="m-0 mt-1 font-sans text-[11px] leading-relaxed text-danger">
          {failure}
        </p>
      )}
    </Panel>
  )
}

/* ── 로딩·에러 ────────────────────────────────────────────────────────── */

/** 로딩은 스켈레톤. 본문 골격(단계 바 → 2열)과 같은 자리를 잡는다 */
function Skeleton() {
  return <PageSkeleton variant="dashboard" />
}

/** 에러는 서버 `msg`를 그대로 노출한다(§5.5). 클라이언트가 문구로 분기하지 않는다 */
function ErrorPanel({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  const { text } = useLocale()
  return (
    <section
      role="alert"
      className="rounded-card border border-danger bg-surface px-4 py-10 text-center"
    >
      <p className="m-0 mb-1 font-sans text-sm font-semibold text-ink">
        {text('정산 현황을 불러오지 못했습니다', 'Could not load settlement details')}
      </p>
      <p className="m-0 mb-4 font-sans text-[13px] text-muted">{msg}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {text('다시 시도', 'Try again')}
        </Button>
      )}
    </section>
  )
}

/* ── 확인 모달 문구 ───────────────────────────────────────────────────── */

/**
 * 비가역 액션의 확인 문구 — §5.6·P-08 접근성("비가역 액션은 확인 모달 필수").
 *
 * 각 액션이 "무엇을 되돌릴 수 없게 만드는가"를 적는다. 일반적인 "정말 실행할까요?"는
 * 확인을 형식으로 만든다.
 */
function confirmCopy(
  action: SettlementActionKey,
  data: SettlementData,
  text: (ko: string, en: string) => string,
): { title: string; body: string } {
  switch (action) {
    case 'aggregate':
      return {
        title: text('집계를 확정할까요?', 'Confirm aggregation?'),
        body: text(
          '확정하면 팀별 분배액이 산출·저장되고 집계를 다시 돌릴 수 없습니다.',
          'Team payouts will be calculated and saved. Aggregation cannot be run again.',
        ),
      }
    case 'lock':
      return {
        title: text('정산을 잠글까요?', 'Lock settlement?'),
        body: text(
          '잠그면 분배액이 고정되고 48시간 이의제기 기간이 시작됩니다. 잠금 이후에는 개별 환불이 막힙니다.',
          'Locking fixes payouts and starts the 48-hour dispute window. Individual refunds are disabled after locking.',
        ),
      }
    case 'release':
      return {
        title: text(
          `${formatYoyo(data.distributableAmount)}를 지급할까요?`,
          `Release ${formatYoyo(data.distributableAmount)}?`,
        ),
        body: text(
          'release가 확정되면 각 팀 리더 지갑으로 정산금이 들어가고 보증금이 반환됩니다. 되돌릴 수 없습니다.',
          'Release sends payouts to team leaders and returns the deposit. This cannot be undone.',
        ),
      }
    case 'approve':
      return {
        title: text('정산에 동의할까요?', 'Approve this settlement?'),
        body: text(
          '한 번 동의하면 철회할 수 없습니다. 참여팀 전원이 동의하면 48시간 이의제기 기간을 기다리지 않고 정산금 지급이 바로 시작됩니다.',
          'Approval cannot be withdrawn. Once every participating team approves, payouts start immediately without waiting out the 48-hour dispute window.',
        ),
      }
    case 'dispute':
      return {
        title: text('이의를 제기할까요?', 'Submit this dispute?'),
        body: text(
          '접수되면 release 자동 실행이 보류되고 관리자 검토로 넘어갑니다. 팀당 열어 둘 수 있는 이의는 1건입니다.',
          'Submitting pauses automatic release for admin review. Each team can have one open dispute.',
        ),
      }
  }
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  /**
   * 공연명 — P-08 **영역 구성**의 헤더다.
   * ⚠ `Settlement`에 공연명이 없다. 상위(페이지)가 performance-04 공연 상세에서 받아 넘긴다.
   */
  title: string
  data?: SettlementData
  loading?: boolean
  /** 실패 시 서버 `msg`. 있으면 에러 패널을 그린다 */
  error?: string
  onRetry?: () => void
  /**
   * 운영자 액션 실행. **202 접수 → job 폴링 확정까지 끝난 뒤** resolve해야 한다.
   * 실패면 `{ ok: false, code }` — `code`로만 분기한다.
   */
  onAction?: (action: 'aggregate' | 'lock' | 'release') => Promise<SettlementActionResult>
  /** 이의제기(settlement_04). 201 동기 응답이라 폴링이 없다 */
  onDispute?: (reason: string) => Promise<SettlementActionResult>
  /** 정산 조기 동의(settlement_08). 이의제기와 같은 201 동기 응답이라 폴링이 없다 */
  onApprove?: () => Promise<SettlementActionResult>
  /** 공유 링크 생성·재생성(settlement_06) */
  onCreateShareLink?: () => Promise<SettlementShareLinkResult>
}

export function SettlementDashboard({
  title,
  data,
  loading = false,
  error,
  onRetry,
  onAction,
  onDispute,
  onApprove,
  onCreateShareLink,
}: Props) {
  const { text } = useLocale()
  /** 확인 모달에 걸린 액션. `null`이면 닫힌 상태 */
  const [confirming, setConfirming] = useState<SettlementActionKey | null>(null)
  /** 실행 중인 액션 = "처리 중" 배지. 낙관적 전이를 하지 않으므로 이 값만이 진행 표시다 */
  const [pending, setPending] = useState<SettlementActionKey | null>(null)
  /** 실행이 실패한 액션과 안내 문구(`blockedReason`과 같은 표에서 뽑는다) */
  const [failure, setFailure] = useState<{ action: SettlementActionKey; text: string } | null>(null)
  /** 제출 대기 중인 이의 사유. 확인 모달을 거치므로 잠시 들고 있는다 */
  const [pendingReason, setPendingReason] = useState('')
  const [shareLink, setShareLink] = useState<SettlementShareLink | undefined>(undefined)
  const [sharePending, setSharePending] = useState(false)
  const [shareFailure, setShareFailure] = useState<string | undefined>(undefined)
  const clipboard = useClipboard()
  /** 지급 완료 안내 — 수동 지급 확정(`notify`)과 폴링의 RELEASED 전이 관측, 공연당 1회 */
  const releaseDone = useReleaseDoneNotice(data)
  const notifyReleaseDone = releaseDone.notify

  /**
   * 이의제기 마감이 다가오는 동안 "남은 시간"이 멈춰 있으면 안 된다. 1분마다 다시 그린다.
   * 초 단위로 돌리지 않는 이유 — 문구가 분 단위라 초마다 리렌더해도 화면이 바뀌지 않는다.
   */
  const [, setTick] = useState(0)
  // 카운트다운을 그릴 때만 돈다 — 전원 동의·종단이면 숨기므로 타이머도 필요 없다
  const counting = data !== undefined && headerNotice(data)?.kind === 'countdown'
  useEffect(() => {
    if (!counting) return
    const timer = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [counting])

  const runAction = useCallback(
    async (action: SettlementActionKey, reason?: string) => {
      // 사유 없는 이의는 400(`COMMON_VALIDATION_FAILED`)이 확정이다 — 보내지 않는다
      if (action === 'dispute' && !reason?.trim()) return
      setFailure(null)
      setPending(action)
      try {
        const result =
          action === 'dispute'
            ? await onDispute?.(reason ?? '')
            : action === 'approve'
              ? await onApprove?.()
              : await onAction?.(action as 'aggregate' | 'lock' | 'release')
        // 핸들러가 없으면(목·미연결) 아무것도 단정하지 않는다 — 성공으로 치지 않는다
        if (result && !result.ok && !result.cancelled) {
          // 사전 차단과 같은 표를 쓴다. 서버 `msg`가 오면 뒤에 덧붙인다(§5.5)
          const mapped = settlementMessage(result.code, { disputeClosesAt: data?.disputeClosesAt })
          setFailure({
            action,
            text: [mapped, result.msg].filter(Boolean).join(' '),
          })
        } else if (result?.ok && action === 'release') {
          // `onAction`은 job CONFIRMED까지 기다린 뒤 resolve한다 — 여기서 ok면 지급이 끝난 것이다
          notifyReleaseDone()
        }
      } finally {
        setPending(null)
      }
    },
    [onAction, onDispute, onApprove, data?.disputeClosesAt, notifyReleaseDone],
  )

  const createShareLink = useCallback(async () => {
    setShareFailure(undefined)
    setSharePending(true)
    try {
      const result = await onCreateShareLink?.()
      if (result?.ok && result.link) setShareLink(result.link)
      else if (result && !result.ok) {
        setShareFailure(
          [settlementMessage(result.code), result.msg].filter(Boolean).join(' ') ||
            text('링크를 만들지 못했습니다.', 'Could not create the link.'),
        )
      }
    } finally {
      setSharePending(false)
    }
  }, [onCreateShareLink, text])

  /** 공유 링크 재생성은 이전 링크를 죽인다 → 확인을 거친다. 첫 생성은 잃을 것이 없어 바로 만든다 */
  const [confirmingShare, setConfirmingShare] = useState(false)
  /** 이의제기 폼 열림. 모바일 하단 고정 버튼도 이 폼을 열기 때문에 상위가 들고 있다 */
  const [disputeFormOpen, setDisputeFormOpen] = useState(false)

  /**
   * 모바일 하단 고정 버튼을 눌렀을 때.
   *
   * 운영자 액션 셋은 바로 확인 모달로 가지만, **이의제기는 사유가 있어야 한다**(입력 검증).
   * 그래서 하단 고정에서는 확인 모달이 아니라 본문의 폼을 열고 그 자리로 데려간다 —
   * 사유 없이 확인 모달을 띄우면 빈 사유가 제출된다.
   */
  const onPrimary = useCallback((action: SettlementActionKey) => {
    if (action !== 'dispute') {
      setConfirming(action)
      return
    }
    setDisputeFormOpen(true)
    document
      .getElementById('dispute-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // 폼은 다음 렌더에 생긴다 — 그려진 뒤에 포커스를 옮긴다
    requestAnimationFrame(() => document.getElementById('dispute-reason')?.focus())
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-3 pt-3 pb-8 md:gap-6 md:px-0 md:pt-0 md:pb-0">
        <Skeleton />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-4 px-3 pt-3 pb-8 md:gap-6 md:px-0 md:pt-0 md:pb-0">
        <ErrorPanel
          msg={error ?? text('잠시 후 다시 시도해 주세요.', 'Please try again in a moment.')}
          onRetry={onRetry}
        />
      </div>
    )
  }

  /**
   * 모바일 하단 고정에 올릴 액션 **하나**(§5.19 · P-08 레이아웃).
   *
   * ⚠ 우선순위는 명세에 없다. 정산을 앞으로 미는 운영자 액션(집계 → 잠금 → release)을 먼저 두고,
   * 그 셋이 모두 막혔을 때만 이의제기를 올린다 — 같은 단계에서 둘 다 열려 있는 구간
   * (`LOCKED`에서 release·dispute)이 있어 무엇이 주 액션인지 정해야 했다.
   * `HALTED`에서는 하단 고정을 **비운다**(재개 버튼을 두지 않는다).
   *
   * **`approve`는 release 뒤·dispute 앞**이다(settlement_08).
   *   · 참여팀 리더에게는 운영자 3종이 항상 막혀 있으므로 동의가 곧 첫 활성 액션이 된다 —
   *     "지금 할 일"이 그대로 하단 고정으로 올라온다.
   *   · 주최팀 리더는 둘 다 참여팀이라 동의도 눌러야 하지만, release가 **열려 있다면**
   *     이미 지급 조건이 찬 것이므로(전원 동의 또는 48h 경과) 정산을 끝내는 release가 먼저다.
   *   · 이의제기보다는 앞이다 — 동의가 통상 경로, 이의는 예외다.
   */
  const primary: SettlementActionKey | undefined =
    data.status === 'HALTED'
      ? undefined
      : (['aggregate', 'lock', 'release', 'approve', 'dispute'] as SettlementActionKey[]).find(
          (k) => data.actions[k].available,
        )

  const notice = headerNotice(data)

  return (
    <div
      className={[
        'flex flex-col gap-4 px-3 pt-3 md:gap-6 md:px-0 md:pt-0 md:pb-0',
        // 하단 고정 버튼이 마지막 줄을 덮지 않게 모바일에서만 여백을 준다
        primary ? 'pb-28' : 'pb-8',
      ].join(' ')}
    >
      {/* HALTED 배너는 본문 맨 위 — 모바일에서는 상단 고정으로 붙는다 */}
      {data.status === 'HALTED' && <HaltedBanner />}

      {/*
        헤더 줄 — 공연명 + 정산 상태 배지 + 이의제기 남은 시간.
        공연명은 PC에서만 찍는다. 모바일은 `StudioShell` 상단 바가 이미 공연명을 갖는다.
      */}
      <StudioHeading title={title} section={['정산 대시보드', 'Settlement overview']}>
        <SettlementStatusBadge status={data.status} />
        {notice?.kind === 'countdown' && (
          <span className="ml-auto font-sans text-[11px] text-muted md:text-xs">
            {text('이의제기 마감까지', 'Dispute window closes in')}{' '}
            <span className="font-num tabular-nums text-ink">{notice.remaining}</span>
          </span>
        )}
        {notice?.kind === 'allApproved' && (
          <span role="status" className="ml-auto font-sans text-[11px] text-muted md:text-xs">
            {text(
              '모든 팀이 동의했습니다 · 곧 정산금이 지급됩니다',
              'All teams approved · Payout coming soon',
            )}
          </span>
        )}
      </StudioHeading>

      {/* 현재 금액과 실제로 가능한 다음 작업을 타임라인보다 먼저 둔다. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:gap-6">
          <TeamShareList data={data} clipboard={clipboard} />
          {/*
            끝난 정산에는 두지 않는다. 48시간 경로로 RELEASED 까지 간 정산은 아무도 동의하지
            않았으므로 전원이 `approved: false` 다 — 그대로 두면 "0/3 · 3개 팀이 남았습니다"와
            "전원이 동의하면 지급이 열립니다"가 **이미 돈이 나간 화면에** 남아 동의 대기 중으로 읽힌다.
            HALTED 도 같다 — 동의해도 지급되지 않는다.

            팀별 표의 동의 열은 남긴다. 그쪽은 "이 팀은 동의하지 않았는데 48시간이 지나 받았다"라는
            **사실 기록**이고, 지급을 예고하는 문장이 아니다.
          */}
          {data.status !== 'RELEASED' && data.status !== 'HALTED' && (
            <ApprovalSection
              data={data}
              pending={pending !== null}
              hideButton={primary === 'approve'}
              failure={failure?.action === 'approve' ? failure.text : undefined}
              onRequest={() => setConfirming('approve')}
            />
          )}
          <DisputeSection
            data={data}
            pending={pending !== null}
            open={disputeFormOpen}
            failure={failure?.action === 'dispute' ? failure.text : undefined}
            onOpenChange={setDisputeFormOpen}
            onSubmit={(reason) => {
              setPendingReason(reason)
              setConfirming('dispute')
            }}
          />
        </div>

        <div className="flex w-full shrink-0 flex-col gap-4 md:w-80 md:gap-6">
          <ActionPanel
            data={data}
            primary={primary}
            pending={pending ?? undefined}
            // 이의제기·조기 동의 실패는 좌측 섹션 아래에 붙는다 — 같은 문구를 두 곳에 띄우지 않는다
            failure={
              failure && failure.action !== 'dispute' && failure.action !== 'approve'
                ? failure
                : undefined
            }
            onRequest={(action) => setConfirming(action)}
          />
          <ReleaseTxPanel data={data} />
          <DepositPanel data={data} />
          <VerifyLinkPanel data={data} />
          <ShareLinkPanel
            data={data}
            link={shareLink}
            pending={sharePending}
            failure={shareFailure}
            clipboard={clipboard}
            onCreate={() => {
              if (shareLink) setConfirmingShare(true)
              else void createShareLink()
            }}
          />
        </div>
      </div>

      <StepBar data={data} />

      {/* 모바일 하단 고정 — 현재 단계에서 허용된 액션 1개만(§5.19). HALTED면 아예 없다 */}
      {primary && (
        <FixedBottom>
          <Button full disabled={pending !== null} onClick={() => onPrimary(primary)}>
            {pending ? text('처리 중…', 'Processing…') : text(...SETTLEMENT_ACTION_LABEL[primary])}
          </Button>
        </FixedBottom>
      )}

      {/* 비가역 액션 확인 — 모바일은 시트, PC는 중앙 다이얼로그(ConfirmDialog가 폭으로 나눈다) */}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? confirmCopy(confirming, data, text).title : ''}
        body={confirming ? confirmCopy(confirming, data, text).body : undefined}
        confirmLabel={confirming ? text(...SETTLEMENT_ACTION_LABEL[confirming]) : ''}
        cancelLabel={text('취소', 'Cancel')}
        confirmVariant="danger"
        busy={pending !== null}
        onConfirm={() => {
          const action = confirming
          setConfirming(null)
          if (!action) return
          // 제출한 이의는 폼을 닫는다. 결과는 목록(내역)으로 확인한다
          if (action === 'dispute') setDisputeFormOpen(false)
          void runAction(action, action === 'dispute' ? pendingReason : undefined)
        }}
        onClose={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={confirmingShare}
        title={text('공유 링크를 다시 만들까요?', 'Regenerate the sharing link?')}
        body={text(
          '새 링크가 발급되면 이전 링크는 즉시 무효화됩니다. 이미 전달한 링크는 열리지 않습니다.',
          'A new link immediately invalidates the previous link, including copies already shared.',
        )}
        confirmLabel={text('다시 생성', 'Regenerate')}
        cancelLabel={text('취소', 'Cancel')}
        confirmVariant="danger"
        busy={sharePending}
        onConfirm={() => {
          setConfirmingShare(false)
          void createShareLink()
        }}
        onClose={() => setConfirmingShare(false)}
      />

      <ReleaseDoneDialog open={releaseDone.open} data={data} onClose={releaseDone.close} />
    </div>
  )
}
