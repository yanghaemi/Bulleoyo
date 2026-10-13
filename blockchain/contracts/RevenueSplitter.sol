// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @notice 정산 대상 토큰(YoYo)의 **권한 보유자**를 읽기 위한 최소 인터페이스.
 * @dev 왜 필요한가 — 팀 리더 지갑에 YoYo의 MINTER 키나 admin 키를 넣으면
 *      "발행 주체가 곧 분배 수령자"가 된다(감사 라운드 1 H-01). 그 팀은 자기 지갑에 코인을
 *      발행하고, 그 코인으로 티켓을 사서 자기 팀 카운터를 올리고, release로 수령할 수 있다.
 *      YoYo admin 지갑이라면 정산 도중 `pause()`로 release를 멈출 수도 있다.
 *      Splitter 자신의 `hasRole`은 Splitter의 역할만 보므로 토큰 쪽을 따로 조회해야 한다.
 *
 *      **호출은 try/catch로 감싼다.** project-truth §10의 발표 대사가
 *      "`token()`에 인가 발행사 코인을 꽂으면 Splitter는 코드 변경 0"이다. 임의의 ERC-20에는
 *      `minter()`도 `hasRole()`도 없으므로, 조회가 실패하면 "그런 역할 개념이 없는 토큰"으로
 *      보고 이 검사만 건너뛴다. 하드 의존으로 두면 표준 ERC-20에서 createShow가 통째로 막힌다.
 */
interface IYoYoRoles {
    function minter() external view returns (address);
    function hasRole(bytes32 role, address account) external view returns (bool);
}

/**
 * @title RevenueSplitter
 * @notice 공동 공연의 규칙 잠금 · 관객 선택 집계 · 매출 분배를 담당한다.
 *
 * ============================ 이 컨트랙트가 하는 일 세 가지 ============================
 *
 *  ① 판매가 시작되기 전에 **정산 규칙을 잠근다.** 잠근 뒤에는 아무도(운영자 포함) 비율을
 *     바꿀 수 없다. 참여팀 전원이 서명으로 동의해야만 잠글 수 있다.
 *  ② 관객이 티켓을 살 때 **어느 팀을 보러 왔는지를 결제 트랜잭션 안에서 함께 기록한다.**
 *     결제와 집계가 하나의 트랜잭션이라 "표는 세는데 돈은 안 들어온" 상태가 생기지 않는다.
 *  ③ 잠긴 규칙 × 집계된 카운터로 **분배액을 이 컨트랙트 안에서 계산해** 팀 리더 지갑에 보낸다.
 *     서버가 계산한 결과를 올리는 방식이 아니다 — 누구나 같은 입력으로 같은 결과를
 *     재현할 수 있다는 것이 이 컨트랙트의 존재 이유다.
 *
 * =============================== 현재 상태: MVP 구현 완료 ===============================
 *
 *  **2026-09-07 — Phase B 3/3 완료.** 함수 시그니처 · 이벤트 · custom error · view ·
 *  저장 구조는 확정본이다(9/9 고정).
 *
 *    · 덩어리 1 (상태 저장) `createShow` · `updateRules` · `agreeToRules` · `deposit` · `startSale`
 *    · 덩어리 2 (거래)      `purchase` · `refund`
 *    · 덩어리 3 (정산)      `aggregate` · `lock` · `release` · `returnDeposit` · `halt`
 *
 *  남은 미구현은 `forfeitDeposit` 하나다 — **P1이라 의도적으로 비워 둔다**(요구사항 §7.5는
 *  MVP에서 어떤 조건으로도 몰수하지 않는다). 시그니처만 예약해 두는 이유는 나중에 추가하면
 *  ABI가 바뀌어 서버·프론트가 다시 배포돼야 하기 때문이고, 그래서 `NotImplemented` 에러도 남는다.
 *
 *  이렇게 나눈 이유: 이강륜(서버 체인 모듈)·강병구(프론트 서명)가 9/9부터 이 ABI에 맞춰
 *  코드를 짜기 시작한다. 로직이 늦어도 시그니처가 고정되면 셋이 동시에 작업할 수 있다.
 *  정본 문서는 `docs/design/13_컨트랙트_인터페이스_v1.md`이며, 이 파일이 그 문서를 따른다.
 *
 * ================================== 용어 (짧게) ==================================
 *
 *  - `msg.sender` : 이 함수를 호출한 트랜잭션에 **서명한 주소**. 수수료 대납
 *    (`FeeDelegatedSmartContractExecution`)을 쓰더라도 대납자(fee payer)가 아니라 발신자다.
 *    그래서 `agreeToRules`·`deposit`·`purchase`는 본인 키로만 성립한다. `tx.origin`은 쓰지 않는다.
 *  - `bp` (basis point) : 만분율. 10000 bp = 100%.
 *  - escrow(에스크로) : 티켓 대금을 정산 전까지 이 컨트랙트가 들고 있는 잔액.
 *  - deposit(보증금) : 공연당 50,000 YoYo. **정산 재원이 아니다** — escrow와 장부를 분리한다.
 *
 * 정산 공식(요구사항 v6 §7.2)과 상태 전이는 문서 13번 §4.7·§4.2를 본다.
 */
contract RevenueSplitter is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =====================================================================
    // 상수
    // =====================================================================

    /// @notice 운영 서버(OPERATOR 키)만 부를 수 있는 함수에 붙는 역할.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice 만분율 분모. 10000 bp = 100%.
    uint16 public constant BP = 10_000;

    /// @notice 한 공연의 최대 참여팀 수. release가 팀 수만큼 transfer 하므로 가스 상한을 위해 제한한다.
    uint8 public constant MAX_TEAMS = 8;

    /**
     * @notice `purchase` 한 건이 올릴 수 있는 표의 상한.
     *
     * @dev 근거: **요구사항 v6 §7.3(657행) "1인 최대 구매 수량은 공연 단위로 4매다."**
     *      규격 v3의 `TICKET_PURCHASE_LIMIT_EXCEEDED` 문구도 같은 값을 가리킨다.
     *
     *      왜 필요한가(감사 라운드 1 H-03) — 컨트랙트는 티켓 단가를 모른다. 공연 하나에
     *      `ticket_type`이 여러 개라 `amount`와 `quantity`의 관계를 온체인에서 정확히
     *      검증할 방법이 없다. 대납 경로에서는 서버가 `senderSignedRlp`의 `data`를
     *      prepare 값과 대조해 막지만(API v6 §0.4 ③), **관객이 자기 KAIA로 직접 tx를 보내는 것은
     *      막을 수 없다.** 그러면 `amount = 1, quantity = 65535` 한 건으로 1 YoYo에 65,535표가
     *      들어가고, 선택 풀 `s_i = floor(S × n_i / T)`가 통째로 왜곡되며 서버 집계 대사가
     *      어긋나 집계 확정이 `SETTLEMENT_AGGREGATE_MISMATCH`(409)로 막힌다.
     *
     *      이 상수는 **완전 차단이 아니라 피해 상한**이다. 왜곡 폭을 65,535배에서 4배로 줄인다.
     *      남는 구멍(서버 DB에 없는 orderRef로 정상 범위의 임의 결제가 들어오는 것)의 복구 절차는
     *      문서 13 §4.8에 있다 — OPERATOR가 `Purchased` 이벤트의 `orderRef`로 `refund` 한다.
     *
     *      **주문 단위 상한이라 "1인 4매"보다 약하다.** 한 사람이 2매짜리 주문을 세 번 낼 수
     *      있다. 1인·1공연 누적 4매는 서버(`ticket_order` 조회)가 강제한다 — 컨트랙트에 회원
     *      개념이 없고 지갑당 누적을 들면 저장·가스가 늘기 때문이다.
     */
    uint16 public constant MAX_QUANTITY_PER_ORDER = 4;

    // =====================================================================
    // 상태 기계
    // =====================================================================

    /**
     * @notice 공연 단계.
     *
     *  NONE(0)             생성되지 않음. mapping 기본값이 0이므로 **반드시 0번 자리를 비워 둔다.**
     *                      이 자리를 CREATED로 쓰면 "존재하지 않는 공연"이 "생성된 공연"으로 보인다.
     *  CREATED(1)          규칙 수정 · 팀 동의 · 보증금 납부 가능. 판매 전.
     *  LOCKED_RULES(2)     startSale 이후. 규칙 변경 영구 차단. purchase · refund 가능.
     *  AGGREGATED(3)       집계 확정. 카운터·escrow 동결, payout 계산 완료. purchase 차단.
     *  SETTLEMENT_LOCKED(4) 정산 잠금. refund까지 차단. release 대기.
     *  RELEASED(5)         분배 완료(종단).
     *  HALTED(6)           공연 취소 등으로 정산 영구 중단(종단). refund만 허용.
     *
     * @dev 서버 `settlement.status`와 1:1이 아니다. 서버는 시간 기반 `DISPUTE_OPEN`(48시간)을
     *      갖지만 컨트랙트는 시간을 모른다. 컨트랙트가 강제하는 것은 순서
     *      (aggregate → lock → release)와 HALTED 종단성뿐이다.
     *      숫자값은 `stageOf()`가 uint8로 그대로 반환하므로 서버·프론트 enum과 맞춰야 한다.
     */
    enum Stage {
        NONE,
        CREATED,
        LOCKED_RULES,
        AGGREGATED,
        SETTLEMENT_LOCKED,
        RELEASED,
        HALTED
    }

    // =====================================================================
    // 저장 구조
    // =====================================================================

    /**
     * @notice 주문 1건의 온체인 기록. 환불이 이 기록을 근거로 카운터를 되돌린다.
     * @dev 필드 순서는 슬롯 패킹을 위한 것이다 —
     *      address(20) + uint8(1) + uint16(2) = 23바이트로 첫 슬롯에 들어간다.
     *
     *      **`refundedAmount`는 누적 환불액이다(감사 라운드 1 H-02 수정, 2026-09-07).**
     *      이전에는 `bool refunded` 하나였는데, 그러면 50% 취소 수수료 환불 한 번으로
     *      주문 전체가 잠긴다. 그 뒤 공연이 취소(halt)되면 요구사항 §7.4의 "무수수료 전액 환불"을
     *      할 수 없고(`AlreadyRefunded`), HALTED에서는 release도 영구 차단이라 남은 금액이
     *      컨트랙트 밖으로 나올 경로가 아예 사라진다 → 자금 영구 잠김 + `escrowOf`가 0이 되지
     *      않아 불변식 4 대사에 영구 잔재가 남는다.
     *
     *      "환불 완료" 판정은 `refundedAmount == amount`다. 환불 가능 잔액은 `amount - refundedAmount`.
     */
    struct Purchase {
        address buyer; // 결제 트랜잭션 서명자(= 관객 지갑). 서버가 receipt.from과 대조한다.
        uint8 teamIndex; // 관객이 고른 팀. teamWallets 배열의 인덱스.
        uint16 quantity; // 티켓 매수 = 이 주문이 더한 표 수 (팀 확정 2026-09-07: 티켓 1매 = 1표)
        uint256 amount; // 결제 금액(YoYo 정수).
        uint256 refundedAmount; // 누적 환불액. 0 = 미환불, amount와 같으면 전액 환불 완료.
    }

    /**
     * @notice 공연 1건의 온체인 상태.
     * @dev mapping을 품고 있으므로 `Show storage`로만 다룰 수 있다(메모리 복사·반환 불가).
     *      배열 4개(teamWallets·teamShareBp·choiceCount·payout)는 길이가 항상 같다 —
     *      teamIndex 하나로 네 배열을 함께 읽는다.
     */
    struct Show {
        // --- 1슬롯에 묶이는 작은 값들 ---
        Stage stage;
        uint8 hostTeamIndex; // 공연을 생성한 팀. dust 귀속 대상이자 보증금 납부·반환 주체.
        uint8 agreedCount; // 동의한 팀 수. teamWallets.length와 같아지면 startSale 가능.
        uint16 fixedRatioBp; // 고정 분배 풀 비율. selectionRatioBp와 합이 10000.
        uint16 selectionRatioBp; // 관객 선택 풀 비율.
        uint32 rulesEpoch; // 규칙 판본 번호. createShow가 1로 시작하고 updateRules가 +1 한다. 0 = 미등록.
        // --- 각자 한 슬롯 ---
        bytes32 rulesHash; // 오프체인 규칙 JSON의 keccak256. 팀이 서명으로 동의한 대상.
        uint256 depositAmount; // 요구 보증금(공연당 50,000). 0이면 보증금 없이 판매 시작 가능.
        uint256 escrow; // Σpurchase − Σrefund − Σrelease. **정산 재원 R의 원천.**
        uint256 deposit; // 납부된 보증금 잔액. escrow와 절대 섞지 않는다.
        uint256 validTicketCount; // aggregate가 기록하는 서버 집계 티켓 수(대사용 스냅샷).
        // --- 팀 수만큼의 배열 (인덱스 = teamIndex) ---
        address[] teamWallets; // createShow 이후 불변. 팀 리더 지갑 스냅샷.
        uint16[] teamShareBp; // 고정 풀 내 팀별 비율. 합 10000.
        uint256[] choiceCount; // 관객 선택 카운터. purchase가 더하고 refund가 뺀다.
        uint256[] payout; // aggregate가 확정한 팀별 분배액. release가 이 값을 보낸다.
        // --- 조회용 매핑 ---
        /**
         * @dev **동의 판정은 값이 아니라 판본 비교다**(감사 라운드 2 M-03).
         *      `agreedEpoch[w] == rulesEpoch` 이면 "현재 규칙에 동의함"이다.
         *      `bool agreed` 였다면 `updateRules`에서 동의를 되돌리려고 `agreedCount = 0`만 해도
         *      플래그가 true로 남아 재동의가 `AlreadyAgreed()`로 막히고, 그 공연은 영원히
         *      `startSale` 할 수 없게 된다(전원 동의 조건을 다시는 채울 수 없다).
         *      팀 지갑을 순회하며 delete 하는 방법도 있으나 팀 수만큼 SSTORE가 늘고,
         *      팀 배열이 커지면 `updateRules` 가스가 팀 수에 비례한다. epoch는 SSTORE 1회다.
         */
        mapping(address teamWallet => uint32 agreedEpoch) agreedEpoch;
        mapping(address teamWallet => uint8 indexPlusOne) teamIndexPlusOne; // 0 = 팀 아님
        mapping(bytes32 orderRef => Purchase) purchases;
    }

    /// @dev 정산 대상 토큰(YoYo). 배포 후 변경 불가. 외부에는 `token()` view로만 노출한다.
    IERC20 private immutable _yoyo;

    /// @notice 현재 OPERATOR_ROLE 보유 주소. 항상 1개 (역할 관리 봉인 — YoYo.sol과 같은 이유).
    address public operator;

    /// @dev showId = 서버 `performance.performance_id`.
    mapping(uint256 showId => Show) private _shows;

    // =====================================================================
    // 이벤트 — struct/tuple 없이 평평하게. 서버(web3j 4.9.8)가 파싱한다.
    // indexed는 조회 키에만 붙인다(indexed 값은 topic으로 가고, 동적 타입은 해시로 들어가
    // 원본을 읽을 수 없다). 금액류는 값을 읽어야 하므로 non-indexed다.
    // =====================================================================

    event ShowCreated(
        uint256 indexed showId,
        address[] teamWallets,
        uint8 hostTeamIndex,
        bytes32 rulesHash,
        uint16 fixedRatioBp,
        uint16 selectionRatioBp,
        uint256 depositAmount
    );

    /// @dev teamShareBp는 이벤트에 싣지 않는다 — `rulesOf(showId)` view로 언제든 읽을 수 있고,
    ///      startSale 이후 불변이라 이벤트로 시점을 남길 필요가 없다. 동적 배열을 이벤트에서
    ///      줄이면 web3j 코드젠 위험도 줄어든다.
    event RulesUpdated(uint256 indexed showId, bytes32 rulesHash, uint16 fixedRatioBp, uint16 selectionRatioBp);

    /// @notice 규칙이 바뀌어 기존 동의가 전부 무효가 됐다. 서버 `rule_agreement`를 PENDING으로 되돌린다.
    event AgreementsReset(uint256 indexed showId);

    event RulesAgreed(uint256 indexed showId, address indexed team, bytes32 rulesHash, uint8 agreedCount, uint8 teamCount);

    event DepositPaid(uint256 indexed showId, address indexed from, uint256 amount);

    event SaleStarted(uint256 indexed showId, bytes32 rulesHash);

    /// @dev 서버 receipt 검증 5항목 ④⑤가 파싱하는 핵심 이벤트. 인자 순서를 바꾸면 이강륜 코드가 깨진다.
    event Purchased(
        uint256 indexed showId,
        bytes32 indexed orderRef,
        address indexed buyer,
        uint8 teamIndex,
        uint256 amount,
        uint16 quantity
    );

    event Refunded(
        uint256 indexed showId,
        bytes32 indexed orderRef,
        address indexed buyer,
        uint8 teamIndex,
        uint256 refundAmount,
        uint16 quantity
    );

    /// @param distributable 분배 대상 총액 R(= escrow, 보증금 제외).
    /// @param totalChoices  T = Σ choiceCount.
    /// @param dust          floor 버림에서 남은 잔액. 공연 생성 팀에 귀속된다.
    event Aggregated(uint256 indexed showId, uint256 validTicketCount, uint256 totalChoices, uint256 distributable, uint256 dust);

    /// @dev 팀 수만큼 개별 emit 한다. 배열 하나에 담으면 검증 페이지가 인덱스를 다시 매핑해야 한다.
    event PayoutAssigned(
        uint256 indexed showId,
        uint8 indexed teamIndex,
        address team,
        uint256 fixedPart,
        uint256 choicePart,
        uint256 dustPart,
        uint256 total
    );

    event SettlementLocked(uint256 indexed showId);

    event Released(uint256 indexed showId, uint8 indexed teamIndex, address teamWallet, uint256 amount);

    event DepositReturned(uint256 indexed showId, address indexed to, uint256 amount);

    event Halted(uint256 indexed showId);

    event OperatorRotated(address indexed previousOperator, address indexed newOperator);

    // =====================================================================
    // custom error — 서버 ErrorCode 매핑은 문서 13번 §4.6
    // =====================================================================

    // 권한
    error NotOperator();
    error NotTeam();
    error NotHost();
    error RoleManagementDisabled();
    error RoleConflict();

    // 존재
    error ShowNotFound(uint256 showId);
    error ShowAlreadyExists(uint256 showId);
    error PurchaseNotFound(bytes32 orderRef);

    // 단계
    /// @param expected 기대한 Stage의 uint8 값. @param actual 실제 Stage 값.
    error InvalidStage(uint8 expected, uint8 actual);
    /// @notice 판매가 시작돼 규칙이 잠겼다(더 이상 수정·동의 불가).
    error RulesLocked();
    /// @notice 아직 판매가 시작되지 않았다.
    error SaleNotStarted();
    /// @notice 공연이 중단됐다. 집계·잠금·분배가 영구 차단된다.
    error ShowHalted();

    // 동의·규칙
    error AlreadyAgreed();
    error NotAllAgreed();
    error RulesHashMismatch();

    // 보증금
    error DepositRequired();
    error DepositAlreadyPaid();
    error NoDepositToReturn();

    // 결제·환불
    error AlreadyPurchased(bytes32 orderRef);
    error AlreadyRefunded();
    error RefundExceedsPurchase();

    // 집계 대사
    /**
     * @notice 서버가 넘긴 유효 티켓 수와 온체인 선택 카운터 합(T)이 다르다. 감사 라운드 2 H-04.
     * @param reportedTicketCount `aggregate`의 인자 — 서버가 `COUNT(ticket)`으로 센 값.
     * @param onchainTotalChoices `Σ choiceCount[i]` — 이 블록 시점의 온체인 카운터 합.
     * @dev 서버 `ErrorCode`는 `SETTLEMENT_AGGREGATE_MISMATCH`(409). **stage는 바뀌지 않는다** —
     *      `LOCKED_RULES`가 유지되므로 문서 13번 §4.8 복구 절차(refund로 되돌리기)를 그대로 쓸 수 있다.
     */
    error AggregateMismatch(uint256 reportedTicketCount, uint256 onchainTotalChoices);

    // 입력 검증
    error ZeroAddress();
    error ZeroAmount();
    error ZeroQuantity();
    /// @notice `orderRef`가 0이다. `YoYo.mint`의 `ZeroGrantRef`와 대칭. 감사 라운드 2 L-02.
    error ZeroOrderRef();
    /// @notice 주문 1건의 표 수가 상한(`MAX_QUANTITY_PER_ORDER` = 4)을 넘었다. 감사 라운드 1 H-03.
    error QuantityLimitExceeded(uint16 quantity, uint16 maxQuantity);
    error ZeroRulesHash();
    error InvalidBpSum();
    error InvalidTeamCount();
    error TeamIndexOutOfRange();
    error HostIndexOutOfRange();
    error ArrayLengthMismatch();
    error DuplicateTeamWallet(address wallet);
    /// @notice 팀 지갑이 운영 키(operator·admin) 또는 토큰 컨트랙트 주소와 같다.
    error ReservedAddress(address wallet);

    // 자금
    error InsufficientEscrow();

    /// @notice MVP에서 의도적으로 비워 둔 자리(`forfeitDeposit`, P1). Phase B 완료 후 남는 유일한 사용처다.
    error NotImplemented();

    // =====================================================================
    // modifier
    // =====================================================================

    /// @dev 수수료 대납이어도 msg.sender는 발신자다. OPERATOR 키가 직접 서명한 tx만 통과한다.
    modifier onlyOperator() {
        if (!hasRole(OPERATOR_ROLE, msg.sender)) revert NotOperator();
        _;
    }

    /// @dev 이 공연의 참여팀 리더 지갑이 직접 서명했는지.
    modifier onlyTeamOf(uint256 showId) {
        if (_shows[showId].teamIndexPlusOne[msg.sender] == 0) revert NotTeam();
        _;
    }

    /// @dev 공연을 생성한 팀(host)의 리더 지갑이 직접 서명했는지.
    modifier onlyHostOf(uint256 showId) {
        Show storage s = _shows[showId];
        if (s.stage == Stage.NONE) revert ShowNotFound(showId);
        if (msg.sender != s.teamWallets[s.hostTeamIndex]) revert NotHost();
        _;
    }

    modifier showExists(uint256 showId) {
        if (_shows[showId].stage == Stage.NONE) revert ShowNotFound(showId);
        _;
    }

    /**
     * @param admin    DEFAULT_ADMIN_ROLE — OPERATOR 교체만 담당한다. 자금 이동 권한 없음.
     * @param operator_ OPERATOR_ROLE — 서버 운영 키. 대납 fee payer와 같은 주소다.
     * @param yoyo     YoYo 토큰 주소. 배포 스크립트가 `token() == YoYo 주소`를 어서션한다.
     */
    constructor(address admin, address operator_, address yoyo) {
        if (admin == address(0) || operator_ == address(0) || yoyo == address(0)) revert ZeroAddress();
        if (admin == operator_) revert RoleConflict();

        // [M-09] 세 키 분리의 마지막 한 쌍 — operator != YoYo.minter().
        // YoYo 생성자가 admin != minter 를, 바로 위 줄이 admin != operator 를 막는다.
        // 이 줄이 없으면 project-truth §2("세 주소가 전부 달라야 한다 — 생성자가 RoleConflict()로 강제")가
        // 코드에서 참이 아니게 되고, 서버 키 하나가 무한 발행 + 정산 실행을 동시에 갖는 배포가 가능하다.
        // `_yoyo` 대입을 먼저 두는 이유: `_yoyoMinter()`가 `_yoyo`를 읽는다.
        _yoyo = IERC20(yoyo);
        // `_yoyoMinter()`는 조회 불가 토큰에서 `address(0)`을 돌려주지만, 그 값이 `operator_`와
        // 같아질 수는 없다 — 바로 위에서 `operator_ == address(0)`을 이미 `ZeroAddress`로 막았다.
        if (operator_ == _yoyoMinter()) revert RoleConflict();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator_);
        operator = operator_;
    }

    // =====================================================================
    // 공연 생성 · 규칙 (stage: NONE → CREATED)
    // =====================================================================

    /**
     * @notice 공연을 온체인에 등록하고 참여팀·분배 규칙의 초기값을 심는다.
     * @param showId           서버 `performance.performance_id`.
     * @param teamWallets      참여팀 리더 지갑. **배열 인덱스가 곧 teamIndex다.** 이후 불변.
     * @param hostTeamIndex    공연 생성 팀의 인덱스. dust 귀속·보증금 주체.
     * @param rulesHash        오프체인 규칙 JSON의 keccak256.
     * @param fixedRatioBp     고정 분배 풀 비율(bp).
     * @param selectionRatioBp 관객 선택 풀 비율(bp). fixedRatioBp와 합이 10000이어야 한다.
     * @param teamShareBp      고정 풀 내 팀별 비율(bp). 합이 10000, 길이는 teamWallets와 같아야 한다.
     * @param depositAmount    요구 보증금(50,000). 0이면 보증금 없이 판매 시작할 수 있다.
     *
     * @dev 팀 지갑이 운영 키(operator·admin)나 토큰 컨트랙트와 겹치면 revert 한다.
     *      운영 키 하나가 팀 동의를 대신할 수 있게 되는 순간 "전원 동의 후 잠금"이라는
     *      신뢰 장치가 사라지기 때문이다.
     *
     *      호출 시점은 9/8 팀 안건 ② — 추천안은 규칙 저장(API-rule-01) 시 서버가 자동 호출.
     */
    function createShow(
        uint256 showId,
        address[] calldata teamWallets,
        uint8 hostTeamIndex,
        bytes32 rulesHash,
        uint16 fixedRatioBp,
        uint16 selectionRatioBp,
        uint16[] calldata teamShareBp,
        uint256 depositAmount
    ) external onlyOperator {
        if (_shows[showId].stage != Stage.NONE) revert ShowAlreadyExists(showId);
        _validateRuleShape(teamWallets, hostTeamIndex, rulesHash, fixedRatioBp, selectionRatioBp, teamShareBp);
        _validateTeamWallets(teamWallets);
        // depositAmount는 0도 허용한다(보증금 없는 공연 = 요구사항 v6 §9 컷 라인 ① 스위치).
        // 검증할 상·하한이 없다 — 0 유입을 막는 책임은 서버다(문서 13 §4.1).

        Show storage s = _shows[showId];
        uint256 n = teamWallets.length;

        // 작은 값들 — Stage·hostTeamIndex·agreedCount·두 비율·rulesEpoch가 한 슬롯에 묶여 있어
        // 아래 다섯 줄은 SSTORE 1회로 접힌다(agreedCount는 0이 초기값이라 쓰지 않는다).
        s.stage = Stage.CREATED;
        s.hostTeamIndex = hostTeamIndex;
        s.fixedRatioBp = fixedRatioBp;
        s.selectionRatioBp = selectionRatioBp;
        // ┌─ [M-06 · 감사 라운드 3] **이 한 줄을 지우면 그 공연은 판매를 영구히 못 연다.**
        // │
        // │  0으로 두면 모든 지갑의 `agreedEpoch` 기본값(0)과 같아져 `agreeToRules`의 중복 검사
        // │  `if (s.agreedEpoch[msg.sender] == s.rulesEpoch) revert AlreadyAgreed();`가
        // │  0 == 0 으로 **전원에게** 발동한다. 아무도 첫 동의조차 할 수 없다
        // │  → `agreedCount`가 영원히 0 → `startSale`이 `NotAllAgreed()`로 **영구 차단**.
        // │  **"전원이 동의한 것으로 읽힌다"가 아니다 — 정반대로 전원이 동의 불가가 된다.**
        // │
        // │  이게 특히 나쁜 이유: **view와 tx가 정반대 신호를 낸다.**
        // │    · `agreedOf`에는 `rulesEpoch != 0` 가드가 있어 **`false`(미동의)** 를 돌려준다.
        // │    · 그런데 tx는 **`AlreadyAgreed`(이미 동의)** 로 죽는다.
        // │  서버는 `AlreadyAgreed`를 `COMMON_CONFLICT`(= 이미 처리됨)로 매핑하므로(문서 13 §4.6)
        // │  **재시도하지 않고 성공으로 넘어간다.** 사고가 `startSale` 실패 시점까지 숨어 있다가
        // │  시연 당일 "동의는 다 받았는데 판매가 안 열린다"로 나타난다.
        // │
        // │  주의: `agreedOf`에 가드가 있다고 안심하지 마라 — 그 가드는 **view만** 구제한다.
        // │  `updateRules`를 한 번 부르면 `++rulesEpoch`로 1이 되어 우연히 복구되지만 그것은
        // │  설계가 아니라 우연이다. 회귀 테스트: `Audit.2-G`.
        // └─
        s.rulesEpoch = 1;

        s.rulesHash = rulesHash;
        s.depositAmount = depositAmount;

        // 배열 4개는 길이가 항상 같아야 한다(문서 13 §3.1). teamIndex 하나로 넷을 함께 읽는다.
        // calldata → storage 직접 대입이 루프 push보다 싸다(길이 SSTORE가 1회로 끝난다).
        s.teamWallets = teamWallets;
        s.teamShareBp = teamShareBp;
        // 값이 전부 0이라도 **길이는 반드시 심는다.** 길이가 0이면 purchase의
        // `choiceCount[teamIndex] += quantity`가 배열 범위 밖 패닉(0x32)으로 죽는다.
        s.choiceCount = new uint256[](n);
        s.payout = new uint256[](n);

        for (uint256 i; i < n; ++i) {
            // +1 저장 — 0을 "이 공연의 팀이 아님"으로 쓰기 때문이다(teamIndex 0번 팀과 구분).
            s.teamIndexPlusOne[teamWallets[i]] = uint8(i + 1);
        }

        emit ShowCreated(
            showId, teamWallets, hostTeamIndex, rulesHash, fixedRatioBp, selectionRatioBp, depositAmount
        );
    }

    /**
     * @notice 판매 시작 전에 규칙을 갈아 끼운다. **기존 동의는 전부 무효가 된다.**
     * @dev 동의를 리셋하지 않으면 "팀이 동의한 규칙"과 "실제 잠긴 규칙"이 달라져
     *      전원 동의라는 장치가 무의미해진다. 서버도 `rule_agreement`를 PENDING으로 되돌린다.
     *
     *      **리셋 방법 = `rulesEpoch` 증가**(감사 라운드 2 M-03). `agreedCount = 0`만 하고
     *      `agreedEpoch`(구 `agreed` 플래그)를 그대로 두면 이미 동의한 팀이 다시 동의할 때
     *      `AlreadyAgreed()`로 막혀 `agreedCount`가 다시는 팀 수에 도달하지 못한다 —
     *      그 공연은 `startSale` 불가 상태로 영구히 죽는다.
     */
    function updateRules(
        uint256 showId,
        bytes32 rulesHash,
        uint16 fixedRatioBp,
        uint16 selectionRatioBp,
        uint16[] calldata teamShareBp
    ) external onlyOperator showExists(showId) {
        Show storage s = _shows[showId];
        if (s.stage != Stage.CREATED) revert RulesLocked();
        _validateRuleShape(s.teamWallets, s.hostTeamIndex, rulesHash, fixedRatioBp, selectionRatioBp, teamShareBp);

        s.rulesHash = rulesHash;
        s.fixedRatioBp = fixedRatioBp;
        s.selectionRatioBp = selectionRatioBp;
        // 길이는 _validateRuleShape가 teamWallets.length와 같음을 이미 보장했다.
        // 팀 구성 자체는 바꿀 수 없다 — createShow 이후 teamWallets는 불변이다.
        s.teamShareBp = teamShareBp;

        // [M-03] 동의 전원 리셋 = 판본 증가. 팀 지갑을 순회하며 delete 하지 않는다(SSTORE가 팀 수만큼 늘어난다).
        //        **이 증가는 반드시 검사 있는 산술이어야 한다.** 가스를 아끼려고 검사를 끄는 블록으로
        //        감싸면 uint32 랩어라운드로 판본이 0이 되어 M-06과 같은 "전원 동의 불가 →
        //        startSale 영구 차단"이 되살아난다. Audit.2-G 두 번째 케이스가 이 함수 본문을
        //        문자열로 검사하므로, 그 키워드는 주석에도 쓰지 않는다.
        ++s.rulesEpoch;
        s.agreedCount = 0;

        emit RulesUpdated(showId, rulesHash, fixedRatioBp, selectionRatioBp);
        emit AgreementsReset(showId);
    }

    /**
     * @notice 참여팀 리더가 규칙에 동의한다. **리더 본인 지갑으로만 서명할 수 있다.**
     * @param rulesHash 동의 대상 규칙 해시. 현재 규칙과 다르면 revert 한다
     *                  (동의 서명 대기 중 규칙이 바뀐 경우를 잡는다).
     *
     * @dev 수수료는 서버가 대납하지만 서명은 리더 키다. 운영자가 대신 부르면 `NotTeam`이다.
     */
    function agreeToRules(uint256 showId, bytes32 rulesHash) external showExists(showId) onlyTeamOf(showId) {
        Show storage s = _shows[showId];
        if (s.stage != Stage.CREATED) revert RulesLocked();
        if (s.rulesHash != rulesHash) revert RulesHashMismatch();
        // [M-03] 판본 비교 — 규칙이 바뀌면(rulesEpoch 증가) 이미 동의한 팀도 다시 동의할 수 있다.
        if (s.agreedEpoch[msg.sender] == s.rulesEpoch) revert AlreadyAgreed();

        s.agreedEpoch[msg.sender] = s.rulesEpoch;
        // 팀 수 ≤ 8이고 onlyTeamOf + 위 중복 검사가 지갑당 1회를 보장하므로 uint8을 넘길 수 없다.
        // 그래도 checked 산술로 둔다 — 넘친다면 그것은 팀 등록이 깨졌다는 뜻이고 조용히 랩어라운드하면 안 된다.
        uint8 agreedCount = s.agreedCount + 1;
        s.agreedCount = agreedCount;

        emit RulesAgreed(showId, msg.sender, rulesHash, agreedCount, uint8(s.teamWallets.length));
    }

    /**
     * @notice 공연 생성 팀 리더가 보증금을 예치한다. 사전에 `YoYo.approve(splitter, depositAmount)` 필요.
     * @dev 보증금은 `deposit` 장부로 들어가고 `escrow`와 섞이지 않는다. 정산 재원이 아니다(§7.5).
     *      섞으면 R이 50,000 커져 모든 팀의 분배액이 틀어진다.
     */
    function deposit(uint256 showId) external nonReentrant showExists(showId) onlyHostOf(showId) {
        Show storage s = _shows[showId];
        if (s.stage != Stage.CREATED) revert InvalidStage(uint8(Stage.CREATED), uint8(s.stage));
        if (s.deposit != 0) revert DepositAlreadyPaid();
        if (s.depositAmount == 0) revert ZeroAmount();

        uint256 amount = s.depositAmount;

        // checks-effects-interactions — 장부를 먼저 올리고 토큰을 마지막에 당긴다.
        // (TODO 주석은 transferFrom을 먼저 두라고 적혀 있었으나 그 순서는 CEI 위반이다.
        //  nonReentrant가 이미 붙어 있어 지금은 결과가 같지만, 토큰이 교체될 수 있다는 것이
        //  이 컨트랙트의 설계 전제(project-truth §10)이고 purchase의 TODO도 효과 우선이다.
        //  같은 파일 안에서 두 자금 함수의 순서가 어긋나면 다음 사람이 어느 쪽을 따를지 알 수 없다.)
        s.deposit = amount;
        _yoyo.safeTransferFrom(msg.sender, address(this), amount);

        emit DepositPaid(showId, msg.sender, amount);
    }

    // =====================================================================
    // 판매 (stage: CREATED → LOCKED_RULES)
    // =====================================================================

    /**
     * @notice 규칙을 잠그고 판매를 연다. **이 시점 이후 규칙은 누구도 바꿀 수 없다.**
     * @dev 선행 조건 두 개가 이 프로젝트의 신뢰 장치다 — 참여팀 전원 동의, 보증금 납부.
     */
    function startSale(uint256 showId) external onlyOperator showExists(showId) {
        Show storage s = _shows[showId];
        if (s.stage != Stage.CREATED) revert InvalidStage(uint8(Stage.CREATED), uint8(s.stage));
        if (s.agreedCount != s.teamWallets.length) revert NotAllAgreed();
        if (s.depositAmount != 0 && s.deposit < s.depositAmount) revert DepositRequired();

        s.stage = Stage.LOCKED_RULES;
        emit SaleStarted(showId, s.rulesHash);
    }

    /**
     * @notice 관객이 티켓 대금을 지불하면서 응원할 팀을 함께 기록한다. **관객 본인 서명.**
     * @param orderRef  서버 `ticket_order.order_ref`(bytes32). **재사용은 revert 한다** —
     *                  멱등이 아니라 엄격하게 막는다. 서버가 재시도해도 표가 두 번 세어지지 않는다.
     * @param teamIndex 관객이 고른 팀. 구매 후 변경 경로는 없다.
     * @param amount    결제 금액(YoYo 정수). 사전 `approve` 필요.
     * @param quantity  티켓 매수 = 이 주문이 더하는 표 수.
     *
     * @dev **카운트 단위 = 티켓 1매 = 1표 (팀 확정 2026-09-07).** 2매 주문이면 그 팀 카운터가 2 오른다.
     *      요구사항 v6 §7.1이 정산 공식의 `n_i`를 "팀 i를 고른 유효 **티켓 수**"로 정의한 것과 맞춘다.
     *      서버 집계 대사도 `COUNT(ticket)` 기준이어야 한다 — 주문 수로 세면 온체인 카운터와 어긋나
     *      집계 확정이 `SETTLEMENT_AGGREGATE_MISMATCH`(409)로 막힌다.
     *
     *      결제와 집계가 한 트랜잭션인 것이 핵심이다. 두 트랜잭션으로 나누면
     *      "돈은 들어왔는데 표는 안 세어진" 중간 상태가 생기고 대사가 깨진다.
     */
    function purchase(uint256 showId, bytes32 orderRef, uint8 teamIndex, uint256 amount, uint16 quantity)
        external
        nonReentrant
        showExists(showId)
    {
        Show storage s = _shows[showId];
        if (s.stage != Stage.LOCKED_RULES) revert SaleNotStarted();
        if (teamIndex >= s.teamWallets.length) revert TeamIndexOutOfRange();
        if (amount == 0) revert ZeroAmount();
        if (quantity == 0) revert ZeroQuantity();
        // [H-03] 표 수 상한. 근거는 MAX_QUANTITY_PER_ORDER 주석(요구사항 v6 §7.3 "1인 4매").
        if (quantity > MAX_QUANTITY_PER_ORDER) revert QuantityLimitExceeded(quantity, MAX_QUANTITY_PER_ORDER);
        // [L-02] orderRef 0 차단. YoYo.mint의 grantRef 0 차단(`ZeroGrantRef`)과 대칭이다 —
        //        0은 "아직 안 쓴 슬롯"과 구별되지 않아 주문 하나가 통째로 추적 불가가 된다.
        if (orderRef == bytes32(0)) revert ZeroOrderRef();
        if (s.purchases[orderRef].amount != 0) revert AlreadyPurchased(orderRef);

        // checks-effects-interactions — `deposit`과 같은 순서다(감사 라운드 4 §2.3에서 확인됨).
        // YoYo에는 전송 훅이 없어 지금은 재진입이 불가능하지만, 토큰이 교체될 수 있다는 것이
        // 이 컨트랙트의 설계 전제(project-truth §10)다. 외부 호출을 먼저 두면 그 순간
        // `purchases[orderRef]`가 아직 비어 있어 같은 orderRef로 재진입해 표를 두 번 셀 수 있다.
        s.purchases[orderRef] = Purchase({
            buyer: msg.sender,
            teamIndex: teamIndex,
            quantity: quantity,
            amount: amount,
            refundedAmount: 0 // H-02 — 누적 환불액. 부분 환불이 여러 번 들어올 수 있다.
        });
        s.escrow += amount;
        s.choiceCount[teamIndex] += quantity; // 티켓 1매 = 1표 (팀 확정 2026-09-07)

        _yoyo.safeTransferFrom(msg.sender, address(this), amount);

        emit Purchased(showId, orderRef, msg.sender, teamIndex, amount, quantity);
    }

    /**
     * @notice 주문 1건을 환불한다. 운영자가 서버 `refund_quote`로 정한 금액을 보낸다.
     * @param refundAmount 환불액. 전액 또는 50%(취소 수수료). 원 결제액 이하여야 한다.
     *
     * @dev 50% 환불이면 나머지 50%는 escrow에 남아 R에 포함된다(요구사항 §7.2 "취소 수수료").
     *
     *      **부분 환불은 여러 번 가능하다(H-02 수정).** 누적 환불액(`p.refundedAmount`)이
     *      결제액을 넘지 못한다는 것만 강제한다. 개별 취소로 50%를 돌려준 뒤 공연이 취소되면
     *      같은 주문에 나머지 50%를 한 번 더 환불할 수 있다.
     *
     *      **카운터 감소는 딱 한 번이다.** 첫 환불(`refundedAmount == 0`)에서만
     *      `choiceCount[teamIndex] -= quantity`를 하고, 이후 환불은 금액만 돌려준다.
     *      두 번 빼면 언더플로로 revert 하거나(0.8.x 산술 검사) 카운터가 오염된다.
     *      금액과 무관하게 표는 통째로 빠진다 — 표에는 반쪽이 없다.
     *      2회차 이후 `Refunded` 이벤트의 `quantity`는 **0**이다. 그래야 서버·검증 페이지가
     *      이벤트만 순서대로 더해서 온체인 카운터를 그대로 복원할 수 있다(문서 13 §7 C-6).
     *
     *      공연 취소(HALTED) 후의 전액 환불도 **이 함수를 주문별로 N번** 부른다(확정 9/5).
     *      `refundAll` 같은 일괄 루프를 만들지 않는 이유: 티켓 100매 루프는 블록 가스 한도에
     *      걸릴 수 있고, 한 건이 실패하면 전체가 되돌아가 부분 실패를 격리할 수 없다.
     */
    function refund(uint256 showId, bytes32 orderRef, uint256 refundAmount)
        external
        onlyOperator
        nonReentrant
        showExists(showId)
    {
        Show storage s = _shows[showId];
        if (s.stage != Stage.LOCKED_RULES && s.stage != Stage.HALTED) {
            revert InvalidStage(uint8(Stage.LOCKED_RULES), uint8(s.stage));
        }
        Purchase storage p = s.purchases[orderRef];
        if (p.amount == 0) revert PurchaseNotFound(orderRef);

        uint256 remaining = p.amount - p.refundedAmount;
        if (remaining == 0) revert AlreadyRefunded(); // 이미 전액 환불된 주문
        if (refundAmount > remaining) revert RefundExceedsPurchase();
        if (refundAmount == 0) revert ZeroAmount();

        // 표는 **첫 환불에서 전량** 빠진다(A-2 확정 2026-09-07). 금액과 무관하다 —
        // 표에는 반쪽이 없다. 2회차 이후는 금액만 돌려주므로 delta 가 0이다.
        // `refundAmount == 0`이 위에서 막히므로 첫 환불 뒤에는 `refundedAmount != 0`이 보장된다.
        uint16 counterDelta = p.refundedAmount == 0 ? p.quantity : 0;

        // 외부 호출 뒤에 storage 를 다시 읽지 않도록 미리 떠 둔다(CEI).
        address buyer = p.buyer;
        uint8 teamIndex = p.teamIndex;

        p.refundedAmount += refundAmount;
        s.escrow -= refundAmount;
        if (counterDelta != 0) {
            s.choiceCount[teamIndex] -= counterDelta;
        }

        _yoyo.safeTransfer(buyer, refundAmount);

        emit Refunded(showId, orderRef, buyer, teamIndex, refundAmount, counterDelta);
    }

    // =====================================================================
    // 정산 (stage: LOCKED_RULES → AGGREGATED → SETTLEMENT_LOCKED → RELEASED)
    // =====================================================================

    /**
     * @notice 카운터·에스크로를 동결하고 팀별 분배액을 **컨트랙트 안에서 계산해** 확정한다.
     * @param validTicketCount 서버가 `COUNT(ticket)`으로 센 유효 티켓 수. **온체인 카운터 합 T와
     *                         같지 않으면 거부한다**(감사 라운드 2 H-04). 계산에는 쓰지 않고 스냅샷으로 저장한다.
     *
     * @dev **왜 대조하나.** 판매는 이 트랜잭션이 채굴되는 블록까지 열려 있다. 서버가 대사를 끝낸 뒤
     *      `aggregate`가 채굴되기 전 사이에 서버가 모르는 `orderRef`로 결제가 들어오면
     *      카운터가 오염된 채 그대로 동결되고, `AGGREGATED` 이후에는 `refund`가 막혀
     *      문서 13번 §4.8 복구 절차를 쓸 수 없다. 대조를 맨 앞에 두면 그 경주에서 지지 않는다.
     *
     *      **실패해도 stage는 바뀌지 않는다.** `LOCKED_RULES`가 유지되므로 운영자는 §4.8로
     *      왜곡 주문을 환불한 뒤 다시 호출하면 된다. project-truth §6 "되돌릴 수 있는 정지 3개는
     *      상태를 바꾸지 않는다"와 같은 규칙이고, 서버 `SETTLEMENT_AGGREGATE_MISMATCH`(409)와 짝이다.
     *
     * @dev 계산은 요구사항 v6 §7.2 그대로다(문서 13번 §4.7):
     *        R = escrow (보증금 제외)
     *        F = floor(R × fixedRatioBp / 10000),  S = floor(R × selectionRatioBp / 10000)
     *        f_i = floor(F × teamShareBp[i] / 10000)
     *        s_i = T > 0 ? floor(S × choiceCount[i] / T) : floor(S / N)
     *        dust = R − Σ(f_i + s_i)  →  공연 생성 팀(host)에 귀속
     *      곱셈을 먼저, 나눗셈을 나중에 한다(`Math.mulDiv`). 순서를 바꾸면 0이 된다.
     *      서버(Java)·검증 페이지(TS)가 같은 순서로 재현해야 1원도 어긋나지 않는다.
     */
    function aggregate(uint256 showId, uint256 validTicketCount) external onlyOperator showExists(showId) {
        Show storage s = _shows[showId];
        if (s.stage == Stage.HALTED) revert ShowHalted();
        if (s.stage != Stage.LOCKED_RULES) revert InvalidStage(uint8(Stage.LOCKED_RULES), uint8(s.stage));

        // [H-04] 서버 집계 ↔ 온체인 카운터 대조. 상태를 바꾸는 어떤 코드보다 먼저 온다.
        uint256 totalChoices = _totalChoices(s);
        if (validTicketCount != totalChoices) revert AggregateMismatch(validTicketCount, totalChoices);

        uint256 R = s.escrow; // 보증금(s.deposit)은 다른 장부다. 여기 섞이면 R이 50,000 커진다.
        uint256 n = s.teamWallets.length;

        // 두 풀. 곱셈이 먼저다 — `R * (bp / BP)`로 쓰면 정수 나눗셈이라 언제나 0이 된다.
        // `Math.mulDiv`는 중간값을 512비트로 들고 있다가 마지막에 한 번 나눈다(버림 방향은 `/`와 같다).
        uint256 fixedPool = Math.mulDiv(R, s.fixedRatioBp, BP);
        uint256 choicePool = Math.mulDiv(R, s.selectionRatioBp, BP);

        // host의 이벤트만 루프 안에서 내보내지 않는다 — dust는 루프가 끝나야 알 수 있고,
        // 검증 페이지가 `Σ PayoutAssigned.total == R`을 그대로 검산하기 때문이다(문서 13 §4.7-6).
        uint256 hostFixedPart;
        uint256 hostChoicePart;
        uint256 assigned;

        for (uint256 i; i < n; ++i) {
            uint256 f = Math.mulDiv(fixedPool, s.teamShareBp[i], BP);
            // T == 0(아무도 고르지 않음)이면 0으로 나누게 된다. 그때만 선택 풀을 팀 수로 균등 분배한다.
            uint256 c = totalChoices == 0 ? choicePool / n : Math.mulDiv(choicePool, s.choiceCount[i], totalChoices);
            uint256 base = f + c;

            s.payout[i] = base;
            assigned += base;

            if (i == s.hostTeamIndex) {
                hostFixedPart = f;
                hostChoicePart = c;
            } else {
                emit PayoutAssigned(showId, uint8(i), s.teamWallets[i], f, c, 0, base);
            }
        }

        // 버림에서 남은 잔액. 모든 나눗셈이 floor이고 `fixedRatioBp + selectionRatioBp == BP`,
        // `Σ teamShareBp == BP`이므로 `assigned <= fixedPool + choicePool <= R`이 항상 성립한다.
        // 그래도 뺄셈으로 두는 이유: 0.8.x의 checked 산술이 그 부등식을 런타임에 강제한다.
        // 여기서 언더플로가 나면 위 세 전제 중 하나가 깨진 것이고, 그 경우는 확정보다 revert가 옳다.
        uint256 dust = R - assigned;

        uint8 host = s.hostTeamIndex;
        uint256 hostTotal = s.payout[host] + dust;
        s.payout[host] = hostTotal; // dust는 공연 생성 팀에 통째로 귀속된다(요구사항 v6 §7.2).

        s.validTicketCount = validTicketCount; // 계산에는 쓰지 않는다. 대사 스냅샷이다.
        s.stage = Stage.AGGREGATED; // 이 줄 이후 purchase·refund가 막혀 카운터·escrow가 동결된다.

        emit PayoutAssigned(showId, host, s.teamWallets[host], hostFixedPart, hostChoicePart, dust, hostTotal);
        emit Aggregated(showId, validTicketCount, totalChoices, R, dust);
    }

    /// @notice 정산을 잠근다. 이후 환불이 차단되고 서버의 이의제기 48시간이 시작된다.
    function lock(uint256 showId) external onlyOperator showExists(showId) {
        Show storage s = _shows[showId];
        if (s.stage == Stage.HALTED) revert ShowHalted();
        if (s.stage != Stage.AGGREGATED) revert InvalidStage(uint8(Stage.AGGREGATED), uint8(s.stage));

        s.stage = Stage.SETTLEMENT_LOCKED;
        emit SettlementLocked(showId);
    }

    /**
     * @notice 확정된 분배액을 팀 리더 지갑으로 **보낸다(push)**.
     * @dev v5 프로토타입은 팀이 직접 인출하는 pull 방식이었다. v6는 push다 —
     *      팀 리더 지갑에는 가스로 쓸 KAIA가 0이고, "release = 수령 완료"가 서사이기 때문이다.
     *      push의 고전적 위험(수신자 한 곳이 revert 하면 전체 실패)은 YoYo가 우리 토큰이라
     *      전송 훅·콜백이 없고 수신자가 전부 EOA(사람 지갑)라서 감수한다. 팀 수도 8 이하다.
     *
     *      순서는 checks-effects-interactions — stage와 escrow를 먼저 내리고 transfer를 마지막에 한다.
     */
    function release(uint256 showId) external onlyOperator nonReentrant showExists(showId) {
        Show storage s = _shows[showId];
        if (s.stage == Stage.HALTED) revert ShowHalted();
        if (s.stage != Stage.SETTLEMENT_LOCKED) revert InvalidStage(uint8(Stage.SETTLEMENT_LOCKED), uint8(s.stage));

        uint256 n = s.teamWallets.length;

        // 보낼 총액은 **장부(payout[])** 에서만 나온다. `balanceOf(this)`를 쓰지 않는 이유:
        // 누군가 이 컨트랙트로 YoYo를 직접 transfer 하면 그 미귀속 잔액까지 팀에 흘러나간다.
        uint256 total;
        for (uint256 i; i < n; ++i) {
            total += s.payout[i];
        }
        if (s.escrow < total) revert InsufficientEscrow();

        // 효과 먼저. 전송 루프가 시작되기 전에 stage와 escrow를 확정한다 —
        // 루프 안에서 외부 호출이 팀 수만큼 나가므로 재진입 창을 남기면 안 된다.
        // `Σ payout == R == escrow`이므로 정상 흐름에서는 이 뺄셈 뒤 escrow가 정확히 0이다.
        s.stage = Stage.RELEASED;
        s.escrow -= total;

        for (uint256 i; i < n; ++i) {
            uint256 amount = s.payout[i];
            if (amount == 0) continue; // 0원 transfer는 이벤트만 늘린다. 서버 대사도 0건을 기대하지 않는다.
            address wallet = s.teamWallets[i];
            _yoyo.safeTransfer(wallet, amount);
            emit Released(showId, uint8(i), wallet, amount);
        }
    }

    /**
     * @notice 보증금을 공연 생성 팀 리더 지갑으로 되돌린다.
     * @dev 반환 조건 두 가지 — ① RELEASED 확정 ② 공연 취소(HALTED) 후 전 건 환불 완료.
     *      ②의 "전 건 환불 완료"를 컨트랙트는 주문 목록으로 판정할 수 없다(목록을 들고 있지 않다).
     *      대신 **`escrow == 0`으로 판정한다**(감사 라운드 2 M-04). 환불이 한 건이라도 남아 있으면
     *      escrow에 그만큼 티켓 대금이 남아 있고, 그 상태에서 보증금이 host에게 먼저 나가면
     *      "관객 돈을 돌려주기 전에 주최 팀이 자기 보증금을 회수한" 순서가 된다.
     *      RELEASED 경로도 같은 줄로 덮인다 — release가 escrow를 0으로 내리므로 정상 흐름은 통과한다.
     *      escrow가 0이 아닌 채 RELEASED가 됐다면 그것 자체가 불변식 2 위반이라 막는 게 맞다.
     *
     *      서버는 여전히 refund N건이 전부 CONFIRMED인지 확인한 뒤 호출한다 — 온체인 검사는 2중 방어다.
     */
    function returnDeposit(uint256 showId) external onlyOperator nonReentrant showExists(showId) {
        Show storage s = _shows[showId];
        if (s.stage != Stage.RELEASED && s.stage != Stage.HALTED) {
            revert InvalidStage(uint8(Stage.RELEASED), uint8(s.stage));
        }
        if (s.deposit == 0) revert NoDepositToReturn();
        // [M-04] 티켓 대금이 남아 있으면 보증금을 먼저 빼갈 수 없다.
        if (s.escrow != 0) revert InsufficientEscrow();

        // 효과 먼저 — `deposit`·`purchase`·`refund`와 같은 순서다.
        uint256 amount = s.deposit;
        address to = s.teamWallets[s.hostTeamIndex];
        s.deposit = 0;

        _yoyo.safeTransfer(to, amount);

        emit DepositReturned(showId, to, amount);
    }

    /**
     * @notice 공연 취소·되돌릴 수 없는 이의 판정 시 정산을 영구 중단한다(종단).
     * @dev **사람이 결정한다.** 시스템이 자동 전이시키지 않는다(project-truth §6).
     *      HALTED 이후 aggregate·lock·release는 영구 revert, refund만 허용한다.
     *      RELEASED 이후에는 halt 할 수 없다 — 돈이 이미 팀 지갑으로 나갔고 회수할 방법이 없다.
     */
    function halt(uint256 showId) external onlyOperator showExists(showId) {
        Show storage s = _shows[showId];
        if (s.stage == Stage.RELEASED) revert InvalidStage(uint8(Stage.SETTLEMENT_LOCKED), uint8(s.stage));
        if (s.stage == Stage.HALTED) revert ShowHalted();

        // 종단 전이. 되돌아오는 경로는 없다 — aggregate·lock·release·startSale이 전부 ShowHalted /
        // InvalidStage로 막히고, 남는 것은 주문별 refund와 (환불이 끝난 뒤의) returnDeposit뿐이다.
        s.stage = Stage.HALTED;
        emit Halted(showId);
    }

    /**
     * @notice 보증금 몰수. **P1 — MVP에서는 구현하지 않는다.**
     * @dev 시그니처만 예약해 둔다. MVP에서는 어떤 조건으로도 몰수하지 않는다(요구사항 §7.5).
     *      지금 자리를 잡아 두는 이유는, 나중에 추가하면 ABI가 바뀌어 서버·프론트가 다시 배포돼야 하기 때문이다.
     *
     *      `nonReentrant`는 지금 아무 일도 하지 않지만 미리 붙여 둔다(감사 라운드 1 L-04) —
     *      P1에서 본문을 채울 때 `deposit`·`returnDeposit`과 달리 보호가 빠진 채로 자금 이동
     *      코드가 들어가는 것을 막는다. modifier를 나중에 추가하는 것은 잊기 쉽다.
     */
    function forfeitDeposit(uint256 showId) external onlyOperator nonReentrant showExists(showId) {
        showId;
        revert NotImplemented();
    }

    // =====================================================================
    // 역할 교체 (YoYo.sol과 같은 봉인 정책 — 문서 13번 §3.6)
    // =====================================================================

    /// @notice OPERATOR 키를 교체한다. admin만 호출할 수 있다.
    function rotateOperator(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next == address(0)) revert ZeroAddress();
        if (hasRole(DEFAULT_ADMIN_ROLE, next)) revert RoleConflict();
        // [M-09] 배포 스크립트의 `assertRolesDistinct`는 이 경로를 덮지 못한다.
        // `next == address(0)`은 바로 위에서 이미 막혔으므로, 조회 불가 토큰이 돌려주는
        // sentinel `address(0)`과 겹쳐 오탐이 나지 않는다.
        // 한계는 `createShow`의 팀 지갑 검사(H-01)와 같은 스냅샷이다 — YoYo 쪽에서 나중에
        // minter 를 현재 operator 로 옮기는 반대 방향은 Splitter 가 막을 수 없다(문서 13 §2.3 경고).
        if (next == _yoyoMinter()) revert RoleConflict();

        address previous = operator;
        if (previous == next) revert RoleConflict();

        _revokeRole(OPERATOR_ROLE, previous);
        _grantRole(OPERATOR_ROLE, next);
        operator = next;

        emit OperatorRotated(previous, next);
    }

    /// @dev 봉인. `rotateOperator`를 사용한다.
    function grantRole(bytes32, address) public pure override {
        revert RoleManagementDisabled();
    }

    /// @dev 봉인.
    function revokeRole(bytes32, address) public pure override {
        revert RoleManagementDisabled();
    }

    /// @dev 봉인.
    function renounceRole(bytes32, address) public pure override {
        revert RoleManagementDisabled();
    }

    // =====================================================================
    // view — 전부 무료 call. 검증 페이지(V-01·V-02)와 서버 대사가 읽는다.
    // =====================================================================

    /// @notice 정산 대상 토큰 주소. 서버 기동 시 `CoinIssuerPort.tokenAddress()`와 대조한다.
    function token() external view returns (address) {
        return address(_yoyo);
    }

    /// @notice 티켓 대금 잔액(보증금 제외). 정산 재원 R의 원천.
    function escrowOf(uint256 showId) external view returns (uint256) {
        return _shows[showId].escrow;
    }

    /// @notice 납부된 보증금 잔액. escrow와 별도 장부다.
    function depositOf(uint256 showId) external view returns (uint256) {
        return _shows[showId].deposit;
    }

    /// @notice 이 공연이 요구하는 보증금 금액(50,000).
    function depositAmountOf(uint256 showId) external view returns (uint256) {
        return _shows[showId].depositAmount;
    }

    /**
     * @dev `showExists`를 붙이는 이유(감사 라운드 1 L-01) — 이게 없으면 **미등록 공연**에서
     *      배열이 비어 있어 어떤 teamIndex든 `TeamIndexOutOfRange`가 난다. 서버는 그것을
     *      `COMMON_VALIDATION_FAILED`(입력값 오류)로 번역하는데, 실제 상황은
     *      "서버 DB와 온체인이 어긋났다"는 사고이고 `COMMON_NOT_FOUND` + 운영자 알림 대상이다.
     *      **알림이 떠야 할 사고가 입력 오류로 조용히 묻히는 것**을 막는다.
     */
    function choiceCountOf(uint256 showId, uint8 teamIndex) external view showExists(showId) returns (uint256) {
        Show storage s = _shows[showId];
        if (teamIndex >= s.choiceCount.length) revert TeamIndexOutOfRange();
        return s.choiceCount[teamIndex];
    }

    function choiceCountsOf(uint256 showId) external view returns (uint256[] memory) {
        return _shows[showId].choiceCount;
    }

    /// @notice T = Σ choiceCount. 검증 페이지가 선택 풀을 재계산할 때 쓴다.
    function totalChoicesOf(uint256 showId) external view returns (uint256 total) {
        // 반환값 이름 `total`을 유지한다 — ABI JSON의 outputs[0].name이 바뀌면 이강륜의
        // web3j 래퍼 재생성 diff에 불필요한 잡음이 섞인다(selector는 어차피 불변이지만).
        total = _totalChoices(_shows[showId]);
    }

    function rulesHashOf(uint256 showId) external view returns (bytes32) {
        return _shows[showId].rulesHash;
    }

    /// @notice 잠긴 규칙 전체. 검증 페이지가 §7.2를 재현할 때 읽는 값이다.
    function rulesOf(uint256 showId)
        external
        view
        returns (uint16 fixedRatioBp, uint16 selectionRatioBp, uint16[] memory teamShareBp)
    {
        Show storage s = _shows[showId];
        return (s.fixedRatioBp, s.selectionRatioBp, s.teamShareBp);
    }

    /**
     * @notice 이 지갑이 **현재 규칙**에 동의했는지. 시그니처·반환 타입은 그대로다(ABI 무관).
     * @dev 내부 표현만 `bool` → 판본 비교로 바뀌었다(감사 라운드 2 M-03).
     *      `rulesEpoch != 0` 검사가 필요한 이유 — 미등록 공연은 `rulesEpoch`도 `agreedEpoch`도
     *      0이라, 그 검사가 없으면 **존재하지 않는 공연에서 아무 지갑이나 `true`가 나온다.**
     *
     *      **[M-06 · 감사 라운드 3] 이 가드는 view만 구제한다.** `createShow`가 `rulesEpoch = 1`을
     *      빠뜨려 0으로 남으면, 이 view는 가드 덕에 `false`(미동의)를 돌려주지만
     *      `agreeToRules`의 중복 검사(`:494`)는 `0 == 0`으로 참이 되어 **전원에게 `AlreadyAgreed`**
     *      가 나간다 — **view와 tx가 정반대 신호를 내고**, 서버는 `AlreadyAgreed`를
     *      `COMMON_CONFLICT`로 삼켜 재시도하지 않는다. 사고가 `startSale` 실패까지 숨는다.
     *      **여기 가드가 있으니 초기화를 생략해도 된다고 읽지 마라.** `createShow` TODO 참조.
     */
    function agreedOf(uint256 showId, address wallet) external view returns (bool) {
        Show storage s = _shows[showId];
        return s.rulesEpoch != 0 && s.agreedEpoch[wallet] == s.rulesEpoch;
    }

    function agreedCountOf(uint256 showId) external view returns (uint8) {
        return _shows[showId].agreedCount;
    }

    function teamWalletsOf(uint256 showId) external view returns (address[] memory) {
        return _shows[showId].teamWallets;
    }

    function teamCountOf(uint256 showId) external view returns (uint8) {
        return uint8(_shows[showId].teamWallets.length);
    }

    function hostTeamIndexOf(uint256 showId) external view returns (uint8) {
        return _shows[showId].hostTeamIndex;
    }

    /// @notice Stage enum의 uint8 값. 0 = NONE(존재하지 않음).
    function stageOf(uint256 showId) external view returns (uint8) {
        return uint8(_shows[showId].stage);
    }

    /// @dev `showExists` 이유는 `choiceCountOf`와 같다(감사 라운드 1 L-01).
    function payoutOf(uint256 showId, uint8 teamIndex) external view showExists(showId) returns (uint256) {
        Show storage s = _shows[showId];
        if (teamIndex >= s.payout.length) revert TeamIndexOutOfRange();
        return s.payout[teamIndex];
    }

    /// @notice 팀별 분배액 전체. Σ == R 인지 한 번에 검산할 수 있다.
    function payoutsOf(uint256 showId) external view returns (uint256[] memory) {
        return _shows[showId].payout;
    }

    /// @notice aggregate가 기록한 서버 집계 티켓 수(대사 스냅샷).
    function validTicketCountOf(uint256 showId) external view returns (uint256) {
        return _shows[showId].validTicketCount;
    }

    /**
     * @notice 주문 1건의 온체인 기록.
     * @dev 5번째 반환값 `refundedAmount`는 **누적 환불액**이다(H-02 수정). `0`이면 미환불,
     *      `amount`와 같으면 전액 환불 완료, 그 사이면 부분 환불 상태다.
     *      이전 버전의 `bool refunded`를 대체한다 — 서버 web3j 래퍼 재생성이 필요하다.
     */
    function purchaseOf(uint256 showId, bytes32 orderRef)
        external
        view
        returns (address buyer, uint8 teamIndex, uint256 amount, uint16 quantity, uint256 refundedAmount)
    {
        Purchase storage p = _shows[showId].purchases[orderRef];
        return (p.buyer, p.teamIndex, p.amount, p.quantity, p.refundedAmount);
    }

    // =====================================================================
    // internal
    // =====================================================================

    /**
     * @dev 규칙의 형태 검증. createShow와 updateRules가 공유한다.
     *      "새 setter를 추가할 때마다 이 검증을 지나게 한다" — 하나라도 빠지면 잠금이 뚫린다.
     */
    function _validateRuleShape(
        address[] memory teamWallets,
        uint8 hostTeamIndex,
        bytes32 rulesHash,
        uint16 fixedRatioBp,
        uint16 selectionRatioBp,
        uint16[] memory teamShareBp
    ) private pure {
        uint256 n = teamWallets.length;
        if (n == 0 || n > MAX_TEAMS) revert InvalidTeamCount();
        if (teamShareBp.length != n) revert ArrayLengthMismatch();
        if (hostTeamIndex >= n) revert HostIndexOutOfRange();
        if (rulesHash == bytes32(0)) revert ZeroRulesHash();
        if (uint256(fixedRatioBp) + uint256(selectionRatioBp) != BP) revert InvalidBpSum();

        uint256 shareSum;
        for (uint256 i; i < n; ++i) {
            shareSum += teamShareBp[i];
        }
        if (shareSum != BP) revert InvalidBpSum();
    }

    /**
     * @dev 팀 지갑 검증 — 0 주소·중복·운영 키 겹침을 막는다.
     *      팀 수가 최대 8이라 O(n^2) 중복 검사로 충분하다(최대 28회 비교).
     */
    function _validateTeamWallets(address[] calldata teamWallets) private view {
        uint256 n = teamWallets.length;

        // [H-01] YoYo 쪽 MINTER 주소는 루프 밖에서 한 번만 읽는다 — 팀이 8개여도 staticcall 1회다.
        address yoyoMinter = _yoyoMinter();

        for (uint256 i; i < n; ++i) {
            address w = teamWallets[i];
            if (w == address(0)) revert ZeroAddress();

            // ① Splitter 쪽 역할 — OPERATOR·admin.
            if (hasRole(OPERATOR_ROLE, w) || hasRole(DEFAULT_ADMIN_ROLE, w) || w == address(_yoyo) || w == address(this)) {
                revert ReservedAddress(w);
            }

            // ② YoYo 쪽 역할 — MINTER·admin. (감사 라운드 1 H-01 · contract-interface §3.2
            //    "팀 주소 != OPERATOR/MINTER". 문서에는 있었고 코드에 빠져 있던 검사다.)
            //    DEFAULT_ADMIN_ROLE은 OZ AccessControl에서 bytes32(0)이고 YoYo도 같은 상수를 쓴다.
            if (yoyoMinter != address(0) && w == yoyoMinter) revert ReservedAddress(w);
            if (_isYoYoAdmin(w)) revert ReservedAddress(w);

            for (uint256 j = i + 1; j < n; ++j) {
                if (teamWallets[j] == w) revert DuplicateTeamWallet(w);
            }
        }
    }

    /**
     * @dev `T = Σ choiceCount[i]`. `aggregate`의 대사(H-04)와 `totalChoicesOf` view가 **같은 계산**을
     *      써야 한다 — 서버가 view로 읽어 확인한 값과 tx가 대조하는 값이 다르면 대사 자체가 무의미해진다.
     *      팀 수 ≤ 8이라 루프 비용은 유계다.
     */
    function _totalChoices(Show storage s) private view returns (uint256 total) {
        uint256[] storage counts = s.choiceCount;
        uint256 n = counts.length;
        for (uint256 i; i < n; ++i) {
            total += counts[i];
        }
    }

    /**
     * @dev 토큰에 역할 조회를 시도하고 **32바이트 워드 하나를 정확히 돌려받았을 때만** 성공으로 본다.
     *      (감사 라운드 2 L-06 — `try/catch`를 대체한다.)
     *
     *      **왜 `try/catch`가 아닌가.** `try/catch`는 외부 호출 자체의 revert만 잡고
     *      **반환값 디코딩 실패는 잡지 못한다.** 토큰 주소가 컨트랙트가 아니거나(EOA·자기파괴됨)
     *      fallback을 가진 컨트랙트(프록시 ERC-20이 흔하다)면 staticcall은 **성공**하면서
     *      빈/짧은 데이터를 돌려주고, 그 디코딩 실패가 `catch`에 안 걸린 채 밖으로 튀어
     *      `createShow`가 **이름 없는 revert**(`reverted without a reason string`)로 죽는다.
     *      서버 매핑 표(문서 13번 §4.6)에 없는 실패라 `COMMON_INTERNAL_ERROR`로만 처리된다.
     *
     *      저수준 호출은 revert도, 짧은 반환도, 32바이트가 아닌 반환도 **똑같이 `(false, 0)`으로**
     *      접어 넣는다. 호출자는 그것을 "역할 개념이 없는 토큰"으로 보고 그 검사만 건너뛴다.
     *
     *      **접히지 않는 경계 두 개**(감사 라운드 3 실측 · 문서 13번 §4.1):
     *        ① fallback이 **정확히 32바이트**를 돌려주면 길이 검사를 통과해 유효한 워드로 읽힌다.
     *           그 값이 0이 아니면 `_isYoYoAdmin`이 **모든 주소를 admin으로 판정**해
     *           `createShow`가 `ReservedAddress`로 막힌다(L-07). 자금 손실은 없고 방향은 안전하다.
     *        ② **가스 소진은 접지 못한다.** staticcall은 남은 가스의 63/64를 넘기므로, 토큰이
     *           그것을 태우면 subcall은 `success=false`로 접혀도 가스가 돌아오지 않아
     *           `createShow` 자체가 OOG로 죽는다(I-06).
     *      둘 다 적대적·비표준 토큰에서만 성립하며 `_yoyo`는 `immutable`이다 —
     *      실질 방어는 배포 어서션 `token() == YoYo`(문서 13번 §6 ②) 하나다.
     *
     * @return ok   32바이트를 돌려받았는가.
     * @return word 그 32바이트(호출자가 타입에 맞게 좁힌다). 실패 시 0.
     */
    function _tryReadWord(bytes memory callData) private view returns (bool ok, bytes32 word) {
        (bool success, bytes memory data) = address(_yoyo).staticcall(callData);
        if (!success || data.length != 32) return (false, bytes32(0));
        // 길이를 이미 확인했으므로 abi.decode 대신 첫 워드를 그대로 읽는다.
        // abi.decode(data, (address))는 상위 12바이트가 더러우면 **revert 한다** —
        // 그러면 이 함수가 막으려던 "이름 없는 revert"가 되살아난다.
        assembly {
            word := mload(add(data, 0x20))
        }
        ok = true;
    }

    /**
     * @dev YoYo의 현재 MINTER 주소. 조회 불가 토큰이면 `address(0)`을 돌려주고 검사를 건너뛴다.
     *
     *      **`address(0)`을 sentinel로 써도 H-01 검사가 무력화되지 않는다**(리더 확인 요청 항목):
     *      ① 호출자 `_validateTeamWallets`가 루프 첫 줄에서 `w == address(0)`이면 `ZeroAddress()`로
     *         이미 revert하므로, `w == yoyoMinter` 비교가 `0 == 0`으로 참이 되는 경우가 없다.
     *      ② YoYo의 `minter`는 생성자(`minter_ == 0` → `ZeroAddress`)와 `rotateMinter`
     *         (`next == 0` → `ZeroAddress`) 양쪽에서 0이 될 수 없다 — 정상 YoYo에서 실제 값이
     *         sentinel과 겹치지 않는다.
     *      호출자에도 `yoyoMinter != address(0) &&` 가드가 남아 있어 방어가 이중이다.
     *
     *      상위 160비트 초과분은 **잘라서** 쓴다(revert하지 않는다). 정상 ABI 인코딩이면 그 비트가
     *      0이고, 더러운 값을 돌려주는 토큰이라면 어차피 팀 지갑(정상 주소)과 같아질 수 없다.
     */
    function _yoyoMinter() private view returns (address) {
        (bool ok, bytes32 word) = _tryReadWord(abi.encodeCall(IYoYoRoles.minter, ()));
        if (!ok) return address(0);
        return address(uint160(uint256(word)));
    }

    /**
     * @dev `w`가 YoYo의 `DEFAULT_ADMIN_ROLE` 보유자인지. 조회 불가 토큰이면 `false`.
     *      `!= 0`을 참으로 본다 — `abi.decode(…, (bool))`은 값이 0·1이 아니면 revert하므로 쓸 수 없다.
     *      표준 인코딩에서는 0 또는 1뿐이고, 그 밖의 값은 "보유함"으로 보아 `ReservedAddress`로
     *      막는 쪽이 안전하다(팀 지갑을 잘못 통과시키는 것보다 잘못 막는 편이 낫다).
     */
    function _isYoYoAdmin(address w) private view returns (bool) {
        (bool ok, bytes32 word) = _tryReadWord(abi.encodeCall(IYoYoRoles.hasRole, (DEFAULT_ADMIN_ROLE, w)));
        return ok && word != bytes32(0);
    }
}
