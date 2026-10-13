import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

import { MyPage } from '@/pages/MyPage'
import { useLogout, useMyMember, useUpdateMyMember } from '@/shared/queries/member'
import { toastApiError } from '@/shared/ui'

const adapter = vi.hoisted(() => ({ disconnect: vi.fn() }))

vi.mock('@/shared/queries/member', () => ({
  CLIENT_ACTION_CLEAR_WEB3AUTH_SESSION: 'CLEAR_WEB3AUTH_SESSION',
  useLogout: vi.fn(),
  useMyMember: vi.fn(),
  useUpdateMyMember: vi.fn(),
}))
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  toastApiError: vi.fn(),
}))
vi.mock('@/shared/blockchain/useWeb3Auth', () => ({
  useWeb3Auth: () => ({ adapter }),
}))

it.each([
  { teams: [] },
  { teams: [{ teamId: 7, teamName: 'Blue note', leader: false }] },
  { teams: [{ teamId: 7, teamName: 'Blue note', leader: true }] },
])('팀 리더 여부와 무관하게 반응형 화면에서 Studio로 들어갈 수 있다: %j', ({ teams }) => {
  vi.mocked(useMyMember).mockReturnValue({
    data: {
      name: '병구',
      email: 'bg@example.com',
      authProvider: 'GOOGLE',
      locale: 'ko',
      displayCurrency: 'KRW',
      timezone: 'Asia/Seoul',
      teams,
      wallet: null,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
  vi.mocked(useLogout).mockReturnValue({ mutateAsync: vi.fn() } as never)
  vi.mocked(useUpdateMyMember).mockReturnValue({ mutate: vi.fn() } as never)
  render(
    <MemoryRouter initialEntries={['/me']}>
      <Routes>
        <Route path="/me" element={<MyPage />} />
        <Route path="/studio" element={<h1>Studio destination</h1>} />
      </Routes>
    </MemoryRouter>,
  )
  const entries = screen.getAllByRole('link', { name: 'Studio' })
  expect(entries).toHaveLength(1)
  for (const entry of entries) expect(entry).toHaveAttribute('href', '/studio')
  fireEvent.click(entries[0]!)
  expect(screen.getByRole('heading', { name: 'Studio destination' })).toBeInTheDocument()
})

it('회원 조회 실패를 placeholder 프로필로만 남기지 않고 사용자에게 알린다', async () => {
  const memberError = new Error('member unavailable')
  vi.mocked(useMyMember).mockReturnValue({
    data: undefined,
    error: memberError,
    isError: true,
    refetch: vi.fn(),
  } as never)
  vi.mocked(useLogout).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(useUpdateMyMember).mockReturnValue({ mutate: vi.fn() } as never)

  render(
    <MemoryRouter>
      <MyPage />
    </MemoryRouter>,
  )

  await waitFor(() => expect(toastApiError).toHaveBeenCalledWith(memberError))
  expect(screen.queryByRole('link', { name: /지갑 등록이 필요해요/ })).not.toBeInTheDocument()
  expect(screen.getAllByText(/Member information unavailable/)).not.toHaveLength(0)
})

it('서버와 Web3Auth 세션을 모두 끊고 홈으로 이동한다', async () => {
  const logout = vi.fn().mockResolvedValue({ clientAction: null })
  adapter.disconnect.mockResolvedValue(undefined)
  vi.mocked(useMyMember).mockReturnValue({
    data: {
      name: '병구',
      email: 'bg@example.com',
      authProvider: 'GOOGLE',
      locale: 'ko',
      displayCurrency: 'KRW',
      timezone: 'Asia/Seoul',
      teams: [],
      wallet: null,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
  vi.mocked(useLogout).mockReturnValue({ mutateAsync: logout } as never)
  vi.mocked(useUpdateMyMember).mockReturnValue({ mutate: vi.fn() } as never)

  render(
    <MemoryRouter initialEntries={['/me']}>
      <Routes>
        <Route path="/me" element={<MyPage />} />
        <Route path="/" element={<div>home destination</div>} />
      </Routes>
    </MemoryRouter>,
  )

  fireEvent.click(screen.getAllByRole('button', { name: /Sign out/ })[0]!)

  await waitFor(() => {
    expect(logout).toHaveBeenCalledWith({})
    expect(adapter.disconnect).toHaveBeenCalledWith()
    expect(screen.getByText('home destination')).toBeInTheDocument()
  })
})

it.each([
  [
    'server logout',
    () =>
      vi
        .mocked(useLogout)
        .mockReturnValue({ mutateAsync: vi.fn().mockRejectedValue(new Error('offline')) } as never),
  ],
  ['Web3Auth disconnect', () => adapter.disconnect.mockRejectedValueOnce(new Error('sdk'))],
])('%s 실패에도 홈으로 이동한다', async (_label, arrangeFailure) => {
  adapter.disconnect.mockResolvedValue(undefined)
  vi.mocked(useMyMember).mockReturnValue({
    data: {
      name: '병구',
      email: 'bg@example.com',
      authProvider: 'GOOGLE',
      locale: 'ko',
      displayCurrency: 'KRW',
      timezone: 'Asia/Seoul',
      teams: [],
      wallet: null,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
  vi.mocked(useLogout).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) } as never)
  vi.mocked(useUpdateMyMember).mockReturnValue({ mutate: vi.fn() } as never)
  arrangeFailure()

  render(
    <MemoryRouter initialEntries={['/me']}>
      <Routes>
        <Route path="/me" element={<MyPage />} />
        <Route path="/" element={<div>home destination</div>} />
      </Routes>
    </MemoryRouter>,
  )

  fireEvent.click(screen.getAllByRole('button', { name: /Sign out/ })[0]!)
  await waitFor(() => expect(screen.getByText('home destination')).toBeInTheDocument())
})
