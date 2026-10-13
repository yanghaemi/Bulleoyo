/**
 * 기기 패스키(WebAuthn platform authenticator) 래퍼 — 결제 전 본인 확인(API v7 §7.W).
 *
 * 노트북은 Windows Hello 지문, 아이폰은 Face ID — 코드는 하나이고 **기기가 수단을 정한다.**
 * 생체 정보는 기기 밖으로 나가지 않는다. 브라우저가 돌려주는 것은 기기 키의 서명뿐이고 서버는
 * 그 서명만 검증한다.
 *
 * ⚠ 사용자 활성화(user activation) — Safari·iOS는 `navigator.credentials.create/get`을 **클릭 직후**
 *   에만 허용한다. 그래서 두 함수는 옵션을 받은 채로 호출되며 **호출 전에 await가 없다**(D-82 교훈).
 *   옵션(서버 챌린지)은 버튼을 보여 주기 전에 미리 받아 둔다.
 *
 * 서버와 주고받는 바이너리는 전부 base64url(패딩 없음) 문자열이다.
 */

import type { Schemas } from '@/shared/api/schema'

export type PasskeyRegistrationOptions = Schemas['WebauthnRegistrationOptions']
export type PasskeyAuthenticationOptions = Schemas['WebauthnAuthenticationOptions']
export type PasskeyRegistrationBody = Schemas['WebauthnRegistrationRequest']
export type PasskeyAuthenticationBody = Schemas['WebauthnAuthenticationRequest']

/* ------------------------------ base64url ------------------------------ */

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(value: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/* ------------------------------ 지원 여부 ------------------------------ */

/**
 * 이 기기에 사용자 확인(지문·얼굴·PIN)이 되는 **내장** 인증기가 있는가.
 * 외부 보안키·다른 기기(QR) 인증은 이 기능의 범위가 아니다(authenticatorAttachment `platform`).
 */
export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') {
    return false
  }
  const check = window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
  if (typeof check !== 'function') return false
  try {
    return await check.call(window.PublicKeyCredential)
  } catch {
    return false
  }
}

/**
 * 사용자가 인증 창을 닫았거나 거절했다 — **에러가 아니다.** 화면은 이전 단계로 되돌린다.
 * 브라우저는 취소·시간 초과·(일부) 미등록 기기를 모두 `NotAllowedError`로 알린다(개인정보 보호).
 */
export function isPasskeyCancelled(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')
  )
}

/* ------------------------------ 등록 · 인증 ------------------------------ */

function descriptor(item: Schemas['WebauthnCredentialDescriptor']): PublicKeyCredentialDescriptor {
  return {
    type: 'public-key',
    id: base64UrlToBytes(item.id),
    ...(item.transports ? { transports: item.transports as AuthenticatorTransport[] } : {}),
  }
}

/** 첫 기기 등록. **클릭 핸들러 안에서 곧바로** 부른다. */
export function createPasskey(options: PasskeyRegistrationOptions): Promise<PasskeyRegistrationBody> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToBytes(options.challenge),
    rp: { id: options.rp.id, name: options.rp.name },
    user: {
      id: base64UrlToBytes(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams.map((p) => ({ type: 'public-key', alg: p.alg })),
    timeout: options.timeout,
    attestation: options.attestation,
    authenticatorSelection: options.authenticatorSelection,
    excludeCredentials: options.excludeCredentials.map(descriptor),
  }
  // await 없이 바로 호출한다 — 사용자 활성화가 살아 있는 동안이어야 한다.
  const pending = navigator.credentials.create({ publicKey })
  return pending.then((credential) => {
    const pk = credential as PublicKeyCredential | null
    if (!pk) throw new DOMException('No credential', 'NotAllowedError')
    const response = pk.response as AuthenticatorAttestationResponse
    const transports =
      typeof response.getTransports === 'function' ? response.getTransports() : undefined
    return {
      credentialId: bytesToBase64Url(pk.rawId),
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      attestationObject: bytesToBase64Url(response.attestationObject),
      ...(transports && transports.length ? { transports } : {}),
    }
  })
}

/** 결제 전 본인 확인. **클릭 핸들러 안에서 곧바로** 부른다. */
export function getPasskeyAssertion(
  options: PasskeyAuthenticationOptions,
): Promise<PasskeyAuthenticationBody> {
  if (!options.challenge) {
    return Promise.reject(new Error('authentication options without challenge'))
  }
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToBytes(options.challenge),
    rpId: options.rpId,
    allowCredentials: (options.allowCredentials ?? []).map(descriptor),
    timeout: options.timeout,
    userVerification: options.userVerification ?? 'required',
  }
  const pending = navigator.credentials.get({ publicKey })
  return pending.then((credential) => {
    const pk = credential as PublicKeyCredential | null
    if (!pk) throw new DOMException('No credential', 'NotAllowedError')
    const response = pk.response as AuthenticatorAssertionResponse
    return {
      credentialId: bytesToBase64Url(pk.rawId),
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      authenticatorData: bytesToBase64Url(response.authenticatorData),
      signature: bytesToBase64Url(response.signature),
      ...(response.userHandle ? { userHandle: bytesToBase64Url(response.userHandle) } : {}),
    }
  })
}
