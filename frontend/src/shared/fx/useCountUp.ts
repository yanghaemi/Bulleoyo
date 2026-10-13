/**
 * 숫자 카운트업 — 값이 바뀌면 이전 값에서 새 값까지 굴러간다(오도미터).
 *
 * 잔액(A-13)·금액 표시에 쓴다. 첫 마운트에는 0에서 올라와 "잔액이 채워지는" 인상을 주고,
 * 이후 갱신(환불 도착 등)에는 이전 값에서 새 값으로만 움직인다.
 *
 *   · ease-out cubic, 기본 900ms. 큰 금액도 작은 금액도 같은 시간에 도착한다 — 시간이 금액에
 *     비례하면 100,000 YoYo은 느리고 1,000 YoYo은 뚝 끝나 리듬이 깨진다
 *   · `prefers-reduced-motion`이면 즉시 새 값. 굴러가는 숫자는 읽기를 방해하는 모션이다
 *   · 표시 숫자는 정수로 내림 — 소수점이 굴러가면 "돈"이 아니라 "계기판"으로 보인다
 *   · `undefined`(조회 실패)는 그대로 돌려 준다. 호출부가 `—`를 그린다
 *
 * 폰트에 `tabular-nums`를 걸어야 굴러가는 동안 폭이 흔들리지 않는다(BalancePanel이 이미 건다).
 */

import { useEffect, useRef, useState } from 'react'

const DEFAULT_MS = 900

function reduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function useCountUp(target: number | undefined, durationMs = DEFAULT_MS): number | undefined {
  const [shown, setShown] = useState<number | undefined>(() =>
    target === undefined || !reduced() ? (target === undefined ? undefined : 0) : target,
  )
  const from = useRef(0)
  const raf = useRef(0)

  useEffect(() => {
    if (target === undefined) {
      setShown(undefined)
      return
    }
    if (reduced()) {
      from.current = target
      setShown(target)
      return
    }
    const start = performance.now()
    const begin = from.current
    const delta = target - begin
    const step = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.floor(begin + delta * eased)
      setShown(v)
      if (t < 1) raf.current = requestAnimationFrame(step)
      else from.current = target
    }
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, durationMs])

  return shown
}
