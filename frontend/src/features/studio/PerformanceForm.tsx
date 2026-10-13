/**
 * P-03 공연 생성·수정 — 공연 정보·티켓 옵션 → 참여팀(P-04) → 정산 규칙(P-05) →
 * 규칙 동의(P-06) → **보증금** 5단계.
 *
 * ⚠ 화면설계 v7.1 은 아직 `정보·티켓 옵션 → 정산 규칙 → 보증금` **3단계**로 적혀 있다.
 *   가운데 두 단계는 S15P21B204-136 으로 들어왔다. 문서 개정 대상이다.
 *   ① **참여팀**(장부 D-76) — 규칙 화면이 `participants[]` 로 팀 몫을 나누고 서버가 공동
 *      공연의 보증금 prepare 에서 수락 참여팀 2 이상을 요구하므로(`TEAM_MIN_COUNT_NOT_MET`,
 *      MR !135), 초대가 규칙보다 뒤면 공동 공연은 규칙이 1팀으로 굳고 보증금에서 409 가 난다.
 *   ② **규칙 동의**(팀 결정 2026-09-21) — 동의(API-rule-03)는 보증금을 선행 조건으로 보지
 *      않고, 판매 시작만이 `DepositRequired`·`NotAllAgreed` 로 둘 다 막는다. 그래서 보증금은
 *      **판매 직전 마지막 잠금**이고 동의가 그 앞이다. 순서 근거는 `setupSteps.ts` 머리말.
 *
 * ⚠ **공동 공연 여부는 생성 때 한 번만 정한다** — `PerformanceUpdateRequest` 에 그 필드가
 *   없다. 생성은 페이지의 선택 모달(`JointChoiceDialog`)이 정하고, 수정 모드는 읽기 전용 문구만 그린다.
 *   단독 공연은 **참여팀 단계만** 건너뛴다. 규칙 동의는 남는다 — 컨트랙트가
 *   `agreedCount == teamWallets.length` 를 요구해 생성 팀 리더 본인이 서명해야 한다.
 *
 * 정본 — 화면설계 v7 §4 P-03(영역 구성·레이아웃·컴포넌트 표 11행·상태·입력 검증·접근성)
 *        · §5.1 상태 배지 · §5.3 tx·주소 축약 · §5.4 금액 표기 · §5.13 KST 병기
 *        · §5.14 지갑 서명 단계 · §5.16 잔액 부족 안내 · §5.19 액션 버튼 배치 · §5.21 표 → 패널 접기
 *        · API 명세 v6 performance_01(생성) · performance_04(수정) · performance_05(티켓 옵션)
 *          · performance_13(보증금 서명 파라미터) · performance_14(발신자 서명 RLP 보고)
 *
 * 본문 순서는 P-03 **영역 구성** 그대로다 — 단계 표시 → 기본 정보 → 일시·장소 →
 * 티켓 옵션 목록 → 보증금 패널. 레이아웃 항목이 정한 대로 PC는 **최대폭 960px**,
 * 기본 정보·일시·장소는 **2열 그리드**, 티켓 옵션과 보증금 패널은 **폭 100% 1열**이고,
 * 저장·납부 버튼은 폼 하단 오른쪽이다. 모바일은 전부 1열 + 하단 고정 하나(§5.19).
 *
 * **보증금은 리더가 직접 서명한다**(승인 → 납부, 수수료 대납). 이 화면은 서명 파라미터를
 * 만들지도 개인키를 다루지도 않는다 — `onPayDeposit`이 그 일을 하고, 여기는 §5.14의
 * **네 단계 표시**(요약 → 대기 → 확정 대기 → 완료)와 거부 복귀만 그린다.
 * `senderSignedRlp`는 이 파일을 지나가지 않는다.
 *
 * **서명 거부는 에러가 아니다**(§5.14 ④' · §1.2 원칙 6). 보증금 패널을 초기 상태로 되돌리고
 * 안내 한 줄만 남긴다. 공연은 `DRAFT`·`UNPAID`로 그대로 있다.
 *
 * **잔액 부족도 에러 화면이 아니다**(§5.16). 모자란 금액만 알리고 다른 액션은 그대로 둔다.
 * 잔액을 늘리는 버튼·링크를 두지 않는다.
 *
 * 껍데기(사이드 메뉴·드로어)는 `StudioShell`이 맡는다. 관객 하단 탭바는 쓰지 않는다.
 *
 * TODO(API 연결)
 *   생성:   performance_01 `POST /api/v1/performances`
 *           `{ hostTeamId, title, description?, venueName, venueAddress, startAt, endAt, jointPerformance }`
 *           → 201 `PerformanceCreated`(performanceId·status·saleCloseAt·cancelDeadlineAt·deposit·nextAction)
 *   수정:   performance_04 `PATCH /api/v1/performances/{performanceId}` — 전 필드 선택
 *           `saleCloseAt`·`cancelDeadlineAt`·`depositAmount`는 **요청 필드가 아니다**(서버 계산)
 *   티켓:   performance_05 `PUT …/ticket-types` `{ ticketTypes: [{ ticketTypeId?, name, price, totalQuantity }] }`
 *           → `TicketTypeSetResponseData`. **전체 교체**다 — 목록에서 지운 옵션은 사라진다
 *   보증금: performance_13 `POST …/deposit/prepare` → `signRequests[]`(APPROVE·DEPOSIT) + `expiresAt`
 *           → 지갑 서명 → performance_14 `POST …/deposit/signed-tx` `{ kind, senderSignedRlp }`
 *           → 202 `{ jobId, pollAfterMs, nextDepositStatus }` → `GET /api/v1/chain/jobs/{jobId}` 폴링
 *   에러:   400 `PERFORMANCE_DATE_INVALID`·`COMMON_VALIDATION_FAILED` → 필드 오류
 *           403 `PERFORMANCE_NOT_OWNER` → 권한 없음 · 404 `PERFORMANCE_NOT_FOUND`
 *           409 `PERFORMANCE_ALREADY_ON_SALE` → **읽기 전용 전환**
 *           409 `PERFORMANCE_INVALID_STATUS`(= §8.2 `PERFORMANCE_DEPOSIT_REQUIRED`) → 보증금 패널로 스크롤 + 강조
 *           409 `COMMON_CONFLICT`(= §8.2 `PAYMENT_INSUFFICIENT_BALANCE`) → §5.16 안내
 *           409 `PAYMENT_SIGNATURE_REJECTED` → 에러 아님, 초기 상태 복귀
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'
import { Link } from 'react-router'

import {
  Button,
  DepositStatusBadge,
  FixedBottom,
  Input,
  Spinner,
  StatusBadge,
  Stepper,
  formatYoyo,
  formatKst,
  shortenHex,
} from '@/shared/ui'
import type { DepositStatus } from '@/shared/ui'
import { FormField } from '@/features/studio/FormField'
import { PerformanceScheduleFields } from '@/features/studio/PerformanceScheduleFields'
import {
  StudioErrorPanel,
  StudioHeading,
  StudioForbidden,
  StudioNotice,
  StudioSkeleton,
} from '@/features/studio/StudioStates'
import type { StudioLeaderWallet } from '@/features/studio/leaderWallet'
import {
  depositFailureText,
  isChainTimeoutCode,
  isDepositRequiredCode,
  isInsufficientBalanceCode,
  isLockedCode,
  isRulesRequiredCode,
  isSignatureRejectedCode,
  studioFailureText,
} from '@/features/studio/studioErrors'
import {
  DEPOSIT_AMOUNT,
  DESCRIPTION_MAX,
  TICKET_NAME_MAX,
  TICKET_TYPE_MAX,
  TITLE_MAX,
  VENUE_ADDRESS_MAX,
  VENUE_NAME_MAX,
  hasAnyError,
  isoToKstInput,
  ticketTypesValid,
  validateInfo,
  validateTicketTypes,
} from '@/features/studio/performanceFields'
import type {
  PerformanceInfoValues,
  TicketTypeDraft,
  TicketTypeErrors,
} from '@/features/studio/performanceFields'
import {
  SETUP_STEPS,
  SETUP_STEP_AGREEMENTS,
  SETUP_STEP_BASICS,
  SETUP_STEP_DEPOSIT,
  SETUP_STEP_PARTICIPANTS,
  SETUP_STEP_RULES,
  participantsStepDone,
  visibleSetupSteps,
  visibleStepIndex,
} from '@/features/studio/setupSteps'
import { SHOW_STATUS } from '@/features/studio/showStatus'
import type { PerformanceStatus } from '@/features/studio/showStatus'

/* ── 타입 ─────────────────────────────────────────────────────────────── */

/**
 * 단계 표시는 P-05 와 **같은 정본**을 쓴다(`setupSteps`). 가운데 세 단계(참여팀·정산 규칙·
 * 규칙 동의)는 이 화면이 편집하지 않고 P-04·P-05·P-06 으로 보낸다 — 그래도 진행 표시는
 * 한 줄기여야 한다.
 */
const STEPS = SETUP_STEPS

/** `PerformanceDetail`(performance_03) + `PerformanceCreated`에서 이 화면이 쓰는 것만 */
export interface PerformanceEditData {
  performanceId: number
  title: string
  description?: string
  venueName: string
  venueAddress: string
  /** ISO. 화면 입력은 KST 벽시계로 바꿔 쓴다(`isoToKstInput`) */
  startAt: string
  endAt: string
  /** 서버 계산값(= startAt − 1분). **입력 필드가 아니다** */
  saleCloseAt?: string
  /** 서버 계산값(= startAt 기준 D-3 00:00) */
  cancelDeadlineAt?: string
  status: PerformanceStatus
  /**
   * performance_03 `jointPerformance`. 공동 공연이면 규칙 앞에 **참여팀 단계**가 선다.
   *
   * 모르면(`undefined`) 단독으로 본다 — 단계를 하나 세워 막는 쪽이 더 나쁜 오답이다.
   * 조회가 늦어 이 값이 빈 채로 굳으면 공연을 만든 사람이 자기 화면에서 규칙으로도
   * 보증금으로도 못 가게 된다. 반대로 놓쳐도 서버가 409 로 막아 준다.
   */
  jointPerformance?: boolean
  /**
   * 수락을 마친 참여팀 수(**생성 팀 포함**) — performance_03 `participants[]`의 길이다.
   *
   * ⚠ 그 배열은 `PerformanceService.acceptedParticipants`가 만들어 **INVITED 팀이 빠진다**
   * (P-04 머리말 ⚠ ③). 초대만 해 둔 팀은 여기 세어지지 않는다 — 서버의 판정과 같은 기준이다.
   */
  acceptedParticipantCount?: number
  ticketTypes: TicketTypeDraft[]
}

/** `PerformanceDeposit`(performance_01·03의 `deposit`) */
export interface DepositState {
  status: DepositStatus
  /** 50,000 YoYo 고정. 서버가 주는 값을 그대로 쓴다 */
  amount: number
  /** 리더 지갑 현재 잔액(참고용) */
  leaderBalance?: number
  /** 잔액이 보증금 이상인가. 서버 판정을 그대로 쓴다 */
  sufficient?: boolean
}

/** §5.14의 네 단계 + 거부. 화면은 이 값만 보고 그린다 */
export type DepositSignStage =
  | { kind: 'idle' }
  /** ① 준비 — prepare 왕복(선행 `createShow` 생성 포함). 여기 표시가 없으면 클릭이 먹혔는지 모른다 */
  | { kind: 'preparing' }
  /** ② 대기 — 지갑 팝업이 뜬 상태. 승인이 이미 충분하면 `total`이 1이다(§5.14) */
  | { kind: 'signing'; step: number; total: number }
  /** ③ 확정 대기 — 발신자 서명 RLP 보고 후 서버가 대납 서명·전송·receipt를 검증하는 동안 */
  | { kind: 'confirming' }
  /**
   * ②' **선행 작업(온체인 `createShow`)이 방금 확정됐다 — 서명은 다음 클릭에서 한다**(D-77).
   *
   * 확정 대기는 수 초라, 그 뒤에 같은 클릭으로 지갑 팝업을 열면 브라우저의 사용자 활성화가
   * 이미 만료돼 있을 수 있다. 새 클릭 = 새 활성화. 선행 작업이 없는 보통의 경우에는 이 단계를
   * 거치지 않는다. P-06 규칙 동의(`AgreeSignStage`)가 같은 단계를 갖는다 — §5.14를 함께 쓴다.
   */
  | { kind: 'ready-to-sign' }
  /** ④ 완료 */
  | { kind: 'done' }

/**
 * 즉시 실패 뒤 납부 버튼을 잠가 두는 시간. 같은 값이 P-06 규칙 동의(`RuleAgreements.tsx`)에도
 * 있다 — 두 화면의 서명 버튼이 §5.14를 같이 쓰므로 함께 고친다.
 */
const RETRY_LOCK_MS = 1_200

export interface DepositPayResult {
  ok: boolean
  /** 실패 코드. `code`로만 분기한다 */
  code?: string
  msg?: string
  /**
   * **실패가 아니다** — 선행 작업(온체인 `createShow`)이 확정됐고 서명이 남아 있다.
   * 폼은 `ready-to-sign` 단계로 가서 클릭을 한 번 더 받는다(위 단계 주석 · D-77).
   */
  readyToSign?: boolean
}

export interface SaveResult {
  ok: boolean
  /** 저장한 행의 서버 ID. 편집 중인 값은 유지하고 ID만 갱신한다. */
  ticketTypeIds?: { key: string; ticketTypeId: number }[]
  code?: string
  msg?: string
  /** 필드 단위 오류(서버 400이 필드를 짚어 줄 때) */
  fieldErrors?: Partial<Record<keyof PerformanceInfoValues, string>>
}

export interface HostTeamOption {
  teamId: number
  teamName: string
}

/* ── 공통 조각 ────────────────────────────────────────────────────────── */

/** 여러 줄 입력. `Input`(단일 행)과 같은 토큰을 써서 한 폼 안에서 다르게 보이지 않게 한다 */
function TextArea({
  invalid,
  rows = 4,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      rows={rows}
      className={[
        'w-full resize-y rounded-control border bg-ground px-3.5 py-2.5 font-sans text-sm text-ink',
        'transition-colors duration-150 ease-out placeholder:text-faint',
        'disabled:cursor-not-allowed disabled:bg-ground-2 disabled:text-faint',
        invalid ? 'border-danger' : 'border-line hover:border-muted focus:border-primary',
      ].join(' ')}
    />
  )
}

/** 자물쇠 — 사이트 정책 묶음의 머리에서만 쓴다. 색은 부모의 `text-muted`를 따른다 */
function LockGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2.2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  )
}

/**
 * 사이트 정책 값 한 줄 — 예매 마감·취소 마감.
 *
 * 9/24(!203)에 입력 박스를 버리고 라벨 + "정책" 칩 + 평문으로 바꿨는데, 9/26 사용자가 dev에서
 * 여전히 **눌러서 고칠 수 있게** 보인다고 했다. 남아 있던 단서 둘을 없앤다.
 *   ① "정책" 칩 — `rounded-chip` + 회색 배경 알약은 장르 필터(`GenreChips`) 같은 **눌리는 칩**과
 *      같은 모양이다. 칩을 없애고 묶음 머리의 평문 한 줄("사이트 정책 · 변경할 수 없어요")로 옮겼다.
 *   ② 자리 — 입력칸 그리드의 **입력이 있던 칸**(장소·주소 바로 아래 2열)에 굵은 본문색 값이
 *      서 있어 빈 입력칸처럼 읽혔다. 입력 그리드 밖, 구분선 아래 별도 묶음으로 뺐다.
 * 값은 라벨 옆에 오른쪽 정렬한 평문이다(공연 요약 레일의 `<dl>`과 같은 모양). 컨트롤·버튼 역할이
 * 없고 탭 순서에도 없으며 `cursor-default`라 hover에서도 손가락 커서가 뜨지 않는다.
 */
function PolicyValue({ label, value, rule, note }: {
  label: string
  /** 확정 시각. 저장 전(서버 미계산)이면 없다 */
  value?: string
  /** 정책 문장(예: "공연 시작 1분 전"). 값이 없으면 이 문장이 값 자리에 선다 */
  rule: string
  note: string
}) {
  return (
    <div
      className="grid cursor-default grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5"
      data-testid="policy-value"
    >
      <dt className="font-sans text-[13px] text-muted">{label}</dt>
      <dd className="m-0 text-right font-sans text-[13px] font-medium text-ink">
        {value ?? rule}
        {value && <span className="ml-1.5 font-normal text-muted">({rule})</span>}
      </dd>
      <dd className="col-span-2 m-0 font-sans text-[11px] leading-relaxed text-muted">{note}</dd>
    </div>
  )
}

/* ── 1단계: 기본 정보 · 일시·장소 ─────────────────────────────────────── */

function InfoStep({
  values,
  errors,
  readOnly,
  teams,
  jointEditable,
  onChangeJoint,
  saleCloseAt,
  cancelDeadlineAt,
  onChange,
}: {
  values: PerformanceInfoValues
  errors: Record<string, string | undefined>
  readOnly: boolean
  teams: HostTeamOption[]
  /**
   * 공동 공연 여부를 **지금 정할 수 있는가** — 생성 모드에서만 true 다.
   * `PerformanceUpdateRequest`에 `jointPerformance`가 없어 저장한 뒤에는 바꿀 수단이 없다.
   */
  jointEditable: boolean
  /** 생성 모드에서 공연 형태 선택 모달을 다시 연다(페이지가 모달을 가진다). 없으면 "변경"을 그리지 않는다 */
  onChangeJoint?: () => void
  saleCloseAt?: string
  cancelDeadlineAt?: string
  onChange: (patch: Partial<PerformanceInfoValues>) => void
}) {
  const { text } = useLocale()
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* ── 기본 정보 폼 ── */}
      <section
        aria-label={text('기본 정보', 'Show details')}
        className="rounded-card border border-line bg-surface p-5 md:p-8"
      >
        <h3 className="m-0 mb-6 font-sans text-lg font-semibold tracking-tight text-ink">
          {text('기본 정보', 'Show details')}
        </h3>

        {/* PC 2열 그리드(P-03 레이아웃). 설명은 폭을 다 쓴다 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField
            id="perf-title"
            label={text('공연 제목', 'Show title')}
            required
            error={errors.title}
            hint={text(
              `${values.title.length} / ${TITLE_MAX}자`,
              `${values.title.length} / ${TITLE_MAX} characters`,
            )}
          >
            {(a) => (
              <Input
                {...a}
                value={values.title}
                maxLength={TITLE_MAX}
                disabled={readOnly}
                placeholder={text('예: 합정 3밴드 합동공연', 'e.g. Three Bands Live in Hapjeong')}
                invalid={Boolean(errors.title)}
                onChange={(e) => onChange({ title: e.target.value })}
              />
            )}
          </FormField>

          {teams.length > 1 ? (
            // ⚠ `hostTeamId`는 화면설계 표에 없다. performance_01의 required라 값이 필요한데,
            //   리더인 팀이 하나뿐이면 고를 것이 없어 그때는 아예 렌더하지 않는다
            <FormField
              id="perf-host-team"
              label={text('여는 팀', 'Host team')}
              required
              error={errors.hostTeamId}
            >
              {(a) => (
                <select
                  {...a}
                  value={values.hostTeamId ?? ''}
                  disabled={readOnly}
                  onChange={(e) => onChange({ hostTeamId: Number(e.target.value) })}
                  className="h-11 w-full rounded-control border border-line bg-ground px-3 font-sans text-sm text-ink disabled:bg-ground-2 disabled:text-faint"
                >
                  <option value="" disabled>
                    {text('팀 선택', 'Select a team')}
                  </option>
                  {teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          ) : (
            <div className="hidden md:block" aria-hidden />
          )}

          <div className="md:col-span-2">
            <FormField
              id="perf-description"
              label={text('공연 설명', 'Description')}
              error={errors.description}
              hint={text(
                `${values.description.length} / ${DESCRIPTION_MAX}자`,
                `${values.description.length} / ${DESCRIPTION_MAX} characters`,
              )}
            >
              {(a) => (
                <TextArea
                  {...a}
                  value={values.description}
                  maxLength={DESCRIPTION_MAX}
                  disabled={readOnly}
                  placeholder={text(
                    '어떤 공연인지 관객에게 소개해 주세요.',
                    'Tell the audience about your show.',
                  )}
                  invalid={Boolean(errors.description)}
                  onChange={(e) => onChange({ description: e.target.value })}
                />
              )}
            </FormField>
          </div>

          {/*
            ⚠ 화면설계 표에 없는 필드. `PerformanceCreateRequest`의 required이고, 이 값이
            **준비 흐름의 모양을 바꾼다** — 합동이면 참여팀 단계가 서고 판매 시작 전에 수락
            참여팀이 2팀 이상이어야 한다(`TEAM_MIN_COUNT_NOT_MET`).

            9/26 — 체크박스가 작아 사용자가 보지 못했다. 이제 **생성 페이지가 폼보다 먼저 모달로
            묻고**(`JointChoiceDialog`) 여기는 고른 결과를 문구로 보여 준다. 생성 모드는 "변경"으로
            모달을 다시 열고, 수정 모드는 문구만 남는다 — 되돌릴 API 가 없으므로
            (`PerformanceUpdateRequest`) 바꿀 수 있어 보이는 컨트롤을 두지 않는다.
          */}
          <div className="md:col-span-2" data-testid="joint-choice">
            <p className="m-0 font-sans text-sm font-medium text-ink">
              {text('공연 형태', 'Show type')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-sans text-base font-semibold text-ink">
                {values.jointPerformance
                  ? text('합동 공연', 'Joint show')
                  : text('단독 공연', 'Single-team show')}
              </span>
              <span className="font-sans text-[13px] text-muted">
                {values.jointPerformance
                  ? text('다른 팀과 함께 공연해요', 'With other teams')
                  : text('혼자 공연해요', 'Just our team')}
              </span>
              {jointEditable && onChangeJoint && !readOnly && (
                <button
                  type="button"
                  onClick={onChangeJoint}
                  aria-label={text('공연 형태 변경', 'Change show type')}
                  className="min-h-11 font-sans text-[13px] font-semibold text-primary underline underline-offset-2 hover:text-primary-bright"
                >
                  {text('변경', 'Change')}
                </button>
              )}
            </div>
            <p className="m-0 mt-1 font-sans text-[11px] text-muted">
              {jointEditable
                ? text('저장한 뒤에는 바꿀 수 없어요.', 'Cannot be changed after saving.')
                : text(
                    '공연 형태는 생성할 때 정하며 나중에 바꿀 수 없습니다.',
                    'The show type is fixed when the show is created and cannot be changed.',
                  )}
            </p>
          </div>
        </div>
      </section>

      {/* ── 일시·장소 폼 ── */}
      <section
        aria-label={text('일시·장소', 'Date and venue')}
        className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
      >
        <h3 className="m-0 mb-3 font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('일시·장소', 'Date and venue')}
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/*
            하루 공연 — 날짜 1개 + 시작·종료 시각(9/26). 폼 값은 예전처럼 `startAt`·`endAt`
            두 개이고 이 조각이 날짜와 시각을 합쳐 넣는다. `endAt`은 화면설계 표에 없는
            `PerformanceCreateRequest`의 required이고 `ENDED` 전이(= 정산 시작) 기준이다.
          */}
          <PerformanceScheduleFields
            startAt={values.startAt}
            endAt={values.endAt}
            startError={errors.startAt}
            endError={errors.endAt}
            readOnly={readOnly}
            onChange={onChange}
          />

          <FormField
            id="perf-venue"
            label={text('장소', 'Venue')}
            required
            error={errors.venueName}
            hint={text(
              `${values.venueName.length} / ${VENUE_NAME_MAX}자`,
              `${values.venueName.length} / ${VENUE_NAME_MAX} characters`,
            )}
          >
            {(a) => (
              <Input
                {...a}
                value={values.venueName}
                maxLength={VENUE_NAME_MAX}
                disabled={readOnly}
                placeholder={text('예: 합정 언플러그드', 'e.g. Hapjeong Unplugged')}
                invalid={Boolean(errors.venueName)}
                onChange={(e) => onChange({ venueName: e.target.value })}
              />
            )}
          </FormField>

          <FormField
            id="perf-venue-address"
            // ⚠ 화면설계 표는 "장소" 하나지만 API는 `venueName`·`venueAddress` 둘 다 required다
            label={text('주소', 'Address')}
            required
            error={errors.venueAddress}
            hint={text(
              `${values.venueAddress.length} / ${VENUE_ADDRESS_MAX}자`,
              `${values.venueAddress.length} / ${VENUE_ADDRESS_MAX} characters`,
            )}
          >
            {(a) => (
              <Input
                {...a}
                value={values.venueAddress}
                maxLength={VENUE_ADDRESS_MAX}
                disabled={readOnly}
                placeholder={text(
                  '예: 서울 마포구 양화로 000',
                  'e.g. 000 Yanghwa-ro, Mapo-gu, Seoul',
                )}
                invalid={Boolean(errors.venueAddress)}
                onChange={(e) => onChange({ venueAddress: e.target.value })}
              />
            )}
          </FormField>

        </div>

        {/*
          ⚠ 화면설계는 "예매 마감"을 입력 필드로 적었지만 **서버 결정 필드**다.
          performance_01의 400 설명이 `saleCloseAt` 전달을 위반으로 못박았다(= startAt − 1분).
          그래서 값을 보여만 준다. 저장 전에는 서버가 아직 계산하지 않아 정책 문장만 둔다.
          입력 그리드 밖, 구분선 아래 평문 묶음으로 그린다(9/24 → 9/26, `PolicyValue` 주석).
        */}
        <section
          aria-label={text('사이트 정책', 'Site policy')}
          className="mt-5 cursor-default border-t border-line pt-4"
        >
          <p className="m-0 mb-3 flex items-center gap-1.5 font-sans text-[11px] font-semibold text-muted md:text-xs">
            <LockGlyph />
            {text('사이트 정책 · 변경할 수 없어요', 'Site policy · cannot be changed')}
          </p>
          <dl className="m-0 flex flex-col gap-3">
            <PolicyValue
              label={text('예매 마감', 'Booking deadline')}
              value={saleCloseAt ? formatKst(saleCloseAt) : undefined}
              rule={text('공연 시작 1분 전', 'One minute before the show')}
              note={text(
                '공연 일시에서 자동으로 계산돼요.',
                'Calculated automatically from the show time.',
              )}
            />
            <PolicyValue
              label={text('취소 마감', 'Cancellation deadline')}
              value={cancelDeadlineAt ? formatKst(cancelDeadlineAt) : undefined}
              rule={text('공연 3일 전 00:00', 'Midnight, 3 days before the show')}
              note={text(
                '관객이 티켓을 취소할 수 있는 마지막 시각이에요.',
                'The last time an audience member can cancel a ticket.',
              )}
            />
          </dl>
        </section>
      </section>
    </div>
  )
}

/* ── 1단계: 티켓 옵션 ─────────────────────────────────────────────────── */

/**
 * 티켓 옵션 편집 목록.
 *
 * §5.21은 "모바일에서 표를 가로 스크롤시키지 않는다 · 행 하나 = 패널 하나"이고,
 * P-03 레이아웃은 "모바일은 표 행 편집이 아니라 **옵션별 패널 편집**"이다.
 *
 * 두 폭에서 **같은 DOM**을 쓴다 — 표와 패널을 각각 그리면 입력이 두 벌이 되고
 * `id`가 겹쳐 라벨 연결이 깨진다. 대신 그리드 열 수를 폭으로 바꾸고, 라벨은
 * 모바일에서만 보이게 한다(PC에서는 열 머리글이 그 역할을 한다).
 */
function TicketTypesStep({
  rows,
  errors,
  listError,
  readOnly,
  onChange,
  onAdd,
  onRemove,
}: {
  rows: TicketTypeDraft[]
  errors: ReturnType<typeof validateTicketTypes>['rows']
  listError?: string
  readOnly: boolean
  onChange: (index: number, patch: Partial<TicketTypeDraft>) => void
  onAdd: () => void
  onRemove: (index: number) => void
}) {
  const { text } = useLocale()
  const cols = 'md:grid-cols-[minmax(0,1fr)_140px_120px_44px]'

  return (
    <section
      aria-label={text('티켓 옵션', 'Ticket options')}
      className="rounded-card border border-line bg-surface p-5 md:p-8"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="m-0 font-sans text-lg font-semibold tracking-tight text-ink">
          {text('티켓 옵션', 'Ticket options')}
        </h3>
        <span className="font-sans text-[11px] text-muted">
          {rows.length} / {TICKET_TYPE_MAX}
        </span>
      </div>

      {listError && (
        <p className="m-0 mb-3 font-sans text-[11px] font-semibold text-danger md:text-xs">
          {listError}
        </p>
      )}

      {/* PC 열 머리글. 모바일에서는 각 입력이 자기 라벨을 갖는다 */}
      <div aria-hidden className={`hidden gap-3 border-b border-line pb-2 md:grid ${cols}`}>
        {[
          text('타입명', 'Ticket type'),
          text('가격(YoYo)', 'Price (YoYo)'),
          text('수량', 'Quantity'),
          '',
        ].map((c) => (
          <span key={c} className="font-sans text-[11px] font-semibold text-muted">
            {c}
          </span>
        ))}
      </div>

      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:gap-0">
        {rows.map((row, i) => {
          const e = errors[i] ?? {}
          return (
            <li
              key={row.key}
              className={[
                // 모바일: 옵션별 패널 / PC: 표의 한 행
                'rounded-card border border-line px-3 py-3',
                'md:rounded-none md:border-x-0 md:border-t-0 md:px-0 md:py-3',
                'grid grid-cols-1 items-start gap-3',
                cols,
              ].join(' ')}
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`tt-${row.key}-name`}
                  className="font-sans text-[11px] font-semibold text-muted md:sr-only"
                >
                  {text('타입명', 'Ticket type')}
                </label>
                <Input
                  id={`tt-${row.key}-name`}
                  value={row.name}
                  maxLength={TICKET_NAME_MAX}
                  disabled={readOnly}
                  placeholder={text('예: 일반', 'e.g. General admission')}
                  invalid={Boolean(e.name)}
                  aria-describedby={e.name ? `tt-${row.key}-name-error` : undefined}
                  onChange={(ev) => onChange(i, { name: ev.target.value })}
                />
                {e.name && (
                  <p
                    id={`tt-${row.key}-name-error`}
                    className="m-0 font-sans text-[11px] font-semibold text-danger"
                  >
                    {e.name}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`tt-${row.key}-price`}
                  className="font-sans text-[11px] font-semibold text-muted md:sr-only"
                >
                  {text('가격(YoYo)', 'Price (YoYo)')}
                </label>
                <Input
                  id={`tt-${row.key}-price`}
                  // 원 정수만 받는다(§5.4 · performance_05). 숫자 키보드를 띄우되 형식 검증은 우리가 한다
                  inputMode="numeric"
                  value={row.price}
                  disabled={readOnly}
                  placeholder="25000"
                  invalid={Boolean(e.price)}
                  aria-describedby={e.price ? `tt-${row.key}-price-error` : undefined}
                  onChange={(ev) => onChange(i, { price: ev.target.value })}
                />
                {e.price && (
                  <p
                    id={`tt-${row.key}-price-error`}
                    className="m-0 font-sans text-[11px] font-semibold text-danger"
                  >
                    {e.price}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`tt-${row.key}-qty`}
                  className="font-sans text-[11px] font-semibold text-muted md:sr-only"
                >
                  {text('수량', 'Quantity')}
                </label>
                <Input
                  id={`tt-${row.key}-qty`}
                  inputMode="numeric"
                  value={row.totalQuantity}
                  disabled={readOnly}
                  placeholder="80"
                  invalid={Boolean(e.totalQuantity)}
                  aria-describedby={e.totalQuantity ? `tt-${row.key}-qty-error` : undefined}
                  onChange={(ev) => onChange(i, { totalQuantity: ev.target.value })}
                />
                {e.totalQuantity && (
                  <p
                    id={`tt-${row.key}-qty-error`}
                    className="m-0 font-sans text-[11px] font-semibold text-danger"
                  >
                    {e.totalQuantity}
                  </p>
                )}
              </div>

              {/* 행 액션은 패널 하단 버튼 줄로 내린다(§5.21). PC에서는 마지막 열 */}
              <div className="flex justify-end md:justify-center">
                <button
                  type="button"
                  disabled={readOnly || rows.length <= 1}
                  aria-label={text(
                    `${row.name || `${i + 1}번`} 옵션 삭제`,
                    `Remove ticket type ${row.name || i + 1}`,
                  )}
                  onClick={() => onRemove(i)}
                  className="flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors duration-150 ease-out hover:bg-ground-2 hover:text-danger disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                    <path
                      d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8h4.8l.6-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {!readOnly && (
        <div className="mt-3">
          <Button variant="secondary" sm disabled={rows.length >= TICKET_TYPE_MAX} onClick={onAdd}>
            {text('옵션 추가', '+ Add ticket type')}
          </Button>
        </div>
      )}

      <p className="m-0 mt-3 font-sans text-[11px] text-muted">
        {text(
          '저장하면 이 목록이 그대로 적용됩니다. 목록에서 지운 옵션은 사라집니다.',
          'Saving replaces the ticket types with this list. Removed options will be deleted.',
        )}
      </p>
    </section>
  )
}

/* ── 2단계: 참여팀 ────────────────────────────────────────────────────── */

/**
 * 참여팀은 **다른 화면(P-04)**이 관리한다. 이 단계는 그 화면으로 보내고 돌아온 결과를 읽는
 * 자리다 — 초대 폼·수락 목록·제외 액션을 여기 복제하지 않는다. 바로 아래 `RulesStep`과 같은
 * 모양이다.
 *
 * 규칙보다 앞인 이유는 규칙 화면이 참여팀을 **입력으로 쓰기** 때문이다(P-05가 `participants[]`
 * 로 팀 몫 행을 만든다). 초대 전에는 생성 팀 하나뿐이라 공동 공연의 규칙이 1팀으로 굳는다.
 * 서버도 같은 순서를 요구한다 — 공동 공연의 보증금 prepare·판매 시작이 수락 참여팀 2 이상을
 * 확인한다(`TEAM_MIN_COUNT_NOT_MET`).
 *
 * **단독 공연은 초대할 팀이 없어 이 단계를 건너뛴다** — 단계 표시에서도 뺀다
 * (`visibleSetupSteps`). 그래도 카드 자체는 남긴다: `state.step`·히스토리로 이 단계에 들어올
 * 수 있고, 그때 막다른 화면이 되면 안 된다.
 */
function ParticipantsStep({
  performanceId,
  joint,
  acceptedCount,
  done,
  onBack,
  onNext,
}: {
  performanceId?: number
  /** 공동 공연인가(performance_03 `jointPerformance`) */
  joint: boolean
  /** 수락을 마친 참여팀 수(생성 팀 포함). 모르면 `undefined` — 0 과 구분한다 */
  acceptedCount?: number
  done: boolean
  onBack: () => void
  onNext: () => void
}) {
  const { text } = useLocale()
  return (
    <section
      aria-label={text('참여팀', 'Participants')}
      className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
    >
      <h3 className="m-0 mb-3 font-sans text-[11px] font-semibold text-muted md:text-xs">
        Participants <span className="font-normal">/ 참여팀</span>
      </h3>

      <p className="m-0 font-sans text-[13px] leading-relaxed text-ink">
        {!joint
          ? text(
              '혼자 무대에 오르는 공연이라 이 단계는 건너뜁니다. 바로 정산 규칙을 정해 주세요.',
              'This show has a single team, so this step is skipped. Go straight to the settlement rules.',
            )
          : done
            ? text(
                '함께 오르는 팀이 정해졌습니다. 이어서 정산 규칙에서 팀별 몫을 나눠 주세요.',
                'Your participating teams are set. Next, split each team’s share in the settlement rules.',
              )
            : text(
                '함께 무대에 오르는 팀을 먼저 초대해 주세요. 정산 규칙은 참여팀이 정해진 뒤에 나눕니다.',
                'Invite the teams joining you on stage first. Settlement rules are split once the participating teams are set.',
              )}
      </p>

      {joint && acceptedCount != null && (
        <p className="m-0 mt-2 font-sans text-[13px] text-muted">
          {text('참여를 수락한 팀', 'Teams that accepted')} {acceptedCount}
          {text('곳 (공연을 만든 팀 포함)', ' (including the team that created the show)')}
        </p>
      )}

      {/*
        `RulesStep`과 같은 이유로 액션이 카드 안에 다 있다 — 이 단계는 하단 고정도 PC 액션 행도
        그리지 않고 `Stepper`는 `<ol>`이라 눌러서 돌아갈 수 없다. 앞 단계로 가는 길을 여기 둔다.
      */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={onBack}>
          {text('이전 단계', 'Previous step')}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {performanceId != null && joint && (
            <Link
              to={`/studio/performances/${performanceId}/participants`}
              className={[
                'inline-flex min-h-11 items-center rounded-control px-5 font-sans text-sm font-semibold',
                'transition-colors duration-150 ease-out',
                done
                  ? 'border border-line bg-surface text-ink hover:bg-ground-2'
                  : 'bg-primary text-white hover:bg-primary-bright',
              ].join(' ')}
            >
              {text('참여팀 초대', 'Invite teams')}
            </Link>
          )}
          {done && <Button onClick={onNext}>{text('정산 규칙으로', 'Continue to rules')}</Button>}
        </div>
      </div>
    </section>
  )
}

/* ── 3단계: 정산 규칙 ─────────────────────────────────────────────────── */

/**
 * 정산 규칙은 **다른 화면(P-05)**이 편집한다. 이 단계는 그 화면으로 보내고 돌아온 결과를
 * 읽는 자리다 — 규칙 편집기(비율·팀별 몫·시뮬레이션)를 여기 복제하지 않는다.
 *
 * 저장 여부는 **공연 상태로 안다.** 규칙을 저장해야 `DRAFT` → `PENDING_AGREEMENT` 로
 * 가므로(`RuleService`) `DRAFT` 가 곧 "규칙 미저장"이다. 조회를 늘리지 않는다.
 *
 * 동의보다 앞인 이유는 서버 순서다 — 규칙 저장이 온체인 `createShow` 를 걸고(`RuleService`),
 * 동의는 그 공연에 `agreeToRules` 를 보낸다. 서명할 `rulesHash` 자체가 여기서 생긴다.
 */
function RulesStep({
  performanceId,
  saved,
  onBack,
  onNext,
}: {
  performanceId?: number
  saved: boolean
  onBack: () => void
  onNext: () => void
}) {
  const { text } = useLocale()
  return (
    <section
      aria-label={text('정산 규칙', 'Settlement rules')}
      className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
    >
      <h3 className="m-0 mb-3 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('정산 규칙', 'Settlement rules')}
      </h3>

      <p className="m-0 font-sans text-[13px] leading-relaxed text-ink">
        {saved
          ? text(
              '정산 규칙을 저장했습니다. 이어서 참여팀 리더의 규칙 동의를 받아 주세요.',
              'Settlement rules are saved. Next, collect the team leaders’ agreement.',
            )
          : text(
              '수익을 어떻게 나눌지 먼저 정합니다. 규칙을 저장해야 참여팀 리더가 동의할 수 있습니다.',
              'Decide how revenue is split first. Team leaders can only agree once the rules are saved.',
            )}
      </p>

      {/*
        이 단계의 액션은 여기 한 줄이 전부다 — 하단 고정도 PC 액션 행도 이 단계는 그리지 않고
        `Stepper` 는 `<ol>` 이라 눌러서 돌아갈 수 없다. **앞 단계로 가는 길을 여기 둔다.**
        수정 모드 저장이 이 단계로 밀어 넣으므로(`saveSetup`), 없으면 오타 하나 고치러 온
        사용자가 공연 정보로 돌아갈 화면 안 경로를 잃는다.
      */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={onBack}>
          {text('이전 단계', 'Previous step')}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {performanceId != null && (
            <Link
              to={`/studio/performances/${performanceId}/rules`}
              className={[
                'inline-flex min-h-11 items-center rounded-control px-5 font-sans text-sm font-semibold',
                'transition-colors duration-150 ease-out',
                saved
                  ? 'border border-line bg-surface text-ink hover:bg-ground-2'
                  : 'bg-primary text-white hover:bg-primary-bright',
              ].join(' ')}
            >
              {saved
                ? text('규칙 다시 보기', 'Review rules')
                : text('정산 규칙 정하러 가기', 'Set settlement rules')}
            </Link>
          )}
          {saved && (
            <Button onClick={onNext}>{text('규칙 동의 단계로', 'Continue to agreements')}</Button>
          )}
        </div>
      </div>
    </section>
  )
}

/* ── 4단계: 규칙 동의 ─────────────────────────────────────────────────── */

/**
 * 규칙 동의는 **다른 화면(P-06)**이 받는다. 이 단계는 그 화면으로 보내고 돌아온 결과를 읽는
 * 자리다 — 동의 목록·서명 버튼을 여기 복제하지 않는다. `RulesStep`·`ParticipantsStep`과 같은
 * 모양이다.
 *
 * **단독 공연에도 이 단계가 있다.** 컨트랙트가 `agreedCount == teamWallets.length` 를 요구해
 * 참여팀이 생성 팀 하나뿐이어도 그 리더가 자기 지갑으로 서명해야 한다. 건너뛰는 것은
 * 참여팀 단계뿐이다.
 *
 * 보증금보다 앞인 이유는 서버 제약이 아니라 **팀 결정(2026-09-21)** 이다 — 동의는 보증금을
 * 선행 조건으로 보지 않고(rule_03), 판매 시작만이 둘 다를 요구한다. 근거는 `setupSteps.ts`.
 */
function AgreementsStep({
  performanceId,
  rulesSaved,
  done,
  onBack,
  onNext,
  onGoToRules,
}: {
  performanceId?: number
  /** 규칙이 저장됐는가 — 아니면 rule_02가 404라 동의 자체를 시작할 수 없다 */
  rulesSaved: boolean
  /** 참여팀 전원이 `AGREED` 인가(`agreementsStepDone`). 모르면 false */
  done: boolean
  onBack: () => void
  onNext: () => void
  onGoToRules: () => void
}) {
  const { text } = useLocale()
  return (
    <section
      aria-label={text('규칙 동의', 'Rule agreements')}
      className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
    >
      <h3 className="m-0 mb-3 font-sans text-[11px] font-semibold text-muted md:text-xs">
        Rule agreements <span className="font-normal">/ 규칙 동의</span>
      </h3>

      <p className="m-0 font-sans text-[13px] leading-relaxed text-ink">
        {!rulesSaved
          ? text(
              '정산 규칙을 먼저 저장하세요. 저장된 규칙이 있어야 동의할 내용이 생깁니다.',
              'Save the settlement rules first. There is nothing to agree to until they are saved.',
            )
          : done
            ? text(
                '참여팀 전원이 규칙에 동의했습니다. 마지막으로 보증금을 내면 판매를 시작할 수 있습니다.',
                'All participating teams have agreed. Pay the deposit last to start ticket sales.',
              )
            : text(
                '참여팀 리더가 각자 지갑으로 규칙에 동의합니다. 전원 동의 뒤 보증금을 내면 판매를 시작할 수 있습니다.',
                'Each participating team leader agrees to the rules with their own wallet. Once everyone has agreed, pay the deposit to start ticket sales.',
              )}
      </p>

      {/* `RulesStep`과 같은 이유로 액션이 카드 안에 다 있다 — 그쪽 주석 참고 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={onBack}>
          {text('이전 단계', 'Previous step')}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!rulesSaved ? (
            <Button onClick={onGoToRules}>
              {text('정산 규칙 단계로', 'Go to settlement rules')}
            </Button>
          ) : (
            performanceId != null && (
              <Link
                to={`/studio/performances/${performanceId}/agreements`}
                className={[
                  'inline-flex min-h-11 items-center rounded-control px-5 font-sans text-sm font-semibold',
                  'transition-colors duration-150 ease-out',
                  done
                    ? 'border border-line bg-surface text-ink hover:bg-ground-2'
                    : 'bg-primary text-white hover:bg-primary-bright',
                ].join(' ')}
              >
                {done
                  ? text('동의 현황 다시 보기', 'Review agreements')
                  : text('규칙 동의 받으러 가기', 'Collect team agreements')}
              </Link>
            )
          )}
          {done && <Button onClick={onNext}>{text('보증금 단계로', 'Continue to deposit')}</Button>}
        </div>
      </div>
    </section>
  )
}

/* ── 5단계: 보증금 ────────────────────────────────────────────────────── */

/**
 * 보증금 패널 + §5.14 서명 단계 + §5.16 잔액 부족 안내.
 *
 * 표시 데이터는 P-03 컴포넌트 표 그대로다 — 보증금 금액(50,000 YoYo 고정) · 상태 배지 ·
 * 리더 지갑 잔액 · 반환 조건 안내. **잔액을 확보하는 버튼은 없다.**
 *
 * ⚠ `FORFEITED`(몰수됨) 배지는 **P1**이라 자리만 두고 만들지 않았다. API의
 * `PerformanceDepositStatus` enum도 3값(UNPAID·PAID·RETURNED)뿐이라 지금은 그릴 값이 없다.
 */
function DepositStep({
  deposit,
  wallet,
  title,
  splitterAddress,
  stage,
  rejected,
  stalled,
  shortfall,
  rulesRequired,
  agreementsDone,
  onBackToAgreements,
  onPay,
  payable,
  walletReady,
  performanceId,
}: {
  deposit: DepositState
  wallet?: StudioLeaderWallet
  title: string
  splitterAddress?: string
  stage: DepositSignStage
  rejected: boolean
  /** 확정을 못 본 채 폴링 상한에 닿았다 — 재시도를 잠근다 */
  stalled: boolean
  /**
   * §5.16 잔액 부족 안내. `undefined`면 잔액 문제가 아니고, `null`이면 **부족한 것은 확실한데
   * 금액을 모른다**(잔액 미도착 또는 캐시가 서버보다 높음). A-05가 `shortfall: null`에 쓰는 방식과 같다
   */
  shortfall?: number | null
  /** 서버가 `PERFORMANCE_RULES_REQUIRED`로 막았다 — 규칙 링크를 경고 톤으로 바꾼다 */
  rulesRequired: boolean
  /**
   * 참여팀 전원이 규칙에 동의했는가. **막는 값이 아니라 안내용이다** — 서버는 동의 전 보증금도
   * 받는다(rule_03·performance_13 어느 쪽도 상대를 선행 조건으로 보지 않는다). 이 단계로
   * 직접 온 사람의 납부를 잠그면 서버가 허용하는 일을 화면이 막는 꼴이 된다.
   */
  agreementsDone: boolean
  /** 동의 단계로 되돌아가는 길. 순서 안내 옆에 둔다 */
  onBackToAgreements: () => void
  onPay: () => void
  /**
   * 상위가 `onPayDeposit`을 줬는가. 없으면 눌러도 아무 일도 일어나지 않으므로 막는다 —
   * 0·1단계의 `primaryDisabled`와 같은 규칙이다. 이 단계의 주 액션은 PC 액션 행(`step !== 2`라
   * 여기서는 그려지지 않는다)이 아니라 이 패널 안에 있어 판정을 따로 받아야 한다.
   */
  payable: boolean
  /**
   * 지갑 SDK가 서명을 받을 준비가 됐는가(`useWalletReady`). `false`면 납부 버튼을 잠그고
   * 준비 중 문구를 보인다(D-77 원인 A) — 로그인 화면(C-01)과 같은 게이트다.
   */
  walletReady: boolean
  performanceId?: number
}) {
  const { text } = useLocale()
  // `ready-to-sign`은 기다리는 단계가 아니다 — 버튼이 그 자리를 쓴다(D-77)
  const busy = stage.kind !== 'idle' && stage.kind !== 'done' && stage.kind !== 'ready-to-sign'
  /** 선행 작업이 확정돼 서명만 남았다 — 버튼 문구를 "서명하기"로 바꿔 다시 누르게 한다 */
  const readyToSign = stage.kind === 'ready-to-sign'
  /**
   * 체인 job이 확정됐으면(`done`) 서버 `deposit_status`가 아직 UNPAID여도 완료로 그린다 —
   * 무효화된 performance_06이 돌아오기까지의 공백에서 "보증금 납부하기" 버튼이 되살아나
   * 이미 낸 돈을 또 내려고 누르게 된다. **배지는 그대로 서버 값을 쓴다**(낙관적 갱신 금지).
   */
  const paid = deposit.status !== 'UNPAID' || stage.kind === 'done'
  const suspended = wallet?.status === 'SUSPENDED'

  return (
    <section
      id="deposit-panel"
      aria-label={text('보증금', 'Deposit')}
      className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('보증금', 'Deposit')}
        </h3>
        <DepositStatusBadge status={deposit.status} />
      </div>

      <p className="m-0 font-num text-2xl font-bold tabular-nums text-ink">
        {formatYoyo(deposit.amount)}
      </p>
      <p className="m-0 mt-1 font-sans text-[11px] text-muted">
        {text('리더 지갑 잔액', 'Leader wallet balance')}{' '}
        <span className="font-num tabular-nums text-ink">
          {deposit.leaderBalance == null ? '—' : formatYoyo(deposit.leaderBalance)}
        </span>
      </p>

      {/* 보증금 안내 — 명세가 정한 문구 그대로 */}
      <p className="m-0 mt-3 font-sans text-[13px] leading-relaxed text-muted">
        {text(
          '보증금은 정산이 완료되거나 공연 취소 후 일괄 환불이 끝나면 리더 지갑으로 돌아옵니다.',
          'Your deposit returns to the leader wallet after settlement, or after all refunds for a cancelled show are complete.',
        )}
      </p>

      {/*
        §5.16 잔액 부족 안내 — 확보 버튼·링크를 두지 않는다.
        **서버가 전용 코드로 확정해 준 뒤에만 뜬다**(-151). 부족액은 화면 계산이라 모를 수 있고,
        그때는 금액 없이 안내만 낸다 — 계산이 안 된다고 서버 판정을 삼키면 안 된다
      */}
      {!paid && shortfall !== undefined && (
        <div className="mt-3">
          <StudioNotice
            tone="warning"
            title={
              shortfall == null
                ? text(
                    `보증금 ${formatYoyo(deposit.amount)}를 내기에 잔액이 부족해요`,
                    `Your balance is not enough for the ${formatYoyo(deposit.amount)} deposit`,
                  )
                : text(
                    `보증금 ${formatYoyo(deposit.amount)} 중 ${formatYoyo(shortfall)}가 모자라요`,
                    `You need ${formatYoyo(shortfall)} more for the ${formatYoyo(deposit.amount)} deposit`,
                  )
            }
          >
            {/*
              부족액을 모를 때는 **잔액도 말하지 않는다.** 그 상태는 화면이 아는 잔액을 못 믿는
              상황(조회 전이거나 서버 값보다 높다)이라, 여기 숫자를 찍으면 "잔액이 부족해요"와
              "현재 잔액 80,000 YoYo"이 한 패널에서 서로를 부정한다
            */}
            {shortfall != null && (
              <>
                {text('현재 잔액', 'Current balance')}{' '}
                {deposit.leaderBalance == null ? '—' : formatYoyo(deposit.leaderBalance)}{' '}
              </>
            )}
            {text(
              '공연은 준비 중 상태로 유지됩니다. 잔액이 채워지면 여기서 다시 시도할 수 있어요.',
              'Your show remains a draft. Return here once your balance is sufficient.',
            )}
          </StudioNotice>
        </div>
      )}

      {/*
        선행 조건 — 온체인 `createShow`가 `rulesHash`를 요구하므로 **정산 규칙이 먼저**다.
        규칙 없이 서명하면 서버가 409(`PERFORMANCE_RULES_REQUIRED`)로 막거나 체인에서 revert 된다.
        이 화면은 규칙 저장 여부를 조회하지 않으므로 평소에는 판정하지 않고 가는 길만 남긴다.
        **서버가 그 코드로 막았을 때만** 같은 자리를 단언으로 바꾼다 — 실패 패널에 링크를 하나 더
        만들지 않고 이 링크를 쓴다(-151).
      */}
      {!paid && performanceId != null && (
        <p
          className={[
            'm-0 mt-3 font-sans text-[13px]',
            rulesRequired ? 'font-semibold text-danger' : 'text-muted',
          ].join(' ')}
        >
          {rulesRequired
            ? text(
                '정산 규칙을 아직 저장하지 않아 보증금을 낼 수 없습니다.',
                'The settlement rules are not saved yet, so the deposit cannot be paid.',
              )
            : text(
                '정산 규칙을 저장한 뒤에 납부할 수 있습니다.',
                'The deposit can be paid once the settlement rules are saved.',
              )}{' '}
          <Link
            to={`/studio/performances/${performanceId}/rules`}
            className="font-semibold text-primary underline"
          >
            {text('정산 규칙 화면으로', 'Go to settlement rules')}
          </Link>
        </p>
      )}

      {/*
        순서 안내 — **하드 가드가 아니다.** 보증금은 준비 흐름의 마지막이지만 서버는 동의 전
        납부도 받는다. 그래서 납부 버튼은 그대로 두고 남은 일만 알린다. 여기서 잠그면
        동의를 기다리는 동안 리더가 자기 보증금을 낼 길이 사라진다.
      */}
      {!paid && !agreementsDone && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="m-0 font-sans text-[13px] text-muted">
            {text(
              '참여팀 리더의 규칙 동의가 아직 끝나지 않았습니다. 전원 동의와 보증금이 모두 끝나야 판매를 시작할 수 있습니다.',
              'Not every team leader has agreed to the rules yet. Ticket sales need both the agreements and the deposit.',
            )}
          </p>
          <Button variant="ghost" sm onClick={onBackToAgreements}>
            {text('규칙 동의 단계로', 'Go to agreements')}
          </Button>
        </div>
      )}

      {/* §5.14 ① 요약 — 팝업 전에 항상 먼저 보여준다. 서명이 끝난 뒤에는 그릴 이유가 없다 */}
      {!paid && (
        <div className="mt-3 rounded-card border border-line bg-ground-2 px-3 py-3">
          <p className="m-0 font-sans text-[13px] font-semibold text-ink">
            {text(
              `${title} 공연의 보증금 ${formatYoyo(deposit.amount)}를 예치합니다.`,
              `Deposit ${formatYoyo(deposit.amount)} for ${title}.`,
            )}
          </p>
          {splitterAddress && (
            // 대상 컨트랙트 축약 주소(§5.3). 공연자 화면이라 주소 노출이 허용된다
            <p className="m-0 mt-1 font-sans text-[11px] text-muted">
              {text('대상 컨트랙트', 'Contract')}
              <span className="font-mono">{shortenHex(splitterAddress)}</span>
            </p>
          )}
          <p className="m-0 mt-1 font-sans text-[11px] text-muted">
            {text(
              '승인과 납부, 두 번 서명합니다. 네트워크 수수료는 내지 않습니다.',
              'Sign twice: approval, then deposit. Network fees are covered.',
            )}
          </p>
        </div>
      )}

      {/*
        지갑 준비 게이트(D-77 · §5.14 상태 항목). 로그인 화면과 **같은 문구**를 쓴다 —
        같은 기다림이라 사용자가 두 화면에서 같은 말을 들어야 한다
      */}
      {!paid && !walletReady && (
        <p
          role="status"
          aria-live="polite"
          className="m-0 mt-3 font-sans text-[13px] font-semibold text-muted"
        >
          {text('지갑을 준비하고 있어요…', 'Preparing your wallet…')}
        </p>
      )}

      {/* ②' 선행 작업 확정 — 서명은 새 클릭에서 한다(브라우저 팝업 정책, §5.14) */}
      {readyToSign && (
        <p
          role="status"
          aria-live="polite"
          className="m-0 mt-3 font-sans text-[13px] font-semibold text-ink"
        >
          {text(
            '공연 등록이 확정됐어요. 서명하기를 눌러 납부를 마쳐 주세요.',
            'Your show is registered. Tap “Sign now” to finish the deposit.',
          )}
        </p>
      )}

      {/* §5.14 ④' 거부 — 에러가 아니다. 안내 한 줄만 남기고 초기 상태로 돌아간다 */}
      {rejected && (
        <p className="m-0 mt-3 font-sans text-[13px] font-semibold text-ink">
          {text(
            '서명을 취소했어요. 잔액은 그대로이고 공연도 준비 중 상태로 남아 있습니다.',
            'Signature cancelled. Your balance is unchanged and your show remains a draft.',
          )}
        </p>
      )}

      {stalled && !paid && (
        <p className="m-0 mt-3 font-sans text-[13px] font-semibold text-danger">
          {text(
            '보낸 요청이 아직 확정되지 않았습니다. 다시 서명하면 보증금을 두 번 낼 수 있어 잠갔습니다. 잠시 뒤 새로고침해 상태를 확인해 주세요.',
            'Your request has not been confirmed yet. Signing again could pay the deposit twice, so it is locked. Refresh in a moment to check the status.',
          )}
        </p>
      )}

      {suspended && !paid && (
        <p className="m-0 mt-3 font-sans text-[13px] font-semibold text-danger">
          {text(
            '지갑이 이용 정지 상태라 보증금을 낼 수 없습니다. 관리자에게 문의해 주세요.',
            'Your wallet is suspended. Contact an administrator before paying the deposit.',
          )}
        </p>
      )}

      {/*
        PC 액션 자리(§5.19 — 폼 하단 오른쪽). **서명 진행 중에는 같은 자리가 진행 표시로 바뀐다** —
        버튼과 진행이 자리를 나눠 쓰면 시선이 옮겨진다.
      */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {busy ? (
          <DepositProgress stage={stage} />
        ) : paid ? (
          <>
            <span className="font-sans text-[13px] font-semibold text-ink">
              {text('납부 완료', 'Deposit paid')}
            </span>
            {/*
              납부 뒤 다음 행동은 **판매 시작**이다(9/24). 예전엔 이 자리에 "참여팀 관리로"가
              주 버튼으로 있어 보증금이 끝난 리더를 P-04 로 되돌려 보냈다. 판매 시작 버튼은
              P-06 에 있다. 참여팀 링크는 참여팀 단계 카드에 그대로 있다.
            */}
            {performanceId != null && (
              <DepositNextAction performanceId={performanceId} agreementsDone={agreementsDone} />
            )}
          </>
        ) : (
          <Button
            disabled={!payable || stalled || suspended || wallet == null || !walletReady}
            onClick={onPay}
          >
            {readyToSign ? text('서명하기', 'Sign now') : text('보증금 납부하기', 'Pay deposit')}
          </Button>
        )}
      </div>
    </section>
  )
}

/**
 * 보증금 납부 뒤 다음 행동 — **판매 시작하러 가기**(P-06, 판매 시작 버튼이 있는 곳).
 *
 * 전원 동의 전이면 판매 시작이 아직 잠겨 있으므로(서버 `NotAllAgreed`) 그 사실을 한 줄로
 * 같이 알린다. 링크를 숨기지 않는 이유 — P-06 이 동의 현황을 보여 주는 곳이기도 하다.
 */
function DepositNextAction({
  performanceId,
  agreementsDone,
}: {
  performanceId: number
  agreementsDone: boolean
}) {
  const { text } = useLocale()
  return (
    <>
      {!agreementsDone && (
        <p className="m-0 w-full text-right font-sans text-[13px] text-muted">
          {text(
            '다른 팀 동의가 끝나면 판매를 시작할 수 있어요.',
            'Once the other teams agree, you can start ticket sales.',
          )}
        </p>
      )}
      <Link
        to={`/studio/performances/${performanceId}/agreements`}
        className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-bright"
      >
        {text('판매 시작하러 가기', 'Go to start sales')}
      </Link>
    </>
  )
}

/**
 * §5.14 ②③④ 진행 인디케이터.
 *
 * 문구는 §5.14 표 그대로다 — "{text('지갑에서 확인해 주세요', 'Confirm in your wallet')} (1/2 → 2/2)" → "확인 중…" → "납부 완료".
 * 승인(approve)이 이미 충분하면 서버가 `signRequests`를 1건만 주므로 카운터가 `1/1`이 된다.
 */
function DepositProgress({ stage }: { stage: DepositSignStage }) {
  const { text } = useLocale()
  // `ready-to-sign`은 기다리는 단계가 아니다 — 버튼이 그 자리를 쓴다(§5.14 ②')
  if (stage.kind === 'idle' || stage.kind === 'ready-to-sign') return null
  return (
    <p
      role="status"
      className="m-0 flex items-center gap-2 font-sans text-[13px] font-semibold text-ink"
    >
      {/* 완료는 기다릴 것이 없다 — 여기서 스피너가 돌면 아직 처리 중으로 읽힌다 */}
      {stage.kind === 'done' ? (
        <span aria-hidden className="font-sans text-ok">
          ✓
        </span>
      ) : (
        <Spinner size={18} />
      )}
      {stage.kind === 'preparing' && text('보증금 준비 중…', 'Preparing deposit…')}
      {stage.kind === 'signing' &&
        `${text('지갑에서 확인해 주세요', 'Confirm in your wallet')} (${stage.step}/${stage.total})`}
      {stage.kind === 'confirming' &&
        text('블록체인 기록을 확인 중…', 'Recording on the blockchain…')}
      {stage.kind === 'done' && text('납부 완료', 'Deposit paid')}
    </p>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

function ShowSummaryRail({
  values,
  rows,
  teams,
  deposit,
  step,
}: {
  values: PerformanceInfoValues
  rows: TicketTypeDraft[]
  teams: HostTeamOption[]
  deposit: DepositState
  step: number
}) {
  const { text } = useLocale()
  const hostTeam = teams.find((team) => team.teamId === values.hostTeamId)
  // 하루 공연 — "날짜 · 시작–종료 KST". 종료가 다음 날이면 시각 뒤에 +1을 붙인다
  const endDay = values.endAt.slice(0, 10)
  const endMark = endDay && endDay !== values.startAt.slice(0, 10) ? ' (+1)' : ''
  const schedule = values.startAt
    ? `${values.startAt.slice(0, 10)} · ${values.startAt.slice(11, 16)}${
        values.endAt ? `–${values.endAt.slice(11, 16)}${endMark}` : ''
      } KST`
    : '—'
  // 요약은 **내부 단계**를 그대로 읽는다 — 표시 배열(`visibleSetupSteps`)이 아니라 라벨 정본이다
  const currentStep = STEPS[step] ?? STEPS[0]

  return (
    <aside
      role="region"
      aria-label={text('공연 요약', 'Show summary')}
      className="h-fit rounded-card border border-line bg-surface p-5 md:sticky md:top-4"
    >
      <p className="studio-section-label m-0 text-xs font-semibold text-muted">
        {text('공연 요약', 'Show summary')}
      </p>
      <p className="m-0 mt-4 break-words font-sans text-xl font-semibold tracking-tight text-ink">
        {values.title.trim() || text('제목을 입력해 주세요', 'Enter a show title')}
      </p>
      <dl className="m-0 mt-5 flex flex-col gap-3 border-t border-line pt-4">
        {[
          [text('현재 단계', 'Current step'), text(currentStep[0], currentStep[1])],
          /*
            공연 형태는 저장 뒤 바꿀 수 없으므로(`PerformanceUpdateRequest`에 없다) 요약에도
            남긴다 — 생성 중에는 모달에서 고른 값이 바로 비친다
          */
          [
            text('공연 형태', 'Show type'),
            values.jointPerformance
              ? text('합동 공연', 'Joint show')
              : text('단독 공연', 'Single-team show'),
          ],
          [text('일시', 'Date'), schedule],
          [text('장소', 'Venue'), values.venueName.trim() || '—'],
          [text('주최 팀', 'Host team'), hostTeam?.teamName ?? '—'],
          [text('티켓 옵션', 'Ticket types'), String(rows.length)],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="font-sans text-[11px] text-muted">{label}</dt>
            <dd className="m-0 max-w-[62%] break-words text-right font-sans text-[13px] font-medium text-ink">
              {value}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <dt className="font-sans text-[11px] text-muted">{text('보증금', 'Deposit')}</dt>
          <dd className="m-0">
            <DepositStatusBadge status={deposit.status} />
          </dd>
        </div>
      </dl>
    </aside>
  )
}

interface Props {
  mode: 'create' | 'edit'
  /**
   * 처음 열 단계 — `SETUP_STEPS` 의 0 정보·티켓 옵션 · 1 참여팀 · 2 정산 규칙 ·
   * 3 규칙 동의 · 4 보증금. 다른 화면(P-05·P-06)에서 돌아올 때 그 자리부터 열려고 쓴다.
   */
  initialStep?: number
  loading?: boolean
  /** 수정 모드의 서버 값. 생성 모드에서는 비운다 */
  data?: PerformanceEditData
  /**
   * rule_02 `agreements[]` 가 전부 `AGREED` 인가(`agreementsStepDone`). 조회 전에는 `undefined`.
   *
   * 폼이 직접 조회하지 않는다 — 이 컴포넌트는 규칙 도메인을 모르고, 같은 값을 P-05·P-06 이
   * 이미 같은 훅(`useRuleStatus`)으로 읽는다. 판정만 페이지에서 받아 쓴다.
   */
  allAgreed?: boolean
  deposit?: DepositState
  wallet?: StudioLeaderWallet
  /** 리더인 팀 목록. 둘 이상이면 `hostTeamId`를 고르게 한다 */
  teams?: HostTeamOption[]
  /** 정산 컨트랙트 주소 — 보증금 서명 요약(§5.14)의 "대상 컨트랙트" */
  splitterAddress?: string
  /** 403 `PERFORMANCE_NOT_OWNER` */
  forbidden?: string
  /** 조회 실패 문구(`PERFORMANCE_NOT_FOUND` 등) */
  error?: string
  onRetry?: () => void
  /** 첫 단계 저장. 공연 정보와 티켓 옵션을 순서대로 모두 저장한다 */
  onSaveSetup?: (values: PerformanceInfoValues, rows: TicketTypeDraft[]) => Promise<SaveResult>
  /** 수정 모드에서 포스터·티켓 디자인 편집 흐름으로 이동한다. */
  onOpenMedia?: () => void
  /**
   * 보증금 납부. prepare → 서명 2회 → RLP 보고 → 폴링까지 **전부 끝난 뒤** resolve한다.
   * 진행 단계는 `report`로 알린다 — 화면은 §5.14 문구만 그린다.
   *
   * 핸들러가 `undefined`를 돌려주면 **아무것도 단정하지 않는다** — 지갑 세션이 끊겨 로그인으로
   * 보내는 경우가 그렇다. 라우트가 바뀌는 찰나에 실패 배너를 띄우면 사용자는 방금 무엇이
   * 실패했는지로 읽는다.
   */
  onPayDeposit?: (
    report: (stage: DepositSignStage) => void,
  ) => Promise<DepositPayResult | undefined>
  /**
   * 지갑 SDK가 서명을 받을 준비가 됐는가(`useWalletReady`). `false`면 보증금 버튼을 잠그고
   * 준비 중 문구를 보인다(D-77). 기본 준비됨 — 보증금 단계가 없는 생성 모드는 신경 쓰지 않는다.
   */
  walletReady?: boolean
  /** 공연 취소(P-10 모달) 진입. 핸들러가 없으면 버튼을 그리지 않는다 */
  onCancelRequest?: () => void
  /**
   * 생성 모드의 공연 형태 — 페이지의 선택 모달(`JointChoiceDialog`)이 정한 값(9/26).
   * 주면 폼 값의 `jointPerformance`를 이 값으로 덮는다. 수정 모드에서는 쓰지 않는다(서버 값이 정본).
   */
  jointPerformance?: boolean
  /** 생성 모드에서 공연 형태 선택 모달을 다시 연다. 없으면 "변경"을 그리지 않는다 */
  onChangeJointPerformance?: () => void
}

export function PerformanceForm({
  mode,
  initialStep = SETUP_STEP_BASICS,
  loading = false,
  data,
  allAgreed,
  deposit,
  wallet,
  teams = [],
  splitterAddress,
  forbidden,
  error,
  onRetry,
  onSaveSetup,
  onOpenMedia,
  onPayDeposit,
  walletReady = true,
  onCancelRequest,
  jointPerformance: chosenJoint,
  onChangeJointPerformance,
}: Props) {
  const { text } = useLocale()
  /**
   * 규칙 저장 여부 — **공연 상태로 안다.** 규칙을 저장해야 `DRAFT` → `PENDING_AGREEMENT` 가
   * 되므로(`RuleService`) `DRAFT` 는 곧 규칙 미저장이다. 생성 모드는 공연이 아직 없어 false 다.
   */
  const rulesSaved = data != null && data.status !== 'DRAFT'
  /** 참여팀 단계를 끝냈는가 — 판정은 페이지와 공유한다(`participantsStepDone`) */
  const participantsDone = participantsStepDone(data ?? {})
  /** 규칙 동의 단계를 끝냈는가. 아직 모르면(조회 전·규칙 미저장) 끝나지 않은 것으로 본다 */
  const agreementsDone = allAgreed === true

  /** 0 공연 정보·티켓 옵션 · 1 참여팀 · 2 정산 규칙 · 3 규칙 동의 · 4 보증금 */
  const [step, setStep] = useState(initialStep)
  const [rawValues, setValues] = useState<PerformanceInfoValues>(() => ({
    title: data?.title ?? '',
    description: data?.description ?? '',
    venueName: data?.venueName ?? '',
    venueAddress: data?.venueAddress ?? '',
    startAt: isoToKstInput(data?.startAt),
    endAt: isoToKstInput(data?.endAt),
    jointPerformance: data?.jointPerformance === true,
    hostTeamId: teams[0]?.teamId,
  }))
  /*
   * 생성 모드는 공연 형태를 페이지의 모달이 정한다 — 그 값으로 폼 값을 덮어 단계 표시·요약·저장이
   * 모두 같은 값을 보게 한다. 상태로 복사하지 않는다: 복사하면 모달에서 바꾼 값과 어긋날 수 있다.
   */
  const values = useMemo<PerformanceInfoValues>(
    () =>
      mode === 'create' && chosenJoint !== undefined && rawValues.jointPerformance !== chosenJoint
        ? { ...rawValues, jointPerformance: chosenJoint }
        : rawValues,
    [mode, chosenJoint, rawValues],
  )
  /**
   * 공동 공연인가 — **폼 값이 정본이다.** 생성 중에는 모달에서 고르는 순간 단계 표시가 바뀌어야
   * 하고(공연은 아직 없다), 수정 모드에서는 아래 재동기화가 서버 값을 이 자리에 넣는다.
   * 모르면 단독으로 본다(`PerformanceEditData.jointPerformance` 주석).
   */
  const joint = values.jointPerformance
  const [rows, setRows] = useState<TicketTypeDraft[]>(() =>
    data?.ticketTypes?.length
      ? data.ticketTypes
      : [{ key: 'tt-new-1', name: '', price: '', totalQuantity: '' }],
  )
  const [infoTouched, setInfoTouched] = useState(false)
  const [ticketTouched, setTicketTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  /** 저장·납부 실패 문구(`studioFailureText`가 만든 것) */
  const [failure, setFailure] = useState<string | undefined>(undefined)
  /** 서버가 짚어 준 필드 오류. 클라이언트 검증과 합쳐 보여준다 */
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string | undefined>>({})
  /** 409 `PERFORMANCE_ALREADY_ON_SALE` 이후의 읽기 전용 전환 */
  const [lockedByServer, setLockedByServer] = useState(false)
  const [stage, setStage] = useState<DepositSignStage>({ kind: 'idle' })
  const [rejected, setRejected] = useState(false)
  /**
   * 즉시 실패 뒤의 연타 잠금 — P-06 규칙 동의(`RuleAgreements.tsx`)와 같은 판정이다.
   *
   * `signing`은 핸들러가 `report`로 알려 줄 때 비로소 선다. 지갑이 시작도 못 하고 바로
   * 실패하면 `stage`가 그 자리에서 `idle`로 돌아와 버튼이 다시 살아나 연타가 된다.
   */
  const [retryLocked, setRetryLocked] = useState(false)
  /**
   * 잠금 해제 타이머. 언마운트 때 지운다 — 남겨 두면 화면이 사라진 뒤 `setState`가 불리고,
   * 테스트에서는 환경이 내려간 뒤 `window`가 없어 unhandled error가 된다(Jenkins !172 frontend).
   */
  const retryTimerRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current)
    },
    [],
  )
  /**
   * §5.16 — 모자란 금액. 서버 409를 받은 뒤에만 채운다(상시 판정하지 않는다).
   * `null`은 "부족한 것은 서버가 확정했는데 금액을 모른다"다 — `undefined`(잔액 문제 아님)와 다르다
   */
  const [shortfall, setShortfall] = useState<number | null | undefined>(undefined)
  /** 규칙 미저장으로 막혔다(performance_13 `PERFORMANCE_RULES_REQUIRED`) */
  const [rulesRequired, setRulesRequired] = useState(false)
  /**
   * 확정을 기다리다 폴링 상한에 닿았다 — **재시도를 잠근다.**
   * 실패가 아니라 모르는 상태라, 다시 서명하면 먼저 보낸 tx와 겹쳐 두 번 낼 수 있다.
   */
  const [confirmStalled, setConfirmStalled] = useState(false)
  /** 보증금 미납으로 막혔음을 패널에서 강조 */
  const [depositHighlight, setDepositHighlight] = useState(false)

  /**
   * 서버 값이 **나중에** 도착하는 경우를 위한 재동기화.
   *
   * useState 초기화 함수는 첫 렌더에 한 번만 돈다. 페이지가 조회 중에 이 컴포넌트를 먼저
   * 마운트하면(로딩 스켈레톤도 이 컴포넌트가 그린다) 폼이 빈 값으로 굳는다.
   * 공연 하나를 보는 화면이라 performanceId가 바뀌는 일은 없고, 그래서 사용자가 편집 중인
   * 값을 이 효과가 덮어쓸 일도 없다 — 값이 처음 들어올 때 한 번만 돈다.
   */
  useEffect(() => {
    if (!data) return
    setValues((prev) => ({
      // 여는 팀은 서버 값이 아니라 화면 맥락이라 그대로 둔다
      hostTeamId: prev.hostTeamId,
      title: data.title,
      description: data.description ?? '',
      venueName: data.venueName,
      venueAddress: data.venueAddress,
      startAt: isoToKstInput(data.startAt),
      endAt: isoToKstInput(data.endAt),
      // 수정 API 가 받지 않는 값이지만 폼이 들고 있어야 단계 표시와 읽기 전용 줄이 맞는다.
      // 저장 경로(`onSaveSetup`)는 수정 모드에서 이 값을 요청에 담지 않는다
      jointPerformance: data.jointPerformance === true,
    }))
    setRows(
      data.ticketTypes.length > 0
        ? data.ticketTypes
        : [{ key: 'tt-new-1', name: '', price: '', totalQuantity: '' }],
    )
    /*
     * 여는 단계도 **여기서 다시 읽는다.** 상위는 공연을 받아 봐야 공동 공연인지·참여팀이
     * 몇인지 알 수 있어(`initialStep` 계산에 그 값이 들어간다) 첫 렌더의 `initialStep`은
     * 아직 그 판정을 거치지 않은 값이다. 이 시점까지 화면은 스켈레톤이라(`loading`)
     * 사용자가 옮겨 둔 단계를 덮어쓸 일은 없다 — 값이 처음 들어올 때 한 번만 돈다.
     */
    setStep(initialStep)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.performanceId])

  const depositState: DepositState = deposit ?? { status: 'UNPAID', amount: DEPOSIT_AMOUNT }
  const status = data?.status
  /** ON_SALE 이후는 수정할 수 없다(performance_04·05 409) */
  const readOnly =
    lockedByServer ||
    status === 'ON_SALE' ||
    status === 'SALE_CLOSED' ||
    status === 'ENDED' ||
    status === 'CANCELLED'

  const infoErrors = validateInfo(values, { needsHostTeam: mode === 'create' && teams.length > 1 })
  const ticketResult = validateTicketTypes(rows)

  const shownInfoErrors: Record<string, string | undefined> = {
    ...(infoTouched ? infoErrors : {}),
    ...serverFieldErrors,
  }
  const shownTicketErrors: TicketTypeErrors[] = ticketTouched
    ? ticketResult.rows
    : rows.map(() => ({}))

  const depositBusy = stage.kind !== 'idle' && stage.kind !== 'done'

  /**
   * 서명 진행 중 화면 이탈 방지(P-03 접근성: "서명 단계에서는 화면 이탈 방지 안내").
   * 브라우저가 문구를 무시하고 자기 확인창을 띄우지만, 막는 것 자체가 목적이다.
   */
  useEffect(() => {
    if (!depositBusy) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [depositBusy])

  /**
   * 보증금 미납으로 막혔을 때 — P-03 상태 항목의 "보증금 패널로 스크롤 + 강조"를 그대로 한다.
   *
   * 저장 실패에서도 부르므로 저장 콜백보다 먼저 정의한다.
   */
  const focusDeposit = useCallback(() => {
    setStep(SETUP_STEP_DEPOSIT)
    setDepositHighlight(true)
    requestAnimationFrame(() => {
      document
        .getElementById('deposit-panel')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  /**
   * 실패 코드가 화면 자체를 바꾸는 경우를 처리한다. 문구는 호출부가 studioFailureText로 만든다.
   * 분기는 code로만 한다 — msg를 보지 않는다(응답 규격 §1).
   */
  const applyFailure = useCallback(
    (result: SaveResult | DepositPayResult) => {
      const code = result.code
      // 409 판매 시작 후 → 읽기 전용 전환(P-03 상태 항목)
      if (isLockedCode(code)) setLockedByServer(true)
      // 409 보증금 미납 → 보증금 패널로 데려가 강조한다
      if (isDepositRequiredCode(code) && depositState.status === 'UNPAID') focusDeposit()
      if ('fieldErrors' in result && result.fieldErrors) {
        setServerFieldErrors(result.fieldErrors as Record<string, string | undefined>)
      }
    },
    [depositState.status, focusDeposit],
  )

  const saveSetup = useCallback(async () => {
    setInfoTouched(true)
    setTicketTouched(true)
    setFailure(undefined)
    setServerFieldErrors({})
    if (hasAnyError(infoErrors) || !ticketTypesValid(ticketResult) || saving || readOnly) return
    setSaving(true)
    try {
      const result = await onSaveSetup?.(values, rows)
      // 핸들러가 없으면(목·미연결) 아무것도 단정하지 않는다 — 성공으로 치지 않는다
      if (!result) return
      if (!result.ok) {
        applyFailure(result)
        setFailure(studioFailureText(result.code, result.msg))
        return
      }
      if (result.ticketTypeIds) {
        const ids = new Map(result.ticketTypeIds.map((item) => [item.key, item.ticketTypeId]))
        setRows((current) =>
          current.map((row) => {
            const ticketTypeId = ids.get(row.key)
            return ticketTypeId == null ? row : { ...row, ticketTypeId }
          }),
        )
      }
      // 생성 모드는 상위가 옮긴다. 수정 모드는 다음 단계로 넘어간다 —
      // 공동 공연은 참여팀부터다(규칙이 참여팀을 입력으로 쓴다), 단독은 바로 규칙이다.
      // 동의·보증금은 그 뒤다(`참여팀 → 규칙 → createShow → 동의 → 보증금`)
      if (mode === 'edit') {
        setStep(joint ? SETUP_STEP_PARTICIPANTS : SETUP_STEP_RULES)
      }
    } finally {
      setSaving(false)
    }
  }, [
    applyFailure,
    infoErrors,
    joint,
    mode,
    onSaveSetup,
    readOnly,
    rows,
    saving,
    ticketResult,
    values,
  ])

  /** 실패·취소로 초기 상태로 돌아간다. 돌아간 직후 잠깐 잠근다 — 위 `retryLocked` 주석 */
  const backToIdle = useCallback(() => {
    setStage({ kind: 'idle' })
    setRetryLocked(true)
    if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current)
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null
      setRetryLocked(false)
    }, RETRY_LOCK_MS)
  }, [])

  const payDeposit = useCallback(async () => {
    setFailure(undefined)
    setRejected(false)
    setShortfall(undefined)
    setRulesRequired(false)
    setDepositHighlight(false)
    // 핸들러가 첫 report를 보내기 전(prepare 왕복)에도 자리가 비지 않게 여기서 먼저 켠다
    setStage({ kind: 'preparing' })
    // 핸들러가 던지면(`onPayDeposit`이 코드로 감싸지 않은 예외) 여기서 받아 초기 상태로 되돌린다
    // — 안 그러면 진행 표시에 갇혀 버튼도 없고 이탈 경고만 남는다
    const result = await onPayDeposit?.(setStage).catch(() => undefined)
    if (!result) {
      backToIdle()
      return
    }
    if (result.ok) {
      setStage({ kind: 'done' })
      return
    }
    // ②' 선행 작업이 방금 확정됐다 — 실패가 아니고, 서명은 다음 클릭에서 한다(D-77)
    if (result.readyToSign) {
      setStage({ kind: 'ready-to-sign' })
      return
    }
    // ④' 서명 거부 — 에러가 아니다. 초기 상태로 되돌린다(§5.14 · §1.2 원칙 6).
    // 거부는 **잠그지 않는다** — 사용자가 스스로 닫은 팝업이라 다시 누르려고 기다릴 이유가 없다.
    // 같은 자리를 쓰는 §5.14 동의 버튼(`RuleAgreements`)과 같은 판단이다.
    if (isSignatureRejectedCode(result.code)) {
      setStage({ kind: 'idle' })
      setRejected(true)
      return
    }
    backToIdle()
    // 확정을 못 본 채 상한에 닿았다 — 다시 서명하면 두 번 낼 수 있어 여기서 잠근다
    if (isChainTimeoutCode(result.code)) {
      setConfirmStalled(true)
      setFailure(depositFailureText(result.code, result.msg))
      return
    }
    // 규칙 미저장(-151) — 보증금 단계에 상시 떠 있는 P-05 링크를 단언으로 바꾼다.
    // 예전에는 이 원인이 `COMMON_CONFLICT`로 와서 화면이 잔액 탓으로 오독할 수 있었다.
    //
    // **여기서 끝낸다** — 잔액 부족과 같은 모양이다. 그 링크 문구가 이미 "정산 규칙을 아직
    // 저장하지 않아 보증금을 낼 수 없습니다"라고 단언하므로, 상단 실패 패널에 서버 `msg`
    // ("정산 규칙을 먼저 저장해야…")를 또 띄우면 같은 말이 두 자리에서 난다
    if (isRulesRequiredCode(result.code)) {
      setRulesRequired(true)
      return
    }
    // 잔액 부족 — §5.16 안내. **전용 코드가 생겼으므로 화면은 원인을 추측하지 않는다**(-151).
    // 부족액만 화면 몫이다(서버 `msg`에도 담겨 오지만 문구로 분기하지 않는다). 잔액을 모르거나
    // (§5.10의 `—`) 캐시 잔액이 서버 값보다 높아 계산이 0 이하면 **금액 없이 안내만** 띄운다 —
    // 계산이 안 된다고 서버가 확정한 판정을 삼키면 안 된다
    if (isInsufficientBalanceCode(result.code) && depositState.status === 'UNPAID') {
      const short =
        depositState.leaderBalance == null ? null : depositState.amount - depositState.leaderBalance
      setShortfall(short != null && short > 0 ? short : null)
      return
    }
    setFailure(depositFailureText(result.code, result.msg))
  }, [
    backToIdle,
    depositState.amount,
    depositState.leaderBalance,
    depositState.status,
    onPayDeposit,
  ])

  if (loading) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioSkeleton label={text('공연 정보를 불러오는 중', 'Loading show details')} rows={1} />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioForbidden msg={forbidden} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioErrorPanel
          title={text('공연 정보를 불러오지 못했습니다', 'Could not load show details')}
          msg={error}
          onRetry={onRetry}
        />
      </div>
    )
  }

  /** 액션이 카드 안에 있는 단계 — 하단 고정도 PC 액션 행도 그리지 않는다 */
  const stepOwnsActions =
    step === SETUP_STEP_PARTICIPANTS || step === SETUP_STEP_RULES || step === SETUP_STEP_AGREEMENTS

  /**
   * 모바일 하단 고정에 올릴 액션 **하나**(§5.19).
   *
   * 여기 판정은 P-03 이 맡는 두 단계(0 정보·티켓 옵션 · 4 보증금)만 다룬다. 가운데 세 단계
   * (참여팀·규칙·동의)의 액션은 각 카드 안에 있고 하단 고정은 그리지 않는다 — 아래
   * `FixedBottom` 참고. 여기 삼항의 "0 의 반대"를 보증금으로 읽지 않도록 단계를 늘릴 때
   * `stepOwnsActions` 를 같이 고친다.
   */
  const primaryLabel =
    step === SETUP_STEP_BASICS
      ? text('저장하고 다음', 'Save and continue')
      : // ②' 선행 작업 확정 뒤에는 같은 자리가 "서명하기"가 된다(D-77) — 패널 버튼과 같은 문구
        stage.kind === 'ready-to-sign'
        ? text('서명하기', 'Sign now')
        : text('보증금 납부하기', 'Pay deposit')
  const onPrimary = step === SETUP_STEP_BASICS ? saveSetup : payDeposit
  const stepHandler = step === SETUP_STEP_BASICS ? onSaveSetup : onPayDeposit
  const primaryDisabled =
    saving ||
    readOnly ||
    stepHandler == null ||
    (step === SETUP_STEP_DEPOSIT &&
      (retryLocked ||
        depositState.status !== 'UNPAID' ||
        confirmStalled ||
        wallet == null ||
        wallet.status === 'SUSPENDED' ||
        // 지갑이 준비되기 전 클릭은 계정 없는 지갑으로 나가 조용히 실패했다(D-77 원인 A)
        !walletReady))

  return (
    <div
      className={[
        'flex w-full max-w-[960px] flex-col gap-4 px-3 pt-3 md:gap-6 md:px-0 md:pt-0 md:pb-0',
        // 하단 고정 버튼이 마지막 줄을 덮지 않게 모바일에서만 여백을 준다
        readOnly || stepOwnsActions ? 'pb-8' : 'pb-28',
      ].join(' ')}
    >
      {/* 헤더 — 타이틀 + (수정 모드) 공연 상태 배지. 모바일은 `StudioShell` 상단 바가 제목을 갖는다 */}
      <StudioHeading
        title={
          mode === 'create'
            ? text('새 공연 만들기', 'Create a show')
            : (data?.title ?? text('공연 수정', 'Edit show'))
        }
        section={['공연 준비', 'Show setup']}
      >
        {status && <StatusBadge status={SHOW_STATUS[status]} />}
      </StudioHeading>

      {/*
        단계 표시 — 모바일에서는 헤더 아래 고정(P-03 레이아웃).
        단독 공연은 참여팀 단계를 **표시에서 뺀다**(규칙 동의는 남는다). `Stepper` 는 `<ol>` 이라
        표시 배열과 `active` 를 같은 좌표계로 넘겨야 한다 — `visibleStepIndex` 가 그 매핑이다.
      */}
      <div className="sticky top-0 z-10 -mx-3 bg-ground px-3 pt-2 md:static md:mx-0 md:bg-transparent md:px-0 md:pt-0">
        <Stepper
          steps={visibleSetupSteps(joint).map((label) => text(label[0], label[1]))}
          active={visibleStepIndex(step, joint)}
        />
      </div>

      {readOnly && (
        <StudioNotice
          tone="warning"
          title={text(
            '판매가 시작돼 지금은 읽기 전용입니다',
            'Ticket sales have started. These details are read-only.',
          )}
        >
          {text(
            '공연 정보·티켓 옵션은 판매 시작 이후 바꿀 수 없습니다. 바꿔야 한다면 공연 취소를 검토해 주세요.',
            'Show details and ticket types cannot change after sales start. Consider cancelling the show if changes are necessary.',
          )}
        </StudioNotice>
      )}

      {failure && (
        <StudioNotice
          tone="danger"
          title={text('요청을 처리하지 못했습니다', 'Could not complete the request')}
        >
          {failure}
        </StudioNotice>
      )}

      {/* 생성 API 성공 뒤 티켓 옵션까지 저장돼야 정산 규칙 단계로 이동한다 */}
      {mode === 'create' && (
        <StudioNotice
          title={text(
            '공연 정보와 티켓 옵션을 함께 저장해 주세요',
            'Save your show details and ticket options together',
          )}
        >
          {text(
            '한 번에 저장하면 공연이 준비 중(DRAFT) 상태로 만들어지고 정산 규칙 단계로 넘어갑니다.',
            'Saving once creates a draft show and takes you to the settlement rules step.',
          )}
        </StudioNotice>
      )}

      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-6">
        <div className="min-w-0">
          {step === SETUP_STEP_BASICS && (
            <div className="flex flex-col gap-4 md:gap-6">
              <InfoStep
                values={values}
                errors={shownInfoErrors}
                readOnly={readOnly}
                /* 여는 팀은 생성 시점에만 정한다 — performance_04에는 hostTeamId가 없다(팀 이전 불가) */
                teams={mode === 'create' ? teams : []}
                /* 공동 공연 여부도 생성 시점에만 정한다 — performance_04 에 그 필드가 없다 */
                jointEditable={mode === 'create'}
                onChangeJoint={mode === 'create' ? onChangeJointPerformance : undefined}
                saleCloseAt={data?.saleCloseAt}
                cancelDeadlineAt={data?.cancelDeadlineAt}
                onChange={(patch) => {
                  setValues((v) => ({ ...v, ...patch }))
                  // 서버가 짚어 준 오류는 그 필드를 고치는 순간 지운다 — 낡은 오류가 남으면 헷갈린다
                  setServerFieldErrors({})
                }}
              />
              <StudioNotice title={text('다음 단계에서 이미지를 등록합니다', 'Add images in the next step')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {text(
                      '공연 정보와 티켓 옵션을 저장하고, 포스터 등록과 티켓 꾸미기를 마친 뒤 최종 내용을 확인합니다.',
                      'Save the show details and ticket options, then add the poster and decorate the ticket before the final review.',
                    )}
                  </span>
                  {mode === 'edit' && onOpenMedia && (
                    <Button variant="secondary" onClick={onOpenMedia}>
                      {text('포스터·티켓 꾸미기', 'Poster and ticket decoration')}
                    </Button>
                  )}
                </div>
              </StudioNotice>
              <TicketTypesStep
                rows={rows}
                errors={shownTicketErrors}
                listError={ticketTouched ? ticketResult.listError : undefined}
                readOnly={readOnly}
                onChange={(i, patch) =>
                  setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
                }
                onAdd={() =>
                  setRows((prev) => [
                    ...prev,
                    { key: `tt-new-${Date.now()}`, name: '', price: '', totalQuantity: '' },
                  ])
                }
                onRemove={(i) => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              />
            </div>
          )}

          {step === SETUP_STEP_PARTICIPANTS && (
            <ParticipantsStep
              performanceId={data?.performanceId}
              joint={joint}
              acceptedCount={data?.acceptedParticipantCount}
              done={participantsDone}
              onBack={() => setStep(SETUP_STEP_BASICS)}
              onNext={() => setStep(SETUP_STEP_RULES)}
            />
          )}

          {step === SETUP_STEP_RULES && (
            <RulesStep
              performanceId={data?.performanceId}
              saved={rulesSaved}
              /* 단독 공연은 참여팀 단계를 건너뛰므로 되돌아갈 곳도 공연 정보다 */
              onBack={() => setStep(joint ? SETUP_STEP_PARTICIPANTS : SETUP_STEP_BASICS)}
              onNext={() => setStep(SETUP_STEP_AGREEMENTS)}
            />
          )}

          {step === SETUP_STEP_AGREEMENTS && (
            <AgreementsStep
              performanceId={data?.performanceId}
              rulesSaved={rulesSaved}
              done={agreementsDone}
              onBack={() => setStep(SETUP_STEP_RULES)}
              onNext={() => setStep(SETUP_STEP_DEPOSIT)}
              onGoToRules={() => setStep(SETUP_STEP_RULES)}
            />
          )}

          {step === SETUP_STEP_DEPOSIT && (
            <div className={depositHighlight ? 'rounded-card ring-2 ring-warning' : undefined}>
              <DepositStep
                deposit={depositState}
                wallet={wallet}
                title={data?.title ?? values.title}
                splitterAddress={splitterAddress}
                stage={stage}
                rejected={rejected}
                stalled={confirmStalled}
                shortfall={shortfall}
                rulesRequired={rulesRequired}
                agreementsDone={agreementsDone}
                onBackToAgreements={() => setStep(SETUP_STEP_AGREEMENTS)}
                performanceId={data?.performanceId}
                // 연타 잠금을 이 판정에 함께 담는다 — 버튼 자리가 하나라 새 prop을 만들지 않는다
                payable={onPayDeposit != null && !retryLocked}
                // 지갑 준비는 따로 받는다 — 잠그는 이유가 다르고(연타 vs 준비 중) 문구도 다르다
                walletReady={walletReady}
                onPay={() => void payDeposit()}
              />
            </div>
          )}
        </div>
        <ShowSummaryRail
          values={values}
          rows={rows}
          teams={teams}
          deposit={depositState}
          step={step}
        />
      </div>
      {/* PC 액션 — 폼 하단 오른쪽(§5.19). 보증금 단계의 주 액션은 패널 안에 있다 */}
      {!readOnly && step === SETUP_STEP_BASICS && (
        <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
          {/* 모바일 고정 액션과 **같은 판정**을 쓴다 — 여기만 `saving`을 보면 PC 에서만 눌린다 */}
          <Button disabled={primaryDisabled} onClick={() => void onPrimary()}>
            {saving ? text('저장 중…', 'Saving…') : primaryLabel}
          </Button>
        </div>
      )}

      {/*
        보증금 단계 이동 — 수정 모드에서만. 미납이면 눌러도 보증금 패널로 데려간다.
        `이전 단계`는 바로 앞인 규칙 동의로 간다 — 규칙·참여팀은 그 앞이라 각 카드에서 한 번 더
        돌아간다.
      */}
      {mode === 'edit' && step === SETUP_STEP_DEPOSIT && (
        <div className="hidden flex-wrap items-center justify-between gap-2 md:flex">
          <Button variant="secondary" onClick={() => setStep(SETUP_STEP_AGREEMENTS)}>
            {text('이전 단계', 'Previous step')}
          </Button>
          {depositState.status === 'UNPAID' && (
            <Button variant="ghost" onClick={focusDeposit}>
              {text('보증금 패널로', 'View deposit')}
            </Button>
          )}
        </div>
      )}

      {/*
        공연 취소 진입 버튼 → P-10 모달(P-03 컴포넌트 표). 모달은 페이지가 띄운다
        (`PerformanceEditPage`의 `ConfirmDialog`).
        ⚠ 핸들러가 없으면 렌더하지 않는다 — 취소할 수 없는 상태(`DRAFT`·`PENDING_AGREEMENT`·
        `CANCELLED`)에서는 페이지가 넘기지 않는다. 눌러도 아무 일이 없는 버튼을 두면
        사용자가 같은 자리를 반복해서 누른다.
      */}
      {mode === 'edit' && onCancelRequest && (
        <div className="flex justify-start">
          <Button variant="danger" onClick={onCancelRequest}>
            {text('공연 취소', 'Cancel show')}
          </Button>
        </div>
      )}

      {/*
        모바일 하단 고정 — 주 액션 하나만. 서명 중에는 같은 자리가 진행 표시로 바뀐다(§5.19).
        참여팀·규칙·동의 단계는 제외한다 — 세 단계의 액션은 각 카드 안에 있고 모바일에서도
        스크롤 없이 보인다. 여기에 또 그리면 같은 CTA 가 한 화면에 둘이 되고, 비우면
        보증금 액션이 그 단계에서 눌린다.
      */}
      {!readOnly && !stepOwnsActions && (
        <FixedBottom>
          {depositBusy ? (
            <div className="flex justify-center">
              <DepositProgress stage={stage} />
            </div>
          ) : step === SETUP_STEP_DEPOSIT &&
            (depositState.status !== 'UNPAID' || stage.kind === 'done') &&
            data?.performanceId != null ? (
            // 패널 안의 다음 행동과 같은 곳이다 — 납부 뒤에는 판매 시작(P-06)으로 간다(9/24)
            <Link
              to={`/studio/performances/${data.performanceId}/agreements`}
              className="flex min-h-11 w-full items-center justify-center rounded-control bg-primary font-sans text-sm font-semibold text-white"
            >
              {text('판매 시작하러 가기', 'Go to start sales')}
            </Link>
          ) : (
            <Button full disabled={primaryDisabled} onClick={() => void onPrimary()}>
              {saving ? text('저장 중…', 'Saving…') : primaryLabel}
            </Button>
          )}
        </FixedBottom>
      )}
    </div>
  )
}
