package com.ssafy.b204.recommendation.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 추천 노출 로그 — ERD v6 {@code recommendation_log}. 서빙 기록이자 <b>CTR 랭커 학습 데이터</b>다.
 *
 * <p>피처 9개는 <b>서빙 시점 스냅샷</b>이다. 남은 일수·판매율처럼 나중에 되돌려 계산할 수 없는
 * 값이라 노출 시점에 박아야 학습 데이터가 된다. 컬럼 이름은 {@code ml/ctr/synth.py}의
 * {@code FEATURES}와 글자 단위로 같아야 하는 계약이다(설계 §4.3) — 이름을 바꾸면 학습 스크립트가
 * 조용히 다른 컬럼을 읽는다.
 *
 * <p>정답 라벨(구매 여부)은 여기 없다. 조회 시 {@code ticket_order}(PAID · {@code served_at} 후
 * 24시간 내 · 같은 회원·공연)와 조인해 만든다 — 별도 클릭 수집 API를 두지 않는 이유다(D-R07).
 *
 * <p>회원·공연을 {@code Long} 식별자로 든다. 이 행은 쓰기 전용이고 읽는 쪽은 학습 스크립트(SQL)라
 * 연관 탐색이 필요 없다. 기록이 <b>응답 경로 밖</b>에서 돌기 때문에 영속성 컨텍스트에 엔티티
 * 참조를 끌고 들어가지 않는 편이 안전하다.
 */
@Entity
@Table(name = "recommendation_log")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RecommendationLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "recommendation_log_id")
    private Long recommendationLogId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "performance_id", nullable = false)
    private Long performanceId;

    /** 추천 요청 1건 = 세션 1개(UUID). 세션 단위로 NDCG@6을 잰다. */
    @Column(name = "session_id", nullable = false, length = 36)
    private String sessionId;

    /** 카드 노출 순서 1~6. 랭커 학습에서는 피처가 아니라 라벨 쪽 맥락이다. */
    @Column(name = "position", nullable = false)
    private Integer position;

    @Enumerated(EnumType.STRING)
    @Column(name = "basis", nullable = false)
    private RecommendationBasis basis;

    @Column(name = "served_at", nullable = false)
    private LocalDateTime servedAt;

    @Column(name = "genre_overlap", nullable = false)
    private Integer genreOverlap;

    @Column(name = "pref_count", nullable = false)
    private Integer prefCount;

    @Column(name = "min_price", nullable = false)
    private Long minPrice;

    @Column(name = "days_until", nullable = false)
    private Integer daysUntil;

    /** 공연 요일. <b>0 = 월요일</b>(설계 §4.3). {@code DayOfWeek.getValue()}는 1=월이라 -1 한다. */
    @Column(name = "weekday", nullable = false)
    private Integer weekday;

    @Column(name = "n_teams", nullable = false)
    private Integer nTeams;

    @Column(name = "is_joint", nullable = false)
    private Boolean isJoint;

    @Column(name = "sold_ratio", nullable = false, precision = 4, scale = 3)
    private BigDecimal soldRatio;

    @Column(name = "past_orders", nullable = false)
    private Integer pastOrders;

    @Builder
    private RecommendationLog(Long memberId, Long performanceId, String sessionId, Integer position,
                              RecommendationBasis basis, LocalDateTime servedAt,
                              Integer genreOverlap, Integer prefCount, Long minPrice,
                              Integer daysUntil, Integer weekday, Integer nTeams, Boolean isJoint,
                              BigDecimal soldRatio, Integer pastOrders) {
        this.memberId = memberId;
        this.performanceId = performanceId;
        this.sessionId = sessionId;
        this.position = position;
        this.basis = basis;
        this.servedAt = servedAt;
        this.genreOverlap = genreOverlap;
        this.prefCount = prefCount;
        this.minPrice = minPrice;
        this.daysUntil = daysUntil;
        this.weekday = weekday;
        this.nTeams = nTeams;
        this.isJoint = isJoint;
        this.soldRatio = soldRatio;
        this.pastOrders = pastOrders;
    }
}
