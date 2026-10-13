package com.ssafy.b204.settlement.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.settlement.dto.SettlementDtos.AggregateResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.ApprovalResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.DisputeRequest;
import com.ssafy.b204.settlement.dto.SettlementDtos.DisputeResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.LockResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.ReleaseRequest;
import com.ssafy.b204.settlement.dto.SettlementDtos.ReleaseResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.SettlementDetailResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.ShareLinkResponse;
import com.ssafy.b204.settlement.service.SettlementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * settlement — 정산 (API v6 §11, API-settlement-01~06). 접두 {@code SETTLEMENT_*}.
 *
 * <p>흐름 — 집계 확정(-02) → 잠금·이의제기 시작(-03) → [이의제기(-04)] → release(-05).
 * <b>{@code RELEASED}가 종단</b>이고 그 뒤 단계가 없다.
 *
 * <p>공개 조회(API-settlement-07)는 경로가 {@code /public/settlement/{shareToken}}이라
 * {@link PublicSettlementController}에 따로 있다.
 */
@RestController
@RequestMapping("/api/v1/performances/{performanceId}/settlement")
@RequiredArgsConstructor
public class SettlementController {

    private final SettlementService settlementService;

    /** API-settlement-01 · 권한 PERFORMER(참여팀). */
    @GetMapping
    public ApiResponse<SettlementDetailResponse> detail(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ApiResponse.success(settlementService.detail(me, performanceId));
    }

    /** API-settlement-02 · 권한 생성자·ADMIN. 202 + 폴링. 온체인 카운터와 대조한다. */
    @PostMapping("/aggregate")
    public ResponseEntity<ApiResponse<AggregateResponse>> aggregate(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(settlementService.aggregate(me, performanceId)));
    }

    /** API-settlement-03 · 권한 생성자·ADMIN. 202 + 폴링. 이의제기 48시간이 시작된다. */
    @PostMapping("/lock")
    public ResponseEntity<ApiResponse<LockResponse>> lock(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(settlementService.lock(me, performanceId)));
    }

    /** API-settlement-04 · 권한 참여팀 리더. */
    @PostMapping("/disputes")
    public ResponseEntity<ApiResponse<DisputeResponse>> dispute(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @Valid @RequestBody DisputeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(settlementService.dispute(me, performanceId, request)));
    }

    /**
     * API-settlement-08 정산 조기 동의 · 권한 참여팀 리더. 201 동기 응답(온체인 작업이 아니다).
     *
     * <p>참여팀 전원(주최팀 포함)이 동의하면 48시간 이의제기 기간을 건너뛰고 release 가 열린다.
     * 동의는 되돌릴 수 없고, ADMIN 도 남의 팀을 대신 동의할 수 없다.
     *
     * <p><b>API v6 §11 에 아직 없는 엔드포인트다</b> — 번호를 API-settlement-08 로 잡아 두고
     * 문서 개정에서 같은 번호로 합류시킨다.
     */
    @PostMapping("/approvals")
    public ResponseEntity<ApiResponse<ApprovalResponse>> approve(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            // [2026-09-24] 본인 확인 토큰(API v7 §7.W). 스위치가 꺼져 있으면 서비스가 읽지 않는다.
            @RequestHeader(value = "X-Step-Up-Token", required = false) String stepUpToken) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(settlementService.approve(me, performanceId, stepUpToken)));
    }

    /** API-settlement-05 · 권한 생성자·ADMIN(자동 스케줄 병행). 202 + 폴링. release = 수령 완료. */
    @PostMapping("/release")
    public ResponseEntity<ApiResponse<ReleaseResponse>> release(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @RequestBody(required = false) ReleaseRequest request,
            @RequestHeader(value = "X-Step-Up-Token", required = false) String stepUpToken) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(
                        settlementService.release(me, performanceId, request, stepUpToken)));
    }

    /** API-settlement-06 · 권한 생성자(리더). */
    @PostMapping("/share-link")
    public ResponseEntity<ApiResponse<ShareLinkResponse>> shareLink(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(settlementService.shareLink(me, performanceId)));
    }
}
