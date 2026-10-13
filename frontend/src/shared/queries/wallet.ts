/**
 * wallet 쿼리·뮤테이션 훅 (API v6 §3).
 *
 * ───────────────────────────── 무효화 원칙 ─────────────────────────────
 * 지갑 잔액은 **거의 모든 tx가 바꾼다.** 그 갱신은 화면이 아니라 `invalidatedBy(txType)`가
 * 책임진다 — `useChainJob`이 `CONFIRMED`에서 `qk.wallet.me()`·`qk.wallet.transactions()`를
 * 항상 무효화하므로, 결제·환불·정산 화면은 잔액 갱신을 따로 신경 쓸 필요가 없다(keys.ts).
 * 여기서 직접 무효화하는 것은 **지갑 등록**(wallet_04) 하나다. 등록은 tx 확정 전에 이미
 * `wallet` 레코드를 만들고 `member_05`의 `wallet`도 `null`이 아니게 만든다.
 *
 * ─────────────────────────── 404는 오류가 아니다 ───────────────────────────
 * `WALLET_NOT_FOUND`(404)는 "아직 등록 전"이라는 정상 상태다. 훅은 이 코드를 삼키지 않고
 * 그대로 넘긴다 — 화면이 `isWalletNotFound(error)`로 판별해 C-05(`/onboarding/wallet`)로
 * 보낸다. 삼켜서 `data: null`로 만들면 "지갑이 없다"와 "아직 안 불렀다"가 구분되지 않는다.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { tokenStore } from '@/shared/api/client'
import {
  getMyWallet,
  getMyWalletTransactions,
  linkWallet,
  normalizeWalletTxQuery,
  requestWalletChallenge,
  type NormalizedWalletTxQuery,
  type WalletChallengeRequest,
  type WalletLinkRequest,
  type WalletTxQuery,
} from '@/shared/api/domains/wallet'
import { LIVE_STALE_MS } from '@/shared/queries/freshness'
import { qk } from '@/shared/queries/keys'

export type {
  WalletView,
  WalletTransactionView,
  WalletTransactionPageView,
  WalletChallengeView,
  WalletLinkResultView,
  WalletTxQuery,
  WalletTxType,
  WalletTxStatus,
  WalletTxSort,
} from '@/shared/api/domains/wallet'
export {
  WalletCode,
  isWalletNotFound,
  normalizeWalletTxQuery,
  WALLET_TX_DEFAULT_SIZE,
  WALLET_TX_DEFAULT_SORT,
} from '@/shared/api/domains/wallet'

/* ============================== 조회 ============================== */

/** 프리페치·`useQueries`용 정의. */
export function myWalletQuery() {
  return queryOptions({
    queryKey: qk.wallet.me(),
    queryFn: ({ signal }) => getMyWallet({ signal }),
    // 정산 지급·환불처럼 남의 tx로도 잔액이 바뀐다. 창 복귀 때 다시 받도록 짧게 둔다(freshness.ts)
    staleTime: LIVE_STALE_MS,
  })
}

/**
 * API-wallet-01 · 내 지갑 (A-13·P-02·C-03).
 *
 * 응답의 `pendingGrantJobId`가 채워져 있으면 기본 지급이 아직 확정 전이다 —
 * 그 값을 `useChainJob`에 넘기면 확정 시 이 쿼리가 자동으로 무효화된다(MINT → wallet).
 */
export function useMyWallet(options: { enabled?: boolean; staleTime?: number } = {}) {
  const { enabled, staleTime } = options
  return useQuery({
    ...myWalletQuery(),
    enabled: enabled ?? tokenStore.hasSession(),
    // staleTime을 undefined로 명시하면 정의의 LIVE_STALE_MS를 덮어쓴다. 있을 때만 넘긴다
    ...(staleTime !== undefined && { staleTime }),
  })
}

/** 프리페치용. 파라미터는 **정규화된 값**만 받는다 — 키와 요청이 같은 값을 써야 한다. */
export function myWalletTransactionsQuery(params: NormalizedWalletTxQuery) {
  return queryOptions({
    queryKey: qk.wallet.transactions(params),
    queryFn: ({ signal }) => getMyWalletTransactions(params, { signal }),
    staleTime: LIVE_STALE_MS,
  })
}

/**
 * API-wallet-02 · 내 지갑 거래 이력 (A-13).
 *
 * 호출부는 원하는 필터만 넘기고(`{ type: 'PURCHASE' }`), 정규화는 훅이 한다. 그래야
 * `{page:0,size:20}`과 `{}`가 서로 다른 캐시 항목이 되는 사고가 나지 않는다(keys.ts 주의).
 * 페이지를 넘길 때 목록이 비었다 다시 차는 깜빡임을 막으려면 호출부에서 `placeholderData`를
 * 쓰지 말고 `pageInfo.hasNext`로 "더 보기"를 붙인다(화면설계 A-13).
 */
export function useMyWalletTransactions(
  params: WalletTxQuery = {},
  options: { enabled?: boolean } = {},
) {
  const normalized = normalizeWalletTxQuery(params)
  return useQuery({
    ...myWalletTransactionsQuery(normalized),
    enabled: options.enabled ?? tokenStore.hasSession(),
  })
}

/* ============================== 등록 ============================== */

/**
 * API-wallet-03 · 외부 지갑 소유 증명 챌린지 발급 (C-05).
 *
 * 응답 `message`는 **한 글자도 바꾸지 않고** 지갑에 넘겨 `personal_sign` 서명을 받는다.
 * 5분·1회용이고 재호출하면 이전 챌린지가 무효가 되므로, 서명 팝업을 띄우기 **직전**에 부른다.
 * 회원당 10회/분 제한이라 429면 `error.retryAfterSeconds`(초)를 안내한다(§0.9).
 *
 * 캐시하지 않는다 — 1회용 난수를 캐시하면 만료된 nonce로 서명해 409가 난다. 그래서 쿼리가
 * 아니라 뮤테이션이다.
 */
export function useWalletChallenge() {
  return useMutation({
    mutationFn: (body: WalletChallengeRequest) => requestWalletChallenge(body),
  })
}

/**
 * API-wallet-04 · 지갑 등록(회원당 첫 1회) (C-05).
 *
 * 202다. 응답의 `grantJobId`를 `useChainJob`으로 폴링해 기본 지급 100,000 YoYo가 확정되면
 * "Welcome — your balance is 100,000 YoYo"을 확정 표시한다. **지급이 실패해도 지갑 등록은
 * 성공으로 남는다** — 화면은 등록 완료로 진행시키고 잔액만 0으로 보여준다(관리자 재지급 경로).
 *
 * 성공 즉시 무효화하는 대상 —
 *   · `qk.wallet.all`  : 이제 `GET /wallets/me`가 404가 아니다
 *   · `qk.member.me()` : `wallet`이 null에서 객체로 바뀌고 `walletLinkRequired`가 false가 된다
 * 잔액 자체는 MINT 확정 시 `invalidatedBy('MINT')`가 다시 무효화한다 — 중복이 아니라 순서다.
 */
export function useLinkWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: WalletLinkRequest) => linkWallet(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.wallet.all })
      void queryClient.invalidateQueries({ queryKey: qk.member.me() })
    },
  })
}
