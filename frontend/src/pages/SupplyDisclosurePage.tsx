/**
 * V-02 발행량·에스크로 공시 페이지 — 라우트 `/verify/supply`.
 *
 * **로그인 없이 열린다.** 화면설계 v6 V-02가 "사용자 GUEST(로그인 불필요)"라고 정했고,
 * API 정본 `08_coin.yaml`의 coin_01도 `security: []` · `x-role: GUEST`다. 그래서 이 페이지는
 * 토큰·세션을 읽지 않고 401 분기도 두지 않는다. 헤더도 비로그인 상태(`AppHeader`)로 둔다.
 *
 * 이 파일은 **조립만** 한다. 본문은 `features/verify/SupplyDisclosure`에 있다.
 *
 * ── API (S15P21B204-102) ───────────────────────────────────────────────
 *   공시: `GET /api/v1/coin/supply` (API-coin-01) — `useCoinSupply`. 서버가 1분 캐시하고
 *         훅의 `staleTime`도 60초다 — **화면에서 폴링하지 않는다.**
 *   에러: `COMMON_EXTERNAL_SERVICE_ERROR`(502) · `CHAIN_TX_TIMEOUT`(504) ·
 *         `COMMON_INTERNAL_ERROR`(500) · `COMMON_TOO_MANY_REQUESTS`(429).
 *         분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 *
 *   ⚠ `GET /api/v1/coin/config`(API-coin-04)는 **부르지 않는다.** P1 미구현이라 500이 온다
 *     (S15P21B204-102). 이 화면에 필요한 주소·chainId·익스플로러 URL은 coin_01 응답에 다 있다.
 *
 * ── "모른다"의 세 갈래를 뭉개지 않는다 (S15P21B204-80 선례) ─────────────
 *   ① **조회 자체가 실패** → `errorCode`. 마지막으로 성공한 응답의 `asOf`를 함께 알린다.
 *   ② **서버가 캐시를 보여주는 중**(`data.stale === true`) → 값은 있지만 지금 체인 상태가
 *      아니다. 본문이 "마지막으로 읽은 값"이라고 밝히고 대조 결과를 단정하지 않는다.
 *   ③ **값 일부만 못 읽음**(불변식의 `expected`·`checkedShows` 등이 null) → 그 행만 판정 불가다.
 *   셋은 원인이 다르고 사용자가 할 일도 다르다. 하나로 합치면 반드시 한쪽이 틀린 말을 한다.
 *   ①과 ②·③은 여기서 갈라 넘기고, ③의 판정은 `features/verify/invariants.ts`가 한다.
 */

import { AppHeader } from '@/shared/ui'
import { SupplyDisclosure } from '@/features/verify/SupplyDisclosure'
import { isApiError } from '@/shared/api/client'
import { useCoinSupply } from '@/shared/queries/coin'

export function SupplyDisclosurePage() {
  const supply = useCoinSupply()
  const error = isApiError(supply.error) ? supply.error : undefined

  return (
    <>
      {/* 공개 화면이라 비로그인 헤더다 — 언어 스위치가 여기 들어 있다(§5.11·§5.17) */}
      <AppHeader />

      <SupplyDisclosure
        data={supply.data}
        loading={supply.isPending}
        errorCode={error?.code}
        errorMsg={error?.msg}
        /*
         * "마지막 성공 조회 시각"(V-02 상태 항목)의 유일한 정직한 출처는 **마지막으로 성공한
         * coin_01 응답**이다. 재조회가 실패해도 쿼리 캐시에 직전 성공값이 남아 있으므로 그
         * `asOf`를 그대로 쓴다. 한 번도 성공하지 못했으면 `undefined`이고 그 줄은 그리지 않는다 —
         * 현재 시각을 넣으면 "방금 읽었다"는 거짓말이 된다.
         */
        lastSuccessAt={supply.data?.asOf}
        onRetry={() => void supply.refetch()}
      />
    </>
  )
}

export default SupplyDisclosurePage
