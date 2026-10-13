package com.ssafy.b204.chain.entity;

import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.DynamicUpdate;

/**
 * 온체인 트랜잭션 작업 — ERD v5 {@code chain_job}. <b>모든 온체인 작업의 단일 테이블</b>이다.
 *
 * <p>{@code coin_job}은 부활하지 않는다. 종류 구분은 {@link TxType} 14종이 한다. 지급 이력 전용
 * 테이블도 만들지 않는다 — {@code WHERE tx_type='MINT'}가 곧 지급 이력이다(결정 v2 §2.2).
 * 지갑 거래 이력({@code wallet_tx})도 이 테이블 조회로 만든다.
 *
 * <p><b>서명 주체가 둘이다.</b>
 *
 * <ul>
 *   <li>{@code OPERATOR} — 서버 키(OPERATOR·MINTER)가 서명·전송한다. §0.3의 202 + 폴링.
 *       지갑별 <b>단일 nonce 직렬 큐</b>로 처리한다 — 병렬로 보내면 nonce가 충돌한다.
 *       큐 직렬화 실패는 {@code CHAIN_NONCE_CONFLICT}. 최대 3회 자동 재시도(REL-09).
 *   <li>{@code USER} — 사용자 지갑이 발신자 서명을 하고 서버(fee payer)가 대납 서명해 전송한다.
 *       {@code fee_delegated}는 항상 {@code true}다(사용자 지갑의 KAIA 잔액은 0이고 화면에 가스
 *       개념을 노출하지 않는다). 서버가 발신자 서명을 다시 만들 수 없으므로 <b>자동 재시도 대상이
 *       아니고</b> receipt 재조회만 반복한다(최대 120초, 이후 {@code FAILED}). 단 <b>전송된</b>
 *       tx 는 노드에 살아 있는 동안 {@code SUBMITTED} 로 두고 계속 본다({@code ChainJobWorker}
 *       · S15P21B204-76).
 * </ul>
 *
 * <p>확정 판정은 <b>receipt의 이벤트 파싱</b>으로 한다. {@code status}만 보지 않는다 — revert되지
 * 않았을 뿐 우리가 기대한 이벤트가 아닌 tx도 성공으로 읽힌다.
 *
 * <p>{@code chain_job}이 {@code wallet}·{@code performance}·{@code ticket}·{@code team}을
 * 역참조하므로(V1 말미 ALTER TABLE 4건) 그 4개는 엔티티가 아니라 id 컬럼으로 둔다 —
 * 엔티티로 묶으면 패키지 순환이 된다.
 *
 * <p><b>{@code @DynamicUpdate} — 바뀐 컬럼만 쓴다.</b> 인스턴스가 둘이면 {@code claimed_by}·
 * {@code claimed_at} 은 다른 인스턴스가 조건부 UPDATE 로 쓴다({@code ChainJobRepository.claim}).
 * 전체 컬럼 UPDATE 로 상태를 전이하면 로드 시점의 옛 claim 값으로 그것을 덮는다(S15P21B204-119).
 */
@Entity
@DynamicUpdate
@Table(name = "chain_job")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChainJob {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "chain_job_id")
    private Long chainJobId;

    @Enumerated(EnumType.STRING)
    @Column(name = "tx_type", nullable = false)
    private TxType txType;

    @Enumerated(EnumType.STRING)
    @Column(name = "signer_type", nullable = false)
    private SignerType signerType;

    @Column(name = "fee_delegated", nullable = false)
    private boolean feeDelegated;

    /** 대납 서명한 운영지갑 주소. §0.7의 유일한 주소 노출 예외({@code signRequests[].feePayer}). */
    @Column(name = "fee_payer_address", length = 42, columnDefinition = "CHAR(42)")
    private String feePayerAddress;

    /** 프론트가 만들어 보고한 발신자 서명 RLP. {@code USER} job만 채워진다. */
    @Column(name = "sender_signed_rlp", columnDefinition = "MEDIUMTEXT")
    private String senderSignedRlp;

    @Enumerated(EnumType.STRING)
    @Column(name = "issuer_type", nullable = false)
    private IssuerType issuerType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requester_member_id")
    private Member requester;

    // ↓ 역참조 FK 4개. 엔티티 대신 id 로 둔다(패키지 순환 회피).
    @Column(name = "wallet_id")
    private Long walletId;

    @Column(name = "target_performance_id")
    private Long targetPerformanceId;

    @Column(name = "target_ticket_id")
    private Long targetTicketId;

    @Column(name = "target_team_id")
    private Long targetTeamId;

    @Column(name = "amount")
    private Long amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    /**
     * 이 job 을 집은 인스턴스 — 인스턴스가 둘 이상일 때 같은 job 을 두 번 집지 않게 한다
     * (S15P21B204-96). {@code null} 이면 아무도 안 집었다.
     *
     * <p><b>{@code status} 에 값을 더하지 않은 이유</b> — {@code status} 는 API-chain-01 폴링이
     * 그대로 보는 값이라, 거기에 {@code PROCESSING} 을 더하면 openapi·프론트 생성 타입·확정·실패
     * 분기까지 번진다. claim 은 <b>워커 내부 사정</b>이지 클라이언트가 볼 상태가 아니다.
     */
    @Column(name = "claimed_by", length = 64)
    private String claimedBy;

    /** claim 시각. 낡으면 다른 인스턴스가 다시 집는다 — 집어 놓고 죽은 job 이 굳지 않는다. */
    @Column(name = "claimed_at")
    private LocalDateTime claimedAt;

    @Column(name = "tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String txHash;

    @Column(name = "confirmations", nullable = false)
    private Integer confirmations;

    @Column(name = "retry_count", nullable = false)
    private Integer retryCount;

    /** 규격 §3의 code 문자열을 넣는다. 체인 revert 원문을 넣지 않는다(SEC-09). */
    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    /** 멱등키. {@code MINT} job은 {@code grantRef}가 이 값이다. */
    @Column(name = "idempotency_key", length = 255, unique = true)
    private String idempotencyKey;

    @CreationTimestamp
    @Column(name = "requested_at", nullable = false, updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    @Builder
    private ChainJob(TxType txType, SignerType signerType, boolean feeDelegated,
                     String feePayerAddress, String senderSignedRlp, IssuerType issuerType,
                     Member requester, Long walletId, Long targetPerformanceId,
                     Long targetTicketId, Long targetTeamId, Long amount, String idempotencyKey) {
        this.txType = txType;
        this.signerType = signerType != null ? signerType : SignerType.OPERATOR;
        // USER job 은 항상 대납이다(v5). 호출부가 false 를 줘도 정정한다.
        this.feeDelegated = this.signerType == SignerType.USER || feeDelegated;
        this.feePayerAddress = feePayerAddress;
        this.senderSignedRlp = senderSignedRlp;
        this.issuerType = issuerType != null ? issuerType : IssuerType.MOCK;
        this.requester = requester;
        this.walletId = walletId;
        this.targetPerformanceId = targetPerformanceId;
        this.targetTicketId = targetTicketId;
        this.targetTeamId = targetTeamId;
        this.amount = amount;
        this.idempotencyKey = idempotencyKey;
        this.status = Status.PENDING;
        this.confirmations = 0;
        this.retryCount = 0;
    }

    /** 발신자 서명 RLP를 받아 둔다({@code USER} job). */
    public void attachSenderSignedRlp(String senderSignedRlp, String feePayerAddress) {
        this.senderSignedRlp = senderSignedRlp;
        this.feePayerAddress = feePayerAddress;
    }

    public void markSubmitted(String txHash) {
        this.status = Status.SUBMITTED;
        this.txHash = txHash;
    }

    /** receipt 이벤트 파싱까지 끝난 뒤에만 호출한다. */
    public void markConfirmed(String txHash, int confirmations) {
        this.status = Status.CONFIRMED;
        this.txHash = txHash;
        this.confirmations = confirmations;
        this.confirmedAt = TimeSupport.nowStored();
    }

    /** @param failureReason 규격 §3의 code 문자열 */
    public void markFailed(String failureReason) {
        this.status = Status.FAILED;
        this.failureReason = failureReason;
    }

    public void increaseRetry() {
        this.retryCount += 1;
    }

    /**
     * 실패한 job 의 멱등키를 접미로 밀어 <b>정본 키를 비운다</b>. 재시도가 같은 키로 새 job 을
     * 만들 수 있게 하는 유일한 방법이다({@code idempotency_key}가 UNIQUE 다). 실패 이력은
     * 지우지 않고 남긴다 — "무슨 시도였나"가 끊기면 대사를 못 한다.
     *
     * <p><b>{@code MINT}에는 쓸 수 없다.</b> {@code grantRef = keccak256(멱등키)}라 키가 바뀌면
     * 같은 지급이 두 번 나갈 수 있다(컨트랙트의 {@code GrantRefUsed} 방어가 무력해진다).
     */
    public void retireIdempotencyKey() {
        if (txType == TxType.MINT) {
            throw new IllegalStateException("MINT 멱등키는 grantRef 재료라 바꿀 수 없다");
        }
        if (idempotencyKey != null && chainJobId != null) {
            this.idempotencyKey = idempotencyKey + "#failed:" + chainJobId;
        }
    }

    /** {@code USER} job은 서버가 발신자 서명을 다시 만들 수 없어 자동 재시도 대상이 아니다. */
    public boolean isAutoRetryable() {
        return signerType == SignerType.OPERATOR;
    }

    public boolean isTerminal() {
        return status == Status.CONFIRMED || status == Status.FAILED;
    }

    /**
     * 작업 유형 15종(결정 v2 §7 + S15P21B204-67·70). v4의 소각·금고 왕복 3종은 삭제됐고
     * {@code MINT}는 <b>시연용 지급</b>을 뜻한다. {@code DEPOSIT_FORFEIT}는 P1 예약값이다.
     *
     * <p><b>{@code CREATE_SHOW}·{@code START_SALE}은 v6에서 늘린 값이다.</b> 컨트랙트 stage가
     * {@code createShow → CREATED} 이후에만 {@code deposit}·{@code startSale}을 받으므로
     * {@code createShow}를 담을 값이 필요하고, 종전에는 {@code LOCK} 하나가 판매 시작
     * (API-rule-04)과 정산 잠금(API-settlement-03) 두 뜻을 겸해 <b>보낸 tx와 확정 시 기대하는
     * 이벤트가 어긋났다</b>. 이제 {@code LOCK}은 정산 잠금 하나만 뜻한다.
     *
     * <p><b>{@code UPDATE_RULES}는 S15P21B204-70에서 늘린 값이다.</b> {@code createShow} 확정
     * 뒤 규칙을 다시 저장하면 DB 해시만 바뀌어 온체인과 갈리고, 그러면 {@code agreeToRules}가
     * {@code RulesHashMismatch}로 revert 한다. 온체인도 같이 바꾸는 것이 유일한 복구 수단이다.
     */
    public enum TxType {
        MINT, APPROVE, PURCHASE, REFUND,
        DEPOSIT, DEPOSIT_RETURN, DEPOSIT_FORFEIT,
        AGREE, LOCK, AGGREGATE, RELEASE, HALT,
        CREATE_SHOW, START_SALE, UPDATE_RULES
    }

    /** {@code USER} = 사용자 지갑이 서명하고 서버가 대납 서명·전송. */
    public enum SignerType {
        OPERATOR, USER
    }

    /** 지급 어댑터 감사 컬럼. MVP는 항상 {@code MOCK}. {@code EXTERNAL}은 P2 예약값. */
    public enum IssuerType {
        MOCK, EXTERNAL
    }

    /** §0.3의 {@code jobId} 폴링 응답 {@code status}와 같은 값이다. */
    public enum Status {
        PENDING, SUBMITTED, CONFIRMED, FAILED
    }
}
