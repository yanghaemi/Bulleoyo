/**
 * A-05: D-10/L-10/L-10B composition adapted to the existing YoYo contract.
 * API-payment-01/02/03 and confirmation remain page-owned.
 * APPROVE confirmation is not PURCHASE confirmation. Never infer final success.
 */
import { useId } from 'react'
import {
  BOOKING_STEPS,
  Button,
  FixedBottom,
  MobileHeader,
  OperationOverlay,
  Poster,
  Stepper,
  formatYoyo,
} from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import './payment-editorial.css'

export type PaymentState =
  | { kind: 'review' }
  | { kind: 'insufficient'; shortfall: number | null; message?: string }
  | { kind: 'signing'; index: number; total: number }
  | { kind: 'confirming' }
  | { kind: 'failed'; message?: string }
  /**
   * [2026-09-24] 결제 전 본인 확인(API v7 §7.W). payment-01·02의 `stepUpRequired`가 true일 때만
   * 서명 직전에 들어온다. `loading` 옵션 준비 · `register` 첫 기기 등록 · `verify` 본인 확인 ·
   * `working` 기기 인증 창이 열려 있음 · `unsupported` 이 기기에 내장 인증기가 없음.
   */
  | {
      kind: 'stepUp'
      mode: 'loading' | 'register' | 'verify' | 'working' | 'unsupported'
      message?: string
    }

export interface PaymentView {
  performanceId?: string
  showTitle: string
  dateLabel: string
  venue: string
  posterImageUrl?: string | null
  ticketTypeName: string
  quantity: number
  teamName: string
  totalAmount: number
  totalApprox?: string
  walletBalance: number | null
  teamAllocations?: { teamName: string; quantity: number; amount: number; paid?: boolean }[]
  paidQuantity?: number
}
interface Props {
  data: PaymentView
  state: PaymentState
  onPay: () => void
  onRetry: () => void
  /** 잔액 보기 — §5.16 잔액 부족과 결제 실패 복구에서 A-13으로 이동한다. */
  onViewBalance: () => void
  onBackToShow?: () => void
  onBackHome?: () => void
  /**
   * 지갑 SDK가 서명을 받을 준비가 됐는가(`useWalletReady`). `false`면 결제 버튼을 잠그고
   * 준비 중 문구를 보인다 — 로그인 화면(C-01)·P-03·P-06과 같은 게이트다(D-73·D-77). 기본 준비됨.
   */
  walletReady?: boolean
  /** [2026-09-24] 본인 확인 버튼. 클릭 핸들러 안에서 곧바로 기기 인증 창을 연다(사용자 활성화). */
  onStepUp?: () => void
}

export function PaymentScreen({
  data,
  state,
  onPay,
  onRetry,
  onViewBalance,
  onBackToShow,
  onBackHome,
  walletReady = true,
  onStepUp,
}: Props) {
  const { text } = useLocale()
  const ticketHeadingId = useId()
  const paymentHeadingId = useId()
  const processing = state.kind === 'signing' || state.kind === 'confirming'
  const remaining = data.walletBalance == null ? null : data.walletBalance - data.totalAmount
  const payLabel = text(
    formatYoyo(data.totalAmount) + ' 결제하기',
    'Pay ' + formatYoyo(data.totalAmount) + ' from balance',
  )
  /**
   * 지갑 준비 게이트 안내(D-77 · §5.14). 로그인·P-03·P-06과 **같은 문구**를 쓴다 — 같은
   * 기다림이라 사용자가 어느 화면에서나 같은 말을 들어야 한다.
   *
   * 결제 버튼이 데스크톱(`__desktop-action`)과 모바일(`FixedBottom`)에 따로 있고 서로 CSS로
   * 숨겨진다. 한쪽에만 달면 **반대쪽 사용자는 버튼이 왜 잠겼는지 못 듣는다** — 결제는 모바일
   * 비중이 높아 그쪽이 더 아프다. 그래서 한 벌로 만들어 두 자리에 건다.
   */
  const walletPreparingNotice = walletReady ? null : (
    <p
      role="status"
      aria-live="polite"
      className="m-0 font-sans text-[13px] font-semibold text-muted"
    >
      {text('지갑을 준비하고 있어요…', 'Preparing your wallet…')}
    </p>
  )
  const stepUpAction =
    state.kind === 'stepUp' && (state.mode === 'register' || state.mode === 'verify') ? (
      <Button full onClick={onStepUp}>
        {state.mode === 'register'
          ? text('이 기기 등록', 'Register this device')
          : text('본인 확인', 'Verify it’s you')}
      </Button>
    ) : null
  const operationLabel =
    state.kind === 'signing'
      ? text('지갑에서 확인해 주세요', 'Confirm in your wallet') +
        ' (' +
        state.index +
        '/' +
        state.total +
        ')'
      : text('요청을 확인하고 있어요', 'Confirming your request')

  return (
    <div className="payment-editorial min-h-dvh">
      <div inert={processing || undefined} aria-hidden={processing || undefined}>
        <MobileHeader title={text('결제', 'Payment')} />
        <main className="payment-editorial__shell">
          <header className="payment-editorial__heading">
            <div>
              <h1>{text('주문 확인 및 결제', 'Review and pay')}</h1>
              <p>
                {text(
                  '공연·수량·결제 금액을 확인해 주세요.',
                  'Check the show, quantity and total before paying.',
                )}
              </p>
            </div>
            <div className="payment-editorial__steps">
              <Stepper steps={BOOKING_STEPS} active={state.kind === 'review' ? 2 : 3} />
            </div>
          </header>
          <div className="payment-editorial__grid">
            <section className="payment-editorial__order" aria-labelledby={ticketHeadingId}>
              <div className="payment-editorial__section-label">
                <h2 id={ticketHeadingId}>{text('주문 내역', 'Order details')}</h2>
              </div>
              <div className="payment-editorial__show">
                <div className="payment-editorial__poster">
                  <Poster
                    src={data.posterImageUrl}
                    seed={data.performanceId}
                    label={data.showTitle}
                    alt=""
                    ratio="3/4"
                  />
                </div>
                <div>
                  <h3>{data.showTitle}</h3>
                  <p>{data.dateLabel}</p>
                  <p>{data.venue}</p>
                </div>
              </div>
              <dl className="payment-editorial__details">
                <div>
                  <dt>{text('티켓', 'Ticket')}</dt>
                  <dd>
                    {data.ticketTypeName} × {data.quantity}
                  </dd>
                </div>
                <div>
                  <dt>{text('응원 팀', 'Team')}</dt>
                  <dd>{data.teamName}</dd>
                </div>
              </dl>
              {data.teamAllocations && data.teamAllocations.length > 1 && (
                <ul aria-label={text('팀별 결제 금액', 'Payment by team')}>
                  {data.teamAllocations.map((team, index) => (
                    <li key={`${team.teamName}-${index}`}>
                      {team.teamName} × {team.quantity} · {formatYoyo(team.amount)}
                      {team.paid ? ` · ${text('결제 완료', 'Paid')}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {Boolean(data.paidQuantity) && data.paidQuantity! < data.quantity && (
                <p role="status">{text(
                  `${data.quantity}장 중 ${data.paidQuantity}장 결제됨 — 남은 티켓은 다시 시도하거나 주문 만료 후 자동 취소됩니다. 결제된 티켓은 유지됩니다.`,
                  `${data.paidQuantity} of ${data.quantity} tickets paid. Retry the remaining tickets before expiry. Confirmed tickets are kept.`,
                )}</p>
              )}
              <div className="payment-editorial__total">
                <span>
                  {data.paidQuantity
                    ? text('남은 결제 금액', 'Remaining amount')
                    : text('총 결제 금액', 'Total amount')}
                </span>
                <div>
                  <strong>{formatYoyo(data.totalAmount)}</strong>
                  {data.totalApprox && <small>≈ {data.totalApprox}</small>}
                </div>
              </div>
            </section>
            <section className="payment-editorial__payment" aria-labelledby={paymentHeadingId}>
              <div className="payment-editorial__section-label">
                <h2 id={paymentHeadingId}>{text('결제 수단', 'Payment method')}</h2>
              </div>
              <div className="payment-editorial__wallet">
                <div className="payment-editorial__wallet-top">
                  <span>{text('내 지갑', 'My wallet')}</span>
                </div>
                <span className="payment-editorial__wallet-label">
                  {text('사용 가능한 잔액', 'Available balance')}
                </span>
                <strong>{data.walletBalance == null ? '—' : formatYoyo(data.walletBalance)}</strong>
              </div>
              <dl className="payment-editorial__balance">
                <div>
                  <dt>{text('결제 금액', 'Payment')}</dt>
                  <dd>{formatYoyo(data.totalAmount)}</dd>
                </div>
                <div>
                  <dt>
                    {remaining != null && remaining < 0
                      ? text('부족 금액', 'Shortfall')
                      : text('결제 후 잔액', 'After payment')}
                  </dt>
                  <dd className={remaining != null && remaining < 0 ? 'text-danger' : ''}>
                    {remaining == null ? '—' : formatYoyo(Math.abs(remaining))}
                  </dd>
                </div>
              </dl>
              {state.kind === 'insufficient' && (
                <div className="payment-editorial__error" role="alert">
                  <h3>{text('잔액이 부족해요', 'Insufficient balance')}</h3>
                  <p>
                    {text('추가로 필요한 금액', 'Shortfall')}:{' '}
                    {state.shortfall == null
                      ? (state.message ??
                        text(
                          '부족한 금액을 확인할 수 없습니다.',
                          'The shortfall amount is unavailable.',
                        ))
                      : formatYoyo(state.shortfall)}
                  </p>
                </div>
              )}
              {state.kind === 'failed' && (
                <div className="payment-editorial__error" role="alert">
                  <h3>{text('결제를 완료하지 못했어요', 'Payment failed')}</h3>
                  <p>{state.message ?? text('잠시 후 다시 시도해 주세요.', 'Please try again.')}</p>
                </div>
              )}
              {state.kind === 'stepUp' && (
                <div
                  className="payment-editorial__error"
                  role="region"
                  aria-label={text('본인 확인', 'Verify it’s you')}
                >
                  <h3>{text('본인 확인', 'Verify it’s you')}</h3>
                  <p>
                    {state.mode === 'unsupported'
                      ? text(
                          '이 기기는 본인 확인을 지원하지 않습니다.',
                          'This device doesn’t support identity verification.',
                        )
                      : state.mode === 'register'
                        ? text(
                            '처음 한 번 이 기기를 등록한 뒤 지문 또는 얼굴로 확인해 주세요.',
                            'Register this device once, then verify with your fingerprint or face.',
                          )
                        : text(
                            '지문 또는 얼굴로 확인해 주세요.',
                            'Verify it’s you with your fingerprint or face.',
                          )}
                  </p>
                  {state.message && <p role="alert">{state.message}</p>}
                  {(state.mode === 'loading' || state.mode === 'working') && (
                    <p role="status" aria-live="polite">
                      {state.mode === 'working'
                        ? text('기기에서 확인해 주세요…', 'Confirm on your device…')
                        : text('본인 확인을 준비하고 있어요…', 'Preparing verification…')}
                    </p>
                  )}
                </div>
              )}
              {stepUpAction && (
                <div className="payment-editorial__desktop-action">{stepUpAction}</div>
              )}
              {state.kind === 'stepUp' && state.mode === 'unsupported' && (
                <div className="payment-editorial__actions">
                  {onBackToShow && (
                    <Button full variant="secondary" onClick={onBackToShow}>
                      {text('공연으로 돌아가기', 'Back to show')}
                    </Button>
                  )}
                  {!onBackToShow && onBackHome && (
                    <Button full variant="secondary" onClick={onBackHome}>
                      {text('홈으로 돌아가기', 'Back to home')}
                    </Button>
                  )}
                </div>
              )}
              {state.kind === 'review' && (
                <div className="payment-editorial__desktop-action">
                  <Button full onClick={onPay} disabled={!walletReady}>
                    {payLabel}
                  </Button>
                  {walletPreparingNotice}
                </div>
              )}
              {state.kind === 'insufficient' && (
                <div className="payment-editorial__desktop-action payment-editorial__actions">
                  <Button full onClick={onRetry}>
                    {text('다시 확인', 'Retry')}
                  </Button>
                  <Button full variant="secondary" onClick={onViewBalance}>
                    {text('잔액 보기', 'View balance')}
                  </Button>
                </div>
              )}
              {state.kind === 'failed' && (
                <div className="payment-editorial__actions">
                  <Button full onClick={onRetry}>
                    {text('다시 시도', 'Try again')}
                  </Button>
                  <Button full variant="secondary" onClick={onViewBalance}>
                    {text('잔액 보기', 'View balance')}
                  </Button>
                  {onBackToShow && (
                    <Button full variant="secondary" onClick={onBackToShow}>
                      {text('공연으로 돌아가기', 'Back to show')}
                    </Button>
                  )}
                  {!onBackToShow && onBackHome && (
                    <Button full variant="secondary" onClick={onBackHome}>
                      {text('홈으로 돌아가기', 'Back to home')}
                    </Button>
                  )}
                </div>
              )}
              <p className="payment-editorial__footnote">
                {text(
                  '결제 요청 후 지갑 창에서 확인이 필요할 수 있어요.',
                  'Your wallet may ask you to confirm the payment.',
                )}
              </p>
            </section>
          </div>
        </main>
        {state.kind === 'review' && (
          <FixedBottom>
            {walletPreparingNotice}
            <Button full onClick={onPay} disabled={!walletReady}>
              {payLabel}
            </Button>
          </FixedBottom>
        )}
        {stepUpAction && <FixedBottom>{stepUpAction}</FixedBottom>}
        {state.kind === 'insufficient' && (
          <FixedBottom>
            <div className="payment-editorial__actions">
              <Button full onClick={onRetry}>
                {text('다시 확인', 'Retry')}
              </Button>
              <Button full variant="secondary" onClick={onViewBalance}>
                {text('잔액 보기', 'View balance')}
              </Button>
            </div>
          </FixedBottom>
        )}
      </div>
      {processing && (
        <OperationOverlay
          label={operationLabel}
          description={
            state.kind === 'signing'
              ? text(
                  '열린 지갑 창에서 요청 내용을 확인해 주세요.',
                  'Review the request in your wallet window.',
                )
              : text(
                  '처리가 끝나면 다음 단계로 이동합니다. 지갑에서 추가 확인이 필요할 수 있어요.',
                  'You’ll move to the next step when this request is confirmed. Your wallet may ask for another confirmation.',
                )
          }
        />
      )}
    </div>
  )
}
