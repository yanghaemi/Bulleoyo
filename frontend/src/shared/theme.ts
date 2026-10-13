/**
 * 사용자 테마 전환.
 *
 * 첫 방문은 다크이며 사용자가 고른 라이트·다크만 브라우저에 저장한다. 과거 개발용
 * Meta·Apple·team 값은 더 이상 복원하지 않고 다크로 정규화한다. 스토리지 접근이 막힌
 * 환경에서도 화면은 다크로 계속 렌더된다.
 */

import { useEffect, useState } from 'react'

export type ThemeName = 'light' | 'dark'

/**
 * ⚠ 이 키와 아래 `DEFAULT_THEME`·`THEMES`는 `index.html`의 인라인 부트 스크립트에도
 * 같은 값으로 적혀 있다. 첫 페인트 전에 테마를 정하려면 번들을 기다릴 수 없어서다.
 * 한쪽만 고치면 첫 프레임과 그 이후의 테마가 갈린다 — 고칠 때 둘을 함께 본다.
 */
const KEY = 'b204.theme.light-v1'
export const DEFAULT_THEME: ThemeName = 'dark'
const THEMES: readonly ThemeName[] = ['light', 'dark']

function isTheme(v: unknown): v is ThemeName {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v)
}

export function readTheme(): ThemeName {
  try {
    const v = localStorage.getItem(KEY)
    return isTheme(v) ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** 문서에 지금 적용된 테마. 라이트는 불필요한 속성을 남기지 않는다. */
export function currentTheme(): ThemeName {
  if (typeof document === 'undefined') return DEFAULT_THEME
  const v = document.documentElement.getAttribute('data-theme')
  if (isTheme(v)) return v
  // 라이트는 CSS 기본 토큰이라 속성을 남기지 않는다. 기본값이 다크여도 사용자가 저장한
  // 라이트 선택을 현재값으로 읽어야 스위치가 반대로 보이지 않는다.
  return readTheme()
}

export function applyTheme(name: ThemeName): void {
  const root = document.documentElement
  if (name === 'light') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', name)

  try {
    localStorage.setItem(KEY, name)
  } catch {
    /* 스토리지가 막혀 있어도 테마 적용 자체는 계속된다 */
  }
}

/** 앱 시작 시 1회. 저장된 값이 없으면 팀 토큰이다 */
export function initTheme(): void {
  applyTheme(readTheme())
}

/**
 * 현재 테마를 React 상태로 구독한다.
 *
 * 스토어를 따로 두지 않고 `<html data-theme>`를 MutationObserver로 본다 — 이미 CSS가
 * 그 속성 하나를 정본으로 삼고 있으므로 JS도 같은 곳을 읽는 게 맞다. `ThemeSwitch`가
 * 아니라 개발자 도구에서 속성을 바꿔도 따라온다.
 */
export function useTheme(): ThemeName {
  const [theme, setTheme] = useState<ThemeName>(currentTheme)
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setTheme(currentTheme()))
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    setTheme(currentTheme())
    return () => observer.disconnect()
  }, [])
  return theme
}
