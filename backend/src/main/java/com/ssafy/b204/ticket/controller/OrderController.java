package com.ssafy.b204.ticket.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.RateLimiter;
import com.ssafy.b204.ticket.dto.TicketDtos.CreateOrderRequest;
import com.ssafy.b204.ticket.dto.TicketDtos.CreateOrderResponse;
import com.ssafy.b204.ticket.dto.TicketDtos.OrderDetailResponse;
import com.ssafy.b204.ticket.dto.TicketDtos.OrderListResponse;
import com.ssafy.b204.ticket.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 주문 — API v6 §6의 API-ticket-01·02·03. 경로는 {@code /orders}다.
 *
 * <p>도메인은 {@code ticket}인데 경로가 {@code /orders}인 이유는 명세가 그렇게 정했기
 * 때문이다(§0.11의 도메인 목차는 도메인 이름이고 경로와 1:1이 아니다). 테이블도
 * {@code ticket_order}다({@code order}는 MySQL 예약어).
 */
@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;
    private final RateLimiter rateLimiter;

    /**
     * API-ticket-01 · 권한 AUDIENCE.
     *
     * <p>멱등키를 헤더로 받는다(§0.8) — 새로고침·재시도로 같은 주문이 두 번 만들어지면 재고가
     * 잘못 빠진다. 같은 키·다른 본문은 {@code COMMON_CONFLICT}(409).
     */
    @PostMapping
    public ResponseEntity<ApiResponse<CreateOrderResponse>> createOrder(
            @AuthenticationPrincipal MemberPrincipal me,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CreateOrderRequest request) {
        // §0.9 "예매 매크로 차단 룰" - 회원 단위로 센다. IP 단위면 같은 공연장 NAT 뒤의
        // 정상 관객들이 서로의 한도를 깎는다.
        rateLimiter.check(RateLimiter.Policy.ORDER_CREATE_MEMBER, me == null ? null : me.memberId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(
                        orderService.createOrder(me, idempotencyKey, request),
                        "15분 안에 결제를 완료해 주세요."));
    }

    /** API-ticket-02 · 권한 AUDIENCE. */
    @GetMapping("/me")
    public ApiResponse<OrderListResponse> myOrders(@AuthenticationPrincipal MemberPrincipal me,
                                                    @RequestParam(required = false) String status,
                                                    Pageable pageable) {
        return ApiResponse.success(orderService.myOrders(me, status, pageable));
    }

    /** API-ticket-03 · 권한 AUDIENCE(주문자). 남의 주문이면 {@code COMMON_FORBIDDEN}(403). */
    @GetMapping("/{orderId}")
    public ApiResponse<OrderDetailResponse> orderDetail(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long orderId) {
        return ApiResponse.success(orderService.orderDetail(me, orderId));
    }
}
