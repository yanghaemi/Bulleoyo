package com.ssafy.b204.performance.entity;

import com.ssafy.b204.common.support.TimeSupport;
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
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * 공연 참여팀 — ERD v5 {@code performance_participant}.
 * PK는 v5에서 {@code participant_id} → {@code performance_participant_id}로 개명됐다.
 *
 * <p>{@code wallet_address}는 <b>리더 지갑 주소 스냅샷</b>이다. 초대 수락 시점의 주소를 굳혀
 * 두는 이유는 리더가 바뀌거나 지갑을 다시 등록해도 이미 잠긴 정산 규칙의 수령 주소가 흔들리면
 * 안 되기 때문이다 — 컨트랙트에 잠긴 주소와 DB가 어긋나면 분배가 실패한다.
 *
 * <p>{@code team_share_bp}는 고정 풀 내 팀 비율(basis point, 1bp = 0.01%)이다. 정산 규칙의
 * {@code fixed_ratio_bp} 안에서 팀끼리 나누는 몫이며, 합이 10000이어야 한다.
 */
@Entity
@Table(name = "performance_participant",
        uniqueConstraints = @UniqueConstraint(name = "uk_perf_team",
                columnNames = {"performance_id", "team_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PerformanceParticipant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "performance_participant_id")
    private Long performanceParticipantId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "performance_id", nullable = false)
    private Performance performance;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    @CreationTimestamp
    @Column(name = "registered_at", nullable = false, updatable = false)
    private LocalDateTime registeredAt;

    /**
     * 참여 수락 시각(V9). <b>표시용</b>이며 수락 여부 판정은 하지 않는다 —
     * {@link #participationStatus()}는 그대로 {@code wallet_address} 유무로 파생한다. 두 값이
     * 갈렸을 때 어느 쪽이 맞는지 답할 근거가 없으므로 진실은 하나로 둔다.
     */
    @Column(name = "accepted_at")
    private LocalDateTime acceptedAt;

    /** 컨트랙트가 팀을 가리키는 인덱스. {@code startSale} 잠금 시 확정된다. */
    @Column(name = "on_chain_index")
    private Integer onChainIndex;

    /** 고정 풀 내 팀 비율(bp). 참여팀 전체 합 = 10000. */
    @Column(name = "team_share_bp", nullable = false)
    private Integer teamShareBp;

    /** 수락 시점 리더 지갑 주소 스냅샷. */
    @Column(name = "wallet_address", length = 42, columnDefinition = "CHAR(42)")
    private String walletAddress;

    @Builder
    private PerformanceParticipant(Performance performance, Team team, Integer teamShareBp,
                                   String walletAddress) {
        this.performance = performance;
        this.team = team;
        this.teamShareBp = teamShareBp;
        this.walletAddress = walletAddress;
        // 생성팀 행은 주소를 들고 태어난다(= 이미 수락 상태). 그때 accepted_at 도 함께 채운다 —
        // "주소가 있으면 수락했다"는 파생과 표시용 시각이 갈리지 않게.
        this.acceptedAt = walletAddress == null ? null : TimeSupport.nowStored();
        this.status = Status.REGISTERED;
    }

    /**
     * 초대 수락 — 그 시점 리더 지갑 주소를 굳힌다.
     *
     * <p><b>수락 여부를 {@code wallet_address}의 유무로 표현한다.</b> ERD v5의
     * {@code status} ENUM이 {@code ('REGISTERED','REMOVED')} 2값이라 명세의
     * {@code INVITED}/{@code ACCEPTED}를 담을 자리가 없다(be_*_endpoints.md §명세 확인 필요).
     * 주소는 수락 전에 채울 방법이 없고(수락 시점에 리더 지갑 {@code LINKED}를 확인한다)
     * 수락 후에는 반드시 있어야 하므로 이 파생이 성립한다.
     */
    public void accept(String leaderWalletAddress) {
        this.walletAddress = leaderWalletAddress;
        this.status = Status.REGISTERED;
        this.acceptedAt = TimeSupport.nowStored();
    }

    /** 명세의 {@code participationStatus} — ERD 2값 ENUM에서 파생한다. */
    public String participationStatus() {
        if (status == Status.REMOVED) {
            return "REMOVED";
        }
        return walletAddress == null ? "INVITED" : "ACCEPTED";
    }

    public boolean isAccepted() {
        return status == Status.REGISTERED && walletAddress != null;
    }

    /** 정산 규칙 설정(API-rule-01)이 고정 풀 내 팀 비율을 채운다. */
    public void changeShareBp(int teamShareBp) {
        this.teamShareBp = teamShareBp;
    }

    /**
     * {@code startSale} 직전 리더 지갑 주소를 다시 굳힌다(미결 안건 20 — 수령 주소 스냅샷).
     *
     * <p>{@code accepted_at}은 건드리지 않는다 — 재스냅샷은 수락이 아니다.
     */
    public void snapshotWallet(String leaderWalletAddress) {
        this.walletAddress = leaderWalletAddress;
    }

    /** 잠금 전에만 제외할 수 있다 — API-performance-09. */
    public void remove() {
        this.status = Status.REMOVED;
    }

    public void assignOnChainIndex(int index) {
        this.onChainIndex = index;
    }

    public enum Status {
        REGISTERED, REMOVED
    }
}
