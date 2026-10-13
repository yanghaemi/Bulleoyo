/**
 * 공연 삭제(API-performance-18)가 **실제로 어느 주소에 무슨 메서드로 나가는지** 고정한다.
 *
 * P-01 화면 테스트(`StudioHome.delete.test.tsx`)는 `onDeletePerformance` 를 목으로 막는다 —
 * 버튼이 눌리는 것까지만 증명하고, 그 뒤에 나가는 요청은 보지 않는다. 경로 상수(`ROOT`)나
 * 버전 접두사(`/v1`)가 바뀌면 화면 테스트는 그대로 통과하면서 운영에서 404 가 난다.
 * 서버의 `EndpointInventoryTest` 가 컨트롤러 쪽 경로를 글자 단위로 지키므로, 이 파일이
 * **클라이언트 쪽 같은 글자**를 지켜 양쪽이 만나는 지점을 고정한다.
 */

import { beforeEach, afterEach, expect, it, vi } from 'vitest'

import { deletePerformance } from './performance'
import { tokenStore } from '@/shared/api/client'

let fetchMock: ReturnType<typeof vi.fn>

/** `sendOnce` 가 실제로 쓰는 것만 가진 최소 응답 — 실물 `Response` 는 구현 차이에 끌려다닌다 */
function ok(data: unknown): Response {
  return {
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ code: 'SUCCESS', data, msg: '' }),
  } as unknown as Response
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  tokenStore.setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

it('DELETE /api/v1/performances/{id} 로 나간다 — 서버 인벤토리와 같은 글자다', async () => {
  fetchMock.mockResolvedValueOnce(ok({ performanceId: 7, title: '합정 3밴드 합동공연' }))

  await deletePerformance(7)

  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(String(url)).toBe('/api/v1/performances/7')
  expect(init.method).toBe('DELETE')
  // 생성자 판정이 서버에서 이뤄지므로 토큰이 반드시 실려야 한다 — 빠지면 401 이다
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-1')
})

it('본문을 보내지 않는다 — 삭제 대상은 경로가 전부다', async () => {
  fetchMock.mockResolvedValueOnce(ok({ performanceId: 7, title: 'x' }))

  await deletePerformance(7)

  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(init.body).toBeUndefined()
})
