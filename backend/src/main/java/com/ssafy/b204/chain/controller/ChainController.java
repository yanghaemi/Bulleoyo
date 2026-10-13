package com.ssafy.b204.chain.controller;

import com.ssafy.b204.chain.dto.ChainDtos.JobStatusResponse;
import com.ssafy.b204.chain.service.ChainJobService;
import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * chain — 비동기 tx 폴링 (API v6 §8 끝, API-chain-01). 에러 코드 접두 {@code CHAIN_*}.
 *
 * <p>결정 문서 v2 §5의 도메인 목록에 없고 엔드포인트가 하나뿐이라 명세에서는 §8 {@code coin}
 * 절 끝에 "공통 폴링" 항목으로 붙어 있다. 코드에서는 {@code chain_job} 엔티티·워커와 같은
 * 패키지에 두는 편이 자연스러워 별도 컨트롤러로 분리했다 — 경로는 명세 그대로다.
 *
 * <p><b>202를 내려주는 모든 API가 이 경로 하나로 폴링된다</b> — 운영자 tx(§0.3)와 사용자 서명 tx
 * 보고(§0.4) 양쪽.
 */
@RestController
@RequestMapping("/api/v1/chain")
@RequiredArgsConstructor
public class ChainController {

    private final ChainJobService chainJobService;

    /**
     * API-chain-01 · 권한 요청자(작업을 만든 회원) 또는 ADMIN.
     *
     * <p>남의 작업을 들여다볼 수 없어야 하므로 권한 판정은 서비스가 한다 —
     * {@code chain_job.requester_member_id}와 대조하고 아니면 {@code COMMON_FORBIDDEN}(403).
     */
    @GetMapping("/jobs/{jobId}")
    public ApiResponse<JobStatusResponse> jobStatus(@AuthenticationPrincipal MemberPrincipal me,
                                                     @PathVariable String jobId) {
        return ApiResponse.success(chainJobService.jobStatus(me, jobId));
    }
}
