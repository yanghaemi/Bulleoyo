import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 100, height: 100 }),
}))

import { Bar } from '@/components/charts/bar'
import { BarChart } from '@/components/charts/bar-chart'

describe('Bklit BarChart bounds', () => {
  it('does not render chart geometry until the container is wider than its margins', () => {
    const { container } = render(
      <BarChart
        data={[{ name: '블루노트', amount: 743_441 }]}
        xDataKey="name"
        orientation="horizontal"
        margin={{ top: 12, right: 24, bottom: 12, left: 96 }}
      >
        <Bar dataKey="amount" animate={false} />
      </BarChart>,
    )

    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })
})
