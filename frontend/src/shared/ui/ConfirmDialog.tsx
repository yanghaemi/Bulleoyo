/**
 * 확인 모달 — 화면설계 v6 §5.6 · §5.19.
 *
 * **비가역 액션은 어느 폭에서든 이 모달을 거친다.**
 * 표시 형태만 폭에 따라 다르다 — 모바일은 **하단에서 올라오는 시트**, PC는 **중앙 다이얼로그(400px)**.
 *
 * 접근성 — Escape로 닫히고, 열릴 때 확인 버튼에 포커스가 간다. 배경 클릭도 취소로 본다.
 * 열린 동안 포커스와 배경 스크롤을 다이얼로그 안에 가두고 닫히면 기존 포커스를 복원한다.
 * 되돌릴 수 없는 액션이므로 확인 버튼을 기본 포커스로 두되 `variant="danger"`로 색을 분리한다.
 *
 * 2026-09-08 등장·퇴장 전환 — 전에는 `open`이 바뀌는 순간 시트가 화면에 툭 나타났다.
 * "하단에서 올라온다"는 §5.19의 서술이 실제 동작이 아니라 위치 설명에 그쳤던 셈이다.
 * 키프레임 없이 **마운트 후 한 프레임 뒤 클래스 토글**로 220ms 전환을 준다
 * (모바일: 아래→위 슬라이드 / PC: 페이드 + 95%→100% 스케일).
 * 닫힐 때도 같은 시간만큼 DOM에 남겨 역방향으로 전환한 뒤 언마운트한다 —
 * 그 사이에는 `pointer-events-none`이라 사라지는 배경이 클릭을 먹지 않는다.
 * `prefers-reduced-motion`은 `styles.css`의 전역 규칙이 전환을 0.01ms로 줄여 즉시 표시된다.
 *
 * ⚠ 전환 목록이 `translate,scale,opacity`인 이유 — Tailwind v4의 `translate-y-*`·`scale-*`는
 * `transform`이 아니라 같은 이름의 개별 속성을 낸다. `transform`이라 적으면 아무것도 전환되지 않는다.
 */

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/shared/ui/Button'
import { useLocale } from '@/shared/i18n/useLocale'
import { restoreFocusIfSafe, trapFocus } from '@/shared/ui/focusTrap'

/** 등장·퇴장 전환 시간(ms). 전환 클래스의 duration과 같은 값이어야 한다 */
const TRANSITION_MS = 220

interface Props {
  open: boolean
  title: string
  /** 본문. 금액처럼 강조가 필요한 값은 호출부에서 마크업으로 넘긴다 */
  body?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** 확인 버튼 색. 되돌릴 수 없으면 danger */
  confirmVariant?: 'primary' | 'danger'
  /**
   * **비동기 작업이 도는 중인가.** 확인 버튼을 잠그고, 닫기 경로도 함께 잠근다
   * (`closableWhileBusy`로 풀 수 있다). 포커스도 확인 버튼이 아니라 다이얼로그로 간다.
   *
   * ⚠ **입력 검증을 여기 섞지 않는다.** "사유가 비었다"를 `busy`로 넘기면 닫기와 포커스까지
   * 같이 잠긴다 — 확인 버튼만 잠그려면 `confirmDisabled`를 쓴다.
   */
  busy?: boolean
  /**
   * 확인 버튼만 잠근다. 닫기·배경·Escape·포커스는 그대로다.
   *
   * 입력이 아직 유효하지 않을 때 쓴다(P-10 취소 사유가 비어 있는 등).
   */
  confirmDisabled?: boolean
  /**
   * `busy`여도 닫기(버튼·배경·Escape)는 열어 둔다.
   *
   * 기본값 false — 처리 중에 닫히면 곤란한 호출부가 대부분이다. P-10 공연 취소처럼
   * **"진행 중에는 닫기만 활성"**이 상태 규칙인 화면만 켠다(화면설계 v6 P-10 상태).
   * 닫아도 요청은 취소되지 않는다 — 진행 표시를 접는 것뿐이다.
   */
  closableWhileBusy?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'primary',
  busy = false,
  confirmDisabled = false,
  closableWhileBusy = false,
  onConfirm,
  onClose,
}: Props) {
  const { text } = useLocale()
  const resolvedCancelLabel = cancelLabel ?? text('유지하기', 'Keep it')
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreTargetRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  /** 닫기를 막아야 하는가. `closableWhileBusy`면 처리 중에도 닫을 수 있다 */
  const closeBlocked = busy && !closableWhileBusy
  const closeBlockedRef = useRef(closeBlocked)
  onCloseRef.current = onClose
  closeBlockedRef.current = closeBlocked
  /** DOM에 있는가 — 닫힌 뒤에도 전환이 끝날 때까지 남는다 */
  const [mounted, setMounted] = useState(open)
  /** 전환의 끝 상태인가 — 마운트 다음 프레임에 켠다 */
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      restoreTargetRef.current = document.activeElement as HTMLElement | null
      setMounted(true)
      // 마운트와 같은 프레임에 켜면 브라우저가 시작 상태를 그리지 않아 전환이 생략된다
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const timer = setTimeout(() => setMounted(false), TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [open])

  /**
   * 열릴 때 포커스를 다이얼로그 안으로 넣는다.
   *
   * 확인 버튼이 **잠겨 있으면 다이얼로그 자체**를 잡는다 — disabled 버튼은 `focus()`가 듣지
   * 않아서, 그대로 두면 포커스가 다이얼로그를 여는 트리거에 남는다(모달 밖이다).
   * `busy`만 보던 판정에 `confirmDisabled`를 더한 이유가 이것이다.
   *
   * `mounted`도 의존성에 넣는다 — 열리는 첫 렌더에는 버튼이 아직 DOM에 없어 ref가 비어 있다.
   *
   * 2026-09-26 — 초기 포커스는 **열릴 때 한 번만** 준다. 예전에는 `confirmUnfocusable`이 바뀔
   * 때마다 다시 포커스를 옮겨서, 본문 입력칸(P-10 취소 사유)에 한 글자를 치는 순간 확인 버튼이
   * 풀리며 포커스가 확인 버튼으로 튀었다. 본문에 입력칸이 있으면 그 입력칸을 먼저 잡는다.
   */
  const confirmUnfocusable = busy || confirmDisabled
  const initialFocusDoneRef = useRef(false)
  useEffect(() => {
    if (!open) {
      initialFocusDoneRef.current = false
      return
    }
    if (!mounted || initialFocusDoneRef.current) return
    initialFocusDoneRef.current = true
    const field = dialogRef.current?.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
    )
    ;(field ?? (confirmUnfocusable ? dialogRef.current : confirmRef.current))?.focus()
  }, [open, mounted, confirmUnfocusable])

  // 확인 버튼에 포커스가 있는데 버튼이 잠기면(busy 등) 포커스가 모달 밖으로 새지 않게 다이얼로그로 옮긴다.
  // 사용자가 입력칸에 있으면 건드리지 않는다.
  useEffect(() => {
    if (!open || !mounted || !confirmUnfocusable) return
    const active = document.activeElement
    if (active === confirmRef.current || active === document.body || active === null) {
      dialogRef.current?.focus()
    }
  }, [open, mounted, confirmUnfocusable])

  useEffect(() => {
    if (!open || !mounted) return

    const previouslyFocusedElement = restoreTargetRef.current
    const previousBodyOverflow = document.body.style.overflow
    const dialogElement = dialogRef.current
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeBlockedRef.current) {
        e.preventDefault()
        onCloseRef.current()
        return
      }

      const dialog = dialogRef.current
      if (dialog) trapFocus(e, dialog)
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousBodyOverflow
      restoreFocusIfSafe(previouslyFocusedElement, dialogElement)
    }
  }, [open, mounted])

  if (!mounted) return null

  return (
    <div
      inert={!open}
      aria-hidden={!open ? true : undefined}
      className={[
        'fixed inset-0 z-50 flex items-end justify-center md:items-center',
        shown ? '' : 'pointer-events-none',
      ].join(' ')}
    >
      <button
        type="button"
        aria-label={text('닫기', 'Close')}
        tabIndex={-1}
        disabled={closeBlocked}
        onClick={onClose}
        className={[
          'absolute inset-0 h-full w-full bg-ink/40',
          'transition-opacity duration-[220ms] ease-out',
          shown ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />

      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          'relative w-full rounded-t-card bg-surface px-4 pb-6 pt-3',
          'md:w-[400px] md:rounded-card md:px-6 md:py-6',
          'transition-[translate,scale,opacity] duration-[220ms] ease-out',
          shown
            ? 'translate-y-0 md:scale-100 md:opacity-100'
            : 'translate-y-full md:translate-y-0 md:scale-95 md:opacity-0',
        ].join(' ')}
      >
        <div aria-hidden className="mx-auto mb-4 h-1 w-9 rounded-full bg-line md:hidden" />

        <h2 className="mb-2 font-sans text-[15px] font-bold leading-snug text-ink md:text-base">
          {title}
        </h2>
        {body && (
          <div className="mb-5 font-sans text-[13px] leading-relaxed text-muted">{body}</div>
        )}

        <div
          role="group"
          aria-label={text('확인 작업', 'Confirmation actions')}
          className="flex flex-col gap-2"
        >
          <Button
            ref={confirmRef}
            variant={confirmVariant}
            full
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button variant="secondary" full disabled={closeBlocked} onClick={onClose}>
            {resolvedCancelLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
