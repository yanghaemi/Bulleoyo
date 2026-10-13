import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FeaturedShowStage } from '@/features/performance/FeaturedShowStage'
import i18n from '@/shared/i18n'
import { applyTheme } from '@/shared/theme'
import { DesignRefreshPage } from './DesignRefreshPage'

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useViewTransitionState: () => false,
}))

beforeEach(async () => {
  applyTheme('light')
  await i18n.changeLanguage('en')
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

it('offers the two integrated discovery concepts without API work', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    render(
      <MemoryRouter initialEntries={['/__lab/design-refresh?view=home&concept=editorial-a']}>
        <DesignRefreshPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('region', { name: 'Editorial Stage A 시안' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'B Stronger Identity' }))
    expect(screen.getByRole('region', { name: 'Stronger Identity B 시안' })).toBeVisible()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})

it('hides lab chrome in presentation mode while preserving the selected concept', () => {
  render(
    <MemoryRouter initialEntries={['/__lab/design-refresh?view=home&concept=identity-b&presentation=1']}>
      <DesignRefreshPage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('region', { name: 'Stronger Identity B 시안' })).toBeVisible()
  expect(screen.queryByRole('complementary', { name: 'Design preview' })).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: '디자인 랩 시안' })).not.toBeInTheDocument()
})

it('uses a complete branded poster composition when a featured poster is missing', () => {
  render(
    <MemoryRouter>
      <FeaturedShowStage
        items={[
          {
            performanceId: 'posterless',
            title: 'Posterless Night',
            dateLabel: '2026. 09. 26 · 19:00 KST',
            venue: 'Rolling Hall · Seoul',
            posterImageUrl: null,
          },
        ]}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'Posterless Night', level: 2 })).toBeVisible()
  expect(screen.getByRole('link', { name: 'View show details' })).toHaveAttribute(
    'href',
    '/performances/posterless',
  )
  expect(screen.getByTestId('visual-revival-poster-composition')).toBeVisible()
  expect(screen.queryByTestId('visual-revival-poster-fallback')).not.toBeInTheDocument()
  expect(document.querySelector('.visual-revival__stage canvas')).not.toBeInTheDocument()
})

it('keeps the featured-show counter valid when refreshed data contains fewer items', () => {
  const initialItems = [
    {
      performanceId: 'first',
      title: 'First Show',
      dateLabel: '2026. 09. 26 · 19:00 KST',
      venue: 'Rolling Hall · Seoul',
      posterImageUrl: '/posters/12.webp',
    },
    {
      performanceId: 'second',
      title: 'Second Show',
      dateLabel: '2026. 09. 27 · 19:00 KST',
      venue: 'Rolling Hall · Seoul',
      posterImageUrl: '/posters/13.webp',
    },
  ]
  const { rerender } = render(
    <MemoryRouter>
      <FeaturedShowStage items={initialItems} />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Next featured show' }))
  expect(screen.getByText('2 / 2')).toBeVisible()

  rerender(
    <MemoryRouter>
      <FeaturedShowStage items={[initialItems[0]]} />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'First Show', level: 2 })).toBeVisible()
  expect(screen.getByText('1 / 1')).toBeVisible()
})

it('keeps the featured content static and readable when motion and WebGPU are unavailable', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))

  render(
    <MemoryRouter>
      <FeaturedShowStage
        items={[
          {
            performanceId: 'static-show',
            title: 'Static Show',
            dateLabel: '2026. 09. 26 · 19:00 KST',
            venue: 'Rolling Hall · Seoul',
            posterImageUrl: '/posters/12.webp',
          },
        ]}
      />
    </MemoryRouter>,
  )

  const preview = screen.getByRole('region', { name: 'Featured show' })
  expect(preview).toHaveAttribute('data-motion', 'static')
  expect(preview).toHaveAttribute('data-renderer', 'css')
  expect(screen.getByRole('heading', { name: 'Static Show', level: 2 })).toBeVisible()
  expect(screen.getByRole('link', { name: 'View show details' })).toBeVisible()
})

it('labels preview QR as a sample and makes no API request', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    render(
      <MemoryRouter>
        <DesignRefreshPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ticket detail' }))
    expect(screen.getByText(/sample QR.*not valid for entry/i)).toBeVisible()
    await screen.findByAltText('Entry QR code')
    expect(fetchSpy).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Ticket state'), { target: { value: 'used' } })
    expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel ticket' })).not.toBeInTheDocument()
  } finally {
    fetchSpy.mockRestore()
  }
})

it('offers poster variants and uses one selected language', async () => {
  render(
    <MemoryRouter>
      <DesignRefreshPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Ticket' }))
  expect(screen.getByLabelText('Ticket artwork')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Ticket artwork'), { target: { value: 'poster' } })
  expect(screen.getByTestId('concert-collector-ticket').querySelector('img')).toHaveAttribute(
    'src',
    '/posters/12.webp',
  )
  await act(async () => {
    await i18n.changeLanguage('ko')
  })
  expect(screen.getByLabelText('티켓 배경')).toBeVisible()
  expect(screen.queryByLabelText('Ticket artwork')).not.toBeInTheDocument()
})

it('exposes account setup, profile, and preference fixtures without API work', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    render(
      <MemoryRouter>
        <DesignRefreshPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Account setup' }))
    expect(screen.getByRole('heading', { name: 'Account preferences', level: 1 })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'My page' }))
    expect(screen.getByText('Preview member')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
    expect(screen.getByRole('region', { name: 'Preview' })).toBeVisible()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})

it('keeps studio back navigation inside the design lab', () => {
  render(
    <MemoryRouter
      initialEntries={['/__lab/design-refresh?v=2&view=studio-settlement-rules']}
    >
      <DesignRefreshPage />
    </MemoryRouter>,
  )

  const links = screen.getAllByRole('link', { name: 'Back to Studio' })
  expect(links).toHaveLength(2)
  links.forEach((link) =>
    expect(link).toHaveAttribute(
      'href',
      '/__lab/design-refresh?v=2&view=studio-performance',
    ),
  )
})

it('exposes balance and wallet setup fixtures without API work', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    render(
      <MemoryRouter>
        <DesignRefreshPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Balance' }))
    expect(screen.getByRole('heading', { name: 'Balance', level: 1 })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Activity' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Wallet setup' }))
    expect(screen.getByRole('heading', { name: 'Let’s set up your wallet' })).toBeVisible()
    expect(screen.getByRole('radiogroup', { name: 'Choose a wallet' })).toBeVisible()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})

it('exposes the ticket and team selection steps without API work', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    render(
      <MemoryRouter>
        <DesignRefreshPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ticket options' }))
    expect(screen.getByRole('heading', { name: 'Choose tickets', level: 1 })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Team choice' }))
    expect(
      screen.getByRole('heading', { name: 'Allocate tickets by team', level: 1 }),
    ).toBeVisible()
    expect(screen.getByText('0 of 3 tickets assigned')).toBeVisible()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})

it('주소로 티켓 미리보기를 바로 열어 공연 탐색 화면으로 오해하지 않게 한다', () => {
  render(
    <MemoryRouter initialEntries={['/__lab/design-refresh?v=1&view=tickets']}>
      <DesignRefreshPage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'My Tickets', level: 1 })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Ticket preview settings' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Editorial Stage A 시안' })).not.toBeInTheDocument()
})

it('브라우저 뒤로 가기에서 view 쿼리와 미리보기 화면을 함께 되돌린다', async () => {
  function PreviewWithBack() {
    const navigate = useNavigate()
    return (
      <>
        <button type="button" onClick={() => navigate(-1)}>Back</button>
        <DesignRefreshPage />
      </>
    )
  }
  render(
    <MemoryRouter
      initialEntries={[
        '/__lab/design-refresh?v=1&view=home',
        '/__lab/design-refresh?v=1&view=tickets',
      ]}
      initialIndex={1}
    >
      <PreviewWithBack />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'My Tickets', level: 1 })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))

  expect(await screen.findByRole('region', { name: 'Editorial Stage A 시안' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'My Tickets', level: 1 })).not.toBeInTheDocument()
})

it('exposes the main studio workflow fixtures without API work', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    render(
      <MemoryRouter>
        <DesignRefreshPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create team' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Create team' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Manage team' }))
    expect(screen.getByRole('heading', { name: 'Your team' })).toBeVisible()
    expect(screen.getAllByText('Blue Note').length).toBeGreaterThan(0)
    expect(screen.getByText('A two-team live music collective.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Create show' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Show setup' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: 'Create a show' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Review before publishing' }))
    expect(
      screen.getByRole('heading', { level: 2, name: 'Review before publishing' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Publishing unavailable' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Rule agreements' }))
    expect(screen.getByText('1 of 2 teams agreed')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Participant teams' }))
    expect(screen.getAllByRole('heading', { name: 'Participants' })[0]).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Settlement rules' }))
    expect(screen.getByRole('heading', { name: 'Fixed share and audience choice' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Sales overview' }))
    expect(screen.getAllByText('1,600,000 YoYo')[0]).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Settlement' }))
    expect(screen.getByText('1,525,000 YoYo')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Entry activity' }))
    expect(screen.getByRole('region', { name: 'Entry activity' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Verification' }))
    expect(screen.getByText(/Settlement verification/)).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Supply disclosure' }))
    expect(screen.getByText('Coin supply & escrow')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Public settlement' }))
    expect(screen.getByText('BULLEOYO settlement report')).toBeVisible()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
}, 15_000)

it('exposes admin and recovery fixtures without API work', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    render(
      <MemoryRouter>
        <DesignRefreshPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disputes' }))
    expect(screen.getByRole('button', { name: /Seoul Indie Night.*Blue Note/ })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Seoul Indie Night.*Blue Note/ }))
    expect(screen.getByRole('button', { name: 'Reject' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible()
    expect(screen.queryByText('처리 의견')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Coin operations' }))
    expect(screen.getByRole('heading', { name: 'Coin operations' })).toBeVisible()
    expect(screen.getByText('Supply status')).toBeVisible()
    expect(screen.getByText('Demo coin grant')).toBeVisible()
    expect(screen.getByRole('main').textContent).not.toMatch(/[가-힣]/)

    fireEvent.click(screen.getByRole('button', { name: 'Route recovery' }))
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})
