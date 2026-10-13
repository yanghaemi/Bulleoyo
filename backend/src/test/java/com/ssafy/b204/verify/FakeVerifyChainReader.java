package com.ssafy.b204.verify;

import com.ssafy.b204.verify.service.VerifyChainReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * 테스트용 온체인 값 — Kairos를 부르지 않는다.
 *
 * <p>API-verify-01의 판정은 전부 "체인이 뭐라고 하는가"에 걸려 있으므로, 그 답을 <b>테스트가 정할 수
 * 있어야</b> 노드 장애·해시 불일치·부분 조회 실패를 재현할 수 있다
 * ({@code settlement.FakeSettlementChainReader}와 같은 패턴).
 */
public class FakeVerifyChainReader implements VerifyChainReader {

    public boolean available = true;
    public Long escrow;
    public Long deposit = 0L;
    public long[] counts;
    public long[] payouts;
    public String rulesHash;
    public Integer hostTeamIndex = 0;
    public List<String> teamWallets;

    /** 지갑별 동의 여부. 값이 없으면 {@link #agreedDefault}를 쓴다. */
    public final Map<String, Boolean> agreed = new HashMap<>();

    /** {@code null}이면 "읽지 못했다"({@link Optional#empty()}) — 문서가 stale 로 내려가야 한다. */
    public Boolean agreedDefault = Boolean.TRUE;

    public void reset() {
        available = true;
        escrow = null;
        deposit = 0L;
        counts = null;
        payouts = null;
        rulesHash = null;
        hostTeamIndex = 0;
        teamWallets = null;
        agreed.clear();
        agreedDefault = Boolean.TRUE;
    }

    @Override
    public boolean isAvailable() {
        return available;
    }

    @Override
    public Optional<Long> escrowOf(long showId) {
        return available ? Optional.ofNullable(escrow) : Optional.empty();
    }

    @Override
    public Optional<Long> depositOf(long showId) {
        return available ? Optional.ofNullable(deposit) : Optional.empty();
    }

    @Override
    public Optional<long[]> choiceCountsOf(long showId) {
        return available ? Optional.ofNullable(counts) : Optional.empty();
    }

    @Override
    public Optional<long[]> payoutsOf(long showId) {
        return available ? Optional.ofNullable(payouts) : Optional.empty();
    }

    @Override
    public Optional<String> rulesHashOf(long showId) {
        return available ? Optional.ofNullable(rulesHash) : Optional.empty();
    }

    @Override
    public Optional<Boolean> agreedOf(long showId, String wallet) {
        if (!available || wallet == null) {
            return Optional.empty();
        }
        Boolean value = agreed.getOrDefault(wallet.toLowerCase(Locale.ROOT), agreedDefault);
        return Optional.ofNullable(value);
    }

    @Override
    public Optional<List<String>> teamWalletsOf(long showId) {
        return available ? Optional.ofNullable(teamWallets).map(ArrayList::new).map(List::copyOf)
                : Optional.empty();
    }

    @Override
    public Optional<Integer> hostTeamIndexOf(long showId) {
        return available ? Optional.ofNullable(hostTeamIndex) : Optional.empty();
    }
}
