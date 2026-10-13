import type { RouteObject } from 'react-router'

/** 개발 빌드에서만 실험실 진입점을 만든다. 프로덕션에는 경로 자체가 존재하지 않는다. */
export function buildDevRoutes(enabled: boolean): RouteObject[] {
  if (!enabled) return []

  return [
    {
      path: '/__lab/design-refresh',
      lazy: async () => {
        const module = await import('@/pages/DesignRefreshPage')
        return { Component: module.DesignRefreshPage }
      },
      handle: { title: 'Design preview' },
    },
    {
      path: '/dev/ui',
      lazy: async () => {
        const module = await import('@/pages/DevUiPage')
        return { Component: module.DevUiPage }
      },
      handle: { title: 'UI 개발 도구' },
    },
    {
      path: '/__lab/design-tools',
      lazy: async () => {
        const module = await import('@/pages/DesignToolsLabPage')
        return { Component: module.DesignToolsLabPage }
      },
      handle: { title: 'Design Tools Lab' },
    },
  ]
}
