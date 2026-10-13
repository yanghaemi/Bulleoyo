/**
 * P-03 공연 형태 선택 — "혼자 공연해요" / "다른 팀과 함께 공연해요"(2026-09-26 사용자 요청).
 *
 * 정보 단계의 작은 체크박스를 사용자가 보지 못하고 지나쳤다. 공연 형태는 준비 흐름의 모양을
 * 바꾸고(합동이면 참여팀 단계가 선다) **저장 뒤에는 바꿀 수 없다**(`PerformanceUpdateRequest`에
 * `jointPerformance`가 없다). 그래서 폼보다 먼저 큰 선택 카드 둘로 묻는다.
 *
 * 카드를 누르면 그 자리에서 고른 것으로 끝난다 — 확인 버튼을 한 번 더 두지 않는다.
 * 다시 열면(폼의 "변경") 지금 값이 선택 배경으로 보인다.
 */

import { Modal } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  open: boolean
  /** 지금 값. 처음 열 때는 아직 고르지 않아 `undefined`다 */
  value?: boolean
  onSelect: (jointPerformance: boolean) => void
  onClose: () => void
}

export function JointChoiceDialog({ open, value, onSelect, onClose }: Props) {
  const { text } = useLocale()
  const options: { joint: boolean; title: string; body: string }[] = [
    {
      joint: false,
      title: text('혼자 공연해요', 'Just our team'),
      body: text(
        '우리 팀만 무대에 올라요. 수익은 우리 팀이 모두 받아요.',
        'Only your team performs. Your team keeps all the revenue.',
      ),
    },
    {
      joint: true,
      title: text('다른 팀과 함께 공연해요', 'With other teams'),
      body: text(
        '여러 팀이 함께 무대에 올라요. 다음 단계에서 참여팀을 초대하고 수익을 나눠요.',
        'Several teams share the stage. You invite them next and split the revenue.',
      ),
    },
  ]

  return (
    <Modal
      open={open}
      title={text('어떤 공연인가요?', 'What kind of show is it?')}
      description={text(
        '공연을 저장한 뒤에는 바꿀 수 없어요.',
        'This cannot be changed after the show is saved.',
      )}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {options.map((option) => {
          const selected = value === option.joint
          return (
            <button
              key={String(option.joint)}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(option.joint)}
              className={[
                'flex min-h-24 w-full flex-col items-start gap-1.5 rounded-card border border-line px-5 py-4 text-left',
                'transition-colors duration-150 ease-out',
                selected ? 'bg-sel-soft' : 'bg-surface hover:bg-ground-2',
              ].join(' ')}
            >
              <span className="font-sans text-base font-bold text-ink">{option.title}</span>
              <span className="font-sans text-[13px] leading-relaxed text-muted">
                {option.body}
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
