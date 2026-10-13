/**
 * M-02 이의제기 처리 — 본문.
 *
 * 정본 — 화면설계 v6 §4 M-02(1531행~): 영역 구성 · 레이아웃 · 컴포넌트 표 5행 · 비고 · 상태 ·
 *        입력 검증 · 모바일·접근성 / §5.1 상태 배지 · §5.6 확인 모달 · §5.13 KST 병기 ·
 *        §5.21 표 → 패널 접기
 *        API — `admin_09 GET /api/v1/admin/disputes` · `admin_06 PATCH /api/v1/admin/disputes/{disputeId}`
 *              · `settlement_01 GET /api/v1/performances/{performanceId}/settlement`(상세 패널)
 *
 * **비가역 처리다.** 그래서 이 화면은 세 가지를 지킨다.
 *   ① 승인·반려는 항상 확인 모달을 거친다(§5.6 · M-02 접근성 "확인 모달 필수")
 *   ② 모달이 **무엇이 얼마나 바뀌는지 숫자로** 말한다 — 대상 공연·팀·분배액·release 보류 해제 여부
 *   ③ **낙관적 UI를 쓰지 않는다.** 눌린 즉시 목록의 상태를 바꾸지 않고, `ok`가 돌아온 뒤에만
 *      호출부가 목록을 갱신한다. 409(이미 처리된 이의)는 서버만 알 수 있다.
 *
 * **M-02에 별도 중단 버튼을 두지 않는다**(M-02 비고 · §A D4). 이의를 인정해 집계를 되돌릴 수
 * 없다고 판정하면 `RESOLVED`로 처리한 뒤 **공연 취소 경로(P-10)** 로 전액 환불한다.
 * 그 결과로 정산이 `HALTED`가 된다. 그래서 승인 확인 모달과 처리 결과에 그 경로 안내를 붙인다.
 *
 * ⚠ P-10은 라우트가 없는 **모달**이다(P-03·P-08에서 진입). 그래서 안내 링크는 해당 공연의
 *   P-08 정산 대시보드(`/studio/performances/{id}/settlement`)로 보낸다 — 거기서 공연 취소를 연다.
 *
 * 장식 효과·애니메이션을 넣지 않았다. 전환은 공통 컴포넌트(`ConfirmDialog`)가 이미 가진 것뿐이다.
 */

import { useId, useState } from 'react'
import { Link } from 'react-router'

import {
  AdminEmpty,
  AdminErrorPanel,
  AdminField,
  AdminForbidden,
  AdminNotice,
  AdminPanel,
  AdminResultLine,
  AdminRow,
  AdminSkeleton,
  DisputeStatusBadge,
  TxLink,
} from '@/features/admin/AdminStates'
import {
  DISPUTE_COMMENT_MAX,
  DISPUTE_COMMENT_MIN,
  remainingText,
} from '@/features/admin/adminForms'
import {
  adminFailureText,
  isAccessDeniedCode,
  isAlreadyReleasedCode,
  isAlreadyResolvedCode,
  isSettlementDeniedCode,
} from '@/features/admin/adminMessages'
import type {
  AdminError,
  AdminResult,
  DisputeAdminListItem,
  DisputeAdminListSummary,
  DisputePageInfo,
  DisputeResolveRequest,
  DisputeResolveResult,
  DisputeSettlementDetail,
  DisputeStatus,
} from '@/features/admin/adminTypes'
import { useLocale } from '@/shared/i18n/useLocale'
import {
  Button,
  ConfirmDialog,
  Money,
  SettlementStatusBadge,
  Tabs,
  formatYoyo,
  formatKst,
  shortenHex,
} from '@/shared/ui'

export interface DisputeQueueProps {
  /** 목록 로딩 — 스켈레톤 */
  loading: boolean
  /** 목록 조회 실패. 401·403이면 화면 전체를 권한 안내로 덮는다 */
  error?: AdminError | null
  summary: DisputeAdminListSummary | null
  items: DisputeAdminListItem[]
  status: DisputeStatus
  onStatusChange: (status: DisputeStatus) => void
  /** admin_09 `pageInfo`. 첫 응답 전에는 `null`이라 쪽 이동을 그리지 않는다 */
  pageInfo: DisputePageInfo | null
  onPageChange: (page: number) => void
  /** 선택한 이의. `null`이면 모바일에서 목록 단계다 */
  selectedId: number | null
  onSelect: (disputeId: number | null) => void
  /** 선택 건 공연의 정산 요약(`settlement_01`) */
  detail: {
    loading: boolean
    error?: AdminError | null
    data: DisputeSettlementDetail | null
  }
  /** 승인·반려. **응답이 돌아온 뒤에만** 호출부가 목록을 갱신한다 */
  onResolve: (
    disputeId: number,
    req: DisputeResolveRequest,
  ) => Promise<AdminResult<DisputeResolveResult>>
  onRetry: () => void
  onRetryDetail: () => void
}

export function DisputeQueue({
  loading,
  error,
  summary,
  items,
  status,
  onStatusChange,
  pageInfo,
  onPageChange,
  selectedId,
  onSelect,
  detail,
  onResolve,
  onRetry,
  onRetryDetail,
}: DisputeQueueProps) {
  const { language, text } = useLocale()
  const selected = items.find((d) => d.disputeId === selectedId) ?? null
  const statusTabs: readonly { id: DisputeStatus; label: string }[] = [
    { id: 'OPEN', label: text('검토 중', 'Open') },
    { id: 'RESOLVED', label: text('처리 완료', 'Resolved') },
    { id: 'REJECTED', label: text('반려', 'Rejected') },
  ]

  if (error && isAccessDeniedCode(error.code)) {
    return <AdminForbidden msg={adminFailureText(error.code, error.msg) ?? ''} />
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-0 md:py-0">
      {/* PC에서만 본문 머리를 둔다 — 모바일은 껍데기 상단 바가 제목을 갖는다 */}
      <header className="hidden md:block">
        <h2 className="m-0 font-sans text-xl font-bold text-ink">
          {text('이의제기 처리', 'Dispute review')}
        </h2>
        {summary && (
          <p className="m-0 mt-1 font-sans text-xs text-muted">
            {text('검토 중', 'Open')} {summary.openCount.toLocaleString(language)}
            {text('건', '')} · {text('release 보류', 'Release held')}{' '}
            {summary.releaseHeldCount.toLocaleString(language)}
            {text('건', '')}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        {/* ── 좌: 상태 필터 + 목록 (PC 400px) ── */}
        <div
          className={[
            'flex min-w-0 flex-col gap-3 md:basis-[38%] md:shrink',
            // 모바일은 목록 → 상세 2단계다. 상세를 보는 동안 목록을 감춘다(M-02 레이아웃)
            selectedId != null ? 'hidden md:flex' : 'flex',
          ].join(' ')}
        >
          <Tabs tabs={statusTabs} active={status} onChange={onStatusChange} />

          {loading ? (
            <AdminSkeleton
              label={text('이의제기 목록을 불러오는 중', 'Loading disputes')}
              rows={3}
            />
          ) : error ? (
            <AdminErrorPanel
              title={text('이의제기 목록을 불러오지 못했습니다', 'Could not load disputes')}
              msg={adminFailureText(error.code, error.msg) ?? ''}
              onRetry={onRetry}
            />
          ) : items.length === 0 ? (
            <AdminEmpty>{text('처리할 이의제기가 없습니다', 'No disputes to review')}</AdminEmpty>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {items.map((item) => (
                <li key={item.disputeId}>
                  <DisputeRow
                    item={item}
                    selected={item.disputeId === selectedId}
                    onSelect={() => onSelect(item.disputeId)}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* 쪽 이동 — 서버 페이지네이션(0-base)이다. `hasNext`가 유일한 다음 쪽 근거이고,
              총 쪽수는 응답이 주지 않으므로 계산해 지어내지 않는다 */}
          {!loading && !error && pageInfo && (pageInfo.page > 0 || pageInfo.hasNext) && (
            <div className="flex items-center justify-between gap-2">
              <Button
                sm
                variant="secondary"
                disabled={pageInfo.page === 0}
                onClick={() => onPageChange(pageInfo.page - 1)}
              >
                {text('이전', 'Previous')}
              </Button>
              <span className="font-sans text-[11px] text-muted">
                {text(
                  `${pageInfo.page + 1}쪽 · 전체 ${pageInfo.totalElements}건`,
                  `Page ${pageInfo.page + 1} · ${pageInfo.totalElements} total`,
                )}
              </span>
              <Button
                sm
                variant="secondary"
                disabled={!pageInfo.hasNext}
                onClick={() => onPageChange(pageInfo.page + 1)}
              >
                {text('다음', 'Next')}
              </Button>
            </div>
          )}
        </div>

        {/* ── 우: 선택 건 상세 ── */}
        <div
          className={[
            'min-w-0 flex-1 flex-col gap-4',
            selectedId != null ? 'flex' : 'hidden md:flex',
          ].join(' ')}
        >
          {selected ? (
            <DisputeDetail
              key={selected.disputeId}
              item={selected}
              detail={detail}
              onResolve={onResolve}
              onBack={() => onSelect(null)}
              onRetryDetail={onRetryDetail}
            />
          ) : (
            <AdminEmpty>
              {text(
                '왼쪽 목록에서 이의제기를 고르면 상세가 열립니다',
                'Select a dispute from the list to review its details',
              )}
            </AdminEmpty>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 목록 행 — M-02 컴포넌트 표 "공연명·제기팀·제기 일시(KST)·상태 배지".
 *
 * 선택 표시는 **배경색**이다(테두리·Outline을 쓰지 않는다 — 디자인 토큰 규칙).
 * 행 전체가 탭 타겟이고 높이는 44px 이상이다.
 */
function DisputeRow({
  item,
  selected,
  onSelect,
}: {
  item: DisputeAdminListItem
  selected: boolean
  onSelect: () => void
}) {
  const { language, text } = useLocale()
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={onSelect}
      className={[
        'flex w-full min-h-11 cursor-pointer flex-col gap-1 rounded-card border px-3 py-2.5 text-left',
        'transition-colors duration-150 ease-out',
        selected ? 'border-line bg-sel-soft' : 'border-line bg-surface hover:bg-ground-2',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-sans text-[13px] font-semibold text-ink md:text-sm">
          {item.performanceTitle}
        </span>
        <DisputeStatusBadge status={item.status} />
      </div>
      <span className="font-sans text-[11px] text-muted md:text-xs">
        {item.teamName} · {formatKst(item.createdAt, undefined, language)}
      </span>
      {/* release 보류는 우선순위 판단 근거다(admin_09 설명: 보류를 풀어야 하는 건이 위로 온다) */}
      {item.releaseHeld && (
        <span className="font-sans text-[11px] font-semibold text-ink">
          {text('release 보류 중', 'Release held')}
        </span>
      )}
    </button>
  )
}

/**
 * 상세 패널 — 사유 전문, 공연 정산 요약, 처리 의견 입력, 승인·반려.
 *
 * `key={disputeId}`로 마운트를 갈아 끼운다 — 다른 이의로 옮길 때 **입력한 처리 의견과 결과 문구가
 * 따라가면 안 된다.** 돈이 걸린 판정에서 이전 건의 문구가 남아 있는 것은 사고다.
 */
function DisputeDetail({
  item,
  detail,
  onResolve,
  onBack,
  onRetryDetail,
}: {
  item: DisputeAdminListItem
  detail: DisputeQueueProps['detail']
  onResolve: DisputeQueueProps['onResolve']
  onBack: () => void
  onRetryDetail: () => void
}) {
  const { language, text } = useLocale()
  const commentId = useId()
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState<string | undefined>()
  /** 확인 모달에서 실행할 판정. `null`이면 모달이 닫혀 있다 */
  const [pending, setPending] = useState<DisputeResolveRequest['status'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<
    { ok: true; data: DisputeResolveResult } | { ok: false; code: string; msg?: string } | null
  >(null)

  /**
   * 409가 두 종류다. **같은 문구로 뭉개지 않는다**(admin_06 4xx).
   *   · `COMMON_CONFLICT`             — 다른 관리자가 먼저 처리했다. 이 건은 이미 끝났으므로
   *                                     상세를 읽기 전용으로 바꾸고 목록을 다시 불러온다
   *   · `SETTLEMENT_ALREADY_RELEASED` — 이의는 아직 열려 있지만 정산 release가 끝나 **처리해도
   *                                     분배가 바뀌지 않는다.** 상태를 바꿔 적으면 거짓말이므로
   *                                     상태는 그대로 두고 버튼만 막는다
   */
  const resolvedByServer = result?.ok ? result.data.status : null
  const currentStatus = resolvedByServer ?? item.status
  const failureCode = result != null && !result.ok ? result.code : null
  const conflicted = isAlreadyResolvedCode(failureCode)
  const alreadyReleased = isAlreadyReleasedCode(failureCode)
  const readOnly = currentStatus !== 'OPEN' || conflicted

  const remaining = remainingText(item.disputeClosesAt, Date.now(), language)
  const myShare = detail.data?.shares.find((s) => s.teamId === item.teamId) ?? null

  const submit = (status: DisputeResolveRequest['status']) => {
    const trimmed = comment.trim()
    // 입력 검증 — M-02 "처리 의견 필수 입력(승인·반려 모두)" + admin_06 스키마 10~1000자
    if (!trimmed) {
      setCommentError(
        text(
          '처리 의견은 필수입니다. 참여팀에 그대로 공개됩니다.',
          'A review comment is required and will be shared with participating teams.',
        ),
      )
      return
    }
    if (trimmed.length < DISPUTE_COMMENT_MIN) {
      setCommentError(
        text(
          `처리 의견은 ${DISPUTE_COMMENT_MIN}자 이상 적어 주세요.`,
          `Enter at least ${DISPUTE_COMMENT_MIN} characters.`,
        ),
      )
      return
    }
    if (trimmed.length > DISPUTE_COMMENT_MAX) {
      setCommentError(
        text(
          `처리 의견은 ${DISPUTE_COMMENT_MAX}자 이하로 적어 주세요.`,
          `Enter no more than ${DISPUTE_COMMENT_MAX} characters.`,
        ),
      )
      return
    }
    setCommentError(undefined)
    setPending(status)
  }

  const confirm = async () => {
    if (pending == null) return
    setBusy(true)
    // 낙관적 UI 금지 — 여기서 상태를 옮기지 않는다. 응답이 온 뒤에만 바꾼다
    const res = await onResolve(item.disputeId, { status: pending, adminComment: comment.trim() })
    setBusy(false)
    setPending(null)
    setResult(res)
  }

  return (
    <>
      {/* 모바일 2단계 — 상세에서 목록으로 돌아가는 길 */}
      <button
        type="button"
        onClick={onBack}
        className="-mx-1 flex h-11 w-fit cursor-pointer items-center gap-1 rounded-control px-2 font-sans text-[13px] text-muted transition-colors duration-150 ease-out hover:bg-ground-2 hover:text-ink md:hidden"
      >
        <span aria-hidden>←</span> {text('목록으로', 'Back to list')}
      </button>

      <AdminPanel
        title={item.performanceTitle}
        description={
          <>
            {text(`${item.teamName}이 제기`, `Raised by ${item.teamName}`)} ·{' '}
            {formatKst(item.createdAt, undefined, language)}
          </>
        }
        action={<DisputeStatusBadge status={currentStatus} />}
      >
        <div className="flex flex-col">
          {/* 마감은 **잠금 이후에만** 있다. 없는 동안 현재 시각이나 빈칸을 그리지 않고 줄을 뺀다 */}
          {item.disputeClosesAt && (
            <AdminRow label={text('이의제기 마감', 'Review deadline')}>
              {formatKst(item.disputeClosesAt, undefined, language)}
              {remaining && <span className="ml-2 font-normal text-muted">{remaining}</span>}
            </AdminRow>
          )}
          <AdminRow label={text('release 보류', 'Release hold')}>
            {item.releaseHeld
              ? text(
                  '보류 중 — 처리해야 지급이 재개됩니다',
                  'Held — resolve this dispute to resume payouts',
                )
              : text('보류 없음', 'Not held')}
          </AdminRow>
          {item.expectedAmount != null && (
            <AdminRow label={text('제기팀 주장 금액', 'Claimed amount')}>
              <Money amount={item.expectedAmount} />
            </AdminRow>
          )}
          {item.resolvedAt && (
            <AdminRow label={text('처리 시각', 'Resolved at')}>
              {formatKst(item.resolvedAt, undefined, language)}
            </AdminRow>
          )}
        </div>

        {/* 사유 전문 — 줄바꿈을 그대로 살린다. 사람이 쓴 글이라 요약하지 않는다 */}
        <div className="mt-3 rounded-card border border-line bg-ground px-3 py-2.5">
          <p className="m-0 mb-1 font-sans text-[11px] font-semibold text-muted">
            {text('사유 전문', 'Submitted reason')}
          </p>
          <p className="m-0 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
            {item.reason}
          </p>
        </div>
      </AdminPanel>

      <SettlementSummary
        detail={detail}
        performanceId={item.performanceId}
        listSettlementStatus={item.settlementStatus}
        onRetry={onRetryDetail}
      />

      <AdminPanel
        title={text('처리', 'Decision')}
        description={text(
          '승인(처리 완료)·반려 모두 처리 의견이 필요합니다. 결과는 감사 로그에 남고 참여팀에 공개됩니다.',
          'Approval and rejection both require a comment. The result is audited and shared with participating teams.',
        )}
      >
        {readOnly ? (
          <div className="flex flex-col gap-3">
            <AdminResultLine tone={conflicted ? 'danger' : 'ok'}>
              {conflicted
                ? (adminFailureText(failureCode, undefined) ?? '')
                : text(
                    `이 이의는 ${currentStatus === 'RESOLVED' ? '처리 완료' : '반려'}로 처리되었습니다.`,
                    `This dispute was ${currentStatus === 'RESOLVED' ? 'approved' : 'rejected'}.`,
                  )}
            </AdminResultLine>
            {result?.ok && (
              <div className="flex flex-col">
                <AdminRow label={text('처리 시각', 'Resolved at')}>
                  {formatKst(result.data.resolvedAt, undefined, language)}
                </AdminRow>
                <AdminRow label={text('release 보류', 'Release hold')}>
                  {result.data.releaseHeld
                    ? text('아직 보류 중입니다', 'Still held')
                    : text(
                        '해제되었습니다 — 자동 스케줄이 재개됩니다',
                        'Released — automatic scheduling resumes',
                      )}
                </AdminRow>
              </div>
            )}
            {/* M-02 비고 — 인정한 경우의 다음 경로. 이 화면에는 중단 버튼이 없다 */}
            {currentStatus === 'RESOLVED' && (
              <AdminNotice
                tone="warning"
                title={text(
                  '집계를 되돌릴 수 없다고 판정했다면',
                  'If the aggregation cannot be corrected',
                )}
              >
                {text(
                  '이 화면에는 중단 버튼이 없습니다. 공연 취소 경로에서 전액 환불을 실행하면 정산이 자동으로 정산 중단(HALTED)이 됩니다.',
                  'This screen does not halt settlement. Use the show-cancellation flow for a full refund; settlement will then move to HALTED.',
                )}
                <div className="mt-2">
                  <Link
                    to={`/studio/performances/${item.performanceId}/settlement`}
                    className="inline-flex min-h-11 items-center rounded-control border border-line px-4 font-sans text-[13px] font-semibold text-ink transition-colors duration-150 ease-out hover:bg-ground-2"
                  >
                    {text('정산 대시보드에서 공연 취소 열기', 'Open cancellation in settlement')}
                  </Link>
                </div>
              </AdminNotice>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <AdminField
              label={text('처리 의견', 'Review comment')}
              htmlFor={commentId}
              required
              error={commentError}
              hint={text(
                `${DISPUTE_COMMENT_MIN}~${DISPUTE_COMMENT_MAX}자. 지금 ${comment.trim().length}자 · 참여팀에 그대로 공개됩니다.`,
                `${DISPUTE_COMMENT_MIN}–${DISPUTE_COMMENT_MAX} characters. ${comment.trim().length} entered · shared with participating teams.`,
              )}
            >
              <textarea
                id={commentId}
                value={comment}
                rows={4}
                maxLength={DISPUTE_COMMENT_MAX}
                aria-invalid={commentError ? true : undefined}
                onChange={(e) => {
                  setComment(e.target.value)
                  if (commentError) setCommentError(undefined)
                }}
                placeholder={text(
                  '판단 근거를 적어 주세요. 예: 온체인 카운터와 서버 집계가 일치하며 재확인 결과 이상이 없습니다.',
                  'Explain the decision. Example: the on-chain counters match the server aggregation after review.',
                )}
                className={[
                  'w-full rounded-control border bg-ground px-3.5 py-2.5 font-sans text-sm text-ink',
                  'transition-colors duration-150 ease-out placeholder:text-faint',
                  commentError
                    ? 'border-danger'
                    : 'border-line hover:border-muted focus:border-primary',
                ].join(' ')}
              />
            </AdminField>

            {result && !result.ok && (
              <AdminResultLine tone="danger">
                {adminFailureText(result.code, result.msg)}
              </AdminResultLine>
            )}

            {/* PC는 하단 고정을 쓰지 않는다 — 폼 마지막 줄 오른쪽에 둔다(§5.19).
                release가 끝난 정산이면 같은 요청이 다시 409로 돌아온다 — 누를 수 있게 두지 않는다 */}
            <div className="flex flex-col gap-2 md:flex-row md:justify-end">
              <Button
                variant="danger"
                disabled={busy || alreadyReleased}
                onClick={() => submit('REJECTED')}
              >
                {text('반려', 'Reject')}
              </Button>
              <Button
                variant="primary"
                disabled={busy || alreadyReleased}
                onClick={() => submit('RESOLVED')}
              >
                {text('승인(처리 완료)', 'Approve')}
              </Button>
            </div>
          </div>
        )}
      </AdminPanel>

      {/* §5.6 확인 모달 — 결과를 구체적인 숫자로 요약한다 */}
      <ConfirmDialog
        open={pending != null}
        busy={busy}
        title={
          pending === 'RESOLVED'
            ? text('이의를 승인할까요?', 'Approve this dispute?')
            : text('이의를 반려할까요?', 'Reject this dispute?')
        }
        confirmVariant="danger"
        confirmLabel={pending === 'RESOLVED' ? text('승인', 'Approve') : text('반려', 'Reject')}
        cancelLabel={text('취소', 'Cancel')}
        onClose={() => (busy ? undefined : setPending(null))}
        onConfirm={confirm}
        body={
          <div className="flex flex-col gap-1">
            <span>
              <strong className="text-ink">{item.performanceTitle}</strong> ·{' '}
              {text('제기팀', 'Team')} <strong className="text-ink">{item.teamName}</strong>
            </span>
            {myShare && (
              <span>
                {text('이 팀의 분배액', 'Team payout')}{' '}
                <strong className="text-ink tabular-nums">{formatYoyo(myShare.totalAmount)}</strong>
                {myShare.released
                  ? text(' · 수령 완료', ' · Received')
                  : text(' · 지급 대기', ' · Pending')}
              </span>
            )}
            {detail.data && (
              <span>
                {text('공연 분배 대상액', 'Show distributable amount')}{' '}
                <strong className="text-ink tabular-nums">
                  {formatYoyo(detail.data.distributableAmount)}
                </strong>{' '}
                · {text(`팀 ${detail.data.shares.length}곳`, `${detail.data.shares.length} teams`)}
              </span>
            )}
            <span>
              {pending === 'REJECTED'
                ? text(
                    'release 보류가 풀려 자동 지급 스케줄이 재개됩니다.',
                    'The release hold is removed and automatic payout scheduling resumes.',
                  )
                : text(
                    '분배 결과는 바뀌지 않습니다. 집계를 되돌릴 수 없다고 판정했다면 처리 후 공연 취소 경로로 전액 환불하세요.',
                    'The payout result does not change. If the aggregation cannot be corrected, approve this dispute and issue a full refund through show cancellation.',
                  )}
            </span>
            <span className="text-muted">
              {text(
                '되돌릴 수 없고 감사 로그에 남습니다.',
                'This action cannot be undone and is recorded in the audit log.',
              )}
            </span>
          </div>
        }
      />
    </>
  )
}

/**
 * 선택 건 공연의 정산 요약 — `settlement_01`.
 *
 * M-02 컴포넌트 표: "해당 공연의 정산 상태·팀별 분배액 요약·release tx·팀별 수령 완료 여부".
 * 표는 §5.21대로 모바일에서 **행 하나 = 패널 하나**로 접고, 열 순서를 바꾸지 않는다.
 *
 * ⚠ 이 조회가 403(`SETTLEMENT_NOT_PARTICIPANT`)으로 막힐 수 있다 — `settlement_01`의
 *   `x-role`이 `[PERFORMER]`뿐이라 관리자 허용이 명세에 없다. 그때도 **패널만** 에러로 두고
 *   이의 본문·처리 버튼은 그대로 쓸 수 있게 남긴다(전체를 덮지 않는다).
 */
function SettlementSummary({
  detail,
  performanceId,
  listSettlementStatus,
  onRetry,
}: {
  detail: DisputeQueueProps['detail']
  performanceId: number
  /** 목록 응답에도 정산 상태가 있다 — 상세 조회가 막혀도 이 값은 보여줄 수 있다 */
  listSettlementStatus: DisputeAdminListItem['settlementStatus']
  onRetry: () => void
}) {
  const { language, text } = useLocale()
  if (detail.loading) {
    return (
      <AdminPanel title={text('정산 요약', 'Settlement summary')}>
        <AdminSkeleton label={text('정산 정보를 불러오는 중', 'Loading settlement')} rows={2} />
      </AdminPanel>
    )
  }

  /**
   * 권한으로 막힌 경우는 **재시도가 낫게 하지 못한다.**
   * `settlement_01`의 `x-role`이 `[PERFORMER]`뿐이라 관리자 계정은 참여팀이 아닌 한 계속 403이다.
   * 재시도 버튼을 주면 관리자가 같은 실패를 반복한다 — 안내만 남기고 **목록·처리 버튼은 살려 둔다.**
   */
  if (detail.error && isSettlementDeniedCode(detail.error.code)) {
    return (
      <AdminPanel
        title={text('정산 요약', 'Settlement summary')}
        description={text(`공연 #${performanceId}`, `Show #${performanceId}`)}
        action={<SettlementStatusBadge status={listSettlementStatus} />}
      >
        <AdminNotice
          tone="warning"
          title={text('정산 상세를 볼 수 없습니다', 'Settlement details are unavailable')}
        >
          {language === 'ko' && adminFailureText(detail.error.code, detail.error.msg)}{' '}
          {text(
            '이의 본문과 처리는 그대로 할 수 있습니다. 팀별 분배액은 참여팀 소속만 조회할 수 있어, 관리자 권한을 명세에 추가해야 합니다.',
            'You can still review and resolve the dispute. Team payouts currently require participant membership; the API specification needs to allow administrators.',
          )}
        </AdminNotice>
      </AdminPanel>
    )
  }

  if (detail.error || !detail.data) {
    return (
      <AdminPanel
        title={text('정산 요약', 'Settlement summary')}
        action={<SettlementStatusBadge status={listSettlementStatus} />}
      >
        <AdminErrorPanel
          title={text('정산 정보를 불러오지 못했습니다', 'Could not load settlement')}
          msg={
            adminFailureText(detail.error?.code, detail.error?.msg) ??
            text('정산 정보를 불러오지 못했습니다.', 'Could not load settlement.')
          }
          onRetry={onRetry}
        />
      </AdminPanel>
    )
  }

  const data = detail.data
  // §0.7 — 익스플로러 URL은 서버가 완성해 준다. 프론트가 해시로 조립하지 않는다
  const releaseTx = data.transactions.find((t) => t.type === 'RELEASE') ?? null

  return (
    <AdminPanel
      title={text('정산 요약', 'Settlement summary')}
      description={text(
        `공연 #${performanceId} · 정산 #${data.settlementId}`,
        `Show #${performanceId} · Settlement #${data.settlementId}`,
      )}
      action={<SettlementStatusBadge status={data.status} />}
    >
      <div className="flex flex-col">
        <AdminRow label={text('분배 대상액', 'Distributable amount')}>
          <Money amount={data.distributableAmount} strong />
        </AdminRow>
        {data.disputeClosesAt && (
          <AdminRow label={text('이의제기 마감', 'Review deadline')}>
            {formatKst(data.disputeClosesAt, undefined, language)}
          </AdminRow>
        )}
        <AdminRow label="release tx">
          {data.releaseTxHash ? (
            // 링크는 `transactions[]`의 RELEASE 항목에 있다. 없으면 해시만 축약해 보여준다
            <TxLink
              value={data.releaseTxHash}
              url={releaseTx?.explorerUrl ?? null}
              label={text('release 트랜잭션', 'Release transaction')}
            />
          ) : (
            text('아직 없음', 'Not available yet')
          )}
        </AdminRow>
      </div>

      {/* ── 팀별 분배액 — PC 표 / 모바일 패널(§5.21) ── */}
      <div className="mt-3">
        <p className="m-0 mb-2 font-sans text-[11px] font-semibold text-muted">
          {text('팀별 분배액', 'Team payouts')}
        </p>

        {/* PC 표. 열 순서: 팀 → 분배액 → 수령 → 수령 주소 */}
        <table className="hidden w-full border-collapse md:table">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 font-sans text-[11px] font-semibold text-muted">
                {text('팀', 'Team')}
              </th>
              <th className="py-2 text-right font-sans text-[11px] font-semibold text-muted">
                {text('분배액', 'Payout')}
              </th>
              <th className="py-2 font-sans text-[11px] font-semibold text-muted">
                {text('수령', 'Receipt')}
              </th>
              <th className="py-2 font-sans text-[11px] font-semibold text-muted">
                {text('수령 주소', 'Payout address')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.shares.map((s) => (
              <tr key={s.teamId} className="border-b border-line last:border-b-0">
                <td className="py-2 font-sans text-[13px] text-ink">{s.teamName}</td>
                <td className="py-2 text-right font-sans text-[13px] text-ink tabular-nums">
                  {formatYoyo(s.totalAmount)}
                </td>
                <td className="py-2 font-sans text-[13px] text-ink">
                  {s.released ? text('수령 완료', 'Received') : text('지급 대기', 'Pending')}
                </td>
                <td className="py-2">
                  <span className="font-mono text-[12px] text-muted" title={s.walletAddress}>
                    {shortenHex(s.walletAddress)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 모바일 패널 — 접었을 때도 열 순서를 바꾸지 않는다(§5.21) */}
        <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
          {data.shares.map((s) => (
            <li key={s.teamId} className="rounded-card border border-line bg-ground px-3 py-2">
              <p className="m-0 font-sans text-[13px] font-semibold text-ink">{s.teamName}</p>
              <AdminRow label={text('분배액', 'Payout')}>{formatYoyo(s.totalAmount)}</AdminRow>
              <AdminRow label={text('수령', 'Receipt')}>
                {s.released ? text('수령 완료', 'Received') : text('지급 대기', 'Pending')}
              </AdminRow>
              <AdminRow label={text('수령 주소', 'Payout address')}>
                <span className="font-mono text-[12px] text-muted">
                  {shortenHex(s.walletAddress)}
                </span>
              </AdminRow>
            </li>
          ))}
        </ul>

        {data.shares.length === 0 && (
          <p className="m-0 font-sans text-[12px] text-muted">
            {text(
              '아직 집계가 확정되지 않아 팀별 분배액이 없습니다.',
              'Team payouts are unavailable until aggregation is confirmed.',
            )}
          </p>
        )}
      </div>
    </AdminPanel>
  )
}
