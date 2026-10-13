/**
 * P-08 지급 완료 모달의 열림 상태 — 띄우는 조건은 `ReleaseDoneDialog.tsx` 머리말.
 * 컴포넌트와 파일을 나눈 이유는 Fast Refresh(`react-refresh/only-export-components`)다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { SettlementData } from '@/shared/api/domains/settlement'

/**
 * 지급 완료 모달의 열림 상태. 컴포넌트 수명 안에서 공연별로 한 번만 연다.
 *
 * 직전 관측값과 "이미 띄운 공연"은 ref로 든다 — 화면에 그리는 값이 아니고, state로 두면
 * 관측할 때마다 리렌더가 한 번 더 돈다.
 */
export function useReleaseDoneNotice(data: SettlementData | undefined) {
  const [open, setOpen] = useState(false)
  const shownFor = useRef<Set<number>>(new Set())
  const previous = useRef<{ performanceId: number; status: string } | null>(null)
  const currentId = useRef<number | undefined>(undefined)
  currentId.current = data?.performanceId

  const show = useCallback((performanceId: number) => {
    if (shownFor.current.has(performanceId)) return
    shownFor.current.add(performanceId)
    setOpen(true)
  }, [])

  const performanceId = data?.performanceId
  const status = data?.status
  useEffect(() => {
    // 재조회 중·에러로 data가 잠시 비어도 직전 관측값은 지우지 않는다
    if (performanceId === undefined || status === undefined) return
    const prev = previous.current
    previous.current = { performanceId, status }
    if (
      prev !== null &&
      prev.performanceId === performanceId &&
      prev.status !== 'RELEASED' &&
      status === 'RELEASED'
    ) {
      show(performanceId)
    }
  }, [performanceId, status, show])

  /** 수동 지급 job이 CONFIRMED로 끝났을 때 부른다 */
  const notify = useCallback(() => {
    if (currentId.current !== undefined) show(currentId.current)
  }, [show])

  const close = useCallback(() => setOpen(false), [])

  return { open, notify, close }
}
