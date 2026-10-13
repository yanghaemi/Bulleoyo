package com.ssafy.b204.performance.entity;

import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.entity.BaseTimeEntity;
import com.ssafy.b204.team.entity.Team;
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

/**
 * 공연 — ERD v5 {@code performance}.
 *
 * <p>테이블명이 {@code show}가 아니라 {@code performance}인 이유는 {@code show}가 MySQL
 * 예약어이기 때문이다(컨벤션 §4). 코드·API·문서에서 같은 용어를 쓴다 — 규격 v3에서
 * {@code SHOW_*} 에러 코드가 {@code PERFORMANCE_*}로 개명된 것도 같은 맥락이다.
 *
 * <p><b>보증금</b>({@code deposit_*}) — 공연 등록 시 리더가 YoYo로 납부한다. 사용자 지갑이
 * 서명하므로 서버가 대신 만들 수 없고, {@code prepare → 서명 → signed-tx} 3단계를 탄다
 * (API-performance-13·14 · §0.4). 정산 규칙 설정(API-rule-01)과 판매 시작(API-rule-04)의
 * <b>선행 조건</b>이다.
 *
 * <p>상태 전이 — {@code DRAFT} → {@code PENDING_AGREEMENT}(규칙 설정 후) →
 * {@code ON_SALE}({@code startSale} 잠금) → {@code SALE_CLOSED} → {@code ENDED}.
 * {@code CANCELLED}는 어디서든 갈 수 있고 일괄 환불을 유발한다(API-performance-12).
 */
@Entity
@Table(name = "performance")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Performance extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "performance_id")
    private Long performanceId;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * 포스터 경로 — {@code UPLOAD_DIR} 기준 <b>상대 경로</b>다({@code p/{yyyyMM}/{uuid}.jpg}).
     * 응답의 절대 URL은 {@code AppProperties#uploadUrl}이 조립한다.
     *
     * <p>업로드 이전에 만들어진 행에는 공연자가 직접 입력한 <b>외부 절대 URL</b>이 들어 있을 수
     * 있다(0층은 URL 입력이었다). 그 분기도 같은 메서드가 처리한다.
     */
    @Column(name = "poster_image_path", length = 500)
    private String posterImagePath;

    /** 티켓 아트워크 경로(V10). 발급 티켓 렌더의 배경이며 {@link #posterImagePath}와 같은 규칙이다. */
    @Column(name = "ticket_image_path", length = 500)
    private String ticketImagePath;

    @Column(name = "performance_at", nullable = false)
    private LocalDateTime performanceAt;

    /**
     * 공연 종료 일시(V6). ERD v5 에는 아직 없다 — <b>nullable</b>이며 V6 이전 행은 비어 있다.
     * 비었을 때의 응답 폴백은 {@code EntryWindows.closesAt}이다(API-performance-03).
     */
    @Column(name = "end_at")
    private LocalDateTime endAt;

    @Column(name = "entry_start_at")
    private LocalDateTime entryStartAt;

    @Column(name = "entry_end_at")
    private LocalDateTime entryEndAt;

    @Column(name = "venue_name", length = 200)
    private String venueName;

    @Column(name = "venue_address", length = 500)
    private String venueAddress;

    /** 생성 팀. 이 팀의 리더가 주최자이며 보증금 납부·판매 시작 권한을 가진다. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "creator_team_id", nullable = false)
    private Team creatorTeam;

    /** 공동 공연이면 관람 목적 팀 선택이 <b>필수</b>가 된다(정산 집계의 입력). */
    @Column(name = "is_joint", nullable = false)
    private boolean joint;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    @Column(name = "cancel_deadline_at")
    private LocalDateTime cancelDeadlineAt;

    @Column(name = "sale_close_at")
    private LocalDateTime saleCloseAt;

    /** {@code startSale} 확정 시각. 이 시각 이후 규칙·참여팀 변경 불가. */
    @Column(name = "sale_start_at")
    private LocalDateTime saleStartAt;

    /** 온체인 공연 식별자. {@code RevenueSplitter}가 부여한다. */
    @Column(name = "on_chain_id")
    private Long onChainId;

    @Column(name = "contract_address", length = 42, columnDefinition = "CHAR(42)")
    private String contractAddress;

    @Column(name = "deposit_amount", nullable = false)
    private Long depositAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "deposit_status", nullable = false)
    private DepositStatus depositStatus;

    /**
     * 보증금 납부 {@code chain_job} id. {@code chain} 패키지를 참조하지 않고 id만 둔다 —
     * {@code chain_job}이 {@code performance}를 역참조하고 있어 엔티티로 묶으면 순환이 된다.
     */
    @Column(name = "deposit_chain_job_id")
    private Long depositChainJobId;

    @Column(name = "deposit_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String depositTxHash;

    @Column(name = "deposit_return_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String depositReturnTxHash;

    @Column(name = "deposit_returned_at")
    private LocalDateTime depositReturnedAt;

    @Builder
    private Performance(String title, String description, String posterImagePath,
                        String ticketImagePath,
                        LocalDateTime performanceAt, LocalDateTime endAt,
                        LocalDateTime entryStartAt,
                        LocalDateTime entryEndAt, String venueName, String venueAddress,
                        Team creatorTeam, boolean joint, LocalDateTime cancelDeadlineAt,
                        LocalDateTime saleCloseAt, Long depositAmount) {
        this.title = title;
        this.description = description;
        this.posterImagePath = posterImagePath;
        this.ticketImagePath = ticketImagePath;
        this.performanceAt = performanceAt;
        this.endAt = endAt;
        this.entryStartAt = entryStartAt;
        this.entryEndAt = entryEndAt;
        this.venueName = venueName;
        this.venueAddress = venueAddress;
        this.creatorTeam = creatorTeam;
        this.joint = joint;
        this.cancelDeadlineAt = cancelDeadlineAt;
        this.saleCloseAt = saleCloseAt;
        this.depositAmount = depositAmount;
        this.status = Status.DRAFT;
        this.depositStatus = DepositStatus.UNPAID;
    }

    /** 규칙이 설정되면 {@code DRAFT} → {@code PENDING_AGREEMENT}(API-rule-01). */
    public void markPendingAgreement() {
        if (status == Status.DRAFT) {
            this.status = Status.PENDING_AGREEMENT;
        }
    }

    /**
     * 보증금 납부 확정 — {@code DepositPaid} receipt 검증까지 끝난 뒤에만 호출한다.
     * 정산 규칙 설정(API-rule-01)·판매 시작(API-rule-04)의 선행 조건이다(P-21).
     */
    public void markDepositPaid(Long depositChainJobId, String depositTxHash) {
        this.depositStatus = DepositStatus.PAID;
        this.depositChainJobId = depositChainJobId;
        this.depositTxHash = depositTxHash;
    }

    /**
     * {@code startSale} 확정 — 이 시점부터 예매를 받는다. 규칙·참여팀·티켓 옵션은 컨트랙트가
     * 잠갔으므로 서버도 더 이상 바꾸지 않는다.
     */
    public void markOnSale(LocalDateTime saleStartAt) {
        this.status = Status.ON_SALE;
        this.saleStartAt = saleStartAt;
    }

    /** {@code createShow} 대상 컨트랙트·온체인 식별자. {@code showId}는 이 공연의 PK다. */
    public void bindOnChain(String contractAddress, Long onChainId) {
        this.contractAddress = contractAddress;
        this.onChainId = onChainId;
    }

    /**
     * API-performance-04 부분 수정 — <b>{@code null}인 필드는 건드리지 않는다</b>(PATCH 규약).
     * 일시는 {@link #reschedule}가 따로 맡는다(취소·판매 마감 재계산이 함께 가야 한다).
     */
    public void edit(String title, String description, String posterImagePath,
                     String ticketImagePath, String venueName, String venueAddress) {
        if (title != null) {
            this.title = title;
        }
        if (description != null) {
            this.description = description;
        }
        if (posterImagePath != null) {
            this.posterImagePath = posterImagePath;
        }
        // 교체되면 이전 file 행은 참조가 끊긴 채 BOUND 로 남는다 — TEMP 로 되돌리지 않고
        // 디스크에서도 지우지 않는다(롤백·감사 흔적). FileStorageService#sweepExpiredTemp 주석 참조.
        if (ticketImagePath != null) {
            this.ticketImagePath = ticketImagePath;
        }
        if (venueName != null) {
            this.venueName = venueName;
        }
        if (venueAddress != null) {
            this.venueAddress = venueAddress;
        }
    }

    /** 일시가 바뀌면 취소 마감·판매 마감을 다시 계산해 넣는다(API-performance-04, P-8·P-9). */
    public void reschedule(LocalDateTime performanceAt, LocalDateTime cancelDeadlineAt,
                           LocalDateTime saleCloseAt) {
        this.performanceAt = performanceAt;
        this.cancelDeadlineAt = cancelDeadlineAt;
        this.saleCloseAt = saleCloseAt;
    }

    /**
     * 종료 일시만 바꾼다(API-performance-04). {@link #reschedule}와 나눠 둔 이유는 종료 일시가
     * 취소 마감·판매 마감 계산에 들어가지 않기 때문이다 — 그 둘은 시작 일시에서만 파생한다
     * (P-8·P-9). 역전 검증은 호출부가 먼저 한다.
     */
    public void changeEndAt(LocalDateTime endAt) {
        this.endAt = endAt;
    }

    /**
     * 공연 취소(API-performance-12) — <b>종단</b>이다. 되돌리는 경로가 없다.
     *
     * <p>접수 시점에 바로 전이한다. {@code halt} 확정을 기다리면 그 사이 주문이 더 들어오고,
     * 온체인 {@code Halted}는 뒤늦게 와도 되돌릴 것이 없다.
     */
    public void markCancelled() {
        this.status = Status.CANCELLED;
    }

    /** 잠금(판매 시작) 전에만 수정할 수 있다 — API-performance-04. */
    public boolean isModifiable() {
        return status == Status.DRAFT || status == Status.PENDING_AGREEMENT;
    }

    public boolean isOnSaleOrLater() {
        return status == Status.ON_SALE || status == Status.SALE_CLOSED || status == Status.ENDED;
    }

    /**
     * 더 이상 전이하지 않는 상태 — {@code ENDED}·{@code CANCELLED}.
     *
     * <p>{@link #isOnSaleOrLater()}와 <b>겹치지만 뜻이 다르다</b>. 그쪽은 "판매가 열렸는가"
     * (컨트랙트가 잠갔는가)이고 이쪽은 "끝났는가"다. API v6 §4의 409 표가 둘을 나눠 적는다 —
     * 판매 중 수정은 {@code PERFORMANCE_ALREADY_ON_SALE}, 종료·취소된 공연 수정은
     * {@code PERFORMANCE_INVALID_STATUS}다. 그래서 {@code isOnSaleOrLater}의 의미를 바꾸지 않고
     * ({@code rule} 도메인이 5곳에서 그 뜻으로 쓴다) 판정 순서로 가른다.
     */
    public boolean isTerminal() {
        return status == Status.ENDED || status == Status.CANCELLED;
    }

    /**
     * 온체인 {@code showId} — 컨트랙트 호출에 넣는 값의 <b>유일한 출처</b>다.
     *
     * <p><b>{@code showId = performance_id}다</b>(컨트랙트 인터페이스 v1 §4.8).
     * {@code on_chain_id}는 {@code ShowCreated} 확정 때 서버가 되채우는 <b>PK 사본</b>이고
     * ({@code ChainJobConfirmationService}의 {@code bindOnChain(receipt.to(), performanceId)}),
     * 그 확정은 이벤트의 {@code showId}가 {@code performance_id}와 다르면 거부된다. 즉 두 값은
     * 갈릴 수 없다.
     *
     * <p>그래도 파생을 한 곳에 두는 이유는 <b>규칙이 한 문장이어야 하기 때문이다</b> — 같은
     * 삼항식이 워커와 prepare 서비스마다 복사돼 있으면 한쪽만 고쳐 갈라놓기 쉽다. 확정 전에
     * {@code on_chain_id}를 강제할 수 없는 순환({@code ContractOperatorTxBuilder} 참조)도 이
     * 메서드가 한 번에 설명한다.
     */
    public long onChainShowId() {
        if (onChainId != null) {
            return onChainId;
        }
        if (performanceId == null) {
            // 저장 전 엔티티다. 여기서 막지 않으면 NPE 로 새어 나가고, 0 을 지어내면 남의 공연을
            // 가리킨다(worker 의 required() 가 같은 이유로 있었다).
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return performanceId;
    }

    public boolean isDepositPaid() {
        return depositStatus == DepositStatus.PAID;
    }

    /** 공연 상태. */
    public enum Status {
        DRAFT, PENDING_AGREEMENT, ON_SALE, SALE_CLOSED, ENDED, CANCELLED
    }

    /** 보증금 상태. {@code FORFEITED}는 P1 예약값이며 MVP에서 전이시키지 않는다. */
    public enum DepositStatus {
        UNPAID, PAID, RETURNED, FORFEITED
    }
}
