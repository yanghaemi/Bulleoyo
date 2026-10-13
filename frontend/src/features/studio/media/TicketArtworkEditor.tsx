import { useId, useRef, useState } from 'react'
import { isApiError } from '@/shared/api/client'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button } from '@/shared/ui'
import { renderTicketArtwork } from './ticketArtwork'
import type { TicketArtworkText } from './ticketArtwork'
import { useArtworkImage } from './useArtworkImage'

const COLORS = [
  { color: '#3129dd', ko: '브랜드 바이올렛', en: 'Brand violet' },
  { color: '#175447', ko: '딥 그린', en: 'Deep green' },
  { color: '#8c2948', ko: '로즈', en: 'Rose' },
  { color: '#243349', ko: '미드나잇', en: 'Midnight' },
] as const

/** D-24/D-24A 티켓 아트워크 편집기. Lab과 실제 공연 흐름이 같은 컴포넌트를 공유한다. */
export function TicketArtworkEditor({
  initialTitle = '',
  initialDateTime = '',
  initialVenue = '',
  onUpload,
}: {
  initialTitle?: string
  initialDateTime?: string
  initialVenue?: string
  /** Resolve only when the actual artwork upload has completed. */
  onUpload?: (image: Blob) => Promise<void>
}) {
  const { text } = useLocale()
  const id = useId()
  const [mode, setMode] = useState<'DESIGN' | 'UPLOAD'>('DESIGN')
  const [fields, setFields] = useState<TicketArtworkText>({
    title: initialTitle,
    subtitle: '',
    dateTime: initialDateTime,
    venue: initialVenue,
  })
  const [accent, setAccent] = useState<string>(COLORS[0].color)
  const design = useArtworkImage()
  const upload = useArtworkImage()
  const selected = mode === 'DESIGN' ? design : upload
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const submitting = useRef(false)
  const wrongRatio =
    selected.image &&
    Math.abs(selected.image.naturalWidth / selected.image.naturalHeight - 2.5) > 0.01
  const ready =
    mode === 'DESIGN'
      ? Boolean(fields.title.trim()) && (!design.file || Boolean(design.image))
      : Boolean(upload.image)
  const edited = () => {
    setSaved(false)
    setSaveError(undefined)
  }
  const switchMode = (next: 'DESIGN' | 'UPLOAD') => {
    if (!busy) {
      setMode(next)
      edited()
    }
  }
  const save = async () => {
    if (!onUpload || !ready || submitting.current) return
    submitting.current = true
    setBusy(true)
    setSaved(false)
    setSaveError(undefined)
    try {
      await document.fonts?.ready
      const blob = await renderTicketArtwork({
        mode,
        image: selected.image,
        position: selected.position,
        accent,
        text: fields,
      })
      if (blob.size > 5 * 1024 * 1024) throw new Error('CLIENT_OUTPUT_TOO_LARGE')
      await onUpload(blob)
      setSaved(true)
    } catch (failure) {
      setSaveError(
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
  const imageError =
    selected.error &&
    {
      type: text(
        'JPEG, PNG, WebP 이미지를 선택해 주세요. 이전 파일은 유지됩니다.',
        'Choose a JPEG, PNG or WebP image. Your previous file is kept.',
      ),
      size: text(
        '내용이 있는 20MB 이하 이미지를 선택해 주세요. 이전 파일은 유지됩니다.',
        'Choose a non-empty image up to 20MB. Your previous file is kept.',
      ),
      decode: text(
        '이미지를 읽지 못했습니다. 파일은 남아 있으니 다른 이미지로 교체해 주세요.',
        'The image could not be decoded. Your file is kept; choose another image.',
      ),
    }[selected.error]

  /**
   * 배경(DESIGN)·티켓(UPLOAD) 이미지 입력 — 모드마다 한 곳에만 그린다(id 중복 없음).
   * DESIGN에서는 강조색 옆 칸, UPLOAD에서는 미리보기 아래 원래 자리(9/26).
   */
  const imageControl = (
    <>
      <label htmlFor={`${id}-file`} className="mb-2 block text-sm font-semibold text-ink">
        {mode === 'DESIGN'
          ? text('배경 이미지', 'Background image')
          : text('티켓 이미지', 'Ticket image')}
      </label>
      <input
        id={`${id}-file`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        className="block w-full min-w-0 rounded-control border border-line p-2 text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-ground file:px-3 file:py-2 file:text-ink"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) {
            selected.select(file)
            edited()
          }
        }}
      />
      <p className="mt-2 text-xs text-muted">
        {text(
          'JPEG · PNG · WebP / 편집 원본 최대 20MB',
          'JPEG · PNG · WebP / source image up to 20MB',
        )}
      </p>
      {selected.file && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="min-w-0 break-all text-sm text-ink">{selected.file.name}</span>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              selected.remove()
              edited()
            }}
          >
            {text('이미지 제거', 'Remove image')}
          </Button>
        </div>
      )}
      {wrongRatio && (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {text(
            '원본 비율이 달라 5:2로 잘라 표시합니다. 아래에서 남길 위치를 조절해 주세요.',
            'This image is cropped to 5:2. Adjust the position below to choose the visible area.',
          )}
        </p>
      )}
      {selected.image && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(['x', 'y'] as const).map((axis) => (
            <label key={axis} className="text-sm font-medium text-ink">
              {axis === 'x'
                ? text('가로 위치', 'Horizontal position')
                : text('세로 위치', 'Vertical position')}
              <input
                type="range"
                min="0"
                max="100"
                value={selected.position[axis]}
                disabled={busy}
                className="block min-h-11 w-full accent-primary"
                onChange={(event) => {
                  selected.setPosition({
                    ...selected.position,
                    [axis]: Number(event.target.value),
                  })
                  edited()
                }}
              />
            </label>
          ))}
        </div>
      )}
    </>
  )

  return (
    <section
      className="min-w-0 rounded-card border border-line bg-surface p-5 md:p-7"
      aria-labelledby={`${id}-title`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
        <h2 id={`${id}-title`} className="m-0 text-xl font-semibold text-ink">
          {text('티켓 꾸미기', 'Decorate ticket')}
        </h2>
        <span className="text-xs font-medium text-muted">5:2 · 1800 × 720</span>
      </div>
      <div
        className="mt-5 flex gap-2"
        role="tablist"
        aria-label={text('티켓 제작 방식', 'Artwork mode')}
      >
        {(['DESIGN', 'UPLOAD'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${id}-${value}`}
            aria-selected={mode === value}
            aria-controls={`${id}-panel`}
            disabled={busy}
            tabIndex={mode === value ? 0 : -1}
            onClick={() => switchMode(value)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault()
                const next =
                  event.key === 'Home'
                    ? 'DESIGN'
                    : event.key === 'End'
                      ? 'UPLOAD'
                      : mode === 'DESIGN'
                        ? 'UPLOAD'
                        : 'DESIGN'
                switchMode(next)
                document.getElementById(`${id}-${next}`)?.focus()
              }
            }}
            className={`min-h-11 flex-1 rounded-control border px-3 text-sm font-semibold ${mode === value ? 'border-primary bg-primary/10 text-primary' : 'border-line text-muted'}`}
          >
            {value === 'DESIGN'
              ? text('직접 디자인', 'Design artwork')
              : text('이미지 업로드', 'Upload artwork')}
          </button>
        ))}
      </div>
      {!onUpload && (
        <p role="status" className="mt-4 text-sm leading-relaxed text-muted">
          {text(
            'Lab 미리보기는 저장되지 않습니다. 이미지 저장 기능이 연결되면 공연 티켓에 사용할 수 있습니다.',
            'This Lab preview is not saved. Image saving must be connected before it can be used for show tickets.',
          )}
        </p>
      )}
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${mode}`}>
        <div
          className="relative mt-5 aspect-[5/2] w-full overflow-hidden rounded-control border border-line"
          style={{
            backgroundColor: mode === 'DESIGN' ? accent : 'var(--color-ground)',
            containerType: 'inline-size',
          }}
        >
          {selected.url && (
            <img
              key={selected.url}
              src={selected.url}
              alt={text('티켓 이미지 미리보기', 'Ticket artwork preview')}
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `${selected.position.x}% ${selected.position.y}%` }}
              onLoad={(event) => selected.loaded(event.currentTarget)}
              onError={selected.failed}
            />
          )}
          {mode === 'DESIGN' ? (
            <>
              {selected.url && <div className="absolute inset-0 bg-black/65" aria-hidden="true" />}
              {selected.url && (
                <div
                  className="absolute inset-y-0 left-0 w-[1.1%]"
                  style={{ backgroundColor: accent }}
                  aria-hidden="true"
                />
              )}
              <div
                className="absolute top-[10%] left-[6%] font-semibold text-white"
                style={{ fontSize: '1.8cqw' }}
              >
                LIVE PERFORMANCE
              </div>
              <div
                className="absolute top-[32%] left-[6%] w-[88%] truncate font-bold leading-none text-white"
                style={{ fontSize: '7cqw' }}
              >
                {fields.title || text('공연 제목', 'Show title')}
              </div>
              <div
                className="absolute top-[55%] left-[6%] w-[88%] truncate text-white"
                style={{ fontSize: '3cqw' }}
              >
                {fields.subtitle}
              </div>
              <div
                className="absolute top-[80%] left-[6%] w-[88%] truncate font-medium text-white"
                style={{ fontSize: '2.3cqw' }}
              >
                {[fields.dateTime, fields.venue].filter(Boolean).join(' · ')}
              </div>
            </>
          ) : (
            !selected.url && (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted">
                {text('완성한 티켓 이미지를 선택해 주세요', 'Choose your finished ticket artwork')}
              </div>
            )
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {text(
            '공연 정보만 담는 정적 이미지입니다. 입장 QR과 실제 티켓 정보는 발급 화면에서 별도로 표시됩니다.',
            'This is static artwork. Entry QR and actual ticket details are shown separately on the issued ticket.',
          )}
        </p>
        {mode === 'DESIGN' && (
          <>
            {/* 강조색 옆에 배경 이미지를 둔다 — 768px 미만에서는 강조색 바로 아래로 쌓인다(9/26) */}
            <div className="mt-5 grid min-w-0 gap-5 md:grid-cols-2">
              <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy}>
                <legend className="mb-2 text-sm font-semibold text-ink">
                  {text('강조색', 'Accent color')}
                </legend>
                <div className="flex flex-wrap gap-3">
                  {COLORS.map((color) => (
                    <button
                      key={color.color}
                      type="button"
                      aria-label={text(color.ko, color.en)}
                      aria-pressed={accent === color.color}
                      onClick={() => {
                        setAccent(color.color)
                        edited()
                      }}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-white ${accent === color.color ? 'border-ink ring-2 ring-line ring-offset-2 ring-offset-surface' : 'border-transparent'}`}
                      style={{ backgroundColor: color.color }}
                    >
                      <span aria-hidden="true">{accent === color.color ? '✓' : ''}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="min-w-0">{imageControl}</div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {(
                [
                  ['title', text('메인 타이틀', 'Main title')],
                  ['subtitle', text('서브 타이틀', 'Subtitle')],
                  ['dateTime', text('날짜·시간', 'Date and time')],
                  ['venue', text('장소·구역', 'Venue and area')],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block min-w-0 text-sm font-semibold text-ink">
                  {label}
                  <input
                    value={fields[key]}
                    maxLength={key === 'title' ? 100 : 120}
                    disabled={busy}
                    onChange={(event) => {
                      setFields((current) => ({ ...current, [key]: event.target.value }))
                      edited()
                    }}
                    className="mt-2 block min-h-11 w-full rounded-control border border-line bg-surface px-3 font-normal text-ink"
                  />
                </label>
              ))}
            </div>
          </>
        )}
        {mode === 'UPLOAD' && <div className="mt-5 border-t border-line pt-4">{imageControl}</div>}
        {imageError && (
          <p role="alert" className="rounded-control border border-danger p-3 text-sm text-danger">
            {imageError}
          </p>
        )}
        {saveError && (
          <p
            role="alert"
            className="rounded-control border border-danger p-3 text-sm leading-relaxed text-danger"
          >
            {text(
              '이미지를 저장하지 못했습니다. 파일과 입력값은 남아 있습니다. 다시 시도하거나 더 작은 이미지로 교체해 주세요.',
              'The artwork could not be saved. Your files and inputs are kept. Try again or choose a smaller image.',
            )}
            <span className="mt-2 block break-all">
              {text('코드', 'Code')}: {saveError}
            </span>
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-ink">
            {text('티켓 이미지 저장 완료', 'Ticket artwork saved')}
          </p>
        )}
        <div className="mt-5 border-t border-line pt-4">
          <Button full disabled={!onUpload || !ready || busy || saved} onClick={() => void save()}>
            {!onUpload
              ? text('이미지 저장 준비 중', 'Image saving unavailable')
              : busy
                ? text('저장 중…', 'Saving…')
                : text('티켓 이미지 저장', 'Save ticket artwork')}
          </Button>
        </div>
      </div>
    </section>
  )
}
