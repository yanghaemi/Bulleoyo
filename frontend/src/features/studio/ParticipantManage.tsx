import { useLocale } from '@/shared/i18n/useLocale'
/**
 * P-04 참여팀 관리 — 초대·수락·제외 + 검표 페이지 링크.
 *
 * 정본 — 화면설계 v6 §4 P-04(영역 구성·레이아웃·컴포넌트 표 7행·상태·입력 검증·접근성)
 *        · §5.7 빈 상태 · §5.8 링크 복사·공유 · §5.13 KST 병기 · §5.19 액션 버튼 배치
 *        · §5.21 표 → 패널 접기
 *        · API 명세 v6 performance_03(공연 상세) · performance_07(초대) · performance_08(수락)
 *          · performance_09(제외) · performance_10(검표 페이지 링크)
 *
 * 본문 순서는 P-04 **영역 구성** 그대로다 — 참여팀 목록 → 참여팀 초대 폼 → 참여 수락 액션 →
 * 검표 페이지 링크 패널. 레이아웃 항목대로 PC는 **최대폭 1200px 2열**(좌 2/3 표·초대 폼 /
 * 우 1/3 검표 링크)이고, 모바일은 1열 + 표를 팀별 패널로 접고(§5.21) 링크 패널을 맨 아래 둔다.
 * **하단 고정 액션이 없다**(영역 구성: "없음(항목별 액션)") — 이 화면의 액션은 전부 행 단위다.
 *
 * 지갑을 등록하지 않은 팀이 하나라도 있으면 규칙 설정·판매 시작으로 넘어갈 수 없다.
 * 정산 수령 주소가 없기 때문이다. 그 사실을 배지(미등록)와 경고 문구 **둘 다**로 알린다(§1.2).
 *
 * 껍데기(사이드 메뉴·드로어)는 `StudioShell`이 맡는다. 관객 하단 탭바는 쓰지 않는다.
 *
 * ⚠ **명세 공백 기록** — ①·③은 2026-09-26(화면설계 v8.12)에 풀렸고 ②는 남아 있다.
 *   ① ~~팀 검색 API가 없다~~ → API-team-06 `GET /teams/search`가 생겼다. 초대 입력은 **팀 이름
 *      콤보박스**다(300ms 디바운스 · WAI-ARIA combobox). 요청 본문 `{ teamId }`는 그대로이고,
 *      검색이 없거나 실패해도 **숫자를 치면 팀 ID로 바로 초대**할 수 있게 예전 경로를 남겼다.
 *   ② **참여 상태 enum에 "거절"이 없다.** 표는 배지를 초대중/승인/**거절** 3값으로 적었지만
 *      `ParticipationStatus` enum은 `[INVITED, ACCEPTED]` 2값이고 거절 API도 없다(제외는
 *      생성자가 하는 `DELETE`다). 그래서 2값만 그린다.
 *   ③ ~~참여팀 조회 API가 없다~~ → API-performance-19 `GET …/participants`가 서버·openapi에
 *      있었는데 화면이 수락 팀만 담는 performance_03 `participants[]`를 쓰고 있었다. 이제 목록은
 *      performance_19로 그려 **초대 보낸(INVITED) 팀과 초대·수락 시각**이 보이고, 대기 중인 초대는
 *      performance_09로 **초대 취소**한다. `leaderWalletLinked`는 여전히 조회에 없어 optional이다
 *      (그 필드 주석 참고). 조회가 실패하면 상위가 예전 경로로 되돌리고 `participantsComplete=false`로
 *      알린다 — 그때만 "수락한 팀만 보인다" 안내를 띄운다.
 *
 * ⚠ **검표 링크 경로 불일치(고치지 않았다)** — performance_10의 `entryUrl` 예시는
 * `https://b204.ssafy.io/entry/12?token=…`인데 P-04 컴포넌트 표와 프론트 라우트는 `/scan/:token`이다.
 * 화면은 **서버가 준 `entryUrl`을 그대로** 표시·복사·열기에 쓴다 — URL을 클라이언트가 조립하면
 * 서버가 발급한 링크와 다른 주소가 돌아다니게 된다. 어느 쪽이 정본인지는 명세 개정으로 정한다.
 *
 * TODO(API 연결)
 *   조회:   performance_03 `GET /api/v1/performances/{performanceId}` → `PerformanceDetail`
 *           — title·status·jointPerformance·participants[{teamId,teamName,host}]
 *           ⚠ 위 ③ — 배지 두 개의 원본이 없다
 *   초대:   performance_07 `POST …/participants` `{ teamId }`
 *           → 201 `{ performanceId, teamId, teamName, participationStatus: INVITED,
 *                    leaderWalletLinked, invitedAt }`
 *   수락:   performance_08 `POST …/participants/{teamId}/accept`
 *           → 200 `{ performanceId, teamId, participationStatus: ACCEPTED, walletAddress,
 *                    walletProvider, nextAction: AGREE_RULES, acceptedAt }`
 *   제외:   performance_09 `DELETE …/participants/{teamId}`
 *           → 200 `{ performanceId, teamId, remainingParticipantCount, agreementsReset }`
 *   검표:   performance_10 `GET …/entry-link?rotate=false|true`
 *           → 200 `{ performanceId, performanceTitle, entryUrl, entryToken, expiresAt,
 *                    entryWindow{opensAt,closesAt}, issuedAt, rotated }`
 *           ⚠ `entryToken`은 **화면 상태로 들고 있지 않는다.** 링크(`entryUrl`)만 쓴다 —
 *             토큰 단독으로는 표시할 자리가 없고, 남겨 두면 로그·복사 경로가 하나 더 생긴다
 *   에러:   409 `TEAM_ALREADY_JOINED` · 409 `PERFORMANCE_ALREADY_ON_SALE`(초대·제외 비활성)
 *           · 404 `WALLET_NOT_FOUND`(= §8.2 `WALLET_NOT_LINKED`, 대상 팀 리더 지갑 미등록)
 *           · 403 `PERFORMANCE_NOT_OWNER` · 403 `COMMON_FORBIDDEN`(참여팀 아님)
 *           · 400 `COMMON_VALIDATION_FAILED`(상한 8팀·주최 팀 제외 시도)
 *           · 409 `PERFORMANCE_INVALID_STATUS`(검표 링크 — 공연 취소)
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router'

import { Button, ConfirmDialog, InfoRow, Input, StatusBadge, formatKst } from '@/shared/ui'
import { FormField } from '@/features/studio/FormField'
import { useClipboard } from '@/features/studio/useClipboard'
import {
  StudioEmpty,
  StudioErrorPanel,
  StudioHeading,
  StudioForbidden,
  StudioNotice,
  StudioSkeleton,
} from '@/features/studio/StudioStates'
import {
  entryLinkFailureText,
  inviteFailureText,
  studioFailureText,
} from '@/features/studio/studioErrors'
import { SHOW_STATUS } from '@/features/studio/showStatus'
import type { PerformanceStatus } from '@/features/studio/showStatus'

/* ── 타입 ─────────────────────────────────────────────────────────────── */

/**
 * `ParticipationStatus`(performance yaml enum) — **2값이다.**
 * 화면설계 표의 "거절"에 해당하는 값이 명세에 없다(머리말 ⚠ ②).
 */
export type ParticipationStatus = 'INVITED' | 'ACCEPTED'

/** 참여팀 한 줄 — performance_03 `participants[]` + performance_07·08 응답 필드 */
export interface ParticipantRow {
  teamId: number
  teamName: string
  /** 공연을 만든 팀. 제외할 수 없다(performance_09 400) */
  host: boolean
  participationStatus: ParticipationStatus
  /**
   * performance_07 `leaderWalletLinked`. `false`면 규칙 설정으로 넘어갈 수 없다.
   *
   * ⚠ **`undefined`는 `false`가 아니라 "모른다"다.** 조회(performance_03)가 이 필드를 주지
   * 않아(머리말 ⚠ ③) 상위가 알아낼 수 없는 행이 있다. 그때 `false`로 채우면 지갑을 등록한
   * 팀에 빨간 "미등록" 배지가 뜨고 다음 단계가 근거 없이 막힌다. 모르면 배지를 그리지 않는다.
   */
  leaderWalletLinked?: boolean
  /** ISO. 표시는 `formatKst`(§5.13) */
  invitedAt?: string
  acceptedAt?: string
  /**
   * 로그인한 회원이 이 팀의 리더인가 — "참여 수락" 버튼을 그릴 조건.
   * ⚠ 조회 응답에 없다. performance_06 `GET /performances/me`의 `teamId`·`participationStatus`와
   * 대조해 화면이 판단할 값이다(내가 리더인 팀 목록이 그 응답에 있다).
   */
  myTeam?: boolean
}

/** performance_10 `EntryLink`. `entryToken`은 화면이 받지 않는다(머리말 TODO 참고) */
export interface EntryLinkData {
  entryUrl: string
  /** 토큰 유효기간 = 공연 종료 + 2시간 */
  expiresAt: string
  issuedAt: string
  entryWindow?: { opensAt: string; closesAt: string }
}

/** 이 화면이 쓰는 조회 결과 묶음 */
export interface ParticipantScreenData {
  performanceId: number
  performanceStatus: PerformanceStatus
  /**
   * 생성자(주최 팀 리더)인가 — 초대·제외·링크 재발급 버튼의 조건.
   * ⚠ performance_03 응답에 "내가 생성자인가"가 없다. `participants[].host`인 팀의 리더가
   * 나인지를 performance_06으로 대조해야 한다.
   */
  isOwner: boolean
  /**
   * 보증금 납부 상태(performance_06 `depositStatus`) — **잠금 판정의 두 번째 축이다.**
   *
   * 서버는 온체인 `createShow`가 확정된 뒤 참여팀 변경을 409
   * `PERFORMANCE_INVALID_STATUS`로 거절한다(`PerformanceService.requireParticipantsUnlocked`).
   * 그 시점은 공연 상태로 드러나지 않는다 — 여전히 `PENDING_AGREEMENT`다.
   * `createShow` 확정을 직접 알려 주는 필드가 어느 응답에도 없어, 화면은 **보증금 납부**로
   * 대신 본다: 보증금 tx는 컨트랙트에 공연이 등록된 뒤에만 통과하므로
   * `PAID`면 `createShow`는 이미 확정이다(`PerformanceService.depositPrepare`의 `prerequisiteJobId`).
   *
   * ⚠ 역은 성립하지 않는다 — `createShow`만 확정되고 보증금 tx가 아직 실패·대기 중인 구간은
   * 이 값으로 잡히지 않는다. 그 구간에서만 버튼이 열려 있다가 409를 받는다(보고 대상).
   * 모르면(`undefined`) 상태로만 판정한다.
   */
  depositStatus?: 'UNPAID' | 'PAID' | 'RETURNED'
  participants: ParticipantRow[]
  /**
   * `participants`가 INVITED까지 담은 전체 목록(performance_19)인가.
   * `false`면 수락 팀만 아는 예전 경로라 "보낸 초대가 안 보일 수 있다" 안내를 띄운다.
   * 모르면(`undefined`) 전체로 본다.
   */
  participantsComplete?: boolean
  /** 내가 리더인 팀 id — 초대 후보에서 "내 팀"으로 비활성 표시한다 */
  ownTeamIds?: number[]
  /** 검표 링크. 조회에 실패했으면 `entryLinkError`가 대신 온다 */
  entryLink?: EntryLinkData
  entryLinkError?: string
}

export interface ParticipantActionResult {
  ok: boolean
  /** 실패 코드. `code`로만 분기한다 */
  code?: string
  msg?: string
}

/** 초대 콤보박스 후보 — API-team-06 항목(`teamId`·`teamName`·`genre`) */
export interface TeamCandidate {
  teamId: number
  teamName: string
  genre?: string
}

/** 링크 재발급 결과 — 성공하면 새 링크를 함께 준다(performance_10 `rotate=true`) */
export interface EntryLinkRotateResult extends ParticipantActionResult {
  link?: EntryLinkData
}

/* ── 배지 ─────────────────────────────────────────────────────────────── */

/**
 * 참여 상태 배지. 색은 보조이고 구분은 라벨이 갖는다(§1.2 · `StatusBadge`와 같은 규칙).
 * 컴포넌트 파일이 상수를 export하면 Fast Refresh가 끊기므로 **내보내지 않는다.**
 */
const PARTICIPATION: Record<ParticipationStatus, { label: [string, string]; className: string }> = {
  INVITED: {
    label: ['초대 보냄(대기 중)', 'Invited (pending)'],
    className: 'border-warning text-warning',
  },
  ACCEPTED: { label: ['수락함', 'Accepted'], className: 'border-line text-muted' },
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip border bg-surface px-2 font-sans text-[11px] font-semibold tracking-tight ${className}`}
    >
      {label}
    </span>
  )
}

function ParticipationBadge({ status }: { status: ParticipationStatus }) {
  const { text } = useLocale()
  const s = PARTICIPATION[status]
  return <Badge label={text(...s.label)} className={s.className} />
}

/**
 * 상태 배지 + 초대·수락 시각(KST, §5.13). 주최 팀은 "초대"가 아니라 공연을 만든 팀이라
 * 초대 시각을 그리지 않는다(서버는 생성 시각을 넣어 준다).
 */
function ParticipationCell({ row }: { row: ParticipantRow }) {
  const { text } = useLocale()
  return (
    <span className="flex flex-col items-start gap-1">
      <ParticipationBadge status={row.participationStatus} />
      {!row.host && row.invitedAt && (
        <span className="font-sans text-[11px] text-muted">
          {text('초대', 'Invited')} {formatKst(row.invitedAt)}
        </span>
      )}
      {!row.host && row.acceptedAt && (
        <span className="font-sans text-[11px] text-muted">
          {text('수락', 'Accepted')} {formatKst(row.acceptedAt)}
        </span>
      )}
    </span>
  )
}

/** 지갑 등록 배지 — 미등록만 눈에 걸려야 한다. 걸린 곳이 곧 막힌 곳이다 */
function WalletLinkedBadge({ linked }: { linked?: boolean }) {
  const { text } = useLocale()
  // 모르는 것을 "미등록"으로 그리지 않는다. 빈칸이 곧 "이 조회로는 알 수 없다"는 뜻이다
  if (linked == null) return <span className="font-sans text-[11px] text-muted">—</span>
  return linked ? (
    <Badge label={text('등록됨', 'Connected')} className="border-line text-muted" />
  ) : (
    <Badge label={text('미등록', 'Not connected')} className="border-danger text-danger" />
  )
}

/* ── 참여팀 목록 ──────────────────────────────────────────────────────── */

/** PC 표의 열 순서. 모바일 패널도 **같은 순서**로 쌓는다(§5.21) */
const PARTICIPANT_COLUMNS = [
  ['참여 상태', 'Participation'],
  ['지갑 등록', 'Wallet'],
] as const

/** 행 액션 묶음 — PC 표의 마지막 칸과 모바일 패널 하단이 같은 버튼을 쓴다 */
function RowActions({
  row,
  isOwner,
  locked,
  pendingTeamId,
  onAccept,
  onRemove,
}: {
  row: ParticipantRow
  isOwner: boolean
  locked: boolean
  pendingTeamId: number | null
  onAccept: (teamId: number) => void
  onRemove: (row: ParticipantRow) => void
}) {
  const { text } = useLocale()
  const busy = pendingTeamId === row.teamId
  // 수락은 **초대받은 팀의 리더**만 한다(performance_08). 생성자에게는 그릴 이유가 없다
  const canAccept = row.myTeam === true && row.participationStatus === 'INVITED' && !locked
  // 주최 팀은 제외할 수 없다(performance_09 400 — 공연을 없애려면 P-10 취소다)
  const canRemove = isOwner && !row.host && !locked

  if (!canAccept && !canRemove) {
    return <span className="font-sans text-[11px] text-muted">—</span>
  }
  return (
    <span className="flex flex-wrap gap-2">
      {canAccept && (
        <Button sm disabled={pendingTeamId !== null} onClick={() => onAccept(row.teamId)}>
          {busy ? text('처리 중…', 'Processing…') : text('참여 수락', 'Accept invitation')}
        </Button>
      )}
      {canRemove && (
        <Button
          variant="secondary"
          sm
          disabled={pendingTeamId !== null}
          onClick={() => onRemove(row)}
        >
          {row.participationStatus === 'INVITED'
            ? text('초대 취소', 'Cancel invitation')
            : text('제외', 'Remove')}
        </Button>
      )}
    </span>
  )
}

function ParticipantList({
  rows,
  isOwner,
  locked,
  pendingTeamId,
  rowFailure,
  onAccept,
  onRemove,
}: {
  rows: ParticipantRow[]
  isOwner: boolean
  locked: boolean
  pendingTeamId: number | null
  rowFailure?: { teamId: number; text: string }
  onAccept: (teamId: number) => void
  onRemove: (row: ParticipantRow) => void
}) {
  const { text } = useLocale()
  const pending = rows.filter((row) => row.participationStatus === 'INVITED').length
  const actions = (row: ParticipantRow) => (
    <RowActions
      row={row}
      isOwner={isOwner}
      locked={locked}
      pendingTeamId={pendingTeamId}
      onAccept={onAccept}
      onRemove={onRemove}
    />
  )

  return (
    <section aria-label={text('참여팀 목록', 'Participating teams')}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('참여팀', 'Participants')}
        </h2>
        {/* 상한 8팀(performance_07). 숫자를 미리 보여야 초대 실패로 알게 되지 않는다 */}
        <span className="font-num text-[11px] tabular-nums text-muted">{rows.length} / 8</span>
        {pending > 0 && (
          <span className="font-sans text-[11px] text-warning">
            {text(`수락 대기 ${pending}팀`, `${pending} pending`)}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <StudioEmpty>
          {text(
            '아직 참여팀이 없습니다. 아래에서 팀을 초대해 주세요.',
            'No teams yet. Invite a team below.',
          )}
        </StudioEmpty>
      ) : (
        <>
          {/* ── PC: 표 ── */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                  >
                    {text('팀명', 'Team name')}
                  </th>
                  {PARTICIPANT_COLUMNS.map((c) => (
                    <th
                      key={c[0]}
                      scope="col"
                      className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                    >
                      {text(c[0], c[1])}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                  >
                    <span className="sr-only">{text('액션', 'Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.teamId} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-4 py-3 font-normal">
                      <span className="block font-sans text-[13px] font-bold text-ink">
                        {row.teamName}
                      </span>
                      <span className="block font-sans text-[11px] text-muted">
                        {text(`팀 #${row.teamId}`, `Team #${row.teamId}`)}
                        {row.host && ` · ${text('공연 생성 팀', 'Host team')}`}
                        {row.myTeam && ` · ${text('내 팀', 'Your team')}`}
                      </span>
                      {rowFailure?.teamId === row.teamId && (
                        <span
                          role="alert"
                          className="mt-1 block font-sans text-[11px] font-semibold text-danger"
                        >
                          {rowFailure.text}
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-3">
                      <ParticipationCell row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <WalletLinkedBadge linked={row.leaderWalletLinked} />
                    </td>
                    <td className="px-4 py-3">{actions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 모바일: 행 하나 = 패널 하나(§5.21). 열 순서는 PC와 같다 ── */}
          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
            {rows.map((row) => (
              <li key={row.teamId} className="rounded-card border border-line bg-surface px-4 py-3">
                <span className="block font-sans text-[13px] font-bold text-ink">
                  {row.teamName}
                </span>
                <span className="mb-1 block font-sans text-[11px] text-muted">
                  {text(`팀 #${row.teamId}`, `Team #${row.teamId}`)}
                  {row.host && ` · ${text('공연 생성 팀', 'Host team')}`}
                  {row.myTeam && ` · ${text('내 팀', 'Your team')}`}
                </span>
                <InfoRow label={text(...PARTICIPANT_COLUMNS[0])}>
                  <ParticipationCell row={row} />
                </InfoRow>
                <InfoRow label={text(...PARTICIPANT_COLUMNS[1])}>
                  <WalletLinkedBadge linked={row.leaderWalletLinked} />
                </InfoRow>
                {rowFailure?.teamId === row.teamId && (
                  <p
                    role="alert"
                    className="m-0 mt-1 font-sans text-[11px] font-semibold text-danger"
                  >
                    {rowFailure.text}
                  </p>
                )}
                {/* 행 액션은 패널 하단 버튼 줄로 내린다(§5.21) */}
                <div className="mt-2">{actions(row)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/* ── 참여팀 초대 폼 ───────────────────────────────────────────────────── */

/** 입력이 멈춘 뒤 검색까지 기다리는 시간. 글자마다 요청하지 않는다 */
const SEARCH_DEBOUNCE_MS = 300
/** API-team-06 `q` 상한. 넘기면 서버가 400이라 잘라 보낸다 */
const SEARCH_QUERY_MAX = 50
const LISTBOX_ID = 'invite-team-listbox'
const optionId = (teamId: number) => `invite-team-option-${teamId}`

/** 검색 결과 — 어느 검색어의 응답인지 함께 들고 있어야 늦게 온 옛 응답을 가려낼 수 있다 */
type SearchResult = { q: string; items: TeamCandidate[] } | { q: string; failed: true }

/**
 * 초대 폼 — 요청 본문은 `{ teamId }` 하나다(performance_07).
 *
 * **팀 이름 콤보박스**(v8.12). 입력이 300ms 멈추면 `onSearch`(API-team-06)로 후보를 받고
 * "팀 이름 · #ID"로 보인다. WAI-ARIA combobox 패턴 — 입력이 `role="combobox"`이고 포커스는
 * 입력에 둔 채 `aria-activedescendant`로 후보를 가리킨다(↑↓ 이동 · Enter 선택 · Esc 닫기).
 *
 * 자기 팀·이미 초대했거나 참여 중인 팀은 후보에 **남기고 비활성**으로 둔다. 목록에서 빼 버리면
 * 사용자는 "왜 우리 팀이 검색이 안 되지"를 묻게 된다 — 이유를 옆에 적는다.
 *
 * 선택 없이 **숫자만** 쳤으면 그 팀 ID로 초대한다. 검색 API가 느리거나 실패해도 발표 흐름이
 * 막히지 않게 하는 예전 경로다(`onSearch`가 없으면 이 경로만 남는다).
 */
function InviteForm({
  count,
  locked,
  lockedText,
  busy,
  failure,
  participants,
  ownTeamIds,
  onSearch,
  onSubmit,
}: {
  count: number
  locked: boolean
  /** 왜 잠겼는지 — 사유가 둘이라 문구를 상위가 정한다(`lockedReason`) */
  lockedText: string
  busy: boolean
  failure?: string
  /** 이미 초대·참여 중인 팀 — 후보 비활성 판정 */
  participants: ParticipantRow[]
  ownTeamIds: number[]
  onSearch?: (q: string, signal: AbortSignal) => Promise<TeamCandidate[]>
  onSubmit: (teamId: number) => void
}) {
  const { text } = useLocale()
  const [value, setValue] = useState('')
  /** 목록에서 고른 팀. 입력을 고치면 풀린다 — 이름만 남고 id가 다른 팀을 가리키는 일을 막는다 */
  const [selected, setSelected] = useState<TeamCandidate | null>(null)
  /** 제출을 눌렀는가 — 입력 중에는 오류를 띄우지 않는다(`FormField` 머리말 참고) */
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [result, setResult] = useState<SearchResult | null>(null)

  const query = value.trim().slice(0, SEARCH_QUERY_MAX)
  const searching = onSearch != null && selected == null && query.length > 0

  useEffect(() => {
    if (!onSearch || selected != null || query.length === 0) return
    // 타이머와 요청을 함께 끊는다 — 입력이 바뀌면 이전 검색어의 응답은 버린다
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      onSearch(query, controller.signal).then(
        (items) => {
          if (!controller.signal.aborted) setResult({ q: query, items })
        },
        () => {
          if (!controller.signal.aborted) setResult({ q: query, failed: true })
        },
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [onSearch, query, selected])

  // 상태는 "지금 입력에 대한 응답인가"로 파생한다 — 옛 응답을 로딩 중에 보여 주지 않는다
  const current = searching && result?.q === query ? result : null
  const loading = searching && current == null
  const searchFailed = current != null && 'failed' in current
  const options = current != null && 'items' in current ? current.items : []
  const expanded = open && searching && options.length > 0
  const active = expanded && activeIndex >= 0 ? options[activeIndex] : undefined

  const participantById = new Map(participants.map((p) => [p.teamId, p]))
  const ownIds = new Set(ownTeamIds)
  /** 비활성 사유. 없으면 초대할 수 있다 */
  const reasonOf = (candidate: TeamCandidate): string | undefined => {
    if (ownIds.has(candidate.teamId)) return text('내 팀', 'Your team')
    const row = participantById.get(candidate.teamId)
    if (!row) return undefined
    return row.participationStatus === 'ACCEPTED'
      ? text('참여 중', 'Already joined')
      : text('이미 초대함', 'Already invited')
  }

  const numericId = /^[1-9]\d*$/.test(value.trim()) ? Number(value.trim()) : null
  const teamId = selected?.teamId ?? numericId
  const full = count >= 8
  const error =
    touched && teamId == null
      ? onSearch
        ? text(
            '목록에서 팀을 고르거나 팀 ID(숫자)를 입력해 주세요.',
            'Pick a team from the list or enter a numeric team ID.',
          )
        : text('팀 ID는 1 이상의 정수입니다', 'Enter a whole-number team ID greater than zero.')
      : undefined

  const choose = (candidate: TeamCandidate) => {
    if (reasonOf(candidate)) return
    setSelected(candidate)
    setValue(candidate.teamName)
    setOpen(false)
    setActiveIndex(-1)
    setTouched(false)
  }

  const submit = () => {
    setTouched(true)
    if (teamId == null || locked || full || busy) return
    onSubmit(teamId)
    setValue('')
    setSelected(null)
    setTouched(false)
    setOpen(false)
    setActiveIndex(-1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!searching || options.length === 0) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => {
        if (!expanded || i < 0) return step === 1 ? 0 : options.length - 1
        return (i + step + options.length) % options.length
      })
    } else if (e.key === 'Enter') {
      // 가리킨 후보가 있으면 폼 제출이 아니라 선택이다. 비활성 후보는 아무것도 하지 않는다
      if (active) {
        e.preventDefault()
        choose(active)
      }
    } else if (e.key === 'Escape') {
      if (expanded) {
        e.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
      }
    }
  }

  return (
    <section
      aria-label={text('참여팀 초대', 'Invite a team')}
      className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
    >
      <h2 className="m-0 mb-3 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('참여팀 초대', 'Invite a team')}
      </h2>

      {locked ? (
        <p className="m-0 font-sans text-[13px] text-muted">{lockedText}</p>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex flex-col gap-3"
        >
          <FormField
            id="invite-team-id"
            label={text('팀 이름 또는 팀 ID', 'Team name or team ID')}
            required
            error={error}
            hint={
              onSearch
                ? text(
                    '팀 이름으로 찾아 고르세요. 숫자만 입력하면 그 ID의 팀에 초대합니다. 상대 팀 리더가 수락하면 참여가 확정됩니다.',
                    'Search by team name and pick one, or enter a numeric team ID. The invitation is confirmed when their leader accepts.',
                  )
                : text(
                    '초대할 팀의 ID를 입력하세요. 상대 팀 리더가 수락하면 참여가 확정됩니다.',
                    'Enter the team ID. The invitation is confirmed when their leader accepts.',
                  )
            }
          >
            {(aria) => (
              <div className="relative">
                <Input
                  {...aria}
                  value={value}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={expanded}
                  aria-controls={LISTBOX_ID}
                  aria-activedescendant={active ? optionId(active.teamId) : undefined}
                  autoComplete="off"
                  maxLength={SEARCH_QUERY_MAX}
                  placeholder={text('예: 블루노트 또는 9', 'e.g. Blue Note or 9')}
                  invalid={error != null}
                  disabled={busy || full}
                  onChange={(e) => {
                    setValue(e.target.value)
                    setSelected(null)
                    setOpen(true)
                    setActiveIndex(-1)
                  }}
                  onFocus={() => setOpen(true)}
                  // 후보 클릭은 mousedown에서 포커스 이동을 막으므로 blur 로 닫아도 선택이 먹힌다
                  onBlur={() => setOpen(false)}
                  onKeyDown={onKeyDown}
                />
                <ul
                  id={LISTBOX_ID}
                  role="listbox"
                  aria-label={text('검색된 팀', 'Matching teams')}
                  hidden={!expanded}
                  className="absolute left-0 right-0 top-full z-20 m-0 mt-1 max-h-72 list-none overflow-auto rounded-control border border-line bg-surface p-1 shadow-lg"
                >
                  {options.map((candidate, index) => {
                    const reason = reasonOf(candidate)
                    const isActive = index === activeIndex
                    return (
                      <li
                        key={candidate.teamId}
                        id={optionId(candidate.teamId)}
                        role="option"
                        aria-selected={isActive}
                        aria-disabled={reason ? true : undefined}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => choose(candidate)}
                        className={[
                          'flex min-h-11 items-center gap-2 rounded-control px-3 font-sans text-[13px] md:min-h-9',
                          reason ? 'cursor-not-allowed text-faint' : 'cursor-pointer text-ink',
                          isActive ? 'bg-ground-2' : '',
                        ].join(' ')}
                      >
                        <span className="min-w-0 truncate font-semibold">{candidate.teamName}</span>
                        <span className="shrink-0 font-num text-[11px] tabular-nums text-muted">
                          · #{candidate.teamId}
                        </span>
                        {reason && (
                          <span className="ml-auto shrink-0 text-[11px] text-muted">{reason}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </FormField>

          {/* 검색 상태 — 목록 밖에 둔다(listbox 자식은 option 이어야 한다) */}
          {searching && (loading || searchFailed || options.length === 0) && (
            <p role="status" className="m-0 font-sans text-[11px] text-muted">
              {loading
                ? text('팀을 찾는 중…', 'Searching teams…')
                : searchFailed
                  ? text(
                      '팀 검색에 실패했습니다. 팀 ID(숫자)로도 초대할 수 있습니다.',
                      'Team search failed. You can still invite by numeric team ID.',
                    )
                  : text(`'${query}'와 일치하는 팀이 없습니다.`, `No teams match '${query}'.`)}
            </p>
          )}
          {selected && (
            <p className="m-0 font-sans text-[11px] text-muted">
              {text(
                `선택한 팀: ${selected.teamName} · #${selected.teamId}`,
                `Selected: ${selected.teamName} · #${selected.teamId}`,
              )}
            </p>
          )}

          {full && (
            <p className="m-0 font-sans text-[11px] font-semibold text-warning">
              {text(
                '참여팀은 최대 8팀입니다. 더 초대하려면 기존 팀을 제외해 주세요.',
                'A show can have up to 8 teams. Remove a team to invite another.',
              )}
            </p>
          )}
          {failure && (
            <p role="alert" className="m-0 font-sans text-[11px] font-semibold text-danger">
              {failure}
            </p>
          )}

          {/* PC 액션 — 폼 마지막 줄 오른쪽(§5.19). 이 화면은 하단 고정을 쓰지 않는다 */}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || full}>
              {busy ? text('보내는 중…', 'Sending…') : text('초대 보내기', 'Send invitation')}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

/* ── 검표 페이지 링크 패널 ────────────────────────────────────────────── */

/**
 * 검표 페이지 링크 — §5.8(링크 전문 + 복사 + 지원 브라우저에 한해 공유).
 *
 * **생성 액션·빈 상태가 없다**(P-04 상태 항목) — 링크는 공연 생성 시점에 이미 발급돼 있다.
 * 생성자에게만 **재발급**(performance_10 `rotate=true`)이 열리고, 재발급은 이전 링크를 즉시
 * 무효화하므로 확인 모달을 거친다(§5.6 비가역 액션).
 *
 * ⚠ 머리말의 경로 불일치 — `entryUrl`을 그대로 쓴다. 열기 버튼도 이 값을 연다.
 */
function EntryLinkPanel({
  link,
  error,
  isOwner,
  rotating,
  rotateFailure,
  onRotate,
}: {
  link?: EntryLinkData
  error?: string
  isOwner: boolean
  rotating: boolean
  rotateFailure?: string
  onRotate: () => void
}) {
  const { text } = useLocale()
  const clipboard = useClipboard()
  const copied = clipboard.copiedKey === 'entry'
  // Web Share API는 보안 컨텍스트·지원 브라우저에서만 있다. 없으면 복사만 제공한다(§5.8)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <section
      aria-label={text('검표 페이지 링크', 'Check-in link')}
      className="rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4"
    >
      <h2 className="m-0 mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('검표 페이지 링크', 'Check-in link')}
      </h2>

      {link ? (
        <>
          {/*
            링크 전문을 읽기 전용으로 노출한다(§5.8) — 복사 API가 막힌 환경에서도 직접 선택해
            가져갈 수 있어야 한다. 잘라 쓰지 않고 줄바꿈으로 흡수한다.
          */}
          <p className="m-0 break-all font-mono text-[11px] text-ink">{link.entryUrl}</p>
          <p className="m-0 mt-1 font-sans text-[11px] leading-relaxed text-muted">
            {text(
              '이 링크를 받은 사람은 로그인 없이 검표할 수 있어요',
              'Anyone with this link can check tickets without signing in.',
            )}
          </p>

          <div className="mt-2">
            <InfoRow label={text('발급', 'Issued')}>{formatKst(link.issuedAt)}</InfoRow>
            <InfoRow label={text('만료', 'Expires')}>{formatKst(link.expiresAt)}</InfoRow>
            {link.entryWindow && (
              <InfoRow label={text('입장', 'Entry window')}>
                {formatKst(link.entryWindow.opensAt)} — {formatKst(link.entryWindow.closesAt)}
              </InfoRow>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" sm onClick={() => clipboard.copy('entry', link.entryUrl)}>
              {text('링크 복사', 'Copy link')}
            </Button>
            {/*
              새 창으로 S-02를 연다. `rel="noreferrer"` — 검표 화면은 토큰이 박힌 주소라
              referrer로 다른 사이트에 흘리지 않는다
            */}
            <a
              href={link.entryUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center rounded-control border border-line px-4 font-sans text-[13px] font-semibold text-ink transition-colors duration-150 ease-out hover:bg-ground-2 md:min-h-8"
            >
              {text('검표 화면 열기', 'Open check-in')}
            </a>
            {canShare && (
              <Button
                variant="secondary"
                sm
                onClick={() => {
                  // 공유 시트 취소도 reject다 — 사용자가 닫은 것이라 에러로 다루지 않는다
                  void navigator
                    .share({ url: link.entryUrl, title: text('검표 페이지', 'Ticket check-in') })
                    .catch(() => {})
                }}
              >
                {text('공유', 'Share')}
              </Button>
            )}
            {copied && (
              <span role="status" className="self-center font-sans text-[11px] text-muted">
                {clipboard.failed ? text('복사 실패', 'Copy failed') : text('복사됨', 'Copied')}
              </span>
            )}
          </div>

          {isOwner && (
            <div className="mt-3 border-t border-line pt-3">
              <Button variant="secondary" sm disabled={rotating} onClick={onRotate}>
                {rotating
                  ? text('재발급 중…', 'Regenerating…')
                  : text('링크 재발급', 'Regenerate link')}
              </Button>
              <p className="m-0 mt-1 font-sans text-[11px] leading-relaxed text-muted">
                {text(
                  '재발급하면 이전 링크는 즉시 무효화됩니다. 이미 전달한 링크는 열리지 않습니다.',
                  'Regenerating immediately invalidates the previous link. Shared copies will stop working.',
                )}
              </p>
            </div>
          )}
        </>
      ) : (
        // 발급 자체가 없는 상태는 명세상 존재하지 않는다 — 여기 오는 것은 조회 실패뿐이다
        <p className="m-0 font-sans text-[13px] text-muted">
          {error ?? text('검표 링크를 불러오지 못했습니다.', 'Could not load the check-in link.')}
        </p>
      )}

      {rotateFailure && (
        <p role="alert" className="m-0 mt-2 font-sans text-[11px] leading-relaxed text-danger">
          {rotateFailure}
        </p>
      )}
    </section>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  /** 공연명. 모바일은 `StudioShell` 상단 바가 같은 값을 갖는다 */
  title: string
  loading?: boolean
  data?: ParticipantScreenData
  /** 403 `PERFORMANCE_NOT_OWNER`·`COMMON_FORBIDDEN` */
  forbidden?: string
  /** 조회 실패 문구(`PERFORMANCE_NOT_FOUND` 등) */
  error?: string
  onRetry?: () => void
  /** performance_07. 성공하면 상위가 목록을 갱신한다 */
  onInvite?: (teamId: number) => Promise<ParticipantActionResult>
  /** performance_08 */
  onAccept?: (teamId: number) => Promise<ParticipantActionResult>
  /** performance_09 */
  onRemove?: (teamId: number) => Promise<ParticipantActionResult>
  /** performance_10 `rotate=true` */
  onRotateEntryLink?: () => Promise<EntryLinkRotateResult>
  /** API-team-06 팀 검색. 없으면 초대 입력은 팀 ID 숫자만 받는다 */
  onSearchTeams?: (q: string, signal: AbortSignal) => Promise<TeamCandidate[]>
}

export function ParticipantManage({
  title,
  loading = false,
  data,
  forbidden,
  error,
  onRetry,
  onInvite,
  onAccept,
  onRemove,
  onRotateEntryLink,
  onSearchTeams,
}: Props) {
  const { text } = useLocale()
  const [inviting, setInviting] = useState(false)
  const [inviteFailure, setInviteFailure] = useState<string | undefined>(undefined)
  /** 지금 처리 중인 행. 같은 행의 버튼만 잠근다 — 목록 전체를 잠그면 다른 팀도 못 만진다 */
  const [pendingTeamId, setPendingTeamId] = useState<number | null>(null)
  const [rowFailure, setRowFailure] = useState<{ teamId: number; text: string } | undefined>(
    undefined,
  )
  /** 제외 확인 모달 대상 */
  const [removeTarget, setRemoveTarget] = useState<ParticipantRow | null>(null)
  const [rotateTarget, setRotateTarget] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [rotateFailure, setRotateFailure] = useState<string | undefined>(undefined)
  /** 재발급으로 받은 새 링크. 조회값(`data.entryLink`)보다 이것이 우선한다 */
  const [rotatedLink, setRotatedLink] = useState<EntryLinkData | undefined>(undefined)
  // These are confirmed action receipts, not a substitute for the missing invitation-list API.
  const [receipts, setReceipts] = useState<
    { id: number; teamId: number; action: 'invite' | 'accept' | 'remove' }[]
  >([])
  const receiptId = useRef(0)
  const actionInFlight = useRef(false)
  const remember = useCallback((teamId: number, action: 'invite' | 'accept' | 'remove') => {
    const id = ++receiptId.current
    setReceipts((previous) => [{ id, teamId, action }, ...previous].slice(0, 20))
  }, [])

  const runInvite = useCallback(
    (teamId: number) => {
      if (actionInFlight.current || !onInvite) return
      actionInFlight.current = true
      void (async () => {
        setInviteFailure(undefined)
        setInviting(true)
        try {
          const result = await onInvite?.(teamId)
          // 핸들러가 없으면(목·미연결) 아무것도 단정하지 않는다
          if (!result) return
          if (!result.ok) setInviteFailure(inviteFailureText(result.code, result.msg))
          else remember(teamId, 'invite')
        } catch {
          setInviteFailure(
            text(
              '초대 결과를 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
              'Could not confirm the invitation result. Check your connection and try again.',
            ),
          )
        } finally {
          actionInFlight.current = false
          setInviting(false)
        }
      })()
    },
    [onInvite, remember, text],
  )

  const runAccept = useCallback(
    (teamId: number) => {
      if (actionInFlight.current || !onAccept) return
      actionInFlight.current = true
      void (async () => {
        setRowFailure(undefined)
        setPendingTeamId(teamId)
        try {
          const result = await onAccept?.(teamId)
          if (!result) return
          if (!result.ok) {
            const text = studioFailureText(result.code, result.msg)
            if (text) setRowFailure({ teamId, text })
          } else remember(teamId, 'accept')
        } catch {
          setRowFailure({
            teamId,
            text: text(
              '참여 수락 결과를 확인하지 못했습니다. 새로 조회한 뒤 다시 확인해 주세요.',
              'Could not confirm acceptance. Reload the participants before trying again.',
            ),
          })
        } finally {
          actionInFlight.current = false
          setPendingTeamId(null)
        }
      })()
    },
    [onAccept, remember, text],
  )

  const runRemove = useCallback(
    (teamId: number) => {
      if (actionInFlight.current || !onRemove) return
      actionInFlight.current = true
      void (async () => {
        setRowFailure(undefined)
        setPendingTeamId(teamId)
        try {
          const result = await onRemove?.(teamId)
          if (!result) return
          if (!result.ok) {
            const text = studioFailureText(result.code, result.msg)
            if (text) setRowFailure({ teamId, text })
          } else remember(teamId, 'remove')
        } catch {
          setRowFailure({
            teamId,
            text: text(
              '제외 결과를 확인하지 못했습니다. 새로 조회한 뒤 다시 확인해 주세요.',
              'Could not confirm removal. Reload the participants before trying again.',
            ),
          })
        } finally {
          actionInFlight.current = false
          setPendingTeamId(null)
        }
      })()
    },
    [onRemove, remember, text],
  )

  const runRotate = useCallback(() => {
    void (async () => {
      setRotateFailure(undefined)
      setRotating(true)
      try {
        const result = await onRotateEntryLink?.()
        if (!result) return
        if (!result.ok) {
          setRotateFailure(entryLinkFailureText(result.code, result.msg))
          return
        }
        // 낙관적으로 바꾸지 않는다 — 서버가 새 링크를 준 뒤에만 화면을 옮긴다
        if (result.link) setRotatedLink(result.link)
      } finally {
        setRotating(false)
      }
    })()
  }, [onRotateEntryLink])

  if (loading) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioSkeleton label={text('참여팀을 불러오는 중', 'Loading participants')} rows={1} />
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

  if (error || !data) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioErrorPanel
          title={text('참여팀을 불러오지 못했습니다', 'Could not load participants')}
          msg={error ?? text('잠시 후 다시 시도해 주세요.', 'Please try again in a moment.')}
          onRetry={onRetry}
        />
      </div>
    )
  }

  /**
   * 잠금 — `ON_SALE` 이후에는 초대·제외가 막힌다(performance_07·09 409).
   * 취소된 공연도 구성을 바꿀 이유가 없어 같이 막는다.
   *
   * 보증금이 `PAID`면 `PENDING_AGREEMENT`여도 막는다 — 온체인 공연이 이미 등록돼 있어
   * 서버가 409로 거절한다(`depositStatus` 주석). 버튼을 열어 두고 실패 문구로 알리는 것은
   * 눌러 본 사람에게만 알리는 것이다.
   */
  const statusLocked =
    data.performanceStatus !== 'DRAFT' && data.performanceStatus !== 'PENDING_AGREEMENT'
  const locked = statusLocked || data.depositStatus === 'PAID'
  /** 사유가 둘이라 문구도 둘이다. "판매가 시작돼"는 보증금 잠금에서는 사실이 아니다 */
  const lockedReason = statusLocked
    ? text(
        '판매가 시작돼 참여팀 구성이 잠겼습니다. 초대·제외를 할 수 없습니다.',
        'Ticket sales have started. You can no longer invite or remove teams.',
      )
    : text(
        '온체인에 공연이 등록돼 참여팀 구성이 잠겼습니다. 초대·제외를 할 수 없습니다.',
        'The show is registered on-chain. You can no longer invite or remove teams.',
      )
  const unlinked = data.participants.filter((p) => p.leaderWalletLinked === false)
  const myInvites = data.participants.filter((p) => p.myTeam && p.participationStatus === 'INVITED')
  const entryLink = rotatedLink ?? data.entryLink

  return (
    <div className="flex w-full max-w-[1200px] flex-col gap-4 px-3 py-3 md:gap-6 md:px-0 md:py-0">
      {/* 헤더 — 공연명 + 공연 상태 배지. 모바일은 `StudioShell` 상단 바가 공연명을 갖는다 */}
      <StudioHeading title={title} section={['참여팀 관리', 'Participants']}>
        <StatusBadge status={SHOW_STATUS[data.performanceStatus]} />
      </StudioHeading>

      {receipts.length > 0 && (
        <section
          aria-label={text('이 화면의 처리 결과', 'Actions completed here')}
          className="rounded-card border border-primary/30 bg-surface p-5"
        >
          <h2 className="m-0 text-base font-semibold text-ink">
            {text('이 화면에서 완료한 작업', 'Actions completed here')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {text(
              '이 화면에서 서버가 성공 응답한 최근 20건입니다. 전체 이력이나 현재 수락 상태를 뜻하지 않습니다. 화면을 나가면 지워집니다.',
              'The latest 20 successful server responses on this page, not the full history or current acceptance status. This list clears when you leave.',
            )}
          </p>
          <ul aria-live="polite" className="m-0 list-none space-y-2 p-0">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="text-sm font-medium text-ink">
                {receipt.action === 'invite'
                  ? text(
                      `팀 #${receipt.teamId}에 초대를 보냈습니다.`,
                      `Invitation sent to team #${receipt.teamId}.`,
                    )
                  : receipt.action === 'accept'
                    ? text(
                        `팀 #${receipt.teamId}의 공연 참여를 수락했습니다.`,
                        `Accepted the show invitation for team #${receipt.teamId}.`,
                      )
                    : text(
                        `팀 #${receipt.teamId}을 공연 참여팀에서 제외했습니다.`,
                        `Removed team #${receipt.teamId} from the show.`,
                      )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* performance_19 조회가 실패해 수락 팀만 아는 예전 경로일 때만 띄운다 */}
      {data.isOwner && data.participantsComplete === false && (
        <StudioNotice tone="info" title={text('보낸 초대 확인 안내', 'About sent invitations')}>
          {text(
            '현재 참여팀 조회에는 수락한 팀만 포함됩니다. 다른 팀에 보낸 초대의 대기·취소 이력은 아직 조회할 수 없습니다. 초대 후 아래 목록에 바로 나타나지 않아도 중복해서 보내지 마세요.',
            'The participant query currently returns accepted teams only. Pending invitations and cancellation history for other teams are not available yet. Do not resend an invitation just because it is absent from the list.',
          )}
        </StudioNotice>
      )}

      {/* 지갑 미등록 경고 — 명세가 정한 문구 그대로. 다음 화면으로 못 가는 이유가 이것이다 */}
      {unlinked.length > 0 && (
        <StudioNotice
          tone="warning"
          title={text(
            '지갑을 등록하지 않은 팀이 있어 정산 규칙을 설정할 수 없습니다. 해당 팀 리더에게 지갑 등록을 요청하세요.',
            'All team leaders must connect a wallet before you can set settlement rules.',
          )}
        >
          {text('미등록:', 'Not connected:')}
          {unlinked.map((p) => p.teamName).join(' · ')}
        </StudioNotice>
      )}

      {/* 내 팀이 초대만 받은 상태 — 수락 전에는 검표 링크도 볼 수 없다(performance_08) */}
      {myInvites.length > 0 && (
        <StudioNotice
          tone="info"
          title={text(
            `내 팀의 공연 초대 ${myInvites.length}건을 확인해 주세요`,
            `Review ${myInvites.length} invitation(s) for your teams`,
          )}
        >
          <p className="mt-0 font-semibold">
            {myInvites.map((team) => `${team.teamName} #${team.teamId}`).join(' · ')}
          </p>
          {text(
            '아래 목록에서 참여를 수락하면 검표 링크와 입장 현황을 볼 수 있습니다.',
            'Accept your invitation below to view the check-in link and entry status.',
          )}
        </StudioNotice>
      )}

      {/* PC 2열 — 좌 2/3(목록·초대 폼) / 우 1/3(검표 링크). 모바일은 1열이고 링크가 맨 아래다 */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:gap-6">
          <ParticipantList
            rows={data.participants}
            isOwner={data.isOwner}
            locked={locked}
            pendingTeamId={inviting ? -1 : pendingTeamId}
            rowFailure={rowFailure}
            onAccept={runAccept}
            onRemove={(row) => setRemoveTarget(row)}
          />

          {/* 초대는 생성자만 한다(performance_07 403 `PERFORMANCE_NOT_OWNER`) */}
          {data.isOwner && (
            <InviteForm
              count={data.participants.length}
              locked={locked}
              lockedText={lockedReason}
              busy={inviting || pendingTeamId !== null}
              failure={inviteFailure}
              participants={data.participants}
              ownTeamIds={data.ownTeamIds ?? []}
              onSearch={onSearchTeams}
              onSubmit={runInvite}
            />
          )}

          {/* 다음 단계 — 지갑 미등록 팀이 있으면 규칙 설정에서 막힌다(P-05 진입 조건) */}
          {data.isOwner && !locked && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {unlinked.length > 0 && (
                <span className="font-sans text-[11px] text-muted">
                  {text(
                    '지갑 미등록 팀이 있어 규칙을 저장할 수 없습니다',
                    'All teams must connect a wallet before rules can be saved.',
                  )}
                </span>
              )}
              <Link
                to={`/studio/performances/${data.performanceId}/rules`}
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-bright"
              >
                {text('정산 규칙 설정으로', 'Set settlement rules')}
              </Link>
            </div>
          )}
        </div>

        <div className="w-full shrink-0 md:w-[340px]">
          <EntryLinkPanel
            link={entryLink}
            error={data.entryLinkError}
            isOwner={data.isOwner}
            rotating={rotating}
            rotateFailure={rotateFailure}
            onRotate={() => setRotateTarget(true)}
          />
        </div>
      </div>

      {/* 제외는 되돌릴 수 없고 동의도 초기화된다(performance_09) → 확인 모달(§5.6) */}
      <ConfirmDialog
        open={removeTarget != null}
        title={
          removeTarget?.participationStatus === 'INVITED'
            ? text('보낸 초대를 취소할까요?', 'Cancel this invitation?')
            : text('참여팀에서 제외할까요?', 'Remove this team?')
        }
        body={
          removeTarget
            ? removeTarget.participationStatus === 'INVITED'
              ? text(
                  `${removeTarget.teamName} 팀에 보낸 초대가 취소되고, 이미 받은 팀 동의가 있으면 모두 초기화됩니다.`,
                  `The invitation to ${removeTarget.teamName} will be cancelled and any existing team agreements will reset.`,
                )
              : text(
                  `${removeTarget.teamName} 팀이 이 공연에서 빠지고, 이미 받은 팀 동의가 모두 초기화됩니다.`,
                  `${removeTarget.teamName} will leave this show and all existing team agreements will reset.`,
                )
            : undefined
        }
        confirmLabel={
          removeTarget?.participationStatus === 'INVITED'
            ? text('초대 취소하기', 'Cancel invitation')
            : text('제외하기', 'Remove team')
        }
        cancelLabel={text('취소', 'Cancel')}
        confirmVariant="danger"
        busy={pendingTeamId != null}
        onConfirm={() => {
          const target = removeTarget
          setRemoveTarget(null)
          if (target) runRemove(target.teamId)
        }}
        onClose={() => setRemoveTarget(null)}
      />

      {/* 재발급도 비가역이다 — 이전 링크를 받은 검표 담당자가 즉시 못 들어간다 */}
      <ConfirmDialog
        open={rotateTarget}
        title={text('검표 링크를 다시 발급할까요?', 'Regenerate the check-in link?')}
        body={text(
          '이전 링크는 즉시 무효화됩니다. 이미 전달한 링크로는 검표 화면이 열리지 않습니다.',
          'The previous link will immediately stop working, including copies you have already shared.',
        )}
        confirmLabel={text('재발급하기', 'Regenerate')}
        cancelLabel={text('취소', 'Cancel')}
        confirmVariant="danger"
        busy={rotating}
        onConfirm={() => {
          setRotateTarget(false)
          runRotate()
        }}
        onClose={() => setRotateTarget(false)}
      />
    </div>
  )
}
