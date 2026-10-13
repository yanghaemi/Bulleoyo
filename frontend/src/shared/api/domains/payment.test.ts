import { afterEach, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { abandonPaymentSignature, reportPaymentSignedTx } from './payment'

const compileOnlyPaymentSignatureContracts = () => {
  // @ts-expect-error PURCHASE reports must identify the child order at compile time.
  void reportPaymentSignedTx({ orderId: 5501, kind: 'PURCHASE', senderSignedRlp: 'test-only' })
  // @ts-expect-error PURCHASE abandonment must identify the child order at compile time.
  void abandonPaymentSignature({ orderId: 5501, kind: 'PURCHASE' })
}
void compileOnlyPaymentSignatureContracts

afterEach(() => vi.restoreAllMocks())

it('PURCHASE 보고와 포기 본문에 경로 그룹과 다른 하위 주문 번호를 싣는다', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({})
  await reportPaymentSignedTx({
    orderId: 5501,
    childOrderId: 5502,
    kind: 'PURCHASE',
    senderSignedRlp: 'test-only',
  })
  expect(post).toHaveBeenLastCalledWith(
    '/orders/5501/payment/signed-tx',
    { orderId: 5502, kind: 'PURCHASE', senderSignedRlp: 'test-only', abandoned: false },
    expect.anything(),
  )
  await abandonPaymentSignature({ orderId: 5501, childOrderId: 5502, kind: 'PURCHASE' })
  expect(post).toHaveBeenLastCalledWith(
    '/orders/5501/payment/signed-tx',
    { orderId: 5502, kind: 'PURCHASE', abandoned: true },
    expect.anything(),
  )
})

it('대상 하위 주문이 없는 PURCHASE는 네트워크로 보내지 않는다', () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({})
  expect(() =>
    // @ts-expect-error Runtime guard still protects untyped JavaScript callers.
    reportPaymentSignedTx({ orderId: 5501, kind: 'PURCHASE', senderSignedRlp: 'test-only' }),
  ).toThrow()
  expect(post).not.toHaveBeenCalled()
})

it('그룹 APPROVE에는 하위 주문 번호를 보내지 않는다', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({})
  await reportPaymentSignedTx({ orderId: 5501, kind: 'APPROVE', senderSignedRlp: 'test-only' })
  expect(post).toHaveBeenLastCalledWith(
    '/orders/5501/payment/signed-tx',
    { kind: 'APPROVE', senderSignedRlp: 'test-only', abandoned: false },
    expect.anything(),
  )
})

it('[2026-09-24] 본인 확인 토큰이 있을 때만 X-Step-Up-Token 헤더를 싣는다', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({})
  await reportPaymentSignedTx({ orderId: 5501, kind: 'APPROVE', senderSignedRlp: 'test-only' })
  expect(post.mock.calls[0][2]).not.toHaveProperty('headers')

  await reportPaymentSignedTx({
    orderId: 5501,
    childOrderId: 5501,
    kind: 'PURCHASE',
    senderSignedRlp: 'test-only',
    stepUpToken: 'tok-1',
  })
  expect(post.mock.calls[1][2]).toMatchObject({ headers: { 'X-Step-Up-Token': 'tok-1' } })
  // 토큰은 본문이 아니라 헤더에만 간다.
  expect(post.mock.calls[1][1]).not.toHaveProperty('stepUpToken')
})
