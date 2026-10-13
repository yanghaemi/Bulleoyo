package com.ssafy.b204.ticket.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.payment.entity.Payment;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 상태 전이 가드 — <b>늦게 온 receipt가 확정 상태를 덮지 못하게</b> 하는 마지막 방어선.
 *
 * <p>{@code markPaid}에 가드가 없으면 15분 만료로 {@code CANCELLED}되고 재고까지 회수된 주문이
 * 뒤늦은 {@code Purchased} receipt 하나로 {@code PAID}가 되고 티켓이 초과 발급된다. 서비스 쪽
 * 분기({@code ChainJobConfirmationService.confirmPurchase})가 실수로 빠져도 여기서 막힌다.
 */
class OrderStateTransitionTest {

    @Test
    @DisplayName("주문 결제 확정은 PENDING_PAYMENT 에서만 된다 — 취소된 주문은 PAID 로 덮이지 않는다")
    void orderMarkPaidOnlyFromPendingPayment() {
        TicketOrder cancelled = newOrder();
        cancelled.cancel();

        assertThatThrownBy(cancelled::markPaid).isInstanceOf(IllegalStateException.class);
        assertThat(cancelled.getStatus()).isEqualTo(TicketOrder.Status.CANCELLED);
        assertThat(cancelled.getConfirmedAt()).isNull();
    }

    @Test
    @DisplayName("같은 주문을 두 번 확정할 수 없다 — 두 번째 receipt 가 티켓을 또 만들지 못한다")
    void orderMarkPaidIsNotRepeatable() {
        TicketOrder order = newOrder();
        order.markPaid();
        assertThat(order.getStatus()).isEqualTo(TicketOrder.Status.PAID);

        assertThatThrownBy(order::markPaid).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("결제 확정은 결제 전 상태에서만 된다 — 환불된 결제가 PAID 로 되살아나지 않는다")
    void paymentMarkPaidGuardsTerminalStates() {
        Payment paying = newPayment();
        paying.markPaying();
        assertThatCode(() -> paying.markPaid("0x01")).doesNotThrowAnyException();
        assertThat(paying.getStatus()).isEqualTo(Payment.Status.PAID);
        // 이미 PAID 인 건에 다시 쓰면 최초 결제 tx 해시를 잃는다.
        assertThatThrownBy(() -> paying.markPaid("0x02")).isInstanceOf(IllegalStateException.class);
        assertThat(paying.getPurchaseTxHash()).isEqualTo("0x01");

        Payment refunded = newPayment();
        refunded.markRefunded();
        assertThatThrownBy(() -> refunded.markPaid("0x03"))
                .isInstanceOf(IllegalStateException.class);
        assertThat(refunded.getStatus()).isEqualTo(Payment.Status.REFUNDED);
    }

    private static TicketOrder newOrder() {
        return TicketOrder.builder()
                .orderRef("0x" + "1".repeat(64))
                .totalAmount(25_000L)
                .totalQuantity(1)
                .paymentExpiresAt(LocalDateTime.now().plusMinutes(15))
                .build();
    }

    private static Payment newPayment() {
        return Payment.builder()
                .amount(25_000L)
                .idempotencyKey("test-key")
                .build();
    }
}
