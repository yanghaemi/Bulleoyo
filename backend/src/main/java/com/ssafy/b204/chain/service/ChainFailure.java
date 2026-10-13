package com.ssafy.b204.chain.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.common.error.ErrorCode;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.web3j.utils.Numeric;

/**
 * {@code chain_job.failure_reason} 문자열 규약.
 *
 * <p>ERD v5와 엔티티 주석이 이 컬럼에 <b>규격 §3의 code 문자열</b>을 넣으라고 정했고, 체인 revert
 * 원문은 넣지 않는다(SEC-09). 그런데 실패 진단에는 revert의 <b>custom error selector 4바이트</b>가
 * 사실상 유일한 단서다 — Solidity custom error는 문자열을 남기지 않는다.
 *
 * <p>그래서 <b>{@code CODE#0xdeadbeef} 한 형태</b>만 허용한다. {@code #} 앞은 언제나 규격 코드고,
 * 뒤는 있으면 selector hex다. API 응답에는 {@link #codeOf(String)}로 <b>앞부분만</b> 내려간다 —
 * 클라이언트가 보는 {@code failureReason}은 여전히 순수한 코드 문자열이다.
 *
 * <p>selector → <b>custom error 이름</b>은 ABI 생성물
 * {@link com.ssafy.b204.chain.contract.ContractErrors}가 안다(운영 로그·진단용).
 * selector → <b>규격 ErrorCode</b> 매핑({@link #KNOWN_SELECTORS})은 컨트랙트 인터페이스 v1
 * §4.6 표가 정본이며 <b>그 표에 있는 것만</b> 담는다 — 이름은 ABI의 사실이지만 코드는 정책이고,
 * 표 밖을 임의로 정하면 컨트랙트가 바뀔 때 조용히 틀린 사유를 사용자에게 보여주게 된다.
 */
public final class ChainFailure {

    /**
     * selector(4바이트 hex) → 규격 코드. <b>정본은 컨트랙트 인터페이스 v1 §4.6 표</b>이고 여기는
     * 그 표를 selector로 옮겨 적은 것이다. 이름 ↔ selector 대응은
     * {@link com.ssafy.b204.chain.contract.ContractErrors}(ABI 생성물)에서 왔다.
     *
     * <p><b>표에 없는 selector는 넣지 않는다.</b> 모르는 revert는
     * {@link ErrorCode#COMMON_INTERNAL_ERROR}로 남고 selector가 접미로 보존되므로
     * ({@link #of(ErrorCode, String)}) 나중에 표가 늘어도 과거 job의 원인을 되짚을 수 있다.
     * 새 {@code ErrorCode}는 만들지 않는다 — §4.6이 지정한 기존 코드만 쓴다.
     */
    static final Map<String, ErrorCode> KNOWN_SELECTORS = Map.ofEntries(
            // 서버가 잘못된 키로 서명했다는 뜻 = 서버 버그. 알림 대상은 SERVER_FAULT_SELECTORS 가 정한다.
            Map.entry("0x7c214f04", ErrorCode.COMMON_FORBIDDEN),             // NotOperator()
            Map.entry("0xe9f3e974", ErrorCode.COMMON_FORBIDDEN),             // NotTeam()
            Map.entry("0x8ff4f0c9", ErrorCode.COMMON_FORBIDDEN),             // NotHost()
            Map.entry("0xe2517d3f", ErrorCode.COMMON_FORBIDDEN),             // AccessControlUnauthorizedAccount(address,bytes32)
            Map.entry("0xd6758507", ErrorCode.COMMON_FORBIDDEN),             // RoleManagementDisabled()
            Map.entry("0x1441b94d", ErrorCode.COMMON_FORBIDDEN),             // RoleConflict()

            // 규칙 잠금 계열.
            Map.entry("0x85be50ba", ErrorCode.RULE_ALREADY_LOCKED),          // RulesLocked()
            Map.entry("0xc32b9bd9", ErrorCode.RULE_NOT_AGREED_BY_ALL),       // NotAllAgreed()
            Map.entry("0x53a1fdc4", ErrorCode.RULE_HASH_MISMATCH),           // RulesHashMismatch()

            // 이미 처리된 요청.
            Map.entry("0x193333f0", ErrorCode.COMMON_CONFLICT),              // AlreadyAgreed()
            Map.entry("0xd659f4ab", ErrorCode.COMMON_CONFLICT),              // AlreadyPurchased(bytes32)
            Map.entry("0xa85e6f1a", ErrorCode.COMMON_CONFLICT),              // AlreadyRefunded()
            Map.entry("0x9581f9ab", ErrorCode.COMMON_CONFLICT),              // ShowAlreadyExists(uint256)
            // GrantRefUsed 는 실패가 아니라 동기화다 — §4.6 "실패 처리 금지". 기존 MINT job 을
            // ChainJobConfirmationService.syncGrantAlreadyUsed 로 CONFIRMED 로 맞춰야 하고,
            // 여기 코드는 그 분기를 놓쳤을 때 남는 최후의 값이다.
            Map.entry("0xce43a105", ErrorCode.COMMON_CONFLICT),              // GrantRefUsed(bytes32)
            Map.entry("0xe450d38c", ErrorCode.COMMON_CONFLICT),              // ERC20InsufficientBalance(...)
            Map.entry("0xd93c0665", ErrorCode.COMMON_CONFLICT),              // EnforcedPause()

            // 판매·보증금 단계.
            Map.entry("0x2d0a346e", ErrorCode.TICKET_SALE_NOT_STARTED),      // SaleNotStarted()
            Map.entry("0x29449334", ErrorCode.TICKET_PURCHASE_LIMIT_EXCEEDED), // QuantityLimitExceeded(uint16,uint16)
            Map.entry("0xda83c882", ErrorCode.PERFORMANCE_INVALID_STATUS),   // DepositRequired()
            Map.entry("0x3febdfae", ErrorCode.PERFORMANCE_INVALID_STATUS),   // DepositAlreadyPaid()
            Map.entry("0x2b285016", ErrorCode.PERFORMANCE_INVALID_STATUS),   // NoDepositToReturn()
            Map.entry("0x88e16c77", ErrorCode.PERFORMANCE_INVALID_STATUS),   // ShowHalted()
            // InvalidStage(expected, actual) 는 §4.6 이 actual 값으로 분기하라고 정했는데
            // (SETTLEMENT_NOT_LOCKED / SETTLEMENT_ALREADY_RELEASED / PERFORMANCE_INVALID_STATUS)
            // 워커는 지금 selector 4바이트만 뽑고 인자를 디코드하지 않는다. 인자 디코드가 붙기 전까지
            // 가장 넓은 값으로 둔다 — 없는 사유를 지어내는 것보다 낫다.
            Map.entry("0x6a7748c2", ErrorCode.PERFORMANCE_INVALID_STATUS),   // InvalidStage(uint8,uint8)

            // 서버 DB 와 온체인이 어긋난 상태. 알림 대상이다.
            Map.entry("0x2630f88b", ErrorCode.COMMON_NOT_FOUND),             // ShowNotFound(uint256)
            Map.entry("0x2630502c", ErrorCode.COMMON_NOT_FOUND),             // PurchaseNotFound(bytes32)

            // 정산 불변식.
            Map.entry("0xdeb6c1b6", ErrorCode.SETTLEMENT_AGGREGATE_MISMATCH), // AggregateMismatch(uint256,uint256)
            Map.entry("0x90b8ab88", ErrorCode.COIN_ESCROW_INSUFFICIENT),     // InsufficientEscrow()

            // 결제 승인 부족 — §16.1 PAYMENT_ALLOWANCE_INSUFFICIENT 는 신설 제안이라 쓰지 않는다.
            Map.entry("0xfb8f41b2", ErrorCode.PAYMENT_AMOUNT_MISMATCH),      // ERC20InsufficientAllowance(...)

            // 인자 검증 — 여기까지 왔다는 것은 서버 prepare 검증이 뚫렸다는 뜻이다.
            Map.entry("0x4626d493", ErrorCode.COMMON_VALIDATION_FAILED),     // TeamIndexOutOfRange()
            Map.entry("0x639b0f1a", ErrorCode.COMMON_VALIDATION_FAILED),     // InvalidBpSum()
            Map.entry("0xf90ca9d3", ErrorCode.COMMON_VALIDATION_FAILED),     // InvalidTeamCount()
            Map.entry("0xa44ea8ba", ErrorCode.COMMON_VALIDATION_FAILED),     // HostIndexOutOfRange()
            Map.entry("0xa24a13a6", ErrorCode.COMMON_VALIDATION_FAILED),     // ArrayLengthMismatch()
            Map.entry("0xa8e475a8", ErrorCode.COMMON_VALIDATION_FAILED),     // DuplicateTeamWallet(address)
            Map.entry("0x17bc077c", ErrorCode.COMMON_VALIDATION_FAILED),     // ReservedAddress(address)
            Map.entry("0xd92e233d", ErrorCode.COMMON_VALIDATION_FAILED),     // ZeroAddress()
            Map.entry("0x1f2a2005", ErrorCode.COMMON_VALIDATION_FAILED),     // ZeroAmount()
            Map.entry("0xf4f5b733", ErrorCode.COMMON_VALIDATION_FAILED),     // ZeroQuantity()
            Map.entry("0xac6e2a97", ErrorCode.COMMON_VALIDATION_FAILED),     // ZeroRulesHash()
            Map.entry("0x64c2f6f7", ErrorCode.COMMON_VALIDATION_FAILED),     // ZeroOrderRef()
            Map.entry("0xf3007e85", ErrorCode.COMMON_VALIDATION_FAILED),     // RefundExceedsPurchase()
            Map.entry("0x0773781e", ErrorCode.COMMON_VALIDATION_FAILED),     // ZeroGrantRef()

            // 정상 경로에서 나올 수 없다 — 나오면 즉시 조사.
            Map.entry("0x3ee5aeb5", ErrorCode.COMMON_INTERNAL_ERROR),        // ReentrancyGuardReentrantCall()
            Map.entry("0xd6234725", ErrorCode.COMMON_INTERNAL_ERROR));       // NotImplemented()

    /**
     * <b>서버 결함</b> revert — 사용자 입력이나 경합이 아니라 서버가 틀린 키로 서명했거나 틀린 calldata 를
     * 만들었다는 뜻이다. {@code ChainJobWorker}가 이 selector 로 job 을 {@code FAILED} 로 닫으면 운영자에게
     * 알린다(S15P21B204-78). 이름은 전부 {@link com.ssafy.b204.chain.contract.ContractErrors}(ABI)에 있다.
     *
     * <ul>
     *   <li>권한: {@code NotOperator}·{@code AccessControlUnauthorizedAccount} — 서버가 고른 서명 키가 틀렸다.
     *   <li>{@code NotHost}·{@code NotTeam} — <b>OPERATOR job 일 때만</b>({@link #OPERATOR_ONLY_FAULT_SELECTORS}).
     *       {@code onlyHostOf}({@code deposit})·{@code onlyTeamOf}({@code agreeToRules})는 사용자 서명(대납)
     *       tx 에서도 난다 — 리더가 다른 지갑으로 서명했으면 사용자 쪽 원인이다.
     *   <li>{@code RoleConflict}·{@code RoleManagementDisabled} — 둘 다 역할 관리 함수(admin 전용
     *       {@code rotate*}, 봉인된 {@code grantRole}·{@code revokeRole}·{@code renounceRole})와 생성자에서만
     *       난다. 서버는 그 함수를 부르지 않으므로 chain_job 에서 보이면 서버가 calldata 를 잘못 만든 것이다.
     *   <li>0 값: {@code ZeroOrderRef}·{@code ZeroGrantRef}·{@code ZeroRulesHash}·{@code ZeroAmount} — 전부
     *       서버가 채우는 인자다.
     * </ul>
     */
    // public 인 이유는 하나 — 다른 패키지의 테스트가 크기를 단정해 여분 selector 를 잡는다(!110 리뷰).
    public static final Set<String> SERVER_FAULT_SELECTORS = Set.of(
            "0x7c214f04", // NotOperator()
            "0x8ff4f0c9", // NotHost()
            "0xe9f3e974", // NotTeam()
            "0xe2517d3f", // AccessControlUnauthorizedAccount(address,bytes32)
            "0x1441b94d", // RoleConflict()
            "0xd6758507", // RoleManagementDisabled()
            "0x64c2f6f7", // ZeroOrderRef()
            "0x0773781e", // ZeroGrantRef()
            "0xac6e2a97", // ZeroRulesHash()
            "0x1f2a2005"); // ZeroAmount()

    private ChainFailure() {
    }

    /** {@link #SERVER_FAULT_SELECTORS} 중 사용자 서명 tx 에서도 나는 것 — OPERATOR job 일 때만 서버 결함이다. */
    static final Set<String> OPERATOR_ONLY_FAULT_SELECTORS = Set.of(
            "0x8ff4f0c9", // NotHost()   — RevenueSplitter.onlyHostOf(deposit)
            "0xe9f3e974"); // NotTeam()  — RevenueSplitter.onlyTeamOf(agreeToRules)

    /** 운영자 알림 대상 revert 인가 — {@link #SERVER_FAULT_SELECTORS}. */
    public static boolean isServerFault(String selectorHex, ChainJob.SignerType signerType) {
        if (selectorHex == null) {
            return false;
        }
        String selector = selectorHex.toLowerCase(Locale.ROOT);
        return SERVER_FAULT_SELECTORS.contains(selector)
                && (signerType == ChainJob.SignerType.OPERATOR || !OPERATOR_ONLY_FAULT_SELECTORS.contains(selector));
    }

    /** 코드만. selector가 없을 때. */
    public static String of(ErrorCode code) {
        return code.name();
    }

    /** 코드 + selector. selector가 없거나 형식이 아니면 코드만 남는다. */
    public static String of(ErrorCode code, String selectorHex) {
        return selectorHex == null || selectorHex.isBlank()
                ? code.name()
                : code.name() + "#" + selectorHex.toLowerCase(Locale.ROOT);
    }

    /** 저장된 문자열에서 규격 코드만 뽑는다. API 응답에는 이 값이 나간다. */
    public static String codeOf(String failureReason) {
        if (failureReason == null) {
            return null;
        }
        int hash = failureReason.indexOf('#');
        return hash < 0 ? failureReason : failureReason.substring(0, hash);
    }

    /** 저장된 문자열에서 selector만 뽑는다. 운영 진단용이며 응답에 넣지 않는다. */
    public static Optional<String> selectorOf(String failureReason) {
        if (failureReason == null) {
            return Optional.empty();
        }
        int hash = failureReason.indexOf('#');
        return hash < 0 ? Optional.empty() : Optional.of(failureReason.substring(hash + 1));
    }

    /**
     * revert 데이터 → custom error selector(앞 4바이트).
     *
     * <p>{@code Error(string)}(= {@code require} 문자열)도 {@code 0x08c379a0} 셀렉터로 시작하므로
     * 같은 방식으로 잡힌다. 데이터가 4바이트 미만이면 셀렉터가 아니다(빈 revert).
     */
    public static Optional<String> extractSelector(String revertDataHex) {
        if (revertDataHex == null) {
            return Optional.empty();
        }
        String clean = Numeric.cleanHexPrefix(revertDataHex.trim());
        if (clean.length() < 8) {
            return Optional.empty();
        }
        return Optional.of("0x" + clean.substring(0, 8).toLowerCase(Locale.ROOT));
    }

    /**
     * selector → 규격 코드(§4.6). 표에 없으면 {@code COMMON_INTERNAL_ERROR}다 —
     * 체인 실패에 새 에러 코드를 만들지 않는다(금지 사항).
     */
    public static ErrorCode toErrorCode(String selectorHex) {
        if (selectorHex == null) {
            return ErrorCode.COMMON_INTERNAL_ERROR;
        }
        return KNOWN_SELECTORS.getOrDefault(selectorHex.toLowerCase(Locale.ROOT),
                ErrorCode.COMMON_INTERNAL_ERROR);
    }
}
