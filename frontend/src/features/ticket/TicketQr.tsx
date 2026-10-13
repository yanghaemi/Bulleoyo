import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '@/shared/i18n/useLocale'
import { Modal } from '@/shared/ui/Modal'
import './TicketQr.css'

interface Props {
  qrToken?: string
  issuedAt?: string
  expiresAt?: string
  rotateAfterMs?: number
  loadFailed?: boolean
  /** Manual retry only; useTicketQr owns automatic refetching. */
  onRotate: () => void
}
interface QrImage {
  token: string
  src: string
}
function formatRemaining(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
export function TicketQr({
  qrToken,
  issuedAt,
  expiresAt,
  rotateAfterMs = 30_000,
  loadFailed = false,
  onRotate,
}: Props) {
  const { text } = useLocale()
  // Fix the fallback lifetime to token receipt, never to callback identity or opening the dialog.
  const [lifetime, setLifetime] = useState(() => ({
    token: qrToken,
    receivedAt: Date.now(),
    duration: rotateAfterMs,
  }))
  if (lifetime.token !== qrToken)
    setLifetime({ token: qrToken, receivedAt: Date.now(), duration: rotateAfterMs })
  const parsedIssued = issuedAt ? Date.parse(issuedAt) : NaN
  const parsedExpiry = expiresAt ? Date.parse(expiresAt) : NaN
  const deadline = Number.isFinite(parsedExpiry)
    ? parsedExpiry
    : (Number.isFinite(parsedIssued) ? parsedIssued : lifetime.receivedAt) + lifetime.duration
  const [, tick] = useState(0)
  const now = Date.now()
  const remaining = Math.max(0, deadline - now)
  const expired = !!qrToken && remaining === 0
  const [image, setImage] = useState<QrImage | null>(null)
  const [failedToken, setFailedToken] = useState<string>()
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let timer: number
    const update = () => {
      const left = deadline - Date.now()
      tick((value) => value + 1)
      if (left > 0) timer = window.setTimeout(update, Math.min(1000, left))
    }
    timer = window.setTimeout(update, Math.min(1000, Math.max(0, deadline - Date.now())))
    return () => window.clearTimeout(timer)
  }, [deadline])

  useEffect(() => {
    if (!qrToken) return
    let alive = true
    void (async () => {
      try {
        const { toString } = await import('qrcode')
        const svg = await toString(qrToken, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 })
        if (alive) {
          setImage({ token: qrToken, src: `data:image/svg+xml,${encodeURIComponent(svg)}` })
          setFailedToken(undefined)
        }
      } catch {
        if (alive) setFailedToken(qrToken)
      }
    })()
    return () => {
      alive = false
    }
  }, [qrToken, attempt])

  const failed = !!qrToken && failedToken === qrToken
  const src =
    image?.token === qrToken && !expired && !failed && !loadFailed ? image?.src : undefined
  const message = loadFailed
    ? text('QR을 갱신하지 못했습니다. 다시 시도해 주세요.', 'Could not refresh QR. Try again.')
    : expired
      ? text('QR 코드가 만료되었습니다', 'QR code expired')
      : failed
        ? text('QR 코드를 만들지 못했습니다', 'Could not create QR code')
        : text('QR 코드를 불러오는 중', 'Loading QR code')
  const retry = () => {
    setAttempt((value) => value + 1)
    onRotate()
  }
  const unavailable = (
    <span className="ticket-qr__unavailable" role="img" aria-label={message}>
      {message}
    </span>
  )
  return (
    <span className="ticket-qr" data-testid="ticket-qr">
      <button
        className="ticket-qr__trigger"
        type="button"
        aria-label={text('QR 코드 확대', 'Enlarge QR code')}
        onClick={() => setOpen(true)}
      >
        {src ? <img src={src} alt={text('입장용 QR 코드', 'Entry QR code')} /> : unavailable}
        <span>{text('확대 보기', 'Enlarge')}</span>
      </button>
      <span className="ticket-qr__countdown">
        <span>{text('QR 유효 시간', 'QR valid for')}</span>
        <span aria-live="off">{formatRemaining(remaining)}</span>
      </span>
      {(loadFailed || expired || failed || !qrToken) && (
        <button type="button" className="ticket-qr__retry" onClick={retry}>
          {text('다시 시도', 'Try again')}
        </button>
      )}
      {createPortal(
        <Modal
          open={open}
          title={text('입장용 QR 코드', 'Entry QR code')}
          description={text(
            '입장 시 화면 밝기를 최대로 유지하세요.',
            'Keep screen brightness at maximum.',
          )}
          onClose={() => setOpen(false)}
        >
          <div className="ticket-qr__enlarged">
            {src ? <img src={src} alt={text('입장용 QR 코드', 'Entry QR code')} /> : unavailable}
            <p aria-live="polite">
              {src
                ? text('입구에서 이 QR을 보여주세요.', 'Show this QR code at the entrance.')
                : message}
            </p>
            <span aria-live="off">{formatRemaining(remaining)}</span>
            {!src && (
              <button type="button" className="ticket-qr__retry" onClick={retry}>
                {text('다시 시도', 'Try again')}
              </button>
            )}
          </div>
        </Modal>,
        document.body,
      )}
    </span>
  )
}
