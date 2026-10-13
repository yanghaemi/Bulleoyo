/**
 * V-01 정산 검증 페이지 — 라우트 `/verify/:performanceId`.
 *
 * 이 파일은 **조립만** 한다. 본문은 `features/verify/SettlementVerification`에 있고
 * 여기서는 조회 훅 둘을 붙여 넘긴다. **페이지는 `api`를 직접 부르지 않는다.**
 *
 * **참여팀 리더 전용·로그인 필수** 화면이다. 진입 가드(로그인·참여팀 여부)는 라우터에 아직
 * 없고(`app/router.tsx` 주석), 대신 응답 code로 끊는다.
 *
 * ── API (S15P21B204-102) ───────────────────────────────────────────────
 *   검증: `GET /api/v1/performances/{performanceId}/verification` (API-verify-01) — `useVerification`
 *         서버가 60초 캐시하고 훅의 `staleTime`도 60초다 — **화면에서 폴링하지 않는다.**
 *   공시: `GET /api/v1/coin/supply` (API-coin-01, **공개 API**) — `useCoinSupply`.
 *         불변식 ①·④ 전용 소스다(V-01 컴포넌트 표: "④는 전역 값이므로 V-02와 같은 소스를 쓴다").
 *         ⚠ **두 호출을 함께 실패시키지 않는다.** coin_01이 죽어도 화면은 살아 있고 ①·④만
 *           "판정 불가"가 된다 — `supply`를 넘기지 않으면 `InvariantList`가 그렇게 그린다.
 *   에러: `PERFORMANCE_NOT_FOUND`(404) · `COMMON_UNAUTHORIZED`(401 → C-01, 복귀 경로 저장)
 *         · `COMMON_FORBIDDEN`(403) · `SETTLEMENT_NOT_PARTICIPANT`(403) · `COMMON_TOO_MANY_REQUESTS`(429)
 *         · `CHAIN_TX_TIMEOUT`(504) · `COMMON_EXTERNAL_SERVICE_ERROR`(502).
 *         분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 *
 * ── 403은 페이지에서 끊는다 ────────────────────────────────────────────
 *   `SETTLEMENT_NOT_PARTICIPANT`·`COMMON_FORBIDDEN`이면 **데이터를 컴포넌트에 넘기지 않는다**
 *   (V-01 상태 항목: 부분 표시 금지). verify_01이 403이면 `data`가 애초에 없지만, 그 사실에
 *   기대지 않고 코드로도 막는다 — 캐시에 남은 직전 성공값이 화면에 새는 경로를 닫는다.
 *
 * ── 지워진 목 시나리오 하나에 대해 ─────────────────────────────────────
 *   목에는 "재계산 불일치" 시나리오가 있었고 그 값은 verify_01 200 **예시** 그대로였다.
 *   예시(팀 11 `choiceAmount: 123903`, dust 4)는 같은 응답의 `recalculationInput`과
 *   `roundingRule`(FLOOR_TO_INTEGER_KRW)로 다시 계산하면 재현되지 않는다
 *   (⌊610,000 × 13 / 64⌋ = 123,906, dust 1). **명세 예시 자체가 어긋난 건**이지 화면이 만들 상태가
 *   아니다. 실제 응답에서는 서버가 계산한 값이 오므로 시나리오를 남길 이유가 없어 지웠다.
 *   예시 정정은 산출 문서의 명세 불일치 목록에 올렸다.
 */

import { useNavigate, useParams } from 'react-router'

import { SettlementVerification } from '@/features/verify/SettlementVerification'
import { VerifyCode } from '@/features/verify/verifyErrors'
import { isApiError } from '@/shared/api/client'
import { useCoinSupply } from '@/shared/queries/coin'
import { useVerification } from '@/shared/queries/verify'
import { AppHeader } from '@/shared/ui'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** 데이터를 한 조각도 내보내지 않는 코드들(V-01 상태 항목) */
function isDenied(code: string | undefined): boolean {
  return code === VerifyCode.NOT_PARTICIPANT || code === VerifyCode.FORBIDDEN
}

export function VerifyPage() {
  const raw = useParams().performanceId
  const performanceId = toPerformanceId(raw)
  const enabled = performanceId !== undefined
  const navigate = useNavigate()

  const verification = useVerification(performanceId)
  // 공개 API다. verify_01이 403·404여도 이 호출은 따로 살아 있다(서로 묶지 않는다)
  const supply = useCoinSupply()

  const error = isApiError(verification.error) ? verification.error : undefined
  // 숫자가 아닌 주소의 공연은 실제로 없다 — 조회를 걸지 않고 404와 같은 안내로 받는다
  const errorCode = enabled ? error?.code : VerifyCode.PERFORMANCE_NOT_FOUND
  const denied = isDenied(errorCode)

  return (
    <>
      {/* 로그인 필수 화면이라 헤더는 로그인 상태로 둔다(가드가 붙기 전 임시) */}
      <AppHeader signedIn />

      <SettlementVerification
        // 403이면 데이터를 넘기지 않는다. 부분 표시 금지(V-01 상태 항목)
        data={denied ? undefined : verification.data}
        /*
         * coin_01이 실패했거나 아직 안 왔으면 `undefined`를 넘긴다 — 불변식 ①·④가 "판정 불가"가
         * 된다. verify_01의 성공과 이 값을 묶지 않는 것이 이 화면의 요점이다.
         */
        supply={denied ? undefined : supply.data}
        // 공시 조회가 늦다고 검증 화면 전체를 스켈레톤으로 덮지 않는다
        loading={enabled && verification.isPending}
        errorCode={errorCode}
        errorMsg={enabled ? error?.msg : undefined}
        onRetry={() => {
          void verification.refetch()
          // 공시가 죽어서 ①·④가 판정 불가인 상태도 이 버튼으로 함께 되살린다
          void supply.refetch()
        }}
        // 401 — C-01로 보내고 복귀 경로를 저장한다(V-01 상태 항목)
        onSignIn={() => navigate('/login', { state: { from: `/verify/${raw ?? ''}` } })}
        onOpenSupply={() => navigate('/verify/supply')}
      />
    </>
  )
}

export default VerifyPage
