import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from '@/shared/i18n'
import { TicketArtworkEditor } from './TicketArtworkEditor'

const revoke = vi.fn()
beforeEach(async () => {
  await i18n.changeLanguage('en')
  const NativeURL = URL
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn((file: File) => `blob:${file.name}`)
      static revokeObjectURL = revoke
    },
  )
  revoke.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function select(label: string, name: string, type = 'image/png') {
  fireEvent.change(screen.getByLabelText(label), {
    target: { files: [new File(['bytes'], name, { type })] },
  })
}

it('디자인과 업로드 사이를 왕복해도 각 모드의 입력·이미지를 유지한다', () => {
  render(<TicketArtworkEditor />)
  fireEvent.change(screen.getByLabelText('Main title'), { target: { value: '밤의 합주' } })
  fireEvent.change(screen.getByLabelText('Subtitle'), { target: { value: '첫 번째 무대' } })
  select('Background image', 'background.png')
  fireEvent.click(screen.getByRole('tab', { name: 'Upload artwork' }))
  select('Ticket image', 'ticket.png')
  expect(screen.getByRole('img', { name: 'Ticket artwork preview' })).toHaveAttribute(
    'src',
    'blob:ticket.png',
  )
  fireEvent.click(screen.getByRole('tab', { name: 'Design artwork' }))
  expect(screen.getByLabelText('Main title')).toHaveValue('밤의 합주')
  expect(screen.getByLabelText('Subtitle')).toHaveValue('첫 번째 무대')
  expect(screen.getByRole('img', { name: 'Ticket artwork preview' })).toHaveAttribute(
    'src',
    'blob:background.png',
  )
  fireEvent.click(screen.getByRole('tab', { name: 'Upload artwork' }))
  expect(screen.getByText('ticket.png')).toBeVisible()
  expect(revoke).not.toHaveBeenCalled()
})

it('잘못된 이미지 비율은 자르기 안내를 보여주고 저장 연결 없이 완료시키지 않는다', () => {
  render(<TicketArtworkEditor />)
  fireEvent.click(screen.getByRole('tab', { name: 'Upload artwork' }))
  select('Ticket image', 'portrait.png')
  const image = screen.getByRole('img', { name: 'Ticket artwork preview' })
  Object.defineProperties(image, { naturalWidth: { value: 800 }, naturalHeight: { value: 1200 } })
  fireEvent.load(image)
  expect(screen.getByText(/cropped to 5:2/)).toBeVisible()
  expect(screen.getByRole('slider', { name: 'Vertical position' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Image saving unavailable' })).toBeDisabled()
  expect(screen.getByText(/This Lab preview is not saved/)).toBeVisible()
  expect(screen.queryByText('Ticket artwork saved')).not.toBeInTheDocument()
})

it('손상 이미지의 파일명을 유지하고 제거·unmount에서 각 blob URL을 해제한다', () => {
  const { unmount } = render(<TicketArtworkEditor />)
  select('Background image', 'background.png')
  fireEvent.error(screen.getByRole('img', { name: 'Ticket artwork preview' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be decoded/)
  expect(screen.getByText('background.png')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
  expect(revoke).toHaveBeenCalledWith('blob:background.png')
  fireEvent.click(screen.getByRole('tab', { name: 'Upload artwork' }))
  select('Ticket image', 'ticket.png')
  unmount()
  expect(revoke).toHaveBeenCalledWith('blob:ticket.png')
})

it('실제 저장 콜백 실패를 알리고 입력을 보존하며 재시도 완료까지 중복 제출을 막는다', async () => {
  const context = {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 100 }),
    getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
    callback(new Blob(['art'], { type })),
  )
  let finish: (() => void) | undefined
  const onUpload = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
  render(<TicketArtworkEditor initialTitle="밤의 합주" onUpload={onUpload} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save ticket artwork' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('CLIENT_SAVE_FAILED')
  expect(screen.getByLabelText('Main title')).toHaveValue('밤의 합주')
  expect(screen.queryByText('Ticket artwork saved')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save ticket artwork' }))
  await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2))
  const saving = screen.getByRole('button', { name: 'Saving…' })
  expect(saving).toBeDisabled()
  fireEvent.click(saving)
  expect(onUpload).toHaveBeenCalledTimes(2)
  await act(async () => {
    finish?.()
  })
  expect(screen.getByText('Ticket artwork saved')).toBeVisible()
})

it('화면 제목은 "티켓 꾸미기"다', async () => {
  render(<TicketArtworkEditor />)
  expect(screen.getByRole('heading', { name: 'Decorate ticket' })).toBeVisible()
  await act(async () => {
    await i18n.changeLanguage('ko')
  })
  expect(screen.getByRole('heading', { name: '티켓 꾸미기' })).toBeVisible()
})

it('배경 이미지는 강조색과 같은 행에 놓인다', () => {
  render(<TicketArtworkEditor />)
  const accent = screen.getByRole('group', { name: 'Accent color' })
  const background = screen.getByLabelText('Background image')
  // 강조색 fieldset과 배경 이미지 입력이 같은 2열 그리드의 형제 칸에 있다
  const row = accent.parentElement
  expect(row?.className).toContain('md:grid-cols-2')
  expect(row?.contains(background)).toBe(true)
  // 배경 이미지는 텍스트 입력보다 앞에 온다
  expect(
    background.compareDocumentPosition(screen.getByLabelText('Main title')) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})
