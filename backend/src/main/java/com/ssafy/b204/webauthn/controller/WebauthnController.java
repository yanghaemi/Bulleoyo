package com.ssafy.b204.webauthn.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.AuthenticationOptionsRequest;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.AuthenticationOptionsResponse;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.AuthenticationRequest;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.RegistrationOptionsResponse;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.RegistrationRequest;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.RegistrationResult;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.StepUpTokenResponse;
import com.ssafy.b204.webauthn.service.WebauthnService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * webauthn — 결제 전 패스키 본인 확인 (API v7 §7.W, API-webauthn-01~04). 접두 {@code WEBAUTHN_*}.
 *
 * <p>네 엔드포인트는 스위치({@code STEP_UP_ENABLED})와 무관하게 열려 있다 — 보호 동작의 가드만
 * 스위치를 본다. 켜기 전에 기기를 미리 등록해 둘 수 있게 하려는 것이다. 권한은 로그인 회원(MEMBER).
 *
 * <p>options 두 개가 GET 이 아니라 POST 인 이유 — 호출마다 서버에 챌린지를 새로 쓰는 부수효과가 있다.
 */
@RestController
@RequestMapping("/api/v1/webauthn")
@RequiredArgsConstructor
public class WebauthnController {

    private final WebauthnService webauthnService;

    /** API-webauthn-01 기기 등록 옵션. 본문 없음. */
    @PostMapping("/registration/options")
    public ApiResponse<RegistrationOptionsResponse> registrationOptions(
            @AuthenticationPrincipal MemberPrincipal me) {
        return ApiResponse.success(webauthnService.registrationOptions(me));
    }

    /** API-webauthn-02 기기 등록 — 201. */
    @PostMapping("/registration")
    public ResponseEntity<ApiResponse<RegistrationResult>> register(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody RegistrationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(webauthnService.register(me, request)));
    }

    /**
     * API-webauthn-03 본인 확인 옵션. 본문 {@code {action, targetId}} — 받은 토큰은 그 동작·대상에만 쓸 수
     * 있다. 등록 기기가 없으면 {@code registered:false}(에러 아님).
     */
    @PostMapping("/authentication/options")
    public ApiResponse<AuthenticationOptionsResponse> authenticationOptions(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody AuthenticationOptionsRequest request) {
        return ApiResponse.success(webauthnService.authenticationOptions(me, request));
    }

    /** API-webauthn-04 본인 확인 → step-up 토큰. */
    @PostMapping("/authentication")
    public ApiResponse<StepUpTokenResponse> authenticate(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody AuthenticationRequest request) {
        return ApiResponse.success(webauthnService.authenticate(me, request));
    }
}
