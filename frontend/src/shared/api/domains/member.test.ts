import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())

vi.mock('@/shared/api/client', () => ({
  api: { post },
  NetworkError: class NetworkError extends Error {},
}))

import { loginWithWeb3Auth, type Web3AuthLoginRequest } from './member'

describe('loginWithWeb3Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    post.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
  })

  it('uses the public request boundary so an invalid OAuth token cannot force-log out another session', async () => {
    const body = {
      idToken: 'identity-token',
      address: '0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a',
      provider: 'GOOGLE',
      countryCode: 'KR',
      locale: 'ko',
      displayCurrency: 'KRW',
      timezone: 'Asia/Seoul',
      termsAgreed: true,
      privacyAgreed: true,
    } as Web3AuthLoginRequest

    await loginWithWeb3Auth(body)

    expect(post).toHaveBeenCalledWith('/auth/web3auth', body, { public: true })
  })
})
