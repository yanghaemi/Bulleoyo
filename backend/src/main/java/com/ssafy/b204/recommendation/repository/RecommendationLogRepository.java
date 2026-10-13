package com.ssafy.b204.recommendation.repository;

import com.ssafy.b204.recommendation.entity.RecommendationLog;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 추천 노출 로그. <b>쓰기 전용</b>이다 — 읽는 쪽은 학습 스크립트의 SQL이라
 * ({@code recommendation_log ⋈ ticket_order}) 조회 메서드를 두지 않는다.
 */
public interface RecommendationLogRepository extends JpaRepository<RecommendationLog, Long> {
}
