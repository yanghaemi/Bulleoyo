/**
 * 라우트가 바뀔 때 문서 제목을 맞춘다.
 *
 * 2026-09-10 감사에서 33개 화면이 전부 탭 제목 `B204`를 달고 있는 것이 드러났다.
 * 제목을 **화면마다 호출하지 않고 라우트 표 한 곳**에서 정하려고, 각 라우트의
 * `handle.title`을 읽어 여기서 세팅한다 — 화면 컴포넌트는 이 사실을 몰라도 된다.
 *
 * 이 컴포넌트는 껍데기라 아무것도 그리지 않는다. 라우터 컨텍스트 안에 있어야
 * `useMatches`가 동작하므로 루트 라우트의 element로 둔다.
 */

import { Outlet, useMatches } from 'react-router'

import { SigningOverlay } from '@/app/SigningOverlay'
import { StageEffects } from '@/app/StageEffects'
import { usePageTitle } from '@/shared/usePageTitle'

/** 라우트 표가 `handle`에 담는 값 */
export interface RouteHandle {
  /** 탭·링크 제목. 없으면 브랜드명만 남는다 */
  title?: string
  /** 링크 미리보기 설명. 없으면 index.html의 기본 설명을 그대로 둔다 */
  description?: string
}

export function RouteTitle() {
  const matches = useMatches()
  // 가장 깊은 매치의 handle이 이긴다 — 중첩이 생겨도 자식이 부모 제목을 덮는다
  const handle = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)
    ?.handle as RouteHandle | undefined

  usePageTitle(handle?.title, handle?.description)

  return (
    <>
      <StageEffects />
      <Outlet />
      <SigningOverlay />
    </>
  )
}
