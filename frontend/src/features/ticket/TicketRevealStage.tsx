import { useEffect, useState, type AnimationEvent, type ReactNode } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'

import { TICKET_TIMING } from '@/shared/motion/motionTokens'
import './TicketRevealStage.css'

type RevealState = 'printing' | 'settling' | 'complete' | 'fallback' | 'reduced'

interface Props {
  children: ReactNode
  /** Development and Design Tools Lab static preview only. */
  forceFallback?: boolean
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function reducedMotionRequested() {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(reducedMotionRequested)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const sync = () => setReduced(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return reduced
}

export function TicketRevealStage({ children, forceFallback = false }: Props) {
  const { text } = useLocale()
  const forceStaticFallback = import.meta.env.DEV && forceFallback
  const reducedMotion = usePrefersReducedMotion()
  const [replayKey, setReplayKey] = useState(0)
  const [state, setState] = useState<RevealState>(() => {
    if (forceStaticFallback) return 'fallback'
    return reducedMotionRequested() ? 'reduced' : 'printing'
  })

  useEffect(() => {
    if (forceStaticFallback) {
      setState('fallback')
      return
    }

    if (reducedMotion) {
      setState('reduced')
      return
    }

    setState('printing')
    const printTimer = window.setTimeout(() => setState('settling'), TICKET_TIMING.printMs)
    const completionTimer = window.setTimeout(() => setState('complete'), TICKET_TIMING.totalMs)
    return () => {
      window.clearTimeout(printTimer)
      window.clearTimeout(completionTimer)
    }
  }, [forceStaticFallback, reducedMotion, replayKey])

  const replay = () => {
    if (reducedMotion || forceStaticFallback) return
    setReplayKey((value) => value + 1)
  }

  const finishAnimation = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return
    setState('complete')
  }

  return (
    <section
      className="ticket-reveal-stage"
      data-testid="ticket-reveal-stage"
      data-reveal-state={state}
      data-reveal-active={state === 'printing' || state === 'settling'}
      aria-label={text('티켓 인쇄 연출', 'Ticket printing')}
    >
      <div className="ticket-reveal-stage__viewport">
        <div
          className="ticket-reveal-stage__printer"
          data-testid="ticket-reveal-printer"
          aria-hidden="true"
        >
          <span />
        </div>

        <div
          key={replayKey}
          className="ticket-reveal-stage__printout"
          data-testid="ticket-reveal-printout"
          data-replay-key={replayKey}
          onAnimationEnd={finishAnimation}
        >
          {children}
        </div>
      </div>

      <button
        type="button"
        className="ticket-reveal-stage__replay"
        onClick={replay}
        disabled={state === 'reduced' || forceStaticFallback}
        aria-label={
          state === 'reduced'
            ? text(
                '티켓 다시 보기 (동작 줄이기 설정으로 비활성화)',
                'Replay ticket (disabled for reduced motion)',
              )
            : forceStaticFallback
              ? text(
                  '티켓 다시 보기 (정적 미리보기에서 비활성화)',
                  'Replay ticket (disabled in static preview)',
                )
              : text('티켓 다시 보기', 'Replay ticket')
        }
      >
        {text('티켓 다시 보기', 'Replay ticket')}
      </button>
    </section>
  )
}
