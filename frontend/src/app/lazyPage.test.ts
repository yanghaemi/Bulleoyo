import { describe, expect, it } from 'vitest'

import { lazyPage } from './lazyPage'

describe('lazyPage', () => {
  it('동적 모듈에서 지정한 named page를 React Router Component로 반환한다', async () => {
    function Page() {
      return null
    }

    const load = lazyPage(async () => ({ Page }), 'Page')

    await expect(load()).resolves.toEqual({ Component: Page })
  })
})
