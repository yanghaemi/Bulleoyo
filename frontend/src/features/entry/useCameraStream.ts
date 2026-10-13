/**
 * 검표(S-02) 카메라 프리뷰 훅.
 *
 * 정본 — 화면설계 v6 §4 S-02 "카메라 뷰"·"카메라 권한 거부 안내"(1373·1375행),
 *        상태 항목 "권한 없음: 카메라 권한 거부 시 대안 안내"(1384행)
 *
 * `getUserMedia`는 **보안 컨텍스트 전용**이다 — https 또는 `localhost`가 아니면
 * `navigator.mediaDevices` 자체가 `undefined`다. 현장에서 스태프가 LAN 평문 주소
 * (`http://192.168.x.x:5173`)로 열면 권한 거부와 구분되지 않는 "그냥 안 됨"이 되므로
 * **`insecure`를 따로 구분해** 다른 안내를 준다.
 *
 * 훅만 있는 파일이다(컴포넌트 파일은 컴포넌트만 export한다 — Fast Refresh).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 카메라 상태.
 *
 * `idle`을 빼면 전부 화면에 다른 것을 그린다 — 실패 원인마다 스태프가 할 행동이 다르기 때문이다
 * (권한은 브라우저 설정, 기기 없음은 다른 폰, 평문 주소는 https 링크 재요청).
 */
export type CameraState =
  | 'idle'
  | 'requesting'
  | 'live'
  /** 권한 거부(`NotAllowedError`·`SecurityError`) */
  | 'denied'
  /** 카메라 없음(`NotFoundError`·`OverconstrainedError`) */
  | 'no-device'
  /** 다른 앱이 카메라를 점유(`NotReadableError`) */
  | 'busy'
  /** https·localhost가 아님 → `navigator.mediaDevices`가 없다 */
  | 'insecure'
  /** 보안 컨텍스트인데도 API가 없는 브라우저 */
  | 'unsupported'
  /** 그 밖의 실패. 원인 이름을 함께 돌려준다 */
  | 'error'

interface CameraStream {
  state: CameraState
  /** `<video>`에 붙인다. 스트림은 훅이 직접 물린다 */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** 권한 재요청. "권한 재요청 안내" 버튼이 부른다 */
  request: () => void
  /** `error` 상태일 때의 DOMException 이름. 문구를 지어내지 않고 그대로 보여주기 위한 값 */
  errorName?: string
}

/** 후면 카메라 우선. 검표는 상대 폰 화면을 비추므로 셀피 카메라가 아니다 */
const CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' } },
  audio: false,
}

/**
 * @param enabled 카메라를 열어도 되는가. 링크 무효(`ENTRY_SCANNER_NOT_AUTHORIZED`)일 때는
 *                **카메라를 열지 않는다**(S-02 1383행)는 규칙을 훅 바깥에서 끄기 위한 스위치다.
 */
export function useCameraStream(enabled: boolean): CameraStream {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>('idle')
  const [errorName, setErrorName] = useState<string>()
  /** 권한 재요청 버튼이 누를 때마다 올린다 — 같은 조건으로 effect를 다시 돌리는 유일한 방법 */
  const [attempt, setAttempt] = useState(0)

  const request = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    if (!enabled) return

    // 보안 컨텍스트 판정이 먼저다. 여기서 걸리면 권한 대화상자 자체가 뜨지 않는다
    if (!window.isSecureContext) {
      setState('insecure')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported')
      return
    }

    // effect가 다시 돌 때(재요청) 이전 스트림이 살아 있으면 트랙이 겹친다
    let cancelled = false
    setState('requesting')

    navigator.mediaDevices
      .getUserMedia(CONSTRAINTS)
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // iOS Safari는 사용자 제스처 없이도 muted + playsInline이면 자동 재생된다.
          // play()가 거부돼도 프리뷰만 못 볼 뿐이라 상태를 실패로 떨어뜨리지 않는다
          void videoRef.current.play().catch(() => undefined)
        }
        setState('live')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : 'UnknownError'
        setErrorName(name)
        if (name === 'NotAllowedError' || name === 'SecurityError') setState('denied')
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setState('no-device')
        else if (name === 'NotReadableError' || name === 'TrackStartError') setState('busy')
        else setState('error')
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [enabled, attempt])

  return { state, videoRef, request, errorName }
}
