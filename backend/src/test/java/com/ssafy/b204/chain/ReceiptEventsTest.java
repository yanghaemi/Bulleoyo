package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.contract.RevenueSplitter;
import com.ssafy.b204.chain.contract.YoYo;
import com.ssafy.b204.chain.service.ReceiptEvents;
import com.ssafy.b204.chain.service.TxReceipt;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.support.ChainLogs;
import java.math.BigInteger;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint16;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.abi.datatypes.generated.Uint8;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.core.methods.response.TransactionReceipt;

/**
 * receipt 로그 → {@link TxReceipt} 파싱 — API v6 §0.4 ④의 4·5를 가능하게 하는 조각.
 *
 * <p><b>노드도 실체인도 없이 돈다.</b> 로그는 {@link ChainLogs}가 ABI 생성물의 {@code Event}
 * 정의로 조립하고, 서버도 같은 정의로 읽는다 — 양쪽이 같은 출처를 쓰는지가 이 테스트의 핵심이다.
 */
@SuppressWarnings("rawtypes")
class ReceiptEventsTest {

    private static final String YOYO = "0xA5d7031D70DAab33EACDfC912baC0668D5776e5b";
    private static final String SPLITTER = "0xa1ca24ECD6adCd29a8998031fd52Cf17F9541738";
    private static final String BUYER = "0x1111111111111111111111111111111111111111";
    private static final String ORDER_REF = "0x" + "ab".repeat(32);
    private static final String RULES_HASH = "0x" + "cd".repeat(32);
    private static final String TX_HASH = "0x" + "ef".repeat(32);

    private final ReceiptEvents receiptEvents = new ReceiptEvents(new ChainProperties(
            null, 1001L, null, null, null,
            new ChainProperties.Contract(YOYO, SPLITTER)));

    /** 주소를 모르는 환경(체인 미구성) — 로그를 거르지 않는다. */
    private final ReceiptEvents withoutAddresses = new ReceiptEvents(
            new ChainProperties(null, 1001L, null, null, null, null));

    private static Log purchasedLog(String address, long showId, String orderRef, String buyer,
                                    long teamIndex, long amount, long quantity) {
        return ChainLogs.log(address, RevenueSplitter.PURCHASED_EVENT,
                List.<Type>of(new Uint256(showId), new Bytes32(ChainLogs.bytes32(orderRef)),
                        new Address(buyer)),
                List.<Type>of(new Uint8(teamIndex), new Uint256(amount), new Uint16(quantity)));
    }

    @Test
    @DisplayName("Purchased 로그를 인자 6개 그대로 읽는다 — topic0 상수를 손으로 적지 않는다")
    void parsesPurchased() {
        TransactionReceipt receipt = ChainLogs.receipt(TX_HASH, SPLITTER, BUYER,
                List.of(purchasedLog(SPLITTER, 7L, ORDER_REF, BUYER, 1L, 50_000L, 2L)));

        TxReceipt parsed = receiptEvents.parse(receipt);

        assertThat(parsed.success()).isTrue();
        assertThat(parsed.txHash()).isEqualTo(TX_HASH);
        assertThat(parsed.to()).isEqualTo(SPLITTER);
        assertThat(parsed.from()).isEqualTo(BUYER);
        assertThat(parsed.blockNumber()).isEqualTo(100L);

        TxReceipt.TxEvent purchased = parsed.event("Purchased").orElseThrow();
        assertThat(purchased.number("showId")).contains(7L);
        assertThat(purchased.text("orderRef")).contains(ORDER_REF);
        assertThat(purchased.text("buyer")).map(String::toLowerCase).contains(BUYER.toLowerCase());
        assertThat(purchased.number("teamIndex")).contains(1L);
        assertThat(purchased.number("amount")).contains(50_000L);
        assertThat(purchased.number("quantity")).contains(2L);
    }

    @Test
    @DisplayName("다른 컨트랙트가 낸 같은 이름의 이벤트는 무시한다 — 주소를 대조하지 않으면 위조가 통과한다")
    void ignoresLogsFromOtherContracts() {
        String impostor = "0x2222222222222222222222222222222222222222";
        TransactionReceipt receipt = ChainLogs.receipt(TX_HASH, SPLITTER, BUYER,
                List.of(purchasedLog(impostor, 7L, ORDER_REF, BUYER, 1L, 50_000L, 2L)));

        assertThat(receiptEvents.parse(receipt).event("Purchased")).isEmpty();
        // 컨트랙트 주소가 설정돼 있지 않으면 거르지 않는다(ChainJobConfirmationService 의 to 대조와 같은 규칙).
        assertThat(withoutAddresses.parse(receipt).event("Purchased")).isPresent();
    }

    @Test
    @DisplayName("YoYo 이벤트와 Splitter 이벤트를 각자의 주소에서만 읽는다")
    void separatesContracts() {
        Log approval = ChainLogs.log(YOYO, YoYo.APPROVAL_EVENT,
                List.<Type>of(new Address(BUYER), new Address(SPLITTER)),
                List.<Type>of(new Uint256(50_000L)));
        Log minted = ChainLogs.log(YOYO, YoYo.MINTED_EVENT,
                List.<Type>of(new Address(BUYER), new Bytes32(ChainLogs.bytes32(RULES_HASH))),
                List.<Type>of(new Uint256(100_000L)));
        Log saleStarted = ChainLogs.log(SPLITTER, RevenueSplitter.SALESTARTED_EVENT,
                List.<Type>of(new Uint256(7L)),
                List.<Type>of(new Bytes32(ChainLogs.bytes32(RULES_HASH))));

        TxReceipt parsed = receiptEvents.parse(
                ChainLogs.receipt(TX_HASH, YOYO, BUYER, List.of(approval, minted, saleStarted)));

        assertThat(parsed.event("Approval").orElseThrow().text("spender"))
                .map(String::toLowerCase).contains(SPLITTER.toLowerCase());
        assertThat(parsed.event("Minted").orElseThrow().text("grantRef")).contains(RULES_HASH);
        assertThat(parsed.event("Minted").orElseThrow().number("amount")).contains(100_000L);
        assertThat(parsed.event("SaleStarted").orElseThrow().text("rulesHash"))
                .contains(RULES_HASH);
    }

    @Test
    @DisplayName("DepositPaid·RulesAgreed 도 확정 서비스가 쓰는 이름 그대로 나온다")
    void parsesDepositAndAgreement() {
        Log deposit = ChainLogs.log(SPLITTER, RevenueSplitter.DEPOSITPAID_EVENT,
                List.<Type>of(new Uint256(7L), new Address(BUYER)),
                List.<Type>of(new Uint256(50_000L)));
        Log agreed = ChainLogs.log(SPLITTER, RevenueSplitter.RULESAGREED_EVENT,
                List.<Type>of(new Uint256(7L), new Address(BUYER)),
                List.<Type>of(new Bytes32(ChainLogs.bytes32(RULES_HASH)), new Uint8(1L),
                        new Uint8(2L)));

        TxReceipt parsed = receiptEvents.parse(
                ChainLogs.receipt(TX_HASH, SPLITTER, BUYER, List.of(deposit, agreed)));

        assertThat(parsed.event("DepositPaid").orElseThrow().number("showId")).contains(7L);
        assertThat(parsed.event("DepositPaid").orElseThrow().number("amount")).contains(50_000L);
        assertThat(parsed.event("RulesAgreed").orElseThrow().text("rulesHash")).contains(RULES_HASH);
        assertThat(parsed.event("RulesAgreed").orElseThrow().number("teamCount")).contains(2L);
    }

    /**
     * {@code updateRules} 는 두 이벤트를 함께 낸다 — 확정 서비스가 <b>둘 다</b> 본다.
     * {@code AgreementsReset} 이 없으면 온체인 동의가 리셋되지 않은 것이고, 이미 동의한 팀이
     * {@code AlreadyAgreed} 로 막혀 {@code startSale} 이 영영 열리지 않는다(S15P21B204-70).
     */
    @Test
    @DisplayName("RulesUpdated·AgreementsReset 도 확정 서비스가 쓰는 이름 그대로 나온다")
    void parsesRulesUpdate() {
        Log updated = ChainLogs.log(SPLITTER, RevenueSplitter.RULESUPDATED_EVENT,
                List.<Type>of(new Uint256(7L)),
                List.<Type>of(new Bytes32(ChainLogs.bytes32(RULES_HASH)), new Uint16(6000L),
                        new Uint16(4000L)));
        Log reset = ChainLogs.log(SPLITTER, RevenueSplitter.AGREEMENTSRESET_EVENT,
                List.<Type>of(new Uint256(7L)), List.<Type>of());

        TxReceipt parsed = receiptEvents.parse(
                ChainLogs.receipt(TX_HASH, SPLITTER, BUYER, List.of(updated, reset)));

        assertThat(parsed.event("RulesUpdated").orElseThrow().number("showId")).contains(7L);
        assertThat(parsed.event("RulesUpdated").orElseThrow().text("rulesHash"))
                .contains(RULES_HASH);
        assertThat(parsed.event("RulesUpdated").orElseThrow().number("fixedRatioBp"))
                .contains(6000L);
        assertThat(parsed.event("AgreementsReset").orElseThrow().number("showId")).contains(7L);
    }

    @Test
    @DisplayName("uint256 이 long 범위를 넘으면 그 인자를 담지 않는다 — 잘라 넣으면 위조가 대조를 통과한다")
    void dropsOutOfRangeNumbers() {
        // 기대값 50,000 + 2^64. longValue() 로 자르면 정확히 50,000 이 되어 대조를 통과한다.
        BigInteger forged = BigInteger.valueOf(50_000L).add(BigInteger.TWO.pow(64));
        Log log = ChainLogs.log(SPLITTER, RevenueSplitter.PURCHASED_EVENT,
                List.<Type>of(new Uint256(7L), new Bytes32(ChainLogs.bytes32(ORDER_REF)),
                        new Address(BUYER)),
                List.<Type>of(new Uint8(1L), new Uint256(forged), new Uint16(2L)));

        TxReceipt.TxEvent purchased = receiptEvents
                .parse(ChainLogs.receipt(TX_HASH, SPLITTER, BUYER, List.of(log)))
                .event("Purchased").orElseThrow();

        assertThat(purchased.number("amount")).isEqualTo(Optional.empty());
        assertThat(purchased.number("showId")).contains(7L);
    }

    @Test
    @DisplayName("로그가 없거나 revert 된 receipt 도 예외 없이 옮긴다")
    void handlesEmptyAndReverted() {
        TxReceipt empty = receiptEvents.parse(
                ChainLogs.receipt(TX_HASH, SPLITTER, BUYER, List.of()));
        assertThat(empty.success()).isTrue();
        assertThat(empty.events()).isEmpty();

        TxReceipt reverted = receiptEvents.parse(ChainLogs.reverted(TX_HASH, SPLITTER, BUYER));
        assertThat(reverted.success()).isFalse();
        assertThat(reverted.events()).isEmpty();

        assertThat(receiptEvents.parse(null)).isNull();
    }
}
