import { renderTicketArtwork, ticketSourceCrop } from './ticketArtwork'

afterEach(() => vi.restoreAllMocks())

it('세로 원본을 5:2로 자르며 위치를 원본 경계 안에 제한한다', () => {
  expect(ticketSourceCrop({ width: 800, height: 1200 }, { x: 50, y: 50 })).toEqual({
    x: 0,
    y: 440,
    width: 800,
    height: 320,
  })
  expect(ticketSourceCrop({ width: 800, height: 1200 }, { x: -50, y: 150 })).toEqual({
    x: 0,
    y: 880,
    width: 800,
    height: 320,
  })
})

it('가로 원본에서는 좌우를 잘라 5:2를 채운다', () => {
  expect(ticketSourceCrop({ width: 3000, height: 600 }, { x: 100, y: 0 })).toEqual({
    x: 1500,
    y: 0,
    width: 1500,
    height: 600,
  })
})

it('정적 공연 정보만 1800x720 아트에 쓰고 식별 정보는 생성하지 않는다', async () => {
  const context = {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 100 }),
    getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  )
  let size: number[] = []
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
    type,
  ) {
    size = [this.width, this.height]
    callback(new Blob(['artwork'], { type }))
  })
  const blob = await renderTicketArtwork({
    mode: 'DESIGN',
    accent: '#3129dd',
    position: { x: 50, y: 50 },
    text: {
      title: '밤의 합주',
      subtitle: '첫 무대',
      dateTime: '2030.09.22 19:00',
      venue: '합정홀',
    },
  })
  expect(size).toEqual([1800, 720])
  expect(blob.type).toBe('image/jpeg')
  expect(context.fillText.mock.calls.map((call) => call[0])).toEqual([
    'LIVE PERFORMANCE',
    '밤의 합주',
    '첫 무대',
    '2030.09.22 19:00 · 합정홀',
  ])
})
