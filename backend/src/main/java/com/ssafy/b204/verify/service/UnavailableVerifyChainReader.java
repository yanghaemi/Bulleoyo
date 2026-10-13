package com.ssafy.b204.verify.service;

import java.util.List;
import java.util.Optional;

/**
 * 체인 설정이 없을 때 쓰이는 {@link VerifyChainReader} — 언제나 "못 읽었다"를 돌려준다.
 *
 * <p>No-op이 아니라 <b>명시적 부재</b>다. 검증 API는 온체인 값을 DB 사본으로 대신하지 않으므로,
 * 이 구현이 들어간 환경(키·주소 없는 팀원 로컬)에서 API-verify-01은 캐시가 없으면 502로 끝난다.
 * 그것이 옳은 결과다 — 검증할 수 없는데 검증됐다고 답하는 경로를 만들지 않는 것이 이 클래스의
 * 존재 이유다.
 */
public class UnavailableVerifyChainReader implements VerifyChainReader {

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
    public Optional<String> rulesHashOf(long showId) {
        return Optional.empty();
    }

    @Override
    public Optional<Boolean> agreedOf(long showId, String wallet) {
        return Optional.empty();
    }

    @Override
    public Optional<List<String>> teamWalletsOf(long showId) {
        return Optional.empty();
    }

    @Override
    public Optional<Integer> hostTeamIndexOf(long showId) {
        return Optional.empty();
    }
}
