import { describe, expect, it } from 'vitest'

import { isStageRoute } from './stageRoutes'

describe('isStageRoute', () => {
  it.each(['/', '/performances', '/performances/', '/performances/7', '/performances/7/'])(
    '%s에는 무대 효과를 표시한다',
    (path) => {
      expect(isStageRoute(path)).toBe(true)
    },
  )

  it.each(['/performances/7/order', '/wallet', '/studio', '/verify/supply', '/admin/coin'])(
    '%s에는 무대 효과를 표시하지 않는다',
    (path) => expect(isStageRoute(path)).toBe(false),
  )
})
