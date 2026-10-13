package com.ssafy.b204.verify.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.verify.dto.VerifyDtos.VerificationResponse;
import com.ssafy.b204.verify.service.VerifyService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * verify — 공개 검증 (API v6 §12, API-verify-01).
 *
 * <p>이름은 "공개 검증"이지만 <b>권한은 PERFORMER(참여팀, 로그인 필수)</b>다 — 인증 없이 열린
 * 것은 API-settlement-07(공유 링크)과 API-coin-01(발행량 공시)이고, 이쪽은 검증용 원자료
 * 전체(주소·해시·tx·규칙 원문)를 담기 때문에 참여팀으로 제한한다.
 *
 * <p>블록체인 용어를 노출해도 되는 예외 화면이다(V-01 · §0.6).
 */
@RestController
@RequestMapping("/api/v1/performances/{performanceId}")
@RequiredArgsConstructor
public class VerifyController {

    private final VerifyService verifyService;

    /** API-verify-01 · 권한 PERFORMER(참여팀, 로그인 필수). */
    @GetMapping("/verification")
    public ApiResponse<VerificationResponse> verification(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ApiResponse.success(verifyService.verification(me, performanceId));
    }
}
