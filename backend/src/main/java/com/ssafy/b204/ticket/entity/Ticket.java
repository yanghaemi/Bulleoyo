package com.ssafy.b204.ticket.entity;

import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.TicketType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * 티켓 — ERD v5 {@code ticket}.
 *
 * <p><b>v6에서 크게 단순해졌다.</b> 양도(선물) 기능이 설계에서 삭제되면서(결정 v2 §14-34):
 *
 * <ul>
 *   <li>소유 컬럼이 {@code owner_member_id} + {@code buyer_member_id} → <b>{@code member_id}
 *       단일</b>이 됐다. 구매자와 소유자가 달라질 경로가 없어졌다.
 *   <li>상태가 <b>3값</b>({@code ISSUED}/{@code USED}/{@code CANCELLED})이다. 양도중·양도완료가
 *       사라졌다.
 *   <li>{@code qr_secret}이 <b>발급 시 1회만</b> 생성된다. 양도 시 QR을 폐기·재발급하던 경로가
 *       없어졌기 때문이다.
 *   <li>{@code original_price} → {@code purchase_price}로 개명. 환불액 산정 기준 스냅샷이다.
 * </ul>
 *
 * <p>소유권은 <b>DB 기준</b>이다(온체인 NFT는 확장 기능). 소유자가 아니면
 * {@code TICKET_NOT_OWNED}(403).
 *
 * <p>{@code qr_secret}은 동적 QR(TOTP)의 서명 키다. 유효 구간은 60초이고 중복 입장은 Redis
 * {@code entry:{ticketId}} SETNX로 막는다 — DB 상태만 보면 동시 스캔 2건이 둘 다 통과할 수 있다.
 */
@Entity
@Table(name = "ticket")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Ticket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ticket_id")
    private Long ticketId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_order_id", nullable = false)
    private TicketOrder ticketOrder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_type_id", nullable = false)
    private TicketType ticketType;

    /** 공연을 비정규화해 들고 있다 — 내 티켓 목록·입장 현황이 주문을 거치지 않고 조회된다. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "performance_id", nullable = false)
    private Performance performance;

    /** 소유자 = 구매자. v6에서 단일 컬럼이 됐다. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    /** 환불액 산정 기준(발급 시점 가격 스냅샷). */
    @Column(name = "purchase_price", nullable = false)
    private Long purchasePrice;

    @Column(name = "on_chain_ticket_id")
    private Long onChainTicketId;

    /** 선택 기록 {@code purchase} tx 해시. 온체인 집계와 대조할 근거다. */
    @Column(name = "choice_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String choiceTxHash;

    @CreationTimestamp
    @Column(name = "issued_at", nullable = false, updatable = false)
    private LocalDateTime issuedAt;

    @Column(name = "status_changed_at")
    private LocalDateTime statusChangedAt;

    /** 입장 판정 결과. 04 §4 actor 코드 확정 전까지 VARCHAR로 남는 컬럼과 같은 취급이다. */
    @Column(name = "entry_result", length = 30)
    private String entryResult;

    @Column(name = "entered_at")
    private LocalDateTime enteredAt;

    /** 동적 QR(TOTP) 서명 키. 발급 시 1회 생성되고 재생성 경로가 없다. */
    @Column(name = "qr_secret", nullable = false, length = 512)
    private String qrSecret;

    @Builder
    private Ticket(TicketOrder ticketOrder, TicketType ticketType, Performance performance,
                   Member member, Long purchasePrice, String qrSecret) {
        this.ticketOrder = ticketOrder;
        this.ticketType = ticketType;
        this.performance = performance;
        this.member = member;
        this.purchasePrice = purchasePrice;
        this.qrSecret = qrSecret;
        this.status = Status.ISSUED;
    }

    /**
     * 입장 처리. Redis SETNX를 통과한 뒤에만 호출한다.
     *
     * <p>시각은 <b>저장 기준 시각대</b>({@code hibernate.jdbc.time_zone = Asia/Seoul})로 찍는다 —
     * {@link TimeSupport#nowStored()}가 그 규약이다. {@code LocalDateTime.now()}는 JVM 기본
     * 시각대라 UTC 서버(EC2 기본값)에서 9시간 어긋나고, 응답 변환
     * ({@link TimeSupport#toOffset})이 저장값을 KST로 해석하므로 그 어긋남이 그대로
     * {@code enteredAt}에 나간다.
     */
    public void markUsed(String entryResult) {
        this.status = Status.USED;
        this.entryResult = entryResult;
        this.enteredAt = TimeSupport.nowStored();
        this.statusChangedAt = this.enteredAt;
    }

    public void markCancelled() {
        this.status = Status.CANCELLED;
        this.statusChangedAt = TimeSupport.nowStored();
    }

    public void recordOnChain(Long onChainTicketId, String choiceTxHash) {
        this.onChainTicketId = onChainTicketId;
        this.choiceTxHash = choiceTxHash;
    }

    public boolean isOwnedBy(Long memberId) {
        return member != null && member.getMemberId().equals(memberId);
    }

    /** 입장 가능한 상태인지(상태만 본다 — 시간대·중복은 별도 검사). */
    public boolean isEnterable() {
        return status == Status.ISSUED;
    }

    /** 티켓 상태 3값. 양도 관련 값은 v6에서 삭제됐다. */
    public enum Status {
        ISSUED, USED, CANCELLED
    }
}
