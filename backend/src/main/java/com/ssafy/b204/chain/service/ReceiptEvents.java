package com.ssafy.b204.chain.service;

import com.ssafy.b204.chain.contract.RevenueSplitter;
import com.ssafy.b204.chain.contract.YoYo;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.support.EthCrypto;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import org.web3j.utils.Numeric;

/**
 * web3j {@link TransactionReceipt} → 도메인 {@link TxReceipt} — API v6 §0.4 ④의 <b>4·5</b>를
 * 가능하게 하는 조각이다.
 *
 * <p><b>topic0 상수를 손으로 적지 않는다.</b> 이벤트 식별과 인자 디코딩을 전부 ABI 생성물
 * ({@link YoYo}·{@link RevenueSplitter}의 {@code getXxxEvents(TransactionReceipt)})에 맡긴다.
 * 그 정적 메서드가 각 로그의 topic0을 {@code EventEncoder.encode(XXX_EVENT)}와 대조하고 인자를
 * 타입대로 풀어 준다. 여기서 하는 일은 <b>필드 이름을 {@link TxReceipt.TxEvent}의 키로 옮기는
 * 것</b>뿐이고, 필드 이름(=ABI 인자 이름)이 바뀌면 <b>컴파일이 깨진다</b> — 손으로 적은 4바이트
 * 상수였다면 조용히 못 찾는 이벤트가 됐을 자리다.
 *
 * <p><b>로그를 컨트랙트 주소로 먼저 거른다.</b> receipt의 {@code to}가 우리 컨트랙트여도 그 tx가
 * 내부에서 부른 <b>다른 컨트랙트가 같은 시그니처의 이벤트를 낼 수 있다</b>(topic0은 이름·타입만으로
 * 정해지므로 아무나 {@code Purchased}를 흉내낼 수 있다). 주소로 거르지 않으면 그 위조 로그가
 * 확정 검증을 통과한다. 주소가 설정돼 있지 않은 환경(체인 미구성)에서는 거르지 않는다 —
 * {@link ChainJobConfirmationService}의 {@code to} 대조가 같은 규칙으로 건너뛴다.
 *
 * <p>다루는 이벤트는 {@link ChainJobConfirmationService}가 실제로 대조하는 것들이다 —
 * {@code Approval}·{@code Minted}(YoYo) · {@code ShowCreated}·{@code RulesUpdated}·
 * {@code AgreementsReset}·{@code Purchased}·{@code DepositPaid}·{@code RulesAgreed}·
 * {@code SaleStarted}·{@code SettlementLocked}·{@code Refunded}(RevenueSplitter).
 * <b>쓰지 않는 이벤트를 미리 담지 않는다</b> — 담아 두면 "이건 왜 있나"를 다음 사람이 되묻는다.
 *
 * <p>값 타입은 {@link TxReceipt.TxEvent}의 규약대로 {@code Long}(숫자)과 {@code String}
 * (주소·bytes32 hex) 둘뿐이다. {@code uint256}이 {@code long} 범위를 넘으면 <b>그 인자를 아예
 * 담지 않는다</b> — {@code longValue()}로 잘라 넣으면 {@code 기대값 + 2^64}로 만든 값이 대조를
 * 통과한다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ReceiptEvents {

    private final ChainProperties chainProperties;

    /**
     * receipt를 도메인 계약으로 옮긴다. 실패한 receipt({@code status != 0x1})도 그대로 옮기며,
     * revert 사유는 워커가 {@link TxReceipt#reverted(String, String)}로 따로 만든다.
     */
    public TxReceipt parse(TransactionReceipt receipt) {
        if (receipt == null) {
            return null;
        }
        boolean success = "0x1".equalsIgnoreCase(receipt.getStatus());
        return new TxReceipt(receipt.getTransactionHash(), success, receipt.getTo(),
                receipt.getFrom(), blockNumberOf(receipt), events(receipt));
    }

    /** receipt 안에서 우리가 아는 이벤트를 전부 뽑는다. 순서는 컨트랙트별·정의 순이다. */
    public List<TxReceipt.TxEvent> events(TransactionReceipt receipt) {
        List<TxReceipt.TxEvent> events = new ArrayList<>();
        TransactionReceipt yoyo = logsOf(receipt, address(chainProperties.contract() == null
                ? null : chainProperties.contract().yoyoAddress()));
        TransactionReceipt splitter = logsOf(receipt, address(chainProperties.contract() == null
                ? null : chainProperties.contract().splitterAddress()));

        for (YoYo.ApprovalEventResponse e : decode("Approval", () -> YoYo.getApprovalEvents(yoyo))) {
            events.add(event("Approval", args -> {
                args.put("owner", e.owner);
                args.put("spender", e.spender);
                put(args, "value", e.value);
            }));
        }
        for (YoYo.MintedEventResponse e : decode("Minted", () -> YoYo.getMintedEvents(yoyo))) {
            events.add(event("Minted", args -> {
                args.put("to", e.to);
                put(args, "amount", e.amount);
                args.put("grantRef", hex(e.grantRef));
            }));
        }
        for (RevenueSplitter.ShowCreatedEventResponse e :
                decode("ShowCreated", () -> RevenueSplitter.getShowCreatedEvents(splitter))) {
            events.add(event("ShowCreated", args -> {
                put(args, "showId", e.showId);
                // 주소 배열은 TxEvent 의 값 타입(Long·String) 안에 담아야 대조가 된다.
                // 소문자 쉼표 연결이 "순서까지 같은가"를 문자열 하나로 비교하게 해 준다.
                args.put("teamWallets", joinAddresses(e.teamWallets));
                put(args, "hostTeamIndex", e.hostTeamIndex);
                args.put("rulesHash", hex(e.rulesHash));
            }));
        }
        for (RevenueSplitter.RulesUpdatedEventResponse e :
                decode("RulesUpdated", () -> RevenueSplitter.getRulesUpdatedEvents(splitter))) {
            events.add(event("RulesUpdated", args -> {
                put(args, "showId", e.showId);
                args.put("rulesHash", hex(e.rulesHash));
                put(args, "fixedRatioBp", e.fixedRatioBp);
                put(args, "selectionRatioBp", e.selectionRatioBp);
            }));
        }
        // updateRules 는 RulesUpdated 와 함께 반드시 이것을 낸다(rulesEpoch 증가 = 동의 전원 리셋).
        // 인자가 showId 하나뿐이라 확정 검증은 "존재하는가"만 본다.
        for (RevenueSplitter.AgreementsResetEventResponse e :
                decode("AgreementsReset", () -> RevenueSplitter.getAgreementsResetEvents(splitter))) {
            events.add(event("AgreementsReset", args -> put(args, "showId", e.showId)));
        }
        for (RevenueSplitter.PurchasedEventResponse e :
                decode("Purchased", () -> RevenueSplitter.getPurchasedEvents(splitter))) {
            events.add(event("Purchased", args -> {
                put(args, "showId", e.showId);
                args.put("orderRef", hex(e.orderRef));
                args.put("buyer", e.buyer);
                put(args, "teamIndex", e.teamIndex);
                put(args, "amount", e.amount);
                put(args, "quantity", e.quantity);
            }));
        }
        for (RevenueSplitter.RefundedEventResponse e :
                decode("Refunded", () -> RevenueSplitter.getRefundedEvents(splitter))) {
            events.add(event("Refunded", args -> {
                put(args, "showId", e.showId);
                args.put("orderRef", hex(e.orderRef));
                args.put("buyer", e.buyer);
                put(args, "refundAmount", e.refundAmount);
                put(args, "quantity", e.quantity);
            }));
        }
        for (RevenueSplitter.DepositPaidEventResponse e :
                decode("DepositPaid", () -> RevenueSplitter.getDepositPaidEvents(splitter))) {
            events.add(event("DepositPaid", args -> {
                put(args, "showId", e.showId);
                args.put("from", e.from);
                put(args, "amount", e.amount);
            }));
        }
        for (RevenueSplitter.RulesAgreedEventResponse e :
                decode("RulesAgreed", () -> RevenueSplitter.getRulesAgreedEvents(splitter))) {
            events.add(event("RulesAgreed", args -> {
                put(args, "showId", e.showId);
                args.put("team", e.team);
                args.put("rulesHash", hex(e.rulesHash));
                put(args, "agreedCount", e.agreedCount);
                put(args, "teamCount", e.teamCount);
            }));
        }
        for (RevenueSplitter.SaleStartedEventResponse e :
                decode("SaleStarted", () -> RevenueSplitter.getSaleStartedEvents(splitter))) {
            events.add(event("SaleStarted", args -> {
                put(args, "showId", e.showId);
                args.put("rulesHash", hex(e.rulesHash));
            }));
        }
        for (RevenueSplitter.SettlementLockedEventResponse e :
                decode("SettlementLocked", () -> RevenueSplitter.getSettlementLockedEvents(splitter))) {
            events.add(event("SettlementLocked", args -> put(args, "showId", e.showId)));
        }
        return events;
    }

    // ------------------------------------------------------------------ 내부

    /**
     * 로그 디코드 실패를 <b>이벤트 부재</b>로 바꾼다.
     *
     * <p>같은 topic0을 가진 남의 로그가 주소 필터를 넘어왔거나(주소 미설정 환경) 인자 배치가
     * ABI와 다르면 web3j가 예외를 던진다. 그때 워커를 죽이면 <b>다른 job의 확정까지 멈춘다</b> —
     * 없는 이벤트로 취급하면 그 job만 검증 실패로 떨어진다(안전한 방향).
     */
    private static <T> List<T> decode(String name, Supplier<List<T>> extractor) {
        try {
            return extractor.get();
        } catch (RuntimeException e) {
            log.warn("{} 로그 디코드 실패 — 이벤트가 없는 것으로 본다", name);
            return List.of();
        }
    }

    private static TxReceipt.TxEvent event(String name, java.util.function.Consumer<Map<String, Object>> filler) {
        Map<String, Object> args = new LinkedHashMap<>();
        filler.accept(args);
        return new TxReceipt.TxEvent(name, args);
    }

    /** {@code long} 범위를 넘는 값은 담지 않는다 — 잘라 넣으면 위조가 대조를 통과한다. */
    private static void put(Map<String, Object> args, String key, BigInteger value) {
        if (value == null) {
            return;
        }
        try {
            args.put(key, value.longValueExact());
        } catch (ArithmeticException e) {
            log.warn("이벤트 인자 {}가 long 범위를 넘는다 — 담지 않는다(대조는 실패한다)", key);
        }
    }

    /**
     * {@code address[]} → 소문자 쉼표 연결. {@link TxReceipt.TxEvent}의 값 타입이
     * {@code Long}·{@code String} 둘뿐이라 배열을 담을 자리가 없고, 우리가 대조하는 것은
     * <b>주소와 순서</b>이므로 이 한 줄이면 충분하다.
     */
    static String joinAddresses(List<?> addresses) {
        if (addresses == null) {
            return null;
        }
        return addresses.stream()
                .map(a -> a == null ? "" : a.toString().trim().toLowerCase(java.util.Locale.ROOT))
                .collect(java.util.stream.Collectors.joining(","));
    }

    private static String hex(byte[] value) {
        return value == null ? null : Numeric.toHexString(value);
    }

    private static String address(String configured) {
        return configured == null || configured.isBlank() ? null : configured;
    }

    /**
     * 그 컨트랙트가 낸 로그만 남긴 receipt 사본. 주소를 모르면 원본을 그대로 쓴다.
     *
     * <p>사본을 만드는 이유 — 생성물의 {@code getXxxEvents}는 {@link TransactionReceipt} 하나를
     * 받아 로그 전부를 훑는다. 로그를 미리 걸러 두는 것이 그 계약을 건드리지 않고 주소 대조를
     * 넣는 유일한 방법이다.
     */
    private static TransactionReceipt logsOf(TransactionReceipt receipt, String contractAddress) {
        List<Log> logs = receipt.getLogs() == null ? List.of() : receipt.getLogs();
        TransactionReceipt copy = new TransactionReceipt();
        copy.setLogs(contractAddress == null ? logs
                : logs.stream().filter(l -> EthCrypto.sameAddress(l.getAddress(), contractAddress))
                        .toList());
        return copy;
    }

    private static long blockNumberOf(TransactionReceipt receipt) {
        try {
            BigInteger blockNumber = receipt.getBlockNumber();
            return blockNumber == null ? 0L : blockNumber.longValue();
        } catch (RuntimeException e) {
            // blockNumber 는 부가 정보다. 못 읽었다고 확정을 미루지 않는다.
            return 0L;
        }
    }
}
