/**
 * 준비 흐름 "다음 단계" 안내 모달 — P-05 규칙 저장 뒤 · P-06 우리 팀 동의 확정 뒤(9/24).
 *
 * 비가역 확인이 아니라 **안내**라 `ConfirmDialog`(alertdialog·확인 버튼 기본 포커스)가 아니라
 * 범용 `Modal`(dialog·`aria-labelledby`·포커스 트랩·Esc 닫기·모바일 하단 시트)을 쓴다.
 * 주 액션은 화면 이동이면 `Link`, 같은 화면의 동작이면 버튼이다. 보조 액션은 언제나 "닫기"다.
 */

import { Link } from 'react-router'

import { Button, Modal } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'

export type NextStepAction =
  | { label: string; to: string; state?: unknown }
  | { label: string; onClick: () => void }

const PRIMARY_LINK =
  'inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-bright md:w-auto'

export function NextStepDialog({
  open,
  title,
  body,
  primary,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  /** 없으면 "닫기"만 둔다(예: 참여팀 — 할 일이 남지 않았다) */
  primary?: NextStepAction
  onClose: () => void
}) {
  const { text } = useLocale()
  return (
    <Modal open={open} title={title} description={body} onClose={onClose}>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button variant="secondary" onClick={onClose}>
          {text('닫기', 'Close')}
        </Button>
        {primary &&
          ('to' in primary ? (
            <Link to={primary.to} state={primary.state} className={PRIMARY_LINK}>
              {primary.label}
            </Link>
          ) : (
            <Button onClick={primary.onClick}>{primary.label}</Button>
          ))}
      </div>
    </Modal>
  )
}
