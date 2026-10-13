package com.ssafy.b204.chain.service;

import com.ssafy.b204.chain.dto.ChainDtos.SignRequest;
import com.ssafy.b204.chain.support.ContractCalls;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * {@code prepare} 응답의 {@code signRequests} 조립 — API v6 §0.4 ①.
 *
 * <p>세 도메인이 같은 모양을 쓴다 — 보증금(API-performance-13) · 규칙 동의(API-rule-03) ·
 * 결제(API-payment-01·02). 도메인마다 따로 만들면 {@code txType}·{@code chainId}·{@code value}가
 * 서로 달라지고, 프론트는 그 차이를 런타임에야 발견한다.
 *
 * <p>고정값(§0.4 표)
 *
 * <ul>
 *   <li>{@code txType} — 항상 {@code FEE_DELEGATED_SMART_CONTRACT_EXECUTION}
 *   <li>{@code value} — 항상 {@code "0x0"}(YoYo는 ERC-20이다)
 *   <li>{@code chainId} — {@code "0x3e9"}(Kaia Kairos 1001)
 *   <li>{@code feePayer} — 운영지갑 <b>주소</b>. §0.7 비노출 규칙의 유일한 예외
 * </ul>
 *
 * <p>컨트랙트 주소가 설정돼 있지 않으면 서명 파라미터를 만들 수 없다 —
 * {@code COMMON_EXTERNAL_SERVICE_ERROR}(502)다(API-rule-03·API-payment-01의 502 행).
 */
@Service
@RequiredArgsConstructor
public class SignRequestFactory {

    public static final String TX_TYPE = "FEE_DELEGATED_SMART_CONTRACT_EXECUTION";
    public static final String ZERO_VALUE = "0x0";

    /** 서명 화면 힌트용 가스 한도. 수수료는 전액 대납이라 상한 힌트일 뿐이다(§0.4). */
    public static final long GAS_APPROVE = 0x11170L;
    public static final long GAS_PURCHASE = 0x30d40L;
    public static final long GAS_DEPOSIT = 0x30d40L;
    public static final long GAS_AGREE = 0x186a0L;

    private final ChainProperties chainProperties;
    private final FeeDelegationService feeDelegationService;

    /** YoYo 컨트랙트 주소. 미설정이면 502. */
    public String yoyoAddress() {
        return requireContractAddress(
                chainProperties.contract() == null ? null : chainProperties.contract().yoyoAddress());
    }

    /** RevenueSplitter 주소. {@code purchase}·{@code deposit}·{@code agreeToRules}의 {@code to}다. */
    public String splitterAddress() {
        return requireContractAddress(
                chainProperties.contract() == null ? null : chainProperties.contract().splitterAddress());
    }

    /**
     * {@code chain_job.fee_payer_address} 기록용 — <b>없으면 {@code null}</b>이다.
     *
     * <p>운영 키가 서버에 있으면 그 주소를 쓰고, 없으면 설정값 {@code OPERATOR_ADDRESS}로 떨어진다.
     * 이 값은 응답 스키마가 아니라 job 로그 컬럼(nullable)으로만 나가므로 비어도 된다.
     * 응답에 담는 자리는 {@link #requireFeePayerAddress()}를 쓴다.
     */
    public String feePayerAddress() {
        return feeDelegationService.feePayerAddress()
                .orElseGet(() -> chainProperties.hasFeePayerAddress()
                        ? chainProperties.operatorAddress() : null);
    }

    /**
     * §0.4 {@code signRequests[].feePayer} — <b>미설정이면 502</b>.
     *
     * <p>{@code openapi.base.yaml}의 {@code SignRequest.required}에 {@code feePayer}가 있고
     * nullable이 아니다. 생략하면 생성 타입 {@code feePayer: Address}가 거짓말이 되고, 그 값을
     * 대납 tx 필드로 쓰는 지갑 어댑터가 {@code undefined}로 서명을 만들게 된다(QA 2026-09-09
     * A-0-1·B-2-2). "수수료를 서비스가 낸다"를 확인시키지 못하는 서명 파라미터는 §0.4가 요구하는
     * 물건이 아니므로, {@code to}(컨트랙트 주소)가 비었을 때와 <b>같은 규칙</b>으로 끊는다 —
     * {@link #requireContractAddress}와 같은 {@code COMMON_EXTERNAL_SERVICE_ERROR}(502)다
     * (API-rule-03·API-payment-01·API-performance-13의 502 행).
     *
     * <p>운영 배포에서는 {@code OPERATOR_ADDRESS}가 필수 env라 이 경로가 돌 일이 없다
     * (`.env.example` · `docker-compose.yml`). 키·주소가 모두 빈 로컬에서는 어차피
     * {@code to}에서 먼저 502가 난다 — 새로 막히는 조합은 "컨트랙트 주소는 있고
     * {@code OPERATOR_ADDRESS}만 빈" 설정 하나뿐이고, 그것은 설정 결손이다.
     */
    public String requireFeePayerAddress() {
        String address = feePayerAddress();
        if (address == null || address.isBlank()) {
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR);
        }
        return address;
    }

    /** {@code YoYo.approve(splitter, amount)} — 자금 이동 권한 승인. */
    public SignRequest approve(long amount, boolean required, Map<String, Object> summary) {
        return build("APPROVE", required, yoyoAddress(),
                ContractCalls.approve(splitterAddress(), amount), GAS_APPROVE, summary);
    }

    /** {@code RevenueSplitter.purchase(...)} — 결제와 관객 선택을 한 tx에 담는다. */
    public SignRequest purchase(long showId, String orderRef, int teamIndex, long amount,
                                int quantity, Map<String, Object> summary) {
        return build("PURCHASE", true, splitterAddress(),
                ContractCalls.purchase(showId, orderRef, teamIndex, amount, quantity),
                GAS_PURCHASE, summary);
    }

    /** {@code RevenueSplitter.deposit(showId)} — 생성팀 리더의 보증금 납부. */
    public SignRequest deposit(long showId, Map<String, Object> summary) {
        return build("DEPOSIT", true, splitterAddress(), ContractCalls.deposit(showId),
                GAS_DEPOSIT, summary);
    }

    /** {@code RevenueSplitter.agreeToRules(showId, rulesHash)} — 자금 이동이 없다. */
    public SignRequest agree(long showId, String rulesHash, Map<String, Object> summary) {
        return build("AGREE", true, splitterAddress(),
                ContractCalls.agreeToRules(showId, rulesHash), GAS_AGREE, summary);
    }

    private SignRequest build(String kind, boolean required, String to, String data, long gas,
                              Map<String, Object> summary) {
        return new SignRequest(kind, required, TX_TYPE, to, data, ZERO_VALUE,
                chainProperties.chainIdHex(), ContractCalls.gasHint(gas), requireFeePayerAddress(),
                summary);
    }

    private static String requireContractAddress(String address) {
        if (address == null || address.isBlank()) {
            // 서명 파라미터의 to 를 지어낼 수 없다. 지어내면 사용자가 엉뚱한 주소에 서명한다.
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR);
        }
        return address;
    }
}
