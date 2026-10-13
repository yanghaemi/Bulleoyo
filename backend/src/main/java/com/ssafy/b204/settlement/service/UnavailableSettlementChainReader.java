package com.ssafy.b204.settlement.service;

import java.util.Optional;

/**
 * 체인 설정이 없을 때 쓰이는 {@link SettlementChainReader} — 언제나 "못 읽었다"를 돌려준다.
 *
 * <p>No-op이 아니라 <b>명시적 부재</b>다. 게이트가 {@link Optional#empty()}를 "대사 불가"로 읽으므로
 * 집계 확정·release는 막히고, 조회(GET)만 DB 값으로 돌아간다. 체인 없이 조용히 통과시키는 경로를
 * 만들지 않는 것이 이 클래스의 존재 이유다.
 */
public class UnavailableSettlementChainReader implements SettlementChainReader {

    @Override
    public boolean isAvailable() {
        return false;
    }

    @Override
    public Optional<Long> escrowOf(long showId) {
        return Optional.empty();
    }

    @Override
    public Optional<Long> depositOf(long showId) {
        return Optional.empty();
    }

    @Override
    public Optional<long[]> choiceCountsOf(long showId) {
        return Optional.empty();
    }

    @Override
    public Optional<long[]> payoutsOf(long showId) {
        return Optional.empty();
    }

    @Override
    public Optional<Integer> stageOf(long showId) {
        return Optional.empty();
    }
}
