package com.ssafy.b204.coin.entity;

import com.ssafy.b204.member.entity.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * 표시 환율 — ERD v5 {@code exchange_rate}.
 * PK는 v5에서 {@code rate_id} → {@code exchange_rate_id}로 개명됐다.
 *
 * <p><b>⚠️ 화면 환산 전용이다.</b> ERD의 테이블 주석이 그대로 못박고 있다 —
 * "정산·분배·컨트랙트·지급 금액 계산에는 사용 금지". API v6 §0.5(P-17)도 같다.
 *
 * <p>이 값은 응답의 {@code display} 객체에만 실린다. 금액 원본은 언제나 YoYo 정수이고,
 * 서버는 요청 본문의 {@code display*} 필드를 전부 무시한다. 환율로 계산한 값이 정산에 섞이면
 * 환율이 바뀔 때마다 이미 확정된 분배액이 달라지고, 컨트랙트의 결정론적 재현성이 깨진다.
 *
 * <p>{@code rate}는 {@code 1 pair-quote = rate KRW}다(예: {@code USD_KRW = 1350.0}).
 * 환율 레코드가 없으면 {@code display}를 내리지 않는다 — <b>미등록은 오류가 아니다</b>.
 */
@Entity
@Table(name = "exchange_rate")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExchangeRate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "exchange_rate_id")
    private Long exchangeRateId;

    /** 통화쌍(예: {@code USD_KRW}). */
    @Column(name = "pair", nullable = false, length = 10)
    private String pair;

    @Column(name = "rate", nullable = false, precision = 18, scale = 6)
    private BigDecimal rate;

    /** 적용 시작 시각. 응답 {@code display.asOf}가 이 값이다. */
    @Column(name = "effective_from", nullable = false)
    private LocalDateTime effectiveFrom;

    /** 등록 관리자 — API-coin-03. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "creator_member_id", nullable = false)
    private Member creator;

    @Column(name = "source", nullable = false, length = 100)
    private String source;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private ExchangeRate(String pair, BigDecimal rate, LocalDateTime effectiveFrom, Member creator,
                         String source) {
        this.pair = pair;
        this.rate = rate;
        this.effectiveFrom = effectiveFrom;
        this.creator = creator;
        this.source = source != null ? source : "MANUAL";
    }
}
