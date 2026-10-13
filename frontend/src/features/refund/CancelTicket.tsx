/** A-11 presentation. Live orchestration belongs to TicketCancelPage; labs keep preview copy. */
import { Button, ConfirmDialog, MobileHeader, Spinner, formatYoyo } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import './cancel-ticket.css'

export type RefundPhase = 'quote' | 'processing' | 'done' | 'blocked' | 'failed' | 'delayed'

export interface RefundQuote {
  ticketId: string
  showTitle: string
  dateLabel: string
  paidAmount: number
  feeRate: number
  feeAmount: number
  refundAmount: number
  refundApproxLabel?: string
  bracketLabel: string
}

export type BlockedReason =
  | 'REFUND_DEADLINE_PASSED'
  | 'REFUND_ALREADY_REQUESTED'
  | 'REFUND_AFTER_SETTLEMENT_LOCK'
  | 'PERFORMANCE_INVALID_STATUS'

const BLOCKED_TEXT: Record<BlockedReason, { title: [string, string]; body: [string, string] }> = {
  REFUND_DEADLINE_PASSED: {
    title: ['취소 기한이 지났어요', 'Cancellation closed'],
    body: [
      '취소는 공연 3일 전(D-3) 00:00까지만 할 수 있어요. 티켓은 그대로 사용할 수 있습니다.',
      'Cancellation closes at 00:00 KST, three days before the show. Your ticket is still valid for entry.',
    ],
  },
  REFUND_ALREADY_REQUESTED: {
    title: ['이미 취소를 요청했어요', 'Already requested'],
    body: [
      '처리 결과는 잔액 화면에서 확인할 수 있어요.',
      'You can check the result on the balance screen.',
    ],
  },
  REFUND_AFTER_SETTLEMENT_LOCK: {
    title: ['정산이 시작돼 취소할 수 없어요', 'Cancellation unavailable after settlement begins'],
    body: [
      '공연 정산이 잠긴 뒤에는 자동 취소가 불가능해요. 고객센터로 문의해 주세요.',
      'Automatic cancellation is unavailable once settlement is locked. Please contact support.',
    ],
  },
  PERFORMANCE_INVALID_STATUS: {
    title: ['지금은 취소할 수 없어요', 'Cancellation unavailable'],
    body: [
      '공연 상태가 바뀌었어요. 잠시 후 다시 시도하거나 고객센터로 문의해 주세요.',
      'The show status has changed. Please try again later or contact support.',
    ],
  },
}

interface Props {
  quote: RefundQuote
  phase: RefundPhase
  preview?: boolean
  confirmationAmount?: number
  blockedReason?: BlockedReason
  confirmOpen: boolean
  onAskConfirm: () => void
  onCloseConfirm: () => void
  onConfirm: () => void
  onGoBalance: () => void
  onBack: () => void
}

export function CancelTicket({
  quote,
  phase,
  preview = true,
  confirmationAmount,
  blockedReason,
  confirmOpen,
  onAskConfirm,
  onCloseConfirm,
  onConfirm,
  onGoBalance,
  onBack,
}: Props) {
  const { text } = useLocale()
  const blockedCopy = BLOCKED_TEXT[blockedReason ?? 'PERFORMANCE_INVALID_STATUS']
  const brackets = [
    [text('공연 7일 전까지', 'Until 7 days before'), text('전액 환불', 'Full refund')],
    [text('공연 7일 전~3일 전', '7 to 3 days before'), text('50% 환불', '50% refund')],
    [
      text('공연 3일 전 00:00 이후', 'After 00:00 KST, 3 days before'),
      text('취소 불가', 'No cancellation'),
    ],
  ]

  return (
    <div className="cancel-ticket min-h-dvh">
      <MobileHeader
        title={text('취소·환불', 'Cancel ticket')}
        backTo={`/tickets/${quote.ticketId}`}
      />
      <main className="cancel-main">
        <header className="cancel-heading">
          <p className="cancel-eyebrow">{text('티켓 관리', 'Manage your ticket')}</p>
          <h1>{text('취소·환불', 'Cancel ticket')}</h1>
          <p>
            {text('티켓과 환불 예정액을 확인하세요.', 'Review your ticket and refund estimate.')}
          </p>
        </header>
        {preview && (
          <p className="cancel-preview-note">
            {text(
              '샘플 티켓으로 진행하는 미리보기입니다. 실제 티켓이나 잔액은 변경되지 않아요.',
              'Sample ticket preview. No ticket or balance will change.',
            )}
          </p>
        )}

        <article className="cancel-context">
          <span className="cancel-context-icon" aria-hidden>
            ↗
          </span>
          <div className="min-w-0">
            <p className="cancel-eyebrow">
              {text('선택한 티켓', 'Selected ticket')}{' '}
              <span className="font-mono">{quote.ticketId}</span>
            </p>
            <h2>{quote.showTitle}</h2>
            <p className="cancel-context-date">{quote.dateLabel}</p>
          </div>
        </article>

        <div className="cancel-review-layout">
          <div className="cancel-primary-panel">
            {phase === 'blocked' ? (
              <section className="cancel-phase cancel-blocked" role="alert">
                <span className="cancel-phase-symbol" aria-hidden>
                  !
                </span>
                <h2>{text(...blockedCopy.title)}</h2>
                <p>{text(...blockedCopy.body)}</p>
              </section>
            ) : phase === 'failed' || phase === 'delayed' ? (
              <section className="cancel-phase" role="status">
                <h2>
                  {phase === 'failed'
                    ? text('환불 실패', 'Refund unsuccessful')
                    : text('환불 확인 필요', 'Refund confirmation pending')}
                </h2>
                <p>
                  {text(
                    '위 안내에 따라 처리 상태를 확인해 주세요.',
                    'Follow the instructions above to check the result.',
                  )}
                </p>
              </section>
            ) : phase === 'done' ? (
              <section className="cancel-phase" role="status">
                <span className="cancel-phase-symbol" aria-hidden>
                  ✓
                </span>
                <h2>
                  {preview
                    ? text('미리보기를 마쳤어요', 'Preview complete')
                    : text('지갑으로 환불되었어요.', 'Refunded to your wallet.')}
                </h2>
                <p>
                  {preview
                    ? text(
                        '아래 금액은 샘플 환불액입니다. 실제 환불은 처리되지 않았어요.',
                        'This is a sample refund amount. No actual refund has been processed.',
                      )
                    : text(
                        '환불 금액을 다음 예매에 사용할 수 있어요.',
                        'You can use the refund for your next booking.',
                      )}
                </p>
                <strong className="cancel-result-amount">{formatYoyo(quote.refundAmount)}</strong>
              </section>
            ) : phase === 'processing' ? (
              <section className="cancel-phase" role="status" aria-live="polite" aria-busy="true">
                <Spinner size={36} />
                <h2>
                  {preview
                    ? text('취소 미리보기 진행 중', 'Cancellation preview in progress')
                    : text('환불 처리 중', 'Processing refund…')}
                </h2>
                <p>
                  {preview
                    ? text(
                        '예시 처리 과정을 보여드리고 있어요.',
                        'Showing the sample cancellation flow.',
                      )
                    : text(
                        '취소 요청이 처리되고 있어요. 완료 여부를 확인하고 있습니다.',
                        'Your cancellation is being processed. Waiting for confirmation.',
                      )}
                </p>
              </section>
            ) : (
              <section
                aria-label={text('환불 금액 계산', 'Refund calculation')}
                className="cancel-calculation"
              >
                <h2>{text('환불 금액 계산', 'Refund calculation')}</h2>
                <dl>
                  <div className="cancel-money-row">
                    <dt>{text('결제 금액', 'Paid')}</dt>
                    <dd>{formatYoyo(quote.paidAmount)}</dd>
                  </div>
                  <div className="cancel-money-row">
                    <dt>
                      {text('수수료', 'Fee')} ({Math.round(quote.feeRate * 100)}%)
                    </dt>
                    <dd>−{formatYoyo(quote.feeAmount)}</dd>
                  </div>
                  <div className="cancel-money-row cancel-money-total">
                    <dt>{text('환불 예정액', 'Refund estimate')}</dt>
                    <dd>
                      {formatYoyo(quote.refundAmount)}
                      {quote.refundApproxLabel && <small>≈ {quote.refundApproxLabel}</small>}
                    </dd>
                  </div>
                </dl>
                <p className="cancel-bracket">{quote.bracketLabel}</p>
              </section>
            )}

            <div
              className="cancel-actions"
              role="group"
              aria-label={text('취소 작업', 'Cancellation actions')}
            >
              {phase === 'quote' ? (
                <>
                  <p>
                    {text(
                      '다음 단계에서 취소 내용을 한 번 더 확인합니다.',
                      'You will review the cancellation once more in the next step.',
                    )}
                  </p>
                  <Button variant="danger" full onClick={onAskConfirm}>
                    {text('취소 내용 확인', 'Review cancellation')}
                  </Button>
                </>
              ) : phase === 'processing' ? (
                <Button full disabled>
                  {preview
                    ? text('미리보기 진행 중…', 'Preview in progress…')
                    : text('처리 중…', 'Processing…')}
                </Button>
              ) : phase === 'done' ? (
                <div className="cancel-done-actions">
                  <Button full onClick={onGoBalance}>
                    {text('잔액 보기', 'View balance')}
                  </Button>
                  <Button variant="secondary" full onClick={onBack}>
                    {text('티켓으로', 'Back to ticket')}
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" full onClick={onBack}>
                  {text('티켓으로', 'Back to ticket')}
                </Button>
              )}
            </div>
          </div>

          <section aria-label={text('취소 정책', 'Cancellation policy')} className="cancel-policy">
            <p className="cancel-eyebrow">{text('확인해 주세요', 'Before you continue')}</p>
            <h2>{text('취소 정책', 'Cancellation policy')}</h2>
            <dl>
              {brackets.map(([label, rate]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{rate}</dd>
                </div>
              ))}
            </dl>
            <p className="cancel-policy-note">
              {text(
                '환불 금액은 지갑으로 돌아오며 다음 예매에 사용할 수 있어요.',
                'Refunds return to your wallet and can be used for your next booking.',
              )}
            </p>
            <p className="cancel-policy-warning">
              {text(
                '실제 취소가 완료된 티켓은 되돌릴 수 없어요.',
                'An actual completed ticket cancellation cannot be reversed.',
              )}
            </p>
          </section>
        </div>
      </main>

      <ConfirmDialog
        open={confirmOpen}
        title={
          preview
            ? text('취소 미리보기를 진행할까요?', 'Continue with the cancellation preview?')
            : text('티켓을 취소할까요?', 'Cancel this ticket?')
        }
        body={
          <>
            <p>
              {preview
                ? text(
                    `샘플 환불 예정액은 ${formatYoyo(quote.refundAmount)}입니다.`,
                    `The sample refund estimate is ${formatYoyo(quote.refundAmount)}.`,
                  )
                : text(
                    `환불 예정액 ${formatYoyo(confirmationAmount ?? quote.refundAmount)}를 지갑으로 돌려받고 취소할까요?`,
                    `Cancel and get ${formatYoyo(confirmationAmount ?? quote.refundAmount)} back to your wallet?`,
                  )}
            </p>
            <p>
              {preview
                ? text('실제 티켓이나 잔액은 변경되지 않아요.', 'No ticket or balance will change.')
                : text(
                    '취소가 완료된 티켓은 되돌릴 수 없어요.',
                    'A completed cancellation cannot be reversed.',
                  )}
            </p>
          </>
        }
        confirmLabel={
          preview
            ? text('취소 미리보기', 'Preview cancellation')
            : text('티켓 취소', 'Cancel ticket')
        }
        cancelLabel={text('유지하기', 'Keep ticket')}
        confirmVariant="danger"
        onConfirm={onConfirm}
        onClose={onCloseConfirm}
      />
    </div>
  )
}
