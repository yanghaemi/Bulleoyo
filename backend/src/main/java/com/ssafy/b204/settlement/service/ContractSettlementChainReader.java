package com.ssafy.b204.settlement.service;

import com.ssafy.b204.chain.contract.RevenueSplitter;
import com.ssafy.b204.common.config.ChainProperties;
import java.math.BigInteger;
import java.util.List;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.web3j.protocol.Web3j;
import org.web3j.tx.ReadonlyTransactionManager;
import org.web3j.tx.gas.DefaultGasProvider;

/**
 * {@link SettlementChainReader}의 실제 구현 — {@code RevenueSplitter} view 호출.
 *
 * <p><b>키가 없어도 만들어진다.</b> {@link ReadonlyTransactionManager}는 서명하지 않으므로
 * {@code eth_call}만 쓰는 이 클래스에는 OPERATOR·MINTER 개인키가 필요 없다. 컨트랙트 주소와
 * RPC만 있으면 된다(README §9.3 — 키 없는 팀원의 로컬에서도 공시·대사가 돌아야 한다).
 *
 * <p>모든 조회는 실패를 삼켜 {@link Optional#empty()}로 돌린다. 던지면 정산 조회(GET)가 체인 장애로
 * 500이 되는데, 조회는 DB만으로도 의미가 있고 <b>게이트는 empty를 "대사 불가"로 읽어 어차피 막는다.</b>
 */
@Slf4j
public class ContractSettlementChainReader implements SettlementChainReader {

    /** view 호출에서 발신자 주소는 쓰이지 않는다. 서명도 하지 않으므로 0 주소로 둔다. */
    private static final String CALLER = "0x0000000000000000000000000000000000000000";

    private final RevenueSplitter splitter;

    public ContractSettlementChainReader(Web3j web3j, ChainProperties chainProperties) {
        this.splitter = RevenueSplitter.load(
                chainProperties.contract().splitterAddress(),
                web3j,
                new ReadonlyTransactionManager(web3j, CALLER),
                new DefaultGasProvider());
    }

    @Override
    public boolean isAvailable() {
        return true;
    }

    @Override
    public Optional<Long> escrowOf(long showId) {
        return callLong("escrowOf", showId, () -> splitter.escrowOf(BigInteger.valueOf(showId)).send());
    }

    @Override
    public Optional<Long> depositOf(long showId) {
        return callLong("depositOf", showId, () -> splitter.depositOf(BigInteger.valueOf(showId)).send());
    }

    @Override
    public Optional<long[]> choiceCountsOf(long showId) {
        return callArray("choiceCountsOf", showId,
                () -> splitter.choiceCountsOf(BigInteger.valueOf(showId)).send());
    }

    @Override
    public Optional<long[]> payoutsOf(long showId) {
        return callArray("payoutsOf", showId,
                () -> splitter.payoutsOf(BigInteger.valueOf(showId)).send());
    }

    @Override
    public Optional<Integer> stageOf(long showId) {
        return callLong("stageOf", showId, () -> splitter.stageOf(BigInteger.valueOf(showId)).send())
                .map(Long::intValue);
    }

    private Optional<Long> callLong(String name, long showId, ChainCall<BigInteger> call) {
        try {
            BigInteger value = call.call();
            return value == null ? Optional.empty() : Optional.of(value.longValueExact());
        } catch (Exception e) {
            // 예외 원문을 응답에 싣지 않는다(SEC-09). 로그에만 남긴다.
            log.warn("체인 조회 실패 — {}(showId={}): {}", name, showId, e.toString());
            return Optional.empty();
        }
    }

    @SuppressWarnings("unchecked")
    private Optional<long[]> callArray(String name, long showId, ChainCall<List> call) {
        try {
            List<BigInteger> values = call.call();
            if (values == null) {
                return Optional.empty();
            }
            long[] result = new long[values.size()];
            for (int i = 0; i < values.size(); i++) {
                result[i] = values.get(i).longValueExact();
            }
            return Optional.of(result);
        } catch (Exception e) {
            log.warn("체인 조회 실패 — {}(showId={}): {}", name, showId, e.toString());
            return Optional.empty();
        }
    }

    @FunctionalInterface
    private interface ChainCall<T> {
        T call() throws Exception;
    }
}
