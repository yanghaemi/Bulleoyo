import { describe, expect, it } from 'vitest'

import { buildDevRoutes } from './devRoutes'

describe('buildDevRoutes', () => {
  it('does not expose the design lab outside development', () => {
    expect(buildDevRoutes(false)).toEqual([])
  })

  it('keeps explicitly named development routes', () => {
    expect(buildDevRoutes(true).map((route) => route.path)).toEqual([
      '/__lab/design-refresh',
      '/dev/ui',
      '/__lab/design-tools',
    ])
  })
})
