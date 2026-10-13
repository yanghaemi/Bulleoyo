package com.ssafy.b204.chain.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * receipt + 로그 파싱 결과 — API v6 §0.4 ④ "receipt 검증 5항목"의 입력.
 *
 * <p><b>{@code success}만 보고 확정하지 않는다.</b> revert되지 않았을 뿐 우리가 기대한 이벤트가
 * 아닌 tx도 성공으로 읽힌다. 그래서 이 타입이 {@code to}·{@code from}과 <b>파싱된 이벤트</b>를
 * 함께 나른다.
 *
 * <p><b>이것이 체인 모듈과 도메인의 경계다.</b> 체인 쪽 입력은 web3j
 * {@link org.web3j.protocol.core.methods.response.TransactionReceipt}이고
 * ({@link ReceiptVerifier}가 §0.4 ④의 1~3을 본다), 도메인 쪽 입력은 이 타입이다
 * ({@link ChainJobConfirmationService}가 4·5를 보고 상태를 전이한다). 둘을 잇는 이벤트 파싱은
 * {@link ReceiptEvents}가 한다 — <b>topic0 상수를 손으로 적지 않고</b> ABI 생성물
 * ({@code YoYo}·{@code RevenueSplitter}의 {@code getXxxEvents})에 맡긴다.
 *
 * <p>이 타입이 <b>web3j 타입이 아닌 채로 남아 있는 것이 의도다</b> — 테스트가 이 타입을 직접
 * 만들어 넣으면 실체인도 노드도 없이 확정 이후 전이를 전부 돌려볼 수 있다.
 *
 * <p>이벤트 이름·인자 이름은 계약 문서 §4.3 시그니처 그대로다 —
 * {@code Purchased(showId, orderRef, buyer, teamIndex, amount, quantity)} ·
 * {@code DepositPaid(showId, from, amount)} · {@code RulesAgreed(showId, team, rulesHash,
 * agreedCount, teamCount)} · {@code SaleStarted(showId, rulesHash)} · {@code Approval(owner,
 * spender, value)}.
 *
 * <p><b>revert 사유는 워커가 번역해서 넣는다</b>({@code failureCode}). 워커는 revert 데이터의
 * custom error selector를 {@link ChainFailure#toErrorCode(String)}로 규격 코드로 바꾼다 —
 * 매핑표 정본은 계약 문서 §4.6이다.
 *
 * @param failureCode {@code success == false}일 때 <b>규격 §3의 {@code ErrorCode} 이름</b>
 *                    (예: {@code "TICKET_SALE_NOT_STARTED"}). {@link ChainFailure#toErrorCode}
 *                    결과의 {@code name()}을 넣는다. <b>{@code null}이어도 된다</b> — 그러면
 *                    {@code PAYMENT_AMOUNT_MISMATCH}로 떨어진다. revert <b>원문</b>은 절대 넣지
 *                    않는다(SEC-09)
 */
public record TxReceipt(
        String txHash,
        boolean success,
        String to,
        String from,
        long blockNumber,
        List<TxEvent> events,
        String failureCode
) {

    /** 성공 receipt용 축약형 — {@code failureCode}는 성공 경로에서 뜻이 없다. */
    public TxReceipt(String txHash, boolean success, String to, String from, long blockNumber,
                     List<TxEvent> events) {
        this(txHash, success, to, from, blockNumber, events, null);
    }

    /** 이름으로 이벤트 하나를 찾는다. 없으면 검증 실패다. */
    public Optional<TxEvent> event(String name) {
        return events == null ? Optional.empty()
                : events.stream().filter(e -> e.name().equals(name)).findFirst();
    }

    /**
     * revert된 receipt. 도메인 상태를 전이시키지 않고 {@code chain_job}만 FAILED로 고정한다.
     *
     * <p>사유를 모르는 형태다 — 계약 §4.6으로 사유를 번역했다면 {@link #reverted(String, String)}를
     * 쓴다({@link ChainFailure#toErrorCode(String)}가 그 번역을 한다).
     */
    public static TxReceipt reverted(String txHash) {
        return reverted(txHash, null);
    }

    /**
     * 사유를 아는 revert receipt.
     *
     * @param failureCode 규격 §3 {@code ErrorCode} 이름. 알 수 없는 이름이면 확정 서비스가
     *                    {@code PAYMENT_AMOUNT_MISMATCH}로 떨어뜨린다
     */
    public static TxReceipt reverted(String txHash, String failureCode) {
        return new TxReceipt(txHash, false, null, null, 0L, List.of(), failureCode);
    }

    /**
     * 파싱된 이벤트 하나. {@code args}의 값 타입은 {@code Long}(숫자)·{@code String}(주소·bytes32)만
     * 쓴다 — 체인 모듈이 무엇으로 파싱하든 이 두 가지로 정규화해서 넘긴다.
     */
    public record TxEvent(String name, Map<String, Object> args) {

        public Optional<Long> number(String key) {
            Object v = args == null ? null : args.get(key);
            if (v instanceof Number n) {
                return Optional.of(n.longValue());
            }
            return Optional.empty();
        }

        public Optional<String> text(String key) {
            Object v = args == null ? null : args.get(key);
            return v instanceof String s ? Optional.of(s) : Optional.empty();
        }
    }
}
