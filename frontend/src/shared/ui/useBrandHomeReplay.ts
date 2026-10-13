import { useEffect, useState, type MouseEvent } from 'react'
import { createPath, useLocation, useResolvedPath, type To } from 'react-router'

const PENDING_REPLAY_KEY = 'bulleoyo:header-pending-replay'

/**
 * 홈 링크가 재생을 소유한다. 현재 경로에서는 값을 바꾸고, 경로가 바뀌면 목적지
 * 헤더가 문서 ID와 목적지가 일치하는 요청을 한 번 소비한다. 반응형 로고 둘도
 * 헤더의 훅 하나를 공유하므로 숨겨진 로고가 요청을 먼저 소모하지 않는다.
 */
export function useBrandHomeReplay(to: To) {
  const location = useLocation()
  const currentPath = createPath(location)
  const targetPath = createPath(useResolvedPath(to))
  const [replayKey, setReplayKey] = useState(0)

  useEffect(() => {
    if (currentPath !== targetPath) return

    try {
      const raw = window.sessionStorage.getItem(PENDING_REPLAY_KEY)
      if (!raw) return

      let request: { documentId?: unknown; target?: unknown }
      try {
        request = JSON.parse(raw) as { documentId?: unknown; target?: unknown }
      } catch {
        window.sessionStorage.removeItem(PENDING_REPLAY_KEY)
        return
      }

      if (request.documentId !== String(window.performance.timeOrigin)) {
        window.sessionStorage.removeItem(PENDING_REPLAY_KEY)
        return
      }
      // 같은 문서의 다른 목적지 요청은 그 목적지 헤더가 소비하도록 남긴다.
      if (request.target !== targetPath) return
      // Read/remove is synchronous and happens before signalling either logo.
      window.sessionStorage.removeItem(PENDING_REPLAY_KEY)
      setReplayKey((value) => value + 1)
    } catch {
      // Storage restrictions must not interfere with home navigation.
    }
  }, [currentPath, targetPath, location.key])

  const onHomeClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      (event.currentTarget.target && event.currentTarget.target !== '_self')
    )
      return

    try {
      if (currentPath === targetPath) {
        window.sessionStorage.removeItem(PENDING_REPLAY_KEY)
      } else {
        window.sessionStorage.setItem(
          PENDING_REPLAY_KEY,
          JSON.stringify({
            documentId: String(window.performance.timeOrigin),
            target: targetPath,
          }),
        )
      }
    } catch {
      // Same-route replay still works when storage is unavailable.
    }
    if (currentPath === targetPath) setReplayKey((value) => value + 1)
  }

  return { replayKey, onHomeClick }
}
