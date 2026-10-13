package com.ssafy.b204.coin.service;

import com.ssafy.b204.chain.contract.YoYo;
import com.ssafy.b204.chain.contract.RevenueSplitter;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.math.BigInteger;
import java.util.concurrent.Callable;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.web3j.protocol.Web3j;
import org.web3j.tx.ReadonlyTransactionManager;
import org.web3j.tx.gas.DefaultGasProvider;

/**
 * {@link CoinChainReader}의 실물 — 이강륜의 web3j 래퍼를 {@code eth_call}로 읽는다.
 *
 * <p><b>지연 로드</b>다. {@code Web3j} 빈은 체인 변수가 채워졌을 때만 존재하므로
 * ({@code ChainClientConfig}) 생성자에서 컨트랙트를 만들면 키 없는 팀원의 기동이 깨진다.
 * {@link ObjectProvider}로 받아 첫 호출 시점에 로드하고, 그때도 없으면
 * {@code COMMON_EXTERNAL_SERVICE_ERROR}로 떨어뜨린다 — 호출부(공시)는 그 예외를 잡아
 * DB 집계로 응답한다.
 *
 * <p><b>읽기 전용으로 로드한다.</b> {@link ReadonlyTransactionManager}는 서명 키가 없어
 * {@code sendTransaction}이 예외다 — 이 경로가 실수로 tx를 보낼 수 없음이 타입으로 보장된다.
 * {@code ContractChainRoleReader}(chain 패키지)와 같은 방식이다.
 */
@Component
@Slf4j
public class ContractCoinChainReader implements CoinChainReader {

    /** view 호출의 {@code from}. 값이 쓰이지 않음이 드러나는 제로 주소로 둔다. */
    private static final String CALLER = "0x0000000000000000000000000000000000000000";

    private final ObjectProvider<Web3j> web3jProvider;
    private final ChainProperties chainProperties;

    /** 첫 호출에서 만들어 재사용한다. 래퍼는 상태가 없어 스레드 안전하다. */
    private volatile Contracts contracts;

    public ContractCoinChainReader(ObjectProvider<Web3j> web3jProvider,
                                   ChainProperties chainProperties) {
        this.web3jProvider = web3jProvider;
        this.chainProperties = chainProperties;
    }

    @Override
    public boolean isAvailable() {
        return chainProperties.isReadOnlyConfigured() && web3jProvider.getIfAvailable() != null;
    }

    @Override
    public long totalSupply() {
        return call(() -> contracts().yoyo().totalSupply().send());
    }

    @Override
    public long balanceOf(String address) {
        return call(() -> contracts().yoyo().balanceOf(address).send());
    }

    @Override
    public long escrowOf(long showId) {
        return call(() -> contracts().splitter().escrowOf(BigInteger.valueOf(showId)).send());
    }

    @Override
    public long depositOf(long showId) {
        return call(() -> contracts().splitter().depositOf(BigInteger.valueOf(showId)).send());
    }

    /**
     * {@code eth_call} 결과를 {@code long}으로.
     *
     * <p>{@code longValueExact()}를 쓰는 이유: YoYo는 {@code decimals=0}이라 총 발행량이
     * {@code 2^63}을 넘을 일이 없다. 넘었다면 우리가 모르는 토큰을 읽고 있다는 뜻이므로 조용히
     * 잘라내지 않고 예외로 만든다.
     */
    private long call(Callable<BigInteger> viewCall) {
        try {
            return viewCall.call().longValueExact();
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            // 노드 문자열은 응답에 넣지 않는다(SEC-09). 로그에만.
            log.warn("체인 view 호출 실패", e);
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR, e);
        }
    }

    private Contracts contracts() {
        Contracts loaded = this.contracts;
        if (loaded != null) {
            return loaded;
        }
        Web3j web3j = web3jProvider.getIfAvailable();
        if (web3j == null || !chainProperties.isReadOnlyConfigured()) {
            throw ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR.toException();
        }
        ReadonlyTransactionManager readonly = new ReadonlyTransactionManager(web3j, CALLER);
        loaded = new Contracts(
                YoYo.load(chainProperties.contract().yoyoAddress(), web3j, readonly,
                        new DefaultGasProvider()),
                RevenueSplitter.load(chainProperties.contract().splitterAddress(), web3j, readonly,
                        new DefaultGasProvider()));
        this.contracts = loaded;
        return loaded;
    }

    private record Contracts(YoYo yoyo, RevenueSplitter splitter) {}
}
