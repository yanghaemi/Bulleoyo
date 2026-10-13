import { clampPosterCrop, posterScale, renderPoster } from './posterCrop'

it('작은 세로 사진과 회전한 사진 모두 3:4 캔버스를 빈틈없이 채운다', () => {
  const source = { width: 800, height: 1200 }
  expect(posterScale(source, { rotation: 0, zoom: 1, x: 0, y: 0 })).toBeCloseTo(1.35)
  expect(posterScale(source, { rotation: 90, zoom: 1, x: 0, y: 0 })).toBeCloseTo(1.8)
  expect(clampPosterCrop(source, { rotation: 0, zoom: 0.1, x: 9999, y: -9999 })).toEqual({
    rotation: 0,
    zoom: 1,
    x: 0,
    y: -90,
  })
  expect(clampPosterCrop(source, { rotation: 90, zoom: 1, x: 9999, y: -9999 })).toEqual({
    rotation: 90,
    zoom: 1,
    x: 540,
    y: 0,
  })
})

it('캔버스 생성 실패를 성공한 포스터로 취급하지 않는다', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  await expect(renderPoster(new Image(), { rotation: 0, zoom: 1, x: 0, y: 0 })).rejects.toThrow(
    'CLIENT_CANVAS_FAILED',
  )
  vi.restoreAllMocks()
})
