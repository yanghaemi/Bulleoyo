/** 토스트가 `msg`는 그대로 띄우고 **분기는 `code`로만** 하는지(규격 §1·§0.9). */

import { ApiError, NetworkError } from '@/shared/api/client'
import { dismissToast, getToasts, toast, toastApiError } from '@/shared/ui/toastStore'

afterEach(() => {
  for (const item of getToasts()) dismissToast(item.id)
})

describe('toastApiError', () => {
  it('서버 msg를 그대로 띄운다 — 클라이언트가 문구를 다시 쓰지 않는다', () => {
    toastApiError(
      new ApiError({ code: 'TICKET_SOLD_OUT', status: 409, msg: '잔여 수량이 부족합니다.' }),
    )
    expect(getToasts()[0]).toMatchObject({ title: '잔여 수량이 부족합니다.', tone: 'error' })
  })

  it('429는 code로 가려내고 Retry-After(초)를 안내에 반영한다', () => {
    toastApiError(
      new ApiError({
        code: 'COMMON_TOO_MANY_REQUESTS',
        status: 429,
        msg: '요청이 많습니다.',
        retryAfterSeconds: 30,
      }),
    )
    const item = getToasts()[0]
    expect(item.tone).toBe('warning')
    expect(item.message).toContain('30')
  })

  it('래퍼를 못 받은 오류(code 없음)는 네트워크 문구로 떨어진다', () => {
    toastApiError(new NetworkError('요청을 보내지 못했습니다.'))
    expect(getToasts()[0].title).toMatch(/Network error/)
  })

  it('닫으면 큐에서 빠진다', () => {
    const id = toast({ title: 'hi', durationMs: 0 })
    expect(getToasts()).toHaveLength(1)
    dismissToast(id)
    expect(getToasts()).toHaveLength(0)
  })
})
