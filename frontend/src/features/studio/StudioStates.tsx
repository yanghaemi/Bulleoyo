/**
 * 스튜디오 화면의 공통 상태 조각 — 에러 · 권한 없음 · 안내 배너 · 스켈레톤 · 빈 상태.
 *
 * 정본 — 화면설계 v6 §5.5 토스트(서버 `msg` 그대로) · §5.7 빈 상태(아이콘 없이 문구 + 다음 행동)
 *        · 각 화면 절의 **상태** 항목
 *
 * P-02·P-03·P-05가 같은 모양의 에러 패널·안내 배너를 쓴다. 화면마다 지역 함수로 두면
 * 같은 상황이 세 화면에서 조금씩 다르게 보인다.
 *
 * ⚠ P-07(`SalesStatus`)·P-08(`SettlementDashboard`)에는 아직 각자의 지역 `ErrorPanel`이 있다.
 * 이 파일이 그 둘을 흡수하는 것이 맞지만, 이번 작업 범위(P-02·P-03·P-05) 밖이라 손대지 않았다.
 * 두 화면을 다음에 만질 때 여기로 모은다.
 *
 * 이 파일은 **컴포넌트만** export한다(Fast Refresh). 상수·헬퍼는 `studioErrors.ts` 쪽에 있다.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Button } from '@/shared/ui'
import { PageSkeleton } from '@/shared/ui/PageSkeleton'
import { useLocale } from '@/shared/i18n/useLocale'

/** Consistent page hierarchy for all performer workflows. */
export function StudioHeading({
  title,
  section,
  children,
}: {
  title: ReactNode
  section: [string, string]
  children?: ReactNode
}) {
  const { text } = useLocale()
  return (
    <header className="studio-page-heading flex flex-wrap items-end gap-4 border-b border-line pb-7">
      <div className="min-w-0 flex-1">
        <h2 className="m-0 break-words font-sans text-2xl font-semibold tracking-tight text-ink md:text-3xl">
          {text(...section)}
        </h2>
        <p className="mt-2 mb-0 break-words text-sm text-muted">{title}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3 pb-1">{children}</div>}
    </header>
  )
}

/**
 * 조회 실패 패널.
 *
 * 서버 `msg`를 그대로 노출하고(§5.5) 클라이언트가 문구로 분기하지 않는다.
 * 다시 시도할 방법이 없으면(`onRetry` 없음) 버튼을 그리지 않는다 — 눌러도 아무 일 없는 버튼을
 * 두면 사용자가 같은 자리를 반복해서 누른다.
 */
export function StudioErrorPanel({
  title,
  msg,
  onRetry,
  action,
}: {
  /** 무엇을 못 했는지. 예 "팀 정보를 불러오지 못했습니다" */
  title: string
  /** 서버 `msg` 또는 `studioMessage(code)`가 만든 문구 */
  msg: string
  onRetry?: () => void
  /** 재시도 대신(또는 함께) 갈 곳이 있으면 여기 넣는다 */
  action?: ReactNode
}) {
  const { text } = useLocale()
  return (
    <section
      role="alert"
      className="rounded-card border border-danger bg-surface px-4 py-10 text-center"
    >
      <p className="m-0 mb-1 font-sans text-sm font-semibold text-ink">{title}</p>
      <p className="m-0 mb-4 font-sans text-[13px] text-muted">{msg}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {text('다시 시도', 'Try again')}
          </Button>
        )}
        {action}
      </div>
    </section>
  )
}

/**
 * 권한 없음 — 리더가 아니거나 생성자가 아닐 때 본문 전체를 덮는다.
 *
 * 403은 "잠시 후 다시"로 풀리지 않으므로 재시도 버튼을 두지 않고 **돌아갈 곳**만 준다.
 * 코드는 `COMMON_FORBIDDEN`(team_03·04) 또는 `PERFORMANCE_NOT_OWNER`(performance_04·05·13)다.
 */
export function StudioForbidden({ msg }: { msg: string }) {
  const { text } = useLocale()
  return (
    <section
      role="alert"
      className="rounded-card border border-line bg-surface px-4 py-14 text-center"
    >
      <p className="m-0 mb-1 font-sans text-lg font-semibold text-ink">
        {text('접근 권한이 없습니다', 'Access unavailable')}
      </p>
      <p className="m-0 mb-4 font-sans text-[13px] text-muted">{msg}</p>
      <Link
        to="/studio"
        className="inline-flex min-h-11 items-center rounded-control border border-line px-5 font-sans text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-ground-2"
      >
        {text('대시보드로', 'Back to dashboard')}
      </Link>
    </section>
  )
}

/**
 * 안내 배너. 색만으로 알리지 않도록 문구가 항상 본문을 갖는다(§1.2).
 *
 * `tone`은 테두리 색만 바꾼다 — 배경까지 칠하면 본문 카드와 위계가 뒤집힌다.
 *   · `warning` 아직 할 일이 남음(보증금 미납·잔액 부족·동의 초기화 경고)
 *   · `info`    읽고 넘어가면 되는 것(반환 조건·dust 귀속)
 *   · `danger`  실행이 막혔음
 */
export function StudioNotice({
  tone = 'info',
  title,
  children,
  action,
  id,
}: {
  tone?: 'info' | 'warning' | 'danger'
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  id?: string
}) {
  const border =
    tone === 'warning' ? 'border-warning' : tone === 'danger' ? 'border-danger' : 'border-line'
  return (
    <section
      id={id}
      role="status"
      className={`rounded-card border bg-surface px-5 py-5 md:px-6 ${border}`}
    >
      <p className="m-0 font-sans text-[13px] font-semibold text-ink md:text-sm">{title}</p>
      {children && (
        <div className="mt-1 font-sans text-[11px] leading-relaxed text-muted md:text-xs">
          {children}
        </div>
      )}
      {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
    </section>
  )
}

/**
 * 로딩 스켈레톤. 본문 골격과 **같은 자리**를 잡아 값이 들어올 때 화면이 튀지 않게 한다.
 * `rows`로 아래 블록 수를 조절한다.
 */
export function StudioSkeleton({ label, rows = 2 }: { label: string; rows?: number }) {
  return <PageSkeleton label={label} variant={rows === 0 ? 'form' : 'dashboard'} />
}

/** §5.7 빈 상태 — 아이콘·이미지 없이 안내 문구(+ 다음 행동은 호출부가 `action`으로) */
export function StudioEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-card border border-line bg-surface px-4 py-14 text-center"
    >
      <p className="m-0 font-sans text-[13px] text-muted">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
