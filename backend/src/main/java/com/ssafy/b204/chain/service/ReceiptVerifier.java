package com.ssafy.b204.chain.service;

import com.ssafy.b204.chain.dto.ChainDtos.Verification;
import com.ssafy.b204.chain.entity.ChainJob;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import org.web3j.utils.Numeric;

/**
 * receipt 검증 — API v6 §0.4 "④ receipt 검증 5항목".
 *
 * <blockquote>1) status == 1 · 2) to == 서버가 내려준 컨트랙트 주소 · 3) from == 등록 지갑 주소 ·
 * 4) 기대 이벤트가 로그에 존재 · 5) 이벤트 인자가 서버 상태와 일치</blockquote>
 *
 * <p><b>이 클래스가 보는 것은 1~3이다.</b> 4·5는 {@link ChainJobConfirmationService}가 본다 —
 * 이벤트 인자를 <b>서버 상태와 대조</b>해야 하므로(주문·결제·규칙) 도메인을 아는 쪽에서 판정하는
 * 것이 맞고, 판정이 두 곳에 생기면 서로 어긋난다. 여기서는 {@link ReceiptEvents}가 뽑아 준
 * 이벤트로 {@code checks.eventPresent}(= "무엇을 보고 있었나")만 채운다.
 *
 * <p>{@code status}만 보고 성공으로 판정하지 않는 이유: revert되지 않았을 뿐 우리가 기대한 일이
 * 일어나지 않은 tx도 {@code status=1}이다(b204-stack "receipt 수신 후 이벤트 파싱으로 성공 판정").
 * 그래서 <b>이 검증을 통과했다는 것은 "확정해도 좋다"가 아니라 "도메인 대조로 넘겨도 좋다"</b>는
 * 뜻이다({@code ChainJobWorker.confirmDomain}).
 */
@Component
@RequiredArgsConstructor
public class ReceiptVerifier {

    private static final String STATUS_SUCCESS = "0x1";

    /** §0.4 ④의 4 — 기대 이벤트가 로그에 있었는가. 인자 대조(5)는 확정 서비스 몫이다. */
    public static final String CHECK_EVENT = "eventPresent";

    /**
     * @param expectedTo   서버가 prepare에서 내려준 컨트랙트 주소. {@code null}이면 검사 생략
     * @param expectedFrom 요청자의 등록 지갑 주소. OPERATOR job은 운영지갑이므로 {@code null}
     */
    public Verification verify(ChainJob job, TransactionReceipt receipt,
                               String expectedTo, String expectedFrom) {
        return verify(job, receipt, expectedTo, expectedFrom, null);
    }

    /**
     * @param parsed {@link ReceiptEvents}가 뽑은 이벤트. {@code null}이면 <b>4·5를 검사하지 않았다</b>는
     *               뜻이고 {@code checks.eventPresent}가 {@code false}로 남는다
     */
    public Verification verify(ChainJob job, TransactionReceipt receipt,
                               String expectedTo, String expectedFrom, TxReceipt parsed) {
        Map<String, Boolean> checks = new LinkedHashMap<>();
        List<String> mismatch = new ArrayList<>();

        boolean statusOk = receipt != null && STATUS_SUCCESS.equalsIgnoreCase(receipt.getStatus());
        checks.put("status", statusOk);
        if (!statusOk) {
            mismatch.add("status");
        }

        if (receipt != null && expectedTo != null) {
            boolean toOk = equalsAddress(receipt.getTo(), expectedTo);
            checks.put("to", toOk);
            if (!toOk) {
                mismatch.add("to");
            }
        }
        if (receipt != null && expectedFrom != null) {
            boolean fromOk = equalsAddress(receipt.getFrom(), expectedFrom);
            checks.put("from", fromOk);
            if (!fromOk) {
                mismatch.add("from");
            }
        }

        // 4 — 기대 이벤트가 로그에 있는가. ABI가 고정돼 이제 실제로 볼 수 있다.
        //
        // <b>성공 판정(verified)에는 넣지 않는다.</b> 4·5(인자 일치)의 판정은
        // ChainJobConfirmationService 가 도메인 상태와 대조하며 하고, 그쪽이 실패하면 job 을
        // FAILED 로 고정한다. 여기서도 막으면 같은 판정이 두 곳에 생겨 서로 어긋난다 —
        // 이 값은 "무엇을 보고 있었나"를 남기는 표식이다.
        String expectedEvent = expectedEventOf(job);
        checks.put(CHECK_EVENT, parsed != null && expectedEvent != null
                && parsed.event(expectedEvent).isPresent());

        boolean verified = mismatch.isEmpty() && statusOk;
        return new Verification(verified, expectedEvent, checks, mismatch);
    }

    /**
     * 작업 유형별 기대 이벤트 이름 — 계약 문서 §4.3 시그니처의 이름 그대로다.
     *
     * <p>실제 로그에서 그 이름을 찾는 일은 {@link ReceiptEvents}가 하고(topic0은 ABI 생성물이
     * 만든다), 인자까지 서버 상태와 대조하는 일은 {@link ChainJobConfirmationService}가 한다.
     *
     * <p><b>{@code LOCK}은 이제 정산 잠금 하나다</b>({@code SettlementLocked}). 판매 시작은
     * {@code START_SALE}({@code SaleStarted})로 갈렸다 — 종전에는 두 뜻이 한 ENUM 값을 써서
     * 멱등키 접두로 갈랐고, 그 판정이 어긋나면 성공한 tx 가 실패로 기록됐다(S15P21B204-67).
     *
     * <p><b>{@code REFUND}는 이제 여기 있다</b>({@code Refunded}) — 환불 확정이
     * {@link ChainJobConfirmationService#confirm}에서 티켓·재고·주문을 전이시키므로 인자까지
     * 실제로 대조한다(API-refund-02·API-performance-12).
     *
     * <p>{@code HALT}는 확정 시 정산을 {@code HALTED}로 보내지만({@code confirmHalt}) 여기에는
     * 없다 — 대조할 인자가 {@code showId} 하나뿐이고 그것은
     * {@code chain_job.target_performance_id} + {@code to} 대조가 이미 묶는다({@code LOCK}과 같다).
     *
     * <p>나머지 5종({@code DEPOSIT_RETURN}·{@code DEPOSIT_FORFEIT}·{@code AGGREGATE}·
     * {@code RELEASE}·{@code HALT})은 이 검증을 지나지 않는다 — 확정 후 상태 전이를 정산
     * 도메인이 {@code CONFIRMED} 훑기로 하기 때문이다. 이름을 여기 적어 두면 "검사한다"는
     * 오해를 준다.
     */
    public String expectedEventOf(ChainJob job) {
        if (job == null || job.getTxType() == null) {
            return null;
        }
        return switch (job.getTxType()) {
            case APPROVE -> "Approval";
            case PURCHASE -> "Purchased";
            case DEPOSIT -> "DepositPaid";
            case AGREE -> "RulesAgreed";
            case MINT -> "Minted";
            case CREATE_SHOW -> "ShowCreated";
            case START_SALE -> "SaleStarted";
            case UPDATE_RULES -> "RulesUpdated";
            case LOCK -> "SettlementLocked";
            case REFUND -> "Refunded";
            default -> null;
        };
    }

    private static boolean equalsAddress(String left, String right) {
        if (left == null || right == null) {
            return false;
        }
        return Numeric.cleanHexPrefix(left.trim()).toLowerCase(Locale.ROOT)
                .equals(Numeric.cleanHexPrefix(right.trim()).toLowerCase(Locale.ROOT));
    }
}
