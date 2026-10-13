import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InvariantList } from '@/features/verify/InvariantList'
import type { InvariantRow } from '@/features/verify/invariants'

vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({ language: 'ko', text: (ko: string) => ko }),
}))

const row: InvariantRow = {
  no: 1,
  title: '① totalSupply = Σ Minted',
  state: 'matched',
  expected: 100,
  actual: 100,
  expectedLabel: 'Σ Minted',
  actualLabel: 'totalSupply',
  unit: 'krw',
  diff: 0,
}

describe('InvariantList', () => {
  it('opens automatically when a collapsed V-02 list receives a problem row', () => {
    const { rerender } = render(<InvariantList rows={[row]} collapsible defaultOpen={false} />)

    expect(screen.queryByText('① totalSupply = Σ Minted')).not.toBeInTheDocument()

    rerender(
      <InvariantList
        rows={[{ ...row, state: 'mismatched', diff: -10, severity: 'danger' }]}
        collapsible
        defaultOpen
      />,
    )

    expect(screen.getByText('① totalSupply = Σ Minted')).toBeInTheDocument()
    expect(screen.getByText('장부 초과')).toBeInTheDocument()
  })
})
