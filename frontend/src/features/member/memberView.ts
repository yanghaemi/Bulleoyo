/**
 * member 응답에서 **화면 분기만** 뽑는 순수 함수 둘.
 *
 * 요청·캐시·토큰은 `@/shared/queries/member`(MR !91)가 전부 한다. 여기에는 그 훅들이 답하지
 * 않는 두 가지 — "로그인 직후 어디로 보내나"와 "리더인 팀이 있나" — 만 남긴다.
 */

import type { MemberMeView, MemberSessionView } from '@/shared/api/domains/member'

/**
 * 로그인 성공 후 갈 곳 — 화면설계 v6 C-01 "분기" 절 그대로.
 *
 *   wallet 없음            → C-05 `/onboarding/wallet` (홈에 닿기 전 강제)
 *   wallet 있음 + 최초 회원 → C-02 `/signup` 1회
 *   그 밖                  → 저장해 둔 복귀 경로(`?from=`), 없으면 홈
 *
 * API v6 §14-35로 지갑 등록이 `POST /wallets`로 분리되면서 로그인 응답의 `wallet`이
 * nullable이 됐다 — 그래서 이 분기가 필요하다.
 */
export function postLoginPath(
  session: Pick<MemberSessionView, 'wallet' | 'isNewMember'>,
  from: string,
): string {
  if (!session.wallet) return '/onboarding/wallet'
  if (session.isNewMember) return '/signup'
  return from || '/'
}

/** 리더인 팀이 하나라도 있는가 — A-13 리더 전용 필터 노출 조건 */
export function isTeamLeader(me: MemberMeView | undefined): boolean {
  return Boolean(me?.teams?.some((team) => team.leader))
}
