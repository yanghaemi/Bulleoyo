package com.ssafy.b204.ticket.dto;

import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * ticket 도메인 DTO — API v6 §6 (API-ticket-01~06). 접두 {@code TICKET_*}.
 *
 * <p><b>v6에서 양도(선물)가 삭제됐다</b>(결정 v2 §14-34) — {@code transferable} 필드와
 * {@code TRANSFER_*} 에러 행이 전부 빠졌고, 티켓 상태는 3값
 * ({@code ISSUED}/{@code USED}/{@code CANCELLED})이다.
 *
 * <p>관객 화면이므로 <b>주소·해시를 노출하지 않는다</b>(§0.7·P-22). 블록체인 용어도 쓰지 않는다.
 */
public final class TicketDtos {

    private TicketDtos() {
    }

    // ------------------------------------------------------------ API-ticket-01

    /**
     * {@code POST /api/v1/orders} — 주문 생성. 권한 AUDIENCE.
     *
     * <p><b>(v6.2) 응원 팀은 표마다 배분한다.</b> {@code items[].chosenTeamId}가 그 행의 표가
     * 응원할 팀이고, 서버가 팀별로 <b>하위 주문</b>을 쪼개 {@code orderGroupId}로 묶는다. 같은
     * {@code ticketTypeId}라도 팀이 다르면 행을 나눠 담는다. 공동 공연에서 배분이 빠진 행은
     * {@code TICKET_TEAM_CHOICE_REQUIRED}(400), 참여팀이 아니면
     * {@code TICKET_TEAM_CHOICE_INVALID}(400)이고, 단독 공연은 생략하면 서버가 생성팀으로 채운다.
     *
     * <p>{@code totalAmount}는 <b>클라이언트가 계산한 그룹 합계</b>이고 서버가 재계산해 대조한다.
     * 다르면 {@code PAYMENT_AMOUNT_MISMATCH}(409) — 위조 시도로 간주하고 로그를 남긴다.
     */
    public record CreateOrderRequest(
            @NotNull Long performanceId,
            @NotEmpty(message = "티켓을 1개 이상 선택해 주세요.") @Valid List<OrderItemInput> items,
            @NotNull @Min(0) Long totalAmount
    ) {}

    public record OrderItemInput(
            @NotNull Long ticketTypeId,
            @NotNull @Min(value = 1, message = "수량은 1 이상이어야 합니다.") Integer quantity,
            Long chosenTeamId
    ) {}

    /**
     * {@code shortfall}은 <b>안내용</b>이다(v5 변경) — 잔액이 모자라도 주문은 만들어지고
     * 결제 단계에서 409로 막힌다. 코인을 사들이는 입구가 없는 세계라 "충전하기" 버튼이 없다.
     *
     * <p>{@code orderId}는 {@code orderGroupId}와 같은 값이다(하위 호환).
     */
    public record CreateOrderResponse(
            Long orderGroupId,
            Long orderId,
            Long performanceId,
            String performanceTitle,
            String status,
            List<SubOrder> orders,
            Long totalAmount,
            Integer totalQuantity,
            String currency,
            Money.Display display,
            Long walletBalance,
            Long shortfall,
            boolean balanceStale,
            OffsetDateTime expiresAt
    ) {}

    /**
     * 주문 그룹을 이루는 하위 주문 — <b>팀 하나·{@code orderRef} 하나·{@code purchase} tx 하나</b>.
     *
     * <p>{@code teamIndex}는 컨트랙트가 응원 팀을 가리키는 인덱스이며 온체인 인자로 그대로 쓰인다.
     */
    public record SubOrder(
            Long orderId,
            String orderRef,
            Long chosenTeamId,
            String chosenTeamName,
            Integer teamIndex,
            List<OrderItemSummary> items,
            Integer quantity,
            Long amount
    ) {}

    public record OrderItemSummary(Long ticketTypeId, String name, Long priceAmount,
                                    Integer quantity, Long amount) {}

    // ------------------------------------------------------------ API-ticket-02

    /**
     * 내 주문 목록 항목 — <b>주문 그룹 하나</b>가 한 줄이다.
     *
     * <p>{@code groupStatus}는 저장하지 않고 하위 주문 상태에서 파생한다(요구사항 §5-1).
     * {@code resumable}이면 결제를 이어서 할 수 있다(만료 전 미결제).
     */
    public record OrderListItem(
            Long orderGroupId,
            Long performanceId,
            String performanceTitle,
            OffsetDateTime startAt,
            String groupStatus,
            List<TeamBreakdown> teamBreakdown,
            Long totalAmount,
            String currency,
            Integer ticketCount,
            boolean resumable,
            OffsetDateTime orderedAt,
            OffsetDateTime expiresAt
    ) {}

    /** 그룹 안에서 팀마다 몇 장·얼마인지. A-12가 "새벽세시 1장" 처럼 그린다. */
    public record TeamBreakdown(Long teamId, String teamName, Integer quantity, Long amount) {}

    public record OrderListResponse(Money.Rate rate, List<OrderListItem> items,
                                     PageInfo pageInfo) {}

    // ------------------------------------------------------------ API-ticket-03

    /**
     * 주문 상세. 권한 AUDIENCE(주문자 본인).
     *
     * <p>경로의 {@code orderId}는 <b>그룹의 어느 하위 주문이든</b> 되고 응답은 항상 그룹 전체다.
     */
    public record OrderDetailResponse(
            Long orderGroupId,
            String groupStatus,
            Long performanceId,
            String performanceTitle,
            String venueName,
            OffsetDateTime startAt,
            List<SubOrderDetail> orders,
            Long totalAmount,
            String currency,
            Money.Display display
    ) {}

    /** 하위 주문 상세 — 항목·응원 팀·결제·발급 티켓. */
    public record SubOrderDetail(
            Long orderId,
            String orderRef,
            String status,
            Long chosenTeamId,
            String chosenTeamName,
            List<OrderItemSummary> items,
            Long amount,
            PaymentBlock payment,
            List<IssuedTicket> tickets
    ) {}

    /**
     * ⚠️ {@code approveTxHash}는 ERD v5 {@code payment}에 대응 컬럼이 없다 —
     * {@code purchase_tx_hash}만 있다. {@code approve_chain_job_id}로 {@code chain_job}을 조회해
     * 그쪽 {@code tx_hash}를 쓰면 저장 없이 채울 수 있다.
     */
    public record PaymentBlock(Long paymentId, String status, String approveTxHash,
                                String purchaseTxHash, OffsetDateTime paidAt) {}

    public record IssuedTicket(Long ticketId, String ticketTypeName, String status) {}

    // ------------------------------------------------------------ API-ticket-04·05

    /** 내 티켓 목록 항목. {@code refundTarget}은 항상 {@code WALLET_BALANCE}(원화 출구가 없다). */
    public record TicketListItem(
            Long ticketId,
            Long performanceId,
            String performanceTitle,
            String venueName,
            OffsetDateTime startAt,
            String ticketTypeName,
            String chosenTeamName,
            String status,
            boolean cancellable,
            String refundTarget
    ) {}

    public record TicketListResponse(List<TicketListItem> items, PageInfo pageInfo) {}

    /** 티켓 상세. 권한 AUDIENCE(소유자). 소유권은 DB 기준이다. */
    public record TicketDetailResponse(
            Long ticketId,
            Long orderId,
            Long performanceId,
            String performanceTitle,
            String venueName,
            String venueAddress,
            OffsetDateTime startAt,
            String ticketTypeName,
            Long priceAmount,
            String currency,
            Money.Display display,
            String status,
            String chosenTeamName,
            boolean cancellable,
            String refundTarget,
            OffsetDateTime cancelDeadlineAt,
            OffsetDateTime entryOpenAt,
            OffsetDateTime usedAt
    ) {}

    // ------------------------------------------------------------ API-ticket-06

    /**
     * 동적 QR 토큰 발급. 권한 소유자.
     *
     * <p>{@code qrToken}은 {@code ticket.qr_secret}으로 서명한 짧은 수명 토큰이다.
     * {@code rotateAfterMs}(30초)마다 화면이 스스로 재발급하고 {@code expiresAt}(60초)이 지나면
     * {@code ENTRY_QR_EXPIRED}(401)가 된다 — 캡처한 QR을 재사용할 수 없게 하려는 설계다.
     *
     * <p>중복 입장 차단은 이 토큰이 아니라 Redis {@code entry:{ticketId}} SETNX가 한다.
     */
    public record QrTokenResponse(
            Long ticketId,
            String qrToken,
            OffsetDateTime issuedAt,
            OffsetDateTime expiresAt,
            Integer rotateAfterMs
    ) {}
}
