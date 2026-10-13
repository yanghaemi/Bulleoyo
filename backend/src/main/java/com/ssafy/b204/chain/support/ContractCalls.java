package com.ssafy.b204.chain.support;

import java.math.BigInteger;

/**
 * 컨트랙트 함수 calldata — <b>계약 문서 13_컨트랙트_인터페이스_v1(origin/develop) §4.1·§8이 정본</b>이다.
 *
 * <p>여기 있는 시그니처가 한 글자라도 다르면 selector가 통째로 달라져 tx가 엉뚱한 함수를 부르거나
 * revert된다. 시그니처를 바꿔야 하면 <b>계약 문서를 먼저 고치고</b> 이 파일을 맞춘다.
 *
 * <p>서명 주체(계약 문서 §4.1)
 *
 * <ul>
 *   <li>{@code YoYo.approve} · {@code Splitter.purchase} — <b>관객</b> 지갑(대납)
 *   <li>{@code Splitter.deposit} — <b>생성팀 리더</b> 지갑(대납)
 *   <li>{@code Splitter.agreeToRules} — <b>참여팀 리더</b> 지갑(대납)
 *   <li>{@code Splitter.createShow}·{@code startSale} — <b>OPERATOR</b>(서버 키)
 * </ul>
 *
 * <p>OPERATOR 함수는 여기서 calldata를 만들지 않는다 — 체인 워커가 web3j 래퍼의 {@code FUNC_*}
 * 상수 + {@code FunctionEncoder}로 만든다
 * ({@link com.ssafy.b204.chain.worker.ContractOperatorTxBuilder}).
 */
public final class ContractCalls {

    public static final String SIG_APPROVE = "approve(address,uint256)";
    public static final String SIG_PURCHASE = "purchase(uint256,bytes32,uint8,uint256,uint16)";
    public static final String SIG_DEPOSIT = "deposit(uint256)";
    public static final String SIG_AGREE_TO_RULES = "agreeToRules(uint256,bytes32)";

    /** 계약 문서 §4.1 — 주문 1건의 표 수 상한. 초과는 온체인에서 {@code QuantityLimitExceeded}. */
    public static final int MAX_QUANTITY_PER_ORDER = 4;

    private ContractCalls() {
    }

    /** {@code YoYo.approve(spender, amount)} — spender는 RevenueSplitter다. */
    public static String approve(String spender, long amount) {
        return AbiCodec.call(SIG_APPROVE, AbiCodec.addressWord(spender), AbiCodec.word(amount));
    }

    /** {@code RevenueSplitter.purchase(showId, orderRef, teamIndex, amount, quantity)} */
    public static String purchase(long showId, String orderRef, int teamIndex, long amount,
                                  int quantity) {
        return AbiCodec.call(SIG_PURCHASE,
                AbiCodec.word(showId),
                AbiCodec.bytes32Word(orderRef),
                AbiCodec.word(teamIndex),
                AbiCodec.word(amount),
                AbiCodec.word(quantity));
    }

    /** {@code RevenueSplitter.deposit(showId)} — 사전 {@code approve}가 필요하다. */
    public static String deposit(long showId) {
        return AbiCodec.call(SIG_DEPOSIT, AbiCodec.word(showId));
    }

    /** {@code RevenueSplitter.agreeToRules(showId, rulesHash)} — 자금 이동이 없다. */
    public static String agreeToRules(long showId, String rulesHash) {
        return AbiCodec.call(SIG_AGREE_TO_RULES,
                AbiCodec.word(showId), AbiCodec.bytes32Word(rulesHash));
    }

    /** 서명 화면 힌트용 가스 한도(§0.4 {@code gas}). 수수료는 전액 대납이라 상한 힌트일 뿐이다. */
    public static String gasHint(long gas) {
        return "0x" + BigInteger.valueOf(gas).toString(16);
    }
}
