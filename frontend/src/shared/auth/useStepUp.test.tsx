import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import { useStepUp } from './useStepUp'

const mocks = vi.hoisted(() => ({
  supported: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  registrationOptions: vi.fn(),
  register: vi.fn(),
  authenticationOptions: vi.fn(),
  authenticate: vi.fn(),
}))

vi.mock('./passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./passkey')>()),
  isPasskeySupported: mocks.supported,
  createPasskey: mocks.create,
  getPasskeyAssertion: mocks.get,
}))
vi.mock('@/shared/api/domains/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/domains/webauthn')>()),
  fetchRegistrationOptions: mocks.registrationOptions,
  registerPasskey: mocks.register,
  fetchAuthenticationOptions: mocks.authenticationOptions,
  authenticatePasskey: mocks.authenticate,
}))

const AUTH = {
  registered: true,
  challenge: 'Y2g',
  rpId: 'localhost',
  allowCredentials: [{ type: 'public-key' as const, id: 'Y3JlZA' }],
  timeout: 60000,
  userVerification: 'required' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.supported.mockResolvedValue(true)
  mocks.authenticationOptions.mockResolvedValue(AUTH)
  mocks.get.mockResolvedValue({ credentialId: 'Y3JlZA', clientDataJSON: 'Y2Q', authenticatorData: 'YWQ', signature: 'c2ln' })
  let n = 0
  mocks.authenticate.mockImplementation(async () => ({ stepUpToken: 'tok-' + ++n, expiresAt: '2030-01-01T00:00:00Z' }))
})

it('request → 대화상자 → confirm 이 곧바로 기기 인증 창을 열고 토큰으로 끝난다', async () => {
  const { result } = renderHook(() => useStepUp())
  let pending!: ReturnType<typeof result.current.request>
  act(() => {
    pending = result.current.request({ action: 'DEPOSIT', targetId: 12 })
  })
  await waitFor(() => expect(result.current.dialog.mode).toBe('verify'))
  expect(result.current.dialog.open).toBe(true)
  expect(mocks.authenticationOptions).toHaveBeenCalledWith({ action: 'DEPOSIT', targetId: 12 })

  act(() => result.current.dialog.onConfirm())
  // await 없이 같은 호출 안에서 열렸다(사용자 활성화, D-82)
  expect(mocks.get).toHaveBeenCalledTimes(1)

  await expect(pending).resolves.toEqual({ kind: 'token', token: 'tok-1' })
  await waitFor(() => expect(result.current.dialog.open).toBe(false))
})

it('같은 범위는 토큰을 다시 쓰고, 다른 동작·다른 대상은 새로 본인 확인을 받는다', async () => {
  const { result } = renderHook(() => useStepUp())
  const scope = { action: 'DEPOSIT' as const, targetId: 12 }
  let first!: ReturnType<typeof result.current.request>
  act(() => {
    first = result.current.request(scope)
  })
  await waitFor(() => expect(result.current.dialog.mode).toBe('verify'))
  act(() => result.current.dialog.onConfirm())
  await expect(first).resolves.toEqual({ kind: 'token', token: 'tok-1' })

  // 같은 범위(보증금 APPROVE → DEPOSIT) — 대화상자 없이 같은 토큰
  await expect(result.current.request(scope)).resolves.toEqual({ kind: 'token', token: 'tok-1' })
  expect(result.current.token(scope)).toBe('tok-1')

  // 다른 동작 · 다른 대상에는 그 토큰을 주지 않는다
  expect(result.current.token({ action: 'SETTLEMENT_RELEASE', targetId: 12 })).toBeNull()
  expect(result.current.token({ action: 'DEPOSIT', targetId: 13 })).toBeNull()
  act(() => {
    void result.current.request({ action: 'SETTLEMENT_RELEASE', targetId: 12 })
  })
  await waitFor(() => expect(result.current.dialog.open).toBe(true))
  expect(mocks.authenticationOptions).toHaveBeenLastCalledWith({ action: 'SETTLEMENT_RELEASE', targetId: 12 })
})

it('인증 창을 닫으면(NotAllowedError) cancelled — 에러가 아니다', async () => {
  mocks.get.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))
  const { result } = renderHook(() => useStepUp())
  let pending!: ReturnType<typeof result.current.request>
  act(() => {
    pending = result.current.request({ action: 'SETTLEMENT_APPROVE', targetId: 12 })
  })
  await waitFor(() => expect(result.current.dialog.mode).toBe('verify'))
  act(() => result.current.dialog.onConfirm())

  await expect(pending).resolves.toEqual({ kind: 'cancelled' })
  await waitFor(() => expect(result.current.dialog.open).toBe(false))
})

it('등록된 기기가 없으면 등록 → 본인 확인 두 단계를 거친다', async () => {
  mocks.authenticationOptions.mockResolvedValueOnce({ registered: false }).mockResolvedValue(AUTH)
  mocks.registrationOptions.mockResolvedValue({ challenge: 'cmVn' })
  mocks.create.mockResolvedValue({ credentialId: 'Y3JlZA', clientDataJSON: 'Y2Q', attestationObject: 'YW8' })
  mocks.register.mockResolvedValue({ credentialId: 'Y3JlZA', registered: true })
  const { result } = renderHook(() => useStepUp())
  let pending!: ReturnType<typeof result.current.request>
  act(() => {
    pending = result.current.request({ action: 'RULE_AGREE', targetId: 12 })
  })
  await waitFor(() => expect(result.current.dialog.mode).toBe('register'))
  act(() => result.current.dialog.onConfirm())
  expect(mocks.create).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(result.current.dialog.mode).toBe('verify'))
  // 등록 뒤 인증 옵션도 같은 범위로 다시 받는다
  expect(mocks.authenticationOptions).toHaveBeenLastCalledWith({ action: 'RULE_AGREE', targetId: 12 })
  act(() => result.current.dialog.onConfirm())
  await expect(pending).resolves.toEqual({ kind: 'token', token: 'tok-1' })
})

it('내장 인증기가 없으면 unsupported 로 끝난다', async () => {
  mocks.supported.mockResolvedValue(false)
  const { result } = renderHook(() => useStepUp())
  let pending!: ReturnType<typeof result.current.request>
  act(() => {
    pending = result.current.request({ action: 'DEPOSIT', targetId: 12 })
  })
  await waitFor(() => expect(result.current.dialog.mode).toBe('unsupported'))
  expect(mocks.authenticationOptions).not.toHaveBeenCalled()
  act(() => result.current.dialog.onCancel())
  await expect(pending).resolves.toEqual({ kind: 'unsupported' })
})
