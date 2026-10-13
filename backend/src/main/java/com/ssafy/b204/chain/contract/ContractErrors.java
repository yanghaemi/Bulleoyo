package com.ssafy.b204.chain.contract;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.web3j.utils.Numeric;

/**
 * Solidity custom error selector → 에러 이름. <b>생성물이다 — 손으로 고치지 않는다.</b>
 *
 * <p>web3j 4.9 codegen은 ABI의 {@code type=="error"} 항목을 클래스로 만들지 않는다. 그래서 revert
 * 데이터 앞 4바이트를 이름으로 되돌릴 표가 따로 필요하다 — Solidity custom error는 문자열을 남기지
 * 않으므로 이 표가 실패 진단의 유일한 단서다.
 *
 * <p><b>재생성 방법</b> (ABI가 바뀌면 래퍼와 함께 다시 만든다)
 *
 * <pre>
 *   # 1) ABI에서 error 시그니처 추출:  이름(타입,…)  — tuple은 (t1,t2) 로 펼친다
 *   # 2) 각 시그니처를 keccak256 → 앞 4바이트가 selector
 *   #    org.web3j.crypto.Hash.sha3String(sig).substring(0, 10)
 *   # 3) 아래 Map.entry 목록을 통째로 교체
 *   bash gradlew generateContractWrappers -PabiDir=../blockchain/deployments/abi
 * </pre>
 *
 * <p>YoYo 16개 + RevenueSplitter 40개 = 56개 중 <b>6개가 두 컨트랙트에 공통</b>(OpenZeppelin
 * AccessControl·공용 가드)이라 고유 selector는 50개다.
 *
 * <p>selector → 규격 {@code ErrorCode} 매핑은 여기 두지 않는다. 그 표는 컨트랙트 인터페이스가
 * 고정된 뒤 {@link com.ssafy.b204.chain.service.ChainFailure} 쪽에 붙인다 — 여기는 ABI의 사실만
 * 담고, 사실을 정책으로 번역하는 일은 한 곳에서 한다.
 */
public final class ContractErrors {

    /** selector(4바이트 소문자 hex) → custom error 이름. 주석은 원본 시그니처와 소속 컨트랙트다. */
    public static final Map<String, String> BY_SELECTOR = Map.ofEntries(
            Map.entry("0x6697b232", "AccessControlBadConfirmation"), // AccessControlBadConfirmation() · YoYo+RevenueSplitter
            Map.entry("0xe2517d3f", "AccessControlUnauthorizedAccount"), // AccessControlUnauthorizedAccount(address,bytes32) · YoYo+RevenueSplitter
            Map.entry("0xfb8f41b2", "ERC20InsufficientAllowance"), // ERC20InsufficientAllowance(address,uint256,uint256) · YoYo
            Map.entry("0xe450d38c", "ERC20InsufficientBalance"), // ERC20InsufficientBalance(address,uint256,uint256) · YoYo
            Map.entry("0xe602df05", "ERC20InvalidApprover"), // ERC20InvalidApprover(address) · YoYo
            Map.entry("0xec442f05", "ERC20InvalidReceiver"), // ERC20InvalidReceiver(address) · YoYo
            Map.entry("0x96c6fd1e", "ERC20InvalidSender"), // ERC20InvalidSender(address) · YoYo
            Map.entry("0x94280d62", "ERC20InvalidSpender"), // ERC20InvalidSpender(address) · YoYo
            Map.entry("0xd93c0665", "EnforcedPause"), // EnforcedPause() · YoYo
            Map.entry("0x8dfc202b", "ExpectedPause"), // ExpectedPause() · YoYo
            Map.entry("0xce43a105", "GrantRefUsed"), // GrantRefUsed(bytes32) · YoYo
            Map.entry("0x1441b94d", "RoleConflict"), // RoleConflict() · YoYo+RevenueSplitter
            Map.entry("0xd6758507", "RoleManagementDisabled"), // RoleManagementDisabled() · YoYo+RevenueSplitter
            Map.entry("0xd92e233d", "ZeroAddress"), // ZeroAddress() · YoYo+RevenueSplitter
            Map.entry("0x1f2a2005", "ZeroAmount"), // ZeroAmount() · YoYo+RevenueSplitter
            Map.entry("0x0773781e", "ZeroGrantRef"), // ZeroGrantRef() · YoYo
            Map.entry("0xdeb6c1b6", "AggregateMismatch"), // AggregateMismatch(uint256,uint256) · RevenueSplitter
            Map.entry("0x193333f0", "AlreadyAgreed"), // AlreadyAgreed() · RevenueSplitter
            Map.entry("0xd659f4ab", "AlreadyPurchased"), // AlreadyPurchased(bytes32) · RevenueSplitter
            Map.entry("0xa85e6f1a", "AlreadyRefunded"), // AlreadyRefunded() · RevenueSplitter
            Map.entry("0xa24a13a6", "ArrayLengthMismatch"), // ArrayLengthMismatch() · RevenueSplitter
            Map.entry("0x3febdfae", "DepositAlreadyPaid"), // DepositAlreadyPaid() · RevenueSplitter
            Map.entry("0xda83c882", "DepositRequired"), // DepositRequired() · RevenueSplitter
            Map.entry("0xa8e475a8", "DuplicateTeamWallet"), // DuplicateTeamWallet(address) · RevenueSplitter
            Map.entry("0xa44ea8ba", "HostIndexOutOfRange"), // HostIndexOutOfRange() · RevenueSplitter
            Map.entry("0x90b8ab88", "InsufficientEscrow"), // InsufficientEscrow() · RevenueSplitter
            Map.entry("0x639b0f1a", "InvalidBpSum"), // InvalidBpSum() · RevenueSplitter
            Map.entry("0x6a7748c2", "InvalidStage"), // InvalidStage(uint8,uint8) · RevenueSplitter
            Map.entry("0xf90ca9d3", "InvalidTeamCount"), // InvalidTeamCount() · RevenueSplitter
            Map.entry("0x2b285016", "NoDepositToReturn"), // NoDepositToReturn() · RevenueSplitter
            Map.entry("0xc32b9bd9", "NotAllAgreed"), // NotAllAgreed() · RevenueSplitter
            Map.entry("0x8ff4f0c9", "NotHost"), // NotHost() · RevenueSplitter
            Map.entry("0xd6234725", "NotImplemented"), // NotImplemented() · RevenueSplitter
            Map.entry("0x7c214f04", "NotOperator"), // NotOperator() · RevenueSplitter
            Map.entry("0xe9f3e974", "NotTeam"), // NotTeam() · RevenueSplitter
            Map.entry("0x2630502c", "PurchaseNotFound"), // PurchaseNotFound(bytes32) · RevenueSplitter
            Map.entry("0x29449334", "QuantityLimitExceeded"), // QuantityLimitExceeded(uint16,uint16) · RevenueSplitter
            Map.entry("0x3ee5aeb5", "ReentrancyGuardReentrantCall"), // ReentrancyGuardReentrantCall() · RevenueSplitter
            Map.entry("0xf3007e85", "RefundExceedsPurchase"), // RefundExceedsPurchase() · RevenueSplitter
            Map.entry("0x17bc077c", "ReservedAddress"), // ReservedAddress(address) · RevenueSplitter
            Map.entry("0x5274afe7", "SafeERC20FailedOperation"), // SafeERC20FailedOperation(address) · RevenueSplitter (Phase B, OZ SafeERC20)
            Map.entry("0x53a1fdc4", "RulesHashMismatch"), // RulesHashMismatch() · RevenueSplitter
            Map.entry("0x85be50ba", "RulesLocked"), // RulesLocked() · RevenueSplitter
            Map.entry("0x2d0a346e", "SaleNotStarted"), // SaleNotStarted() · RevenueSplitter
            Map.entry("0x9581f9ab", "ShowAlreadyExists"), // ShowAlreadyExists(uint256) · RevenueSplitter
            Map.entry("0x88e16c77", "ShowHalted"), // ShowHalted() · RevenueSplitter
            Map.entry("0x2630f88b", "ShowNotFound"), // ShowNotFound(uint256) · RevenueSplitter
            Map.entry("0x4626d493", "TeamIndexOutOfRange"), // TeamIndexOutOfRange() · RevenueSplitter
            Map.entry("0x64c2f6f7", "ZeroOrderRef"), // ZeroOrderRef() · RevenueSplitter
            Map.entry("0xf4f5b733", "ZeroQuantity"), // ZeroQuantity() · RevenueSplitter
            Map.entry("0xac6e2a97", "ZeroRulesHash") // ZeroRulesHash() · RevenueSplitter
    );

    private ContractErrors() {
    }

    /**
     * revert 데이터 → 에러 이름. 4바이트 미만이거나 모르는 selector면 비어 있다
     * ({@code Error(string)} = {@code 0x08c379a0} 같은 표준 revert도 표에 없어 비어 나온다).
     */
    public static Optional<String> nameOf(byte[] revertData) {
        if (revertData == null || revertData.length < 4) {
            return Optional.empty();
        }
        return nameOfSelector(Numeric.toHexString(revertData, 0, 4, true));
    }

    /** {@code 0x…} selector 문자열로 찾는다. {@code ChainFailure.extractSelector} 결과를 그대로 넣는다. */
    public static Optional<String> nameOfSelector(String selectorHex) {
        return selectorHex == null
                ? Optional.empty()
                : Optional.ofNullable(BY_SELECTOR.get(selectorHex.trim().toLowerCase(Locale.ROOT)));
    }
}
