/**
 * 토스트 큐 — 컴포넌트 밖에서도 부를 수 있는 전역 스토어.
 *
 * 화면은 `ToastHost` 하나만 두고(app/providers), 띄우는 쪽은 어디서든(이벤트 핸들러·
 * mutation onError·훅 밖) `toast()`·`toastApiError()`를 부른다.
 * 컴포넌트와 파일을 나눈 이유는 Fast Refresh다(한 파일이 컴포넌트와 값을 함께 내보내면 깨진다).
 *
 * **분기는 `code`로만** 한다(공통 응답 규격 §1 — `msg` 문구는 언제든 바뀐다).
 * 사용자에게 보이는 문장은 서버가 준 `msg`를 그대로 쓴다. 클라이언트가 다시 쓰지 않는다.
 *
 * ponytail: 외부 스토어 하나 + 배열이다. 큐 우선순위·중복 병합·애니메이션은 없다.
 * 화면 여섯 개가 붙어서 토스트가 겹치면 그때 병합을 넣는다.
 */

import { ApiError, isApiError } from '@/shared/api/client'
import { CommonCode } from '@/shared/api/errorCodes'
import type { ToastTone } from '@/shared/ui/Toast'

export interface ToastOptions {
  title: string
  message?: string
  tone?: ToastTone
  /** 자동 닫힘까지(ms). 0이면 사용자가 닫을 때까지 남는다 */
  durationMs?: number
}

export interface ToastItem extends ToastOptions {
  id: number
}

const DEFAULT_DURATION_MS = 5000

let items: readonly ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()

export function getToasts(): readonly ToastItem[] {
  return items
}

function publish(next: readonly ToastItem[]): void {
  items = next
  for (const listener of listeners) listener()
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function dismissToast(id: number): void {
  publish(items.filter((item) => item.id !== id))
}

export function toast(options: ToastOptions): number {
  const id = nextId
  nextId += 1
  publish([...items, { ...options, id }])

  const duration = options.durationMs ?? DEFAULT_DURATION_MS
  if (duration > 0) window.setTimeout(() => dismissToast(id), duration)
  return id
}

/**
 * 실패 응답을 토스트로. `msg`를 그대로 띄우고, 분기가 필요한 곳은 `code`만 본다.
 *
 * 429는 `Retry-After`(초)를 안내에 반영한다(§0.9). 그 값은 `ApiError.retryAfterSeconds`에
 * 이미 담겨 온다 — 헤더를 여기서 다시 읽지 않는다.
 */
export function toastApiError(error: unknown): number {
  if (!isApiError(error)) {
    // 래퍼를 못 받은 경우(네트워크 단절·프록시 오류). code가 없으므로 분기할 것도 없다.
    return toast({
      title: 'Network error / 네트워크 오류',
      message: 'Check your connection and try again. / 연결을 확인한 뒤 다시 시도해 주세요.',
      tone: 'error',
    })
  }

  const rateLimited = error.code === CommonCode.TOO_MANY_REQUESTS
  return toast({
    // msg가 비어 오면(규격상 가능) 최소한 code라도 보여 준다 — 빈 토스트를 띄우지 않는다.
    title: error.msg || error.code,
    message: rateLimited ? retryAfterText(error) : undefined,
    tone: rateLimited ? 'warning' : 'error',
  })
}

function retryAfterText(error: ApiError): string | undefined {
  const seconds = error.retryAfterSeconds
  if (!Number.isFinite(seconds) || (seconds as number) <= 0) return undefined
  return `Try again in ${seconds}s. / ${seconds}초 후 다시 시도해 주세요.`
}
