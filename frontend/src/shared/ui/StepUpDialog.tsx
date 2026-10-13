/**
 * 본인 확인(패스키 step-up) 대화상자 — 공연자 화면(P-03 보증금 · P-06 규칙 동의 · P-08 정산 동의·지급).
 *
 * 결제(A-05)는 같은 문구를 화면 안 패널로 그린다. 여기는 공용 `Modal`(모바일 하단 시트·PC 중앙)이다.
 * 버튼(`onConfirm`)은 클릭 핸들러 **첫 줄에서** 기기 인증 창을 여는 `useStepUp().confirm`이어야 한다.
 * 닫기(배경·Escape·취소 버튼)는 에러가 아니다 — 부른 화면은 원래 상태로 돌아간다.
 *
 * 블록체인 용어를 쓰지 않는다. 문구는 A-05와 같다(화면 v8 A-05).
 */

import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  open: boolean
  mode: 'loading' | 'register' | 'verify' | 'working' | 'unsupported'
  /** `'failed'`면 직전 시도가 실패했다는 한 줄을 보인다. */
  message?: string
  onConfirm: () => void
  onCancel: () => void
}

export function StepUpDialog({ open, mode, message, onConfirm, onCancel }: Props) {
  const { text } = useLocale()
  const title = text('본인 확인', 'Verify it’s you')
  const description =
    mode === 'unsupported'
      ? text('이 기기는 본인 확인을 지원하지 않습니다.', 'This device doesn’t support identity verification.')
      : mode === 'register'
        ? text(
            '처음 한 번 이 기기를 등록한 뒤 지문 또는 얼굴로 확인해 주세요.',
            'Register this device once, then verify with your fingerprint or face.',
          )
        : text('지문 또는 얼굴로 확인해 주세요.', 'Verify it’s you with your fingerprint or face.')

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      footer={
        <div className="flex flex-col gap-2">
          {(mode === 'register' || mode === 'verify') && (
            <Button full onClick={onConfirm}>
              {mode === 'register'
                ? text('이 기기 등록', 'Register this device')
                : text('본인 확인', 'Verify it’s you')}
            </Button>
          )}
          <Button full variant="secondary" onClick={onCancel}>
            {mode === 'unsupported' ? text('확인', 'OK') : text('취소', 'Cancel')}
          </Button>
        </div>
      }
    >
      {message === 'failed' && (
        <p role="alert" className="text-sm text-danger">
          {text('본인 확인에 실패했어요. 다시 시도해 주세요.', 'Verification failed. Please try again.')}
        </p>
      )}
      {(mode === 'loading' || mode === 'working') && (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          {mode === 'working'
            ? text('기기에서 확인해 주세요…', 'Confirm on your device…')
            : text('본인 확인을 준비하고 있어요…', 'Preparing verification…')}
        </p>
      )}
    </Modal>
  )
}
