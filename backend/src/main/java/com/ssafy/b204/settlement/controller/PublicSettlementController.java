package com.ssafy.b204.settlement.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.PublicSettlementResponse;
import com.ssafy.b204.settlement.service.SettlementService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 정산 공개 조회 — API v6 §11의 API-settlement-07. 권한 <b>GUEST</b>.
 *
 * <p>경로 접두가 {@code /public/}이라 별도 컨트롤러로 뒀다 — SecurityConfig의 공개 경로 목록과
 * 1:1로 맞춰 읽히게 하려는 배치다.
 *
 * <p><b>인증 없이 열려 있다.</b> 정산 결과를 참여팀이 플랫폼 화면을 거치지 않고 검증할 수 있어야
 * 한다는 것이 이 프로젝트의 목표이기 때문이다. 대신 {@code shareToken}을 아는 사람만 볼 수 있고,
 * 응답에 {@code teamId}·{@code walletAddress}를 담지 않는다.
 */
@RestController
@RequestMapping("/api/v1/public")
@RequiredArgsConstructor
public class PublicSettlementController {

    private final SettlementService settlementService;

    /** API-settlement-07 · 권한 <b>GUEST</b>. 토큰이 없거나 폐기됐으면 404. */
    @GetMapping("/settlement/{shareToken}")
    public ApiResponse<PublicSettlementResponse> publicSettlement(
            @PathVariable String shareToken) {
        return ApiResponse.success(settlementService.publicSettlement(shareToken));
    }
}
