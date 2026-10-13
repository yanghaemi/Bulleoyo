// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title YoYo
 * @notice 이 세계의 원(₩). 법정화폐가 없는 가정 세계의 유일한 지불 수단이다.
 *
 * 설계 고정값 (요구사항 v6 · 결정 v2 §2.1·§2.4 · project-truth §2):
 *
 *  1. `decimals() == 0`.  1 YoYo = ₩1. 10,000원은 정확히 `10000`이다.
 *     소수점 자리가 없으므로 서버·프론트에서 1e18 스케일링(`parseEther`·`parseUnits(x,18)`·
 *     `BigDecimal`)을 하면 안 된다. 이 값을 잘못 잡으면 "비율은 맞는데 금액만 1e18배"인
 *     상태로 테스트가 전부 통과하므로, 배포 스크립트에 `decimals() == 0` 어서션을 둔다.
 *
 *  2. **mint만 있고 burn이 없다.**  코인이 사라지는 연산이 설계에 존재하지 않는다.
 *     그래서 `totalSupply()`는 단조 증가해야 하고, 감소는 그 자체로 이상 신호다
 *     (자금 흐름 불변식 1번, 요구사항 v6 §7.6). `_burn`을 호출하는 경로를 만들지 않는다.
 *
 *  3. 발행 경로는 하나다 — `MINTER_ROLE`을 가진 **서버 MINTER 키 1주소**.
 *     운영 tx를 보내는 OPERATOR 키(수수료 대납 + RevenueSplitter 운영)와는 다른 주소이며,
 *     YoYo는 OPERATOR라는 개념 자체를 모른다.
 *
 *  4. `grantRef` — 서버 멱등키(`grant:signup:{memberId}` 또는 관리자 UUID)의 keccak256.
 *     같은 grantRef로 두 번 발행하면 revert 한다(`GrantRefUsed`). 서버의
 *     `chain_job.idempotency_key UNIQUE`와 합쳐 "같은 지급이 두 번 나가는" 사고를
 *     오프체인·온체인 두 겹으로 막는다.
 *
 *  5. 역할 관리 봉인 — `grantRole`·`revokeRole`·`renounceRole`을 전부 막고
 *     `rotateMinter(next)` 하나만 연다. 상세는 아래 "역할 관리 봉인" 주석.
 *
 * 이름도 티커도 `"YoYo"`다. 통화 서사를 담은 풀네임("Korean Won Stable" 류)은 결정 §14-1로
 * 삭제됐다 — 이 세계에는 법정화폐가 없으므로 페그·준비금·스테이블코인 서사를 쓰지 않는다.
 * 코인 이름은 2026-09-08 팀 결정으로 `YoYo`가 됐다. 바뀐 것은 **이름뿐**이다 —
 * `decimals = 0`·mint 전용·역할 분리·이벤트 인자·revert 이름은 한 글자도 바뀌지 않았다.
 * 구버전 설계 문서(`_v1`~`_v5`)의 옛 코인 이름 표기는 소급 수정하지 않는다. 개명 이력은
 * `docs/design/13_컨트랙트_인터페이스_v1.md` 변경 이력 표에 있다.
 */
contract YoYo is ERC20, ERC20Pausable, AccessControl {
    /// @notice `mint`를 호출할 수 있는 유일한 역할. 서버 MINTER 키 1주소가 보유한다.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /**
     * @notice 현재 MINTER_ROLE 보유 주소. 항상 정확히 1개다.
     * @dev AccessControl은 "역할을 가진 주소가 몇 개인지"를 열거해 주지 않는다.
     *      역할 관리를 봉인하고 이 변수를 `rotateMinter`에서만 갱신하므로,
     *      검증 페이지·감사자가 `minter()` 한 번으로 "발행 경로는 이 주소 하나"를 확인할 수 있다.
     */
    address public minter;

    /// @notice 이미 사용된 지급 멱등키. 재사용 시 `GrantRefUsed`로 revert 한다.
    mapping(bytes32 grantRef => bool used) public usedGrantRef;

    /**
     * @notice 시연용 코인 지급이 발생했다.
     * @dev 표준 `Transfer(address(0), to, amount)`와 함께 나간다. 서버는 `grantRef`로
     *      자기 `chain_job`과 대조하고, 검증 페이지는 Σ`Minted.amount == totalSupply()`
     *      (불변식 1번)를 대사한다.
     */
    event Minted(address indexed to, uint256 amount, bytes32 indexed grantRef);

    /// @notice MINTER 키가 교체됐다. 배포 이후 발행 경로가 바뀐 유일한 흔적이다.
    event MinterRotated(address indexed previousMinter, address indexed newMinter);

    /// @notice 0 주소를 인자로 받았다.
    error ZeroAddress();
    /// @notice 0 YoYo 발행은 의미가 없다(이벤트만 남고 상태는 그대로).
    error ZeroAmount();
    /// @notice `grantRef`가 0이다. 0을 허용하면 첫 지급이 0을 소진해 이후 전부 막힌다.
    error ZeroGrantRef();
    /// @notice 이미 사용된 지급 멱등키다. 서버는 이 revert를 "이미 지급됨"으로 해석한다(실패 아님).
    error GrantRefUsed(bytes32 grantRef);
    /// @notice 역할 관리가 봉인돼 있다. `rotateMinter`만 사용할 수 있다.
    error RoleManagementDisabled();
    /// @notice 한 주소가 admin과 minter를 겸할 수 없다(권한 분리 위반).
    error RoleConflict();

    /**
     * @param admin  DEFAULT_ADMIN_ROLE — pause/unpause·MINTER 교체.
     *               **admin 전용 콜드 키**이며 배포자이기도 하다(사용자 확정 2026-09-07,
     *               감사 라운드 1 C-01 방안 A). 서버에는 넣지 않는다.
     * @param minter_ MINTER_ROLE — 서버 MINTER 키. `admin`과 반드시 다른 주소여야 한다.
     *
     * @dev 운영 키는 셋이고 **세 주소가 전부 다르다** — admin(콜드) · OPERATOR(서버 런타임,
     *      대납 fee payer) · MINTER(서버 런타임). YoYo는 OPERATOR라는 개념을 모르므로
     *      여기서는 `admin != minter_`만 검사한다. "admin ≠ OPERATOR"는
     *      `RevenueSplitter` 생성자의 `RoleConflict()`가 강제한다.
     *
     *      admin이 OPERATOR와 같은 주소면 안 되는 이유: OPERATOR 키는 모든 사용자 tx의
     *      fee payer로 상시 hot 상태다. 그 키가 admin까지 겸하면 유출 시
     *      `rotateMinter(공격자 주소)` 1 tx + `mint(무제한)` 1 tx로 발행량 공시(불변식 1)가
     *      무의미해진다. 생성자 검사는 배포 시점 1회뿐이고 admin 권한으로 언제든 되돌릴 수 있다.
     */
    constructor(address admin, address minter_) ERC20("YoYo", "YoYo") {
        if (admin == address(0) || minter_ == address(0)) revert ZeroAddress();
        if (admin == minter_) revert RoleConflict();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter_);
        minter = minter_;
    }

    /// @inheritdoc ERC20
    /// @dev 0 고정. 이 오버라이드를 빠뜨리면 ERC20 기본값 18이 적용된다.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /**
     * @notice 시연용 코인을 지급한다. 서버 MINTER 키만 호출할 수 있다.
     * @param to       받는 지갑(회원 지갑 주소).
     * @param amount   YoYo 정수. 신규 가입 지급은 100000, 관리자 지급은 1~1000000.
     * @param grantRef 서버 멱등키의 keccak256. 같은 값으로 두 번 부르면 revert 한다.
     *
     * @dev 상태 변경(usedGrantRef)을 `_mint`보다 먼저 한다(checks-effects-interactions).
     *      YoYo에는 수신자 콜백이 없어 재진입 경로가 없지만, 순서를 지키는 편이 규칙으로 단순하다.
     */
    function mint(address to, uint256 amount, bytes32 grantRef) external onlyRole(MINTER_ROLE) whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (grantRef == bytes32(0)) revert ZeroGrantRef();
        if (usedGrantRef[grantRef]) revert GrantRefUsed(grantRef);

        usedGrantRef[grantRef] = true;
        _mint(to, amount);

        emit Minted(to, amount, grantRef);
    }

    /**
     * @notice MINTER 키를 교체한다. admin만 호출할 수 있다.
     * @dev 역할 관리 봉인(아래 주석)의 유일한 예외다. 이전 minter의 역할을 반드시 회수하므로
     *      "발행 권한을 가진 주소는 언제나 1개"라는 성질이 유지된다.
     */
    function rotateMinter(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next == address(0)) revert ZeroAddress();
        if (hasRole(DEFAULT_ADMIN_ROLE, next)) revert RoleConflict();

        address previous = minter;
        if (previous == next) revert RoleConflict();

        _revokeRole(MINTER_ROLE, previous);
        _grantRole(MINTER_ROLE, next);
        minter = next;

        emit MinterRotated(previous, next);
    }

    /// @notice 이상 징후(불변식 1번 위반 등) 시 모든 전송·발행을 멈춘다.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice 정지를 해제한다.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // 역할 관리 봉인 (채택: 2026-09-07 · contract-dev §3 "채택 권장")
    //
    //  왜: 이 프로젝트가 온체인으로 증명하려는 것 중 하나가 "코인이 어디서 생기는지가
    //      정확히 한 경로뿐"이라는 사실이다. OZ AccessControl을 그대로 두면 admin이 언제든
    //      MINTER_ROLE을 여러 주소에 뿌릴 수 있고, 감사자는 배포 이후의 모든 블록을 훑어
    //      RoleGranted 이벤트를 확인해야만 그 사실을 부정할 수 있다.
    //      grantRole 계열을 막고 rotateMinter만 남기면 "동시에 minter는 1개"가
    //      코드 자체로 보장되고, 검증 페이지는 minter() 한 번 읽으면 끝난다.
    //
    //  대안 1) 봉인하지 않고 RoleGranted 이벤트를 검증 페이지에서 감시 — 감시가 빠지면
    //          아무것도 보장하지 않고, 파싱해야 할 이벤트가 늘어난다(이강륜 작업 증가).
    //  대안 2) MINTER_ROLE만 봉인하고 admin 역할은 열어 두기 — getRoleAdmin 우회로
    //          admin이 자기 역할의 admin을 바꿔 다시 MINTER를 뿌릴 수 있어 봉인이 반쪽이 된다.
    //
    //  대가(반드시 문서화): **admin 키는 교체·양도·포기가 불가능하다.** admin 키를 잃으면
    //      pause/unpause와 rotateMinter를 영구히 못 쓴다. 복구 수단은 재배포뿐이다.
    //      배포가 1차(9/9)·최종(W5) 두 번뿐인 시연 프로젝트라 이 대가를 받아들인다.
    //      운영 서비스라면 rotateAdmin(2단계 수락) 또는 다중서명 admin이 필요하다.
    // ---------------------------------------------------------------------

    /// @dev 봉인. `rotateMinter`를 사용한다.
    function grantRole(bytes32, address) public pure override {
        revert RoleManagementDisabled();
    }

    /// @dev 봉인. `rotateMinter`를 사용한다.
    function revokeRole(bytes32, address) public pure override {
        revert RoleManagementDisabled();
    }

    /// @dev 봉인. 역할 포기 경로를 열어 두면 admin이 사고로 자기 권한을 버릴 수 있다.
    function renounceRole(bytes32, address) public pure override {
        revert RoleManagementDisabled();
    }

    /**
     * @dev OZ v5에서 `_beforeTokenTransfer`가 사라지고 `_update` 하나로 합쳐졌다.
     *      ERC20과 ERC20Pausable 양쪽이 이 함수를 정의하므로 명시적으로 합쳐 준다.
     *      mint(from == 0)·transfer 모두 이 경로를 지나므로 pause 시 발행도 함께 멈춘다.
     */
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }
}
