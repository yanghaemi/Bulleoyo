package com.ssafy.b204.settlement.service;

/**
 * release 중단 플래그 — 발행량 대사(불변식 1·4)가 깨졌을 때 정산 실행을 막는다.
 *
 * <p>판정 주체는 {@code coin} 도메인의 {@code SupplyReconciler}({@code releaseHalted})다. 그쪽은
 * 별도 브랜치(`feat/be/coin`)에 있고 이 브랜치에는 스켈레톤만 있어서, settlement가
 * <b>인터페이스로만 의존</b>하고 기본 구현({@link AllowReleaseHaltGuard})은 통과시킨다.
 *
 * <p>두 브랜치가 합쳐지면 {@code SupplyReconciler}가 이 인터페이스를 구현하면 되고
 * ({@code @ConditionalOnMissingBean}이라 자동으로 우선한다) settlement 코드는 바뀌지 않는다.
 * 게이트 자체(409 {@code COIN_RESERVE_MISMATCH})는 지금 코드에 이미 있고 테스트로 고정돼 있다.
 */
public interface ReleaseHaltGuard {

    /**
     * @return {@code true}면 발행량 대사가 깨져 release를 중단해야 한다
     */
    boolean isReleaseHalted();
}
