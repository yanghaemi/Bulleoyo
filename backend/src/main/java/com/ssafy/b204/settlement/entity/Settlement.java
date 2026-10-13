package com.ssafy.b204.settlement.entity;

import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.performance.entity.Performance;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.hibernate.annotations.DynamicUpdate;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 정산 — ERD v5 {@code settlement}. 공연 1:1(UNIQUE).
 *
 * <p>흐름 — {@code NONE} → {@code AGGREGATED}(집계 확정, API-settlement-02) →
 * {@code LOCKED}(정산 잠금 = 이의제기 시작, -03) → {@code DISPUTE_OPEN}(이의 접수, -04) →
 * {@code RELEASED}(release 실행, -05).
 *
 * <p><b>{@code RELEASED}가 종단이다</b>(v5 변경). 팀 수령 이후 단계가 없다 — 법정화폐 출구가
 * 사라져 {@code withdraw} 도메인이 삭제됐고, {@code withdrawnAmount}·수령 계좌·2차 서명이 없다.
 *
 * <p>{@code HALTED}도 종단이다. <b>되돌릴 수 있는 정지와 구분해야 한다</b>(v6 §11 도입부 정정) —
 * {@code HALTED}는 공연 취소 또는 관리자의 복구 불가 판정이며, 이의 {@code RESOLVED} 후
 * 재집계로 돌아오는 경로가 없다.
 *
 * <p>{@code counter_match}는 <b>온체인 선택 카운터 합과 서버 집계의 대조 결과</b>다.
 * 어긋나면 {@code SETTLEMENT_AGGREGATE_MISMATCH}로 자동 정산을 멈추고 관리자 확인으로 넘긴다 —
 * 오라클 문제(입력 데이터의 진실성)에 대한 이 프로젝트의 대응 지점이다.
 */
/*
 * 전 컬럼 UPDATE 를 막는다 — 잠금 없이 읽은 인스턴스가 커밋하면 남이 커밋한 컬럼까지 자기
 * 스냅숏 값으로 덮는다(MR !137 자동 리뷰). 확정 경로는 잠금으로 펜싱하지만 공유 링크 발급
 * (SettlementService.issueShareToken)처럼 한 컬럼만 쓰는 자리가 남아 있어, 바뀐 필드만 쓰게 한다.
 */
@Entity
@Table(name = "settlement")
@DynamicUpdate
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Settlement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "settlement_id")
    private Long settlementId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "performance_id", nullable = false, unique = true)
    private Performance performance;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    @Column(name = "total_revenue")
    private Long totalRevenue;

    /** 취소·환불을 제외한 유효 티켓 수. */
    @Column(name = "valid_ticket_count")
    private Integer validTicketCount;

    @Column(name = "total_choice_count")
    private Integer totalChoiceCount;

    /** 온체인·서버 대조 결과. {@code false}면 자동 정산을 중단한다. */
    @Column(name = "counter_match")
    private Boolean counterMatch;

    @Column(name = "aggregated_at")
    private LocalDateTime aggregatedAt;

    @Column(name = "locked_at")
    private LocalDateTime lockedAt;

    /** 이의제기 마감(잠금 + 48시간). 이전에 release를 시도하면 {@code SETTLEMENT_DISPUTE_PERIOD}. */
    @Column(name = "dispute_deadline_at")
    private LocalDateTime disputeDeadlineAt;

    @Column(name = "released_at")
    private LocalDateTime releasedAt;

    @Column(name = "aggregate_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String aggregateTxHash;

    @Column(name = "lock_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String lockTxHash;

    @Column(name = "release_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String releaseTxHash;

    /** 공개 검증 링크 토큰(API-settlement-06·07). 인증 없이 열린다. */
    @Column(name = "share_token", length = 512)
    private String shareToken;

    @OneToMany(mappedBy = "settlement", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SettlementShare> shares = new ArrayList<>();

    @Builder
    private Settlement(Performance performance) {
        this.performance = performance;
        this.status = Status.NONE;
    }

    public List<SettlementShare> getShares() {
        return Collections.unmodifiableList(shares);
    }

    public void addShare(SettlementShare share) {
        shares.add(share);
        share.assignSettlement(this);
    }

    /** 집계 확정 — API-settlement-02. */
    public void markAggregated(long totalRevenue, int validTicketCount, int totalChoiceCount,
                               boolean counterMatch, String aggregateTxHash) {
        this.totalRevenue = totalRevenue;
        this.validTicketCount = validTicketCount;
        this.totalChoiceCount = totalChoiceCount;
        this.counterMatch = counterMatch;
        this.aggregateTxHash = aggregateTxHash;
        this.aggregatedAt = TimeSupport.nowStored();
        this.status = Status.AGGREGATED;
    }

    /** 정산 잠금 = 이의제기 기간 시작 — API-settlement-03. */
    public void markLocked(String lockTxHash, LocalDateTime disputeDeadlineAt) {
        this.status = Status.LOCKED;
        this.lockTxHash = lockTxHash;
        this.lockedAt = TimeSupport.nowStored();
        this.disputeDeadlineAt = disputeDeadlineAt;
    }

    public void markDisputeOpen() {
        this.status = Status.DISPUTE_OPEN;
    }

    /** release = 팀 수령 완료. 종단이다. */
    public void markReleased(String releaseTxHash) {
        this.status = Status.RELEASED;
        this.releaseTxHash = releaseTxHash;
        this.releasedAt = TimeSupport.nowStored();
    }

    /** 종단 중단. 되돌아오는 경로가 없다. */
    public void markHalted() {
        this.status = Status.HALTED;
    }

    public void issueShareToken(String shareToken) {
        this.shareToken = shareToken;
    }

    /**
     * 이의제기 기간 중인가. release 게이트와 이의 접수가 함께 본다.
     *
     * <p>예전에 여기 {@code isReleasable(now)}가 함께 있었는데 <b>호출자가 하나도 없었고</b>
     * 같은 규칙이 서비스에 다시 적혀 있었다. 같은 규칙의 두 번째 정의는 언젠가 갈라지므로
     * 지웠다 — release 가능 조건의 유일한 정의는
     * {@link com.ssafy.b204.settlement.service.SettlementGates#release}다(이의 목록·발행량 대사·
     * 수령 지갑까지 봐야 해서 엔티티 혼자 판정할 수 없는 규칙이기도 하다).
     *
     * <h2>마감이 {@code null}이면 "아직 기간 중"이다 (fail-closed · D-26)</h2>
     *
     * <p>예전에는 {@code disputeDeadlineAt != null && …}이었다. 그러면 마감이 비어 있을 때 이 메서드가
     * {@code false}를 돌려주고, release 게이트는 그것을 <b>"기간이 끝났다"</b>로 읽는다 — 48시간
     * 대기가 통째로 사라진 채 정산이 실행된다. 되돌릴 수 없는 tx 앞에서 열려 있는 쪽으로 실패하는
     * 판정이라 뒤집었다.
     *
     * <p>{@code markLocked}는 상태와 마감을 항상 함께 세우므로 정상 경로에서는 {@code null}이 나오지
     * 않는다. 문제는 <b>다른 사람의 코드</b>다 — 관리자 이의 처리(API-admin-06)가 상태만 손으로 옮기고
     * 마감을 쓰지 않으면 그 자리에서 열린다. "언젠가 누가 마감을 안 쓴다"를 전제로 두는 편이 싸다.
     *
     * <p>{@code NONE}·{@code AGGREGATED}에서 마감이 비어 있는 것은 정상이고, 이 뒤집기가 그 상태를
     * 막지는 않는다 — 두 게이트 모두 <b>상태 검사를 먼저</b> 하고 거기서 이미 거른다. 그 순서가
     * 이 판정의 전제이므로 게이트에서 순서를 바꾸지 않는다.
     */
    public boolean isInDisputePeriod(LocalDateTime now) {
        return disputeDeadlineAt == null || disputeDeadlineAt.isAfter(now);
    }

    /**
     * 아직 실행할 release가 남아 있는가 — <b>{@code releaseHeld}의 유일한 정의</b>다.
     *
     * <p>{@code releaseHeld = dispute.isOpen() && settlement.isReleasePossible()}로 쓴다
     * (API-settlement-01 {@code disputes[]} · API-admin-09 목록·요약이 같은 식을 본다).
     * 종단 상태({@code RELEASED}·{@code HALTED})에서는 더 보류할 release가 없으므로 열린 이의가
     * 남아 있어도 {@code false}다 — {@code HALTED}를 빼면 중단된 정산의 이의가 영원히
     * "정산을 막고 있다"로 표시된다.
     *
     * <p>여기 두는 이유는 관리자 화면(admin)과 팀 화면(settlement)이 <b>같은 판정</b>을 봐야
     * 하기 때문이다. 두 벌이 되면 "관리자 화면에서는 처리 가능인데 release는 막히는" 상태가 난다.
     * 실행 여부 자체의 정본은 여전히
     * {@link com.ssafy.b204.settlement.service.SettlementGates#release}다.
     */
    public boolean isReleasePossible() {
        return status != Status.RELEASED && status != Status.HALTED;
    }

    /** {@code HALTED} = 공연 취소 또는 관리자 복구 불가 판정(종단). */
    public enum Status {
        NONE, AGGREGATED, LOCKED, DISPUTE_OPEN, RELEASED, HALTED
    }
}
