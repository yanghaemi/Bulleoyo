package com.ssafy.b204.settlement.event;

import com.ssafy.b204.settlement.entity.Settlement;

/**
 * 정산 상태가 <b>확정 반영으로</b> 바뀌었다 — 대사가 다시 돌아야 한다는 신호.
 *
 * <p>{@code coin}의 발행량 대사(불변식 3)는 {@code RELEASED} 정산과 그 {@code settlement_share}를
 * 읽는다. 그 입력이 바뀌는 순간은 {@code AGGREGATE}·{@code RELEASE} job의 확정 반영뿐이므로,
 * 그때 이 이벤트를 던져 대사 스냅샷을 즉시 다시 만들게 한다. 없으면 release 게이트가 최대
 * 한 주기(30초) 동안 이전 판정을 쓴다.
 *
 * <h2>왜 {@code SupplyReconciler}를 직접 부르지 않나</h2>
 *
 * <p>부르면 {@code settlement → coin} 컴파일 의존이 생긴다. 지금은 반대 방향(coin이 정산을 읽는)
 * 의존만 있고, 양방향이 되면 두 도메인을 따로 옮길 수 없다. 이벤트는 발행자가 구독자를 모르므로
 * 방향이 하나로 유지된다 — 구독자가 없어도(예: coin 없이 settlement만 띄우는 테스트) 아무 일도
 * 일어나지 않는다.
 *
 * <p>구독은 {@code @TransactionalEventListener(AFTER_COMMIT)}로 받는다. 커밋 전에 다시 대사하면
 * 아직 보이지 않는 상태를 읽어 방금 바꾼 것을 놓친다.
 *
 * @param performanceId 상태가 바뀐 정산의 공연
 * @param status        반영된 뒤의 상태
 */
public record SettlementStateChangedEvent(Long performanceId, Settlement.Status status) {
}
