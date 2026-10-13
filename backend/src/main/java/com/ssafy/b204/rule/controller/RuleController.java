package com.ssafy.b204.rule.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.rule.dto.RuleDtos.AgreePrepareRequest;
import com.ssafy.b204.rule.dto.RuleDtos.AgreePrepareResponse;
import com.ssafy.b204.rule.dto.RuleDtos.AgreeSignedTxRequest;
import com.ssafy.b204.rule.dto.RuleDtos.AgreeSignedTxResponse;
import com.ssafy.b204.rule.dto.RuleDtos.RuleStatusResponse;
import com.ssafy.b204.rule.dto.RuleDtos.SetRuleRequest;
import com.ssafy.b204.rule.dto.RuleDtos.SetRuleResponse;
import com.ssafy.b204.rule.dto.RuleDtos.StartSaleRequest;
import com.ssafy.b204.rule.dto.RuleDtos.StartSaleResponse;
import com.ssafy.b204.rule.service.RuleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * rule — 정산 규칙 (API v6 §5, API-rule-01~05). 접두 {@code RULE_*}.
 *
 * <p>경로가 {@code /performances/{performanceId}/...} 아래에 있지만 도메인은 {@code rule}이다 —
 * 규칙은 공연에 1:1로 매달리지만 동의·잠금이라는 독립된 생명주기를 갖는다.
 *
 * <p>명세의 절 순서가 01 → 02 → 03 → <b>05</b> → 04다(동의 보고가 판매 시작보다 앞). 실제 흐름이
 * "규칙 설정 → 현황 → 동의 준비 → 동의 보고 → 판매 시작"이기 때문이며, 선언 순서도 그에 맞췄다.
 */
@RestController
@RequestMapping("/api/v1/performances/{performanceId}")
@RequiredArgsConstructor
public class RuleController {

    private final RuleService ruleService;

    /** API-rule-01 · 권한 생성자. 선행 조건은 보증금 납부. */
    @PutMapping("/rules")
    public ApiResponse<SetRuleResponse> setRule(@AuthenticationPrincipal MemberPrincipal me,
                                                 @PathVariable Long performanceId,
                                                 @Valid @RequestBody SetRuleRequest request) {
        return ApiResponse.success(ruleService.setRule(me, performanceId, request),
                "정산 규칙이 저장되었습니다. 참여팀 동의를 받아 주세요.");
    }

    /**
     * API-rule-02 · 권한 PERFORMER(참여팀).
     *
     * <p>{@code teamId}는 한 회원이 이 공연의 팀을 둘 이상 이끌 때 {@code myAgreement}를 고정하는
     * 값이다. 생략하면 주최팀 우선 → {@code teamId} 오름차순의 첫 팀을 쓴다. 내 팀이 아니거나 이
     * 공연의 참여팀이 아니면 {@code COMMON_FORBIDDEN}(403).
     */
    @GetMapping("/rules")
    public ApiResponse<RuleStatusResponse> ruleStatus(@AuthenticationPrincipal MemberPrincipal me,
                                                       @PathVariable Long performanceId,
                                                       @RequestParam(required = false) Long teamId) {
        return ApiResponse.success(ruleService.ruleStatus(me, performanceId, teamId));
    }

    /** API-rule-03 · 권한 참여팀 리더. §0.4 {@code prepare} — 200. */
    @PostMapping("/rules/agreements/prepare")
    public ApiResponse<AgreePrepareResponse> agreePrepare(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @Valid @RequestBody AgreePrepareRequest request) {
        return ApiResponse.success(ruleService.agreePrepare(me, performanceId, request));
    }

    /** API-rule-05 · 권한 참여팀 리더. §0.4 {@code signed-tx} — 202 + 폴링. */
    @PostMapping("/rules/agreements/signed-tx")
    public ResponseEntity<ApiResponse<AgreeSignedTxResponse>> agreeSignedTx(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @Valid @RequestBody AgreeSignedTxRequest request,
            // [2026-09-24] 본인 확인 토큰(API v7 §7.W). 스위치가 꺼져 있으면 서비스가 읽지 않는다.
            @RequestHeader(value = "X-Step-Up-Token", required = false) String stepUpToken) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(
                        ruleService.agreeSignedTx(me, performanceId, request, stepUpToken),
                        "동의 트랜잭션을 확인하고 있습니다."));
    }

    /**
     * API-rule-04 · 권한 생성자. 202 + 폴링.
     *
     * <p>여기서 규칙이 컨트랙트에 잠긴다. 전원 동의 전이면 {@code RULE_NOT_AGREED_BY_ALL}(409).
     */
    @PostMapping("/sale/start")
    public ResponseEntity<ApiResponse<StartSaleResponse>> startSale(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @Valid @RequestBody StartSaleRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(ruleService.startSale(me, performanceId, request),
                        "판매 시작 트랜잭션을 전송했습니다. 확정되면 예매가 열립니다."));
    }
}
