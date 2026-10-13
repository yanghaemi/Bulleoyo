import { render, screen, waitFor } from '@testing-library/react'

import { MotionDisclosure } from './MotionDisclosure'

describe('MotionDisclosure', () => {
  it('mounts open content and removes it after closing', async () => {
    const { rerender } = render(
      <MotionDisclosure open={false} id="details-panel">
        details
      </MotionDisclosure>,
    )

    expect(screen.queryByText('details')).not.toBeInTheDocument()

    rerender(
      <MotionDisclosure open id="details-panel">
        details
      </MotionDisclosure>,
    )

    await waitFor(() => expect(screen.getByText('details')).toBeVisible())
    expect(screen.getByText('details').closest('#details-panel')).toBeInTheDocument()

    rerender(
      <MotionDisclosure open={false} id="details-panel">
        details
      </MotionDisclosure>,
    )

    await waitFor(() => expect(screen.queryByText('details')).not.toBeInTheDocument())
  })
})
