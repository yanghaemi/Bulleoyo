/**
 * P-03 공연 일시 입력 — **공연 날짜 1개 + 시작 시각 · 종료 시각**(2026-09-26 사용자 요청).
 *
 * 우리 공연은 하루짜리 1회 공연이고 `startAt`·`endAt`은 그날의 시작·종료 시각이다
 * (`endAt`은 공연 종료 → 정산 시작의 기준). 예전 화면은 `datetime-local` 두 칸("공연 일시 ~
 * 공연 종료")이라 사용자가 여러 날에 걸친 **공연 기간**으로 읽었다. 그래서 날짜는 한 번만 받고
 * 시각 둘을 같은 행에 둔다.
 *
 * **API는 그대로다.** 폼 값(`PerformanceInfoValues.startAt`·`endAt`)도 예전처럼
 * `YYYY-MM-DDTHH:mm` KST 벽시계 두 개로 유지하고, 이 컴포넌트가 날짜 + 시각을 합쳐 넣는다.
 * 저장 경로(`kstInputToIso`)·검증(`validateInfo`)·KST 규칙(§5.13)은 손대지 않는다.
 *
 * **종료 시각이 시작보다 이르면 다음 날 종료로 읽는다**(예: 22:00 시작 · 02:00 종료).
 * 서버 검증은 `endAt > startAt` 하나라(`PerformanceService`) 다음 날 값도 통과하고, 하루 공연이
 * 자정을 넘기는 일은 실제로 있다. 대신 "다음 날 02:00에 끝나요"를 바로 보여 준다.
 * 같은 시각은 넘기지 않는다 — 24시간 공연이 되므로 검증 오류("종료 시각은 시작 시각보다 뒤")로 남긴다.
 */

import { useState } from 'react'

import { Input } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import { FormField } from '@/features/studio/FormField'

interface Parts {
  date: string
  start: string
  end: string
}

/** `YYYY-MM-DD` 다음 날. 달력 계산만 하므로 UTC로 돌려 시간대 영향을 받지 않는다 */
function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10)
}

function splitValues(startAt: string, endAt: string): Parts {
  return {
    date: startAt.slice(0, 10) || endAt.slice(0, 10),
    start: startAt.slice(11, 16),
    end: endAt.slice(11, 16),
  }
}

/** 날짜 + 시각 → 폼 값. 비어 있는 칸이 있으면 그 값은 빈 문자열 — 검증이 "입력해 주세요"로 잡는다 */
function joinParts({ date, start, end }: Parts): { startAt: string; endAt: string } {
  if (!date) return { startAt: '', endAt: '' }
  const startAt = start ? `${date}T${start}` : ''
  // 문자열 비교로 충분하다 — 둘 다 `HH:mm` 24시간제다
  const endDate = start && end && end < start ? nextDate(date) : date
  const endAt = end ? `${endDate}T${end}` : ''
  return { startAt, endAt }
}

export function PerformanceScheduleFields({
  startAt,
  endAt,
  startError,
  endError,
  readOnly,
  onChange,
}: {
  startAt: string
  endAt: string
  startError?: string
  endError?: string
  readOnly: boolean
  onChange: (patch: { startAt: string; endAt: string }) => void
}) {
  const { text } = useLocale()
  /*
   * 칸별 입력은 여기서 들고 있는다 — 날짜 없이 시각만 넣은 중간 상태는 폼 값(두 ISO)으로
   * 나타낼 수 없다. 폼 값이 **밖에서** 바뀌면(수정 모드의 서버 값 도착) 렌더 중에 다시 맞춘다.
   * 이펙트로 맞추면 한 프레임 동안 옛 값이 그려지고 lint(set-state-in-effect)에도 걸린다.
   */
  const [parts, setParts] = useState<Parts>(() => splitValues(startAt, endAt))
  const [seen, setSeen] = useState({ startAt, endAt })
  if (seen.startAt !== startAt || seen.endAt !== endAt) {
    setSeen({ startAt, endAt })
    const joined = joinParts(parts)
    if (joined.startAt !== startAt || joined.endAt !== endAt) setParts(splitValues(startAt, endAt))
  }

  const update = (patch: Partial<Parts>) => {
    const next = { ...parts, ...patch }
    setParts(next)
    onChange(joinParts(next))
  }

  // 종료가 시작과 다른 날이면 그 사실을 말한다 — 다음 날이면 "다음 날", 그 밖(예전 데이터)은 날짜째
  const startDate = startAt.slice(0, 10)
  const endDate = endAt.slice(0, 10)
  const endTime = endAt.slice(11, 16)
  let endNote: string | undefined
  if (startDate && endDate && endDate !== startDate) {
    endNote =
      endDate === nextDate(startDate)
        ? text(`다음 날 ${endTime}에 끝나요`, `Ends at ${endTime} the next day`)
        : text(`${endDate} ${endTime}에 끝나요`, `Ends on ${endDate} at ${endTime}`)
  }

  return (
    <div className="flex flex-col gap-4 md:col-span-2">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          id="perf-date"
          // §5.13 — 시각이 나오는 곳에 KST를 밝힌다. 입력도 KST 벽시계다(P-03 표)
          label={text('공연 날짜 (KST)', 'Show date (KST)')}
          required
          error={!parts.date ? startError : undefined}
        >
          {(a) => (
            <Input
              {...a}
              type="date"
              value={parts.date}
              disabled={readOnly}
              invalid={!parts.date && Boolean(startError)}
              onChange={(e) => update({ date: e.target.value })}
            />
          )}
        </FormField>

        {/* 시작·종료는 한 행이다 — 모바일에서도 나란히 둔다 */}
        <div className="grid grid-cols-2 gap-3">
          <FormField
            id="perf-start"
            label={text('시작 시각', 'Start time')}
            required
            error={parts.date ? startError : undefined}
          >
            {(a) => (
              <Input
                {...a}
                type="time"
                value={parts.start}
                disabled={readOnly}
                invalid={Boolean(parts.date && startError)}
                onChange={(e) => update({ start: e.target.value })}
              />
            )}
          </FormField>
          <FormField
            id="perf-end"
            label={text('종료 시각', 'End time')}
            required
            // 날짜가 비었으면 날짜 칸의 오류 하나로 충분하다
            error={parts.date ? endError : undefined}
            hint={endNote}
          >
            {(a) => (
              <Input
                {...a}
                type="time"
                value={parts.end}
                disabled={readOnly}
                invalid={Boolean(parts.date && endError)}
                onChange={(e) => update({ end: e.target.value })}
              />
            )}
          </FormField>
        </div>
      </div>
      <p className="m-0 font-sans text-[12px] leading-relaxed text-muted">
        {text(
          '하루 공연 기준이에요. 한국 시간(KST)으로 입력하고, 종료 시각은 정산 시작 기준이 돼요. 종료가 시작보다 이르면 다음 날 종료로 저장돼요.',
          'Shows run on a single day. Enter times in Korea Standard Time (KST). Settlement starts from the end time. An end time earlier than the start is saved as the next day.',
        )}
      </p>
    </div>
  )
}
