package com.ssafy.b204.verify.service;

import com.ssafy.b204.chain.contract.RevenueSplitter;
import com.ssafy.b204.common.config.ChainProperties;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.web3j.protocol.Web3j;
import org.web3j.tx.ReadonlyTransactionManager;
import org.web3j.tx.gas.DefaultGasProvider;

/**
 * {@link VerifyChainReader}의 실제 구현 — {@code RevenueSplitter} view 호출.
 *
 * <p>인코딩·디코딩은 {@code chain/contract/RevenueSplitter} 래퍼(ABI에서 생성된 파일)에 맡긴다.
 * {@code FunctionEncoder}로 직접 셀렉터를 만들면 <b>ABI가 바뀌었을 때 컴파일이 깨지지 않고 값만
 * 조용히 틀린다</b> — 래퍼를 거치면 시그니처 변경이 컴파일 오류로 드러난다.
 * ({@code ContractSettlementChainReader}와 같은 판단이다.)
 *
 * <p><b>키가 없어도 만들어진다.</b> {@link ReadonlyTransactionManager}는 서명하지 않으므로
 * {@code eth_call}만 쓰는 이 클래스에는 OPERATOR·MINTER 개인키가 필요 없다.
 *
 * <p>모든 조회는 실패를 삼켜 {@link Optional#empty()}로 돌린다. 던지면 검증 조회가 체인 장애로
 * 500이 되는데, 그 상황의 올바른 답은 500이 아니라 <b>캐시 + {@code stale:true}</b>이거나 502다.
 * 예외 원문은 응답에 싣지 않고 로그에만 남긴다(SEC-09).
 */
@Slf4j
public class ContractVerifyChainReader implements VerifyChainReader {

    /** view 호출에서 발신자 주소는 쓰이지 않는다. 서명도 하지 않으므로 0 주소로 둔다. */
    private static final String CALLER = "0x0000000000000000000000000000000000000000";

    private final RevenueSplitter splitter;

    public ContractVerifyChainReader(Web3j web3j, ChainProperties chainProperties) {
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
        return callLong("escrowOf", showId,
                () -> splitter.escrowOf(BigInteger.valueOf(showId)).send());
    }

    @Override
    public Optional<Long> depositOf(long showId) {
        return callLong("depositOf", showId,
                () -> splitter.depositOf(BigInteger.valueOf(showId)).send());
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
    public Optional<String> rulesHashOf(long showId) {
        return call("rulesHashOf", showId,
                () -> splitter.rulesHashOf(BigInteger.valueOf(showId)).send())
                .map(ContractVerifyChainReader::toHex);
    }

    @Override
    public Optional<Boolean> agreedOf(long showId, String wallet) {
        if (wallet == null || wallet.isBlank()) {
            // 지갑을 모르면 물어볼 수 없다. "동의하지 않았다"가 아니라 "판정 불가"다.
            return Optional.empty();
        }
        return call("agreedOf", showId,
                () -> splitter.agreedOf(BigInteger.valueOf(showId), wallet).send());
    }

    @Override
    public Optional<List<String>> teamWalletsOf(long showId) {
        return call("teamWalletsOf", showId, () -> {
            List<?> raw = splitter.teamWalletsOf(BigInteger.valueOf(showId)).send();
            if (raw == null) {
                return null;
            }
            List<String> wallets = new ArrayList<>(raw.size());
            for (Object value : raw) {
                wallets.add(String.valueOf(value));
            }
            return List.copyOf(wallets);
        });
    }

    @Override
    public Optional<Integer> hostTeamIndexOf(long showId) {
        return callLong("hostTeamIndexOf", showId,
                () -> splitter.hostTeamIndexOf(BigInteger.valueOf(showId)).send())
                .map(Long::intValue);
    }

    // ------------------------------------------------------------------ 공통

    /**
     * {@code uint256} → {@code long}. <b>변환도 {@code try} 안에서 한다</b> — 값이
     * {@code Long.MAX_VALUE}를 넘으면 {@code longValueExact()}가 {@link ArithmeticException}을
     * 던지는데, 그것이 밖으로 새면 검증 조회가 500이 된다. 여기서는 "못 읽었다"가 옳은 답이다.
     */
    private Optional<Long> callLong(String name, long showId, ChainCall<BigInteger> call) {
        return call(name, showId, () -> {
            BigInteger value = call.call();
            return value == null ? null : value.longValueExact();
        });
    }

    /** 배열 변환도 같은 이유로 {@code try} 안이다. 한 칸이라도 넘치면 배열 전체가 empty다. */
    private Optional<long[]> callArray(String name, long showId, ChainCall<List> call) {
        return call(name, showId, () -> {
            @SuppressWarnings("unchecked")
            List<BigInteger> values = call.call();
            if (values == null) {
                return null;
            }
            long[] result = new long[values.size()];
            for (int i = 0; i < values.size(); i++) {
                result[i] = values.get(i).longValueExact();
            }
            return result;
        });
    }

    /** 실패를 삼켜 {@link Optional#empty()}로 돌린다. 예외 원문은 로그에만 남긴다(SEC-09). */
    private <T> Optional<T> call(String name, long showId, ChainCall<T> call) {
        try {
            return Optional.ofNullable(call.call());
        } catch (Exception e) {
            log.warn("체인 조회 실패 — {}(showId={}): {}", name, showId, e.toString());
            return Optional.empty();
        }
    }

    /** {@code bytes32} → {@code 0x} + 소문자 64 hex. 서버 {@code rules_hash} 표기와 같은 형식이다. */
    private static String toHex(byte[] value) {
        return "0x" + HexFormat.of().formatHex(value).toLowerCase(Locale.ROOT);
    }

    @FunctionalInterface
    private interface ChainCall<T> {
        T call() throws Exception;
    }
}
