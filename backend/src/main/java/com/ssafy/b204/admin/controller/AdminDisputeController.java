package com.ssafy.b204.admin.controller;

import com.ssafy.b204.admin.dto.AdminDtos.DisputeListResponse;
import com.ssafy.b204.admin.dto.AdminDtos.ResolveDisputeRequest;
import com.ssafy.b204.admin.dto.AdminDtos.ResolveDisputeResponse;
import com.ssafy.b204.admin.service.AdminDisputeService;
import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * admin — 이의제기 처리 (API v6 §13, API-admin-06·09). 접두 {@code COMMON_*}.
 *
 * <p>{@code /api/v1/admin/**}는 SecurityConfig에서 {@code hasRole("ADMIN")}으로 막혀 있고,
 * 여기서 {@code @PreAuthorize}로 한 번 더 명시한다 — 경로 규칙이 바뀌어도 메서드 단위 보호가
 * 남아 있게 하려는 이중 방어다.
 *
 * <p>관리자 행위는 전부 {@code ADMIN_ACTION} 감사 로그 대상이다.
 */
@RestController
@RequestMapping("/api/v1/admin/disputes")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminDisputeController {

    private final AdminDisputeService adminDisputeService;

    /**
     * API-admin-09 · 권한 ADMIN.
     *
     * <p>{@code data}는 {@code summary}·{@code items}·{@code pageInfo} 3키다. 기본 정렬은
     * 미처리 우선·오래된 순 — release 보류를 풀어야 하는 건이 위로 온다.
     */
    @GetMapping
    public ApiResponse<DisputeListResponse> disputes(
            @AuthenticationPrincipal MemberPrincipal me,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long performanceId,
            Pageable pageable) {
        return ApiResponse.success(
                adminDisputeService.disputes(me, status, performanceId, pageable));
    }

    /**
     * API-admin-06 · 권한 ADMIN. {@code RESOLVED} 후 재집계 경로는 없다.
     *
     * <p>온체인 tx를 만들지 않는다 — 이의 상태만 바꾼다. {@code HALTED} 전이는
     * API-performance-12(공연 취소)의 몫이라 여기에 {@code haltSettlement} 같은 플래그가 없다.
     */
    @PatchMapping("/{disputeId}")
    public ApiResponse<ResolveDisputeResponse> resolveDispute(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long disputeId,
            @Valid @RequestBody ResolveDisputeRequest request) {
        return ApiResponse.success(adminDisputeService.resolveDispute(me, disputeId, request),
                "이의제기를 처리했습니다.");
    }
}
