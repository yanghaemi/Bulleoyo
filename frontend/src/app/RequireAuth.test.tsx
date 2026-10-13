/**
 * 가드의 비자명한 부분 하나 — **새로고침 직후 refresh 복구를 기다리는가.**
 * 기다리지 않으면 세션이 살아 있는데도 새로고침마다 로그인으로 튕긴다.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

import { loginPathFrom } from '@/app/loginPath'
import { RequireAuth } from '@/app/RequireAuth'
import { ensureAccessToken, tokenStore } from '@/shared/api/client'

// 토큰 보관과 재발급만 바꿔 끼운다. 나머지 export(ApiError 등)는 실제 모듈 그대로 둔다 —
// `shared/ui` 배럴이 같은 모듈을 쓰기 때문이다.
vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/client')>()),
  ensureAccessToken: vi.fn(),
  tokenStore: { getAccessToken: vi.fn(), hasSession: vi.fn() },
}))

const mocked = vi.mocked({ ensureAccessToken, ...tokenStore })

/**
 * 데이터 라우터(`createMemoryRouter`)를 쓰지 않는다 — react-router 7이 내부에서 `Request`를
 * 만드는데 jsdom+undici 조합이 `AbortSignal`을 거부해 리다이렉트가 터진다(환경 문제).
 * 가드가 보는 것은 경로와 `Navigate`뿐이라 메모리 라우터로 충분하다.
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/tickets"
          element={
            <RequireAuth>
              <p>My tickets</p>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RequireAuth', () => {
  it('access token이 있으면 그대로 그린다', () => {
    mocked.getAccessToken.mockReturnValue('access')
    renderAt('/tickets')
    expect(screen.getByText('My tickets')).toBeInTheDocument()
    expect(mocked.ensureAccessToken).not.toHaveBeenCalled()
  })

  it('새로고침 직후(access 없음 + refresh 있음)에는 재발급을 기다린 뒤 통과시킨다', async () => {
    mocked.getAccessToken.mockReturnValue(null)
    mocked.hasSession.mockReturnValue(true)
    let resolveRefresh: (ok: boolean) => void = () => {}
    mocked.ensureAccessToken.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveRefresh = resolve
      }),
    )

    renderAt('/tickets')

    // 재발급이 끝나기 전에는 로그인으로 보내지 않는다
    expect(screen.queryByText('Login')).not.toBeInTheDocument()
    expect(screen.queryByText('My tickets')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('로그인 세션을 복구하고 있어요')
    expect(screen.getByRole('img', { name: '불러요' })).toBeInTheDocument()

    resolveRefresh(true)
    expect(await screen.findByText('My tickets')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('재발급에 실패하면 복귀 경로를 달고 C-01로 보낸다', async () => {
    mocked.getAccessToken.mockReturnValue(null)
    mocked.hasSession.mockReturnValue(true)
    mocked.ensureAccessToken.mockResolvedValue(false)

    renderAt('/tickets')

    expect(await screen.findByText('Login')).toBeInTheDocument()
  })

  it('세션 자체가 없으면 재발급을 시도하지 않고 바로 C-01이다', () => {
    mocked.getAccessToken.mockReturnValue(null)
    mocked.hasSession.mockReturnValue(false)

    renderAt('/tickets')

    expect(screen.getByText('Login')).toBeInTheDocument()
    expect(mocked.ensureAccessToken).not.toHaveBeenCalled()
  })

  it('복귀 경로 규칙은 강제 로그아웃 경로와 같은 문자열을 만든다', () => {
    expect(loginPathFrom('/tickets/9?tab=qr')).toBe('/login?from=%2Ftickets%2F9%3Ftab%3Dqr')
    expect(loginPathFrom('/login')).toBe('/login')
  })
})
