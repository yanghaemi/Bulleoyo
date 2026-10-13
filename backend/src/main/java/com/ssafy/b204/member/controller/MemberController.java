package com.ssafy.b204.member.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.dto.MemberDtos.EmailLoginRequest;
import com.ssafy.b204.member.dto.MemberDtos.EmailLoginResponse;
import com.ssafy.b204.member.dto.MemberDtos.EmailSignupRequest;
import com.ssafy.b204.member.dto.MemberDtos.EmailSignupResponse;
import com.ssafy.b204.member.dto.MemberDtos.LogoutRequest;
import com.ssafy.b204.member.dto.MemberDtos.LogoutResponse;
import com.ssafy.b204.member.dto.MemberDtos.MyProfileResponse;
import com.ssafy.b204.member.dto.MemberDtos.TokenRefreshRequest;
import com.ssafy.b204.member.dto.MemberDtos.TokenRefreshResponse;
import com.ssafy.b204.member.dto.MemberDtos.UpdateProfileRequest;
import com.ssafy.b204.member.dto.MemberDtos.UpdateProfileResponse;
import com.ssafy.b204.member.dto.MemberDtos.Web3AuthLoginRequest;
import com.ssafy.b204.member.dto.MemberDtos.Web3AuthLoginResponse;
import com.ssafy.b204.member.service.MemberService;
import com.ssafy.b204.common.support.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * member — 회원·인증 (API v6 §1). 에러 코드 접두 {@code AUTH_*}.
 *
 * <p>세션 발급 경로는 둘뿐이다 — Web3Auth idToken 검증(API-member-01)과 자체 이메일
 * 로그인(API-member-02, P1). <b>Web3Auth idToken 자체를 {@code Authorization} 헤더로 쓰지 않는다.</b>
 *
 * <p>{@code /auth/**}는 인증 없이 열려 있고(SecurityConfig), IP당 60회/분 제한 대상이다(SEC-10).
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class MemberController {

    private final MemberService memberService;
    private final RateLimiter rateLimiter;

    /**
     * API-member-01 · 권한 GUEST. 최초 로그인 = 가입.
     *
     * <p><b>IP당 60회/분</b>(§0.9 · SEC-10). 인증 전이라 셀 수 있는 주체가 IP뿐이다.
     * {@code server.forward-headers-strategy: framework}가 {@code X-Forwarded-For}를
     * {@code getRemoteAddr()}에 반영하므로 nginx 뒤에서도 실제 클라이언트 IP다.
     */
    @PostMapping("/auth/web3auth")
    public ApiResponse<Web3AuthLoginResponse> web3authLogin(
            @Valid @RequestBody Web3AuthLoginRequest request, HttpServletRequest http) {
        rateLimiter.check(RateLimiter.Policy.LOGIN_IP, http.getRemoteAddr());
        return ApiResponse.success(memberService.web3authLogin(request), "Signed in.");
    }

    /** API-member-02 · 권한 GUEST · <b>P1</b>. 로그인이라 member-01과 같은 한도다(§0.9). */
    @PostMapping("/auth/login")
    public ApiResponse<EmailLoginResponse> emailLogin(
            @Valid @RequestBody EmailLoginRequest request, HttpServletRequest http) {
        rateLimiter.check(RateLimiter.Policy.LOGIN_IP, http.getRemoteAddr());
        return ApiResponse.success(memberService.emailLogin(request));
    }

    /** API-member-08 · 권한 GUEST · <b>P1</b>. */
    @PostMapping("/auth/signup")
    public ResponseEntity<ApiResponse<EmailSignupResponse>> emailSignup(
            @Valid @RequestBody EmailSignupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(memberService.emailSignup(request)));
    }

    /**
     * API-member-03 · 권한 회원(refresh token).
     *
     * <p>access token이 만료된 상태로 호출되므로 {@code Authorization} 헤더를 요구하지 않는다 —
     * 인증은 본문의 refresh token으로 한다. 클라이언트는 {@code AUTH_TOKEN_EXPIRED}에서만
     * 이 경로를 탄다.
     */
    @PostMapping("/auth/refresh")
    public ApiResponse<TokenRefreshResponse> refresh(
            @Valid @RequestBody TokenRefreshRequest request) {
        return ApiResponse.success(memberService.refresh(request));
    }

    /** API-member-04 · 권한 회원. {@code allDevices}면 그 회원의 jti 집합을 통째로 폐기한다. */
    @PostMapping("/auth/logout")
    public ApiResponse<LogoutResponse> logout(@AuthenticationPrincipal MemberPrincipal me,
                                              @RequestBody(required = false) LogoutRequest request) {
        return ApiResponse.success(memberService.logout(me, request), "로그아웃되었습니다.");
    }

    /** API-member-05 · 권한 회원. */
    @GetMapping("/members/me")
    public ApiResponse<MyProfileResponse> myProfile(@AuthenticationPrincipal MemberPrincipal me) {
        return ApiResponse.success(memberService.myProfile(me));
    }

    /** API-member-06 · 권한 회원. 온 필드만 바꾼다. */
    @PatchMapping("/members/me")
    public ApiResponse<UpdateProfileResponse> updateProfile(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody UpdateProfileRequest request) {
        return ApiResponse.success(memberService.updateProfile(me, request), "설정이 저장되었습니다.");
    }
}
