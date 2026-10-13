package com.ssafy.b204.settlement.entity;

import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.team.entity.Team;
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

/**
 * 이의제기 — ERD v5 {@code dispute}. 참여팀 리더가 이의제기 기간(48시간) 중에 낸다
 * (API-settlement-04).
 *
 * <p>처리는 관리자가 한다(API-admin-06·09). <b>{@code RESOLVED} 후 재집계 경로는 없다</b>
 * (v6 §11 정정) — 되돌릴 수 있는 정지와 종단 중단을 구분하기로 했고, 복구 불가 판정이면
 * {@code settlement.status}가 {@code HALTED}로 간다.
 */
@Entity
@Table(name = "dispute")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Dispute {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "dispute_id")
    private Long disputeId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "settlement_id", nullable = false)
    private Settlement settlement;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Column(name = "reason", nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    @Column(name = "admin_comment", columnDefinition = "TEXT")
    private String adminComment;

    /** 처리한 관리자. 미처리면 {@code null}(V1 FK는 SET NULL). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "handler_member_id")
    private Member handler;

    @CreationTimestamp
    @Column(name = "submitted_at", nullable = false, updatable = false)
    private LocalDateTime submittedAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Builder
    private Dispute(Settlement settlement, Team team, String reason) {
        this.settlement = settlement;
        this.team = team;
        this.reason = reason;
        this.status = Status.OPEN;
    }

    /** API-admin-06 이의제기 처리. */
    public void resolve(Member handler, String adminComment) {
        this.status = Status.RESOLVED;
        this.handler = handler;
        this.adminComment = adminComment;
        this.resolvedAt = TimeSupport.nowStored();
    }

    public void reject(Member handler, String adminComment) {
        this.status = Status.REJECTED;
        this.handler = handler;
        this.adminComment = adminComment;
        this.resolvedAt = TimeSupport.nowStored();
    }

    public boolean isOpen() {
        return status == Status.OPEN;
    }

    public enum Status {
        OPEN, RESOLVED, REJECTED
    }
}
