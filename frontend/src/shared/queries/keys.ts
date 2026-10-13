/**
 * TanStack Query 키 정본.
 *
 * 정본 문서: `docs/design/06_API_명세서_v6.md` · `docs/design/01_API_공통_응답_규격.md §1`
 *
 * ─────────────────────────── 이 파일이 존재하는 이유 ───────────────────────────
 * 키를 호출부에서 인라인 배열(`['tickets', id]`)로 쓰면 **무효화가 조용히 빗나간다.**
 * 결제가 확정되면 티켓·주문·지갑 잔액·공연 판매현황이 한꺼번에 갱신돼야 하는데,
 * 한 곳이 `['ticket', id]`(단수)로 써 두면 그 화면만 옛 데이터를 계속 보여준다.
 * 화면은 멀쩡해 보이고 숫자만 틀리기 때문에 테스트로도 늦게 잡힌다.
 * 그래서 키는 **여기서만** 만든다.
 *
 * ──────────────────────────────── 키 설계 ────────────────────────────────
 * 계층은 `[도메인, 스코프, ...식별자]` 순이고 접두 일치로 무효화된다.
 *
 *   qk.ticket.all          -> ['ticket']                 도메인 전체
 *   qk.ticket.lists()      -> ['ticket', 'list']         목록 전체
 *   qk.ticket.list(q)      -> ['ticket', 'list', q]      특정 조건 목록
 *   qk.ticket.detail(id)   -> ['ticket', 'detail', 5501] 단건
 *
 * `invalidateQueries({ queryKey: qk.ticket.lists() })`는 조건이 다른 목록까지 전부 잡는다.
 * 반대로 `qk.ticket.detail(id)`는 그 한 건만 건드린다.
 *
 * ⚠ 페이지네이션·필터 객체를 키에 넣을 때 **키 순서가 다르면 다른 키가 된다.**
 *   `{page:0, size:20}`과 `{size:20, page:0}`은 TanStack Query에서 같은 키로 취급되지만
 *   (v5는 객체를 안정 직렬화한다), `undefined` 필드가 있고 없고는 다르게 잡힌다.
 *   그래서 목록 파라미터는 호출부에서 만들지 말고 각 도메인 훅이 정규화한 뒤 넘긴다.
 *
 * ────────────────────────── 온체인 작업(chain_job) ──────────────────────────
 * 비동기 tx는 `GET /chain/jobs/{jobId}` 하나로 폴링한다(§0.3). 폴링 키는 job 단위이고,
 * `CONFIRMED`가 되면 **그 tx가 바꾼 도메인들**을 무효화한다. 어떤 도메인을 깨워야 하는지는
 * 화면이 아니라 `txType`이 안다 — `invalidatedBy(txType)`가 그 매핑이다.
 */

import type { ChainTxType } from '@/shared/api/types'

/**
 * 키 배열을 `as const`로 고정해 오타가 타입에서 잡히게 한다.
 *
 * ⚠ **파라미터를 받는 키에는 반드시 짝이 되는 접두 헬퍼가 있어야 한다.**
 *   `list(params)`는 `['x','list',{…}]`이고 `list()`는 `['x','list',null]`이라,
 *   `list()`로는 파라미터가 있는 목록을 **무효화하지 못한다**(접두가 아니라 형제다).
 *   그래서 접두 전용 `lists()`를 따로 둔다. 아래 `mine`/`mines`, `grants`/`grantsAll` 도 같은 이유다.
 */
const scope = <D extends string>(domain: D) => ({
  all: [domain] as const,
  lists: () => [domain, 'list'] as const,
  list: (params?: unknown) => [domain, 'list', params ?? null] as const,
  details: () => [domain, 'detail'] as const,
  detail: (id: string | number) => [domain, 'detail', id] as const,
  /** `mine(params)` 전체를 덮는 접두. 무효화는 이걸 쓴다. */
  mines: () => [domain, 'mine'] as const,
  mine: (params?: unknown) => [domain, 'mine', params ?? null] as const,
})

export const qk = {
  member: {
    ...scope('member'),
    /** `GET /members/me` — 로그인 사용자. 로그아웃 시 반드시 제거한다. */
    me: () => ['member', 'me'] as const,
  },
  team: {
    ...scope('team'),
    // `GET /teams/me`(team_02)는 단건이 아니라 **페이지네이션 목록**이다("내 팀 목록").
    // 단건 키에 담으면 페이지마다 서로 덮어쓴다 — `mine(params)`/`mines()`를 쓴다.
  },
  wallet: {
    ...scope('wallet'),
    /** `GET /wallets/me` — 주소·잔액 단건. 결제·환불·지급 확정마다 무효화된다. */
    me: () => ['wallet', 'me'] as const,
    /** `GET /wallets/me/transactions` 전체를 덮는 접두. */
    transactionsAll: () => ['wallet', 'transactions'] as const,
    transactions: (params?: unknown) => ['wallet', 'transactions', params ?? null] as const,
  },
  performance: {
    ...scope('performance'),
    /** `GET /performances/me` — 내가 주최·참여한 공연 (목록). */
    mineAllPages: () => ['performance', 'mine', 'all-pages'] as const,
    ticketTypes: (performanceId: number) =>
      ['performance', 'detail', performanceId, 'ticket-types'] as const,
    participants: (performanceId: number) =>
      ['performance', 'detail', performanceId, 'participants'] as const,
    /** `GET /performances/{id}/sales` — 판매 현황. 결제·환불 확정마다 무효화된다. */
    sales: (performanceId: number) => ['performance', 'detail', performanceId, 'sales'] as const,
    entryLink: (performanceId: number) =>
      ['performance', 'detail', performanceId, 'entry-link'] as const,
  },
  rule: {
    ...scope('rule'),
    /** `GET /performances/{id}/rules` — 정산 규칙과 동의 현황. */
    byPerformance: (performanceId: number, teamId?: number) =>
      teamId === undefined
        ? (['rule', 'performance', performanceId] as const)
        : (['rule', 'performance', performanceId, 'team', teamId] as const),
  },
  ticket: {
    ...scope('ticket'),
    /** 상태별 내 티켓 전체 페이지. `mines()` 무효화 범위 안에 둔다. */
    allMine: (params?: unknown) => ['ticket', 'mine', 'all', params ?? null] as const,
    /** `GET /tickets/{id}/qr` — 입장 QR. 만료가 짧아 staleTime을 따로 준다. */
    qr: (ticketId: number) => ['ticket', 'detail', ticketId, 'qr'] as const,
    /** `GET /tickets/{id}/refund-quote` — 환불 미리보기. */
    refundQuote: (ticketId: number) => ['ticket', 'detail', ticketId, 'refund-quote'] as const,
  },
  order: {
    ...scope('order'),
    /** 주문의 결제 상태. 주문 상세와 별개 자원이지만 접두를 order로 두어 함께 무효화된다. */
    payment: (orderId: number) => ['order', 'detail', orderId, 'payment'] as const,
  },
  coin: {
    ...scope('coin'),
    /** `GET /coin/supply` — 공시. 지급·소각 확정마다 무효화된다. */
    supply: () => ['coin', 'supply'] as const,
    rates: () => ['coin', 'rates'] as const,
    config: () => ['coin', 'config'] as const,
    /** `GET /admin/coin/grants` 전체를 덮는 접두. */
    grantsAll: () => ['coin', 'grants'] as const,
    grants: (params?: unknown) => ['coin', 'grants', params ?? null] as const,
  },
  entry: {
    ...scope('entry'),
    /** 한 공연의 입장 현황 전체를 덮는 접두. */
    byPerformanceAll: (performanceId: number) => ['entry', 'performance', performanceId] as const,
    /** `GET /performances/{id}/entries` — 입장 현황. */
    byPerformance: (performanceId: number, params?: unknown) =>
      ['entry', 'performance', performanceId, params ?? null] as const,
  },
  settlement: {
    ...scope('settlement'),
    byPerformance: (performanceId: number) => ['settlement', 'performance', performanceId] as const,
    disputes: (performanceId: number) =>
      ['settlement', 'performance', performanceId, 'disputes'] as const,
    shareLink: (performanceId: number) =>
      ['settlement', 'performance', performanceId, 'share-link'] as const,
    /** `GET /public/settlement/{shareToken}` — 비로그인 공개 조회. 인증 키와 섞지 않는다. */
    publicShare: (shareToken: string) => ['settlement', 'public', shareToken] as const,
  },
  verify: {
    ...scope('verify'),
    /** `GET /performances/{id}/verification` — 불변식 검증. */
    byPerformance: (performanceId: number) => ['verify', 'performance', performanceId] as const,
  },
  admin: {
    ...scope('admin'),
    /** `GET /admin/disputes` 전체를 덮는 접두. */
    disputesAll: () => ['admin', 'disputes'] as const,
    disputes: (params?: unknown) => ['admin', 'disputes', params ?? null] as const,
  },
  recommendation: {
    ...scope('recommendation'),
    /**
     * `GET /recommendations/performances` — A-01 섹션 ④(API-recommendation-01).
     * 파라미터가 없고 회원마다 결과가 다르다. 로그아웃 시 캐시를 통째로 비우므로
     * 회원 식별자를 키에 넣지 않는다(`useLogout`이 `queryClient.clear()`를 한다).
     */
    performances: () => ['recommendation', 'performances'] as const,
  },
  chain: {
    ...scope('chain'),
    /** `GET /chain/jobs/{jobId}` — 비동기 tx 폴링(§0.3). */
    job: (jobId: string) => ['chain', 'job', jobId] as const,
  },
} as const

/**
 * `chain_job`이 `CONFIRMED`된 뒤 무효화할 쿼리 키 접두들.
 *
 * 화면마다 "결제가 끝났으니 뭘 다시 불러야 하지"를 각자 판단하면 반드시 빠뜨린다.
 * 특히 **지갑 잔액**은 거의 모든 tx가 바꾸는데 화면에서는 잘 잊힌다.
 * 그래서 판단 주체를 `txType` 하나로 모은다.
 *
 * 반환은 접두 배열이고, 호출부는 그대로 `invalidateQueries({ queryKey })`에 넘긴다.
 */
export function invalidatedBy(txType: ChainTxType): readonly (readonly unknown[])[] {
  // 잔액은 어떤 tx든 움직인다. 예외를 두지 않는다.
  // 거래내역은 파라미터가 붙은 키까지 덮어야 하므로 접두형(`transactionsAll`)을 쓴다.
  const wallet = [qk.wallet.me(), qk.wallet.transactionsAll()] as const
  // 코인이 실제로 움직이는 tx는 지갑 화면 밖의 **잔액 사본**도 바꾼다 —
  // member_05 `wallet.balance`(헤더·가드)와 team_02 `balanceAmount`(스튜디오 홈 팀 카드).
  // 둘을 빼면 A-13은 맞는데 스튜디오 홈 팀 잔액만 정산 전 값으로 남는다(9/23 감사).
  const balance = [...wallet, qk.member.me(), qk.team.lists()] as const
  // 공시(coin_01)의 escrowTotal·walletTotal. 에스크로·보증금·지갑 사이로 코인이 옮겨 가면 바뀐다.
  const supply = qk.coin.supply()

  switch (txType) {
    case 'MINT':
      // 시연용 지급. 공시 총량이 함께 움직인다.
      return [...balance, supply, qk.coin.grantsAll()]
    case 'APPROVE':
      // allowance만 바뀐다. 잔액은 그대로지만 다음 prepare가 required를 다시 계산한다.
      // 결제 상태(payment_02)는 스스로 pollAfterMs로 돌고, 서명 흐름 안쪽은
      // `useInvalidateOnPaymentConfirmed`가 결제 상태 키를 따로 깨운다.
      return [...wallet]
    case 'PURCHASE':
    case 'REFUND':
      // 표와 돈이 동시에 움직인다 — 티켓·주문·판매현황(`details()` 아래)·정산 집계·검증.
      // 환불은 그 주문 표를 통째로 뺀다(금액과 무관). 검증 화면의 환불 건수·금액도 바뀐다.
      // 공개 목록(performance_02)의 `soldOut`이 잔여 수량을 따라 바뀌고, 공시 escrowTotal도 움직인다.
      return [
        ...balance,
        qk.ticket.all,
        qk.order.all,
        qk.performance.details(),
        qk.performance.lists(),
        qk.settlement.all,
        qk.verify.all,
        supply,
      ]
    case 'DEPOSIT':
    case 'DEPOSIT_RETURN':
    case 'DEPOSIT_FORFEIT':
      // 보증금 상태는 rule_02(P-06)도 싣는다 — `depositStatus`·`startSaleAvailable`·
      // `startSaleBlockedReason`. 규칙 캐시를 두면 납부 직후 P-06이 "보증금 미납"·판매 시작
      // 비활성을 staleTime(30초) 동안 그대로 보여 새로고침해야 풀렸다(9/23 dev).
      // 검증(verify_01 `depositReconciliation`)과 공시(escrowTotal에 보증금 합 포함)도 바뀐다.
      return [
        ...balance,
        qk.rule.all,
        qk.performance.details(),
        qk.performance.mines(),
        qk.settlement.all,
        qk.verify.all,
        supply,
      ]
    case 'AGREE':
      // 규칙 동의. 동의 현황이 바뀌면 판매 시작 가능 여부가 따라 바뀐다.
      // 검증 화면(verify_01 `agreements[].onchainAgreed`)도 이 tx를 싣는다.
      return [
        ...wallet,
        qk.rule.all,
        qk.performance.details(),
        qk.performance.mines(),
        qk.verify.all,
      ]
    case 'CREATE_SHOW':
      // 온체인 공연 등록. 목록과 상세가 함께 생긴다. 등록은 판매 시작·보증금·동의의 선행 job이라
      // rule_02 의 `startSaleBlockedReason`도 이 확정으로 풀린다.
      return [...wallet, qk.performance.all, qk.rule.all]
    case 'UPDATE_RULES':
      // 온체인 규칙 갱신(OPERATOR 서명이라 사용자 잔액은 그대로다). 확정되면 DB·온체인 해시가
      // 다시 맞아 rule_02 의 startSaleBlockedReason(RULE_SYNC_IN_PROGRESS)이 풀린다.
      return [qk.rule.all, qk.performance.details()]
    case 'START_SALE':
      // 판매 개시 → 공연이 ON_SALE. 목록의 상태 배지까지 바뀐다.
      //
      // ⚠ 이것을 `LOCK`으로 처리하면 안 된다. 종전엔 LOCK이 판매 시작과 정산 잠금 겸용이라
      //   확정 분기가 항상 판매 시작으로 해석돼 **정산 잠금 job이 진행되지 않는 버그**가 있었다
      //   (§0.3 [2026-09-09 — S15P21B204-67]에서 분리).
      // 규칙이 잠기므로 검증(verify_01 `lockedRule`)도 바뀐다.
      return [...wallet, qk.performance.all, qk.rule.all, qk.verify.all]
    case 'LOCK':
    case 'AGGREGATE':
      return [
        ...wallet,
        qk.settlement.all,
        qk.verify.all,
        qk.performance.details(),
        qk.performance.mines(),
      ]
    case 'RELEASE':
      // 에스크로 → 팀 리더 지갑. 수령 리더의 팀 카드 잔액과 공시 대사가 함께 바뀐다.
      return [
        ...balance,
        qk.settlement.all,
        qk.verify.all,
        qk.performance.details(),
        qk.performance.mines(),
        supply,
      ]
    case 'HALT':
      // 지급 중단은 공시와 관리자 화면을 동시에 바꾼다. 정산은 HALTED(종단)가 되고 공연은
      // CANCELLED로 간다 — 정산·검증·공연 목록·상세·대시보드가 모두 그 상태를 싣는다(§11 [v6]).
      return [
        ...wallet,
        qk.coin.all,
        qk.admin.all,
        qk.settlement.all,
        qk.verify.all,
        qk.performance.all,
      ]
  }
}
