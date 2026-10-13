/**
 * coin 쿼리·뮤테이션 훅 — V-02(공시) · M-03(표시 환율·코인 지급) · 공통 초기화.
 *
 * 정본 · `docs/design/06_API_명세서_v6.md` API-coin-01·02·03·04·07·08
 * 호출 함수·매퍼는 `@/shared/api/domains/coin`, 키는 `@/shared/queries/keys`가 정본이다.
 *
 * ⚠ 지급 중단 판정은 `supplyMatched`가 아니라 `mintHalted`·`releaseHalted`다.
 *   훅은 세 값을 가공하지 않고 그대로 넘기며, 판정은 `features/admin/haltState.ts`가 한다.
 *   (자세한 이유는 `@/shared/api/domains/coin` 상단)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import {
  fetchChainConfig,
  fetchCoinGrants,
  fetchCoinSupply,
  fetchExchangeRates,
  grantCoin,
  normalizeGrantListParams,
  registerExchangeRates,
} from '@/shared/api/domains/coin'
import type {
  ChainConfig,
  CoinGrantHistory,
  CoinGrantListParams,
  CoinGrantRequest,
  CoinSupply,
  ExchangeRateList,
  ExchangeRateListParams,
  ExchangeRateRegisterRequest,
  ExchangeRateRegisterResult,
} from '@/shared/api/domains/coin'
import type { ApiError } from '@/shared/api/client'
import type { ChainJobAccepted } from '@/shared/api/types'
import { qk } from '@/shared/queries/keys'

/** 서버가 1분 캐시하는 두 응답(coin_01·coin_02). 더 자주 물어도 같은 값이 온다 */
const ONE_MINUTE_MS = 60_000
/** coin_04는 5분 캐시이며 컨트랙트 재배포 때만 바뀐다 */
const FIVE_MINUTES_MS = 5 * 60_000

/**
 * 지급 이력 **목록 전체**를 잡는 접두.
 *
 * ⚠ `qk.coin.grants()`는 `['coin','grants', null]`이라 `['coin','grants', {필터}]`의 접두가 아니다.
 *   그대로 `invalidateQueries`에 넘기면 필터가 걸린 목록이 **하나도 무효화되지 않는다.**
 *   `keys.ts`에 목록용 접두(`grantLists()`)가 생기기 전까지 팩토리 출력에서 params 자리를 잘라 쓴다.
 *   (같은 문제가 `invalidatedBy('MINT')`·`qk.admin.disputes()`에도 있다 — 산출 문서에 올렸다)
 */
const COIN_GRANTS_PREFIX = qk.coin.grantsAll()

/* =============================== 조회 =============================== */

/**
 * API-coin-01 발행량·에스크로 공시(V-02). 공개 API이며 비로그인도 읽는다.
 *
 * 응답의 `stale: true`는 "마지막 성공값을 보여주는 중"이라는 뜻이다. 이때 화면은 대사 결과를
 * 단정하지 않는다. **사유(체인 노드 실패 / Redis 실패)는 명세가 구분해 주지 않는다.**
 */
export function useCoinSupply(): UseQueryResult<CoinSupply, ApiError> {
  return useQuery({
    queryKey: qk.coin.supply(),
    queryFn: fetchCoinSupply,
    staleTime: ONE_MINUTE_MS,
  })
}

/**
 * API-coin-02 표시 환율(§0.5). **표시 전용**이다 —
 * 결제·정산·컨트랙트 인자에 이 값을 쓰지 않는다(P-17). 미등록은 빈 배열이며 오류가 아니다.
 */
export function useExchangeRates(
  params: ExchangeRateListParams = {},
): UseQueryResult<ExchangeRateList, ApiError> {
  const normalized: ExchangeRateListParams = { pair: params.pair }
  return useQuery({
    // `qk.coin.rates()`에는 params 자리가 없다. pair 필터가 서로 덮어쓰지 않도록 한 칸 덧붙이되
    // 팩토리 출력을 접두로 남겨 `invalidateQueries({ queryKey: qk.coin.rates() })`가 그대로 잡게 한다.
    queryKey: [...qk.coin.rates(), normalized.pair ?? null],
    queryFn: () => fetchExchangeRates(normalized),
    staleTime: ONE_MINUTE_MS,
  })
}

/**
 * API-coin-04 체인·컨트랙트 설정(P1). MVP는 프론트 환경변수를 쓰므로 이 훅은 선택적이다.
 * 컨트랙트 주소가 비어 있으면(배포 전) 화면은 체인 기능을 비활성으로 표시한다.
 */
export function useChainConfig(): UseQueryResult<ChainConfig, ApiError> {
  return useQuery({
    queryKey: qk.coin.config(),
    queryFn: fetchChainConfig,
    staleTime: FIVE_MINUTES_MS,
  })
}

/**
 * API-coin-08 시연용 지급 이력(M-03). 가입 자동(SIGNUP)과 관리자 수동(ADMIN)이 섞여 나온다.
 * 원본이 `chain_job WHERE tx_type='MINT'`이라 **확정 전(PENDING·SUBMITTED) 건도 목록에 있다.**
 */
export function useCoinGrants(
  params: CoinGrantListParams = {},
): UseQueryResult<CoinGrantHistory, ApiError> {
  // 키와 요청이 늘 같은 모양이 되도록 여기서 한 번만 정규화한다(keys.ts 주석).
  const normalized = normalizeGrantListParams(params)
  return useQuery({
    queryKey: qk.coin.grants(normalized),
    queryFn: () => fetchCoinGrants(normalized),
  })
}

/* =============================== 변경 =============================== */

/**
 * API-coin-03 표시 환율 등록(M-03). append-only이며 부분 실패 없이 전량 롤백된다.
 * 등록 성공 시 서버가 조회 캐시를 무효화하므로(`cacheInvalidated`) 클라이언트도 함께 비운다.
 */
export function useRegisterExchangeRates(): UseMutationResult<
  ExchangeRateRegisterResult,
  ApiError,
  ExchangeRateRegisterRequest
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ExchangeRateRegisterRequest) => registerExchangeRates(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.coin.rates() })
    },
  })
}

export interface GrantCoinVariables {
  body: CoinGrantRequest
  /**
   * §0.8 **필수**. 훅이 만들지 않는다 — 이 UUID의 해시가 온체인 `YoYo.mint`의 `grantRef`가 되고,
   * **같은 키 재호출은 최초 jobId를 재생한다.** 재시도 때 새 키를 쓰면 두 번 발행된다.
   */
  idempotencyKey: string
}

/**
 * API-coin-07 시연용 코인 지급(M-03) → **202 + jobId**(tx_type=MINT, signer_type=OPERATOR).
 *
 * 접수일 뿐 발행 완료가 아니다 — 확정은 `GET /chain/jobs/{jobId}` 폴링이 판단하고,
 * 확정 후 무효화는 `invalidatedBy('MINT')`가 잔액·공시·이력을 함께 깨운다.
 *
 * 여기서 지급 이력만 미리 깨우는 이유 — coin_08의 원본이 `chain_job`이라 **접수 즉시 PENDING 행이
 * 목록에 생긴다.** 확정을 기다리면 관리자 화면에 "아무 일도 안 일어난 것처럼" 보인다.
 * 반대로 `coin.supply`는 확정 전까지 숫자가 바뀌지 않으므로 여기서 건드리지 않는다.
 */
export function useGrantCoin(): UseMutationResult<ChainJobAccepted, ApiError, GrantCoinVariables> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: GrantCoinVariables) => grantCoin(variables),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COIN_GRANTS_PREFIX })
    },
  })
}
