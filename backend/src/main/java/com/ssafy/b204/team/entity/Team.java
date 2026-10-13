package com.ssafy.b204.team.entity;

import com.ssafy.b204.common.entity.BaseTimeEntity;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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

/**
 * 공연팀 — ERD v5 {@code team}.
 *
 * <p><b>팀 지갑 주소 컬럼이 없다.</b> 팀 지갑 = {@code leader_member_id}의 {@code wallet}으로
 * 파생한다. 팀에 별도 주소를 두면 리더 지갑과 어긋날 수 있고, 정산 수령 주소가 둘이 되어 어느 쪽으로
 * 보낼지 판단할 근거가 없어진다. 수령 시점의 주소는 {@code performance_participant.wallet_address}와
 * {@code settlement_share.wallet_address}에 <b>스냅샷</b>으로 남긴다.
 *
 * <p>v5에서 금전 수단 필드(정산 계좌 등)가 전부 삭제됐다 — 법정화폐 입출구가 없는 세계다.
 */
@Entity
@Table(name = "team")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Team extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "name", nullable = false, length = 100, unique = true)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * 대표 장르(단일·필수). v6부터 자유 문자열이 아니라 코드 10종이다(D-R02).
     *
     * <p>컬럼은 여전히 VARCHAR 이고 허용값은 앱이 지킨다(D-R01 — ENUM 값 추가마다 ALTER +
     * 배포를 맞추는 비용을 피한다). 공연 장르는 이 값들의 합집합으로 파생한다.
     */
    @Convert(converter = GenreConverter.class)
    @Column(name = "genre", nullable = false, length = 50)
    private Genre genre;

    /** 팀 리더. 이 회원의 지갑이 곧 팀 지갑이다(동의 서명·정산 수령 주소). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "leader_member_id", nullable = false)
    private Member leader;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    /** 소프트 삭제. 정산 이력이 팀을 참조하므로 물리 삭제하지 않는다(V1 FK는 RESTRICT). */
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Builder
    private Team(String name, String description, Genre genre, Member leader, Status status) {
        this.name = name;
        this.description = description;
        // V13 이 genre 에 NOT NULL 을 걸었다. 장르를 명시하지 않고 만든 팀(주로 테스트 픽스처)이
        // 저장 시점에 DB 제약으로 죽지 않도록 ETC 로 채운다 — API 경로는 이미 필수 검증을 지난다.
        this.genre = genre != null ? genre : Genre.ETC;
        this.leader = leader;
        this.status = status != null ? status : Status.ACTIVE;
    }

    /** API-team-04 팀 수정. */
    public void update(String name, String description, Genre genre) {
        if (name != null) this.name = name;
        if (description != null) this.description = description;
        if (genre != null) this.genre = genre;
    }

    public void disband() {
        this.status = Status.DISBANDED;
        this.deletedAt = TimeSupport.nowStored();
    }

    public boolean isLedBy(Long memberId) {
        return leader != null && leader.getMemberId().equals(memberId);
    }

    public enum Status {
        ACTIVE, DISBANDED
    }
}
