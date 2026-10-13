/**
 * 하단 탭바 — 모바일 전용.
 *
 * 정본: 화면설계 v6 §1.2 원칙 7 · §2 AUDIENCE · §5.18
 *
 * **탭은 4개다** — 홈(A-01) · 내 티켓(A-07) · 잔액(A-13) · 마이(C-03).
 * v5의 5개에서 주문내역(A-12)이 빠져 마이페이지 안의 진입 항목이 됐다.
 * 이유는 문서에 적혀 있다 — 4개가 360px에서 라벨이 잘리지 않는 상한이고,
 * 주문 내역은 티켓·잔액보다 접근 빈도가 낮다.
 *
 * ⚠ 와이어프레임(`ui.tsx`의 `NAV_TABS`)은 아직 **5개**(Orders 포함)다. v5 시절 구성이
 * 남은 것으로 보이며, 수정 요청서에도 탭바 변경 요구가 없다. 화면설계 v6의 명시적 결정을
 * 따랐다. 와이어프레임을 5개로 되돌리려면 §1.2 원칙 7·§2·§5.18 세 곳을 함께 고쳐야 한다.
 *
 * 2026-09-08 정돈 — 활성 탭이 색 하나로만 구분돼 작은 아이콘에서는 잘 안 보였다.
 * 탭 상단에 2px 인디케이터를 `bg-sel`로 깔고(항상 자리를 차지하고 색만 바뀌므로 레이아웃이
 * 흔들리지 않는다), 누를 때 아이콘만 `scale-95`로 줄인다 — 라벨까지 줄이면 글자가 떨린다.
 * 라벨·굵기는 그대로라 색을 못 보는 사용자에게도 구분이 남는다.
 *
 * 규칙 —
 *   · PC(≥768px)에는 탭바가 없다. 헤더 내비게이션이 대신한다(§5.17)
 *   · **하단 고정 액션 버튼과 함께 두지 않는다**(§5.19). 둘 다 필요하면 액션을 본문으로 내린다
 *   · 라벨은 아이콘 아래 텍스트로 함께 쓴다(아이콘만으로 구분하지 않는다)
 *   · 각 탭 터치 타겟 44px 이상
 *   · 탭바를 노출하지 않는 화면: 로그인·가입·지갑 온보딩, 예매·결제·취소 단계형(A-03~A-06·A-11),
 *     검표(S-02·S-03), 모달·시트
 */

import { NavLink } from 'react-router'
import { useLocale } from '@/shared/i18n/useLocale'

const TABS = [
  {
    to: '/',
    label: 'Shows',
    ko: '공연',
    d: 'M3.5 8.5h17v10h-17zM7 8.5V5.5h10v3M8 13h8',
  },
  {
    to: '/tickets',
    label: 'My Tickets',
    ko: '내 티켓',
    d: 'M4 6.5h16v4a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM14 9v6',
  },
  {
    // M1: ticket and wallet routes remain one tap away at the venue.
    to: '/wallet',
    label: 'Wallet',
    ko: '지갑',
    d: 'M3.5 7.5h17v11h-17zM5.5 7.5V5.5h12M15.5 12h5v3h-5a1.5 1.5 0 0 1 0-3Z',
  },
  {
    to: '/me',
    label: 'MY',
    ko: 'MY',
    d: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z',
  },
] as const

export function BottomNav() {
  const { text } = useLocale()
  return (
    <nav
      aria-label={text('주요 메뉴', 'Main navigation')}
      className="ui-bottom-nav fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            [
              'group relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2',
              'transition-colors duration-150 ease-out',
              isActive ? 'text-sel' : 'text-faint',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              {/* 인디케이터는 항상 렌더하고 색만 바꾼다 — 나타났다 사라지면 아이콘이 2px씩 밀린다 */}
              <span
                aria-hidden
                className={[
                  'absolute inset-x-0 top-0 h-0.5 transition-colors duration-150 ease-out',
                  isActive ? 'bg-sel' : 'bg-transparent',
                ].join(' ')}
              />
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="transition-[scale] duration-150 ease-out group-active:scale-95"
              >
                <path d={tab.d} />
              </svg>
              <span className={`font-sans text-[9px] ${isActive ? 'font-semibold' : ''}`}>
                {text(tab.ko, tab.label)}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
