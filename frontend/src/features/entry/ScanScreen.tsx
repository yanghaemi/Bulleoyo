/**
 * S-02 검표 — QR 스캔.
 *
 * 정본 — 화면설계 v6 §4 S-02(1353~1393행: 영역 구성·레이아웃·컴포넌트 표·상태·접근성)
 *        · §5.13 KST 병기 · §5.7 빈 상태 · §5.19(이 화면은 **하단 고정 액션이 없다** — 연속 스캔)
 *        · API 명세 v6 entry-01 `POST /api/v1/entries/verify`
 *
 * 이 화면의 성격이 다른 화면과 다르다 —
 *   · **로그인하지 않은 스태프**가 검표 링크 토큰만으로 들어온다. 그래서 `AppHeader`를 쓰지 않는다.
 *     `AppHeader`·`MobileHeader`는 로그인/마이 진입을 달고 있는데 1393행이 "로그인 UI를 노출하지
 *     않는다"고 못박았다. 여기서는 **자체 얇은 컨텍스트 헤더**를 쓴다.
 *   · **토큰 문자열을 화면에 그대로 보여주지 않는다**(1393행). 라우트의 `:token`은 어디에도 찍지 않는다.
 *   · 탭바 없음(§5.18의 "탭바를 노출하지 않는 화면"에 S-02가 들어 있다), 하단 고정 액션 없음.
 *
 * 레이아웃(1364·1365행) — 모바일 기준 뷰. 얇은 헤더 아래 **카메라 뷰가 세로 70% 이상**,
 * 그 아래 최근 판정 한 줄. PC는 같은 1열을 **최대폭 560px** 중앙 정렬한다(열을 늘리지 않는다).
 *
 * 판정 표시(1392행) — 1초 이내에 **색 + 소리 + 진동**. 색은 전체 화면 플래시(이 파일),
 * 소리·진동은 `entryFeedback.signalVerdict`. 연속 스캔을 위해 디바운스를 건다.
 *
 * API (S15P21B204-101에서 연결) — **호출은 페이지가 한다**(features는 API를 직접 부르지 않는다).
 *   판정:   entry-01 `POST /api/v1/entries/verify`를 `ScanPage`가 부르고 결과를 `onScan`으로 준다.
 *           실패도 던지지 않고 `ScanOutcome`으로 온다 — 이 화면에서 실패는 오류가 아니라 **판정**이다.
 *   헤더:   ⚠ 화면설계는 `GET /api/v1/scan/{token}`을 적었지만 **API v6에 그 경로가 없다.**
 *           페이지가 performance-03 + entry-02로 조립해 `context`로 내려준다. 못 받은 값은
 *           `undefined`로 오고 그 줄을 그리지 않는다(`entryTypes.ScanContext` 주석 참조).
 *   입력:   카메라 디코딩은 내장 `BarcodeDetector`, 없으면 `jsQR` 폴백이다(`useQrDecoder` 머리말).
 *           iOS 사파리에는 내장 API가 없어 폴백이 없으면 판정 자체가 안 난다(S15P21B204-101).
 *           카메라를 못 여는 경우(권한 거부·기기 없음·평문 주소)는 **수동 입력**으로 같은
 *           `handleScan`에 들어온다. 읽은 문자열은 포장 없이 그대로 `qrToken`이다.
 *   에러:   `ENTRY_QR_EXPIRED`(401) · `ENTRY_QR_SIGNATURE_INVALID`(401) · `ENTRY_ALREADY_ENTERED`(409)
 *           · `ENTRY_NOT_IN_TIME_WINDOW`(409) · `TICKET_CANCELED`(409) · `COMMON_NOT_FOUND`(404)
 *           · `ENTRY_SCANNER_NOT_AUTHORIZED`(403) · `COMMON_UNAUTHORIZED`(401)
 *           · `COMMON_VALIDATION_FAILED`(400) · `COMMON_TOO_MANY_REQUESTS`(429) — `entryErrors.ts`.
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { useLocale } from '@/shared/i18n/useLocale'
import { Button, Input, formatKst } from '@/shared/ui'

import {
  entryFailureText,
  isDuplicateCode,
  isLinkInvalidCode,
  isRescannableCode,
} from './entryErrors'
import { primeAudio, signalVerdict } from './entryFeedback'
import { useCameraStream } from './useCameraStream'
import { useQrDecoder } from './useQrDecoder'
import type { ScanContext, ScanOutcome } from './entryTypes'

import './operations-refresh.css'

/**
 * 같은 QR을 연달아 읽어도 한 번만 요청하도록 막는 시간(ms).
 *
 * ⚠ 1392행은 "연속 스캔 가능(디바운스)"만 정하고 값을 주지 않았다. 500ms는 판정 플래시가
 *    끝나기 전이라 스태프가 결과를 못 보고, 2초면 줄이 밀린다. 그 사이값으로 잡은 임의 결정이다.
 */
const SCAN_COOLDOWN_MS = 1200

/** 전체 화면 색 플래시가 남아 있는 시간(ms). "1초 이내에 표시"(1392행)와 별개로 지속 시간이다 */
const FLASH_MS = 1000

/* ── 얇은 컨텍스트 헤더 ───────────────────────────────────────────────── */

/**
 * 수량 표기. **응답 필드가 전부 선택이라 값이 없을 수 있고, 없으면 0이 아니라 "모른다"다.**
 * 0으로 채우면 아직 못 받은 총 매수가 "0매"로 보여 스태프가 매진으로 읽는다.
 */
function formatCount(n: number | undefined): string {
  return n == null ? '—' : n.toLocaleString('ko-KR')
}

interface HeaderProps {
  context: ScanContext
  /** 스캔 성공으로 갱신된 입장 수. 없으면 `context`의 값(그것도 없으면 모른다) */
  entered: number | undefined
  entriesTo: string
}

/**
 * S-02 컴포넌트 표 "검표 컨텍스트 헤더" — 공연명·일시·장소, 입장 허용 시간대, 입장 완료/총 티켓 수.
 *
 * 카메라가 세로 70%를 먹으므로 헤더는 **두 줄까지**만 쓴다(1364행 "얇은 컨텍스트 헤더").
 * 입장 수는 스태프가 흘깃 보는 값이라 숫자만 크게 둔다.
 */
function ScanContextHeader({ context, entered, entriesTo }: HeaderProps) {
  const { text } = useLocale()
  // 일시·장소는 못 받을 수 있다(비로그인 STAFF). 없는 값은 줄에서 빼고, 둘 다 없으면 줄을 안 그린다
  const subtitle = [context.startAt ? formatKst(context.startAt) : undefined, context.venue]
    .filter(Boolean)
    .join(' · ')
  const window = context.entryWindow

  return (
    <header className="border-b border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {/* 공연명이 아직 안 왔으면 화면 이름을 쓴다 — 가짜 공연명을 지어내지 않는다 */}
          <p className="m-0 truncate font-sans text-[13px] font-bold text-ink">
            {context.performanceTitle ?? text('검표', 'Check-in')}
          </p>
          {subtitle && <p className="m-0 truncate font-sans text-[11px] text-muted">{subtitle}</p>}
        </div>

        {/* 입장 완료/총 티켓 수 — 판정마다 갱신된다. 모르는 값은 0이 아니라 "—"다 */}
        <p
          className="m-0 shrink-0 font-num text-[15px] font-bold tabular-nums text-ink"
          aria-label={text(
            `입장 ${formatCount(entered)}명, 총 ${formatCount(context.totalIssuedCount)}매`,
            `${formatCount(entered)} entered of ${formatCount(context.totalIssuedCount)}`,
          )}
        >
          {formatCount(entered)}
          <span className="text-muted"> / {formatCount(context.totalIssuedCount)}</span>
        </p>

        {/* 입장 현황 이동 버튼 — S-03으로, 같은 토큰을 유지한다(경로는 페이지가 만든다) */}
        <Link
          to={entriesTo}
          className="flex h-11 shrink-0 items-center rounded-control border border-line px-3 font-sans text-[13px] font-semibold text-ink transition-colors duration-150 ease-out hover:bg-ground-2"
        >
          {text('현황', 'Activity')}
        </Link>
      </div>

      {/*
        입장 허용 시간대 — 시간대 밖 판정(`ENTRY_NOT_IN_TIME_WINDOW`)의 근거가 되는 값이다.
        ⚠ 이 값은 performance-10(`bearerAuth` 필수)에만 있어 **비로그인 STAFF는 받을 수 없다.**
           못 받으면 줄을 통째로 지운다 — 임의의 시간대를 적으면 스태프가 그 시간을 믿는다.
      */}
      {window?.opensAt && window.closesAt && (
        <p className="m-0 mt-1 font-sans text-[11px] text-muted">
          {text('입장 가능', 'Entry window')} {formatKst(window.opensAt)} –{' '}
          {formatKst(window.closesAt)}
        </p>
      )}
    </header>
  )
}

/* ── 카메라 뷰 ────────────────────────────────────────────────────────── */

/** 프리뷰 위에 얹는 조준 프레임. QR을 어디에 대야 하는지 알려주는 것 말고 기능이 없다 */
function ScanGuide() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div className="aspect-square w-[62%] rounded-card border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
    </div>
  )
}

/**
 * 카메라를 못 여는 상태의 안내(S-02 "카메라 권한 거부 안내" + 1384행 "대안 안내").
 *
 * 원인마다 스태프가 할 행동이 다르므로 문구를 나눈다. 명세는 "권한 재요청 안내"·"브라우저 설정 안내"
 * 두 줄만 줬고 ⚠ **평문(http) 접속·카메라 없음·다른 앱 점유**의 문구는 명세에 없다 — 임의 문구다.
 */
function CameraFallback({
  title,
  detail,
  onRetry,
}: {
  title: string
  detail: string
  onRetry?: () => void
}) {
  const { text } = useLocale()
  return (
    <div
      role="status"
      className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p className="m-0 font-sans text-base font-bold text-white">{title}</p>
      <p className="m-0 font-sans text-[13px] leading-relaxed text-white/75">{detail}</p>
      {onRetry && (
        <span className="mt-2">
          <Button variant="secondary" onClick={onRetry}>
            {text('카메라 다시 시도', 'Try camera again')}
          </Button>
        </span>
      )}
    </div>
  )
}

/* ── 수동 입력 ────────────────────────────────────────────────────────── */

/**
 * QR 토큰 수동 입력 — 카메라가 없거나(권한 거부·미지원 기기·평문 주소) 내장 디코더가 없는
 * 브라우저에서 **검표를 멈추지 않기 위한 대체 경로**다(1384행 "대안 안내").
 *
 * ⚠ 명세에 이 입력칸이 없다 — 임의 추가다. 카메라 실패를 "오류"로만 그리면 그 단말에서는
 *    검표가 아예 불가능해진다. 관객 화면의 토큰을 받아 적어 넣는 마지막 수단이다.
 * 입력값은 서명 토큰이라 제출 즉시 칸을 비우고 어디에도 보관하지 않는다.
 */
function ManualTokenForm({
  hint,
  onSubmit,
}: {
  hint: string
  onSubmit: (qrToken: string) => void
}) {
  const { text } = useLocale()
  const [value, setValue] = useState('')

  return (
    <form
      className="m-3 mt-0 rounded-card border border-line bg-surface px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        const token = value.trim()
        if (!token) return
        setValue('')
        onSubmit(token)
      }}
    >
      <label htmlFor="scan-manual-token" className="font-sans text-[13px] font-semibold text-ink">
        {text('QR 토큰 직접 입력', 'Enter QR token')}
      </label>
      <p className="m-0 mt-0.5 font-sans text-[11px] text-muted">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          id="scan-manual-token"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={text('관객 화면의 QR 토큰', "Attendee's QR token")}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          sm
        />
        <Button type="submit" sm disabled={value.trim().length === 0}>
          {text('확인', 'Verify')}
        </Button>
      </div>
    </form>
  )
}

/* ── 판정 표시 ────────────────────────────────────────────────────────── */

/** 화면이 기억하는 마지막 판정 */
interface Verdict {
  ok: boolean
  /** 큰 글씨 한 마디 */
  headline: string
  /** 사유·보조 설명 */
  detail?: string
  /** 실패 코드. 재스캔 안내 여부를 이 값으로 정한다 */
  code?: string
  /** 판정 시각(ISO) — 성공은 서버 `enteredAt`, 실패는 단말 시각 */
  at: string
}

/**
 * 전체 화면 색 플래시(1364행). 판정과 동시에 뜨고 `FLASH_MS` 뒤 사라진다.
 *
 * 스태프가 폰을 든 채 흘깃 보는 화면이라 **결과를 화면 한복판에 크게** 둔다.
 * `pointer-events-none`이라 플래시 중에도 다음 스캔이 막히지 않는다(연속 스캔).
 * 색만으로 알리지 않는다 — 큰 글씨 문구가 언제나 함께 뜬다(§1.2).
 */
function FlashOverlay({ verdict }: { verdict: Verdict }) {
  return (
    <div
      aria-hidden
      className={[
        'pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center gap-2 px-8 text-center',
        verdict.ok ? 'bg-ok/90' : 'bg-danger/90',
      ].join(' ')}
    >
      <p className="m-0 font-sans text-4xl font-bold text-white">{verdict.headline}</p>
      {verdict.detail && (
        <p className="m-0 font-sans text-base font-semibold leading-snug text-white/90">
          {verdict.detail}
        </p>
      )}
    </div>
  )
}

/**
 * 카메라 아래 최근 판정 결과 한 줄(1364행).
 *
 * 플래시가 사라진 뒤에도 남아 "방금 뭐였지"를 답한다.
 * `aria-live="assertive"`로 스크린리더에도 즉시 읽힌다 — 색·소리로만 알리지 않기 위해서다.
 */
function VerdictLine({ verdict, onRearm }: { verdict: Verdict | null; onRearm: () => void }) {
  const { text } = useLocale()
  if (!verdict) {
    return (
      <p role="status" className="m-0 px-3 py-3 text-center font-sans text-[13px] text-muted">
        {text('QR을 사각형 안에 비춰 주세요', 'Hold the QR code inside the frame')}
      </p>
    )
  }

  const tone = verdict.ok ? 'border-ok' : 'border-danger'
  return (
    <div
      role="status"
      aria-live="assertive"
      className={`m-3 rounded-card border-l-4 bg-surface px-3 py-2.5 ${tone}`}
    >
      <div className="flex items-center gap-2">
        <p className="m-0 font-sans text-[15px] font-bold text-ink">{verdict.headline}</p>
        <span className="ml-auto font-num text-[11px] tabular-nums text-muted">
          {formatKst(verdict.at)}
        </span>
      </div>
      {verdict.detail && (
        <p className="m-0 mt-0.5 font-sans text-[13px] leading-snug text-muted">{verdict.detail}</p>
      )}

      {/*
        재스캔 안내(1382행 `ENTRY_QR_EXPIRED` — 재스캔 안내).
        ⚠ 같은 `qrToken`을 다시 보내면 또 만료다(TOTP는 30초마다 회전한다 — A-08).
           그래서 이 버튼은 **재요청이 아니라 스캐너 재무장**이다. 관객이 화면을 다시 켜서
           새 QR을 보이면 곧바로 읽도록 디바운스를 즉시 푼다.
      */}
      {isRescannableCode(verdict.code) && (
        <div className="mt-2">
          <Button variant="secondary" sm onClick={onRearm}>
            {text('다시 스캔', 'Scan again')}
          </Button>
        </div>
      )}
    </div>
  )
}

/* ── 링크 무효 ────────────────────────────────────────────────────────── */

/**
 * S-02 컴포넌트 표 "링크 무효 안내" — 문구는 명세 그대로(1377행), 버튼은 홈(A-01) 이동.
 * 1383행대로 **카메라를 열지 않는다.**
 */
function LinkInvalidPanel({ text }: { text: string }) {
  const { text: localeText } = useLocale()
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="m-0 font-sans text-base font-bold text-ink">{text}</p>
      <Link
        to="/"
        className="flex h-11 items-center rounded-control bg-primary px-4 font-sans text-sm font-semibold text-white"
      >
        {localeText('홈으로', 'Go home')}
      </Link>
    </div>
  )
}

/* ── 로딩 ─────────────────────────────────────────────────────────────── */

/** 진입 시 토큰 검증·컨텍스트 조회 동안. 헤더 → 카메라 → 결과 줄의 자리를 그대로 잡는다 */
function Skeleton() {
  const { text } = useLocale()
  return (
    <div
      aria-busy="true"
      aria-label={text('검표 화면을 준비하는 중', 'Preparing the scanner')}
      className="flex flex-col"
    >
      <div className="h-14 animate-pulse bg-ground-2" />
      <div className="h-[70dvh] animate-pulse bg-ground-2 md:h-[520px]" />
      <div className="m-3 h-12 animate-pulse rounded-card bg-ground-2" />
    </div>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  /** 검표 컨텍스트. 조회 전이면 `undefined`(로딩) */
  context?: ScanContext
  loading?: boolean
  /** 진입 시 토큰 검증 실패 코드. `ENTRY_SCANNER_NOT_AUTHORIZED` 등 */
  errorCode?: string
  /** 서버 `msg`. 안내 문구 뒤에 덧붙인다(§5.5) */
  errorMsg?: string
  /**
   * QR 문자열 → 판정. entry-01 호출은 페이지가 맡는다(features는 API를 직접 부르지 않는다).
   * 던지지 말고 `ScanOutcome`으로 돌려준다 — 실패도 판정이다.
   */
  onScan: (qrToken: string) => Promise<ScanOutcome>
  /** 입장 현황(S-03) 경로. 같은 토큰을 유지한 `/scan/{token}/entries` */
  entriesTo: string
}

export function ScanScreen({
  context,
  loading = false,
  errorCode,
  errorMsg,
  onScan,
  entriesTo,
}: Props) {
  const { language, text } = useLocale()
  const linkInvalid = isLinkInvalidCode(errorCode)
  /** 링크가 무효면 카메라를 아예 열지 않는다(1383행) */
  const cameraEnabled = !loading && !linkInvalid && context != null
  const camera = useCameraStream(cameraEnabled)

  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [flashing, setFlashing] = useState(false)
  /** 스캔 성공마다 서버가 준 `enteredCount`로 갱신한다. 없으면 컨텍스트 값 */
  const [entered, setEntered] = useState<number | null>(null)
  /** 요청 중인가 — 같은 프레임에서 두 번 보내지 않기 위한 잠금 */
  const busyRef = useRef(false)
  /** 마지막 판정 시각(ms). 디바운스 기준 */
  const lastAtRef = useRef(0)

  /*
   * 자동재생 정책 — `AudioContext`는 사용자 제스처 뒤에만 소리를 낸다. 검표는 화면을 켜 두고
   * 스캔만 하므로 별도 "시작" 버튼을 두지 않고, 화면에서 일어나는 **첫 탭 한 번**을 빌려 깨운다.
   * (버튼을 하나 더 두면 스태프가 그걸 안 누르고 조용한 화면을 쓰게 된다.)
   */
  useEffect(() => {
    const onFirstTap = () => primeAudio()
    window.addEventListener('pointerdown', onFirstTap, { once: true })
    return () => window.removeEventListener('pointerdown', onFirstTap)
  }, [])

  // 플래시 자동 소거
  useEffect(() => {
    if (!flashing) return
    const timer = setTimeout(() => setFlashing(false), FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashing])

  /** 디바운스를 즉시 푼다(재스캔 안내의 "다시 스캔") */
  const rearm = useCallback(() => {
    lastAtRef.current = 0
    setVerdict(null)
  }, [])

  /**
   * 한 번의 스캔 처리. **카메라 디코딩도 수동 입력도 이 함수 하나로 들어온다** —
   * 디바운스·판정·소리·진동·플래시가 전부 여기 모여 있어야 경로마다 다르게 굴지 않는다.
   */
  const handleScan = useCallback(
    async (qrToken: string) => {
      const now = Date.now()
      if (busyRef.current || now - lastAtRef.current < SCAN_COOLDOWN_MS) return
      busyRef.current = true
      try {
        const outcome = await onScan(qrToken)
        lastAtRef.current = Date.now()

        if (outcome.result === 'SUCCESS') {
          const e = outcome.entry
          // 값이 안 왔으면 헤더의 이전 숫자를 유지한다 — `undefined`로 덮으면 "—"로 퇴보한다
          if (e.enteredCount != null) setEntered(e.enteredCount)
          setVerdict({
            ok: true,
            headline: text('입장 완료', 'Entry confirmed'),
            // 컴포넌트 표가 요구하는 것은 "성공/실패 + 사유"다. 관객 이름은 찍지 않는다
            detail: [
              e.ticketTypeName,
              e.enteredCount != null
                ? `${formatCount(e.enteredCount)} / ${formatCount(e.totalIssuedCount)}`
                : undefined,
            ]
              .filter(Boolean)
              .join(' · '),
            // 서버가 입장 시각을 안 주면 단말 시각을 쓴다(표시용이고 판정 기준이 아니다)
            at: e.enteredAt ?? new Date().toISOString(),
          })
          signalVerdict('ok')
        } else {
          /*
           * ⚠ `ENTRY_ALREADY_ENTERED`는 "최초 입장 시각 함께 표시"가 명세인데(1374·1382행)
           *    실패 응답의 `data`가 `null`로 못박혀 있어 **시각을 받을 수 없다.**
           *    지어내지 않고, 대신 중복임을 문구로 분명히 하고 시각 자리는 비워 둔다.
           */
          setVerdict({
            ok: false,
            headline: isDuplicateCode(outcome.code)
              ? text('중복 입장', 'Already entered')
              : text('입장 불가', 'Entry denied'),
            detail:
              language === 'ko'
                ? entryFailureText(outcome.code, outcome.msg)
                : (outcome.msg ?? `Could not verify this ticket. (code ${outcome.code})`),
            code: outcome.code,
            at: new Date().toISOString(),
          })
          signalVerdict('fail')
        }
        setFlashing(true)
      } finally {
        busyRef.current = false
      }
    },
    [language, onScan, text],
  )

  // 카메라가 실제로 켜졌을 때만 프레임을 읽는다. 내장 디코더가 없으면 jsQR 폴백이 대신 돈다
  const decoder = useQrDecoder(camera.videoRef, camera.state === 'live', (value) => {
    void handleScan(value)
  })

  if (loading) {
    return (
      <div className="scan-workbench mx-auto w-full max-w-[560px] bg-ground">
        <Skeleton />
      </div>
    )
  }

  // 토큰 무효 — 헤더도 카메라도 없이 안내만 남긴다. 토큰 문자열은 어디에도 찍지 않는다(1393행)
  if (linkInvalid || (!context && errorCode)) {
    return (
      <div className="scan-workbench mx-auto w-full max-w-[560px] bg-ground">
        <LinkInvalidPanel
          text={
            language === 'ko'
              ? (entryFailureText(errorCode, errorMsg) ??
                '검표 링크가 유효하지 않아요. 공연 담당자에게 링크를 다시 받아주세요')
              : (errorMsg ?? 'This scanner link is invalid. Ask the show manager for a new link.')
          }
        />
      </div>
    )
  }

  if (!context) {
    // 컨텍스트도 에러 코드도 없는 상태. §5.7대로 문구 + 다음 행동만 둔다
    return (
      <div className="scan-workbench mx-auto w-full max-w-[560px] bg-ground">
        <LinkInvalidPanel
          text={text(
            '검표 정보를 불러오지 못했습니다. 링크를 다시 열어 주세요',
            'Could not load scanner details. Open the link again.',
          )}
        />
      </div>
    )
  }

  const enteredCount = entered ?? context.enteredCount

  return (
    <div className="scan-workbench mx-auto flex min-h-dvh w-full max-w-[560px] flex-col bg-ground">
      <ScanContextHeader context={context} entered={enteredCount} entriesTo={entriesTo} />

      {/*
        카메라 뷰 — 모바일 세로 70%(1364행). PC도 같은 1열을 유지한다(1365행).
        카메라를 못 여는 상태에서는 높이를 줄인다 — 70%를 안내 문구로 채우면 그 아래 수동 입력이
        화면 밖으로 밀려서, 대체 경로가 있는데도 스태프 눈에는 "그냥 안 됨"으로 보인다.
      */}
      <div
        className={[
          'scan-workbench__camera relative shrink-0 overflow-hidden bg-black',
          camera.state === 'live' || camera.state === 'requesting'
            ? 'h-[70dvh] md:h-[520px]'
            : 'h-[34dvh] md:h-[280px]',
        ].join(' ')}
      >
        <video
          ref={camera.videoRef}
          muted
          playsInline
          // 프리뷰 자체는 정보가 아니다 — 스크린리더에는 아래 판정 줄만 읽힌다
          aria-hidden
          className={`h-full w-full object-cover ${camera.state === 'live' ? '' : 'hidden'}`}
        />

        {camera.state === 'live' && <ScanGuide />}

        {camera.state === 'requesting' && (
          <CameraFallback
            title={text('카메라를 여는 중', 'Opening the camera')}
            detail={text(
              '브라우저가 권한을 물으면 허용해 주세요.',
              'Allow camera access when your browser asks.',
            )}
          />
        )}
        {camera.state === 'denied' && (
          <CameraFallback
            title={text('카메라 권한이 꺼져 있어요', 'Camera access is blocked')}
            detail={text(
              '브라우저 주소창의 자물쇠 아이콘 → 카메라 → 허용으로 바꾼 뒤 다시 시도해 주세요.',
              'Allow camera access in your browser settings, then try again.',
            )}
            onRetry={camera.request}
          />
        )}
        {camera.state === 'no-device' && (
          <CameraFallback
            title={text('쓸 수 있는 카메라가 없어요', 'No camera is available')}
            detail={text(
              '카메라가 있는 다른 기기에서 이 링크를 열어 주세요.',
              'Open this link on a device with a camera.',
            )}
            onRetry={camera.request}
          />
        )}
        {camera.state === 'busy' && (
          <CameraFallback
            title={text('카메라를 다른 앱이 쓰고 있어요', 'The camera is in use')}
            detail={text(
              '다른 앱을 끄고 다시 시도해 주세요.',
              'Close the other app and try again.',
            )}
            onRetry={camera.request}
          />
        )}
        {camera.state === 'insecure' && (
          // getUserMedia는 보안 컨텍스트(https·localhost) 전용이다. 권한 문제가 아니다
          <CameraFallback
            title={text(
              '안전한 주소(https)에서만 카메라를 켤 수 있어요',
              'Camera access requires a secure HTTPS link',
            )}
            detail={text(
              '공연 담당자에게 https로 시작하는 검표 링크를 다시 받아 주세요.',
              'Ask the show manager for an HTTPS scanner link.',
            )}
          />
        )}
        {camera.state === 'unsupported' && (
          <CameraFallback
            title={text(
              '이 브라우저는 카메라를 지원하지 않아요',
              'This browser does not support camera access',
            )}
            detail={text(
              '크롬·사파리 최신 버전에서 열어 주세요.',
              'Open the link in the latest Chrome or Safari.',
            )}
          />
        )}
        {camera.state === 'error' && (
          <CameraFallback
            title={text('카메라를 열지 못했어요', 'Could not open the camera')}
            // 원인 문구를 지어내지 않는다 — 브라우저가 준 이름을 그대로 보여준다
            detail={text(
              `잠시 후 다시 시도해 주세요. (${camera.errorName ?? 'UnknownError'})`,
              `Try again in a moment. (${camera.errorName ?? 'UnknownError'})`,
            )}
            onRetry={camera.request}
          />
        )}
      </div>

      {/* 최근 판정 결과 한 줄 */}
      <VerdictLine verdict={verdict} onRearm={rearm} />

      {/*
        수동 입력 — 카메라가 죽었거나 내장 디코더가 없는 브라우저의 대체 경로.
        개발용 목 트리거를 지우고 이걸로 갈음했다(같은 `handleScan` 진입점이다).
      */}
      <ManualTokenForm
        hint={
          decoder.supported
            ? text(
                'QR이 읽히지 않으면 관객 화면의 토큰을 붙여 넣어 주세요.',
                "If the QR code cannot be read, paste the attendee's token.",
              )
            : // jsQR 폴백이 생긴 뒤로 이 문구는 **디코더를 아예 못 올린 경우**에만 뜬다
              // (캔버스 2D 없음·폴백 청크 내려받기 실패). 브라우저 종류 탓이 아니므로 그렇게 말하지 않는다.
              text(
                '카메라로 QR을 읽을 수 없습니다. 관객 화면의 토큰을 붙여 넣어 주세요.',
                "Camera decoding is unavailable. Paste the attendee's token.",
              )
        }
        onSubmit={(qrToken) => void handleScan(qrToken)}
      />

      {/* 전체 화면 색 플래시 — 판정과 동시에, 연속 스캔을 막지 않는다 */}
      {flashing && verdict && <FlashOverlay verdict={verdict} />}
    </div>
  )
}
