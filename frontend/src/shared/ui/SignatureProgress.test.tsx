import { render, screen } from '@testing-library/react'

import { SignatureProgress } from '@/shared/ui/SignatureProgress'

describe('SignatureProgress', () => {
  it('falls back to finite progress values when API numbers are invalid', () => {
    render(<SignatureProgress current={Number.NaN} total={Number.NaN} phase="signing" />)

    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toHaveAttribute('aria-valuemax', '1')
    expect(progressbar).toHaveAttribute('aria-valuenow', '0')
    expect(progressbar.firstElementChild).toHaveStyle({ width: '0%' })
    expect(screen.getByText('0/1')).toBeInTheDocument()
  })
})
