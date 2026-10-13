import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  beginSigningProcessing,
  beginWalletPrompt,
  claimSigningJob,
  getSigningActivity,
  HIDE_GRACE_MS,
  holdSigningJob,
  MAX_VISIBLE_MS,
  releaseSigningJob,
  releaseSigningJobNow,
  resetSigningActivity,
  subscribeSigningActivity,
  trackSignedTxReport,
  UNCLAIMED_JOB_MS,
} from './signingActivity'

beforeEach(() => {
  vi.useFakeTimers()
  resetSigningActivity()
})

afterEach(() => {
  resetSigningActivity()
  vi.useRealTimers()
})

describe('signingActivity', () => {
  it('지갑 확인 구간만으로는 켜지지 않는다 — 지갑 창을 가리지 않는다', () => {
    const end = beginWalletPrompt()
    expect(getSigningActivity()).toEqual({ visible: false, walletPrompt: false })
    end()
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('중첩 카운터 — 마지막 해제 뒤 유예가 지나야 닫힌다', () => {
    const a = beginSigningProcessing()
    const b = beginSigningProcessing()
    expect(getSigningActivity()).toEqual({ visible: true, walletPrompt: false })
    a()
    a() // 두 번 불러도 한 번만 깎는다
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(true)
    b()
    vi.advanceTimersByTime(HIDE_GRACE_MS - 1)
    expect(getSigningActivity().visible).toBe(true)
    vi.advanceTimersByTime(1)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('연속 서명 — 보이는 중 다음 지갑 창이 열리면 닫지 않고 비차단으로 이어 간다', () => {
    const processing = beginSigningProcessing()
    const wallet = beginWalletPrompt()
    processing()
    expect(getSigningActivity()).toEqual({ visible: true, walletPrompt: true })
    vi.advanceTimersByTime(HIDE_GRACE_MS * 5)
    expect(getSigningActivity().visible).toBe(true)
    // 서명이 끝나고 다음 보고가 시작된다
    wallet()
    const next = beginSigningProcessing()
    expect(getSigningActivity()).toEqual({ visible: true, walletPrompt: false })
    next()
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('연속 서명 중 사용자가 거절하면 유예 뒤 닫힌다', () => {
    const processing = beginSigningProcessing()
    const wallet = beginWalletPrompt()
    processing()
    wallet() // finally — USER_REJECTED
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('보고 성공 — jobId를 붙잡아 0을 거치지 않고 확정 대기로 넘어간다', async () => {
    const accepted = await trackSignedTxReport(async () => ({ jobId: 'job-1', status: 'PENDING' }))
    expect(accepted.jobId).toBe('job-1')
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(true)
    claimSigningJob('job-1')
    vi.advanceTimersByTime(UNCLAIMED_JOB_MS)
    expect(getSigningActivity().visible).toBe(true)
    releaseSigningJobNow('job-1')
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('보고 실패 — finally에서 닫힌다', async () => {
    await expect(
      trackSignedTxReport(async () => {
        throw new Error('409')
      }),
    ).rejects.toThrow('409')
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('아무도 받아 가지 않은 job은 스스로 놓는다', () => {
    holdSigningJob('job-2')
    vi.advanceTimersByTime(UNCLAIMED_JOB_MS + HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('감시 중단은 한 틱 뒤에 놓는다 — StrictMode 재실행의 claim이 취소한다', () => {
    holdSigningJob('job-3')
    claimSigningJob('job-3')
    releaseSigningJob('job-3')
    claimSigningJob('job-3')
    vi.advanceTimersByTime(HIDE_GRACE_MS * 2)
    expect(getSigningActivity().visible).toBe(true)
    releaseSigningJob('job-3')
    vi.advanceTimersByTime(1 + HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('최대 표시 시간이 지나면 해제를 빠뜨려도 닫힌다', () => {
    beginSigningProcessing()
    vi.advanceTimersByTime(MAX_VISIBLE_MS - 1)
    expect(getSigningActivity().visible).toBe(true)
    vi.advanceTimersByTime(1)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('reset 뒤의 늦은 해제는 새 카운터를 깎지 않는다', () => {
    const stale = beginSigningProcessing()
    resetSigningActivity()
    const fresh = beginSigningProcessing()
    stale()
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(true)
    fresh()
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(getSigningActivity().visible).toBe(false)
  })

  it('표시가 바뀔 때만 구독자에게 알린다', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSigningActivity(listener)
    const a = beginSigningProcessing()
    const b = beginSigningProcessing()
    expect(listener).toHaveBeenCalledTimes(1)
    a()
    b()
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
})
