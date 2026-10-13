package com.ssafy.b204.admin.controller;

import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinRequest;
import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinResponse;
import com.ssafy.b204.coin.dto.CoinDtos.GrantHistoryResponse;
import com.ssafy.b204.coin.dto.CoinDtos.RegisterRatesRequest;
import com.ssafy.b204.coin.dto.CoinDtos.RegisterRatesResponse;
import com.ssafy.b204.coin.service.CoinService;
import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 관리자 코인 — API v6 §8의 API-coin-03·07·08. 경로가 {@code /admin/coin/**}이다.
 *
 * <p>도메인은 {@code coin}이라 서비스는 {@link CoinService}를 그대로 쓰고, 컨트롤러만 경로에
 * 맞춰 여기 둔다 — SecurityConfig의 {@code /api/v1/admin/**} 규칙과 파일 위치를 일치시켜
 * "관리자 전용 엔드포인트가 어디 있나"를 한 곳에서 볼 수 있게 하려는 배치다.
 *
 * <p>화면은 {@code M-03 표시 환율·코인 지급}이다.
 */
@RestController
@RequestMapping("/api/v1/admin/coin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminCoinController {

    private final CoinService coinService;

    /**
     * API-coin-03 · 권한 ADMIN.
     *
     * <p>⚠️ 등록한 환율은 <b>표시에만</b> 쓰인다. 정산·분배·티켓 가격·지급 금액에 반영되지
     * 않는다(P-17).
     */
    @PutMapping("/rates")
    public ApiResponse<RegisterRatesResponse> registerRates(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody RegisterRatesRequest request) {
        return ApiResponse.success(coinService.registerRates(me, request));
    }

    /**
     * API-coin-07 · 권한 ADMIN. 202 + 폴링.
     *
     * <p>{@code PUT}인데 생성이다 — 명세가 {@code PUT}으로 고정했다(멱등키 {@code grantRef}로
     * 멱등성을 보장하므로 {@code PUT}이 어색하지 않다). 1회 최대 1,000,000 YoYo,
     * 관리자당 30회/분.
     */
    @PutMapping("/grants")
    public ResponseEntity<ApiResponse<GrantCoinResponse>> grantCoin(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody GrantCoinRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(coinService.grantCoin(me, request)));
    }

    /** API-coin-08 · 권한 ADMIN. {@code chain_job WHERE tx_type='MINT'}가 곧 지급 이력이다. */
    @GetMapping("/grants")
    public ApiResponse<GrantHistoryResponse> grantHistory(
            @AuthenticationPrincipal MemberPrincipal me,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long memberId,
            @RequestParam(required = false) String address,
            Pageable pageable) {
        return ApiResponse.success(
                coinService.grantHistory(me, source, status, memberId, address, pageable));
    }
}
