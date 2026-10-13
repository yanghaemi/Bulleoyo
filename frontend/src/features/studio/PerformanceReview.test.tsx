import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import i18n from '@/shared/i18n'
import { PerformanceReview } from './PerformanceReview'

const props = {
  info: {
    title: '합정 라이브 나이트',
    startAtLabel: '2026. 09. 22. 19:00 KST',
    endAtLabel: '2026. 09. 22. 21:00 KST',
    venueName: '롤링홀',
    venueAddress: '서울시 마포구 어울마당로 35',
  },
  posterImageUrl: '/poster.jpg',
  ticketArtworkImageUrl: '/ticket-art.jpg',
  ticketTypes: [
    { key: 'general', name: '일반', priceLabel: '25,000 YoYo', totalQuantityLabel: '50매' },
    { key: 'vip', name: 'VIP', priceLabel: '40,000 YoYo', totalQuantityLabel: '10매' },
  ],
  onEditInfo: vi.fn(),
  onEditPoster: vi.fn(),
  onEditTicketArtwork: vi.fn(),
  onEditTicketTypes: vi.fn(),
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  vi.clearAllMocks()
})

it('등록 전에 공연·미디어·티켓 옵션을 한 화면에서 확인한다', () => {
  render(<PerformanceReview {...props} />)

  expect(screen.getByRole('heading', { name: '등록 전 확인', level: 2 })).toBeVisible()
  expect(screen.getByText('합정 라이브 나이트')).toBeVisible()
  expect(screen.getByText('2026. 09. 22. 19:00 KST')).toBeVisible()
  expect(screen.getByText('2026. 09. 22. 21:00 KST')).toBeVisible()
  expect(screen.getByText('롤링홀')).toBeVisible()
  expect(screen.getByText('서울시 마포구 어울마당로 35')).toBeVisible()
  expect(screen.getByRole('img', { name: '공연 포스터 미리보기' })).toHaveAttribute(
    'src',
    '/poster.jpg',
  )
  expect(screen.getByRole('img', { name: '티켓 이미지 미리보기' })).toHaveAttribute(
    'src',
    '/ticket-art.jpg',
  )

  const options = screen.getByRole('region', { name: '티켓 옵션' })
  expect(within(options).getByText('일반')).toBeVisible()
  expect(within(options).getByText('25,000 YoYo')).toBeVisible()
  expect(within(options).getByText('50매')).toBeVisible()
  expect(within(options).getByText('VIP')).toBeVisible()
})

it('각 수정 버튼은 해당 단계 콜백만 호출한다', async () => {
  const user = userEvent.setup()
  render(<PerformanceReview {...props} />)

  await user.click(screen.getByRole('button', { name: '공연 정보 수정' }))
  await user.click(screen.getByRole('button', { name: '포스터 수정' }))
  await user.click(screen.getByRole('button', { name: '티켓 꾸미기' }))
  await user.click(screen.getByRole('button', { name: '티켓 옵션 수정' }))

  expect(props.onEditInfo).toHaveBeenCalledTimes(1)
  expect(props.onEditPoster).toHaveBeenCalledTimes(1)
  expect(props.onEditTicketArtwork).toHaveBeenCalledTimes(1)
  expect(props.onEditTicketTypes).toHaveBeenCalledTimes(1)
})

it('실제 미디어 저장 계약이 없을 때 최종 등록을 명확히 막는다', () => {
  render(<PerformanceReview {...props} />)

  const blocked = screen.getByRole('status')
  const submit = screen.getByRole('button', { name: '공연 등록 준비 중' })
  expect(blocked).toHaveTextContent('실제 이미지 저장 API 연결 전에는 최종 등록할 수 없습니다.')
  expect(submit).toBeDisabled()
  expect(submit).toHaveAttribute('aria-describedby', blocked.id)
})

it('이미지가 없으면 조작 가능한 티켓 정보를 꾸며내지 않고 빈 상태를 표시한다', () => {
  render(
    <PerformanceReview {...props} posterImageUrl={undefined} ticketArtworkImageUrl={undefined} />,
  )

  expect(screen.getByText('포스터가 아직 저장되지 않았습니다.')).toBeVisible()
  expect(screen.getByText('티켓 이미지가 아직 저장되지 않았습니다.')).toBeVisible()
  expect(screen.queryByText(/QR|티켓 번호|VALID/)).not.toBeInTheDocument()
})

it('영어를 선택하면 검토 화면 안내를 영어로만 표시한다', async () => {
  await i18n.changeLanguage('en')
  render(<PerformanceReview {...props} />)

  expect(screen.getByRole('heading', { name: 'Review before publishing', level: 2 })).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent(
    'Final publishing is unavailable until the real image storage API is connected.',
  )
  expect(screen.getByRole('button', { name: 'Publishing unavailable' })).toBeDisabled()
  expect(screen.queryByText('등록 전 확인')).not.toBeInTheDocument()
})
