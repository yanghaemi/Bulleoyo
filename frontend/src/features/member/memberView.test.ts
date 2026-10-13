/** C-01의 비자명한 곳 하나 — 로그인 후 분기. (요청·토큰 저장은 `shared/queries/member`가 한다) */

import { postLoginPath } from '@/features/member/memberView'

describe('postLoginPath — C-01 분기', () => {
  const wallet = {
    provider: 'WEB3AUTH',
    address: '0x' + '1'.repeat(40),
    status: 'LINKED',
    explorerUrl: null,
  } as const

  it('지갑이 없으면 홈에 닿기 전에 C-05로 보낸다', () => {
    // 뷰모델은 "없음"을 항상 null로 모은다(응답에서는 키 자체가 빠질 수 있다)
    expect(postLoginPath({ wallet: null, isNewMember: false }, '/tickets')).toBe('/onboarding/wallet')
    expect(postLoginPath({ wallet: null, isNewMember: true }, '/tickets')).toBe('/onboarding/wallet')
  })

  it('지갑이 있고 최초 회원이면 C-02를 1회 거친다', () => {
    expect(postLoginPath({ wallet, isNewMember: true }, '/tickets')).toBe('/signup')
  })

  it('재로그인이면 저장해 둔 경로로 돌아간다. 없으면 홈', () => {
    expect(postLoginPath({ wallet, isNewMember: false }, '/tickets?page=2')).toBe('/tickets?page=2')
    expect(postLoginPath({ wallet, isNewMember: false }, '')).toBe('/')
  })
})
