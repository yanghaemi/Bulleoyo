package com.ssafy.b204.settlement.entity;

import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.team.entity.Team;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 팀별 분배 내역 — ERD v5 {@code settlement_share}. 정산·팀 조합당 1건(UNIQUE).
 * PK는 v5에서 {@code share_id} → {@code settlement_share_id}로 개명됐다.
 *
 * <p>분배액은 세 갈래의 합이다.
 *
 * <ul>
 *   <li>{@code equal_amount} — 고정 풀({@code fixed_ratio_bp})을 {@code team_share_bp}로 나눈 몫
 *   <li>{@code selection_amount} — 관객 선택 풀({@code selection_ratio_bp})을
 *       {@code choice_count} 비율로 나눈 몫
 *   <li>{@code dust_amount} — 정수 나눗셈에서 남는 1 YoYo 단위 잔여. 어딘가에 귀속시켜야
 *       Σ분배액 = 총매출이 성립한다. 버리면 에스크로에 먼지가 남아 대사가 영구히 어긋난다.
 * </ul>
 *
 * <p>{@code wallet_address}는 <b>수령 주소 스냅샷</b>이다. 컨트랙트에 잠긴 주소와 같아야 하고,
 * 리더 교체·지갑 재등록이 이미 확정된 분배를 흔들면 안 된다.
 *
 * <p>부모 없이 존재할 수 없는 구성요소라 V1 FK가 {@code ON DELETE CASCADE}인 두 곳 중 하나다.
 */
@Entity
@Table(name = "settlement_share",
        uniqueConstraints = @UniqueConstraint(name = "uk_settlement_team",
                columnNames = {"settlement_id", "team_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SettlementShare {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "settlement_share_id")
    private Long settlementShareId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "settlement_id", nullable = false)
    private Settlement settlement;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Column(name = "wallet_address", length = 42, columnDefinition = "CHAR(42)")
    private String walletAddress;

    @Column(name = "equal_amount", nullable = false)
    private Long equalAmount;

    @Column(name = "selection_amount", nullable = false)
    private Long selectionAmount;

    /** 정수 나눗셈 잔여 귀속액. Σ분배액 = 총매출을 성립시키기 위한 값이다. */
    @Column(name = "dust_amount", nullable = false)
    private Long dustAmount;

    @Column(name = "total_amount", nullable = false)
    private Long totalAmount;

    @Column(name = "choice_count", nullable = false)
    private Integer choiceCount;

    @Column(name = "released", nullable = false)
    private boolean released;

    @Column(name = "released_at")
    private LocalDateTime releasedAt;

    /**
     * 정산 조기 동의 시각 — {@code null}이면 미동의(API-settlement-08).
     *
     * <p>전원이 동의하면 48시간 이의제기 기간을 건너뛰고 release 가 열린다. 판정의 정의는
     * {@link com.ssafy.b204.settlement.service.SettlementGates#release}에만 있다.
     *
     * <p><b>철회 메서드를 두지 않는다.</b> 동의는 되돌릴 수 없다 — 되돌릴 수 있게 하면 전원 동의로
     * 자동 release 가 접수된 직후에 철회가 들어오는 구간이 생기고, 그때 이미 나간 tx 를 되돌릴
     * 방법이 없다. 생각이 바뀐 팀은 이의제기(API-settlement-04)로 release 를 막는다.
     */
    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Builder
    private SettlementShare(Team team, String walletAddress, Long equalAmount,
                            Long selectionAmount, Long dustAmount, Integer choiceCount) {
        this.team = team;
        this.walletAddress = walletAddress;
        this.equalAmount = equalAmount != null ? equalAmount : 0L;
        this.selectionAmount = selectionAmount != null ? selectionAmount : 0L;
        this.dustAmount = dustAmount != null ? dustAmount : 0L;
        this.choiceCount = choiceCount != null ? choiceCount : 0;
        // 합계는 받지 않고 계산한다 — 세 갈래와 어긋나면 대사가 깨진다.
        this.totalAmount = this.equalAmount + this.selectionAmount + this.dustAmount;
        this.released = false;
    }

    /** {@link Settlement#addShare} 에서만 호출한다(양방향 연결). */
    void assignSettlement(Settlement settlement) {
        this.settlement = settlement;
    }

    public void markReleased() {
        this.released = true;
        this.releasedAt = TimeSupport.nowStored();
    }

    /** 조기 동의 — API-settlement-08. 중복 호출 방지는 게이트가 한다(같은 규칙을 두 번 적지 않는다). */
    public void approve(LocalDateTime at) {
        this.approvedAt = at;
    }

    public boolean isApproved() {
        return approvedAt != null;
    }
}
