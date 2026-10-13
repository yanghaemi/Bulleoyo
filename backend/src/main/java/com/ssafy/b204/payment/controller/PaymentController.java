package com.ssafy.b204.payment.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.payment.dto.PaymentDtos.PaymentSignedTxRequest;
import com.ssafy.b204.payment.dto.PaymentDtos.PaymentStatusResponse;
import com.ssafy.b204.payment.dto.PaymentDtos.StartPaymentResponse;
import com.ssafy.b204.payment.service.PaymentService;
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
 * payment — 코인 결제 (API v6 §7, API-payment-01~03). 접두 {@code PAYMENT_*}.
 *
 * <p>경로가 {@code /orders/{orderId}/payment}다 — 주문 1:1이라 별도 리소스 id를 노출하지 않는다.
 *
 * <p>세 엔드포인트 모두 권한이 <b>AUDIENCE(주문자 본인)</b>이며, 남의 주문이면
 * {@code COMMON_FORBIDDEN}(403)이다. 관객 화면이므로 응답에 주소·해시를 노출하지 않는 것이
 * 원칙이지만, {@code signRequests}는 서명을 위해 필요하고 {@code txHash}는 결제 결과 추적에
 * 필요해 예외다(§0.4·§0.7).
 */
@RestController
@RequestMapping("/api/v1/orders/{orderId}/payment")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    /**
     * API-payment-01 · 권한 AUDIENCE(주문자). <b>요청 본문 없음</b>(v5).
     *
     * <p>이미 결제된 주문이면 {@code PAYMENT_ALREADY_PAID}(409). 잔액 부족은
     * {@code COMMON_CONFLICT}(409) — 늘릴 방법이 없으므로 안내만 한다.
     */
    @PostMapping
    public ApiResponse<StartPaymentResponse> startPayment(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long orderId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        // 명세·§17 검수표 모두 200 OK 다. 스켈레톤이 201이었던 것을 정정했다 - 결제 시작은
        // payment 리소스를 만들면서도 "서명 파라미터 발급"이 본체라 201 Location 의미가 없다.
        return ApiResponse.success(paymentService.startPayment(me, orderId, idempotencyKey));
    }

    /**
     * API-payment-02 · 권한 AUDIENCE(주문자).
     *
     * <p>조회인데 {@code signRequests}를 담는다 — 새로고침·이탈 후 복귀에서 서명을 이어가려면
     * 파라미터를 다시 받아야 한다.
     */
    @GetMapping
    public ApiResponse<PaymentStatusResponse> paymentStatus(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long orderId) {
        return ApiResponse.success(paymentService.paymentStatus(me, orderId));
    }

    /**
     * API-payment-03 · 권한 AUDIENCE(주문자). §0.4 {@code signed-tx} — <b>202</b> + 폴링.
     *
     * <p>{@code abandoned: true}는 사용자가 지갑 팝업을 닫은 경우이고 <b>200</b>이다. 실패가
     * 아니므로 tx를 만들지 않고 잔액이 그대로임을 알린다 — 그래서 상태 코드가 갈린다.
     */
    @PostMapping("/signed-tx")
    public ResponseEntity<ApiResponse<?>> signedTx(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long orderId,
            @Valid @RequestBody PaymentSignedTxRequest request,
            // [2026-09-24] 결제 전 본인 확인 토큰. 스위치 꺼짐이면 서비스가 읽지 않는다. abandoned 는
            // 코인이 움직이지 않으므로 가드 대상이 아니다(API v7 API-payment-03).
            @RequestHeader(value = "X-Step-Up-Token", required = false) String stepUpToken) {
        if (Boolean.TRUE.equals(request.abandoned())) {
            return ResponseEntity.ok(ApiResponse.success(
                    paymentService.abandon(me, orderId, request),
                    "결제가 완료되지 않았습니다. 잔액은 그대로 남아 있습니다."));
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(paymentService.signedTx(me, orderId, request, stepUpToken),
                        "결제를 확인하고 있습니다."));
    }
}
