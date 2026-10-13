import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  base64UrlToBytes,
  bytesToBase64Url,
  createPasskey,
  getPasskeyAssertion,
  isPasskeyCancelled,
  isPasskeySupported,
} from './passkey'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base64url', () => {
  it('패딩 없이 왕복한다(+/ 대신 -_)', () => {
    const bytes = new Uint8Array([251, 255, 0, 1, 2])
    const encoded = bytesToBase64Url(bytes)
    expect(encoded).toBe('-_8AAQI')
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(bytes))
  })
})

describe('isPasskeySupported', () => {
  it('PublicKeyCredential 이 없으면 false', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    await expect(isPasskeySupported()).resolves.toBe(false)
  })

  it('내장 인증기(UV 가능) 여부를 그대로 돌려준다', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
    })
    await expect(isPasskeySupported()).resolves.toBe(true)
  })
})

describe('isPasskeyCancelled', () => {
  it('NotAllowedError·AbortError 만 취소로 본다', () => {
    expect(isPasskeyCancelled(new DOMException('x', 'NotAllowedError'))).toBe(true)
    expect(isPasskeyCancelled(new DOMException('x', 'AbortError'))).toBe(true)
    expect(isPasskeyCancelled(new DOMException('x', 'SecurityError'))).toBe(false)
    expect(isPasskeyCancelled(new Error('x'))).toBe(false)
  })
})

describe('createPasskey · getPasskeyAssertion', () => {
  it('create 는 호출 즉시(동기) navigator.credentials.create 를 부르고 결과를 base64url 로 옮긴다', async () => {
    const create = vi.fn().mockResolvedValue({
      rawId: new Uint8Array([1, 2, 3]).buffer,
      response: {
        clientDataJSON: new Uint8Array([4]).buffer,
        attestationObject: new Uint8Array([5]).buffer,
        getTransports: () => ['internal'],
      },
    })
    vi.stubGlobal('navigator', { credentials: { create } })

    const pending = createPasskey({
      challenge: 'AQID',
      rp: { id: 'localhost', name: 'BULLEOYO' },
      user: { id: 'AAAAAAAAADk', name: 'a@b.test', displayName: '관객' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      excludeCredentials: [],
    })
    // await 전에 이미 불렸다 — 사용자 활성화 안에서 창이 열린다.
    expect(create).toHaveBeenCalledTimes(1)
    const publicKey = create.mock.calls[0][0].publicKey
    expect(Array.from(publicKey.challenge as Uint8Array)).toEqual([1, 2, 3])
    expect(publicKey.authenticatorSelection.userVerification).toBe('required')

    await expect(pending).resolves.toEqual({
      credentialId: 'AQID',
      clientDataJSON: 'BA',
      attestationObject: 'BQ',
      transports: ['internal'],
    })
  })

  it('get 도 호출 즉시 navigator.credentials.get 을 부른다', async () => {
    const get = vi.fn().mockResolvedValue({
      rawId: new Uint8Array([9]).buffer,
      response: {
        clientDataJSON: new Uint8Array([1]).buffer,
        authenticatorData: new Uint8Array([2]).buffer,
        signature: new Uint8Array([3]).buffer,
        userHandle: null,
      },
    })
    vi.stubGlobal('navigator', { credentials: { get } })

    const pending = getPasskeyAssertion({
      registered: true,
      challenge: 'AQID',
      rpId: 'localhost',
      allowCredentials: [{ type: 'public-key', id: 'CQ' }],
      timeout: 60000,
      userVerification: 'required',
    })
    expect(get).toHaveBeenCalledTimes(1)
    await expect(pending).resolves.toEqual({
      credentialId: 'CQ',
      clientDataJSON: 'AQ',
      authenticatorData: 'Ag',
      signature: 'Aw',
    })
  })
})
