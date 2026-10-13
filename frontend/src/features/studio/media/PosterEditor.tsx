import { useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, Spinner } from '@/shared/ui'
import { isApiError } from '@/shared/api/client'
import {
  INITIAL_POSTER_CROP,
  POSTER_SIZE,
  clampPosterCrop,
  posterScale,
  renderPoster,
} from './posterCrop'
import type { PosterCrop } from './posterCrop'

type EditorError = 'type' | 'empty' | 'size' | 'decode' | 'save'

/**
 * 저장 실패 한 줄 — `code`로만 고른다(응답 규격 §1). 여기 없는 코드는 일반 문구로 떨어진다.
 * `FILE_*`는 서버 `ErrorCode`, `CLIENT_*`는 이 파일이 만드는 클라이언트 코드다.
 */
const SAVE_FAILURE_TEXT: Record<string, [string, string]> = {
  FILE_TOO_LARGE: [
    '변환한 이미지가 5MB를 넘었습니다. 더 작은 이미지로 바꿔 주세요.',
    'The converted image is over 5MB. Choose a smaller image.',
  ],
  CLIENT_OUTPUT_TOO_LARGE: [
    '변환한 이미지가 5MB를 넘었습니다. 더 작은 이미지로 바꿔 주세요.',
    'The converted image is over 5MB. Choose a smaller image.',
  ],
  FILE_TYPE_NOT_ALLOWED: [
    'JPEG, PNG, WebP 이미지만 올릴 수 있습니다.',
    'Only JPEG, PNG or WebP images can be uploaded.',
  ],
  FILE_RESOLUTION_TOO_SMALL: [
    '이미지 해상도가 너무 작습니다. 더 큰 원본으로 다시 올려 주세요.',
    'The image resolution is too small. Upload a larger original.',
  ],
}

/** D-23 포스터 편집기. Lab에서는 미리보기로, 실제 공연 흐름에서는 업로드와 함께 사용한다. */
export function PosterEditor({
  onUpload,
}: {
  /** Resolve only after a real upload succeeds; never use this callback to simulate success. */
  onUpload?: (image: Blob) => Promise<void>
}) {
  const { text } = useLocale()
  const id = useId()
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState<{ file: File; url: string }>()
  const [source, setSource] = useState<{ width: number; height: number }>()
  const [crop, setCrop] = useState<PosterCrop>(INITIAL_POSTER_CROP)
  const [error, setError] = useState<EditorError>()
  const [failureCode, setFailureCode] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  /** 방금 올린 결과물 — 완료 썸네일에 쓴다. 서버 URL을 기다리지 않고 올린 그 바이트를 보여준다 */
  const [savedBlob, setSavedBlob] = useState<Blob>()
  const [savedThumb, setSavedThumb] = useState<{ blob: Blob; url: string }>()
  const imageRef = useRef<HTMLImageElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const drag = useRef<
    | { pointerId: number; clientX: number; clientY: number; width: number; crop: PosterCrop }
    | undefined
  >(undefined)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!savedBlob) return
    const thumbUrl = URL.createObjectURL(savedBlob)
    setSavedThumb({ blob: savedBlob, url: thumbUrl })
    return () => URL.revokeObjectURL(thumbUrl)
  }, [savedBlob])

  const url = preview?.file === file ? preview?.url : undefined
  const savedThumbUrl = savedThumb?.blob === savedBlob ? savedThumb?.url : undefined
  /** 숨긴 파일 입력을 연다 — 보이는 버튼이 클릭·Enter·Space를 모두 받는다 */
  const openPicker = () => {
    if (busy) return
    inputRef.current?.click()
  }
  const updateCrop = (next: PosterCrop) => {
    if (!source || busy) return
    setCrop(clampPosterCrop(source, next))
    setSaved(false)
  }
  const resetSelection = () => {
    setFile(undefined)
    setSource(undefined)
    setCrop(INITIAL_POSTER_CROP)
    setError(undefined)
    setFailureCode(undefined)
    setSaved(false)
    if (inputRef.current) inputRef.current.value = ''
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  const save = async () => {
    if (!onUpload || !imageRef.current || !source || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(undefined)
    setFailureCode(undefined)
    setSaved(false)
    try {
      const blob = await renderPoster(imageRef.current, crop)
      // The backend plan caps the converted output, not the original phone photo, at 5 MiB.
      if (blob.size > 5 * 1024 * 1024) throw new Error('CLIENT_OUTPUT_TOO_LARGE')
      await onUpload(blob)
      setSavedBlob(blob)
      setSaved(true)
    } catch (failure) {
      setError('save')
      setFailureCode(
        isApiError(failure)
          ? failure.code || `HTTP_${failure.status}`
          : failure instanceof Error &&
              [
                'CLIENT_CANVAS_FAILED',
                'CLIENT_IMAGE_DECODE_FAILED',
                'CLIENT_OUTPUT_TOO_LARGE',
              ].includes(failure.message)
            ? failure.message
            : 'CLIENT_SAVE_FAILED',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const errorText =
    error &&
    {
      type: text(
        'JPEG, PNG, WebP 이미지로 다시 선택해 주세요. 이전 선택은 유지됩니다.',
        'Choose a JPEG, PNG or WebP image. Your previous selection is kept.',
      ),
      empty: text(
        '내용이 없는 파일입니다. 다른 이미지를 선택해 주세요.',
        'This file is empty. Choose another image.',
      ),
      size: text(
        '편집용 원본은 20MB 이하여야 합니다. 더 작은 이미지를 선택해 주세요.',
        'The source image must be 20MB or smaller. Choose a smaller image.',
      ),
      decode: text(
        '이미지를 읽지 못했습니다. 원본 파일은 유지됩니다. 다른 이미지로 교체해 주세요.',
        'The image could not be decoded. Your file is kept; choose a different image.',
      ),
      save:
        failureCode && SAVE_FAILURE_TEXT[failureCode]
          ? text(...SAVE_FAILURE_TEXT[failureCode])
          : text(
              '포스터를 저장하지 못했습니다. 파일과 편집 내용은 남아 있습니다. 더 작은 이미지로 바꾸거나 다시 시도해 주세요.',
              'The poster could not be saved. Your file and edits are kept. Choose a smaller image or try again.',
            ),
    }[error]

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="min-w-0 rounded-card border border-line bg-surface p-5 md:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
        <h2 id={`${id}-title`} className="m-0 text-xl font-semibold text-ink">
          {text('포스터 편집', 'Edit poster')}
        </h2>
        <span className="text-xs font-medium text-muted">3:4 · 1080 × 1440</span>
      </div>
      {!onUpload && (
        <p className="mt-4 text-sm leading-relaxed text-muted" role="status">
          {text(
            'Lab 미리보기는 저장되지 않습니다. 이미지 저장 기능이 연결되면 공연 포스터로 사용할 수 있습니다.',
            'This Lab preview is not saved. Image saving must be connected before it can be used for a show.',
          )}
        </p>
      )}
      <div className="mt-5 grid min-w-0 gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div>
          <div
            role="group"
            aria-label={text('포스터 위치 조절', 'Adjust poster position')}
            aria-describedby={`${id}-move`}
            tabIndex={source && !busy ? 0 : -1}
            className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-control border border-line bg-ground focus-visible:outline-2 focus-visible:outline-primary"
            onPointerDown={(event) => {
              if (!source || busy || event.button !== 0) return
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                width: event.currentTarget.getBoundingClientRect().width,
                crop,
              }
            }}
            onPointerMove={(event) => {
              const start = drag.current
              if (!start || start.pointerId !== event.pointerId || !start.width) return
              updateCrop({
                ...start.crop,
                x:
                  start.crop.x +
                  ((event.clientX - start.clientX) * POSTER_SIZE.width) / start.width,
                y:
                  start.crop.y +
                  ((event.clientY - start.clientY) * POSTER_SIZE.width) / start.width,
              })
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={() => {
              drag.current = undefined
            }}
            onKeyDown={(event) => {
              const offsets: Record<string, [number, number]> = {
                ArrowLeft: [-10, 0],
                ArrowRight: [10, 0],
                ArrowUp: [0, -10],
                ArrowDown: [0, 10],
              }
              const offset = offsets[event.key]
              if (!offset || !source || busy) return
              event.preventDefault()
              updateCrop({ ...crop, x: crop.x + offset[0], y: crop.y + offset[1] })
            }}
          >
            {url ? (
              <img
                ref={imageRef}
                src={url}
                alt={text('포스터 미리보기', 'Poster preview')}
                draggable={false}
                className="absolute max-w-none select-none"
                style={{
                  left: `${50 + (crop.x / POSTER_SIZE.width) * 100}%`,
                  top: `${50 + (crop.y / POSTER_SIZE.height) * 100}%`,
                  width: source
                    ? `${((source.width * posterScale(source, crop)) / POSTER_SIZE.width) * 100}%`
                    : '100%',
                  transform: `translate(-50%, -50%) rotate(${crop.rotation}deg)`,
                }}
                onLoad={(event) => {
                  const image = event.currentTarget
                  if (!image.naturalWidth || !image.naturalHeight) {
                    setError('decode')
                    return
                  }
                  setSource({ width: image.naturalWidth, height: image.naturalHeight })
                }}
                onError={() => {
                  setSource(undefined)
                  setError('decode')
                }}
              />
            ) : (
              // 빈 프레임은 파일 선택처럼 생겼으므로 실제로 파일 창을 연다(9/26). 네이티브 button이라
              // Enter·Space가 click으로 들어오고, openPicker는 await 없이 동기로 input.click()을 불러
              // 사용자 제스처 안에서 파일 창이 열린다. 검증은 숨긴 input의 onChange 하나를 공유한다.
              <button
                type="button"
                disabled={busy}
                aria-label={text('포스터 이미지 선택', 'Choose poster image')}
                onClick={openPicker}
                className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 px-5 text-center text-muted transition-colors hover:bg-ground-2 hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
              >
                <span className="text-3xl" aria-hidden="true">
                  ＋
                </span>
                <span className="text-sm" aria-hidden="true">
                  {text(
                    '이미지를 선택해 포스터를 구성해 보세요',
                    'Choose an image to compose your poster',
                  )}
                </span>
              </button>
            )}
          </div>
          <p id={`${id}-move`} className="mb-0 mt-3 text-xs leading-relaxed text-muted">
            {text(
              '사진을 끌어 위치를 조절하세요. 키보드 방향키도 사용할 수 있습니다.',
              'Drag the image to position it, or focus the frame and use the arrow keys.',
            )}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <label htmlFor={`${id}-file`} className="mb-2 block text-sm font-semibold text-ink">
              {text('포스터 이미지', 'Poster image')}
            </label>
            {/*
              브라우저 기본 "파일 선택" 버튼은 hover·active 표시가 없어 눌러도 반응이 없는 것처럼
              보였다(9/24). 입력은 화면에서 숨기고(스크린리더·라벨 연결은 유지) 표준 `Button`이
              대신 연다. 탭 순서는 보이는 버튼 하나만 갖는다 — 숨긴 입력까지 포커스를 받으면
              보이지 않는 곳에 포커스가 멈춘다.
            */}
            <input
              ref={inputRef}
              id={`${id}-file`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              tabIndex={-1}
              aria-describedby={`${id}-file-hint`}
              className="sr-only"
              onChange={(event) => {
                const next = event.target.files?.[0]
                event.target.value = ''
                if (!next) return
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) {
                  setError('type')
                  return
                }
                if (!next.size) {
                  setError('empty')
                  return
                }
                if (next.size > 20 * 1024 * 1024) {
                  setError('size')
                  return
                }
                setSource(undefined)
                setCrop(INITIAL_POSTER_CROP)
                setSaved(false)
                setError(undefined)
                setFailureCode(undefined)
                setFile(next)
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={busy} onClick={openPicker}>
                {file
                  ? text('다른 이미지로 변경', 'Change image')
                  : text('이미지 선택', 'Choose image')}
              </Button>
              {file && (
                <p role="status" className="m-0 flex min-w-0 items-center gap-1.5 text-sm text-muted">
                  <span className="shrink-0">{text('선택한 파일', 'Selected')}</span>
                  <span className="min-w-0 break-all font-medium text-ink">{file.name}</span>
                </p>
              )}
            </div>
            <p id={`${id}-file-hint`} className="mb-0 mt-2 text-xs leading-relaxed text-muted">
              {text(
                'JPEG · PNG · WebP / 편집 원본 최대 20MB',
                'JPEG · PNG · WebP / source image up to 20MB',
              )}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${id}-zoom`}
              className="flex justify-between gap-3 text-sm font-semibold text-ink"
            >
              <span>{text('확대', 'Zoom')}</span>
              <span aria-hidden="true">{Math.round(crop.zoom * 100)}%</span>
            </label>
            <input
              id={`${id}-zoom`}
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={crop.zoom}
              disabled={!source || busy}
              onChange={(event) => updateCrop({ ...crop, zoom: Number(event.target.value) })}
              className="mt-2 min-h-11 w-full accent-primary"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!source || busy}
              onClick={() =>
                updateCrop({
                  ...crop,
                  x: 0,
                  y: 0,
                  rotation: ((crop.rotation + 90) % 360) as PosterCrop['rotation'],
                })
              }
            >
              {text('90도 회전', 'Rotate 90°')}
            </Button>
            <Button
              variant="secondary"
              disabled={!source || busy}
              onClick={() => updateCrop(INITIAL_POSTER_CROP)}
            >
              {text('가운데 맞춤', 'Reset crop')}
            </Button>
            {/* 저장 뒤에는 그리지 않는다 — 올라간 포스터를 지우는 API가 없어 "제거"가 거짓말이 된다 */}
            {file && !saved && (
              <Button variant="ghost" disabled={busy} onClick={resetSelection}>
                {text('이미지 제거', 'Remove image')}
              </Button>
            )}
          </div>
          {errorText && (
            <p
              role="alert"
              className="m-0 rounded-control border border-danger p-3 text-sm leading-relaxed text-danger"
            >
              {errorText}
              {error === 'save' && failureCode && (
                <span className="mt-2 block break-all">
                  {text('코드', 'Code')}: {failureCode}
                </span>
              )}
            </p>
          )}
          {saved && (
            <div className="flex items-center gap-3 rounded-control bg-ground-2 p-3">
              {savedThumbUrl && (
                <img
                  src={savedThumbUrl}
                  alt={text('저장한 포스터', 'Saved poster')}
                  className="h-16 w-12 shrink-0 rounded-control object-cover"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p role="status" className="m-0 text-sm font-semibold text-ink">
                  <span aria-hidden className="mr-1 text-ok">
                    ✓
                  </span>
                  {text('포스터 저장 완료', 'Poster saved')}
                </p>
                <p className="m-0 text-xs text-muted">
                  {text(
                    '다른 이미지로 바꾸려면 변경을 누르세요.',
                    'Choose Change to use a different image.',
                  )}
                </p>
              </div>
              <Button variant="secondary" sm onClick={openPicker}>
                {text('변경', 'Change')}
              </Button>
            </div>
          )}
          <div className="mt-auto border-t border-line pt-4">
            <Button
              full
              disabled={!onUpload || !source || busy || saved}
              aria-busy={busy || undefined}
              onClick={() => void save()}
            >
              {!onUpload ? (
                text('이미지 저장 준비 중', 'Image saving unavailable')
              ) : busy ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={16} />
                  {text('업로드 중…', 'Uploading…')}
                </span>
              ) : (
                text('포스터 저장', 'Save poster')
              )}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
