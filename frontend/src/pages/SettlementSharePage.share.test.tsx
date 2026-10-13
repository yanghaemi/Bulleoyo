/**
 * V-03 정산 공유(공개) — 라우트 파라미터 이름이 두 문서에서 갈려 있다.
 * 화면설계 v6는 `:shareToken`, `app/router.tsx`는 `:token`이다. **둘 다 읽어야** 어느 쪽으로
 * 확정되든 링크가 죽지 않는다. 그 한 줄이 이 화면의 전부이므로 여기서 지킨다.
 * 에러는 `COMMON_NOT_FOUND` 하나이고, 토큰이 아예 없는 주소도 같은 안내로 받는다.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'

import { SettlementSharePage } from './SettlementSharePage'

const hooks = vi.hoisted(() => ({
  tokens: [] as (string | undefined)[],
  data: undefined as unknown,
  error: null as unknown,
}))

class FakeApiError extends Error {
  readonly code: string
  readonly status = 404
  readonly msg = ''
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>()
  return { ...actual, isApiError: (e: unknown) => e instanceof FakeApiError || actual.isApiError(e) }
})

vi.mock('@/shared/queries/settlement', () => ({
  usePublicSettlement: (token: string | undefined) => {
    hooks.tokens.push(token)
    return { data: hooks.data, error: hooks.error, isPending: false }
  },
}))

function renderAt(path: string, routePath: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={<SettlementSharePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  hooks.tokens = []
  hooks.data = undefined
  hooks.error = new FakeApiError('COMMON_NOT_FOUND')
})

it('라우터의 :token 과 화면설계의 :shareToken 을 둘 다 읽는다', () => {
  renderAt('/settlement/share/stl_a', '/settlement/share/:token')
  expect(hooks.tokens).toContain('stl_a')

  hooks.tokens = []
  renderAt('/settlement/share/stl_b', '/settlement/share/:shareToken')
  expect(hooks.tokens).toContain('stl_b')
})

it('404 는 무효화된 링크 안내 하나로 받는다 — 다른 CTA 를 두지 않는다', () => {
  renderAt('/settlement/share/stl_dead', '/settlement/share/:token')

  expect(screen.getByText('이 링크로는 정산 결과를 볼 수 없습니다')).toBeInTheDocument()
  // 링크를 받은 사람이 회원이 아닐 수 있다(화면설계 1549·1582행)
  expect(screen.queryByRole('button', { name: /로그인/ })).not.toBeInTheDocument()
})
