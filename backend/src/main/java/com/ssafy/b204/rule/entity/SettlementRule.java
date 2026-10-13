package com.ssafy.b204.rule.entity;

import com.ssafy.b204.common.entity.BaseTimeEntity;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.performance.entity.Performance;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 정산 규칙 — ERD v5 {@code settlement_rule}. 공연 1:1(UNIQUE).
 * PK는 v5에서 {@code rule_id} → {@code settlement_rule_id}로 개명됐다.
 *
 * <p><b>이 프로젝트의 핵심이다.</b> 판매 시작 전 참여팀 전원이 동의해 컨트랙트에 잠그면
 * 사후 변조가 불가능해진다 — 블록체인을 쓰는 유일한 이유가 여기 있다.
 *
 * <p>분배는 두 갈래이고 bp(basis point, 1bp = 0.01%) 합이 <b>10000</b>이어야 한다.
 *
 * <ul>
 *   <li>{@code fixed_ratio_bp} — 고정 분배. 참여팀이 {@code team_share_bp}로 나눈다.
 *   <li>{@code selection_ratio_bp} — 관객 선택 분배. 예매 시 고른 팀의 온체인 카운터로 나눈다.
 * </ul>
 *
 * 합이 10000이 아니면 {@code RULE_RATIO_SUM_INVALID}(400).
 *
 * <p>{@code rules_hash}는 잠글 규칙의 해시다. 동의 요청의 해시가 현재 값과 다르면
 * {@code RULE_HASH_MISMATCH}(409) — 규칙이 중간에 바뀐 상황이라 그대로 동의시키면
 * 팀이 보지 않은 규칙에 서명하게 된다.
 *
 * <p>{@code is_locked}가 {@code true}가 된 뒤의 수정은 {@code RULE_ALREADY_LOCKED}(409)이고
 * <b>컨트랙트에서도 revert된다</b> — 서버만 막는 것이 아니라는 점이 이 설계의 요지다.
 */
@Entity
@Table(name = "settlement_rule")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SettlementRule extends BaseTimeEntity {

    /** bp 합계 기준값. {@code fixed + selection == 10000}. */
    public static final int TOTAL_BP = 10_000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "settlement_rule_id")
    private Long settlementRuleId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "performance_id", nullable = false, unique = true)
    private Performance performance;

    @Column(name = "fixed_ratio_bp", nullable = false)
    private Integer fixedRatioBp;

    @Column(name = "selection_ratio_bp", nullable = false)
    private Integer selectionRatioBp;

    /** 규칙 해시(0x + 64 hex). 동의 대조의 기준이다. */
    @Column(name = "rules_hash", length = 66)
    private String rulesHash;

    @Column(name = "is_locked", nullable = false)
    private boolean locked;

    @Column(name = "lock_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String lockTxHash;

    @Column(name = "locked_at")
    private LocalDateTime lockedAt;

    @Builder
    private SettlementRule(Performance performance, Integer fixedRatioBp, Integer selectionRatioBp,
                           String rulesHash) {
        this.performance = performance;
        this.fixedRatioBp = fixedRatioBp;
        this.selectionRatioBp = selectionRatioBp;
        this.rulesHash = rulesHash;
        this.locked = false;
    }

    /** bp 합이 10000인지. 아니면 {@code RULE_RATIO_SUM_INVALID}. */
    public boolean isRatioSumValid() {
        return fixedRatioBp != null && selectionRatioBp != null
                && fixedRatioBp + selectionRatioBp == TOTAL_BP;
    }

    /** 잠금 전에만 수정할 수 있다 — API-rule-01. */
    public void update(int fixedRatioBp, int selectionRatioBp, String rulesHash) {
        this.fixedRatioBp = fixedRatioBp;
        this.selectionRatioBp = selectionRatioBp;
        this.rulesHash = rulesHash;
    }

    /** {@code startSale} 확정 — 이 시점 이후 규칙은 서버·컨트랙트 양쪽에서 변경 불가다. */
    public void lock(String lockTxHash) {
        this.locked = true;
        this.lockTxHash = lockTxHash;
        this.lockedAt = TimeSupport.nowStored();
    }
}
