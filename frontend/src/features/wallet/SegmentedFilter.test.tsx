import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { SegmentedFilter } from './SegmentedFilter'

it('row 필터는 페이지가 아니라 자체 영역에서만 가로 스크롤한다', () => {
  render(
    <SegmentedFilter
      items={[
        { key: 'ALL', en: 'All', ko: '전체' },
        { key: 'PAYMENT', en: 'Payment', ko: '결제' },
      ]}
      value="ALL"
      onChange={() => undefined}
      orientation="row"
      ariaLabel="거래 필터"
    />,
  )

  const filter = screen.getByRole('group', { name: '거래 필터' })
  expect(filter).toHaveAttribute('data-scroll-region', 'horizontal')
  expect(filter).toHaveClass('max-w-full', 'min-w-0', 'overflow-x-auto')
})
