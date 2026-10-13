/**
 * 관리자 화면(M-02·M-03)의 공통 조각 — 패널 · 배너 · 배지 · tx 링크 · 상태(로딩/빈/에러/권한).
 *
 * 정본 — 화면설계 v6 §5.1 상태 배지 · §5.3 tx 링크 · §5.7 빈 상태 · §5.21 표 → 패널 접기
 *        · M-02·M-03의 **상태** 항목
 *
 * 스튜디오의 `StudioStates.tsx`와 같은 역할이지만 **다른 파일**이다. features끼리 import하지
 * 않는 것이 구조 규칙이고(기술 스택 §3.2), 관리자 화면은 배지 종류(이의 상태·체인 작업 상태)와
 * 배너 톤(중단 경고)이 달라 그대로 가져다 쓸 수 없다.
 *
 * **이 파일은 컴포넌트만 export한다**(Fast Refresh). 코드 표·검증은
 * `adminMessages.ts`·`adminForms.ts`에 있다.
 *
 * 색 규칙 — 상태를 색으로만 알리지 않는다(§1.2 · M-02·M-03 접근성 항목).
 * 배지는 라벨이 정보를 다 갖고, 중단 경고는 색이 아니라 **문구와 배너 위치**로 구분한다.
 */

import type { ReactNode } from 'react'

import { CHAIN_JOB_LABEL, DISPUTE_STATUS_LABEL } from '@/features/admin/adminMessages'
import type { ChainJobStatus, DisputeStatus } from '@/features/admin/adminTypes'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, shortenHex } from '@/shared/ui'

/* ────────────────────────── 골격 ────────────────────────── */

/**
 * 본문 패널 하나. 제목 + (선택) 우측 액션 + 본문.
 *
 * M-02·M-03의 본문은 전부 "제목 붙은 카드"의 나열이라 같은 껍데기를 쓴다.
 * 제목을 `h2`로 두어 스크린리더가 화면 구조를 훑을 수 있게 한다.
 */
export function AdminPanel({
  title,
  description,
  action,
  children,
  id,
}: {
  title: string
  /** 제목 아래 한 줄 설명. 명세의 안내 문구가 여기 온다 */
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  id?: string
}) {
  return (
    <section
      id={id}
      className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 font-sans text-sm font-bold text-ink md:text-[15px]">{title}</h2>
          {description && (
            <p className="m-0 mt-1 font-sans text-[11px] leading-relaxed text-muted md:text-xs">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * 폼 필드 한 칸 — 라벨 + 입력 + (선택) 도움말/오류.
 *
 * 오류를 색으로만 알리지 않기 위해 문구를 항상 함께 쓰고 `aria-describedby`로 묶는다.
 * 입력 요소는 호출부가 넘긴다(이 컴포넌트는 값을 모른다).
 */
export function AdminField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string
  htmlFor: string
  hint?: ReactNode
  error?: string
  required?: boolean
  children: ReactNode
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined
  const errorId = error ? `${htmlFor}-error` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-sans text-[11px] font-semibold text-muted md:text-xs"
      >
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </label>
      <div aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}>
        {children}
      </div>
      {hint && (
        <p id={hintId} className="m-0 font-sans text-[11px] leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="m-0 font-sans text-[11px] leading-relaxed text-danger"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * 라벨 + 값 한 줄. `InfoRow`(shared)와 달리 **라벨 폭을 고정하지 않는다** —
 * 관리자 화면의 라벨("깨진 불변식 번호", "이의제기 마감")이 20자를 넘어 잘린다.
 */
export function AdminRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1">
      <span className="shrink-0 font-sans text-[11px] leading-5 text-muted md:text-xs">
        {label}
      </span>
      <span className="min-w-0 font-sans text-[13px] font-medium leading-5 text-ink tabular-nums md:text-sm">
        {children}
      </span>
    </div>
  )
}

/* ────────────────────────── 배지 ────────────────────────── */

/**
 * 이의제기 상태 배지 — §5.1 `Dispute` 행(검토 중 / 처리 완료 / 반려).
 *
 * §5.1 표의 en 칸이 `—`다("관리자 화면 전용이므로 ko만 정의한다"). 그래서 **한글만** 쓴다.
 * 색은 세 덩어리로만 나눈다: 아직 볼 것(검토 중) · 끝난 것(처리 완료) · 되돌린 것(반려).
 */
export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const { language } = useLocale()
  const className =
    status === 'OPEN'
      ? 'bg-surface text-ink border border-warning'
      : status === 'RESOLVED'
        ? 'bg-primary text-white'
        : 'bg-ground-2 text-muted'
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip px-2 font-sans text-[11px] font-semibold ${className}`}
    >
      {language === 'ko'
        ? (DISPUTE_STATUS_LABEL[status] ?? status)
        : ({ OPEN: 'Open', RESOLVED: 'Resolved', REJECTED: 'Rejected' }[status] ?? status)}
    </span>
  )
}

/**
 * 체인 작업 상태 배지 — §5.1 `ChainJob.status` 행.
 * `PENDING`·`SUBMITTED`가 **같은 "처리 중"** 이다(§5.1 표 그대로).
 */
export function ChainJobStatusBadge({ status }: { status: ChainJobStatus }) {
  const { language } = useLocale()
  const className =
    status === 'CONFIRMED'
      ? 'bg-primary text-white'
      : status === 'FAILED'
        ? 'bg-surface text-danger border border-danger'
        : 'bg-ground-2 text-muted'
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip px-2 font-sans text-[11px] font-semibold ${className}`}
    >
      {language === 'ko'
        ? (CHAIN_JOB_LABEL[status] ?? status)
        : ({
            PENDING: 'Processing',
            SUBMITTED: 'Processing',
            CONFIRMED: 'Confirmed',
            FAILED: 'Failed',
          }[status] ?? status)}
    </span>
  )
}

/**
 * tx·주소 링크 — §5.3.
 *
 * 앞 6자리…뒤 4자리로 축약(`shortenHex`)하고 **새 창**으로 익스플로러를 연다.
 * 링크 주소(`explorerUrl`)는 서버 응답 값을 그대로 쓴다 — 프론트가 조립하지 않는다.
 * M-03은 블록체인 어휘를 노출해도 되는 화면이다(§1.2 원칙 11).
 *
 * `url`이 없으면 링크 없이 축약 문자열만 — 값을 숨기지 않는다.
 */
export function TxLink({
  value,
  url,
  label,
}: {
  value: string
  url?: string | null
  label?: string
}) {
  const text = shortenHex(value)
  if (!url) {
    return (
      <span className="font-mono text-[12px] text-muted" title={value}>
        {text}
      </span>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={value}
      aria-label={label ? `${label} ${value}` : value}
      className="font-mono text-[12px] text-primary underline decoration-line underline-offset-2 transition-colors duration-150 ease-out hover:text-primary-bright"
    >
      {text}
    </a>
  )
}

/* ────────────────────────── 상태 ────────────────────────── */

/**
 * 조회 실패 패널. 서버 `msg`(또는 코드 표 문구)를 그대로 노출한다(§5.5).
 * 다시 시도할 방법이 없으면 버튼을 그리지 않는다.
 */
export function AdminErrorPanel({
  title,
  msg,
  onRetry,
  action,
}: {
  title: string
  msg: string
  onRetry?: () => void
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
 * 권한 없음 — 401·403. 본문 전체를 덮는다.
 *
 * 403은 "잠시 후 다시"로 풀리지 않으므로 재시도 버튼을 두지 않는다.
 * 관리자 화면에는 돌아갈 상위 화면이 없어(M-02가 기본 진입) 안내만 남긴다.
 */
export function AdminForbidden({ msg }: { msg: string }) {
  const { text } = useLocale()
  return (
    <section
      role="alert"
      className="rounded-card border border-line bg-surface px-4 py-14 text-center"
    >
      <p className="m-0 mb-1 font-sans text-sm font-semibold text-ink">
        {text('권한이 없습니다', 'Access denied')}
      </p>
      <p className="m-0 font-sans text-[13px] text-muted">{msg}</p>
    </section>
  )
}

/**
 * 안내·경고 배너. 색만으로 알리지 않도록 본문 문구를 항상 갖는다.
 *
 * `tone`은 테두리만 바꾼다 — 배경까지 칠하면 본문 카드와 위계가 뒤집힌다.
 *   · `info`    읽고 넘어가면 되는 것(환율 용도 안내·지급 한도)
 *   · `warning` 아직 할 일이 남음(환율 미등록·체인 설정 대기)
 *   · `danger`  실행이 막혔음(발행량 대사 불일치로 지급 중단)
 *
 * `sticky`는 M-03 중단 배너 전용이다 — §5.17이 "헤더는 스크롤에 따라붙지 않는다.
 * 예외는 V-02의 중단 배너와 **M-03의 중단 배너**뿐"이라고 못박았다.
 */
export function AdminNotice({
  tone = 'info',
  title,
  children,
  action,
  sticky,
  id,
}: {
  tone?: 'info' | 'warning' | 'danger'
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  sticky?: boolean
  id?: string
}) {
  const border =
    tone === 'warning' ? 'border-warning' : tone === 'danger' ? 'border-danger' : 'border-line'
  return (
    <section
      id={id}
      role={tone === 'danger' ? 'alert' : 'status'}
      className={[
        'rounded-card border bg-surface px-4 py-3 md:px-5 md:py-3.5',
        border,
        // 배너가 뜬 동안 지급 버튼이 비활성이라, 스크롤과 무관하게 이유가 보여야 한다(M-03 레이아웃)
        sticky ? 'sticky top-0 z-20 shadow-sm' : '',
      ].join(' ')}
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

/** 로딩 스켈레톤. 본문 골격과 같은 자리를 잡아 값이 들어올 때 화면이 튀지 않게 한다 */
export function AdminSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-4">
      <div className="h-9 w-48 animate-pulse rounded-control bg-ground-2" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-card bg-ground-2" />
      ))}
    </div>
  )
}

/** §5.7 빈 상태 — 아이콘·이미지 없이 안내 문구(+ 다음 행동은 호출부가 `action`으로) */
export function AdminEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-card border border-line bg-surface px-4 py-12 text-center"
    >
      <p className="m-0 font-sans text-[13px] text-muted">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/**
 * 폼 실행 결과 한 줄. 성공·실패 모두 여기로 나온다.
 *
 * 성공을 토스트로만 알리지 않는 이유 — 돈을 움직인 결과라 화면에 남아 있어야 한다.
 * `tone="danger"`는 `role="alert"`로 즉시 읽히게 한다.
 */
export function AdminResultLine({
  tone,
  children,
}: {
  tone: 'ok' | 'danger' | 'info'
  children: ReactNode
}) {
  const cls =
    tone === 'ok'
      ? 'border-ok text-ink'
      : tone === 'danger'
        ? 'border-danger text-ink'
        : 'border-line text-muted'
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`m-0 rounded-card border bg-ground px-3 py-2 font-sans text-[12px] leading-relaxed ${cls}`}
    >
      {children}
    </p>
  )
}
