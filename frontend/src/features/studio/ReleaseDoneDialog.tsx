/**
 * P-08 "정산금 지급이 완료되었습니다" 안내 모달(9/24 사용자 요청).
 *
 * 띄우는 조건은 둘이다.
 *   ① 이 화면에서 "정산금 지급"을 눌렀고 그 job이 CONFIRMED가 됐다 → `notify()`를 부른다.
 *   ② 누르지 않았어도, 이 화면을 보는 동안 폴링으로 정산 `status`가 RELEASED가 아닌 값 →
 *      `RELEASED`로 바뀌는 것을 관측했다(전원 조기 동의 뒤 자동 release).
 * 첫 관측이 이미 RELEASED면 비교 대상이 없으므로 띄우지 않는다. ①과 ②가 연달아 성립해도
 * (수동 지급 확정 뒤 재조회가 RELEASED를 가져온다) 같은 공연에서는 한 번만 띄운다.
 * FAILED job은 여기로 오지 않는다 — 기존 실패 문구가 처리한다.
 *
 * 비가역 확인이 아니라 안내라 `ConfirmDialog`가 아니라 범용 `Modal`을 쓴다(`NextStepDialog`와 같은 이유).
 */

import { Link } from 'react-router'

import { Button, Modal, formatYoyo } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import type { SettlementData } from '@/shared/api/domains/settlement'

export function ReleaseDoneDialog({
  open,
  data,
  onClose,
}: {
  open: boolean
  data: SettlementData
  onClose: () => void
}) {
  const { text } = useLocale()
  const myTeamId = data.myTeam?.teamId
  // 보증금 반환은 release 뒤에 이어지는 별도 작업이다. 아직 PAID면 곧 돌아온다는 것만 알린다
  const depositPending = data.deposit.status === 'PAID'

  return (
    <Modal
      open={open}
      title={text('정산금 지급이 완료되었습니다', 'Settlement paid out')}
      description={text(
        '정산금이 각 팀 리더 지갑으로 분배되었습니다.',
        'Payouts have been distributed to each team leader’s wallet.',
      )}
      onClose={onClose}
    >
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {data.shares.map((s) => {
          const mine = s.teamId === myTeamId
          return (
            <li
              key={s.teamId}
              aria-current={mine ? 'true' : undefined}
              className={[
                'flex items-center justify-between gap-3 rounded-control px-3 py-2 font-sans text-sm',
                mine ? 'bg-sel-soft font-bold text-ink' : 'text-ink',
              ].join(' ')}
            >
              <span className="break-keep">
                {s.teamName}
                {mine && (
                  <span className="ml-1 font-normal text-muted">
                    {text('(우리 팀)', '(Your team)')}
                  </span>
                )}
              </span>
              <span className="font-num tabular-nums">{formatYoyo(s.totalAmount)}</span>
            </li>
          )
        })}
      </ul>
      {depositPending && (
        <p className="m-0 mt-3 font-sans text-[13px] text-muted">
          {text('보증금은 곧 반환됩니다.', 'The deposit will be returned shortly.')}
        </p>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Link
          to={`/verify/${data.performanceId}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-line bg-surface px-5 font-sans text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-ground-2 md:w-auto"
        >
          {text('정산 검증 보기', 'View verification')}
        </Link>
        <Button onClick={onClose}>{text('확인', 'OK')}</Button>
      </div>
    </Modal>
  )
}
