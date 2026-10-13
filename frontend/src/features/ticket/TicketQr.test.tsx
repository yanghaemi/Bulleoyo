/**
 * A-08 회전 QR — **이 화면의 존재 이유가 QR 그림 한 장**이라서 붙인 테스트다.
 *
 * 못 박는 것 세 가지 —
 *   ① 토큰이 있으면 **진짜 이미지**가 나온다. 예전처럼 'qr' 글자 자리표시자로 되돌아가면
 *      검표대에서 읽을 것이 없다.
 *   ② **토큰이 바뀌면 그림도 바뀐다.** 30초 회전의 의미가 여기에 있다 — 토큰만 갱신되고
 *      화면의 QR이 옛 토큰이면 관객은 만료된 QR을 계속 내밀게 된다.
 *   ③ 토큰이 없으면 그림을 만들지 않는다(로딩 자리표시자).
 *
 * 렌더 경로는 `<img src="data:image/svg+xml,…">`다 — `qrcode.toString({type:'svg'})`는
 * canvas 없이 도는 유일한 출력이라 jsdom에서 그대로 검증된다(`toDataURL`은 canvas가 필요하다).
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { TicketQr } from './TicketQr'
import * as QRCode from 'qrcode'
import i18n from '@/shared/i18n'
vi.mock('qrcode', async (original) => {
  const actual = await original<typeof import('qrcode')>()
  return { ...actual, toString: vi.fn(actual.toString) }
})

it('hides cached QR in both views and reports fetch failure with manual retry', async () => {
  const onRotate = vi.fn()
  const { rerender } = render(<TicketQr qrToken="cached-before-error" onRotate={onRotate} />)
  await screen.findByAltText('Entry QR code')
  fireEvent.click(screen.getByRole('button', { name: 'Enlarge QR code' }))
  rerender(<TicketQr qrToken="cached-before-error" loadFailed onRotate={onRotate} />)
  expect(screen.queryAllByAltText('Entry QR code')).toHaveLength(0)
  expect(screen.getAllByRole('img', { name: 'Could not refresh QR. Try again.' })).toHaveLength(2)
  expect(screen.queryByRole('img', { name: 'Loading QR code' })).not.toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Try again' }))
  expect(onRotate).toHaveBeenCalledTimes(1)
})

it('reports Korean fetch failure rather than a permanent loading state', async () => {
  try {
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
    render(<TicketQr loadFailed onRotate={vi.fn()} />)
    expect(
      screen.getByRole('img', { name: 'QR을 갱신하지 못했습니다. 다시 시도해 주세요.' }),
    ).toBeVisible()
    expect(screen.queryByRole('img', { name: 'QR 코드를 불러오는 중' })).not.toBeInTheDocument()
  } finally {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  }
})

it('encodes the raw server token with four modules of quiet zone', async () => {
  const encode = vi.spyOn(QRCode, 'toString')
  try {
    render(<TicketQr qrToken="raw.server.token" onRotate={vi.fn()} />)
    await screen.findByAltText('Entry QR code')
    expect(encode).toHaveBeenCalledWith(
      'raw.server.token',
      expect.objectContaining({ type: 'svg', errorCorrectionLevel: 'M', margin: 4 }),
    )
  } finally {
    encode.mockRestore()
  }
})

it('never displays an already expired token', async () => {
  render(<TicketQr qrToken="expired" expiresAt="2020-01-01T00:00:00Z" onRotate={vi.fn()} />)
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'QR code expired' })).toBeInTheDocument()
})

it('uses issuedAt for fallback expiry instead of mounting time', async () => {
  render(
    <TicketQr
      qrToken="old-issued"
      issuedAt="2020-01-01T00:00:00Z"
      rotateAfterMs={30000}
      onRotate={vi.fn()}
    />,
  )
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'QR code expired' })).toBeInTheDocument()
})

it('removes both images at absolute expiry and only retries on explicit input', async () => {
  const onRotate = vi.fn()
  const { rerender } = render(<TicketQr qrToken="expiring" onRotate={onRotate} />)
  await screen.findByAltText('Entry QR code')
  const trigger = screen.getByRole('button', { name: 'Enlarge QR code' })
  trigger.focus()
  fireEvent.click(trigger)
  vi.useFakeTimers()
  try {
    const expiresAt = new Date(Date.now() + 1500).toISOString()
    rerender(<TicketQr qrToken="expiring" expiresAt={expiresAt} onRotate={onRotate} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(screen.queryAllByAltText('Entry QR code')).toHaveLength(0)
    expect(onRotate).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Try again' }))
    expect(onRotate).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(trigger).toHaveFocus()
  } finally {
    vi.useRealTimers()
  }
})

it('translates QR guidance and retry into the selected language', async () => {
  try {
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
    render(<TicketQr qrToken="expired-ko" expiresAt="2020-01-01T00:00:00Z" onRotate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'QR 코드 확대' })).toBeInTheDocument()
    expect(screen.getByText('QR 유효 시간')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  } finally {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  }
})

it('does not restart the fallback lifetime when the callback changes', async () => {
  vi.useFakeTimers()
  try {
    const { rerender } = render(
      <TicketQr qrToken="fixed-lifetime" rotateAfterMs={2000} onRotate={vi.fn()} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    rerender(<TicketQr qrToken="fixed-lifetime" rotateAfterMs={2000} onRotate={vi.fn()} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR code expired' })).toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

it('shows generation failures without exposing stale images', async () => {
  const encode = vi.spyOn(QRCode, 'toString').mockRejectedValueOnce(new Error('generation failed'))
  try {
    render(<TicketQr qrToken="too-large" onRotate={vi.fn()} />)
    expect(await screen.findByRole('img', { name: 'Could not create QR code' })).toBeInTheDocument()
    expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
  } finally {
    encode.mockRestore()
  }
})

it('replaces both images together when the token changes with the dialog open', async () => {
  const { rerender } = render(<TicketQr qrToken="first" onRotate={vi.fn()} />)
  const first = (await screen.findByAltText('Entry QR code')).getAttribute('src')
  fireEvent.click(screen.getByRole('button', { name: 'Enlarge QR code' }))
  rerender(<TicketQr qrToken="next" onRotate={vi.fn()} />)
  await waitFor(() => {
    const images = screen.getAllByAltText('Entry QR code')
    expect(images).toHaveLength(2)
    expect(images[0].getAttribute('src')).not.toBe(first)
    expect(images[1]).toHaveAttribute('src', images[0].getAttribute('src'))
  })
})

it('does not auto-refetch from the display timer', async () => {
  vi.useFakeTimers()
  try {
    const onRotate = vi.fn()
    render(<TicketQr rotateAfterMs={1000} onRotate={onRotate} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(onRotate).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

it('enlarges the same image and restores keyboard focus on Escape', async () => {
  render(<TicketQr qrToken="sample" onRotate={vi.fn()} />)
  const image = await screen.findByAltText('Entry QR code')
  const trigger = screen.getByRole('button', { name: 'Enlarge QR code' })
  trigger.focus()
  fireEvent.click(trigger)
  expect(within(screen.getByRole('dialog')).getByAltText('Entry QR code')).toHaveAttribute(
    'src',
    image.getAttribute('src'),
  )
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('토큰이 오면 QR 이미지를 그린다', async () => {
  render(<TicketQr qrToken="header.payload.signature" onRotate={vi.fn()} />)

  const img = await screen.findByAltText('Entry QR code')
  expect(img).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml,'))
  // 라이브러리가 실제로 SVG를 만들었는지 — 빈 data URL이 아닌지 본다
  expect(decodeURIComponent(img.getAttribute('src') ?? '')).toContain('<svg')
})

it('토큰이 회전하면 이미지도 바뀐다', async () => {
  const { rerender } = render(<TicketQr qrToken="token-1" onRotate={vi.fn()} />)
  const first = (await screen.findByAltText('Entry QR code')).getAttribute('src')

  rerender(<TicketQr qrToken="token-2" onRotate={vi.fn()} />)
  await waitFor(() => {
    expect(screen.getByAltText('Entry QR code').getAttribute('src')).not.toBe(first)
  })
})

it('토큰이 없으면 자리표시자만 둔다', () => {
  render(<TicketQr onRotate={vi.fn()} />)

  expect(screen.getByRole('img', { name: 'Loading QR code' })).toBeInTheDocument()
  expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
})

it('회전 카운트다운은 그대로 남아 있다', () => {
  render(<TicketQr qrToken="token-1" rotateAfterMs={30_000} onRotate={vi.fn()} />)

  expect(screen.getByText('QR valid for')).toBeInTheDocument()
  expect(screen.getByText('0:30')).toBeInTheDocument()
})
