/**
 * 카메라 프레임 → QR 문자열 디코딩(S-02).
 *
 * ── 두 갈래 ──────────────────────────────────────────────────────────────
 *   ① 브라우저 내장 `BarcodeDetector` — 있으면 이걸 쓴다. 의존성 0, 네이티브 구현이라 빠르다.
 *      안드로이드 크롬·엣지에 있다.
 *   ② **`jsQR` 폴백** — `BarcodeDetector`가 없으면 `<video>` 프레임을 오프스크린 `<canvas>`에
 *      그려 픽셀을 꺼내고 순수 JS로 디코딩한다.
 *
 * ⚠ 폴백이 없으면 **시연이 안 된다.** 리허설 2 검표 단말이 iPhone 16 Pro(iOS Safari)인데
 *    Safari에는 `BarcodeDetector`가 없다. 폴백 없이는 카메라 프리뷰만 뜨고 판정이 영영 안 나서,
 *    스태프가 관객 화면의 200자짜리 토큰을 손으로 받아 적는 수동 입력만 남는다.
 *    (이전 주석은 "관객 화면에 진짜 QR이 없으니 디코더도 넣지 않는다"였다 — A-08이 실제 QR을
 *     그리게 된 지금 그 전제가 사라졌다. S15P21B204-101.)
 *
 * `jsQR`도 **동적 import**다. 내장 API가 있는 단말은 이 코드를 아예 내려받지 않는다.
 *
 * ── 페이로드 규약 ────────────────────────────────────────────────────────
 * 읽은 문자열이 곧 `qrToken`이다. 포장을 벗기거나 접두를 자르지 않는다 — 관객 화면(A-08)이
 * `qrToken`을 그대로 QR에 담는다. 이 문자열은 `POST /api/v1/entries/verify`의 `qrToken`으로
 * 그대로 들어간다. `performanceId`는 QR이 아니라 검표 진입 URL에서 온다.
 *
 * 훅만 있는 파일이다(컴포넌트 파일은 컴포넌트만 export한다 — Fast Refresh).
 */

import { useEffect, useRef, useState } from 'react'

/** 내장 경로의 프레임 주기(ms). 60fps를 다 읽을 필요가 없다 — 사람이 폰을 대는 속도가 기준이다 */
const DECODE_INTERVAL_MS = 300

/**
 * 폴백 경로의 프레임 주기(ms). 내장보다 짧게 잡았다 — 순수 JS 디코딩은 실패(=못 읽음)가 잦아
 * 시도 횟수로 벌충해야 하고, 한 장 처리가 수 ms라 200ms 간격이면 CPU 여유가 충분하다.
 */
const FALLBACK_DECODE_INTERVAL_MS = 200

/**
 * 폴백이 픽셀을 꺼낼 때 쓰는 최대 변 길이(px).
 *
 * 프레임이 클수록 `getImageData` + 디코딩 비용이 면적에 비례해 커진다. 반대로 너무 줄이면
 * QR 모듈이 1px 아래로 뭉개져 못 읽는다. 640은 `getUserMedia` 기본 해상도(대개 640×480) 근처라
 * 대부분의 단말에서 **축소가 일어나지 않고**, 고해상도 단말에서만 비용을 깎는다.
 */
const MAX_FALLBACK_EDGE = 640

/** `BarcodeDetector`는 아직 TS DOM 타입에 없다. 쓰는 만큼만 좁게 선언한다 */
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]>
}
type BarcodeDetectorCtor = (new (options?: { formats?: string[] }) => BarcodeDetectorLike) & {
  /** 지원 포맷 조회(static). 구형 구현엔 없다 — 없으면 지원한다고 본다 */
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * 내장 `BarcodeDetector`가 **QR을 실제로 읽을 수 있는가.**
 *
 * 생성자 존재만 보면 틀린다(리뷰 !116 🟡). 데스크톱 Chrome(Windows/Linux)은 생성자는 있는데
 * `getSupportedFormats()`가 `[]`라 `detect()`가 매 프레임 `NotSupportedError`로 거부된다 —
 * 카메라만 켜지고 판정이 영영 안 나오는, iOS에 폴백을 넣기 전과 같은 증상이다.
 * 조회가 없거나(구형) 실패하면 지원한다고 보고, 그 뒤 `detect()`의 `NotSupportedError`가
 * 두 번째 안전망으로 폴백에 넘긴다.
 */
async function nativeSupportsQr(Ctor: BarcodeDetectorCtor): Promise<boolean> {
  if (typeof Ctor.getSupportedFormats !== 'function') return true
  try {
    return (await Ctor.getSupportedFormats()).includes('qr_code')
  } catch {
    return true
  }
}

function detectorCtor(): BarcodeDetectorCtor | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
}

/**
 * 어떤 디코딩 경로로 도는가.
 *   `native`      내장 `BarcodeDetector`
 *   `fallback`    `jsQR`
 *   `unavailable` 둘 다 못 쓴다(캔버스 2D 없음·`jsQR` 로딩 실패) → 수동 입력만 남는다
 */
export type QrDecodeEngine = 'native' | 'fallback' | 'unavailable'

interface QrDecoder {
  /** 카메라로 QR을 읽을 수 있는가 — 화면이 수동 입력 안내 문구를 가른다 */
  supported: boolean
  engine: QrDecodeEngine
}

/**
 * @param videoRef  `useCameraStream`이 스트림을 물린 `<video>`
 * @param enabled   카메라가 실제로 켜져 있는가(`state === 'live'`)
 * @param onDecode  읽은 문자열. 디바운스·중복 방지는 호출부(`ScanScreen.handleScan`)가 한다
 */
export function useQrDecoder(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onDecode: (value: string) => void,
): QrDecoder {
  /*
   * 초기값은 **낙관적**이다 — 내장이 없으면 일단 `fallback`. `jsQR`이 실제로 실패했을 때만
   * `unavailable`로 내린다. 반대로 잡으면(처음에 unavailable) 폴백이 뜨는 몇 백 ms 동안
   * 스태프에게 "이 브라우저는 안 됩니다" 문구가 깜빡인다.
   */
  const [engine, setEngine] = useState<QrDecodeEngine>(() =>
    detectorCtor() != null ? 'native' : 'fallback',
  )
  // 콜백이 매 렌더 바뀌어도 디코딩 루프를 다시 만들지 않는다(루프 재시작 = 프레임 유실)
  const callbackRef = useRef(onDecode)
  callbackRef.current = onDecode
  // 내장 경로가 `NotSupportedError`로 판명되면 기억한다 — effect가 다시 돌아도(ref 교체·enabled 토글)
  // 같은 세션에서 native를 다시 시도해 폴백↔native 를 왕복하지 않게 한다
  const nativeBrokenRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer: number | undefined

    /* ── ① 내장 경로 ─────────────────────────────────────────────────── */
    const startNative = (Ctor: BarcodeDetectorCtor) => {
      const detector = new Ctor({ formats: ['qr_code'] })
      let switched = false
      if (alive) setEngine('native')
      let inFlight = false

      timer = window.setInterval(() => {
        const video = videoRef.current
        // HAVE_CURRENT_DATA 미만이면 읽을 프레임이 없다. 겹쳐 돌리지도 않는다
        if (inFlight || !video || video.readyState < 2) return
        inFlight = true
        detector
          .detect(video)
          .then((codes) => {
            const value = codes.find((c) => c.rawValue)?.rawValue
            // ⚠ 읽은 값은 서명 토큰이다. 로그·상태에 남기지 않고 그대로 넘긴다
            if (alive && value) callbackRef.current(value)
          })
          .catch((err: unknown) => {
            // 프레임 한 장 실패는 정상이다(초점·각도). 다음 주기에 다시 읽는다.
            // 단 `NotSupportedError`는 프레임 탓이 아니라 이 구현이 QR을 못 읽는다는 뜻이다 —
            // 계속 삼키면 판정이 영영 안 난다(리뷰 !116 🟡). 한 번만 폴백으로 갈아탄다.
            if (!switched && alive && (err as { name?: string } | null)?.name === 'NotSupportedError') {
              switched = true
              nativeBrokenRef.current = true
              if (timer != null) window.clearInterval(timer)
              timer = undefined
              startFallback()
            }
          })
          .finally(() => {
            inFlight = false
          })
      }, DECODE_INTERVAL_MS)
    }

    /* ── ② jsQR 폴백 ─────────────────────────────────────────────────── */
    const startFallback = () => {
      void (async () => {
        let decode: typeof import('jsqr').default
        try {
          decode = (await import('jsqr')).default
        } catch {
          // 청크를 못 받았다(오프라인·CDN 실패). 수동 입력만 남는다고 화면에 알린다
          if (alive) setEngine('unavailable')
          return
        }
        if (!alive) return

        // 캔버스는 루프 바깥에서 한 번만 만든다 — 프레임마다 만들면 GC가 그만큼 돈다
        const canvas = document.createElement('canvas')
        let ctx: CanvasRenderingContext2D | null = null
        try {
          // `willReadFrequently`: 매 프레임 getImageData를 하므로 GPU 왕복 대신 CPU 백킹을 쓴다
          ctx = canvas.getContext('2d', { willReadFrequently: true })
        } catch {
          ctx = null
        }
        if (!ctx) {
          if (alive) setEngine('unavailable')
          return
        }
        const context = ctx
        if (alive) setEngine('fallback')

        timer = window.setInterval(() => {
          const video = videoRef.current
          if (!video || video.readyState < 2) return
          const vw = video.videoWidth
          const vh = video.videoHeight
          if (!vw || !vh) return

          const scale = Math.min(1, MAX_FALLBACK_EDGE / Math.max(vw, vh))
          const w = Math.max(1, Math.round(vw * scale))
          const h = Math.max(1, Math.round(vh * scale))
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
          }

          try {
            context.drawImage(video, 0, 0, w, h)
            const frame = context.getImageData(0, 0, w, h)
            // `dontInvert`: 흰 바탕 검은 모듈만 본다. 반전까지 시도하면 프레임당 비용이 2~3배다
            const result = decode(frame.data, frame.width, frame.height, {
              inversionAttempts: 'dontInvert',
            })
            // ⚠ 읽은 값은 서명 토큰이다. 로그·상태에 남기지 않고 그대로 넘긴다
            if (alive && result?.data) callbackRef.current(result.data)
          } catch {
            // 프레임 한 장 실패는 정상이다(초점·각도·아직 비어 있는 프레임)
          }
        }, FALLBACK_DECODE_INTERVAL_MS)
      })()
    }

    // 생성자 존재가 아니라 "QR을 읽을 수 있는가"로 경로를 고른다(리뷰 !116 🟡)
    void (async () => {
      const Ctor = detectorCtor()
      const useNative = Ctor && !nativeBrokenRef.current ? await nativeSupportsQr(Ctor) : false
      if (!alive) return
      if (Ctor && useNative) startNative(Ctor)
      else startFallback()
    })()

    return () => {
      alive = false
      // 폴백은 import를 기다리는 동안 타이머가 아직 없을 수 있다 — `alive`가 그 구간을 막는다
      if (timer != null) window.clearInterval(timer)
    }
  }, [enabled, videoRef])

  return { supported: engine !== 'unavailable', engine }
}
