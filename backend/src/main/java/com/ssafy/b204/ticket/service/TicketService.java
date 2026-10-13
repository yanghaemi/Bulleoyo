package com.ssafy.b204.ticket.service;

import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.Paging;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.ticket.dto.TicketDtos.QrTokenResponse;
import com.ssafy.b204.ticket.dto.TicketDtos.TicketDetailResponse;
import com.ssafy.b204.ticket.dto.TicketDtos.TicketListItem;
import com.ssafy.b204.ticket.dto.TicketDtos.TicketListResponse;
import com.ssafy.b204.ticket.entity.Ticket;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.ticket.support.QrTokens;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 티켓 — API v6 §6(API-ticket-04·05·06).
 *
 * <p><b>소유권은 DB 기준이다</b>({@code ticket.member_id}). 양도가 v6에서 삭제돼 소유자 변경
 * 경로가 없고, 상태는 3값({@code ISSUED}/{@code USED}/{@code CANCELLED})이다.
 *
 * <p>QR은 저장하지 않는다 — {@code qr_secret}으로 <b>매번 계산</b>하므로 재발급이 자유롭고
 * 캡처한 QR은 최대 60초 뒤 죽는다({@link QrTokens} · SEC-06).
 *
 * <p>관객 화면이라 주소·해시를 응답에 담지 않는다(§0.7 · P-22).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TicketService {

    /** 입장 시작 = 공연 시작 1시간 전. 판매 마감(시작 1분 전)보다 앞이라 둘이 겹친다. */
    private static final int ENTRY_OPEN_HOURS_BEFORE = 1;

    /** 환불은 언제나 지갑 잔액으로 돌아간다(P-20). 원화 출구가 없다. */
    private static final String REFUND_TARGET = "WALLET_BALANCE";

    private static final Map<String, String> TICKET_SORT = Map.of("startAt", "performance.performanceAt");

    private final TicketRepository ticketRepository;
    private final PerformanceService performanceService;
    private final DisplayRateService displayRateService;

    // ================================================================ API-ticket-04

    /** API-ticket-04 내 티켓 목록. */
    public TicketListResponse myTickets(MemberPrincipal me, String status, Pageable pageable) {
        Member member = performanceService.requireMember(me);
        Ticket.Status filter = parseStatus(status);
        Pageable page = Paging.of(pageable, TICKET_SORT,
                Sort.by(Sort.Direction.ASC, "performance.performanceAt"));
        Page<Ticket> tickets = filter == null
                ? ticketRepository.findByMember_MemberId(member.getMemberId(), page)
                : ticketRepository.findByMember_MemberIdAndStatus(member.getMemberId(), filter, page);

        List<TicketListItem> items = tickets.getContent().stream()
                .map(t -> new TicketListItem(
                        t.getTicketId(),
                        t.getPerformance().getPerformanceId(),
                        t.getPerformance().getTitle(),
                        t.getPerformance().getVenueName(),
                        TimeSupport.toOffset(t.getPerformance().getPerformanceAt(),
                                member.getTimezone()),
                        t.getTicketType().getName(),
                        // (v6.2) 관객 화면은 "응원 팀"으로만 표기한다 — 티커·지갑·tx 용어는 없다.
                        t.getTicketOrder().getSelectedTeam() == null ? null
                                : t.getTicketOrder().getSelectedTeam().getName(),
                        t.getStatus().name(),
                        cancellable(t),
                        cancellable(t) ? REFUND_TARGET : null))
                .toList();
        return new TicketListResponse(items, PageInfo.from(tickets));
    }

    // ================================================================ API-ticket-05

    /** API-ticket-05 티켓 상세. 소유자가 아니면 {@code TICKET_NOT_OWNED}(403). */
    public TicketDetailResponse ticketDetail(MemberPrincipal me, Long ticketId) {
        Member member = performanceService.requireMember(me);
        Ticket ticket = requireOwnedTicket(member, ticketId);
        Performance performance = ticket.getPerformance();
        Money money = displayRateService.money(ticket.getPurchasePrice(),
                member.getDisplayCurrency(), member.getTimezone());

        return new TicketDetailResponse(
                ticket.getTicketId(),
                ticket.getTicketOrder().getTicketOrderId(),
                performance.getPerformanceId(),
                performance.getTitle(),
                performance.getVenueName(),
                performance.getVenueAddress(),
                TimeSupport.toOffset(performance.getPerformanceAt(), member.getTimezone()),
                ticket.getTicketType().getName(),
                ticket.getPurchasePrice(),
                Money.BASE_CURRENCY,
                money.display(),
                ticket.getStatus().name(),
                ticket.getTicketOrder().getSelectedTeam() == null ? null
                        : ticket.getTicketOrder().getSelectedTeam().getName(),
                cancellable(ticket),
                cancellable(ticket) ? REFUND_TARGET : null,
                TimeSupport.toOffset(performance.getCancelDeadlineAt(), member.getTimezone()),
                TimeSupport.toOffset(entryOpenAt(performance), member.getTimezone()),
                TimeSupport.toOffset(ticket.getEnteredAt(), member.getTimezone()));
    }

    // ================================================================ API-ticket-06

    /**
     * API-ticket-06 동적 QR 토큰 발급.
     *
     * <p>{@code GET}인데 부수효과가 없다 — 토큰을 저장하지 않고 {@code qr_secret}과 현재 30초
     * 윈도우로 매번 HMAC-SHA256을 계산한다. 그래서 재발급이 자유롭고, 고정 티켓번호 QR을 만들지
     * 않는다(P-14 · SEC-06).
     *
     * <p>입장 시간대 밖에서도 발급은 허용한다 — 거르는 것은 검표(API-entry-01)의
     * {@code ENTRY_NOT_IN_TIME_WINDOW}다.
     */
    public QrTokenResponse issueQrToken(MemberPrincipal me, Long ticketId) {
        Member member = performanceService.requireMember(me);
        Ticket ticket = requireOwnedTicket(member, ticketId);
        switch (ticket.getStatus()) {
            case USED -> throw BusinessException.of(ErrorCode.TICKET_ALREADY_USED);
            case CANCELLED -> throw BusinessException.of(ErrorCode.TICKET_CANCELED);
            default -> { }
        }

        Instant now = Instant.now();
        long window = QrTokens.windowOf(now);
        Instant issuedAt = QrTokens.windowStart(window);
        return new QrTokenResponse(
                ticket.getTicketId(),
                QrTokens.issue(ticket.getTicketId(), ticket.getQrSecret(), window),
                TimeSupport.fromEpochMilli(issuedAt.toEpochMilli(), member.getTimezone()),
                TimeSupport.fromEpochMilli(
                        issuedAt.plusSeconds(QrTokens.VALID_SECONDS).toEpochMilli(),
                        member.getTimezone()),
                QrTokens.ROTATE_AFTER_MS);
    }

    // ================================================================ 내부

    private Ticket requireOwnedTicket(Member member, Long ticketId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));
        if (!ticket.isOwnedBy(member.getMemberId())) {
            throw BusinessException.of(ErrorCode.TICKET_NOT_OWNED);
        }
        return ticket;
    }

    /**
     * 취소 가능 판정 — 상태 {@code ISSUED} + 취소 마감 전. 정산 잠금 이후 차단은 settlement
     * 도메인이 붙을 때 여기에 조건이 하나 더 붙는다(온체인 회수가 불가해지기 때문이다).
     */
    private static boolean cancellable(Ticket ticket) {
        LocalDateTime deadline = ticket.getPerformance().getCancelDeadlineAt();
        return ticket.getStatus() == Ticket.Status.ISSUED
                && (deadline == null || deadline.isAfter(TimeSupport.nowStored()));
    }

    private static LocalDateTime entryOpenAt(Performance performance) {
        return performance.getEntryStartAt() != null ? performance.getEntryStartAt()
                : performance.getPerformanceAt().minusHours(ENTRY_OPEN_HOURS_BEFORE);
    }

    private static Ticket.Status parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return Ticket.Status.valueOf(status);
        } catch (IllegalArgumentException e) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
    }
}
