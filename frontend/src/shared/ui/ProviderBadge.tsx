/**
 * provider 배지 — 화면설계 v6 §5.15.
 *
 * 사용 화면: C-03 · C-05(지갑 등록 온보딩) · P-01(팀 잔액 패널) · P-02.
 *
 * **문구가 화면에 따라 다르다.**
 *   · 관객 화면(C-03)에서는 "소셜 계정으로 연결됨"처럼 **부드럽게** 쓴다
 *   · 공연자 화면(P-02)에서는 provider 값과 축약 주소를 함께 보여준다 → `tone="performer"`
 *
 * 관객 화면에는 지갑·주소·체인 용어를 넣지 않는다(§1.2 원칙 2). 그래서 `tone="audience"`가
 * 기본이고, 축약 주소는 `tone="performer"`일 때만 렌더한다.
 *
 * 2026-09-08 정돈 — 반경이 `rounded-[4px]` 하드코딩이라 배지를 pill로 바꾸는 테마에서
 * 이것만 각져 있었다. 토큰 `rounded-chip`으로 되돌리고 10px 자간을 `tracking-tight`으로
 * 조였다. 문구·색·높이는 그대로다(토큰 문서 §3-1).
 *
 * `SUSPENDED`면 배지 옆에 "이용 정지"를 붙인다. 결제·보증금·동의 액션 비활성화는
 * 이 컴포넌트가 아니라 각 화면이 `suspended`를 보고 처리한다.
 */

import { useLocale } from '@/shared/i18n/useLocale'

export type WalletProvider = 'WEB3AUTH' | 'EXTERNAL'
/** Web3Auth 소셜 로그인 제공자. 카카오는 커스텀 인증이 필요해 결정 대기다(결정요청 B-4) */
export type SocialProvider = 'GOOGLE' | 'FACEBOOK' | 'KAKAO'

interface Props {
  provider: WalletProvider
  /** WEB3AUTH일 때만 의미가 있다 */
  social?: SocialProvider
  /** 지갑 상태가 SUSPENDED면 "이용 정지"를 덧붙인다 */
  suspended?: boolean
  /** 공연자 화면은 축약 주소를 함께 보여준다 */
  tone?: 'audience' | 'performer'
  /** tone="performer"일 때만 쓴다 */
  shortAddress?: string
}

const SOCIAL_LABEL: Record<SocialProvider, { ko: string; en: string }> = {
  GOOGLE: { ko: '구글', en: 'Google' },
  FACEBOOK: { ko: '페이스북', en: 'Facebook' },
  KAKAO: { ko: '카카오', en: 'Kakao' },
}

export function ProviderBadge({
  provider,
  social,
  suspended = false,
  tone = 'audience',
  shortAddress,
}: Props) {
  const { text } = useLocale()
  const label =
    provider === 'WEB3AUTH'
      ? tone === 'audience'
        ? social
          ? text(
              `${SOCIAL_LABEL[social].ko} 계정으로 연결됨`,
              `Connected with ${SOCIAL_LABEL[social].en}`,
            )
          : text('소셜 계정으로 연결됨', 'Connected with a social account')
        : text('소셜 계정 지갑', 'Social account')
      : tone === 'audience'
        ? text('보유 지갑으로 연결됨', 'Connected with an existing wallet')
        : text('외부 지갑', 'External wallet')

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-chip bg-ground-2 px-1.5 font-sans text-[10px] font-semibold tracking-tight text-muted">
        {label}
      </span>
      {tone === 'performer' && shortAddress && (
        <span className="font-mono text-[10px] text-faint">{shortAddress}</span>
      )}
      {suspended && (
        <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-chip border border-danger px-1.5 font-sans text-[10px] font-semibold tracking-tight text-danger">
          {text('이용 정지', 'Suspended')}
        </span>
      )}
    </span>
  )
}
