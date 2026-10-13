/**
 * 서명 처리 오버레이 — 서명을 마친 뒤 서버 보고~확정 대기 동안 "서명하는 느낌"의 펜 애니메이션을 띄운다.
 *
 * 화면설계 v8 §5 공통 컴포넌트(서명 단계). 앱 루트(`RouteTitle`)에 **하나만** 마운트한다.
 * 켜고 끄는 신호는 `shared/blockchain/signingActivity`가 갖는다 — 화면은 이 컴포넌트를 모른다.
 *
 * - 비모달: `role="status"` + `aria-live="polite"`로 알리기만 하고 포커스를 옮기지 않는다.
 *   배경 클릭은 막는다(처리 중 버튼 재클릭 방지).
 * - 지갑 확인 구간(`walletPrompt`)에는 반투명·`pointer-events: none`으로 물러선다. 지갑 창
 *   (Web3Auth z-index 99999)은 이 오버레이(z-index 60)보다 위라 가려지지 않는다.
 * - 라우트가 바뀌거나 이 컴포넌트가 사라지면(라우트 에러 화면 포함) 신호를 비운다.
 * - 관객 화면 규칙: 블록체인 용어 없이 "확인하고 있어요 / Processing". 지갑 구간의
 *   "Confirm in your wallet" 한 줄만 예외로 허용된다(CLAUDE §5.2).
 */

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

import { resetSigningActivity, useSigningActivity } from '@/shared/blockchain/signingActivity'
import { useLocale } from '@/shared/i18n/useLocale'

/** 흘려 쓴 서명 한 획. `pathLength=1`로 정규화해 dasharray/dashoffset을 0~1로 움직인다. */
const SIGNATURE_PATH =
  'M8 44 C 18 18, 30 16, 30 36 S 38 58, 48 34 S 60 12, 64 32 S 72 52, 82 30 ' +
  'S 96 22, 104 38 S 118 48, 128 30 S 144 26, 152 34'

export function SigningOverlay() {
  const { visible, walletPrompt } = useSigningActivity()
  const { text } = useLocale()
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)

  // 라우트 이동 — 이전 화면의 처리 표시를 다음 화면에 끌고 가지 않는다
  useEffect(() => {
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    resetSigningActivity()
  }, [pathname])

  // 언마운트(라우트 에러 화면으로 교체 등) — 남은 카운터를 비운다
  useEffect(() => () => resetSigningActivity(), [])

  if (!visible) return null

  const label = walletPrompt
    ? text('지갑 창에서 확인해 주세요', 'Confirm in your wallet')
    : text('확인하고 있어요', 'Processing')

  return (
    <div
      className="signing-overlay"
      data-signing-overlay
      data-wallet-prompt={walletPrompt || undefined}
      role="status"
      aria-live="polite"
    >
      <div className="signing-overlay__card">
        <svg
          className="signing-overlay__art"
          viewBox="0 0 160 72"
          width="160"
          height="72"
          aria-hidden="true"
          focusable="false"
        >
          <line className="signing-overlay__baseline" x1="6" y1="62" x2="154" y2="62" />
          <path className="signing-overlay__stroke" d={SIGNATURE_PATH} pathLength={1} />
          <g className="signing-overlay__pen">
            <path d="M0 0 L5 -3 L22 -20 L25 -17 L8 0 Z" />
            <path className="signing-overlay__nib" d="M0 0 L5 -3 L3 -1 Z" />
          </g>
        </svg>
        <p className="signing-overlay__label">
          {label}
          <span className="signing-overlay__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
          <span className="signing-overlay__ellipsis" aria-hidden="true">
            …
          </span>
        </p>
        {!walletPrompt && (
          <p className="signing-overlay__hint">
            {text('잠시만 기다려 주세요.', 'This takes a few seconds.')}
          </p>
        )}
      </div>
    </div>
  )
}
