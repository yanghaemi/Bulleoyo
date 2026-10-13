package com.ssafy.b204.settlement.event;

import com.ssafy.b204.chain.entity.ChainJob;
import java.util.List;

/**
 * 정산 tx가 확정되어 <b>코인이 실제로 팀 지갑에 들어갔다</b> — 그 지갑들의 잔액 캐시를 다시
 * 읽으라는 신호.
 *
 * <h2>왜 이 이벤트가 필요한가 — 2026-09-10 리허설 실측(D-44)</h2>
 *
 * <p>Kairos 0층 세로축에서 {@code release}(50,000)와 보증금 반환(50,000)이 리더 지갑에 들어갔는데
 * 공시 {@code walletTotal}은 200,000이었다(실제 300,000). 불변식 4가
 * {@code difference 100000 is held by unregistered}로 표시했다 — 미등록 주소 보유가 아니라
 * <b>캐시가 낡은 것</b>이었다.
 *
 * <p><b>[2026-09-15 — S15P21B204-88]</b> 대사는 이제 이 캐시를 읽지 않고 노드 {@code balanceOf}를 직접
 * 합산하므로 공시 {@code walletTotal}은 이 이벤트와 무관하다. 위 실측은 이 이벤트가 생긴 계기이고,
 * 지금 이 이벤트가 지키는 것은 <b>지갑 화면(A-13)</b>의 잔액 캐시다.
 *
 * <p>원인은 갱신 시점 ②(API v6 §0.12 — "지갑이 관여한 {@code chain_job} 확정 시 발신·수신 모두
 * 갱신")를 워커가 {@code job.getWalletId()} <b>하나</b>로만 수행한다는 데 있다.
 * {@code RELEASE}·{@code DEPOSIT_RETURN}은 운영자 tx라 발신 지갑이 OPERATOR고 수령 지갑은
 * N개(팀 리더들)이므로 {@code chain_job.wallet_id}에 담을 수가 없다. 그 결과 수령 지갑 캐시는
 * 다음 API-wallet-01 조회 때까지 갱신되지 않고, 그 사이 V-02 공시 화면이 낮은 합계를 보여준다.
 *
 * <p>근본 해법은 워커가 job 유형별 수령 지갑 목록을 알아내 갱신하는 것(이강륜 영역)이고, 이
 * 이벤트는 <b>정산이 아는 수령 지갑을 정산이 직접 갱신하는</b> 쪽이다. 둘이 겹쳐도 해롭지 않다 —
 * 갱신은 노드에서 다시 읽는 멱등 연산이다.
 *
 * <h2>왜 {@link SettlementStateChangedEvent}에 얹지 않았나</h2>
 *
 * <p>그쪽은 "대사를 다시 돌려라"는 신호이고 구독자가 {@code coin}의 {@code SupplyReconciler}다.
 * 수령 지갑 목록을 그 record에 넣으면 대사와 무관한 필드를 대사 구독자가 보게 되고,
 * {@code DEPOSIT_RETURN}은 애초에 그 이벤트를 발행하지 않는다(정산 상태가 바뀌지 않으므로).
 * 관심사가 다르면 이벤트도 다르다.
 *
 * <p>구독은 {@code @TransactionalEventListener(AFTER_COMMIT)}로 받는다 — 이유는
 * {@code SettlementBalanceRefreshListener} javadoc.
 *
 * @param performanceId      확정된 tx의 공연
 * @param txType             {@code RELEASE} 또는 {@code DEPOSIT_RETURN}. 로그 식별용
 * @param recipientAddresses 코인을 받은 지갑 주소(체크섬 표기일 수 있다). 빈 목록이면 아무 일도 없다
 */
public record SettlementPayoutConfirmedEvent(Long performanceId, ChainJob.TxType txType,
                                             List<String> recipientAddresses) {

    public SettlementPayoutConfirmedEvent {
        recipientAddresses = recipientAddresses == null ? List.of() : List.copyOf(recipientAddresses);
    }
}
