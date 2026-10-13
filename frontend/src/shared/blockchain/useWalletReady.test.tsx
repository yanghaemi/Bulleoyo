/**
 * D-77 — 서명 화면의 지갑 준비 게이트.
 *
 * 9/21 dev: P-03 보증금 `납부`·P-06 `우리 팀 동의하기`가 **3~4번 눌러야** 서명 팝업이 떴다.
 * 첫 클릭들은 `eth_accounts`가 빈 배열이어서 어댑터가 `null`을 주고 호출부가 `NOT_CONNECTED`로
 * 떨어진 것이다. 이 훅이 그 기다림을 클릭 밖(마운트)으로 옮기고, 그동안 버튼을 잠근다.
 *
 * 여기서 고정하는 것 —
 *   ① 주소가 나오면 준비됨
 *   ② 빈 배열(null)이 와도 **재시도**하고, 그 사이 준비되면 준비됨
 *   ③ 상한까지 못 받아도 **버튼은 연다**(영구 비활성은 원인을 숨긴다)
 *   ④ 예열을 지원하지 않는 어댑터·어댑터 없음은 즉시 준비됨
 *   ⑤ `requireAddress`를 켜지 않으면 주소를 묻지 않는다(로그인 화면 C-01)
 */

import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useWalletReady } from './useWalletReady'

/** 테스트는 실제 시간을 쓴다 — 간격을 1ms로 줄여 상한 도달까지도 즉시 끝나게 한다 */
const fast = { requireAddress: true, attempts: 4, retryDelayMs: 1 } as const

const ADDRESS = '0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b'

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useWalletReady', () => {
  it('예열이 끝나고 주소가 나오면 준비됨으로 바뀐다', async () => {
    const gate = deferred()
    const adapter = {
      warmUp: vi.fn(() => gate.promise),
      getAddress: vi.fn().mockResolvedValue(ADDRESS),
    }

    const { result } = renderHook(() => useWalletReady(adapter, fast))

    // 예열 중에는 잠긴다 — 이 창에서 눌린 클릭이 D-77의 첫 실패였다
    expect(result.current.ready).toBe(false)
    expect(adapter.getAddress).not.toHaveBeenCalled()

    gate.resolve()
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.addressUnavailable).toBe(false)
    expect(adapter.getAddress).toHaveBeenCalledTimes(1)
  })

  it('첫 조회가 빈 계정(null)이면 재시도해 준비를 기다린다 — D-77 원인 A', async () => {
    const adapter = {
      warmUp: vi.fn().mockResolvedValue(undefined),
      // wallet-services 가 아직 계정을 못 주는 창: 두 번 null, 세 번째에 주소
      getAddress: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(ADDRESS),
    }

    const { result } = renderHook(() => useWalletReady(adapter, fast))

    expect(result.current.ready).toBe(false)
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(adapter.getAddress).toHaveBeenCalledTimes(3)
    // 주소를 받았으므로 "못 받음"이 아니다
    expect(result.current.addressUnavailable).toBe(false)
  })

  it('상한까지 주소가 안 나오면 버튼을 연다 — 원인을 숨기지 않는다', async () => {
    const adapter = {
      warmUp: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue(null),
    }

    const { result } = renderHook(() => useWalletReady(adapter, fast))

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(adapter.getAddress).toHaveBeenCalledTimes(fast.attempts)
    // 클릭하면 기존 `NOT_CONNECTED` → `WALLET_NOT_READY` 문구가 원인을 말한다
    expect(result.current.addressUnavailable).toBe(true)
  })

  it('조회가 던지면 붙잡지 않는다 — 원인은 클릭 경로가 말한다', async () => {
    const adapter = {
      warmUp: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockRejectedValue(new Error('rpc down')),
    }

    const { result } = renderHook(() => useWalletReady(adapter, fast))

    await waitFor(() => expect(result.current.ready).toBe(true))
    // 재시도하지 않는다 — 같은 실패를 상한까지 반복할 이유가 없다
    expect(adapter.getAddress).toHaveBeenCalledTimes(1)
  })

  it('예열이 실패해도 잠그지 않는다', async () => {
    const adapter = {
      warmUp: vi.fn().mockRejectedValue(new Error('init failed')),
      getAddress: vi.fn().mockResolvedValue(ADDRESS),
    }

    const { result } = renderHook(() => useWalletReady(adapter, fast))

    await waitFor(() => expect(result.current.ready).toBe(true))
  })

  it('어댑터가 없거나 예열을 지원하지 않으면 즉시 준비됨이다', () => {
    const none = renderHook(() => useWalletReady(null, fast))
    expect(none.result.current.ready).toBe(true)

    const getAddress = vi.fn()
    const noWarmUp = renderHook(() => useWalletReady({ getAddress }, fast))
    expect(noWarmUp.result.current.ready).toBe(true)
    expect(getAddress).not.toHaveBeenCalled()
  })

  it('requireAddress 를 켜지 않으면 주소를 묻지 않는다 — 로그인 화면(C-01)', async () => {
    const adapter = {
      warmUp: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue(null),
    }

    const { result } = renderHook(() => useWalletReady(adapter))

    await waitFor(() => expect(result.current.ready).toBe(true))
    // 로그인 전에는 세션이 없어 주소가 영영 안 나온다 — 기다리면 버튼만 잠긴다
    expect(adapter.getAddress).not.toHaveBeenCalled()
  })
})
