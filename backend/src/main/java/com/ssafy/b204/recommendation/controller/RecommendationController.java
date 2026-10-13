package com.ssafy.b204.recommendation.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.recommendation.dto.RecommendationDtos.RecommendationResponse;
import com.ssafy.b204.recommendation.service.RecommendationService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * recommendation — 맞춤 추천 (API v7 §14).
 *
 * <p>Query 파라미터가 없다. 회원마다 결과가 다르고 최대 6건이라 필터·페이지네이션을 둘 이유가
 * 없다(명세 §14 요구사항). GUEST 는 {@code SecurityConfig}의 {@code anyRequest().authenticated()}가
 * 401 로 막는다.
 */
@RestController
@RequestMapping("/api/v1/recommendations")
@RequiredArgsConstructor
public class RecommendationController {

    private final RecommendationService recommendationService;

    /** API-recommendation-01 · 권한 회원. */
    @GetMapping("/performances")
    public ApiResponse<RecommendationResponse> recommendedPerformances(
            @AuthenticationPrincipal MemberPrincipal me) {
        return ApiResponse.success(recommendationService.recommend(me));
    }
}
