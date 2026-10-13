import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

interface Props {
  open: boolean
  children: ReactNode
  id?: string
  className?: string
  enterMs?: number
  exitMs?: number
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const

/**
 * 접기 영역의 mount/unmount와 높이 변화를 한곳에서 처리한다.
 *
 * 숫자나 읽을 내용 자체를 움직이지 않고, 영역의 등장 관계만 설명한다. 동작 줄이기를
 * 요청한 환경에서는 애니메이션 없이 즉시 DOM을 교체한다.
 */
export function MotionDisclosure({
  open,
  children,
  id,
  className,
  enterMs = 180,
  exitMs = 140,
}: Props) {
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          id={id}
          className={className}
          initial={reduceMotion ? false : { height: 0, opacity: 0, transform: 'translateY(-4px)' }}
          animate={{ height: 'auto', opacity: 1, transform: 'translateY(0px)' }}
          exit={
            reduceMotion
              ? { opacity: 0, transition: { duration: 0 } }
              : {
                  height: 0,
                  opacity: 0,
                  transform: 'translateY(-2px)',
                  transition: { duration: exitMs / 1000, ease: EASE_OUT },
                }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  duration: enterMs / 1000,
                  ease: EASE_OUT,
                }
          }
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
