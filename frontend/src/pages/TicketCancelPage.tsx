/** A-11: server-signed refund; only CONFIRMED means funds have returned. */
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CancelTicket, type RefundQuote } from '@/features/refund/CancelTicket'
import { isApiError, newIdempotencyKey } from '@/shared/api/client'
import type { RefundAccepted } from '@/shared/api/domains/refund'
import { useLocale } from '@/shared/i18n/useLocale'
import { useCancelTicket, useRefundQuote } from '@/shared/queries/refund'
import { useTicketDetail } from '@/shared/queries/ticket'
import { useChainJob } from '@/shared/queries/chain'
import { Button, MobileHeader, PageSkeleton, formatKst } from '@/shared/ui'

const blockedCopy: Record<string, [string, string]> = {
  REFUND_DEADLINE_PASSED: ['취소 기한이 지났어요.', 'Cancellation closed.'],
  REFUND_ALREADY_REQUESTED: [
    '이미 취소를 요청했어요. 티켓과 잔액에서 처리 결과를 확인해 주세요.',
    'Already requested. Check your ticket and balance for the result.',
  ],
  REFUND_AFTER_SETTLEMENT_LOCK: [
    '정산이 시작돼 취소할 수 없어요. 고객센터로 문의해 주세요.',
    'Cancellation unavailable after settlement begins. Please contact support.',
  ],
  PERFORMANCE_INVALID_STATUS: [
    '공연 상태가 바뀌어 취소할 수 없어요.',
    'Cancellation unavailable for this show.',
  ],
  TICKET_ALREADY_USED: [
    '이미 사용한 티켓은 취소할 수 없어요.',
    'A used ticket cannot be cancelled.',
  ],
  TICKET_CANCELED: ['이미 취소된 티켓입니다.', 'This ticket is already cancelled.'],
  TICKET_NOT_OWNED: ['본인의 티켓만 취소할 수 있어요.', 'You can only cancel your own ticket.'],
  COMMON_NOT_FOUND: ['티켓을 찾을 수 없어요.', 'Ticket not found.'],
  WALLET_NOT_FOUND: ['환불을 받을 지갑을 찾을 수 없어요.', 'The refund wallet could not be found.'],
}

export function TicketCancelPage() {
  const { ticketId } = useParams()
  // A route change must not retain the previous ticket's quote, idempotency key or job.
  return <RefundFlow key={ticketId} rawTicketId={ticketId} />
}

function RefundFlow({ rawTicketId }: { rawTicketId?: string }) {
  const navigate = useNavigate()
  const { language, text } = useLocale()
  const parsedId = rawTicketId && /^\d+$/.test(rawTicketId) ? Number(rawTicketId) : undefined
  const ticketId = Number.isSafeInteger(parsedId) && (parsedId ?? 0) > 0 ? parsedId : undefined
  const [accepted, setAccepted] = useState<RefundAccepted | null>(null)
  const [submittedQuote, setSubmittedQuote] = useState<RefundQuote | null>(null)
  const [confirmQuote, setConfirmQuote] = useState<RefundQuote | null>(null)
  const [requestError, setRequestError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const request = useRef<{ amount: number; key: string } | null>(null)
  const quoteQuery = useRefundQuote(ticketId, { enabled: !accepted && !submitting })
  const detail = useTicketDetail(ticketId)
  const cancel = useCancelTicket()
  const chain = useChainJob(accepted?.jobId)
  const back = () => navigate(ticketId ? `/tickets/${ticketId}` : '/tickets')
  const data = quoteQuery.data
  const validQuote =
    data &&
    data.ticketId === ticketId &&
    [data.paidAmount, data.feeRatePercent, data.feeAmount, data.refundAmount].every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
    )
  const quote: RefundQuote | undefined = validQuote
    ? {
        ticketId: String(ticketId),
        showTitle: detail.data?.performanceTitle ?? text('티켓', 'Ticket'),
        dateLabel: detail.data?.startAt ? formatKst(detail.data.startAt, undefined, language) : '—',
        paidAmount: data.paidAmount!,
        feeRate: data.feeRatePercent! / 100,
        feeAmount: data.feeAmount!,
        refundAmount: data.refundAmount!,
        refundApproxLabel:
          data.display?.approx != null
            ? `${data.display.currency} ${data.display.approx.toFixed(2)}`
            : undefined,
        bracketLabel:
          data.feeStage === 'D-7_BEFORE'
            ? text(
                '공연 7일 전까지는 전액 환불돼요.',
                'A full refund applies until 7 days before the show.',
              )
            : data.feeStage === 'D-3_BEFORE'
              ? text(
                  '공연 7일 전~3일 전 구간이라 50%가 환불돼요.',
                  'A 50% refund applies 7 to 3 days before the show.',
                )
              : text(
                  '서버에서 확인한 환불 금액입니다.',
                  'This refund estimate was calculated by the server.',
                ),
      }
    : undefined
  const activeQuote = submittedQuote ?? quote
  const error = requestError ?? quoteQuery.error
  const code = isApiError(error) ? error.code : undefined
  const blocked = code ? blockedCopy[code] : undefined

  async function submit() {
    if (!confirmQuote || !ticketId || !request.current || submittingRef.current || accepted) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmittedQuote(confirmQuote)
    setConfirmQuote(null)
    setRequestError(null)
    try {
      const result = await cancel.mutateAsync({
        ticketId,
        expectedRefundAmount: request.current.amount,
        idempotencyKey: request.current.key,
      })
      if (!result.jobId) throw new Error('Missing refund job')
      setAccepted(result)
    } catch (failure) {
      setRequestError(failure)
      setSubmittedQuote(null)
      if (isApiError(failure) && failure.code === 'COMMON_VALIDATION_FAILED') {
        request.current = null
        await quoteQuery.refetch()
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (
    ticketId === undefined ||
    (!accepted &&
      !submitting &&
      (blocked || quoteQuery.isError || (!quoteQuery.isLoading && !quote)))
  ) {
    return (
      <>
        <MobileHeader title={text('취소·환불', 'Cancel ticket')} backTo="/tickets" />
        <main className="mx-auto max-w-xl p-6">
          <p role="alert">
            {ticketId === undefined
              ? text('잘못된 티켓 번호입니다.', 'Invalid ticket.')
              : blocked
                ? text(...blocked)
                : text('환불 정보를 불러오지 못했습니다.', 'Could not load the refund quote.')}
          </p>
          {!blocked && ticketId && (
            <Button
              onClick={() => {
                void quoteQuery.refetch()
              }}
            >
              {text('다시 시도', 'Retry')}
            </Button>
          )}
          <Button variant="secondary" onClick={back}>
            {text('티켓으로', 'Back to ticket')}
          </Button>
        </main>
      </>
    )
  }
  if (!activeQuote) return <PageSkeleton />

  const chainIssue =
    accepted && !chain.isConfirmed && (chain.isFailed || chain.timedOut || chain.isError)
  return (
    <>
      {chainIssue && (
        <section role="alert" className="mx-auto max-w-xl p-6">
          <p>
            {chain.isFailed
              ? text(
                  '환불에 실패했습니다. 금액을 다시 확인한 뒤 요청해 주세요.',
                  'Refund failed. Review the quote before requesting again.',
                )
              : chain.timedOut
                ? text(
                    '환불 확인이 지연되고 있어요. 취소를 다시 요청하지 않고 처리 상태를 확인합니다.',
                    'Refund confirmation is taking longer. Check the existing request status.',
                  )
                : text('환불 상태를 확인하지 못했습니다.', 'Could not check the refund status.')}
          </p>
          {chain.isFailed ? (
            <Button
              onClick={() => {
                request.current = null
                setAccepted(null)
                setSubmittedQuote(null)
                setRequestError(null)
                void quoteQuery.refetch()
              }}
            >
              {text('환불 금액 다시 확인', 'Review refund quote')}
            </Button>
          ) : (
            <Button
              onClick={() => {
                void chain.refetch()
              }}
            >
              {text('상태 확인', 'Check status')}
            </Button>
          )}
        </section>
      )}
      {!accepted && !submitting && requestError != null && !blocked && (
        <p role="alert" className="mx-auto max-w-xl p-6">
          {code === 'COMMON_VALIDATION_FAILED'
            ? text(
                '환불 금액을 다시 불러왔어요. 금액을 확인하고 다시 요청해 주세요.',
                'The refund quote was refreshed. Review the amount and confirm again.',
              )
            : text(
                '취소 요청을 확인하지 못했습니다. 다시 시도해 주세요.',
                'Could not confirm the cancellation request. Please try again.',
              )}
        </p>
      )}
      <CancelTicket
        quote={activeQuote}
        preview={false}
        phase={
          accepted && chain.isConfirmed
            ? 'done'
            : chainIssue
              ? chain.isFailed
                ? 'failed'
                : 'delayed'
              : accepted || submitting
                ? 'processing'
                : 'quote'
        }
        confirmOpen={confirmQuote !== null}
        onCloseConfirm={() => setConfirmQuote(null)}
        onAskConfirm={() => {
          if (!quote || submittingRef.current || accepted) return
          if (!request.current || request.current.amount !== quote.refundAmount)
            request.current = { amount: quote.refundAmount, key: newIdempotencyKey() }
          setConfirmQuote(quote)
        }}
        confirmationAmount={confirmQuote?.refundAmount}
        onConfirm={() => {
          void submit()
        }}
        onGoBalance={() => navigate('/wallet')}
        onBack={back}
      />
    </>
  )
}

export default TicketCancelPage
