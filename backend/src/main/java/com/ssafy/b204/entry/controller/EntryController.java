package com.ssafy.b204.entry.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.entry.dto.EntryDtos.EntryStatusResponse;
import com.ssafy.b204.entry.dto.EntryDtos.VerifyEntryRequest;
import com.ssafy.b204.entry.dto.EntryDtos.VerifyEntryResponse;
import com.ssafy.b204.entry.service.EntryService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * entry — 입장·QR 검표 (API v6 §10, API-entry-01·02). 접두 {@code ENTRY_*}.
 *
 * <p><b>인증이 둘 중 하나면 된다</b>(§0.1) — {@code X-Entry-Token} 헤더(또는 {@code entryToken}
 * 쿼리)를 가진 검표 담당자, 또는 로그인한 참여팀 회원. SecurityConfig에서 이 경로를 permitAll로
 * 열어두고 <b>서비스가 판정</b>한다. 둘 다 아니면
 * {@code ENTRY_SCANNER_NOT_AUTHORIZED}(403).
 *
 * <p>성공 {@code msg}는 {@code "입장 완료"}(명세 200 예시)이고 중복은
 * {@code ENTRY_ALREADY_ENTERED} + <b>최초 입장 시각이 담긴 문구</b>다. 검표 담당자가 색·소리로
 * 1초 안에 판정을 읽어야 하므로 응답 필드를 늘리지 않는다(PERF-03).
 *
 * <p>{@code X-Entry-Token}은 헤더가 쿼리보다 <b>우선</b>한다(명세 Path·Query 표).
 * 클라이언트 IP는 한도(SEC-10 60회/분) 판정에만 쓴다 —
 * {@code server.forward-headers-strategy: framework}가 {@code X-Forwarded-For}를
 * {@code getRemoteAddr()}에 반영한다.
 *
 * <p>웹 전용 결정에 따라 스캐너는 {@code getUserMedia} + 브라우저 QR 디코딩이다(컨벤션 §1) —
 * 서버는 디코딩된 {@code qrToken} 문자열만 받는다.
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class EntryController {

    private final EntryService entryService;

    /**
     * API-entry-01 · 권한 검표 링크 토큰 보유자 또는 참여팀 회원.
     *
     * <p>QR 검증·입장 처리가 <b>한 번에</b> 일어난다. 조회 후 처리로 나누면 그 사이에 같은 QR로
     * 두 번 들어올 수 있다. 중복 차단은 Redis {@code entry:{ticketId}} SETNX가 한다.
     *
     * <p>IP당 60회/분 제한 대상이다(SEC-10).
     */
    @PostMapping("/entries/verify")
    public ApiResponse<VerifyEntryResponse> verify(
            @AuthenticationPrincipal MemberPrincipal me,
            @RequestHeader(value = "X-Entry-Token", required = false) String entryTokenHeader,
            @RequestParam(value = "entryToken", required = false) String entryTokenQuery,
            @Valid @RequestBody VerifyEntryRequest request,
            HttpServletRequest http) {
        String entryToken = entryTokenHeader != null ? entryTokenHeader : entryTokenQuery;
        return ApiResponse.success(
                entryService.verify(me, entryToken, http.getRemoteAddr(), request),
                "입장 완료");
    }

    /** API-entry-02 · 권한 검표 링크 토큰 보유자 또는 PERFORMER(참여팀). */
    @GetMapping("/performances/{performanceId}/entries")
    public ApiResponse<EntryStatusResponse> entryStatus(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @RequestHeader(value = "X-Entry-Token", required = false) String entryTokenHeader,
            @RequestParam(value = "entryToken", required = false) String entryTokenQuery,
            @RequestParam(required = false) String result,
            Pageable pageable,
            HttpServletRequest http) {
        String entryToken = entryTokenHeader != null ? entryTokenHeader : entryTokenQuery;
        return ApiResponse.success(entryService.entryStatus(me, performanceId, entryToken,
                http.getRemoteAddr(), result, pageable));
    }
}
