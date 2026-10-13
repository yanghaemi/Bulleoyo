package com.ssafy.b204.rule.entity;

import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.entity.Performance;
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
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 팀별 규칙 동의 — ERD v5 {@code rule_agreement}. 공연·팀 조합당 1건(UNIQUE).
 * PK는 v5에서 {@code agreement_id} → {@code rule_agreement_id}로 개명됐다.
 *
 * <p><b>동의는 팀 리더 지갑의 서명 tx다</b>(결정 v2 §2.5). 서버는 사용자 키가 없으므로 tx를 대신
 * 만들 수 없고 §0.4의 3단계를 탄다 — {@code prepare}(API-rule-03) → 프론트에서 발신자 서명 →
 * {@code signed-tx} 보고(API-rule-05) → 서버(fee payer)가 대납 서명·전송 → receipt 검증.
 *
 * <p>참여팀 전원이 {@code AGREED}가 되기 전에 판매 시작을 시도하면
 * {@code RULE_NOT_AGREED_BY_ALL}(409)이다. 이 규칙이 "사전 합의로 잠근다"는 설계의 실행 지점이다.
 *
 * <p>{@code agreed_rules_hash}는 <b>그 팀이 실제로 동의한 규칙의 해시</b>다. 규칙이 중간에 바뀌면
 * 이 값과 {@code settlement_rule.rules_hash}가 어긋나므로 어느 팀이 옛 규칙에 동의했는지 알 수 있다.
 */
@Entity
@Table(name = "rule_agreement",
        uniqueConstraints = @UniqueConstraint(name = "uk_perf_team_agree",
                columnNames = {"performance_id", "team_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RuleAgreement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "rule_agreement_id")
    private Long ruleAgreementId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "performance_id", nullable = false)
    private Performance performance;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    @Column(name = "agreed_rules_hash", length = 66)
    private String agreedRulesHash;

    /** 동의 tx의 {@code chain_job} id. 순환 참조를 피해 id만 둔다. */
    @Column(name = "chain_job_id")
    private Long chainJobId;

    @Column(name = "agree_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String agreeTxHash;

    @Column(name = "agreed_at")
    private LocalDateTime agreedAt;

    /** 동의를 요청한 회원(팀 리더). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_member_id", nullable = false)
    private Member requester;

    @Builder
    private RuleAgreement(Performance performance, Team team, Member requester) {
        this.performance = performance;
        this.team = team;
        this.requester = requester;
        this.status = Status.PENDING;
    }

    /** {@code prepare} 응답을 내려준 뒤 — 서명 대기. */
    public void markSigning(Long chainJobId, String agreedRulesHash) {
        this.status = Status.SIGNING;
        this.chainJobId = chainJobId;
        this.agreedRulesHash = agreedRulesHash;
    }

    /** receipt 검증까지 끝난 뒤에만 호출한다. status만 보고 확정하지 않는다. */
    public void markAgreed(String agreeTxHash) {
        this.status = Status.AGREED;
        this.agreeTxHash = agreeTxHash;
        this.agreedAt = TimeSupport.nowStored();
    }

    /**
     * 규칙·참여팀 구성이 바뀌면 동의를 되돌린다(API-rule-01 · API-performance-07).
     * 진행 중이던 {@code SIGNING}도 함께 되돌린다 — 팀이 보지 않은 규칙으로 잠기면 안 된다.
     */
    public void reset() {
        this.status = Status.PENDING;
        this.agreedRulesHash = null;
        this.chainJobId = null;
        this.agreeTxHash = null;
        this.agreedAt = null;
    }

    /**
     * <b>그 job 이 닫혔을 때만</b> 되돌린다 — 체인 job 실패를 따라가는 자리들이 함께 쓴다
     * ({@code ChainJobStateWriter} 의 전송 실패 · {@code ChainJobConfirmationService} 의 확정 실패 ·
     * {@code RuleService.failSigningsWithClosedJobs} 의 스윕. 장부 D-81).
     *
     * <p>판정을 엔티티에 두는 이유는 <b>세 자리가 어긋나지 않게</b> 하기 위해서다. 조건이 둘 다
     * 필요하다.
     *
     * <ul>
     *   <li>{@code SIGNING} 일 것 — {@code AGREED} 는 receipt 로 확정된 동의다. 실패한 job 이
     *       그것을 지우면 잠긴 합의가 조용히 풀린다.
     *   <li>{@code chainJobId} 가 <b>이</b> job 일 것 — 규칙이 바뀌어 {@link #reset()} 된 뒤 새 job 으로
     *       다시 서명 중인 동의를 옛 job 의 뒤늦은 실패가 지우면 안 된다.
     * </ul>
     *
     * @return 되돌렸으면 {@code true}
     */
    public boolean resetIfSigningFor(Long chainJobId) {
        if (this.status != Status.SIGNING || !Objects.equals(this.chainJobId, chainJobId)) {
            return false;
        }
        reset();
        return true;
    }

    public boolean isAgreed() {
        return status == Status.AGREED;
    }

    public enum Status {
        PENDING, SIGNING, AGREED
    }
}
