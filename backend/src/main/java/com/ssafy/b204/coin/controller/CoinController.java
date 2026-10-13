package com.ssafy.b204.coin.controller;

import com.ssafy.b204.coin.dto.CoinDtos.ChainConfigResponse;
import com.ssafy.b204.coin.dto.CoinDtos.RatesResponse;
import com.ssafy.b204.coin.dto.CoinDtos.SupplyResponse;
import com.ssafy.b204.coin.service.CoinService;
import com.ssafy.b204.common.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * coin (공개) — API v6 §8의 API-coin-01·02·04. 접두 {@code COIN_*}.
 *
 * <p><b>세 엔드포인트 모두 권한 GUEST</b>다(§0.1) — 발행량 공시와 표시 환율은 누구나 볼 수 있어야
 * 한다. 공개 검증이 "플랫폼 화면을 거치지 않고 독립 검증"을 목표로 하기 때문이다.
 *
 * <p>관리자 전용인 API-coin-03·07·08은 경로가 {@code /admin/coin/**}이라
 * {@link com.ssafy.b204.admin.controller.AdminCoinController}에 있다.
 */
@RestController
@RequestMapping("/api/v1/coin")
@RequiredArgsConstructor
public class CoinController {

    private final CoinService coinService;

    /**
     * API-coin-01 · 권한 <b>GUEST</b>. 불변식 4개를 함께 공개한다.
     *
     * <p>노드 조회가 실패하면 체인 값 없이 DB 집계만으로 내려간다 — 공시 화면이 502로 죽으면
     * "누구나 검증 가능"이 성립하지 않는다.
     */
    @GetMapping("/supply")
    public ApiResponse<SupplyResponse> supply() {
        return ApiResponse.success(coinService.supply());
    }

    /** API-coin-02 · 권한 <b>GUEST</b>. 환율 미등록은 오류가 아니다 — 빈 배열 200. */
    @GetMapping("/rates")
    public ApiResponse<RatesResponse> rates(@RequestParam(required = false) String pair) {
        return ApiResponse.success(coinService.rates(pair));
    }

    /** API-coin-04 · 권한 <b>GUEST</b> · <b>P1</b>. MVP는 프론트 환경변수를 쓴다. */
    @GetMapping("/config")
    public ApiResponse<ChainConfigResponse> config() {
        return ApiResponse.success(coinService.config());
    }
}
