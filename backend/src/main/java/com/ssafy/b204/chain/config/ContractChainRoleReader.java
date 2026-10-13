package com.ssafy.b204.chain.config;

import com.ssafy.b204.chain.contract.YoYo;
import com.ssafy.b204.chain.contract.RevenueSplitter;
import com.ssafy.b204.common.config.ChainProperties;
import org.web3j.protocol.Web3j;
import org.web3j.tx.ReadonlyTransactionManager;
import org.web3j.tx.gas.DefaultGasProvider;

/**
 * {@link ChainRoleReader}의 실물 — 래퍼의 view 함수 두 개를 {@code eth_call}로 읽는다.
 *
 * <p><b>읽기 전용으로 로드한다.</b> {@link ReadonlyTransactionManager}는 서명 키가 없고
 * {@code sendTransaction}을 호출하면 예외를 던진다 — 이 경로가 실수로 tx를 보낼 수 없다는 것이
 * 타입으로 보장된다. {@code from}은 제로 주소면 충분하다(view 호출은 발신자를 보지 않는다).
 * 가스 값도 {@code eth_call}에서는 쓰이지 않으므로 {@link DefaultGasProvider}를 그대로 둔다.
 *
 * <p>빈 등록은 {@link ChainClientConfig}가 한다 — <b>읽기 전용 구성일 때만</b> 만들어진다
 * ({@code Web3j} 빈과 같은 조건). 체인 변수가 비면 이 빈도 {@link ChainRoleGuard}도 없고,
 * 기동은 아무 일 없이 지나간다.
 */
public class ContractChainRoleReader implements ChainRoleReader {

    /** view 호출의 {@code from}. 아무 주소나 되지만 "쓰지 않는 값"임이 드러나는 제로 주소로 둔다. */
    private static final String CALLER = "0x0000000000000000000000000000000000000000";

    private final YoYo yoyo;
    private final RevenueSplitter splitter;

    public ContractChainRoleReader(Web3j web3j, ChainProperties chainProperties) {
        ReadonlyTransactionManager readonly = new ReadonlyTransactionManager(web3j, CALLER);
        this.yoyo = YoYo.load(chainProperties.contract().yoyoAddress(), web3j, readonly,
                new DefaultGasProvider());
        this.splitter = RevenueSplitter.load(chainProperties.contract().splitterAddress(), web3j,
                readonly, new DefaultGasProvider());
    }

    @Override
    public String minter() throws Exception {
        return yoyo.minter().send();
    }

    @Override
    public String operator() throws Exception {
        return splitter.operator().send();
    }
}
