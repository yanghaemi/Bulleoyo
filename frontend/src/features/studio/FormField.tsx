/**
 * 폼 필드 한 칸 — 라벨 · 입력 · 도움말 · 오류.
 *
 * 정본 — 화면설계 v6 각 화면의 **모바일·접근성 고려**(터치 타겟 44px) · §5.19 액션 배치
 *
 * 접근성 배선이 이 한 파일에서만 일어난다 —
 *   · `<label htmlFor>`가 컨트롤 `id`에 연결된다
 *   · 도움말·오류는 `aria-describedby`로 묶인다. 둘 다 있으면 **오류를 먼저** 읽게 순서를 잡는다
 *   · 오류가 있으면 `aria-invalid`가 붙는다(색만으로 알리지 않는다)
 *
 * 배선을 호출부에 맡기면 화면마다 하나씩 빠진다. 그래서 **렌더 프롭**으로 필요한 속성을
 * 컨트롤에 그대로 흘려보낸다 — 호출부는 `{...a}`만 펼치면 된다.
 *
 * 오류 문구는 `role="alert"`을 쓰지 않는다. 입력 중 글자마다 검증이 도는 필드에서
 * alert를 걸면 스크린리더가 매 타이핑을 가로챈다. 제출 실패처럼 화면이 통째로 바뀌는
 * 알림은 `StudioNotice`·`StudioErrorPanel`이 맡는다.
 */

import type { ReactNode } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'

/** 컨트롤에 그대로 펼쳐 넣는 속성 묶음 */
export interface FieldAria {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

interface Props {
  /** 컨트롤 id. 도움말·오류 id가 여기서 파생된다 */
  id: string
  label: ReactNode
  /** 입력 규칙 안내(글자 수 상한·단위 등). 오류와 함께 떠도 된다 */
  hint?: ReactNode
  /** 검증 실패 문구. 있으면 `aria-invalid`가 붙는다 */
  error?: string
  /** 라벨 옆 필수 표시. 별표만 두지 않고 "필수"를 함께 읽어 준다 */
  required?: boolean
  children: (aria: FieldAria) => ReactNode
}

export function FormField({ id, label, hint, error, required, children }: Props) {
  const { text } = useLocale()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  // 오류를 먼저 — 스크린리더가 도움말보다 실패 사유를 앞서 읽는다
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor={id} className="font-sans text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-1 font-normal text-danger">
            <span aria-hidden>*</span>
            <span className="sr-only">{text('필수', 'Required')}</span>
          </span>
        )}
      </label>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}

      {error && (
        <p id={errorId} className="m-0 font-sans text-[11px] font-semibold text-danger">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="m-0 font-sans text-[11px] text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
