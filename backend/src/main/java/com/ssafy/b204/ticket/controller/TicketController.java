package com.ssafy.b204.ticket.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.RateLimiter;
import com.ssafy.b204.ticket.dto.TicketDtos.QrTokenResponse;
import com.ssafy.b204.ticket.dto.TicketDtos.TicketDetailResponse;
import com.ssafy.b204.ticket.dto.TicketDtos.TicketListResponse;
import com.ssafy.b204.ticket.service.TicketService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 티켓 — API v6 §6의 API-ticket-04·05·06.
 *
 * <p>양도가 삭제됐으므로 소유자 변경 경로가 없다. 상태는 3값이고 {@code qr_secret}은 발급 시
 * 1회만 생성된다.
 */
@RestController
@RequestMapping("/api/v1/tickets")
@RequiredArgsConstructor
public class TicketController {

    private final TicketService ticketService;
    private final RateLimiter rateLimiter;

    /** API-ticket-04 · 권한 AUDIENCE. */
    @GetMapping("/me")
    public ApiResponse<TicketListResponse> myTickets(@AuthenticationPrincipal MemberPrincipal me,
                                                      @RequestParam(required = false) String status,
                                                      Pageable pageable) {
        return ApiResponse.success(ticketService.myTickets(me, status, pageable));
    }

    /** API-ticket-05 · 권한 AUDIENCE(소유자). 아니면 {@code TICKET_NOT_OWNED}(403). */
    @GetMapping("/{ticketId}")
    public ApiResponse<TicketDetailResponse> ticketDetail(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long ticketId) {
        return ApiResponse.success(ticketService.ticketDetail(me, ticketId));
    }

    /**
     * API-ticket-06 · 권한 소유자. 60초 수명의 서명 토큰을 내려준다.
     *
     * <p>{@code GET}인데 부수효과가 없다 — 토큰은 {@code qr_secret}으로 매번 계산하고 저장하지
     * 않는다. 그래서 새로고침·재발급이 자유롭다.
     */
    @GetMapping("/{ticketId}/qr")
    public ApiResponse<QrTokenResponse> issueQrToken(@AuthenticationPrincipal MemberPrincipal me,
                                                      @PathVariable Long ticketId) {
        // 4xx 표의 429 "회전 주기보다 잦은 호출"(§0.9). 회전은 30초라 분당 2~3회가 정상이다.
        rateLimiter.check(RateLimiter.Policy.TICKET_QR_MEMBER, me == null ? null : me.memberId());
        return ApiResponse.success(ticketService.issueQrToken(me, ticketId));
    }
}
