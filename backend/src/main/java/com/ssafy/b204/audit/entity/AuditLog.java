package com.ssafy.b204.audit.entity;

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

/**
 * 감사 로그 — ERD v5 {@code audit_log}. <b>append-only</b>다. 수정·삭제 메서드를 두지 않는다.
 *
 * <p>{@code actor_role}만 ERD에서 {@code VARCHAR}로 남아 있다 — 요구사항 명세서 §4의 actor 코드가
 * 확정되면 ENUM으로 전환한다(ERD v5 헤더 ★). 그래서 이 필드는 {@code String}이다.
 *
 * <p>{@code request_summary}에 <b>비밀 값을 넣지 않는다</b> — 개인키·서명 원문·토큰은 요약에서
 * 제외한다. 스택트레이스·SQL도 넣지 않는다(SEC-09).
 */
@Entity
@Table(name = "audit_log")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "audit_log_id")
    private Long auditLogId;

    /** 시스템 스케줄러가 주체면 {@code null}(V1 FK는 SET NULL). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_member_id")
    private Member actor;

    /** 04 §4 actor 코드 확정 전까지 VARCHAR로 둔다. */
    @Column(name = "actor_role", length = 20)
    private String actorRole;

    /** IPv6까지 담기게 45자. */
    @Column(name = "request_ip", length = 45)
    private String requestIp;

    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false)
    private ActionType actionType;

    @Column(name = "resource_type", nullable = false, length = 50)
    private String resourceType;

    @Column(name = "resource_id")
    private Long resourceId;

    @Column(name = "request_summary", columnDefinition = "TEXT")
    private String requestSummary;

    @Enumerated(EnumType.STRING)
    @Column(name = "result", nullable = false)
    private Result result;

    @Column(name = "tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String txHash;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private AuditLog(Member actor, String actorRole, String requestIp, ActionType actionType,
                     String resourceType, Long resourceId, String requestSummary, Result result,
                     String txHash) {
        this.actor = actor;
        this.actorRole = actorRole;
        this.requestIp = requestIp;
        this.actionType = actionType;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.requestSummary = requestSummary;
        this.result = result;
        this.txHash = txHash;
    }

    /** 행위 유형 8종. */
    public enum ActionType {
        ADMIN_ACTION, OPERATOR_SIGN, MINT, RELEASE, GRANT, RATE_CHANGE, WALLET_LINK, STATUS_CHANGE
    }

    public enum Result {
        SUCCESS, FAILURE
    }
}
