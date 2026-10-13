import { renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Web3AuthWalletAdapter } from './WalletAdapter'
import { Web3AuthProvider } from './Web3AuthContext'
import { useWeb3Auth } from './useWeb3Auth'

function adapterDouble(): Web3AuthWalletAdapter {
  return {
    provider: 'WEB3AUTH',
    initialize: vi.fn(async () => undefined),
    warmUp: vi.fn(async () => undefined),
    connectSocial: vi.fn(),
    connect: vi.fn(),
    getAddress: vi.fn(),
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    disconnect: vi.fn(),
  }
}

describe('Web3AuthProvider', () => {
  it('creates one adapter without initializing the SDK for a configured provider lifetime', () => {
    const adapter = adapterDouble()
    const createAdapter = vi.fn(() => adapter)
    const wrapper = ({ children }: PropsWithChildren) => (
      <Web3AuthProvider clientId="client-id" createAdapter={createAdapter}>
        {children}
      </Web3AuthProvider>
    )

    const { result, rerender } = renderHook(() => useWeb3Auth(), { wrapper })

    rerender()

    expect(result.current.adapter).toBe(adapter)
    expect(result.current.error).toBeNull()
    expect(createAdapter).toHaveBeenCalledTimes(1)
    expect(adapter.initialize).not.toHaveBeenCalled()
  })

  it('exposes a typed configuration error without constructing the SDK when client id is empty', () => {
    const createAdapter = vi.fn(() => adapterDouble())
    const wrapper = ({ children }: PropsWithChildren) => (
      <Web3AuthProvider clientId="" createAdapter={createAdapter}>
        {children}
      </Web3AuthProvider>
    )

    const { result } = renderHook(() => useWeb3Auth(), { wrapper })

    expect(result.current.adapter).toBeNull()
    expect(result.current.error?.kind).toBe('NOT_CONFIGURED')
    expect(createAdapter).not.toHaveBeenCalled()
  })

  it('leaves SDK initialization to the first adapter operation', () => {
    const adapter = adapterDouble()
    const wrapper = ({ children }: PropsWithChildren) => (
      <Web3AuthProvider clientId="client-id" createAdapter={() => adapter}>
        {children}
      </Web3AuthProvider>
    )

    const { result } = renderHook(() => useWeb3Auth(), { wrapper })

    expect(result.current.adapter).toBe(adapter)
    expect(result.current.error).toBeNull()
    // 컨텍스트를 읽는 것만으로는 SDK 가 붙지 않는다 — 첫 동작이 붙인다
    expect(adapter.initialize).not.toHaveBeenCalled()
  })
})
