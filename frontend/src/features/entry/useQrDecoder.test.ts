/**
 * S-02 디코더 — **iOS Safari에서 판정이 나는가**가 이 테스트의 전부다.
 *
 * 리허설 2 검표 단말이 iPhone 16 Pro다. Safari에는 `BarcodeDetector`가 없어서, 내장 API만
 * 쓰던 시절에는 카메라 프리뷰만 뜨고 아무 판정도 나지 않았다(스태프가 200자 토큰을 손으로
 * 받아 적어야 했다). jsQR 폴백이 그 구멍을 메운다 — 여기서 못 박지 않으면 누군가 "의존성이
 * 하나 더 있네" 하고 지울 수 있다.
 *
 * jsdom에는 canvas 2D가 없다(`getContext`가 null이다). 폴백이 픽셀을 꺼내는 경로만 최소로
 * 대역한다 — 디코딩 알고리즘은 라이브러리 몫이고 여기서 검증할 것이 아니다.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { useQrDecoder } from './useQrDecoder'

const jsqr = vi.hoisted(() => ({ decode: vi.fn() }))
vi.mock('jsqr', () => ({ default: jsqr.decode }))

/** `<video>`가 하는 일은 프레임을 주는 것뿐이라 훅이 읽는 속성만 세운다 */
function videoRef(): React.RefObject<HTMLVideoElement | null> {
  return {
    current: {
      readyState: 4,
      videoWidth: 640,
      videoHeight: 480,
    } as unknown as HTMLVideoElement,
  }
}

/** canvas 2D 대역. `drawImage`는 아무 일도 하지 않고 `getImageData`는 빈 프레임을 준다 */
function stubCanvas() {
  const getImageData = vi.fn((_x: number, _y: number, w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  }))
  // `getContext`는 오버로드가 여럿이라 vitest가 **마지막 시그니처(WebGPU)** 로 반환형을 추론한다.
  // 2D 컨텍스트를 그 자리에 넣으려면 그 타입으로 캐스팅해야 한다 — 런타임에는 훅이 2D만 요청한다.
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({ drawImage: vi.fn(), getImageData } as unknown as GPUCanvasContext)
  return { spy, getImageData }
}

afterEach(() => {
  vi.restoreAllMocks()
  jsqr.decode.mockReset()
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
})

it('BarcodeDetector가 없으면 jsQR 폴백이 읽은 문자열을 그대로 넘긴다', async () => {
  const { getImageData } = stubCanvas()
  // 규약: 읽은 문자열이 곧 `qrToken`이다 — 훅이 가공하지 않는지 본다
  jsqr.decode.mockReturnValue({ data: 'header.payload.signature' })
  const onDecode = vi.fn()

  const { result } = renderHook(() => useQrDecoder(videoRef(), true, onDecode))

  await waitFor(() => expect(onDecode).toHaveBeenCalledWith('header.payload.signature'), {
    timeout: 3_000,
  })
  expect(result.current.engine).toBe('fallback')
  expect(result.current.supported).toBe(true)
  // 640×480은 축소 상한(640) 이내라 그대로 읽는다
  expect(getImageData).toHaveBeenCalledWith(0, 0, 640, 480)
})

it('내장 BarcodeDetector가 있으면 jsQR을 쓰지 않는다', async () => {
  const detect = vi.fn().mockResolvedValue([{ rawValue: 'native-token' }])
  ;(window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
    detect = detect
  }
  const onDecode = vi.fn()

  const { result } = renderHook(() => useQrDecoder(videoRef(), true, onDecode))

  expect(result.current.engine).toBe('native')
  await waitFor(() => expect(onDecode).toHaveBeenCalledWith('native-token'), { timeout: 3_000 })
  expect(jsqr.decode).not.toHaveBeenCalled()
})

it('캔버스 2D를 못 얻으면 수동 입력 안내로 내려간다', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

  const { result } = renderHook(() => useQrDecoder(videoRef(), true, vi.fn()))

  await waitFor(() => expect(result.current.engine).toBe('unavailable'))
  expect(result.current.supported).toBe(false)
})

it('카메라가 꺼져 있으면 프레임을 읽지 않는다', async () => {
  stubCanvas()
  jsqr.decode.mockReturnValue({ data: 'should-not-be-read' })
  const onDecode = vi.fn()

  renderHook(() => useQrDecoder(videoRef(), false, onDecode))

  await new Promise((resolve) => setTimeout(resolve, 400))
  expect(onDecode).not.toHaveBeenCalled()
  expect(jsqr.decode).not.toHaveBeenCalled()
})

it('BarcodeDetector 생성자는 있어도 getSupportedFormats에 qr_code가 없으면 jsQR로 간다 (데스크톱 Chrome)', async () => {
  const detect = vi.fn().mockResolvedValue([{ rawValue: 'native-token' }])
  ;(window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
    static getSupportedFormats = vi.fn().mockResolvedValue([])
    detect = detect
  }
  stubCanvas()
  jsqr.decode.mockReturnValue({ data: 'fallback-token' })
  const onDecode = vi.fn()

  const { result } = renderHook(() => useQrDecoder(videoRef(), true, onDecode))

  await waitFor(() => expect(onDecode).toHaveBeenCalledWith('fallback-token'), { timeout: 3_000 })
  expect(result.current.engine).toBe('fallback')
  expect(detect).not.toHaveBeenCalled()
})

it('내장 detect가 NotSupportedError로 거부되면 한 번만 jsQR로 갈아탄다', async () => {
  const err = Object.assign(new Error('not supported'), { name: 'NotSupportedError' })
  const detect = vi.fn().mockRejectedValue(err)
  ;(window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
    detect = detect
  }
  stubCanvas()
  jsqr.decode.mockReturnValue({ data: 'fallback-token' })
  const onDecode = vi.fn()
  // 실제 화면처럼 ref 는 고정한다(매 렌더 새 ref 면 effect 가 재시작돼 시험이 다른 것을 잰다)
  const ref = videoRef()

  const { result } = renderHook(() => useQrDecoder(ref, true, onDecode))

  await waitFor(() => expect(onDecode).toHaveBeenCalledWith('fallback-token'), { timeout: 3_000 })
  expect(result.current.engine).toBe('fallback')
  // 갈아탄 뒤에는 내장 루프가 멈춰 있어야 한다 — detect 호출이 더 늘지 않는다
  const calls = detect.mock.calls.length
  await new Promise((r) => setTimeout(r, 700))
  expect(detect.mock.calls.length).toBe(calls)
})
