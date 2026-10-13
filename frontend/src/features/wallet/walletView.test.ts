/**
 * A-13·C-05의 비자명한 곳 둘 — 거래 이력 행 변환과 등록 실패 분류.
 *
 * 응답 예시는 **실제 로컬 백엔드 응답**(2026-09-13)과 API v6 wallet_02 예시에서 가져왔다.
 */

import { ApiError } from '@/shared/api/client'
import { onboardingErrorOf, toWalletTx } from '@/features/wallet/walletView'
import type { WalletTransactionView } from '@/shared/api/domains/wallet'

const GRANT: WalletTransactionView = {
  // 실측 응답: 미확정 GRANT 행에는 txHash·explorerUrl이 아예 없다(뷰모델은 null로 모은다)
  walletTxId: 'job_1',
  type: 'GRANT',
  direction: 'IN',
  amount: 100_000,
  currency: 'KRW',
  status: 'PENDING',
  refType: 'CHAIN_JOB',
  refId: 1,
  title: 'Welcome balance',
  signerType: 'OPERATOR',
  feeDelegated: false,
  txHash: null,
  explorerUrl: null,
  occurredAt: '2026-09-10T19:58:12+09:00',
}

const PURCHASE: WalletTransactionView = {
  walletTxId: 'pay_8801',
  type: 'PURCHASE',
  direction: 'OUT',
  amount: 50_000,
  currency: 'KRW',
  status: 'CONFIRMED',
  refType: 'ORDER',
  refId: 5501,
  title: '합정 3밴드 합동공연 · 일반 2매',
  signerType: 'USER',
  feeDelegated: true,
  txHash: null,
  explorerUrl: null,
  occurredAt: '2026-09-10T20:03:11+09:00',
}

describe('toWalletTx', () => {
  it('주문에서 온 행만 A-12로 이어진다', () => {
    expect(toWalletTx(PURCHASE, null, 'Asia/Seoul')?.linkTo).toBe('/orders/5501')
    // 지급은 이동할 곳이 없다 — 없는 링크를 만들지 않는다
    expect(toWalletTx(GRANT, null, 'Asia/Seoul')?.linkTo).toBeUndefined()
  })

  it('환율이 없으면 환산을 보여주지 않는다(표시 통화가 KRW면 루트 rate가 없다)', () => {
    expect(toWalletTx(GRANT, null, 'Asia/Seoul')?.approxLabel).toBeUndefined()
  })

  it('환산은 루트 rate 하나로만 계산한다 — 1 USD = 1350 KRW(§0.5)', () => {
    const rate = { currency: 'USD', rate: 1350, asOf: '2026-09-02T09:00:00+09:00' }
    // 100,000 / 1350 = 74.07…
    expect(toWalletTx(GRANT, rate, 'Asia/Seoul')?.approxLabel).toBe('$74.07')
  })

  it('행 시각은 회원 시간대로 찍고 ISO 원본을 함께 남긴다(묶음 머리글과 같은 기준)', () => {
    const seoul = toWalletTx(GRANT, null, 'Asia/Seoul')
    expect(seoul?.occurredAt).toBe(GRANT.occurredAt)
    expect(seoul?.occurredAtLabel).toContain('KST')

    // 회원 시간대가 KST가 아니면 KST를 병기한다(§5.13) — 같은 시각이 다른 날짜로 찍힌다
    const la = toWalletTx(GRANT, null, 'America/Los_Angeles')
    expect(la?.occurredAtLabel).toContain('(KST 19:58)')
    expect(la?.occurredAtLabel).not.toBe(seoul?.occurredAtLabel)
  })

  it('종류·시각이 빠진 행은 지어내지 않고 건너뛴다', () => {
    expect(toWalletTx({ ...GRANT, type: null }, null, 'Asia/Seoul')).toBeNull()
    expect(toWalletTx({ ...GRANT, occurredAt: null }, null, 'Asia/Seoul')).toBeNull()
  })
})

describe('onboardingErrorOf — code로만 분기한다', () => {
  const api = (code: string, status: number) => new ApiError({ code, status, msg: '무시된다' })

  it('409는 "이미 등록됨"과 "챌린지 만료"를 나눌 수 없어 화면에 판단을 넘긴다', () => {
    // 실측: 백엔드는 두 경우 모두 COMMON_CONFLICT로 답한다
    expect(onboardingErrorOf(api('COMMON_CONFLICT', 409))).toBe('CONFLICT')
    // 전용 코드(§16.1)가 배포되면 그대로 받는다
    expect(onboardingErrorOf(api('WALLET_ALREADY_LINKED', 409))).toBe('CONFLICT')
    expect(onboardingErrorOf(api('WALLET_CHALLENGE_EXPIRED', 409))).toBe('WALLET_CHALLENGE_EXPIRED')
  })

  it('서명 검증 실패는 전용 code 일 때만 재시도 안내로 간다', () => {
    expect(onboardingErrorOf(api('WALLET_SIGNATURE_INVALID', 400))).toBe('WALLET_SIGNATURE_INVALID')
  })

  it('평범한 400 은 서명 실패로 접지 않는다 — 서버 msg 가 화면으로 간다', () => {
    // 주소 형식 오류·필수값 누락도 이 코드로 온다. 이것을 "다른 지갑으로 서명했을 수 있어요"로
    // 보여 주면 사용자가 원인 없는 재서명을 반복한다. undefined 를 돌려 호출부가 서버 msg 를
    // 띄우게 한다(WalletOnboardingPage → WalletOnboarding errorMsg).
    expect(onboardingErrorOf(api('COMMON_VALIDATION_FAILED', 400))).toBeUndefined()
  })

  it('502는 그대로, 그 밖의 code와 지갑 팝업 거부(code 없음)는 화면 기본 문구로 넘긴다', () => {
    expect(onboardingErrorOf(api('COMMON_EXTERNAL_SERVICE_ERROR', 502))).toBe(
      'COMMON_EXTERNAL_SERVICE_ERROR',
    )
    expect(onboardingErrorOf(api('COMMON_INTERNAL_ERROR', 500))).toBeUndefined()
    expect(onboardingErrorOf(new Error('user rejected'))).toBeUndefined()
  })
})
