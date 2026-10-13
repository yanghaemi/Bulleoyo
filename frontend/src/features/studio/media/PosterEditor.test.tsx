import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '@/shared/api/client'
import i18n from '@/shared/i18n'
import { PosterEditor } from './PosterEditor'

const revoke = vi.fn()
beforeEach(async () => {
  await i18n.changeLanguage('en')
  const NativeURL = URL
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:poster-preview')
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

function choose(type = 'image/webp', name = 'poster.webp') {
  fireEvent.change(screen.getByLabelText('Poster image'), {
    target: { files: [new File(['image bytes'], name, { type })] },
  })
}

it('Lab 편집 중 파일명·미저장 안내를 보여주고 업로드 연결 전에는 완료할 수 없다', () => {
  const { unmount } = render(<PosterEditor />)
  choose()
  expect(screen.getByText('poster.webp')).toBeVisible()
  expect(screen.getByRole('img', { name: 'Poster preview' })).toHaveAttribute(
    'src',
    'blob:poster-preview',
  )
  expect(screen.getByText(/This Lab preview is not saved/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Image saving unavailable' })).toBeDisabled()
  expect(screen.queryByText('Poster saved')).not.toBeInTheDocument()
  unmount()
  expect(revoke).toHaveBeenCalledWith('blob:poster-preview')
})

it('지원하지 않는 파일을 거부하고 기존 파일은 교체하지 않는다', () => {
  render(<PosterEditor />)
  choose()
  choose('image/svg+xml', 'unsafe.svg')
  expect(screen.getByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/)
  expect(screen.getByText('poster.webp')).toBeVisible()
  expect(screen.queryByText('unsafe.svg')).not.toBeInTheDocument()
})

it('디코딩 실패 시 원본 이름을 유지하며 제거 후 다시 선택할 수 있다', () => {
  render(<PosterEditor />)
  choose()
  fireEvent.error(screen.getByRole('img', { name: 'Poster preview' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be decoded/)
  expect(screen.getByText('poster.webp')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(revoke).toHaveBeenCalledWith('blob:poster-preview')
  choose('image/png', 'replacement.png')
  expect(screen.getByText('replacement.png')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('확대·회전 후 가운데 맞춤이 원래 방향과 배율로 복원한다', () => {
  render(<PosterEditor />)
  choose()
  const image = screen.getByRole('img', { name: 'Poster preview' })
  Object.defineProperties(image, { naturalWidth: { value: 800 }, naturalHeight: { value: 1200 } })
  fireEvent.load(image)
  fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rotate 90°' }))
  expect(image.style.transform).toContain('rotate(90deg)')
  fireEvent.click(screen.getByRole('button', { name: 'Reset crop' }))
  expect(screen.getByRole('slider', { name: 'Zoom' })).toHaveValue('1')
  expect(image.style.transform).toContain('rotate(0deg)')
})

it('저장 실패 후 편집을 보존하고 실제 저장 완료까지 중복 저장을 막는다', async () => {
  const context = {
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type) {
    callback(new Blob(['rendered'], { type }))
  })
  let finish: (() => void) | undefined
  const onUpload = vi
    .fn()
    .mockRejectedValueOnce(
      new ApiError({ code: 'FILE_STORAGE_FAILED', status: 500, msg: 'storage failure' }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
  render(<PosterEditor onUpload={onUpload} />)
  choose()
  const image = screen.getByRole('img', { name: 'Poster preview' })
  Object.defineProperties(image, { naturalWidth: { value: 800 }, naturalHeight: { value: 1200 } })
  fireEvent.load(image)
  fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save poster' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('FILE_STORAGE_FAILED')
  expect(screen.getByText('poster.webp')).toBeVisible()
  expect(screen.getByRole('slider', { name: 'Zoom' })).toHaveValue('2')
  expect(screen.queryByText('Poster saved')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save poster' }))
  await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2))
  const saving = screen.getByRole('button', { name: 'Uploading…' })
  expect(saving).toBeDisabled()
  fireEvent.click(saving)
  expect(onUpload).toHaveBeenCalledTimes(2)
  expect(onUpload.mock.calls[1][0]).toMatchObject({ type: 'image/jpeg' })
  await act(async () => {
    finish?.()
  })
  expect(screen.getByText('Poster saved')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Save poster' })).toBeDisabled()
})

/** 캔버스 렌더를 흉내 낸다 — jsdom에는 2D 컨텍스트가 없다 */
function stubCanvas() {
  const context = {
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type) {
    callback(new Blob(['rendered'], { type }))
  })
}

function loadPreview() {
  const image = screen.getByRole('img', { name: 'Poster preview' })
  Object.defineProperties(image, { naturalWidth: { value: 800 }, naturalHeight: { value: 1200 } })
  fireEvent.load(image)
}

/**
 * 9/24 — 브라우저 기본 "파일 선택"은 눌러도 반응이 없어 보였다. 보이는 표준 버튼이 숨긴
 * 입력을 열고, 선택 즉시 파일명 · 업로드 중 · 완료 썸네일을 차례로 보여 줘야 한다.
 */
describe('포스터 업로드 피드백', () => {
  it('보이는 버튼이 숨긴 파일 입력을 열고, 입력은 탭 순서에서 빠진다', () => {
    render(<PosterEditor onUpload={vi.fn()} />)
    const input = screen.getByLabelText('Poster image')
    const clickInput = vi.spyOn(input, 'click')

    expect(input).toHaveAttribute('tabindex', '-1')
    expect(input.className).toContain('sr-only')
    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }))
    expect(clickInput).toHaveBeenCalledTimes(1)

    choose()
    // 선택 즉시 파일명이 상태 줄로 뜨고, 버튼은 "변경"으로 바뀐다
    expect(screen.getByRole('status')).toHaveTextContent('Selectedposter.webp')
    expect(screen.getByRole('button', { name: 'Change image' })).toBeEnabled()
  })

  it('업로드 중에는 스피너와 함께 버튼을 잠그고, 끝나면 썸네일과 변경 버튼을 보여준다', async () => {
    stubCanvas()
    let finish: (() => void) | undefined
    const onUpload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<PosterEditor onUpload={onUpload} />)
    choose()
    loadPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Save poster' }))

    const uploading = await screen.findByRole('button', { name: 'Uploading…' })
    expect(uploading).toBeDisabled()
    expect(uploading).toHaveAttribute('aria-busy', 'true')
    expect(uploading.querySelector('.animate-spin')).not.toBeNull()
    // 업로드 중에는 파일을 바꾸는 버튼도 잠근다
    expect(screen.getByRole('button', { name: 'Change image' })).toBeDisabled()

    await act(async () => {
      finish?.()
    })

    expect(screen.getByText('Poster saved')).toBeVisible()
    expect(screen.getByRole('img', { name: 'Saved poster' })).toHaveAttribute(
      'src',
      'blob:poster-preview',
    )
    expect(screen.getByRole('button', { name: 'Change' })).toBeEnabled()
    // 서버 포스터를 지우는 API가 없다 — 저장 뒤에 "제거"를 두지 않는다
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull()
  })

  it('실패하면 code에 맞는 한 줄을 보여준다', async () => {
    stubCanvas()
    const onUpload = vi
      .fn()
      .mockRejectedValue(new ApiError({ code: 'FILE_TOO_LARGE', status: 413, msg: 'too large' }))
    render(<PosterEditor onUpload={onUpload} />)
    choose()
    loadPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Save poster' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The converted image is over 5MB. Choose a smaller image.')
    expect(alert).toHaveTextContent('FILE_TOO_LARGE')
  })

  it('빈 프레임도 숨긴 파일 입력을 열고, 선택하면 프레임이 미리보기로 바뀐다', () => {
    render(<PosterEditor onUpload={vi.fn()} />)
    const clickInput = vi.spyOn(screen.getByLabelText('Poster image'), 'click')

    fireEvent.click(screen.getByRole('button', { name: 'Choose poster image' }))
    expect(clickInput).toHaveBeenCalledTimes(1)

    choose()
    expect(screen.queryByRole('button', { name: 'Choose poster image' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Poster preview' })).toBeVisible()
  })
})
