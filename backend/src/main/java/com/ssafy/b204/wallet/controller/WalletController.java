package com.ssafy.b204.wallet.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.wallet.dto.WalletDtos.ChallengeRequest;
import com.ssafy.b204.wallet.dto.WalletDtos.ChallengeResponse;
import com.ssafy.b204.wallet.dto.WalletDtos.MyWalletResponse;
import com.ssafy.b204.wallet.dto.WalletDtos.RegisterWalletRequest;
import com.ssafy.b204.wallet.dto.WalletDtos.RegisterWalletResponse;
import com.ssafy.b204.wallet.dto.WalletDtos.WalletTxListResponse;
import com.ssafy.b204.wallet.service.WalletService;
import com.ssafy.b204.common.support.RateLimiter;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * wallet — 지갑 (API v6 §3). 에러 코드 접두 {@code WALLET_*}.
 *
 * <p><b>비수탁이다.</b> 서버는 사용자 개인키·니모닉·MPC 샤드를 받지도 저장하지도 않는다.
 * 이 컨트롤러의 어떤 엔드포인트도 그런 값을 받지 않으며, 요청 본문에 그런 필드가 오면
 * Jackson의 알 수 없는 필드 거부로 {@code COMMON_VALIDATION_FAILED}가 된다.
 *
 * <p>등록은 <b>회원당 1회</b>이고 {@code POST /api/v1/wallets} 하나가 두 provider를 받는다.
 * v5의 API-wallet-05(가스)는 삭제됐다 — 수수료 대납을 채택해 사용자 지갑에 KAIA를 넣지 않는다.
 */
@RestController
@RequestMapping("/api/v1/wallets")
@RequiredArgsConstructor
public class WalletController {

    private final WalletService walletService;
    private final RateLimiter rateLimiter;

    /** API-wallet-01 · 권한 회원. 잔액은 Redis {@code wallet:balance}에서 온다. */
    @GetMapping("/me")
    public ApiResponse<MyWalletResponse> myWallet(@AuthenticationPrincipal MemberPrincipal me) {
        return ApiResponse.success(walletService.myWallet(me));
    }

    /**
     * API-wallet-02 · 권한 회원. 별도 {@code wallet_tx} 테이블이 없어 <b>원본 셋</b>을 합쳐
     * 만든다 — {@code chain_job}(내 {@code wallet_id}) + {@code settlement_share}(정산 수령) +
     * {@code performance}(보증금 반환).
     *
     * @param type {@code GRANT}/{@code PURCHASE}/{@code REFUND}/{@code DEPOSIT}/
     *             {@code DEPOSIT_RETURN}/{@code RELEASE} 6종
     */
    @GetMapping("/me/transactions")
    public ApiResponse<WalletTxListResponse> myTransactions(
            @AuthenticationPrincipal MemberPrincipal me,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            Pageable pageable) {
        return ApiResponse.success(walletService.myTransactions(me, type, status, pageable));
    }

    /** API-wallet-03 · 권한 회원 · <b>P0</b>. 회원당 10회/분 제한(§0.9). */
    @PostMapping("/challenge")
    public ApiResponse<ChallengeResponse> issueChallenge(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody ChallengeRequest request) {
        rateLimiter.check(RateLimiter.Policy.WALLET_CHALLENGE_MEMBER,
                me == null ? null : me.memberId());
        return ApiResponse.success(walletService.issueChallenge(me, request));
    }

    /**
     * API-wallet-04 · 권한 회원 · <b>P0</b>. 회원당 1회.
     *
     * <p><b>202 Accepted</b>다(명세 §3 API-wallet-04 응답). 지갑 레코드는 이 요청 안에서
     * 확정되지만 기본 지급 {@code MINT}는 온체인 확정을 기다리지 않고 {@code grantJobId}로
     * 폴링하기 때문이다(§0.3). {@code code}는 {@code SUCCESS}이며 클라이언트는
     * {@code status === 200}으로 성공을 판별하지 않는다(§0.1).
     */
    @PostMapping
    public ResponseEntity<ApiResponse<RegisterWalletResponse>> registerWallet(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody RegisterWalletRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(walletService.registerWallet(me, request),
                        "지갑을 연결했습니다. 기본 잔액을 지급하고 있습니다."));
    }
}
