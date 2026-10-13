package com.ssafy.b204.recommendation.entity;

/**
 * 추천 근거 — ERD v6 {@code recommendation_log.basis} · API-recommendation-01 {@code data.basis}.
 *
 * <p>폴백을 {@code GENRE}로 위장하지 않는다(D-R06). 전환율을 basis 별로 재는 것이 이 로그의
 * 존재 이유라, 폴백을 섞어 기록하면 지표가 통째로 왜곡된다.
 */
public enum RecommendationBasis {
    /** 팀 장르 매칭(1차). */
    GENRE,
    /** LLM 태그 장르 덕에 겹친 항목이 있음(2차, 미구현). */
    TAGGED,
    /** CTR 랭커가 재정렬함(3차, 미구현). */
    RANKED,
    /** 겹침이 없어 "곧 시작하는 ON_SALE" 순으로 내려감. */
    FALLBACK
}
