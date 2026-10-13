/**
 * 프로필 수정 폼 — C-03 컴포넌트 표의 "폼 필드(바텀시트)".
 *
 * 수정 대상은 **이름 하나뿐**이다. 이메일·로그인 제공자는 소셜 로그인이 정하므로 바꾸지 않는다.
 * 입력 검증은 **1~40자**다 — API-member-06 Body 표와 백엔드 `UpdateProfileRequest`의
 * `@Size(min=1, max=40)`이 같은 값이다. (C-03 화면 설명의 "1~50자"는 어느 쪽에도 근거가 없어
 * 좁은 쪽인 계약을 따랐다. 50자를 허용하면 서버가 400으로 되돌려준다.)
 *
 * 표시 형태는 §5.19를 따른다 — 모바일은 **하단 시트**, PC는 **중앙 다이얼로그**.
 *
 * 저장은 호출부(C-03)가 `PATCH /api/v1/members/me`로 보낸다.
 */

import { useEffect, useRef, useState } from 'react'

import { Button, Input } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import { useMemberDialog } from './useMemberDialog'
import './member-refresh.css'

const MAX = 40

interface Props {
  open: boolean
  initialName: string
  onClose: () => void
  onSave: (name: string) => void
}

export function ProfileEditSheet({ open, initialName, onClose, onSave }: Props) {
  const { text } = useLocale()
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useMemberDialog(open, onClose, inputRef)

  useEffect(() => {
    if (open) {
      setName(initialName)
    }
  }, [open, initialName])

  if (!open) return null

  const trimmed = name.trim()
  const invalid = trimmed.length < 1 || trimmed.length > MAX

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label={text('닫기', 'Close')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={text('이름 수정', 'Edit name')}
        tabIndex={-1}
        className="member-dialog relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-t-card px-6 pb-7 pt-4 md:w-[440px] md:rounded-card md:px-8 md:py-8"
      >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!invalid) onSave(trimmed)
        }}
      >
        <div aria-hidden className="mx-auto mb-4 h-1 w-9 rounded-full bg-line md:hidden" />

        <h2 className="mb-3 font-sans text-[15px] font-bold text-ink md:mb-4 md:text-base">
          {text('이름 수정', 'Edit name')}
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-muted">{text('계정에서 사용할 이름을 입력해 주세요.', 'Choose the name shown on your account.')}</p>

        <label className="block">
          <span className="mb-2 block font-sans text-xs text-muted">{text('이름', 'Name')}</span>
          <Input
            ref={inputRef}
            value={name}
            maxLength={MAX}
            onChange={(e) => setName(e.target.value)}
            invalid={invalid}
            aria-describedby="profile-name-hint"
          />
        </label>

        <p id="profile-name-hint" className="mt-1.5 mb-4 flex justify-between font-sans text-[11px] text-muted">
          <span>
            {invalid && trimmed.length === 0
              ? text('이름을 입력해 주세요', 'Please enter your name')
              : ' '}
          </span>
          <span className="font-mono">
            {trimmed.length}/{MAX}
          </span>
        </p>

        <div className="flex gap-2">
          <Button type="submit" full disabled={invalid}>
            {text('저장', 'Save')}
          </Button>
          <Button type="button" variant="secondary" full onClick={onClose}>
            {text('취소', 'Cancel')}
          </Button>
        </div>
      </form>
      </div>
    </div>
  )
}
