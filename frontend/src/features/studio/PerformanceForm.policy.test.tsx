import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'

import { PerformanceForm, type PerformanceEditData } from './PerformanceForm'

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
  status: 'DRAFT',
  ticketTypes: [{ key: 't1', ticketTypeId: 1, name: '일반', price: '25000', totalQuantity: '50' }],
}

/**
 * 예매 마감·취소 마감은 사이트 정책 값이다(9/24). 테두리 박스가 입력칸으로 읽혀 눌러 고치려
 * 했다 — 입력·버튼 역할이 없고 탭 순서에도 없어야 한다.
 */
describe('정보 단계 — 예매·취소 마감 정책 표시', () => {
  it('저장 전에는 정책 문장만 보여주고 입력·버튼 역할도 탭 순서도 없다', () => {
    render(
      <MemoryRouter>
        <PerformanceForm mode="create" teams={[{ teamId: 1, teamName: '팀' }]} />
      </MemoryRouter>,
    )

    const blocks = screen.getAllByTestId('policy-value')
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      expect(within(block).queryByRole('textbox')).toBeNull()
      expect(within(block).queryByRole('button')).toBeNull()
      expect(block.querySelector('[tabindex]')).toBeNull()
      // 입력칸 모양(테두리 + 입력 배경)도, 눌리는 칩 모양(알약 배경)도 쓰지 않는다(9/26)
      expect(block.innerHTML).not.toContain('border-line')
      expect(block.innerHTML).not.toContain('rounded-chip')
      expect(block.innerHTML).not.toContain('bg-ground')
      expect(block.className).toContain('cursor-default')
      // 입력 그리드 밖, "사이트 정책" 묶음 안에 있다
      expect(block.closest('section[aria-label="사이트 정책"]')).not.toBeNull()
    }
    expect(screen.getByText('사이트 정책 · 변경할 수 없어요')).toBeInTheDocument()
    expect(within(blocks[0]).getByText('공연 시작 1분 전')).toBeInTheDocument()
    expect(within(blocks[1]).getByText('공연 3일 전 00:00')).toBeInTheDocument()
    expect(screen.getByText('공연 일시에서 자동으로 계산돼요.')).toBeInTheDocument()
  })

  it('저장 뒤 서버 시각이 있으면 같은 모양으로 그 시각을 보여준다', () => {
    render(
      <MemoryRouter>
        <PerformanceForm
          mode="edit"
          data={{
            ...data,
            saleCloseAt: '2030-09-22T18:59:00+09:00',
            cancelDeadlineAt: '2030-09-19T00:00:00+09:00',
          }}
          teams={[{ teamId: 1, teamName: '팀' }]}
        />
      </MemoryRouter>,
    )

    const [sale, cancel] = screen.getAllByTestId('policy-value')
    // Jenkins Node의 ICU 데이터는 ko-KR dayPeriod를 "PM"으로 찍는다(로컬은 "오후") — 둘 다 허용
    expect(sale.textContent).toMatch(/9월 22일 (오후|PM) 6:59 KST/)
    expect(sale.textContent).toContain('(공연 시작 1분 전)')
    expect(cancel.textContent).toMatch(/9월 19일/)
    expect(within(sale).queryByRole('textbox')).toBeNull()
  })

  it('판매 중(읽기 전용) 공연에서도 같은 평문 묶음이다 — 비활성 입력칸으로 그리지 않는다', () => {
    render(
      <MemoryRouter>
        <PerformanceForm
          mode="edit"
          data={{
            ...data,
            status: 'ON_SALE',
            saleCloseAt: '2030-09-22T18:59:00+09:00',
            cancelDeadlineAt: '2030-09-19T00:00:00+09:00',
          }}
          teams={[{ teamId: 1, teamName: '팀' }]}
        />
      </MemoryRouter>,
    )

    for (const block of screen.getAllByTestId('policy-value')) {
      expect(block.querySelector('input, textarea, select, button, [tabindex]')).toBeNull()
      expect(block.innerHTML).not.toContain('border-line')
    }
  })
})
