package com.ssafy.b204.settlement.service;

/**
 * {@code coin}의 {@code SupplyReconciler}가 없을 때 쓰는 기본 구현 — 막지 않는다.
 *
 * <p>"막지 않는다"가 안전한 기본값인 이유: 이 브랜치에는 발행량 대사를 계산할 수단 자체가 없고,
 * 계산하지 않은 값으로 release를 막으면 <b>영구 차단</b>이 된다(해제할 근거를 만들 수 없다).
 * 대사의 진짜 방어선은 coin 도메인이며, 여기서는 <b>게이트가 존재한다는 사실</b>만 고정한다.
 */
public class AllowReleaseHaltGuard implements ReleaseHaltGuard {

    @Override
    public boolean isReleaseHalted() {
        return false;
    }
}
