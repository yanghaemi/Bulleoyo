import { render, screen, waitFor, within } from '@testing-library/react'
import i18n from '@/shared/i18n'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

import { SettlementLightStage } from './SettlementLightStage'

describe('SettlementLightStage', () => {
  it.each([
    [6500, 3500, '0.65', '0.35', '65%', '35%'],
    [3500, 6500, '0.35', '0.65', '35%', '65%'],
    [5000, 5000, '0.5', '0.5', '50%', '50%'],
    [0, 10000, '0', '1', '0%', '100%'],
    [10000, 0, '1', '0', '100%', '0%'],
  ])(
    'maps %i/%i bp to labeled lights, including zero shares',
    (fixedBp, selectionBp, fixedRatio, selectionRatio, fixedLabel, selectionLabel) => {
      render(
        <SettlementLightStage fixedBp={fixedBp} selectionBp={selectionBp} valid reducedMotion />,
      )

      expect(screen.getByTestId('fixed-light')).toHaveStyle({ '--light-ratio': fixedRatio })
      expect(screen.getByTestId('selection-light')).toHaveStyle({ '--light-ratio': selectionRatio })
      expect(screen.getByRole('group', { name: '고정 분배 조명' })).toHaveTextContent(fixedLabel)
      expect(screen.getByRole('group', { name: '관객 선택 조명' })).toHaveTextContent(
        selectionLabel,
      )
      // Even a zero allocation has a visible light marker; labels live outside the animation.
      expect(screen.getByTestId('fixed-light')).toHaveStyle({ minWidth: '12px' })
      expect(screen.getByTestId('selection-light')).toHaveStyle({ minWidth: '12px' })
    },
  )

  it('retains the last valid pair across invalid drafts and recovers with the next valid pair', () => {
    const view = render(
      <SettlementLightStage fixedBp={6000} selectionBp={4000} valid reducedMotion />,
    )
    for (const [fixedBp, selectionBp] of [
      [0, 0],
      [10001, 4000],
      [6000, 3000],
      [3500, 6500],
    ]) {
      view.rerender(
        <SettlementLightStage
          fixedBp={fixedBp}
          selectionBp={selectionBp}
          valid={false}
          reducedMotion
        />,
      )
      expect(screen.getByTestId('fixed-light')).toHaveStyle({ '--light-ratio': '0.6' })
      expect(screen.getByTestId('selection-light')).toHaveStyle({ '--light-ratio': '0.4' })
      expect(screen.getByRole('status')).toHaveTextContent('마지막 유효 비율')
    }
    view.rerender(<SettlementLightStage fixedBp={3500} selectionBp={6500} valid reducedMotion />)
    expect(screen.getByTestId('fixed-light')).toHaveStyle({ flexGrow: '0.35', opacity: '0.304' })
    expect(screen.queryByText(/마지막 유효 비율/)).not.toBeInTheDocument()
  })

  it('does not invent a valid ratio when first mounted with invalid values', () => {
    render(<SettlementLightStage fixedBp={0} selectionBp={0} valid={false} />)
    expect(screen.queryByTestId('fixed-light')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('유효한 비율을 입력하면')
    expect(
      within(screen.getByRole('group', { name: '고정 분배 조명' })).getByText('—'),
    ).toBeInTheDocument()
  })

  it('retargets real motion between valid ratios while percentage text updates immediately', async () => {
    const view = render(<SettlementLightStage fixedBp={3500} selectionBp={6500} valid />)
    view.rerender(<SettlementLightStage fixedBp={5000} selectionBp={5000} valid />)
    expect(screen.getByRole('group', { name: '고정 분배 조명' })).toHaveTextContent('50%')
    await waitFor(() => {
      const grow = Number(screen.getByTestId('fixed-light').style.flexGrow)
      expect(grow).toBeGreaterThan(0.35)
      expect(grow).toBeLessThan(0.5)
    })
    view.rerender(<SettlementLightStage fixedBp={10000} selectionBp={0} valid />)
    await waitFor(() => {
      expect(screen.getByTestId('fixed-light')).toHaveStyle({ flexGrow: '1' })
      expect(Number(screen.getByTestId('fixed-light').style.opacity)).toBeCloseTo(0.46)
      expect(screen.getByTestId('selection-light')).toHaveStyle({ flexGrow: '0', opacity: '0.22' })
    })
  })
})
