package com.ssafy.b204.refund.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.refund.dto.RefundDtos.CancelTicketRequest;
import com.ssafy.b204.refund.dto.RefundDtos.CancelTicketResponse;
import com.ssafy.b204.refund.dto.RefundDtos.RefundQuoteResponse;
import com.ssafy.b204.refund.service.RefundService;
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
 * refund — 취소·환불 (API v6 §9, API-refund-01·02). 접두 {@code REFUND_*}.
 *
 * <p>경로가 {@code /tickets/{ticketId}/...}다 — 취소 단위가 <b>티켓 1장</b>이기 때문이다
 * (주문 단위 일괄 취소는 공연 취소 API-performance-12가 담당한다).
 */
@RestController
@RequestMapping("/api/v1/tickets/{ticketId}")
@RequiredArgsConstructor
public class RefundController {

    private final RefundService refundService;

    /** API-refund-01 · 권한 소유자. 조회만 — 상태를 바꾸지 않는다. */
    @GetMapping("/refund-quote")
    public ApiResponse<RefundQuoteResponse> refundQuote(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long ticketId) {
        return ApiResponse.success(refundService.refundQuote(me, ticketId));
    }

    /**
     * API-refund-02 · 권한 소유자. 202 + 폴링.
     *
     * <p>멱등키를 받는다 — 새로고침으로 두 번 환불되면 에스크로가 마이너스가 된다.
     */
    @PostMapping("/cancel")
    public ResponseEntity<ApiResponse<CancelTicketResponse>> cancelTicket(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long ticketId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CancelTicketRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(
                        refundService.cancelTicket(me, ticketId, idempotencyKey, request)));
    }
}
