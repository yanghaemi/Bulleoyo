package com.ssafy.b204.recommendation.dto;

import com.ssafy.b204.common.response.Money;
import java.time.OffsetDateTime;
import java.util.List;

/** recommendation 도메인 DTO — API v7 §14 (API-recommendation-01). */
public final class RecommendationDtos {

    private RecommendationDtos() {
    }

    /**
     * {@code GET /api/v1/recommendations/performances} 응답 본문.
     *
     * <p>{@code sessionId}는 요청 1건 = 세션 1개(UUID)다. 같은 값이
     * {@code recommendation_log.session_id}에도 들어가 세션 단위 NDCG@6 집계의 열쇠가 된다.
     *
     * <p>{@code rate}는 §0.5 금액 표기 축약형이다 — 환율은 루트에 하나, 항목에는
     * {@code minPriceAmount}만. API-performance-02 목록과 같은 형태이며, 추천 카드가 환산액
     * (₩25,000 ≈ $18.50)을 그리려고 같은 화면의 목록 응답에서 환율을 빌려 쓰지 않게 한다.
     * 유효 환율이 없거나 표시 통화가 KRW 면 목록과 똑같이 {@code null}이고, 전역
     * {@code non_null} 직렬화라 키가 빠진다.
     */
    public record RecommendationResponse(String basis, String sessionId, Money.Rate rate,
                                         List<RecommendationItem> items) {}

    /**
     * 항목 — API-performance-02 목록 항목과 <b>같은 필드</b>에 {@code matchedGenres}·
     * {@code reason} 2개를 더한 형태다(명세 §14).
     *
     * <p>중첩 객체로 감싸지 않고 평평하게 둔 것은 명세의 응답 예시가 평평하기 때문이다. 앞의
     * 10개 필드는 {@code PerformanceDtos.PerformanceListItem}이 계산한 값을 그대로 옮긴다 —
     * 최저가·매진 여부·팀명 계산을 두 번 구현하지 않는다.
     *
     * <p>{@code matchedGenres}는 선호 ∩ 공연 장르다. 폴백으로 채운 항목은 <b>빈 배열</b>이며,
     * 그 자리가 곧 "이 항목은 겹쳐서 올라온 게 아니다"라는 표시다(D-R06).
     *
     * <p>{@code reason}은 2차(LLM) 전까지 항상 {@code null}이다. 전역 {@code non_null}
     * 직렬화라(§0.1) 실제 응답에는 키 자체가 나가지 않는다.
     */
    public record RecommendationItem(
            Long performanceId,
            String title,
            String posterImageUrl,
            String ticketImageUrl,
            String venueName,
            OffsetDateTime startAt,
            String status,
            Long minPriceAmount,
            String currency,
            boolean soldOut,
            List<String> teamNames,
            List<String> matchedGenres,
            String reason
    ) {}
}
