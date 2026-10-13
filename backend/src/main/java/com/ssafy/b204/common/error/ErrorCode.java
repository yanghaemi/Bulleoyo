package com.ssafy.b204.common.error;

import org.springframework.http.HttpStatus;

/**
 * 에러 코드 정본 — API 공통 응답 규격 v3 §3의 84개를 절 순서 그대로 옮긴 것이다.
 *
 * <p><b>규칙</b>(규격 §2 · API v6 §0.10)
 *
 * <ul>
 *   <li>모든 코드는 이 enum 한 곳에만 정의한다.
 *   <li><b>규격 §3에 있는 코드만 쓴다.</b> 규격에 없는 코드는 배포하지 않는다. API v6 §16.1이
 *       "신설·재정의 후보 23개"를 대체 코드와 함께 정리해 두었고 <b>본문에서 하나도 쓰지 않는다</b>고
 *       못박았으므로, 필요해 보여도 여기에 새 상수를 만들지 말고 §16.1이 지정한 대체 코드를 쓴다.
 *       (예: 서명 RLP 디코드 실패 → {@link #COMMON_VALIDATION_FAILED}, receipt 검증 실패 →
 *       {@link #PAYMENT_AMOUNT_MISMATCH})
 *   <li><b>예외는 "대체 코드가 막다른 길일 때"뿐이다.</b> 한 API에서 같은 코드가 화면 행동이
 *       서로 다른 원인들을 덮어 버리면 클라이언트가 분기할 키가 없어진다 — {@code msg} 분기는
 *       규격 §1이 금지한다. 그때만 신설하고, 대체 코드를 못 쓰는 이유를 상수 javadoc에 적은 뒤
 *       해당 API의 4xx 표에 날짜 태그와 함께 넣는다({@link #RULE_SYNC_IN_PROGRESS} 선례,
 *       {@link #WALLET_BALANCE_INSUFFICIENT} · {@link #PERFORMANCE_RULES_REQUIRED}).
 *   <li><b>배포된 코드 문자열은 변경 금지.</b> 클라이언트 분기의 유일한 키다.
 *   <li>신규 코드를 추가하면 규격 문서 §3에 발생 조건과 예시를 함께 추가한다.
 * </ul>
 *
 * <p>{@code code} 문자열은 별도 필드로 두지 않고 {@link #name()}을 그대로 쓴다 — 상수명과 응답
 * 문자열이 언제나 같아야 하고, 필드로 중복 보관하면 둘이 어긋날 수 있기 때문이다.
 *
 * <p>{@code defaultMsg}는 <b>값이 들어가지 않은 형태</b>다. 규격 §3 예시에 금액·시각·수량이 박혀 있던
 * 5개({@code COMMON_VALIDATION_FAILED}, {@code TICKET_PURCHASE_LIMIT_EXCEEDED},
 * {@code ENTRY_ALREADY_ENTERED}, {@code SETTLEMENT_DISPUTE_PERIOD},
 * {@code RESALE_PRICE_EXCEEDS_ORIGINAL})는 예시값을 뺀 문장을 기본값으로 두었다. 규격 §2가
 * "금액·시각처럼 값이 들어가야 하는 경우만 예외 생성 시 덮어쓴다"고 정했으므로, 값이 필요한 곳에서는
 * {@link BusinessException#of(ErrorCode, String)}으로 문구를 덮는다.
 *
 * <p>{@code msg}는 {@code Accept-Language}에 따라 en/ko로 내려가야 한다(API v6 §0.6). 여기 문구는
 * ko 기본값이며, i18n을 붙일 때 {@code messages_*.properties}의 키를 {@code error.{name()}}으로
 * 두고 이 값을 ko 번역으로 옮긴다.
 */
public enum ErrorCode {

    // ===================== §3.1 COMMON — 공통 =====================
    COMMON_VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "입력값을 다시 확인해 주세요."),
    COMMON_UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."),
    COMMON_FORBIDDEN(HttpStatus.FORBIDDEN, "이 작업을 수행할 권한이 없습니다."),
    COMMON_NOT_FOUND(HttpStatus.NOT_FOUND, "요청한 정보를 찾을 수 없습니다."),
    COMMON_CONFLICT(HttpStatus.CONFLICT, "다른 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요."),
    COMMON_TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."),
    COMMON_INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."),
    COMMON_EXTERNAL_SERVICE_ERROR(HttpStatus.BAD_GATEWAY, "외부 시스템 연동 중 오류가 발생했습니다."),

    // ===================== §3.2 AUTH — 인증·회원 =====================
    AUTH_INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다."),
    /** 클라이언트는 <b>이 코드에서만</b> 토큰 재발급을 시도한다. */
    AUTH_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "로그인이 만료되었습니다. 다시 로그인해 주세요."),
    /** 재발급 시도 없이 즉시 로그아웃. Web3Auth idToken 검증 실패(JWKS·aud·exp·nonce)도 이 코드다. */
    AUTH_TOKEN_INVALID(HttpStatus.UNAUTHORIZED, "인증 정보가 올바르지 않습니다."),
    AUTH_SIGNUP_REQUIRED(HttpStatus.CONFLICT, "가입 정보를 입력해 주세요."),
    AUTH_EMAIL_DUPLICATED(HttpStatus.CONFLICT, "이미 가입된 이메일입니다."),

    // ===================== §3.3 WALLET — 공연자(팀) 지갑 =====================
    WALLET_CREATION_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "팀 지갑 생성에 실패했습니다. 잠시 후 다시 시도해 주세요."),
    WALLET_NOT_FOUND(HttpStatus.NOT_FOUND, "팀 지갑 정보를 찾을 수 없습니다."),
    /** 원인은 절대 노출하지 않는다. */
    WALLET_KEY_DECRYPT_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "요청을 처리할 수 없습니다. 관리자에게 문의해 주세요."),
    WALLET_GAS_INSUFFICIENT(HttpStatus.CONFLICT, "팀 지갑의 네트워크 수수료가 부족합니다. 관리자에게 충전을 요청해 주세요."),
    /**
     * 리더 지갑 YoYo 잔액 < 보증금(API-performance-13 · S15P21B204-151).
     *
     * <p>§16.1 "v4에서 승계 — 지갑·인증"이 <b>이 API 한 곳</b>을 필요한 곳으로 지목한 코드다.
     * 같은 표의 {@code PAYMENT_INSUFFICIENT_BALANCE} 재정의 안은 API-payment-01·02까지
     * 번지므로 쓰지 않았다 — 그쪽은 <b>관객</b>의 티켓 결제이고 화면 문구가 다르다.
     *
     * <p>화면 분기는 <b>안내만</b>이다(잔액을 늘리는 버튼이 없다). 그래서 기본 문구에 행동
     * 지시를 넣지 않는다. 부족액은 서버만 아는 값이므로 호출부에서 msg를 덮는다.
     */
    WALLET_BALANCE_INSUFFICIENT(HttpStatus.CONFLICT, "리더 지갑의 YoYo 잔액이 부족합니다."),

    // ===================== §3.4 PERFORMANCE — 공연 =====================
    PERFORMANCE_NOT_FOUND(HttpStatus.NOT_FOUND, "공연을 찾을 수 없습니다."),
    PERFORMANCE_NOT_OWNER(HttpStatus.FORBIDDEN, "공연 주최자만 수정할 수 있습니다."),
    PERFORMANCE_INVALID_STATUS(HttpStatus.CONFLICT, "판매가 종료된 공연은 수정할 수 없습니다."),
    PERFORMANCE_ALREADY_ON_SALE(HttpStatus.CONFLICT, "티켓 판매가 시작되어 변경할 수 없습니다."),
    PERFORMANCE_DATE_INVALID(HttpStatus.BAD_REQUEST, "공연 일시와 예매 마감 일시를 다시 확인해 주세요."),
    /**
     * 정산 규칙이 없어 {@code createShow}를 만들 수 없다 — 보증금보다 규칙이 먼저다
     * (API-performance-13 · S15P21B204-151).
     *
     * <p>{@code COMMON_CONFLICT}로 쓰면 안 된다. 그 코드는 같은 API에서 "이미 낸 보증금"과
     * "잔액 부족"도 덮고 있었는데 화면이 할 다음 행동이 셋 다 다르다(각각 아무것도 안 함 ·
     * 안내 · <b>규칙 저장 화면으로 이동</b>). {@code msg}로 가르는 것은 규격 §1이 막는다.
     *
     * <p>§16.1의 신설 후보 표에는 이 이름이 없다. 그래도 신설한 근거는
     * {@link #RULE_SYNC_IN_PROGRESS}와 같다 — 대체 코드가 막다른 길이면 §16.1 제안 표가
     * 아니라 해당 API의 4xx 표에 직접 넣는다.
     */
    PERFORMANCE_RULES_REQUIRED(HttpStatus.CONFLICT, "정산 규칙을 먼저 저장해야 보증금을 낼 수 있습니다."),

    // ===================== §3.5 TEAM — 참여팀 =====================
    TEAM_NOT_FOUND(HttpStatus.NOT_FOUND, "공연팀을 찾을 수 없습니다."),
    TEAM_ALREADY_JOINED(HttpStatus.CONFLICT, "이미 이 공연에 참여한 팀입니다."),
    TEAM_INVITE_EXPIRED(HttpStatus.GONE, "초대가 만료되었습니다. 주최자에게 재요청해 주세요."),
    TEAM_MIN_COUNT_NOT_MET(HttpStatus.CONFLICT, "공동 공연은 참여팀이 2팀 이상이어야 합니다."),
    /**
     * 팀 해산(API-team-05) 차단. 진행 중 공연·미반환 보증금·미정산이 하나라도 남아 있으면 해산할 수
     * 없다 — 팀이 사라지면 그 돈을 받을 주소(리더 지갑)를 가리킬 근거가 없어진다. 어느 쪽에 걸렸는지는
     * {@code msg}로 구분한다.
     */
    TEAM_HAS_ACTIVE_PERFORMANCE(HttpStatus.CONFLICT, "진행 중인 공연이 있어 팀을 해산할 수 없습니다."),

    // ===================== §3.6 RULE — 정산 규칙 (핵심) =====================
    RULE_RATIO_SUM_INVALID(HttpStatus.BAD_REQUEST, "분배 비율의 합이 100%가 되어야 합니다."),
    RULE_NOT_AGREED_BY_ALL(HttpStatus.CONFLICT, "모든 참여팀이 정산 규칙에 동의해야 판매를 시작할 수 있습니다."),
    /** {@code startSale()} 이후 규칙 수정. 컨트랙트에서도 revert된다. */
    RULE_ALREADY_LOCKED(HttpStatus.CONFLICT, "정산 규칙이 확정되어 변경할 수 없습니다."),
    RULE_HASH_MISMATCH(HttpStatus.CONFLICT, "정산 규칙이 변경되었습니다. 내용을 다시 확인한 뒤 동의해 주세요."),
    /**
     * DB 규칙이 아직 온체인에 반영되지 않았다 — {@code updateRules} 진행 중이거나 실패했다
     * (S15P21B204-70 · 리뷰 !80 🟡 4).
     *
     * <p>{@code RULE_HASH_MISMATCH}로 쓰면 안 된다. 그쪽 문구는 "새로 불러온 뒤 다시"인데
     * 새로 불러와도 서버 해시는 그대로라 리더가 같은 버튼을 반복하게 된다 — 막다른 길이다.
     * 여기서 기다려야 하는 것은 <b>체인</b>이다.
     */
    RULE_SYNC_IN_PROGRESS(HttpStatus.CONFLICT, "정산 규칙을 블록체인에 반영하는 중입니다. 잠시 후 다시 시도해 주세요."),
    RULE_COMMON_COST_EXCEEDS_REVENUE(HttpStatus.CONFLICT, "공통 비용이 총 판매 금액을 초과했습니다."),

    // ===================== §3.7 TICKET — 티켓·예매 (일반 티켓) =====================
    TICKET_OPTION_NOT_FOUND(HttpStatus.NOT_FOUND, "선택한 티켓 종류를 찾을 수 없습니다."),
    TICKET_SALE_NOT_STARTED(HttpStatus.CONFLICT, "아직 예매가 시작되지 않았습니다."),
    TICKET_SALE_CLOSED(HttpStatus.CONFLICT, "예매가 마감되었습니다."),
    /** Redis 재고 차감 실패. 동시 예매 경합에서 밀린 경우. */
    TICKET_SOLD_OUT(HttpStatus.CONFLICT, "선택한 티켓이 모두 판매되었습니다."),
    /** 수량을 문구에 넣어야 하므로 호출부에서 msg를 덮는다. */
    TICKET_PURCHASE_LIMIT_EXCEEDED(HttpStatus.CONFLICT, "1인당 구매 가능 수량을 초과했습니다."),
    /** 온체인 선택 집계의 입력이므로 공동 공연에서는 필수다. */
    TICKET_TEAM_CHOICE_REQUIRED(HttpStatus.BAD_REQUEST, "보고 싶은 팀을 선택해 주세요."),
    TICKET_TEAM_CHOICE_INVALID(HttpStatus.BAD_REQUEST, "이 공연에 참여하지 않는 팀입니다."),
    /** 소유권은 DB 기준이다. */
    TICKET_NOT_OWNED(HttpStatus.FORBIDDEN, "본인 소유의 티켓이 아닙니다."),
    TICKET_ALREADY_USED(HttpStatus.CONFLICT, "이미 입장 처리된 티켓입니다."),
    TICKET_CANCELED(HttpStatus.CONFLICT, "취소된 티켓입니다."),

    // ===================== §3.8 PAYMENT — 결제 =====================
    PAYMENT_ALREADY_PAID(HttpStatus.CONFLICT, "이미 결제가 완료된 주문입니다."),
    /** 위조 시도로 간주하고 로그를 남긴다. receipt·이벤트 검증 실패도 이 코드를 빌려 쓴다(§16.1). */
    PAYMENT_AMOUNT_MISMATCH(HttpStatus.CONFLICT, "결제 금액이 일치하지 않습니다. 처음부터 다시 시도해 주세요."),
    PAYMENT_INSUFFICIENT_BALANCE(HttpStatus.CONFLICT, "계좌 잔액이 부족합니다."),
    PAYMENT_REQUEST_FAILED(HttpStatus.BAD_GATEWAY, "결제 처리 중 오류가 발생했습니다. 결제는 진행되지 않았습니다."),
    /** 성공 여부가 불확실하므로 중복 결제를 유도하지 않는 문구를 쓴다. */
    PAYMENT_TIMEOUT(HttpStatus.GATEWAY_TIMEOUT, "결제 결과 확인이 지연되고 있습니다. 주문 내역에서 상태를 확인해 주세요."),

    // ===================== §3.9 COIN — YoYo 발행·소각 =====================
    COIN_MINT_PENDING(HttpStatus.CONFLICT, "결제 예치 처리가 진행 중입니다. 잠시 후 다시 확인해 주세요."),
    COIN_MINT_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "결제 예치 처리에 실패했습니다. 결제 금액은 자동 환불됩니다."),
    COIN_BURN_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "처리가 지연되고 있습니다. 확인 후 순차적으로 처리됩니다."),
    COIN_ESCROW_INSUFFICIENT(HttpStatus.CONFLICT, "정산 가능한 예치 금액이 부족합니다. 관리자 확인이 필요합니다."),
    /** 발행량 대비 지갑+에스크로 합계 대사 실패(불변식 4). mint·release를 중단한다. */
    COIN_RESERVE_MISMATCH(HttpStatus.CONFLICT, "예치금 검증에 실패했습니다. 관리자 확인 후 처리가 재개됩니다."),

    // ===================== §3.10 CHAIN — 온체인 트랜잭션 공통 =====================
    CHAIN_TX_TIMEOUT(HttpStatus.GATEWAY_TIMEOUT, "블록체인 처리가 지연되고 있습니다. 잠시 후 상태를 다시 확인해 주세요."),
    /** 운영지갑 가스 부족. 알림 대상. 팀 지갑 가스 부족은 {@link #WALLET_GAS_INSUFFICIENT}. */
    CHAIN_GAS_INSUFFICIENT(HttpStatus.INTERNAL_SERVER_ERROR, "요청을 처리할 수 없습니다. 관리자에게 문의해 주세요."),
    /** 서버 내부에서 재시도하고 최종 실패 시에만 노출한다. */
    CHAIN_NONCE_CONFLICT(HttpStatus.INTERNAL_SERVER_ERROR, "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."),

    // ===================== §3.11 REFUND — 취소·환불 =====================
    REFUND_DEADLINE_PASSED(HttpStatus.CONFLICT, "취소 가능 기간이 지났습니다."),
    REFUND_ALREADY_REQUESTED(HttpStatus.CONFLICT, "이미 취소 요청이 접수된 티켓입니다."),
    REFUND_AFTER_SETTLEMENT_LOCK(HttpStatus.CONFLICT, "정산이 완료된 공연은 앱에서 취소할 수 없습니다. 고객센터로 문의해 주세요."),
    REFUND_TRANSFER_FAILED(HttpStatus.BAD_GATEWAY, "환불 처리가 지연되고 있습니다. 확인 후 순차적으로 처리됩니다."),

    // ===================== §3.12 TRANSFER — 티켓 양도(선물) =====================
    // ⚠️ v6에서 양도 기능이 설계에서 삭제되어(결정 v2 §14-34) 이 5개는 발생 경로가 0이다.
    //    규격 v3 §3.12에 아직 정의돼 있어 계약 보존을 위해 남겨 두지만, MVP 코드에서 던지지 않는다.
    //    양도를 되살리지 않는 한 이 상수를 참조하는 코드가 생기면 안 된다.
    TRANSFER_LINK_NOT_FOUND(HttpStatus.NOT_FOUND, "유효하지 않은 선물 링크입니다."),
    TRANSFER_LINK_EXPIRED(HttpStatus.GONE, "선물 링크가 만료되었습니다. 보낸 분에게 다시 요청해 주세요."),
    TRANSFER_LINK_ALREADY_USED(HttpStatus.CONFLICT, "이미 사용된 선물 링크입니다."),
    TRANSFER_SELF_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "자신에게는 선물할 수 없습니다."),
    TRANSFER_NOT_ALLOWED(HttpStatus.CONFLICT, "이 티켓은 더 이상 양도할 수 없습니다."),

    // ===================== §3.13 ENTRY — 입장·QR 검표 =====================
    /** 관객 화면에서 자동 재발급한다. */
    ENTRY_QR_EXPIRED(HttpStatus.UNAUTHORIZED, "QR이 만료되었습니다. 화면을 새로 고쳐 주세요."),
    /** 캡처·복제 QR로 간주하고 검표 이력에 기록한다. */
    ENTRY_QR_SIGNATURE_INVALID(HttpStatus.UNAUTHORIZED, "유효하지 않은 QR입니다."),
    /** 최초 입장 시각을 문구에 넣어야 하므로 호출부에서 msg를 덮는다. */
    ENTRY_ALREADY_ENTERED(HttpStatus.CONFLICT, "이미 입장 처리된 티켓입니다."),
    ENTRY_NOT_IN_TIME_WINDOW(HttpStatus.CONFLICT, "입장 가능 시간이 아닙니다."),
    ENTRY_SCANNER_NOT_AUTHORIZED(HttpStatus.FORBIDDEN, "이 공연의 검표 권한이 없습니다."),

    // ===================== §3.14 SETTLEMENT — 정산 분배 (핵심) =====================
    SETTLEMENT_NOT_LOCKED(HttpStatus.CONFLICT, "집계가 확정되지 않아 정산을 실행할 수 없습니다."),
    /** 마감 시각을 문구에 넣어야 하므로 호출부에서 msg를 덮는다. */
    SETTLEMENT_DISPUTE_PERIOD(HttpStatus.CONFLICT, "이의제기 기간이 끝난 뒤 정산할 수 있습니다."),
    SETTLEMENT_RELEASE_NOT_ACTIVE(HttpStatus.CONFLICT, "아직 정산이 실행되지 않았습니다."),
    SETTLEMENT_ALREADY_RELEASED(HttpStatus.CONFLICT, "이미 정산이 완료된 공연입니다."),
    /** 대사 실패이므로 자동 정산을 중단하고 관리자 확인으로 넘긴다. */
    SETTLEMENT_AGGREGATE_MISMATCH(HttpStatus.CONFLICT, "집계 검증에 실패했습니다. 관리자 확인 후 정산이 진행됩니다."),
    /** 공개 검증 페이지 API는 인증 없이 열려 있다. */
    SETTLEMENT_NOT_PARTICIPANT(HttpStatus.FORBIDDEN, "참여팀만 정산 내역을 조회할 수 있습니다."),

    // ===================== §3.15 REDEEM — 팀 환급 (YoYo → 원화) =====================
    // ⚠️ v5에서 법정화폐 입출구가 사라져(결정 v2 §5·§9) withdraw 도메인이 삭제됐고,
    //    정산은 release가 종단이다. 이 4개도 MVP에서는 발생 경로가 없다. 계약 보존용으로만 남긴다.
    REDEEM_NOTHING_TO_REDEEM(HttpStatus.CONFLICT, "환급할 정산 금액이 없습니다."),
    REDEEM_ACCOUNT_NOT_REGISTERED(HttpStatus.CONFLICT, "환급받을 계좌를 먼저 등록해 주세요."),
    REDEEM_ALREADY_REQUESTED(HttpStatus.CONFLICT, "이미 환급 요청이 접수되었습니다."),
    REDEEM_BANK_TRANSFER_FAILED(HttpStatus.BAD_GATEWAY, "환급 이체가 지연되고 있습니다. 확인 후 순차적으로 처리됩니다."),

    // ===================== §3.16 확장 기능 코드 (P1/P2 — MVP 제외) =====================
    // MVP 구현 대상이 아니다. 확장 기능을 켤 때만 쓴다.
    EXCHANGE_NOT_ALLOWED(HttpStatus.CONFLICT, "이 티켓은 교환할 수 없습니다."),
    EXCHANGE_OPTION_UNAVAILABLE(HttpStatus.CONFLICT, "선택한 회차의 잔여 좌석이 없습니다."),
    /** 최초 구매가를 문구에 넣어야 하므로 호출부에서 msg를 덮는다. */
    RESALE_PRICE_EXCEEDS_ORIGINAL(HttpStatus.BAD_REQUEST, "재판매 가격은 최초 구매가를 넘을 수 없습니다."),
    RESALE_NOT_ALLOWED(HttpStatus.FORBIDDEN, "이 공연은 재판매를 허용하지 않습니다."),
    NFT_MINT_PENDING(HttpStatus.CONFLICT, "NFT 티켓 발급이 진행 중입니다. 잠시 후 다시 확인해 주세요."),
    /** 일반 티켓은 이미 발급됐으므로 티켓 자체는 유효하다. NFT 발급만 재시도 대상이다. */
    NFT_MINT_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "NFT 발급에 실패했습니다. 티켓은 정상 사용할 수 있습니다."),
    NFT_TRANSFER_NOT_ALLOWED(HttpStatus.CONFLICT, "플랫폼을 통해서만 이전할 수 있습니다."),

    // ===================== §3.17 FILE — 이미지 업로드 (신설) =====================
    //
    // 규격 v3 §3에 FILE 계열이 없다 — 업로드 엔드포인트 자체가 v6에 없기 때문이다
    // (포스터 업로드 계획 v1이 1층으로 미뤘다). 코드가 먼저 나가고 API v7 §파일 절이 뒤따른다.
    //
    // 대체 코드가 전부 막다른 길이라 신설했다(RULE_SYNC_IN_PROGRESS 선례). 업로드 화면은 실패
    // 원인마다 사용자가 할 행동이 다르다 — 줄여서 다시(크기) · 다른 파일로(형식) · 더 큰 원본으로
    // (해상도)는 COMMON_VALIDATION_FAILED 하나로 묶으면 화면이 분기할 키가 없다. 바인딩 3종도
    // 각각 다시 올리기 · 자리 바꾸기 · 다른 파일 고르기로 갈린다.

    /**
     * 5MB 초과. Nginx 본문 상한 10MB 안쪽이라 이 판정은 앱까지 도달한다.
     * {@code MaxUploadSizeExceededException}(Spring 상한)도 같은 코드로 매핑한다.
     */
    FILE_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "이미지 용량은 5MB 이하여야 합니다."),
    /**
     * 파일 <b>시그니처</b>로 판정한 타입이 jpeg·png·webp가 아니거나, 시그니처는 맞는데 본문이
     * 깨져 크기를 읽을 수 없는 경우. 클라이언트가 보낸 {@code Content-Type}·확장자는 믿지 않는다.
     */
    FILE_TYPE_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "JPG · PNG · WEBP 이미지만 올릴 수 있습니다."),
    /** 용도별 최소 해상도 미만. 비율은 검사하지 않는다(프론트가 잘라서 올린다). */
    FILE_RESOLUTION_TOO_SMALL(HttpStatus.BAD_REQUEST, "이미지 해상도가 너무 작습니다. 더 큰 원본으로 다시 올려 주세요."),
    /**
     * 없는 {@code uploadId} <b>이거나 남의 {@code uploadId}</b>. 둘을 가르지 않는다 —
     * 403으로 답하면 "그 id는 존재한다"를 알려 주는 셈이라 남의 업로드를 훑을 수 있다.
     */
    FILE_NOT_FOUND(HttpStatus.NOT_FOUND, "업로드한 이미지를 찾을 수 없습니다. 다시 올려 주세요."),
    /** 포스터 자리에 티켓 아트워크를 넣는 등 용도가 다른 경우. */
    FILE_PURPOSE_MISMATCH(HttpStatus.BAD_REQUEST, "이미지 용도가 올바르지 않습니다. 다시 올려 주세요."),
    /** 이미 <b>다른 공연</b>에 매인 업로드. 같은 공연에 다시 매는 것(수정 재시도)은 허용한다. */
    FILE_ALREADY_BOUND(HttpStatus.CONFLICT, "이미 다른 공연에 사용된 이미지입니다. 새로 올려 주세요."),

    // ===================== §3.18 WEBAUTHN — 결제 전 본인 확인 (신설 2026-09-24) =====================

    /**
     * 기기 등록·본인 확인의 검증 실패 — 챌린지 없음·만료·재사용, origin·rpId 불일치, UV 없음,
     * 서명 불일치, signCount 역행, 등록되지 않았거나 남의 credential. 원인을 가르지 않는다(어느 단계에서
     * 막혔는지 알려 주지 않는다). 상세 원인은 로그에만 남긴다. 규격 §3.18.
     */
    WEBAUTHN_VERIFICATION_FAILED(HttpStatus.BAD_REQUEST, "본인 확인에 실패했습니다. 다시 시도해 주세요."),
    /**
     * 본인 확인 스위치({@code STEP_UP_ENABLED})가 켜져 있는데 보호 동작(결제 보고 · 규칙 동의 보고 ·
     * 보증금 보고 · 정산 조기 동의 · 정산금 지급)에 유효한 {@code X-Step-Up-Token}이 없다 — 헤더 없음·
     * 만료·이미 소비·다른 동작·다른 대상·다른 회원의 토큰. 규격 §3.18. 대체 코드가 막다른 길이라
     * 신설했다: {@code COMMON_FORBIDDEN}은 "권한 없음"이라 화면이 본인 확인 단계로 되돌아갈 근거가 못
     * 되고 같은 API의 다른 403과 섞인다. 스위치가 꺼져 있으면 발생 경로가 없다.
     *
     * <p>이름 — 처음(9/24 오전)엔 결제에만 걸어 {@code PAYMENT_STEP_UP_REQUIRED}였다. 공연자 동작 4개로
     * 넓히면서 배포 전에 개명했다(배포된 적이 없어 클라이언트 분기 계약을 깨지 않는다).
     */
    WEBAUTHN_STEP_UP_REQUIRED(HttpStatus.FORBIDDEN, "이 작업 전에 본인 확인이 필요합니다."),
    ;

    private final HttpStatus status;
    private final String defaultMsg;

    ErrorCode(HttpStatus status, String defaultMsg) {
        this.status = status;
        this.defaultMsg = defaultMsg;
    }

    /** 응답 래퍼의 {@code code} 값. 상수명과 항상 같다. */
    public String getCode() {
        return name();
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getDefaultMsg() {
        return defaultMsg;
    }

    /** 예외로 바로 감싼다. {@code throw ErrorCode.TICKET_SOLD_OUT.toException();} */
    public BusinessException toException() {
        return BusinessException.of(this);
    }

    /** 값이 들어간 문구로 기본 문구를 덮는다(금액·시각·수량). */
    public BusinessException toException(String msg) {
        return BusinessException.of(this, msg);
    }
}
