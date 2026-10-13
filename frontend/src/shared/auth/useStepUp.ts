/**
 * 패스키 본인 확인(step-up) 공용 훅 — API v7 §7.W · 화면 v8 A-05(P-03·P-06·P-08 포함).
 *
 * 보호 동작 5개 — 결제(A-05) · 규칙 동의(P-06) · 보증금(P-03) · 정산 조기 동의·정산금 지급(P-08) — 가
 * 같은 흐름을 쓴다. 화면은 서버 응답의 `stepUpRequired`가 true일 때만 이 훅을 부른다. 값이 없거나
 * false면 한 번도 불리지 않는다 — 스위치가 꺼진 서버에서 화면은 이전과 같다.
 *
 * ── 두 가지 쓰임 ──
 *  - 낮은 수준 `prepare(scope)` + `run(mode)`: 화면이 자기 패널을 그릴 때(A-05 결제).
 *  - 높은 수준 `request(scope)` + `<StepUpDialog {...dialog} />`: 공용 대화상자로 띄우고 결과를
 *    Promise로 기다린다(공연자 화면). 대화상자 버튼이 `confirm()`을 부른다.
 *
 * ⚠ 사용자 활성화(D-82) — `navigator.credentials.*`는 클릭 직후에만 열린다. `run()`/`confirm()`은
 *   **첫 줄에서** 기기 인증 창을 연다. 옵션(서버 챌린지)은 `prepare`/`request`가 미리 받아 둔다.
 *
 * 토큰은 **범위(동작 + 대상)** 가 붙은 채 ref에만 둔다(120초·1회용 — 서버가 범위에 묶는다). 같은 범위의
 * 다음 보고(보증금 APPROVE → DEPOSIT, 결제 APPROVE → PURCHASE × N)는 같은 토큰을 다시 싣는다.
 */

import { useCallback, useMemo, useRef, useState } from 'react'

import {
  authenticatePasskey,
  fetchAuthenticationOptions,
  fetchRegistrationOptions,
  registerPasskey,
} from '@/shared/api/domains/webauthn'
import type { StepUpScope } from '@/shared/api/domains/webauthn'
import {
  createPasskey,
  getPasskeyAssertion,
  isPasskeyCancelled,
  isPasskeySupported,
  type PasskeyAuthenticationOptions,
  type PasskeyRegistrationOptions,
} from '@/shared/auth/passkey'

export type { StepUpScope } from '@/shared/api/domains/webauthn'

/** 버튼을 보여 줄 수 있는 준비 결과. */
export type StepUpReadyMode = 'register' | 'verify' | 'unsupported'

export type StepUpOutcome =
  | { kind: 'token'; token: string }
  /** 기기 등록이 끝났다. 인증 옵션을 받아 두었으니 한 번 더 누르게 한다. */
  | { kind: 'needVerify' }
  /** 사용자가 인증 창을 닫았다 — 에러가 아니다. */
  | { kind: 'cancelled' }
  | { kind: 'failed'; error: unknown }

/** `request()`의 결과. */
export type StepUpResult =
  | { kind: 'token'; token: string }
  | { kind: 'cancelled' }
  | { kind: 'unsupported' }
  | { kind: 'failed'; error: unknown }

/** 공용 대화상자 상태. */
export type StepUpDialogMode = 'loading' | 'register' | 'verify' | 'working' | 'unsupported'

export interface StepUpDialogProps {
  open: boolean
  mode: StepUpDialogMode
  message?: string
  onConfirm: () => void
  onCancel: () => void
}

/** 서버 TTL(120초)보다 조금 짧게 — 경계에서 만료된 토큰을 보내 403을 받지 않게. */
const TOKEN_REUSE_MS = 110_000

function scopeKey(scope: StepUpScope): string {
  return scope.action + ':' + scope.targetId
}

export function useStepUp() {
  const tokenRef = useRef<{ token: string; scope: string; issuedAt: number } | null>(null)
  const scopeRef = useRef<StepUpScope | null>(null)
  const registrationRef = useRef<PasskeyRegistrationOptions | null>(null)
  const authenticationRef = useRef<PasskeyAuthenticationOptions | null>(null)
  const pendingRef = useRef<((result: StepUpResult) => void) | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; mode: StepUpDialogMode; message?: string }>({
    open: false,
    mode: 'loading',
  })

  /** 그 범위에 쓸 수 있는 토큰(아직 서버 TTL 안). 없으면 null. */
  const token = useCallback((scope?: StepUpScope): string | null => {
    const held = tokenRef.current
    if (!held) return null
    if (Date.now() - held.issuedAt > TOKEN_REUSE_MS) return null
    if (scope && held.scope !== scopeKey(scope)) return null
    return held.token
  }, [])

  const clear = useCallback(() => {
    tokenRef.current = null
  }, [])

  const prepare = useCallback(async (scope: StepUpScope): Promise<StepUpReadyMode> => {
    scopeRef.current = scope
    if (!(await isPasskeySupported())) return 'unsupported'
    const auth = await fetchAuthenticationOptions(scope)
    if (auth.registered && auth.challenge) {
      authenticationRef.current = auth
      return 'verify'
    }
    registrationRef.current = await fetchRegistrationOptions()
    return 'register'
  }, [])

  /** **클릭 핸들러에서 곧바로** 부른다. `navigator.credentials.*` 호출 앞에 await가 없다. */
  const run = useCallback((mode: 'register' | 'verify'): Promise<StepUpOutcome> => {
    const settle = (error: unknown): StepUpOutcome =>
      isPasskeyCancelled(error) ? { kind: 'cancelled' } : { kind: 'failed', error }
    const scope = scopeRef.current

    if (mode === 'register') {
      const options = registrationRef.current
      if (!options || !scope) return Promise.resolve({ kind: 'failed', error: new Error('no options') })
      registrationRef.current = null // 챌린지는 1회용이다
      return createPasskey(options)
        .then((body) => registerPasskey(body))
        .then(() => fetchAuthenticationOptions(scope))
        .then((auth): StepUpOutcome => {
          if (!auth.registered || !auth.challenge) {
            return { kind: 'failed', error: new Error('device not registered') }
          }
          authenticationRef.current = auth
          return { kind: 'needVerify' }
        })
        .catch(settle)
    }
    const options = authenticationRef.current
    if (!options || !scope) return Promise.resolve({ kind: 'failed', error: new Error('no options') })
    authenticationRef.current = null
    return getPasskeyAssertion(options)
      .then((body) => authenticatePasskey(body))
      .then((result): StepUpOutcome => {
        tokenRef.current = { token: result.stepUpToken, scope: scopeKey(scope), issuedAt: Date.now() }
        return { kind: 'token', token: result.stepUpToken }
      })
      .catch(settle)
  }, [])

  /* ------------------------------ 공용 대화상자 ------------------------------ */

  const finish = useCallback((result: StepUpResult) => {
    const resolve = pendingRef.current
    pendingRef.current = null
    setDialog({ open: false, mode: 'loading' })
    resolve?.(result)
  }, [])

  const open = useCallback(
    async (scope: StepUpScope, message?: string) => {
      setDialog({ open: true, mode: 'loading', message })
      try {
        const mode = await prepare(scope)
        setDialog({ open: true, mode, message })
      } catch (error) {
        finish({ kind: 'failed', error })
      }
    },
    [finish, prepare],
  )

  /**
   * 본인 확인을 받아 토큰을 돌려준다. 같은 범위의 유효한 토큰이 이미 있으면 대화상자 없이 곧바로.
   * 대화상자를 닫거나 인증 창을 취소하면 `cancelled` — 에러가 아니다.
   */
  const request = useCallback(
    (scope: StepUpScope): Promise<StepUpResult> => {
      const held = token(scope)
      if (held) return Promise.resolve({ kind: 'token', token: held })
      pendingRef.current?.({ kind: 'cancelled' })
      return new Promise<StepUpResult>((resolve) => {
        pendingRef.current = resolve
        void open(scope)
      })
    },
    [open, token],
  )

  /** 대화상자 버튼 — **첫 줄에서** 기기 인증 창을 연다. */
  const confirm = useCallback(() => {
    if (dialog.mode !== 'register' && dialog.mode !== 'verify') return
    const pending = run(dialog.mode)
    setDialog({ open: true, mode: 'working' })
    void pending.then((outcome) => {
      if (outcome.kind === 'needVerify') {
        setDialog({ open: true, mode: 'verify' })
        return
      }
      if (outcome.kind === 'token') {
        finish({ kind: 'token', token: outcome.token })
        return
      }
      if (outcome.kind === 'cancelled') {
        finish({ kind: 'cancelled' })
        return
      }
      const scope = scopeRef.current
      if (!scope) {
        finish({ kind: 'failed', error: outcome.error })
        return
      }
      // 검증 실패는 옵션을 다시 받아 한 번 더 시도하게 한다.
      void open(scope, 'failed')
    })
  }, [dialog.mode, finish, open, run])

  const cancel = useCallback(() => {
    finish(dialog.mode === 'unsupported' ? { kind: 'unsupported' } : { kind: 'cancelled' })
  }, [dialog.mode, finish])

  const dialogProps: StepUpDialogProps = useMemo(
    () => ({ ...dialog, onConfirm: confirm, onCancel: cancel }),
    [cancel, confirm, dialog],
  )

  return useMemo(
    () => ({ prepare, run, token, clear, request, dialog: dialogProps }),
    [clear, dialogProps, prepare, request, run, token],
  )
}
