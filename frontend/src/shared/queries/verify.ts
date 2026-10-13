/**
 * verify 쿼리 훅 — V-01 정산 검증.
 *
 * 정본 · `docs/design/06_API_명세서_v6.md` API-verify-01 · 화면 V-01
 * 호출 함수·매퍼는 `@/shared/api/domains/verify`, 키는 `@/shared/queries/keys`가 정본이다.
 *
 * 조회 하나뿐이다(verify_01). 이 화면은 무엇도 바꾸지 않는다 — 검증은 읽기다.
 * 값이 바뀌는 계기는 결제·환불·정산 tx이고, 그 무효화는 `invalidatedBy(txType)`가
 * `qk.verify.all`을 포함시켜 처리한다(keys.ts의 PURCHASE·REFUND·LOCK·AGGREGATE·RELEASE).
 */

import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { fetchVerification } from '@/shared/api/domains/verify'
import type { VerificationData } from '@/shared/api/domains/verify'
import type { ApiError } from '@/shared/api/client'
import { qk } from '@/shared/queries/keys'

/**
 * 서버가 **60초 캐시**하는 응답이다(API-verify-01 요구사항). 그보다 자주 다시 물어도
 * 같은 값이 오고 429 `COMMON_TOO_MANY_REQUESTS`만 가까워지므로 클라이언트도 60초를 맞춘다.
 */
const VERIFICATION_STALE_TIME_MS = 60_000

/**
 * API-verify-01 정산 검증 데이터 — **참여팀 로그인 전용**(403 `SETTLEMENT_NOT_PARTICIPANT`).
 *
 * ⚠ 실패했을 때 화면은 데이터를 **일절 노출하지 않는다**(V-01 상태 항목). 부분 표시 금지.
 *   에러 code → 문구는 `features/verify/verifyErrors.ts`가 정본이다.
 *
 * ⚠ 성공해도 `data.stale === true`면 대조 결과(`matched` 3종·`hashMatched`)를 단정하지 않는다.
 *   마지막 인덱싱 값 기준이라 "지금 일치한다"는 뜻이 아니다.
 */
export function useVerification(
  performanceId: number | undefined,
): UseQueryResult<VerificationData, ApiError> {
  const id = performanceId ?? 0
  return useQuery({
    queryKey: qk.verify.byPerformance(id),
    queryFn: () => fetchVerification(id),
    enabled: id > 0,
    staleTime: VERIFICATION_STALE_TIME_MS,
  })
}
