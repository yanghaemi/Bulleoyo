/**
 * webauthn — 결제 전 본인 확인(패스키) API (API-webauthn-01~04, API v7 §7.W).
 *
 * 정본: `docs/design/06_API_명세서_v7.md` §7.W · `docs/design/api/openapi.yaml` operationId `webauthn_01`~`04`
 *
 * 보호 동작 5개(결제·규칙 동의·보증금·정산 조기 동의·정산금 지급)의 화면이 직전 응답의 `stepUpRequired`가
 * true일 때만 이 모듈을 쓴다(공용 훅 `shared/auth/useStepUp`).
 * 받은 `stepUpToken`은 **메모리(ref)에만** 둔다 — localStorage·로그에 남기지 않는다(120초·1회용).
 */

import { api } from '@/shared/api/client'
import type { ApiData, Schemas } from '@/shared/api/schema'
import type { PasskeyAuthenticationBody, PasskeyRegistrationBody } from '@/shared/auth/passkey'

export type WebauthnRegistrationOptions = ApiData<'webauthn_01'>
export type WebauthnRegistrationResult = ApiData<'webauthn_02'>
export type WebauthnAuthenticationOptions = ApiData<'webauthn_03'>
export type WebauthnStepUpToken = ApiData<'webauthn_04'>

/**
 * 토큰 범위 — 무엇을(동작) 어디에(대상) 확인하는가. `PAYMENT`는 주문 그룹 id, 나머지는 공연 id.
 * 받은 토큰은 이 범위에만 쓸 수 있다(다른 동작·대상이면 서버가 403).
 */
export type StepUpAction = Schemas['StepUpAction']
export type StepUpScope = { action: StepUpAction; targetId: number }

/** 보호 동작 가드 코드(규격 §3.18). 받으면 에러 화면이 아니라 본인 확인 단계로 되돌아간다. */
export const WEBAUTHN_STEP_UP_REQUIRED = 'WEBAUTHN_STEP_UP_REQUIRED'
/** 등록·인증 검증 실패(규격 §3.18). 옵션을 다시 받아 한 번 더 시도하게 한다. */
export const WEBAUTHN_VERIFICATION_FAILED = 'WEBAUTHN_VERIFICATION_FAILED'

/** API-webauthn-01. 챌린지를 새로 쓰는 호출이라 POST다. */
export function fetchRegistrationOptions(): Promise<WebauthnRegistrationOptions> {
  return api.post<WebauthnRegistrationOptions>('/webauthn/registration/options', undefined)
}

/** API-webauthn-02 — 201. */
export function registerPasskey(body: PasskeyRegistrationBody): Promise<WebauthnRegistrationResult> {
  return api.post<WebauthnRegistrationResult>('/webauthn/registration', body)
}

/** API-webauthn-03 — 본문이 토큰 범위다. 등록 기기가 없으면 `{ registered: false }`(에러 아님). */
export function fetchAuthenticationOptions(
  scope: StepUpScope,
): Promise<WebauthnAuthenticationOptions> {
  const body: Schemas['WebauthnAuthenticationOptionsRequest'] = {
    action: scope.action,
    targetId: scope.targetId,
  }
  return api.post<WebauthnAuthenticationOptions>('/webauthn/authentication/options', body)
}

/** API-webauthn-04 → `stepUpToken`. */
export function authenticatePasskey(body: PasskeyAuthenticationBody): Promise<WebauthnStepUpToken> {
  return api.post<WebauthnStepUpToken>('/webauthn/authentication', body)
}
