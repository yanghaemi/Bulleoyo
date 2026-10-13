/**
 * 이 화면이 보고 있는 공연의 색을 **전역 배경에 입힌다**.
 *
 * ── 왜 새 레이어를 만들지 않았나 ───────────────────────────────────
 * A-02 상세는 공연마다 다른 세계처럼 느껴져야 하는데, 지금은 어느 공연을 열어도 배경이 같다.
 * 처음 생각은 상세 화면에 배경 레이어를 하나 더 까는 것이었다. 그러면 두 가지가 망가진다 —
 *   ① `fx-backdrop.css` 머리에 적힌 대비 계산(워시 피크에서 muted 텍스트 6.6:1 등)은
 *      **레이어가 그것뿐일 때** 성립한다. 한 겹 더 얹으면 알파가 곱해져 계산이 무의미해진다
 *   ② 같은 자리에 그림자 두 개가 겹쳐 화면이 탁해진다(히어로에서 이미 겪었다 — CSS 조명과
 *      셰이더가 겹쳐 과하게 밝아져서 `data-gpu="on"`으로 한쪽을 낮춰야 했다)
 * 그래서 **이미 있는 배경의 색만 갈아 끼운다.** 세기(알파)는 손대지 않고, 우하단 온기도
 * 브랜드색으로 남긴다. 그림의 구성은 그대로고 큰 워시의 색조만 공연을 따라간다.
 *
 * ── 색은 어디서 오나 ─────────────────────────────────────────────
 * `useTicketTheme`이 포스터에서 뽑아 준다. 티켓과 상세 배경이 **같은 색조**인 것은 덤이 아니라
 * 요점이다 — 공연을 열고, 예매하고, 티켓을 받는 동안 색이 이어진다. 그 훅이 캐시·시드 폴백·
 * 포스터 분석을 다 갖고 있어서 여기서 다시 할 일이 없다.
 *
 * 다만 **hue만 가져오고 명도는 여기서 정한다.** `TicketTheme`의 `a`/`b`는 그 위에 글자를
 * 얹으려고 WCAG 대비로 명도를 잘라 둔 값이다(a는 18~36%, b는 55~68%). 이 배경에는 글자를
 * 얹지 않으므로 그 상한이 필요 없고, 오히려 그 때문에 색이 너무 어두워 보이지 않는다.
 *
 * ── 명도를 왜 여기서 정하나 ────────────────────────────────────────
 * 이 자리의 색은 어두운 바닥(#0b0b12) 위에 **14%로 섞인다**. 섞고 나서 바닥보다 얼마나
 * 밝아지는지가 곧 "보이는 정도"다. 채널 상승분 합으로 재면 —
 *   브랜드 primary-bright(명도 73%)  +64   ← 오늘의 배경. 이게 기준선이다
 *   theme.a (명도 28%)               +20   ← 처음에 이걸 넣었다. 3분의 1도 안 된다
 *   theme.b (명도 55%)               +46
 *   여기서 쓰는 명도 72%             ≈+64  ← 기준선과 같다
 * 그래서 **hue만 공연에서 가져오고 채도·명도는 고정한다.** 결과적으로 배경의 밝기는
 * 오늘과 똑같고 색조만 공연을 따라간다 — 대비 계산(`fx-backdrop.css` 머리 주석)이 그대로
 * 성립한다는 뜻이기도 하다. 명도를 공연마다 다르게 두면 어떤 공연에서만 본문이 흐려진다.
 *
 * ── 시드 색은 넣지 않는다 ─────────────────────────────────────────
 * `useTicketTheme`은 첫 렌더에 **해시로 만든 시드 색**을 즉시 주고, 포스터 분석이 끝나면
 * 진짜 색으로 갈아 준다. 티켓에서는 그게 옳다 — 회색 카드가 잠깐 보이는 것보다 낫다.
 * 배경에서는 반대다. 시드 색은 포스터와 아무 상관이 없어서(붉은 포스터에 초록 배경) 화면
 * 전체가 엉뚱한 색으로 한 번 물들었다가 바뀐다. 큰 면적에서 그 점멸은 눈에 띈다.
 *
 * 그래서 **포스터에서 실제로 뽑은 색일 때만** 넣는다. 시드와 같으면 넣지 않고, 배경은
 * 브랜드색 그대로 둔다. 색이 바뀌는 횟수가 0번 아니면 1번이 되어 CSS 전환이 필요 없다
 * (전환을 쓸 수 없는 이유는 `fx-backdrop.css`의 ⚠ 주석에 있다).
 * 포스터를 못 읽는 공연은 배경이 안 물든다 — 어차피 그 색은 해시라 의미가 없었다.
 *
 * ── 정리 ────────────────────────────────────────────────────────
 * 화면을 떠나면 변수를 지운다. 그러면 `var(--fx-show-a, var(--effect-primary-bright))`의
 * 폴백이 살아나 배경이 브랜드색으로 돌아간다. 지우지 않으면 다른 화면까지 그 공연 색으로
 * 물든 채 남는다.
 *
 * ── 왜 features/performance에 있나 ────────────────────────────────
 * 처음에 `shared/fx/`에 뒀는데, 이 훅은 `features/ticket/ticketTheme`을 import한다.
 * 의존 방향은 app → pages → features → shared이고 **shared는 상위를 import하지 않는다**
 * (기술 스택 v3 §3.2). `no-restricted-imports`가 `@/app`·`@/pages`만 막고 있어 린트에는
 * 안 걸렸지만 규칙 위반이다(MR !61 자동 리뷰 지적). 호출부도 이 디렉터리에 있어 여기가 맞다.
 *
 * ── 롤백 ─────────────────────────────────────────────────────────
 * 호출부(`PerformanceDetail`)의 `useShowBackdrop(...)` 한 줄을 지우면 배경이 오늘로 돌아간다.
 */

import { useEffect, useRef } from 'react'

import { seedTicketTheme, useTicketTheme } from '@/features/ticket/ticketTheme'

/** 배경의 큰 워시·커서 스팟이 읽는 변수. 우하단 온기는 브랜드색 그대로 둔다 —
 *  이유는 `fx-backdrop.css`의 ⚠ 주석에 있다(두 색이 같아지면 화면이 평평해진다) */
const VAR_A = '--fx-show-a'

/** 위 표의 기준선. 다크 장식색(#7b75ff)과 같은 정도로 바닥을 들어 올린다 */
const WASH_LIGHTNESS = 72
/**
 * 채도 **고정값**이다(상한이 아니다 — MR !61 자동 리뷰 지적).
 * `TicketTheme`은 hue만 내보내고 채도를 노출하지 않아 공연에서 가져올 방법이 없다.
 * 형광 포스터에서 배경이 눈을 찌르지 않게 이 값으로 묶어 둔다.
 */
const WASH_SAT = 62

/**
 * @param performanceId 색을 정하는 기준. 포스터를 못 읽어도 이 값으로 시드 색이 나온다
 * @param posterSrc     API가 준 포스터 주소(있으면 먼저 본다)
 */
export function useShowBackdrop(performanceId: string, posterSrc?: string | null): void {
  const theme = useTicketTheme(performanceId, posterSrc)
  // 시드 색인지 판정한다. 같은 입력이면 같은 결과라 hue 비교로 충분하다.
  //
  // 이 판정이 성립하려면 `theme`이 **지금 `performanceId`의 것**이어야 한다. id가 바뀐 렌더에
  // 이전 공연의 색이 남아 오면 여기서 true가 되어 남의 색을 이 공연 것으로 기록한다.
  // 그래서 `useTicketTheme`이 id가 바뀐 렌더에서 동기로 색을 갈아 끼우게 고쳤다
  // (MR !61 자동 리뷰 지적). 그 보장이 없으면 아래 `appliedFor` 기록이 거짓말이 된다.
  const fromPoster = theme.hue !== seedTicketTheme(performanceId).hue
  // 명도·채도는 위 상수의 **고정값**이다 — 포스터가 형광이어도 배경 밝기는 그대로다.
  // (`theme.a`/`theme.b`를 쓰면 어두워서 안 보였다. 2026-09-09 "안 보이는데 어디에 있는 거야")
  const wash = `hsl(${theme.hue} ${WASH_SAT}% ${WASH_LIGHTNESS}%)`

  // 값 갱신. **정리(지우기)를 여기 붙이지 않는다**(MR !61 리뷰 지적).
  // 공연 A 상세에서 공연 B 상세로 바로 넘어가면 라우트가 같아 컴포넌트가 재사용되고, 이 이펙트는
  // 재실행된다. 그때 정리가 붙어 있으면 순서가 이렇게 된다 —
  //   A의 색을 지움 → B는 아직 포스터 분석 전이라 `fromPoster`가 false → 아무것도 안 넣음
  //   → 배경이 브랜드색으로 **한 번 돌아갔다가** 잠시 뒤 B의 색으로 바뀐다
  // 화면 전체가 번쩍인다. 그래서 갱신만 하고, 다음 색이 올 때까지 이전 색을 그대로 둔다.
  // 어느 공연의 색을 넣어 뒀는지 기억한다. 아래 분기가 이걸 본다
  const appliedFor = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (fromPoster) {
      root.style.setProperty(VAR_A, wash)
      appliedFor.current = performanceId
      return
    }
    // 포스터에서 색을 못 뽑았다. 이때 **이전 공연의 색이 남아 있으면 지운다**(MR !61 자동 리뷰 지적).
    // 공연 A에서 B로 넘어갔는데 B의 분석이 실패하면, 갱신만 하는 구조에서는 B 화면 내내
    // A의 색이 깔린다 — 엉뚱한 공연 색이 그대로 보인다. 브랜드색으로 되돌리는 게 맞다.
    // 같은 공연에서 시드 → 포스터로 가는 도중(첫 렌더)에는 애초에 넣은 적이 없어 지울 것도 없다.
    if (appliedFor.current !== undefined && appliedFor.current !== performanceId) {
      root.style.removeProperty(VAR_A)
      appliedFor.current = undefined
    }
  }, [fromPoster, wash, performanceId])

  // 지우는 것은 **화면을 떠날 때 한 번뿐이다.** 이게 없으면 다른 화면까지 그 공연 색으로 물든다
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    return () => {
      root.style.removeProperty(VAR_A)
    }
  }, [])
}
