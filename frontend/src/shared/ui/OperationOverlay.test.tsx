import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

import { OperationOverlay } from './OperationOverlay'

function Harness() {
  const [pending, setPending] = useState(false)
  return (
    <>
      <div inert={pending}>
        <button onClick={() => setPending(true)}>Continue with Google</button>
      </div>
      {pending && <OperationOverlay label="Preparing your wallet" />}
      <button onClick={() => setPending(false)}>Finish operation</button>
    </>
  )
}

it('진입 전 포커스를 기억하고 진행 컨테이너로 옮겼다가 DOM 정리 후 복원한다', async () => {
  render(<Harness />)
  const trigger = screen.getByRole('button', { name: 'Continue with Google' })
  trigger.focus()
  fireEvent.click(trigger)

  expect(screen.getByRole('group', { name: 'Operation in progress' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Finish operation' }))
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('단계가 바뀌어도 사용자가 옮긴 포커스를 다시 가로채지 않는다', () => {
  const view = render(
    <>
      <OperationOverlay label="Preparing your wallet" />
      <button>SDK interaction</button>
    </>,
  )
  expect(screen.getByRole('group', { name: 'Operation in progress' })).toHaveFocus()
  const sdkControl = screen.getByRole('button', { name: 'SDK interaction' })
  sdkControl.focus()
  view.rerender(
    <>
      <OperationOverlay label="Confirming your sign-in" />
      <button>SDK interaction</button>
    </>,
  )
  expect(sdkControl).toHaveFocus()
})

it('실패 종료 시 포커스가 외부 SDK 요소로 옮겨졌다면 원래 버튼으로 끌어오지 않는다', async () => {
  render(<Harness />)
  const trigger = screen.getByRole('button', { name: 'Continue with Google' })
  trigger.focus()
  fireEvent.click(trigger)

  const sdkControl = screen.getByRole('button', { name: 'Finish operation' })
  sdkControl.focus()
  fireEvent.click(sdkControl)

  await waitFor(() => expect(screen.queryByRole('group')).not.toBeInTheDocument())
  expect(sdkControl).toHaveFocus()
})

it('성공 이동으로 이전 버튼이 DOM에서 제거되면 비동기 복원 시점에도 포커스를 복원하지 않는다', async () => {
  const view = render(<Harness />)
  const trigger = screen.getByRole('button', { name: 'Continue with Google' })
  trigger.focus()
  fireEvent.click(trigger)
  expect(screen.getByRole('group', { name: 'Operation in progress' })).toHaveFocus()
  const restoreFocus = vi.spyOn(trigger, 'focus')

  view.rerender(<h1>Destination</h1>)

  expect(trigger.isConnected).toBe(false)
  await waitFor(() => expect(restoreFocus).not.toHaveBeenCalled())
  expect(screen.getByRole('heading', { name: 'Destination' })).toBeInTheDocument()
})

it('포커스 컨테이너와 라이브 리전이 같은 문구를 중복 레이블로 사용하지 않는다', () => {
  render(
    <OperationOverlay
      label="Preparing your wallet"
      description="Social sign-in is creating or restoring your wallet."
    />,
  )

  const overlay = screen.getByRole('group', {
    name: 'Operation in progress',
  })
  expect(overlay).not.toHaveAccessibleName('Preparing your wallet')
  expect(overlay).toHaveAccessibleDescription(
    'Social sign-in is creating or restoring your wallet.',
  )
  expect(within(overlay).getByRole('status')).toHaveTextContent('Preparing your wallet')
})

it('현재 작업에서 전달한 단계만 표시하고 진행률을 추정하지 않는다', () => {
  const view = render(
    <OperationOverlay
      label="Preparing wallet"
      steps={['Sign in', 'Wallet', 'Session']}
      currentStep={1}
    />,
  )
  expect(screen.getByText('Wallet').closest('li')).toHaveAttribute('aria-current', 'step')
  expect(screen.getByText('Sign in').closest('li')).toHaveAttribute('data-done', 'true')
  expect(screen.getByText('Session').closest('li')).not.toHaveAttribute('data-done')
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  view.rerender(
    <OperationOverlay
      label="Confirming session"
      steps={['Sign in', 'Wallet', 'Session']}
      currentStep={2}
    />,
  )
  expect(screen.getByText('Session').closest('li')).toHaveAttribute('aria-current', 'step')
})
