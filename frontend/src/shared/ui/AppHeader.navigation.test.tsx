import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { api, tokenStore } from '@/shared/api/client'
import { AppHeader } from './AppHeader'

describe('AppHeader identity font', () => {
  const fontSelector = 'link[data-editorial-lab-font="pretendard"]'

  beforeEach(() => {
    document.head.querySelectorAll(fontSelector).forEach((link) => link.remove())
  })
  afterEach(() => {
    document.head.querySelectorAll(fontSelector).forEach((link) => link.remove())
  })

  it('홈을 방문하지 않고 티켓 경로에서 마운트해도 폰트를 한 번만 로드한다', () => {
    const mountHeader = () =>
      render(
        <MemoryRouter initialEntries={['/tickets']}>
          <AppHeader />
        </MemoryRouter>,
      )

    const firstMount = mountHeader()
    expect(document.head.querySelectorAll(fontSelector)).toHaveLength(1)
    const fontLink = document.head.querySelector(fontSelector)
    expect(fontLink).toHaveAttribute('rel', 'stylesheet')

    firstMount.unmount()
    expect(fontLink).toBeInTheDocument()
    mountHeader()
    expect(document.head.querySelectorAll(fontSelector)).toHaveLength(1)
    expect(document.head.querySelector(fontSelector)).toBe(fontLink)
  })
})

function Location() {
  const location = useLocation()
  return (
    <output aria-label="경로">
      {location.pathname}
      {location.search}
    </output>
  )
}
function mount(
  signedIn = true,
  notificationItems?: Array<{
    id: string
    title: string
    description: string
    to: string
  }>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppHeader signedIn={signedIn} notificationItems={notificationItems} />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}
describe('AppHeader navigation', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
  })
  it('내 티켓은 헤더에서 바로 열고 나머지 개인 영역은 프로필에 묶는다', () => {
    mount()
    expect(screen.getByRole('link', { name: '공연 찾기' })).toHaveAttribute('href', '/performances')
    expect(screen.getByRole('link', { name: '내 티켓' })).toHaveAttribute('href', '/tickets')
    fireEvent.click(screen.getByRole('button', { name: '프로필 메뉴 열기' }))
    for (const [name, href] of [
      ['마이페이지', '/me'],
      ['내 티켓', '/tickets'],
      ['지갑', '/wallet'],
      ['설정', '/me/preferences'],
      ['스튜디오', '/studio'],
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
    }
    expect(screen.getAllByRole('link', { name: '내 티켓' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '라이트 테마 사용' })).not.toBeInTheDocument()
  })
  it('실제 미처리 액션 수를 배지에 표시하고 알림에서 해당 화면으로 연결한다', () => {
    mount(true, [
      {
        id: 'invite-7-11',
        title: '공연 초대에 응답해 주세요',
        description: '서울 인디 나이트 · 팀 #11',
        to: '/studio/performances/7/participants',
      },
      {
        id: 'agree-9-12',
        title: '규칙 동의가 필요합니다',
        description: '한강 라이브 · 팀 #12',
        to: '/studio/performances/9/agreements',
      },
    ])

    const trigger = screen.getByRole('button', { name: '확인할 알림 2개' })
    expect(trigger).toHaveTextContent('2')
    fireEvent.click(trigger)
    expect(screen.getByRole('heading', { name: '확인할 일' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /공연 초대에 응답해 주세요/ })).toHaveAttribute(
      'href',
      '/studio/performances/7/participants',
    )
    expect(screen.getByRole('link', { name: /규칙 동의가 필요합니다/ })).toHaveAttribute(
      'href',
      '/studio/performances/9/agreements',
    )
  })
  it('미처리 액션이 없으면 빨간 숫자를 만들지 않는다', () => {
    mount(true, [])
    const trigger = screen.getByRole('button', { name: '알림' })
    expect(trigger).not.toHaveTextContent(/\d/)
    fireEvent.click(trigger)
    expect(screen.getByText('새로 확인할 일이 없어요.')).toBeInTheDocument()
  })
  it('Escape로 닫으면 프로필 버튼으로 포커스를 돌린다', () => {
    mount()
    const trigger = screen.getByRole('button', { name: '프로필 메뉴 열기' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })
  it('비회원도 로그인과 언어·테마 설정에 바로 접근한다', () => {
    mount(false)
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
    fireEvent.click(screen.getByRole('button', { name: '환경설정 메뉴 열기' }))
    expect(screen.getByRole('button', { name: '라이트 테마 사용' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '공연 만들기' })).not.toBeInTheDocument()
  })
  it('콜백이 없는 페이지에서도 검색어를 입력하고 검색 결과로 이동한다', () => {
    mount(false)
    const input = screen.getByRole('searchbox', { name: '공연 검색' })
    fireEvent.change(input, { target: { value: '서울 공연' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByLabelText('경로')).toHaveTextContent(
      '/performances?keyword=%EC%84%9C%EC%9A%B8%20%EA%B3%B5%EC%97%B0',
    )
  })
  it('검색 아이콘을 눌러도 검색을 확정할 수 있다', () => {
    mount(false)
    fireEvent.change(screen.getByRole('searchbox', { name: '공연 검색' }), {
      target: { value: '무대' },
    })
    fireEvent.click(screen.getByRole('button', { name: '검색' }))
    expect(screen.getByLabelText('경로')).toHaveTextContent(
      '/performances?keyword=%EB%AC%B4%EB%8C%80',
    )
  })
  it('로그아웃 중 프로필을 닫고 다시 열어도 중복 요청을 막는다', async () => {
    let finish!: (value: { loggedOut: boolean }) => void
    const post = vi.spyOn(api, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }) as never,
    )
    mount()
    const trigger = screen.getByRole('button', { name: '프로필 메뉴 열기' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: '로그아웃 중…' })).toBeDisabled()
    expect(post).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ loggedOut: true })
    })
  })

  it('프로필 로그아웃은 기존 API와 캐시 정리를 사용한다', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ loggedOut: true })
    const clear = vi.spyOn(tokenStore, 'clear')
    const client = mount()
    client.setQueryData(['private-wallet-test'], { amount: 123 })
    fireEvent.click(screen.getByRole('button', { name: '프로필 메뉴 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(clear).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/auth/logout', { allDevices: false })
    expect(client.getQueryData(['private-wallet-test'])).toBeUndefined()
  })
})
