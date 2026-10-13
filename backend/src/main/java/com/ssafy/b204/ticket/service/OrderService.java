package com.ssafy.b204.ticket.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.support.ChainJobIds;
import com.ssafy.b204.chain.support.ContractCalls;
import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.IdempotencyGuard;
import com.ssafy.b204.common.support.Paging;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.common.support.TxCallbacks;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.payment.repository.PaymentRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.entity.TicketType;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.rule.support.RulesHash;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.ticket.dto.TicketDtos.CreateOrderRequest;
import com.ssafy.b204.ticket.dto.TicketDtos.CreateOrderResponse;
import com.ssafy.b204.ticket.dto.TicketDtos.IssuedTicket;
import com.ssafy.b204.ticket.dto.TicketDtos.OrderDetailResponse;
import com.ssafy.b204.ticket.dto.TicketDtos.OrderItemInput;
import com.ssafy.b204.ticket.dto.TicketDtos.OrderItemSummary;
import com.ssafy.b204.ticket.dto.TicketDtos.OrderListItem;
import com.ssafy.b204.ticket.dto.TicketDtos.OrderListResponse;
import com.ssafy.b204.ticket.dto.TicketDtos.PaymentBlock;
import com.ssafy.b204.ticket.dto.TicketDtos.SubOrder;
import com.ssafy.b204.ticket.dto.TicketDtos.SubOrderDetail;
import com.ssafy.b204.ticket.dto.TicketDtos.TeamBreakdown;
import com.ssafy.b204.ticket.entity.OrderItem;
import com.ssafy.b204.ticket.entity.Ticket;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.service.WalletBalanceService;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주문 — API v6 §6(API-ticket-01·02·03).
 *
 * <p><b>동시 예매 경합이 이 서비스의 본질적 난점이다.</b> 재고 차감은 Redis({@link TicketStock})가
 * 하고 {@code ticket_type.sold_quantity}는 결제 확정 시 반영하는 결과 기록이다 — DB 카운터로
 * 경합을 막으면 행 락이 응답 시간을 지배한다(REL-01 · PERF-02).
 *
 * <p><b>재고는 주문 생성에서 선점한다.</b> 결제 시점에 차감하면 결제 화면에서 품절이 난다.
 * 15분 안에 결제되지 않으면 만료 스윕이 되돌린다.
 *
 * <p><b>잔액이 모자라도 주문은 만든다</b>(v5 변경). {@code shortfall}은 안내용이고, 막는 것은
 * 결제 시작(API-payment-01)이다. 코인을 사들이는 입구가 없는 세계라 "충전하기" 버튼이 없다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderService {

    /** §6 API-ticket-01 — 주문 1건의 항목 수 상한. (v6.2) 팀별로 행을 나눠 담아 5 -> 10이다. */
    private static final int MAX_ITEMS = 10;

    /** API-ticket-02 {@code status} 필터 — 파생값이라 DB WHERE 로 걸 수 없다(§5-1). */
    private static final Set<String> GROUP_STATUSES = Set.of("PENDING_PAYMENT", "PAID",
            "PARTIALLY_PAID", "CANCELLED", "REFUNDED");

    private static final Map<String, String> ORDER_SORT = Map.of("createdAt", "createdAt");

    private final TicketOrderRepository ticketOrderRepository;
    private final TicketRepository ticketRepository;
    private final TicketTypeRepository ticketTypeRepository;
    private final PaymentRepository paymentRepository;
    /** {@code payment.approveTxHash} 파생 전용 — {@code chain_job.tx_hash}를 읽는다. */
    private final ChainJobRepository chainJobRepository;
    private final PerformanceService performanceService;
    private final WalletBalanceService walletBalanceService;
    private final DisplayRateService displayRateService;
    private final OrderIdempotencyStore idempotencyStore;
    private final TicketStock ticketStock;

    /** {@code b204.ticket.payment-timeout} — 명세는 15분이다(API-ticket-01). */
    @Value("${b204.ticket.payment-timeout:15m}")
    private Duration paymentTimeout;

    // ================================================================ API-ticket-01

    /**
     * API-ticket-01 주문 생성. {@code Idempotency-Key} <b>필수</b>(§0.8) — 새로고침·재시도로 같은
     * 주문이 두 번 만들어지면 재고가 잘못 빠진다.
     *
     * <p><b>멱등 처리는 조회가 아니라 선점이다.</b> 재고 차감·주문 저장에 <b>들어가기 전에</b>
     * {@link OrderIdempotencyStore#begin}이 {@code SET NX}로 자리를 잡는다. 잡지 못하면 최초
     * 결과를 재생하거나 409다 — 두 요청이 동시에 "아직 없다"를 보고 둘 다 주문을 만드는 창이
     * 없어진다.
     */
    @Transactional
    public CreateOrderResponse createOrder(MemberPrincipal me, String idempotencyKey,
                                           CreateOrderRequest request) {
        Member member = performanceService.requireMember(me);
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        IdempotencyGuard.Reservation reservation = idempotencyStore.begin(member.getMemberId(),
                idempotencyKey, request.toString());
        Optional<Long> replayed = reservation.replayed();
        if (replayed.isPresent()) {
            // 최초 응답을 그대로 재생한다 — 재고를 다시 빼지 않는다(REL-04).
            return toCreateResponse(groupOf(requireOrder(replayed.get())), member);
        }
        // 선점만 하고 실패하면 자리가 24시간 잠긴다. 아래 경로의 모든 실패에서 되돌린다.
        try {
            return createReservedOrder(member, request, reservation);
        } catch (RuntimeException e) {
            idempotencyStore.release(reservation);
            throw e;
        }
    }

    /** 자리를 잡은 뒤의 본 처리. 실패하면 재고·멱등 자리를 모두 되돌린다. */
    private CreateOrderResponse createReservedOrder(Member member, CreateOrderRequest request,
                                                    IdempotencyGuard.Reservation reservation) {
        // 서명할 지갑이 없으면 결제가 불가능하다 — C-05 온보딩으로 보낸다.
        performanceService.requireWallet(member.getMemberId());
        Performance performance = performanceService.requirePerformance(request.performanceId());
        requireOnSale(performance);

        List<OrderItemInput> inputs = request.items();
        if (inputs.isEmpty() || inputs.size() > MAX_ITEMS) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }

        // (v6.2) 배분한 팀별로 하위 주문을 쪼갠다. 같은 팀으로 중복된 행은 오류가 아니라 합산이다.
        Map<Long, List<OrderItem>> itemsByTeam = new LinkedHashMap<>();
        Map<Long, Team> teamsById = new LinkedHashMap<>();
        Map<Long, Integer> quantityByType = new LinkedHashMap<>();
        long expectedTotal = 0;
        int totalQuantity = 0;
        for (OrderItemInput input : inputs) {
            TicketType type = ticketTypeRepository.findById(input.ticketTypeId())
                    .filter(t -> t.getPerformance().getPerformanceId()
                            .equals(performance.getPerformanceId()))
                    .orElseThrow(() -> BusinessException.of(ErrorCode.TICKET_OPTION_NOT_FOUND));
            if (input.quantity() < 1
                    || input.quantity() > PerformanceService.PURCHASE_LIMIT_PER_MEMBER) {
                throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
            }
            Team team = resolveChosenTeam(performance, input.chosenTeamId());
            teamsById.putIfAbsent(team.getTeamId(), team);
            quantityByType.merge(type.getTicketTypeId(), input.quantity(), Integer::sum);
            expectedTotal += type.getPrice() * input.quantity();
            totalQuantity += input.quantity();
            itemsByTeam.computeIfAbsent(team.getTeamId(), k -> new ArrayList<>())
                    .add(OrderItem.builder()
                            .ticketType(type)
                            .quantity(input.quantity())
                            .unitPrice(type.getPrice())
                            .build());
        }

        // 계약 문서 §4.1 — 한 번의 purchase 가 실을 수 있는 표 수 상한. (v6.2) 그룹 합산이다.
        // 코드는 같고 문구만 두 사유로 나눈다 — "한 번에 너무 많이"와 "이미 가진·대기 중인 표와
        // 합쳐 넘었다"는 사용자가 할 일이 다르다(후자는 대기 주문이 만료되면 다시 살 수 있다).
        if (totalQuantity > ContractCalls.MAX_QUANTITY_PER_ORDER) {
            throw BusinessException.of(ErrorCode.TICKET_PURCHASE_LIMIT_EXCEEDED,
                    "한 번에 최대 " + ContractCalls.MAX_QUANTITY_PER_ORDER
                            + "매까지 주문할 수 있습니다.");
        }
        // 결제 대기·완료만 센다. 대기 중이라도 시한이 지난 것은 뺀다(스윕 전 만료분).
        long already = ticketOrderRepository.sumQuantity(member.getMemberId(),
                performance.getPerformanceId(), TicketOrder.Status.PAID,
                TicketOrder.Status.PENDING_PAYMENT, TimeSupport.nowStored());
        if (already + totalQuantity > PerformanceService.PURCHASE_LIMIT_PER_MEMBER) {
            throw BusinessException.of(ErrorCode.TICKET_PURCHASE_LIMIT_EXCEEDED,
                    "1인당 최대 " + PerformanceService.PURCHASE_LIMIT_PER_MEMBER
                            + "매까지 구매할 수 있습니다(결제 완료·결제 대기 " + already
                            + "매 포함).");
        }

        // 클라이언트 계산 금액을 신뢰하지 않는다 — 다르면 위조 시도로 보고 로그를 남긴다.
        if (request.totalAmount() == null || request.totalAmount() != expectedTotal) {
            throw BusinessException.of(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }

        // 재고는 그룹 전체를 한 번에 차감한다 — 하위 주문마다 부르면 두 번째가 실패했을 때
        // 첫 번째 몫이 빠진 채 남는다(명세 "하나라도 실패하면 그룹 전체를 원복").
        if (!ticketStock.reserve(performance.getPerformanceId(), quantityByType)) {
            throw BusinessException.of(ErrorCode.TICKET_SOLD_OUT);
        }
        // 재고는 Redis라 DB 트랜잭션 밖이다. 여기서부터 아래가 실패하면 DB는 되돌아가지만 재고는
        // 빠진 채 남아 표가 영구히 잠긴다 — 롤백을 구독해 되돌린다. 두 경로(예외·커밋 실패)가
        // 겹쳐도 두 번 돌지 않게 once 로 감싼다(두 번 돌면 없던 표가 생긴다).
        Runnable releaseStock = TxCallbacks.once(
                () -> ticketStock.release(performance.getPerformanceId(), quantityByType));
        TxCallbacks.afterRollback(releaseStock);

        try {
            LocalDateTime expiresAt = TimeSupport.nowStored().plus(paymentTimeout);
            List<TicketOrder> group = new ArrayList<>();
            Long groupId = null;
            for (Map.Entry<Long, List<OrderItem>> entry : itemsByTeam.entrySet()) {
                List<OrderItem> items = entry.getValue();
                TicketOrder order = TicketOrder.builder()
                        .performance(performance)
                        .member(member)
                        // 대표(첫 하위 주문)는 자기 PK 를 아직 모른다 — 저장 직후 채운다.
                        .orderGroupId(groupId)
                        .orderRef(temporaryOrderRef())
                        .totalAmount(items.stream().mapToLong(OrderItem::getSubtotal).sum())
                        .totalQuantity(items.stream().mapToInt(OrderItem::getQuantity).sum())
                        .selectedTeam(teamsById.get(entry.getKey()))
                        .paymentExpiresAt(expiresAt)
                        .build();
                items.forEach(order::addItem);
                TicketOrder saved = ticketOrderRepository.saveAndFlush(order);
                // order_ref = keccak256(orderId) — PK가 나온 뒤에야 계산할 수 있다(§6 도입부).
                saved.assignOrderRef(RulesHash.orderRef(saved.getTicketOrderId()));
                if (groupId == null) {
                    groupId = saved.getTicketOrderId();
                    saved.assignOrderGroup(groupId);
                }
                group.add(saved);
            }
            Long representativeId = groupId;

            // 멱등 완료는 커밋 이후다 — 커밋 전에 적으면 아직 보이지 않는 orderId 를 다른 요청이
            // 재생해 404 를 받는다. 커밋 시점에 나는 실패도 롤백 구독으로 되돌린다.
            TxCallbacks.afterCommit(
                    () -> idempotencyStore.complete(reservation, representativeId));
            TxCallbacks.afterRollback(() -> idempotencyStore.release(reservation));
            return toCreateResponse(group, member);
        } catch (RuntimeException e) {
            // 트랜잭션이 없는 경로에서는 위 afterRollback 등록이 무시되므로 여기서 직접 되돌린다.
            releaseStock.run();
            throw e;
        }
    }

    private CreateOrderResponse toCreateResponse(List<TicketOrder> group, Member member) {
        TicketOrder representative = group.get(0);
        long totalAmount = group.stream().mapToLong(TicketOrder::getTotalAmount).sum();
        int totalQuantity = group.stream().mapToInt(TicketOrder::getTotalQuantity).sum();
        Wallet wallet = performanceService.requireWallet(member.getMemberId());
        Optional<WalletBalanceService.Balance> balance = walletBalanceService.find(wallet);
        long walletBalance = balance.map(WalletBalanceService.Balance::amount).orElse(0L);
        Money money = displayRateService.money(totalAmount, member.getDisplayCurrency(),
                member.getTimezone());

        return new CreateOrderResponse(
                representative.groupId(),
                representative.groupId(),
                representative.getPerformance().getPerformanceId(),
                representative.getPerformance().getTitle(),
                representative.getStatus().name(),
                group.stream().map(this::toSubOrder).toList(),
                totalAmount,
                totalQuantity,
                Money.BASE_CURRENCY,
                money.display(),
                walletBalance,
                Math.max(0L, totalAmount - walletBalance),
                balance.map(WalletBalanceService.Balance::stale).orElse(true),
                TimeSupport.toOffset(representative.getPaymentExpiresAt(), member.getTimezone()));
    }

    private SubOrder toSubOrder(TicketOrder order) {
        return new SubOrder(
                order.getTicketOrderId(),
                order.getOrderRef(),
                order.getSelectedTeam() == null ? null : order.getSelectedTeam().getTeamId(),
                order.getSelectedTeam() == null ? null : order.getSelectedTeam().getName(),
                teamIndexOf(order),
                itemsOf(order),
                order.getTotalQuantity(),
                order.getTotalAmount());
    }

    // ================================================================ API-ticket-02

    /**
     * API-ticket-02 내 주문 목록 — <b>주문 그룹 단위</b>. 만료분은 조회 시점에 {@code CANCELLED}로
     * 정리해 노출한다.
     *
     * <p><b>페이징을 메모리에서 한다.</b> {@code groupStatus}는 저장하지 않고 하위 주문에서
     * 파생하므로(§5-1) DB {@code WHERE}·{@code LIMIT}로 걸 수 없다. 한 회원의 주문 이력은
     * 수십 건 규모라 전부 읽어 묶는다.
     * ponytail: 회원 전건 로드. 이력이 수천 건이 되면 대표 행(order_group_id = ticket_order_id)
     * 페이징 + 상태 필터 비적용 경로로 나눈다.
     */
    @Transactional
    public OrderListResponse myOrders(MemberPrincipal me, String status, Pageable pageable) {
        Member member = performanceService.requireMember(me);
        String filter = parseGroupStatus(status);
        PageRequest request = Paging.of(pageable, ORDER_SORT,
                Sort.by(Sort.Direction.DESC, "createdAt"));

        List<TicketOrder> orders = ticketOrderRepository
                .findByMember_MemberId(member.getMemberId(), request.getSort());
        orders.forEach(this::expireIfNeeded);

        Map<Long, List<TicketOrder>> groups = orders.stream()
                .collect(Collectors.groupingBy(TicketOrder::groupId, LinkedHashMap::new,
                        Collectors.toList()));
        List<List<TicketOrder>> matched = groups.values().stream()
                .filter(group -> filter == null || filter.equals(groupStatus(group)))
                .toList();

        int from = Math.min((int) request.getOffset(), matched.size());
        int to = Math.min(from + request.getPageSize(), matched.size());
        List<List<TicketOrder>> pageGroups = matched.subList(from, to);

        Map<Long, Payment> payments = paymentsOf(pageGroups.stream().flatMap(List::stream)
                .map(TicketOrder::getTicketOrderId).toList());
        List<OrderListItem> items = pageGroups.stream()
                .map(group -> toListItem(group, payments, member))
                .toList();
        return new OrderListResponse(
                displayRateService.listRate(member.getDisplayCurrency(), member.getTimezone()),
                items,
                PageInfo.from(new PageImpl<>(items, request, matched.size())));
    }

    private OrderListItem toListItem(List<TicketOrder> group, Map<Long, Payment> payments,
                                      Member member) {
        TicketOrder representative = group.get(0);
        Map<Long, TeamBreakdown> breakdown = new LinkedHashMap<>();
        for (TicketOrder order : group) {
            Team team = order.getSelectedTeam();
            breakdown.merge(team == null ? 0L : team.getTeamId(),
                    new TeamBreakdown(team == null ? null : team.getTeamId(),
                            team == null ? null : team.getName(),
                            order.getTotalQuantity(), order.getTotalAmount()),
                    (a, b) -> new TeamBreakdown(a.teamId(), a.teamName(),
                            a.quantity() + b.quantity(), a.amount() + b.amount()));
        }
        boolean resumable = group.stream().anyMatch(order -> isResumable(order,
                Optional.ofNullable(payments.get(order.getTicketOrderId()))));
        // 남은 시간은 아직 결제할 수 있는 하위 주문에만 뜻이 있다. 전부 끝난 그룹에 지나간 만료
        // 시각을 실어 보내면 화면이 "만료됨"으로 읽는다.
        LocalDateTime expiresAt = group.stream()
                .filter(TicketOrder::isPendingPayment)
                .map(TicketOrder::getPaymentExpiresAt)
                .findFirst().orElse(null);

        return new OrderListItem(
                representative.groupId(),
                representative.getPerformance().getPerformanceId(),
                representative.getPerformance().getTitle(),
                TimeSupport.toOffset(representative.getPerformance().getPerformanceAt(),
                        member.getTimezone()),
                groupStatus(group),
                List.copyOf(breakdown.values()),
                group.stream().mapToLong(TicketOrder::getTotalAmount).sum(),
                Money.BASE_CURRENCY,
                group.stream().mapToInt(TicketOrder::getTotalQuantity).sum(),
                resumable,
                TimeSupport.toOffset(representative.getCreatedAt(), member.getTimezone()),
                TimeSupport.toOffset(expiresAt, member.getTimezone()));
    }

    // ================================================================ API-ticket-03

    /**
     * API-ticket-03 주문 상세. 주문자 본인만 볼 수 있다. <b>(v6.2)</b> 경로의 {@code orderId}는
     * 그룹의 어느 하위 주문이든 되고 응답은 언제나 그룹 전체다.
     *
     * <p><b>남의 주문은 {@code COMMON_NOT_FOUND}(404)다</b> — 403이면 "그 번호의 주문은 있다"를
     * 알려 주는 셈이라 주문 id를 훑어 존재 여부를 캘 수 있다(명세 요구사항 "타인 주문은
     * {@code COMMON_NOT_FOUND}로 존재를 숨긴다" · 4xx 표에도 404만 있다). API-payment-01·02·03의
     * {@code requireOwnedOrder}가 이미 404라, 여기만 403이면 같은 주문에 API마다 다른 코드가
     * 나간다.
     */
    @Transactional
    public OrderDetailResponse orderDetail(MemberPrincipal me, Long orderId) {
        Member member = performanceService.requireMember(me);
        TicketOrder order = requireOrder(orderId);
        if (!order.isOwnedBy(member.getMemberId())) {
            throw BusinessException.of(ErrorCode.COMMON_NOT_FOUND);
        }
        List<TicketOrder> group = groupOf(order);
        group.forEach(this::expireIfNeeded);

        Map<Long, Payment> payments = paymentsOf(
                group.stream().map(TicketOrder::getTicketOrderId).toList());
        TicketOrder representative = group.get(0);
        long totalAmount = group.stream().mapToLong(TicketOrder::getTotalAmount).sum();
        Money money = displayRateService.money(totalAmount, member.getDisplayCurrency(),
                member.getTimezone());

        List<SubOrderDetail> orders = group.stream().map(sub -> new SubOrderDetail(
                sub.getTicketOrderId(),
                sub.getOrderRef(),
                sub.getStatus().name(),
                sub.getSelectedTeam() == null ? null : sub.getSelectedTeam().getTeamId(),
                sub.getSelectedTeam() == null ? null : sub.getSelectedTeam().getName(),
                itemsOf(sub),
                sub.getTotalAmount(),
                Optional.ofNullable(payments.get(sub.getTicketOrderId()))
                        .map(p -> new PaymentBlock(p.getPaymentId(), p.getStatus().name(),
                                // approveTxHash 는 payment 에 컬럼이 없다(ERD v5). 스키마를 늘리지
                                // 않고 approve_chain_job_id -> chain_job.tx_hash 로 파생한다.
                                approveTxHash(p), p.getPurchaseTxHash(),
                                TimeSupport.toOffset(p.getPaidAt(), member.getTimezone())))
                        .orElse(null),
                ticketRepository.findByTicketOrder_TicketOrderId(sub.getTicketOrderId()).stream()
                        .map(t -> new IssuedTicket(t.getTicketId(), t.getTicketType().getName(),
                                t.getStatus().name()))
                        .toList())).toList();

        return new OrderDetailResponse(
                representative.groupId(),
                groupStatus(group),
                representative.getPerformance().getPerformanceId(),
                representative.getPerformance().getTitle(),
                representative.getPerformance().getVenueName(),
                TimeSupport.toOffset(representative.getPerformance().getPerformanceAt(),
                        member.getTimezone()),
                orders,
                totalAmount,
                Money.BASE_CURRENCY,
                money.display());
    }

    // ================================================================ 주문 그룹

    /**
     * 주문 그룹의 하위 주문 전부(대표 먼저, id 오름차순).
     *
     * <p>V10 이전에 만들어진 주문은 {@code order_group_id}가 마이그레이션으로 자기 자신을
     * 가리키지만, 만에 하나 비어 있어도 "그룹 크기 1"로 읽는다.
     */
    public List<TicketOrder> groupOf(TicketOrder order) {
        List<TicketOrder> group = ticketOrderRepository
                .findByOrderGroupIdOrderByTicketOrderIdAsc(order.groupId());
        return group.isEmpty() ? List.of(order) : group;
    }

    /**
     * {@code groupStatus} — <b>저장하지 않고 하위 주문 상태에서 파생</b>한다(요구사항 §5-1).
     *
     * <p>값은 5종뿐이다. {@code AWAITING_SIGNATURE}·{@code FAILED}는 <b>payment 상태</b>라
     * 그룹 상태로 올라오지 않고 {@code payments[].paymentStatus}로만 나간다.
     */
    public static String groupStatus(List<TicketOrder> group) {
        long paid = count(group, TicketOrder.Status.PAID);
        long refunded = count(group, TicketOrder.Status.REFUNDED);
        long pending = count(group, TicketOrder.Status.PENDING_PAYMENT);
        long settled = paid + refunded;
        if (settled == group.size()) {
            // 환불이 섞이면 PAID 에 준한다 — 표 단위 환불은 티켓 상태로 구분한다(§5-1).
            return refunded == group.size() ? "REFUNDED" : "PAID";
        }
        if (settled > 0) {
            // 일부 PAID + 나머지가 PENDING_PAYMENT 이거나 CANCELLED — 둘 다 부분 결제다.
            return "PARTIALLY_PAID";
        }
        return pending > 0 ? "PENDING_PAYMENT" : "CANCELLED";
    }

    private static long count(List<TicketOrder> group, TicketOrder.Status status) {
        return group.stream().filter(order -> order.getStatus() == status).count();
    }

    private Map<Long, Payment> paymentsOf(List<Long> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        return paymentRepository.findByTicketOrder_TicketOrderIdIn(orderIds).stream()
                .collect(Collectors.toMap(p -> p.getTicketOrder().getTicketOrderId(),
                        Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    // ================================================================ 공용

    /**
     * API-ticket-03 {@code payment.approveTxHash} — {@code payment}에 컬럼이 없어
     * {@code approve_chain_job_id}가 가리키는 {@code chain_job.tx_hash}로 파생한다.
     *
     * <p>아직 전송 전({@code PENDING})이면 {@code tx_hash}가 비어 있고 필드는 응답에서 빠진다.
     * {@code APPROVE}를 건너뛴 결제(allowance 충분)는 job 자체가 없다.
     */
    private String approveTxHash(Payment payment) {
        Long approveJobId = payment.getApproveChainJobId();
        if (approveJobId == null) {
            return null;
        }
        return chainJobRepository.findById(approveJobId).map(ChainJob::getTxHash).orElse(null);
    }

    public TicketOrder requireOrder(Long orderId) {
        return ticketOrderRepository.findById(orderId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));
    }

    /** 온체인 {@code purchase}의 {@code teamIndex}. 판매 시작 시 확정된 값이다. */
    public Integer teamIndexOf(TicketOrder order) {
        if (order.getSelectedTeam() == null) {
            return null;
        }
        return performanceService.acceptedParticipants(order.getPerformance().getPerformanceId())
                .stream()
                .filter(p -> p.getTeam().getTeamId().equals(order.getSelectedTeam().getTeamId()))
                .map(PerformanceParticipant::getOnChainIndex)
                .findFirst().orElse(null);
    }

    /**
     * 만료된 주문은 조회 시점에 정리하고 재고를 되돌린다.
     *
     * <p>이 경로는 <b>즉시성</b>을 담당한다 — 만료된 주문을 화면에서 보는 순간 정리된다. 아무도
     * 열지 않는 주문은 {@link #expireOrder} 배치가 줍는다.
     *
     * <p><b>취소 전이는 조건부 UPDATE 하나로 한다.</b> 조회 경로와 배치가, 또 여러 인스턴스가
     * 같은 주문을 동시에 만료시키면 재고가 두 번 돌아가 <b>없던 표가 생긴다</b>. DB가
     * {@code PENDING_PAYMENT → CANCELLED} 전이를 딱 한 번만 성공시키게 하고, 이긴 쪽만 재고를
     * 되돌린다.
     *
     * <p><b>만료는 그 주문의 결제도 닫는다.</b> 결제를 시작만 하고 서명하지 않은 건은
     * {@code AWAITING_SIGNATURE}로 남는데, 정산 집계 게이트가 그것을 "곧 확정될 결제"로 읽어
     * 그 공연의 집계를 영구히 막았다(D-83 — 9/22 dev 공연 46). 주문이 취소된 뒤에는 그 결제가
     * 성립할 수 없으므로 여기서 {@code FAILED}로 끝낸다. {@code PAYING}은 <b>건드리지 않는다</b> —
     * 대납 전송이 이미 나갔고 결과는 {@code ChainJobConfirmationService}가 쓴다(늦은 receipt가
     * {@code PAID}로 확정되는 경로가 살아 있어야 환불 책임이 장부에 남는다).
     *
     * @return 이번 호출이 만료를 확정했으면 {@code true}
     */
    @Transactional
    public boolean expireIfNeeded(TicketOrder order) {
        if (!order.isPaymentExpired(TimeSupport.nowStored())) {
            return false;
        }
        if (ticketOrderRepository.cancelIfPending(order.getTicketOrderId(),
                TicketOrder.Status.PENDING_PAYMENT, TicketOrder.Status.CANCELLED) != 1) {
            // 다른 인스턴스·배치가 먼저 처리했거나 그 사이 PAID 가 됐다. 재고를 두 번 되돌리지
            // 않고 엔티티도 건드리지 않는다 — 여기서 CANCELLED 를 덮으면 PAID 를 지울 수 있다.
            return false;
        }
        order.cancel();
        closeUnsignedPayment(order);
        Map<Long, Integer> quantities = new LinkedHashMap<>();
        order.getItems().forEach(i -> quantities.merge(i.getTicketType().getTicketTypeId(),
                i.getQuantity(), Integer::sum));
        // 재고 반납은 커밋 이후다. 커밋 전에 되돌렸다가 롤백되면 팔 수 없는 표가 판매된다.
        TxCallbacks.afterCommit(
                () -> ticketStock.release(order.getPerformance().getPerformanceId(), quantities));
        return true;
    }

    /**
     * 만료가 확정된 주문의 <b>미서명 결제</b>를 실패로 닫는다(D-83).
     *
     * <p>{@code failure_code}는 규격 §3의 기존 code 문자열만 쓴다 — 결제 만료 전용 코드
     * ({@code TICKET_ORDER_EXPIRED})는 요구사항 §12 신설 <b>제안</b>일 뿐 {@code ErrorCode}에
     * 없고, 여기서 새로 만들지 않는다. 주문이 취소로 끝났다는 사실을 가리키는 가장 가까운 기존
     * 코드가 {@code TICKET_CANCELED}다(API는 이 상황에 {@code COMMON_CONFLICT}로 응답하지만,
     * 그 코드는 사유를 남기지 못해 운영 조회에 쓸 수 없다).
     *
     * <p><b>만료분 집계는 {@code payment.status = FAILED} + 주문 {@code CANCELLED} 조합으로
     * 조회한다</b>(전용 코드 신설 전) — {@code failure_code}만으로는 개별 취소·환불로 닫힌
     * 결제와 구분되지 않는다.
     */
    private void closeUnsignedPayment(TicketOrder order) {
        paymentRepository.findByTicketOrder_TicketOrderId(order.getTicketOrderId())
                .filter(payment -> payment.getStatus() == Payment.Status.REQUESTED
                        || payment.getStatus() == Payment.Status.AWAITING_SIGNATURE)
                .ifPresent(payment -> payment.markFailed(ErrorCode.TICKET_CANCELED.getCode()));
    }

    // ================================================================ 만료 스윕(배치)

    /**
     * 만료 스윕 대상 — 결제 시한이 지난 {@code PENDING_PAYMENT} 주문 id.
     *
     * <p>{@link #expireIfNeeded}는 <b>조회 시점 lazy</b>라 아무도 그 주문을 열지 않으면 재고가
     * 영영 돌아오지 않는다. 커밋 직후 프로세스가 죽어 롤백 구독도 돌지 못한 경우까지 포함해,
     * 이 배치가 마지막 안전망이다.
     */
    public List<Long> findExpiredOrderIds(int limit) {
        return ticketOrderRepository.findExpiredIds(TicketOrder.Status.PENDING_PAYMENT,
                TimeSupport.nowStored(), PageRequest.of(0, limit));
    }

    /**
     * 만료 주문 한 건 = 트랜잭션 한 개. 한 건이 실패해도 나머지가 함께 죽지 않는다.
     *
     * @return 이번 호출이 만료를 확정했으면 {@code true}
     */
    @Transactional
    public boolean expireOrder(Long orderId) {
        return ticketOrderRepository.findById(orderId).map(this::expireIfNeeded).orElse(false);
    }

    /**
     * <b>곧 4xx로 끝날 요청</b>이 부르는 만료 처리 — 새 트랜잭션에서 커밋한다.
     *
     * <p>{@link #expireIfNeeded}를 호출자의 트랜잭션에서 부르면, 호출자가 바로 예외를 던져
     * 409로 끝날 때 그 트랜잭션이 롤백돼 <b>주문 취소·결제 실패·재고 반납이 전부 사라진다</b>.
     * 만료는 요청의 성패와 무관한 사실이라 따로 커밋해야 한다. 재고 반납도 이 트랜잭션의
     * 커밋 뒤에 돈다({@link com.ssafy.b204.common.support.TxCallbacks#afterCommit}이 현재
     * 트랜잭션에 매달리므로).
     *
     * <p><b>데드락이 되지 않는 전제</b>: 호출자가 그 주문 행에 비관적 락을 잡고 있지 않아야 한다.
     * 지금 부르는 {@code PaymentService.startPayment} 경로는 {@code findById}로 잠금 없이 읽고
     * 이 지점까지 {@code ticket_order}에 쓰지 않는다. {@code FOR UPDATE}를 잡는 호출자가
     * 생기면 자기 락에 막히므로 이 메서드를 쓰지 말고 {@link #expireIfNeeded}를 그대로 쓰거나
     * 배치({@link OrderExpiryScheduler})에 맡긴다.
     *
     * @return 이번 호출이 만료를 확정했으면 {@code true}
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean expireOrderNow(Long orderId) {
        // 자기 호출이라 expireOrder 의 @Transactional 은 무시되지만 여기가 이미 새 트랜잭션이다.
        return expireOrder(orderId);
    }

    private List<OrderItemSummary> itemsOf(TicketOrder order) {
        return order.getItems().stream()
                .map(i -> new OrderItemSummary(i.getTicketType().getTicketTypeId(),
                        i.getTicketType().getName(), i.getUnitPrice(), i.getQuantity(),
                        i.getSubtotal()))
                .toList();
    }

    private static boolean isResumable(TicketOrder order, Optional<Payment> payment) {
        return order.getStatus() == TicketOrder.Status.PENDING_PAYMENT
                && payment.map(p -> p.getStatus() == Payment.Status.AWAITING_SIGNATURE)
                .orElse(true);
    }

    /**
     * 행마다 응원 팀을 정한다 — 정산 집계의 입력이라 공동 공연에서는 <b>필수</b>다.
     *
     * <p><b>(v6.2)</b> 단독 공연은 생략할 수 있고 서버가 공연 생성팀으로 채운다. 하위 주문은
     * 언제나 팀 하나를 가리킨다.
     */
    private Team resolveChosenTeam(Performance performance, Long chosenTeamId) {
        if (chosenTeamId == null) {
            if (performance.isJoint()) {
                throw BusinessException.of(ErrorCode.TICKET_TEAM_CHOICE_REQUIRED);
            }
            return performance.getCreatorTeam();
        }
        return performanceService.acceptedParticipants(performance.getPerformanceId()).stream()
                .map(PerformanceParticipant::getTeam)
                .filter(t -> t.getTeamId().equals(chosenTeamId))
                .findFirst()
                .orElseThrow(() -> BusinessException.of(ErrorCode.TICKET_TEAM_CHOICE_INVALID));
    }

    private void requireOnSale(Performance performance) {
        switch (performance.getStatus()) {
            case DRAFT, PENDING_AGREEMENT ->
                    throw BusinessException.of(ErrorCode.TICKET_SALE_NOT_STARTED);
            case SALE_CLOSED, ENDED, CANCELLED ->
                    throw BusinessException.of(ErrorCode.TICKET_SALE_CLOSED);
            default -> { }
        }
        if (performance.getSaleCloseAt() != null
                && performance.getSaleCloseAt().isBefore(TimeSupport.nowStored())) {
            throw BusinessException.of(ErrorCode.TICKET_SALE_CLOSED);
        }
    }

    /**
     * {@code order_ref}가 NOT NULL·UNIQUE 라 저장 시점에는 값이 있어야 한다. PK가 나온 뒤
     * 곧바로 {@code keccak256(orderId)}로 덮으므로 이 값은 같은 트랜잭션 안에서만 존재한다.
     */
    private static String temporaryOrderRef() {
        return "0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * API-ticket-02 {@code status} 필터. 허용값은 <b>파생 그룹 상태 5종</b>이라
     * {@code TicketOrder.Status.valueOf}로 파싱하면 {@code PARTIALLY_PAID}가 400이 된다.
     */
    private static String parseGroupStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        if (!GROUP_STATUSES.contains(status)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        return status;
    }
}
