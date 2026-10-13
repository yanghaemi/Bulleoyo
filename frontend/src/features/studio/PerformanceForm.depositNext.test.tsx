import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'

import { PerformanceForm, type PerformanceEditData } from './PerformanceForm'
import { SETUP_STEP_DEPOSIT } from './setupSteps'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

const data: PerformanceEditData = {
  performanceId: 12,
  title: '로컬 테스트 공연',
  venueName: '롤링홀',
  venueAddress: '서울시 마포구 어울마당로 35',
  startAt: '2030-09-22T19:00:00+09:00',
  endAt: '2030-09-22T21:00:00+09:00',
  status: 'PENDING_AGREEMENT',
  ticketTypes: [{ key: 't1', ticketTypeId: 1, name: '일반', price: '25000', totalQuantity: '50' }],
}

const wallet = {
  provider: 'WEB3AUTH' as const,
  address: '0x' + '1'.repeat(40),
  status: 'LINKED' as const,
  balanceAmount: 100_000,
}

function renderDeposit(props: Partial<Parameters<typeof PerformanceForm>[0]>) {
  return render(
    <MemoryRouter>
      <PerformanceForm
        mode="edit"
        data={data}
        teams={[{ teamId: 1, teamName: '팀' }]}
        initialStep={SETUP_STEP_DEPOSIT}
        wallet={wallet}
        {...props}
      />
    </MemoryRouter>,
  )
}

/**
 * 9/24 — 보증금 납부 뒤 "참여팀 관리로"가 주 버튼으로 떠 리더를 P-04 로 되돌려 보냈다.
 * 다음 행동은 판매 시작(P-06)이다.
 */
describe('보증금 완료 뒤 다음 행동', () => {
  it('이미 납부한 공연은 "판매 시작하러 가기"만 두고 "참여팀 초대"는 없다', () => {
    renderDeposit({ deposit: { status: 'PAID', amount: 50_000 }, allAgreed: true })

    const panel = screen.getByRole('region', { name: '보증금' })
    expect(within(panel).getByRole('link', { name: '판매 시작하러 가기' })).toHaveAttribute(
      'href',
      '/studio/performances/12/agreements',
    )
    expect(screen.queryByRole('link', { name: '참여팀 초대' })).toBeNull()
    expect(screen.queryByText('다른 팀 동의가 끝나면 판매를 시작할 수 있어요.')).toBeNull()
  })

  it('방금 납부가 확정돼도(done) 같은 링크로 가고, 전원 동의 전이면 한 줄을 함께 보여준다', async () => {
    const user = userEvent.setup()
    renderDeposit({
      deposit: { status: 'UNPAID', amount: 50_000, leaderBalance: 100_000, sufficient: true },
      allAgreed: false,
      onPayDeposit: () => Promise.resolve({ ok: true }),
    })

    await user.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

    const links = await screen.findAllByRole('link', { name: '판매 시작하러 가기' })
    // 패널 안 + 모바일 하단 고정 — 두 자리 모두 P-06 이다
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/studio/performances/12/agreements')
    }
    expect(screen.getByText('다른 팀 동의가 끝나면 판매를 시작할 수 있어요.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '참여팀 초대' })).toBeNull()
  })
})
