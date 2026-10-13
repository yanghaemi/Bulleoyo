import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'
import {
  beginSigningProcessing,
  beginWalletPrompt,
  getSigningActivity,
  HIDE_GRACE_MS,
  resetSigningActivity,
} from '@/shared/blockchain/signingActivity'

import { SigningOverlay } from './SigningOverlay'

let navigateTo: (path: string) => void = () => {}

function NavigateHandle() {
  navigateTo = useNavigate()
  return null
}

/** 앱처럼 오버레이가 레이아웃에 붙어 라우트 사이에 살아 있는 구성 */
function renderAt(path = '/a') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <>
              <NavigateHandle />
              <Outlet />
              <SigningOverlay />
            </>
          }
        >
          <Route path="/a" element={<p>A</p>} />
          <Route path="/b" element={<p>B</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  resetSigningActivity()
  await i18n.changeLanguage('en')
})

afterEach(() => {
  resetSigningActivity()
  vi.useRealTimers()
})

it('신호가 없으면 아무것도 그리지 않는다', () => {
  renderAt()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('처리 구간에는 비모달 상태 알림으로 펜 애니메이션을 띄우고 포커스를 옮기지 않는다', () => {
  renderAt()
  const before = document.activeElement
  act(() => {
    beginSigningProcessing()
  })
  const status = screen.getByRole('status')
  expect(status).toHaveAttribute('aria-live', 'polite')
  expect(status).toHaveTextContent('Processing')
  expect(status).not.toHaveAttribute('data-wallet-prompt')
  expect(status.querySelector('.signing-overlay__stroke')).not.toBeNull()
  expect(document.activeElement).toBe(before)
  // 관객 화면 — 블록체인 용어 없음
  expect(status.textContent).not.toMatch(/sign|wallet|tx|hash|gas|서명|지갑/i)
})

it('연속 서명 사이 지갑 구간에는 비차단 모드로 물러선다', () => {
  renderAt()
  act(() => {
    const processing = beginSigningProcessing()
    beginWalletPrompt()
    processing()
  })
  const status = screen.getByRole('status')
  expect(status).toHaveAttribute('data-wallet-prompt', 'true')
  expect(status).toHaveTextContent('Confirm in your wallet')
})

it('유예가 지나면 닫힌다', () => {
  vi.useFakeTimers()
  renderAt()
  let release = () => {}
  act(() => {
    release = beginSigningProcessing()
  })
  expect(screen.getByRole('status')).toBeInTheDocument()
  act(() => {
    release()
    vi.advanceTimersByTime(HIDE_GRACE_MS)
  })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('라우트가 바뀌면 신호를 비우고 닫힌다', () => {
  renderAt('/a')
  act(() => {
    beginSigningProcessing()
  })
  expect(screen.getByRole('status')).toBeInTheDocument()
  act(() => {
    navigateTo('/b')
  })
  expect(screen.getByText('B')).toBeInTheDocument()
  expect(getSigningActivity().visible).toBe(false)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('한국어 문구', async () => {
  await i18n.changeLanguage('ko')
  renderAt()
  act(() => {
    beginSigningProcessing()
  })
  expect(screen.getByRole('status')).toHaveTextContent('확인하고 있어요')
})
