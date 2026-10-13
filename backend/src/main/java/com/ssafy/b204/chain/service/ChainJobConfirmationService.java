package com.ssafy.b204.chain.service;

import com.ssafy.b204.audit.entity.AuditLog;
import com.ssafy.b204.audit.repository.AuditLogRepository;
import com.ssafy.b204.chain.entity.ChainJob;

import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.support.EthCrypto;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.payment.repository.PaymentRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.refund.repository.RefundRepository;
import com.ssafy.b204.refund.service.RefundService;
import com.ssafy.b204.rule.entity.RuleAgreement;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.RuleAgreementRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.service.SettlementChainReader;
import com.ssafy.b204.settlement.service.SettlementJobEnqueuer;
import com.ssafy.b204.settlement.service.SettlementStateWriter;
import com.ssafy.b204.ticket.entity.OrderItem;
import com.ssafy.b204.ticket.entity.Ticket;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.ticket.service.TicketStock;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import com.ssafy.b204.wallet.service.WalletBalanceCache;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * receipt 확정 → 도메인 상태 전이 — API v6 §0.4 ④⑤.
 *
 * <p><b>이 클래스가 "온체인에서 실제로 일어난 일"과 DB를 잇는 유일한 지점이다.</b>
 * {@link #confirm(Long, TxReceipt)}에 <b>파싱된 이벤트가 실린</b> receipt를 넣으면 도메인이
 * 전이한다(결제 {@code PAID}·티켓 발급·보증금 {@code PAID}·규칙 동의·판매 개시).
 *
 * <p><b>체인 워커가 이 자리를 부른다</b>({@code ChainJobWorker.confirmDomain}).
 * {@code ReceiptVerifier}가 §0.4 ④의 1~3(status·to·from)을 보고, {@code ReceiptEvents}가 ABI
 * 생성물로 로그를 {@link TxReceipt}로 옮긴 뒤 여기로 넘어온다 — 4·5(이벤트 존재·인자 일치)와
 * 도메인 전이가 이 클래스 몫이다.
 *
 * <p><b>입력이 {@link TxReceipt}인 것은 그대로 둔다.</b> web3j
 * {@code TransactionReceipt}를 직접 받게 하면 통합 테스트가 실체인 없이 확정 경로를 돌 수 없다.
 * 지금도 테스트는 두 갈래로 들어온다 — 가짜 <b>로그</b>를 만들어 워커가 스스로 파싱하게 하거나
 * ({@code ChainJobWorkerConfirmationTest}·{@code PerformancePaymentFlowTest}의 워커 완주),
 * 이 자리에 {@link TxReceipt}를 직접 넣거나.
 *
 * <p><b>{@code success}만 보고 확정하지 않는다</b>(§0.4 ④ receipt 검증 5항목).
 *
 * <ol>
 *   <li>receipt {@code status == 1}
 *   <li>{@code to} == 서버가 내려준 컨트랙트 주소
 *   <li>{@code from} == 요청자의 등록 지갑 주소({@code USER} job만. {@code OPERATOR} job의
 *       발신자는 운영지갑이다)
 *   <li>기대 이벤트가 로그에 존재 — {@code Purchased}/{@code DepositPaid}/{@code RulesAgreed}/
 *       {@code SaleStarted}/{@code Approval}
 *   <li>이벤트 인자가 서버 상태와 일치 — {@code orderRef}·{@code amount}·{@code teamIndex}·
 *       {@code showId}·{@code rulesHash}
 * </ol>
 *
 * <p>하나라도 어긋나면 <b>도메인 상태를 전이하지 않고</b> {@code chain_job}을 {@code FAILED}로
 * 고정한다(§0.4 ⑤). 실패 사유는 규격 §3의 code 문자열만 남긴다 — revert 원문·노드 메시지는
 * 넣지 않는다(SEC-09).
 *
 * <p><b>revert 사유 분기는 워커 몫이다 — 이 클래스는 사유를 만들어내지 않는다.</b>
 * 계약 문서 §4.6의 revert → {@code ErrorCode} 매핑표를 적용하는 자리는 체인 워커이고, 결과를
 * 두 가지 방법 중 하나로 넘긴다.
 *
 * <ol>
 *   <li>{@link #markFailed(Long, ErrorCode)} — 번역한 코드를 직접 준다. <b>권장</b>
 *   <li>{@link #confirm(Long, TxReceipt)}에 {@code TxReceipt.failureCode}를 채운 revert receipt.
 *       비워서 주면 사유가 사라지고 전부 {@code PAYMENT_AMOUNT_MISMATCH}로 기록된다 — 그러면
 *       API-payment-03이 요구하는 {@code TICKET_SOLD_OUT}·{@code TICKET_SALE_CLOSED} 분기가
 *       나오지 않는다
 * </ol>
 *
 * <p>{@code GrantRefUsed}만 예외다 — 실패가 아니라 <b>동기화</b>이므로
 * {@link #syncGrantAlreadyUsed(Long, String)}로 부른다(계약 §4.6 "실패 처리 금지").
 *
 * <p><b>재호출은 안전하다.</b> 이미 {@code CONFIRMED}인 job에 다시 receipt가 들어오면 아무것도
 * 하지 않는다 — 티켓이 두 번 발급되면 되돌릴 방법이 없다.
 */
@Service
@RequiredArgsConstructor
public class ChainJobConfirmationService {

    private static final Logger log = LoggerFactory.getLogger(ChainJobConfirmationService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * 보증금 반환 자동 재시도 상한. 넘으면 사람이 본다 — 매 분 같은 tx 를 무한히 내보내면
     * 대납 가스만 태우고, 실패가 계속된다는 것은 온체인 상태가 우리 판정과 다르다는 뜻이다.
     */
    private static final int DEPOSIT_RETURN_MAX_ATTEMPTS = 3;

    private final ChainJobRepository chainJobRepository;
    /**
     * 환불 대상 표시 — 스키마를 늘리지 않는 유일한 자리다. 두 가지가 여기로 적히고 표식으로
     * 구분된다: {@code LATE_PURCHASE_RECEIPT}(만료 뒤 도착) · {@code DUPLICATE_PURCHASE_RECEIPT}
     * (같은 주문의 두 번째 결제 tx).
     */
    private final AuditLogRepository auditLogRepository;
    private final PerformanceRepository performanceRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final SettlementRuleRepository settlementRuleRepository;
    private final RuleAgreementRepository ruleAgreementRepository;
    private final PaymentRepository paymentRepository;
    private final TicketOrderRepository ticketOrderRepository;
    private final TicketRepository ticketRepository;
    private final WalletRepository walletRepository;
    /** 환불 확정 — 워커가 tx 인자를 읽은 것과 같은 행을 읽는다({@code chain_job_id} 역참조). */
    private final RefundRepository refundRepository;
    /** 환불 확정 시 재고 원복. 주문 만료 경로와 <b>같은 메서드</b>를 쓴다. */
    private final TicketStock ticketStock;
    /**
     * 보증금 반환 훅의 "환불이 다 나갔는가" 판정 — 금액 식을 여기서 다시 쓰지 않는다
     * ({@code RefundService.outstandingRefundAmount}). 환불 도메인은 이 클래스를 참조하지 않아
     * 순환이 없다.
     */
    private final RefundService refundService;
    /** 공연 취소의 보증금 반환 연쇄 — 운영자 job 입구는 이것 하나다. */
    private final SettlementJobEnqueuer jobEnqueuer;
    /** 보증금 반환 직전의 마지막 판정 — 에스크로가 실제로 비었는지는 체인만 안다. */
    private final SettlementChainReader chainReader;
    /**
     * 공연 취소 확정 시 {@code HALTED} 전이 — 정산 도메인이 <b>-12에 위임해 둔</b> 자리다
     * ({@code SettlementService} javadoc). 게이트·계산·대사는 읽지도 고치지도 않는다. 행 생성은
     * 조회·집계와 같은 입구를 써서 동시 생성이 이 트랜잭션을 롤백시키지 않는다(S15P21B204-155).
     */
    private final SettlementStateWriter settlementStateWriter;
    private final WalletBalanceCache balanceCache;
    private final ChainProperties chainProperties;

    /** 결제·정산 행을 잠그면서 <b>최신 커밋</b>으로 덮어쓰는 자리 — {@link #lockLatest(Payment)}·{@link #confirmHalt} 참조. */
    @PersistenceContext
    private EntityManager em;

    /** 확정 처리 결과. {@code failureReason}은 규격 §3의 code 문자열이다. */
    public record Result(boolean confirmed, String failureReason, List<Long> issuedTicketIds) {

        static Result ok() {
            return new Result(true, null, List.of());
        }

        static Result ok(List<Long> ticketIds) {
            return new Result(true, null, ticketIds);
        }

        static Result failed(ErrorCode code) {
            return new Result(false, code.getCode(), List.of());
        }
    }

    /**
     * receipt를 적용한다.
     *
     * @param chainJobId {@code chain_job} PK
     * @param receipt    파싱된 receipt. {@code null}이거나 revert면 job만 실패로 고정한다
     */
    @Transactional
    public Result confirm(Long chainJobId, TxReceipt receipt) {
        // 잠금 읽기 — 다른 인스턴스가 같은 job 을 확정 중이면 커밋까지 기다렸다가 CONFIRMED 를
        // 보고 아래에서 끝난다. 잠금 없이 읽으면 둘 다 도메인 전이를 돈다(S15P21B204-119).
        ChainJob job = chainJobRepository.findByIdForUpdate(chainJobId).orElseThrow(
                () -> new IllegalArgumentException("존재하지 않는 chain_job: " + chainJobId));
        if (job.getStatus() == ChainJob.Status.CONFIRMED) {
            return Result.ok();
        }
        // 실패를 바로 return 하지 않고 result 로 모은다 - 아래 한 자리에서 AGREE 되돌림을 걸기
        // 위해서다(applyAgreementFailure). 이렇게 두면 revert·주소 불일치처럼 tx_type 분기에
        // 닿기도 전에 끝나는 실패도 빠지지 않는다.
        Result result;
        if (receipt == null || !receipt.success()) {
            // revert 사유는 워커가 계약 §4.6 매핑표로 번역해 receipt.failureCode 에 넣는다.
            // 비어 있으면(= 아직 번역하지 않는 워커) 지금까지처럼 금액 불일치로 떨어진다.
            result = fail(job, revertCode(receipt));
        } else if (!addressMatches(job, receipt)) {
            result = fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        } else {
            result = switch (job.getTxType()) {
                case APPROVE -> confirmApprove(job, receipt);
                case PURCHASE -> confirmPurchase(job, receipt);
                case DEPOSIT -> confirmDeposit(job, receipt);
                case AGREE -> confirmAgree(job, receipt);
                case CREATE_SHOW -> confirmCreateShow(job, receipt);
                case UPDATE_RULES -> confirmUpdateRules(job, receipt);
                case START_SALE -> confirmStartSale(job, receipt);
                // LOCK 은 정산 잠금(API-settlement-03)이다. 이벤트는 SettlementLocked 이고 상태
                // 전이는 SettlementConfirmationService 가 CONFIRMED 를 훑어서 한다. 여기서
                // SaleStarted 를 찾으면 성공한 tx 가 FAILED 로 기록되고 정산이 영영 멈춘다.
                case LOCK -> Result.ok();
                // DEPOSIT_RETURN 은 보증금 반환(API-settlement-05 의 연쇄)이다. 이벤트는
                // DepositReturned 이고 performance.deposit_status PAID → RETURNED 전이는
                // SettlementConfirmationService.applyDepositReturn 이 CONFIRMED 를 훑어서 한다
                // (조건부 UPDATE 로 펜싱하므로 여기서 손대면 그 판정이 무의미해진다). LOCK 과 같은
                // 이유로 여기서는 확정만 한다 — default 로 떨어지면 정상 tx 마다 WARN 이 남는다.
                case DEPOSIT_RETURN -> Result.ok();
                case MINT -> confirmMint(job);
                case REFUND -> confirmRefund(job, receipt);
                case HALT -> confirmHalt(job);
                default -> {
                    log.warn("이 카드가 다루지 않는 tx_type 이다 - 상태 전이 없이 확정만 한다 ({})",
                            job.getTxType());
                    yield Result.ok();
                }
            };
        }

        if (result.confirmed()) {
            job.markConfirmed(receipt.txHash(), 1);
        } else {
            applyAgreementFailure(job);
        }
        return result;
    }

    /**
     * 확정이 실패한 {@code AGREE} job 의 동의를 {@code PENDING} 으로 되돌린다.
     *
     * <p>{@link #fail(ChainJob, ErrorCode)} 는 그대로 둔다 — "실패는 job 만 적고 도메인은 건드리지
     * 않는다" 가 그 메서드의 원칙이고, tx_type 마다 실패의 도메인 의미가 달라서
     * ({@code MINT} 의 {@code GrantRefUsed} 는 실패가 아니라 동기화다) 거기에 도메인 전이를 넣으면
     * 12종이 전부 영향을 받는다. 대신 {@link #confirm} 의 <b>실패 합류점 한 곳</b>에서
     * {@code AGREE} 만 골라 되돌린다.
     *
     * <p>이것이 없으면 rule_05 의 검증 실패(이벤트 부재·{@code showId} 불일치 →
     * {@code PAYMENT_AMOUNT_MISMATCH}, {@code rulesHash} 불일치 → {@code RULE_HASH_MISMATCH})가
     * job 만 {@code FAILED} 로 닫고 동의를 {@code SIGNING} 에 남긴다. P-06 이 "서명 확인 중" 에서
     * 멈추고 재서명이 막힌다(장부 D-81). 명세는 "검증 실패는 {@code PENDING} 으로 되돌리고
     * {@code chain_job} 을 {@code FAILED} 로 고정한다" 이므로 문서가 맞고 코드가 틀렸다.
     *
     * <p>되돌림 조건은 {@link RuleAgreement#resetIfSigningFor(Long)} 이 갖는다 — 전송 실패
     * ({@code ChainJobStateWriter})·스윕({@code RuleService.failSigningsWithClosedJobs})과 같은
     * 판정이어야 한다.
     */
    private void applyAgreementFailure(ChainJob job) {
        if (job.getTxType() != ChainJob.TxType.AGREE
                || job.getTargetPerformanceId() == null || job.getTargetTeamId() == null) {
            return;
        }
        ruleAgreementRepository.findByPerformance_PerformanceIdAndTeam_TeamId(
                job.getTargetPerformanceId(), job.getTargetTeamId()).ifPresent(agreement -> {
            if (agreement.resetIfSigningFor(job.getChainJobId())) {
                log.warn("규칙 동의 {} PENDING 으로 되돌렸다 - AGREE 확정이 실패했다(chain_job {})",
                        agreement.getRuleAgreementId(), job.getChainJobId());
            }
        });
    }

    /**
     * 전송·확정 실패를 기록한다. 도메인 상태는 건드리지 않는다.
     *
     * <p><b>revert 사유 분기의 정식 진입점이다.</b> 워커가 계약 §4.6 매핑표로 revert를
     * {@link ErrorCode}로 번역해 여기로 부른다({@code SaleNotStarted → TICKET_SALE_NOT_STARTED},
     * {@code RulesHashMismatch → RULE_HASH_MISMATCH}, {@code ERC20InsufficientAllowance →
     * PAYMENT_AMOUNT_MISMATCH} …). {@link #confirm}에 revert receipt를 넣어도 되지만 그때는
     * {@code TxReceipt.failureCode}를 채워야 사유가 보존된다.
     */
    @Transactional
    public void markFailed(Long chainJobId, ErrorCode code) {
        // 잠금 읽기 + 종단 가드 — 확정 커밋을 FAILED 로 덮지 않는다(S15P21B204-119).
        chainJobRepository.findByIdForUpdate(chainJobId).filter(job -> !job.isTerminal())
                .ifPresent(job -> fail(job, code));
    }

    /**
     * {@code YoYo.mint}가 {@code GrantRefUsed(grantRef)}로 revert했을 때의 <b>동기화</b>
     * 진입점 — 계약 §4.6 "기존 MINT job을 CONFIRMED로 동기화. <b>실패 처리 금지</b>".
     *
     * <p>이 revert는 "이미 그 {@code grantRef}로 지급이 나갔다"는 뜻이다. 지급은 성공했는데 우리
     * 쪽 job만 미확정으로 남은 상태라, {@code FAILED}로 적으면 잔액과 장부가 갈린다. 재시도
     * 루프에 들어가면 같은 revert가 무한 반복된다.
     *
     * <p>{@code txHash}는 <b>기존 지급 tx</b>의 해시다(워커가 {@code grantRef}로 되찾는다).
     * 모르면 {@code null}로 부른다 — 상태만 {@code CONFIRMED}로 맞춘다.
     */
    @Transactional
    public Result syncGrantAlreadyUsed(Long chainJobId, String txHash) {
        // 잠금 읽기 — 다른 인스턴스가 같은 job 을 확정 중이면 커밋까지 기다렸다가 CONFIRMED 를
        // 보고 아래에서 끝난다. 잠금 없이 읽으면 둘 다 도메인 전이를 돈다(S15P21B204-119).
        ChainJob job = chainJobRepository.findByIdForUpdate(chainJobId).orElseThrow(
                () -> new IllegalArgumentException("존재하지 않는 chain_job: " + chainJobId));
        if (job.getStatus() == ChainJob.Status.CONFIRMED) {
            return Result.ok();
        }
        if (job.getTxType() != ChainJob.TxType.MINT) {
            // GrantRefUsed 는 YoYo.mint 만 낸다. 다른 tx 로 오면 워커 버그다.
            log.error("GrantRefUsed 동기화를 MINT 가 아닌 job 에 시도했다 (chainJobId={}, txType={})",
                    chainJobId, job.getTxType());
            return fail(job, ErrorCode.COMMON_CONFLICT);
        }
        Result result = confirmMint(job);
        job.markConfirmed(txHash != null ? txHash : job.getTxHash(), 1);
        return result;
    }

    // ------------------------------------------------------------------ tx 별 확정

    /**
     * {@code Approval(owner, spender, value)} — allowance 승인. 도메인 상태 전이가 없다.
     *
     * <p>계약 §4.4 대조 항목은 <b>두 개</b>다 — {@code owner == 등록 지갑}(공통
     * {@link #addressMatches}가 {@code receipt.from}으로 본다)과 <b>{@code spender == Splitter}</b>.
     * 이벤트 존재만 보면 관객이 <b>엉뚱한 주소에 승인</b>한 tx도 {@code CONFIRMED}가 되고, 그
     * 상태로 결제를 진행하면 {@code purchase}가 allowance 부족으로 revert한다 — 원인이 두 단계
     * 앞에 있어 현장에서 찾기 어렵다.
     *
     * <p>Splitter 주소가 설정돼 있지 않은 환경(체인 미구성)에서는 대조를 건너뛴다.
     * {@link #addressMatches}의 {@code to} 대조와 같은 규칙이다.
     */
    private Result confirmApprove(ChainJob job, TxReceipt receipt) {
        Optional<TxReceipt.TxEvent> event = receipt.event("Approval");
        if (event.isEmpty()) {
            return fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }
        String spender = contractAddress(false);
        if (spender != null && !addressEquals(event.get(), "spender", spender)) {
            log.warn("Approval 의 spender 가 Splitter 가 아니다 - 확정하지 않는다 (chainJobId={})",
                    job.getChainJobId());
            return fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }
        return Result.ok();
    }

    /**
     * {@code Purchased(showId, orderRef, buyer, teamIndex, amount, quantity)} —
     * <b>결제 성립 지점</b>이다. 여기서만 티켓이 발급된다.
     *
     * <p>같은 주문에 <b>결제 tx가 두 번</b> 확정될 수 있다(재시작 → 지갑이 nonce를 올려 다른
     * purchase tx를 만든다 → RLP 해시 멱등키가 달라 별개 job이 된다). 그때 두 번째 receipt는
     * {@link #confirmDuplicatePurchase}로 간다 — 티켓을 또 발급하지 않고 환불 대상으로 적는다.
     *
     * <p>그 갈림은 {@code payment.isPaid()}가 판정하므로 결제 행을 <b>잠그고</b> 읽는다
     * ({@link #lockLatest}). 잠금이 없으면 두 job이 동시에 확정될 때 둘 다 미결제로 보고 티켓을
     * 두 벌 발급한다(S15P21B204-134).
     */
    private Result confirmPurchase(ChainJob job, TxReceipt receipt) {
        Optional<TxReceipt.TxEvent> event = receipt.event("Purchased");
        if (event.isEmpty()) {
            return fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }
        TxReceipt.TxEvent purchased = event.get();

        Optional<Payment> found = resolvePayment(job, purchased);
        if (found.isEmpty()) {
            return fail(job, ErrorCode.COMMON_NOT_FOUND);
        }
        Payment payment = lockLatest(found.get());
        TicketOrder order = payment.getTicketOrder();

        Integer teamIndex = order.getSelectedTeam() == null ? null : participantRepository
                .findByPerformance_PerformanceIdAndTeam_TeamId(
                        order.getPerformance().getPerformanceId(),
                        order.getSelectedTeam().getTeamId())
                .map(PerformanceParticipant::getOnChainIndex)
                .orElse(null);

        // showId 는 calldata 를 만들 때와 같은 파생을 쓴다(Performance.onChainShowId).
        // 대조 대상이 우리가 보낸 그 값이라 파생이 두 벌이면 갈릴 여지만 남는다.
        boolean matched = numberEquals(purchased, "showId", order.getPerformance().onChainShowId())
                && hexEquals(purchased, "orderRef", order.getOrderRef())
                && addressEquals(purchased, "buyer", payment.getPayerWallet().getAddress())
                && numberEquals(purchased, "amount", payment.getAmount())
                && numberEquals(purchased, "quantity", (long) order.getTotalQuantity())
                && (teamIndex == null || numberEquals(purchased, "teamIndex", (long) teamIndex));
        if (!matched) {
            // 상태를 전이하지 않고 payment 만 FAILED 로 둔다. 주문은 PENDING_PAYMENT 로 남아
            // 사용자가 15분 안에 다시 시도할 수 있다(API-payment-03 요구사항).
            // 이미 PAID 인 결제는 건드리지 않는다 — 인자가 어긋난 두 번째 receipt 때문에
            // 성립한 결제가 FAILED 로 뒤집히면 그것이야말로 장부를 잃는 일이다.
            if (!payment.isPaid()) {
                payment.markFailed(ErrorCode.PAYMENT_AMOUNT_MISMATCH.getCode());
            }
            return fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }

        if (payment.isPaid()) {
            if (sameTxHash(payment.getPurchaseTxHash(), receipt.txHash())) {
                // 같은 tx 의 재확정이다(job 이 CONFIRMED 로 닫히기 전에 다시 폴링된 경우).
                // 부작용을 반복하지 않는다 — 잔액 캐시를 또 낮추면 없던 지출이 생긴다.
                return Result.ok();
            }
            // 같은 주문에 두 번째 결제 tx 가 확정됐다. 돈은 두 번 나갔고 티켓은 한 장이다.
            return confirmDuplicatePurchase(order, payment, receipt);
        }

        if (!order.isPendingPayment()) {
            // 만료·확정 뒤에 도착한 receipt. 온체인 사실과 서비스 판정을 갈라 적는다.
            return confirmLatePurchase(order, payment, receipt);
        }

        payment.markPaid(receipt.txHash());
        order.markPaid();
        List<Long> ticketIds = issueTickets(order, receipt.txHash());

        // §0.12 갱신 시점 2 - 발신(관객) 지갑의 잔액 캐시를 낮춘다. 갱신하지 않으면 발행량 대사가
        // 정상 결제를 불일치로 읽는다.
        adjustBalance(payment.getPayerWallet().getWalletId(), -payment.getAmount());
        return Result.ok(ticketIds);
    }

    /**
     * 이 {@code PURCHASE} job이 어느 결제의 것인지 찾는다.
     *
     * <p>정방향은 {@code payment.purchase_chain_job_id} 역참조다. 그런데 그 컬럼은 <b>하나</b>이고
     * 결제 재시작 시 {@code PaymentService.signedTx}가 <b>새 job id로 덮는다</b>. 같은 주문에
     * 결제 tx가 둘 만들어지면 먼저 만든 job은 링크를 잃고, 그 job의 receipt는 예전에
     * {@code COMMON_NOT_FOUND}로 떨어졌다 — <b>온체인에서 실제로 나간 돈이 장부에 한 줄도 남지
     * 않는 경로</b>였다.
     *
     * <p>그래서 링크가 없으면 <b>이벤트의 {@code orderRef}</b>로 되짚는다. {@code order_ref}는
     * UNIQUE이고 이벤트 인자이므로 job 링크와 무관하게 주문을 특정한다. 다만 그것만으로는
     * "아무 job이나 주문을 집는" 문이 되므로, {@code chain_job}에 저장된 대상
     * (지갑·공연·금액)이 그 결제와 같을 때만 받아들인다({@link #supersededPurchaseJob}).
     * 이벤트 인자 대조(§0.4 ④ 5)는 호출부에서 그대로 한 번 더 돈다.
     */
    private Optional<Payment> resolvePayment(ChainJob job, TxReceipt.TxEvent purchased) {
        Optional<Payment> linked = paymentRepository.findByPurchaseChainJobId(job.getChainJobId());
        if (linked.isPresent()) {
            return linked;
        }
        return purchased.text("orderRef")
                .flatMap(ref -> ticketOrderRepository.findByOrderRef(normalize(ref)))
                .flatMap(order -> paymentRepository
                        .findByTicketOrder_TicketOrderId(order.getTicketOrderId()))
                .filter(payment -> supersededPurchaseJob(job, payment));
    }

    /**
     * 링크를 잃은 job이 <b>정말 이 결제의 이전 시도</b>인가 — {@code chain_job}에 남은 대상이
     * 그 결제와 같아야 한다. 하나라도 다르면 링크를 되살리지 않고 {@code COMMON_NOT_FOUND}로 둔다.
     */
    private static boolean supersededPurchaseJob(ChainJob job, Payment payment) {
        TicketOrder order = payment.getTicketOrder();
        return job.getSignerType() == ChainJob.SignerType.USER
                && Objects.equals(job.getWalletId(), payment.getPayerWallet().getWalletId())
                && Objects.equals(job.getTargetPerformanceId(),
                        order.getPerformance().getPerformanceId())
                && Objects.equals(job.getAmount(), payment.getAmount());
    }

    /**
     * 결제 행에 쓰기 잠금을 걸면서 인스턴스를 <b>DB 최신 커밋</b>으로 덮어쓴다 —
     * {@code isPaid()} 판정 <b>전에</b> 부른다(S15P21B204-134).
     *
     * <p>{@link #confirm}의 잠금은 {@code chain_job} <b>행 단위</b>다(-119). 같은 주문에
     * {@code PURCHASE} job이 <b>둘</b> 있으면(재서명 → 지갑이 nonce를 올려 다른 tx → RLP 해시
     * 멱등키가 달라 별개 job) 두 job은 서로 다른 행을 잠그고 <b>나란히</b> 여기까지 온다. 그때
     * {@code payment}를 잠금 없이 읽으면 REPEATABLE READ 스냅숏이라 둘 다 {@code isPaid()=false}를
     * 보고 각자 {@link #issueTickets}를 돈다 — <b>티켓이 두 벌 발급되고 되돌릴 방법이 없다.</b>
     * 단일 인스턴스에서는 확정 워커가 하나라 열리지 않지만 블루/그린 전환과 함께 열린다.
     *
     * <p><b>{@code @Lock(PESSIMISTIC_WRITE)} 파인더로는 부족하다</b> — 이 트랜잭션이 결제를 이미
     * 로드했으므로({@link #resolvePayment}) 잠금 파인더는 {@code FOR UPDATE}로 잠금만 잡고 결과를
     * 1차 캐시의 기존 인스턴스에 덮어쓰지 않는다. 그러면 잠금을 잡고도 앞 트랜잭션이 커밋한
     * {@code PAID}를 못 본다(MR !125가 정산에서 그 함정으로 실패를 재현했다).
     *
     * <p><b>잠금 순서</b> — 이 경로가 X 잠금을 잡는 순서는 {@code chain_job}({@link #confirm}
     * 입구) → {@code payment}(여기) → 발급 시 {@code ticket} INSERT · {@code ticket_type}
     * {@code sold_quantity}(flush)다. {@code payment}에 잠금을 잡는 곳은 저장소에 여기뿐이고
     * ({@code PaymentRepository}에 잠금 파인더가 없다) {@code ticket_type}을 먼저 잡고 결제로
     * 내려가는 경로도 없으므로 엇갈릴 상대가 없다.
     *
     * <p>{@code refresh}는 {@code payment} 행만 다시 읽는다 — {@code payment.getTicketOrder()}는
     * 여전히 이 트랜잭션 스냅숏의 주문이다. 문제되지 않는다: 앞 트랜잭션이 커밋했다면 결제가
     * {@code PAID}이므로 주문 상태를 보는 {@code isPendingPayment()} 갈래에 닿기 전에
     * {@link #confirmDuplicatePurchase}로 갈린다.
     */
    private Payment lockLatest(Payment payment) {
        em.refresh(payment, LockModeType.PESSIMISTIC_WRITE);
        return payment;
    }

    /**
     * <b>같은 주문의 두 번째 결제 tx가 확정됐다</b> — 돈은 두 번 나갔고 티켓은 한 장이다.
     *
     * <p>생기는 경로: 결제 서명 후({@code PAYING}) 앱을 닫았다 다시 열면 API-payment-01이
     * {@code AWAITING_SIGNATURE}로 되감고 API-payment-02가 {@code signRequests}를 다시 담는다
     * (명세가 그렇게 요구한다). 사용자가 다시 서명하면 지갑이 nonce를 올려 <b>다른</b>
     * purchase tx가 되고, 멱등키가 {@code keccak256(rlp)}라 별개 {@code chain_job}이 된다.
     * 둘 다 성공하면 두 번째 receipt가 여기로 온다. 이 창은 <b>D-6</b>(재시작 시 409로 끊을지)이
     * 결정돼야 닫힌다 — 그 전까지 회계 사실만은 잃지 않는다.
     *
     * <p>{@link #confirmLatePurchase}와 <b>같은 원칙</b>이다. 온체인 사실은 왜곡하지 않고,
     * 서비스 판정과 갈라 적는다.
     *
     * <table border="1">
     *   <caption>두 번째 결제 receipt 처리</caption>
     *   <tr><th>대상<th>처리<th>이유
     *   <tr><td>{@code chain_job}<td>{@code CONFIRMED} + 그 tx 해시<td>온체인 성공은 사실이다.
     *       재시도해도 결과가 달라지지 않으므로 <b>재시도 대상이 아니다</b>
     *   <tr><td>{@code payment}<td><b>손대지 않는다</b><td>{@code purchase_tx_hash}·{@code paid_at}은
     *       최초 결제의 것이다. 덮으면 첫 tx를 잃는다({@link Payment#markPaid} 가드가 그 판단이다)
     *   <tr><td>티켓<td><b>발급 안 함</b><td>이미 발급됐다. 재고도 이미 차감됐다
     *   <tr><td>환불<td>{@code audit_log}에 {@code DUPLICATE_PURCHASE_RECEIPT}<td>받은 돈을
     *       돌려줄 책임이 남는다
     * </table>
     *
     * <p><b>두 번째 tx 해시는 두 곳에 남는다</b> — {@code chain_job.tx_hash}(그 job의 것)와
     * {@code audit_log.tx_hash}다. {@code payment} 행은 주문당 하나(UNIQUE)라 두 번째 금액·해시를
     * 담을 자리가 없고, {@code refund} 행도 만들 수 없다({@code refund.ticket_id}가 NOT NULL인데
     * 이 두 번째 결제에 대응하는 티켓이 없다 — ERD v5). <b>한계</b>: 감사 로그를 뽑는 관리자 API가
     * 아직 없어 DB·로그로만 발견된다(V2 후보 — {@code payment_attempt} 테이블 또는
     * {@code refund.payment_id} nullable화).
     */
    private Result confirmDuplicatePurchase(TicketOrder order, Payment payment, TxReceipt receipt) {
        // 두 번째로도 실제로 빠져나갔다. 캐시를 그만큼 낮춘다(§0.12 갱신 시점 2).
        adjustBalance(payment.getPayerWallet().getWalletId(), -payment.getAmount());

        auditLogRepository.save(AuditLog.builder()
                // 주체는 시스템(체인 워커)이라 actor 가 없다 — V1 FK 는 SET NULL 이다.
                .actionType(AuditLog.ActionType.STATUS_CHANGE)
                .resourceType("ticket_order")
                .resourceId(order.getTicketOrderId())
                .requestSummary("DUPLICATE_PURCHASE_RECEIPT orderStatus=" + order.getStatus()
                        + " paymentId=" + payment.getPaymentId()
                        + " amount=" + payment.getAmount()
                        + " paidTxHash=" + payment.getPurchaseTxHash()
                        + " duplicateTxHash=" + receipt.txHash()
                        + " refundRequired=true")
                .result(AuditLog.Result.FAILURE)
                .txHash(receipt.txHash())
                .build());
        log.error("같은 주문에 두 번째 결제 receipt 가 확정됐다 — 티켓을 더 발급하지 않고 환불 "
                        + "대상으로 남긴다 (orderId={} paymentId={} amount={} paidTxHash={} "
                        + "duplicateTxHash={})",
                order.getTicketOrderId(), payment.getPaymentId(), payment.getAmount(),
                payment.getPurchaseTxHash(), receipt.txHash());
        return Result.ok();
    }

    /**
     * <b>늦게 온 결제 receipt</b> — 주문이 이미 {@code PENDING_PAYMENT}가 아니다.
     *
     * <p>15분 만료로 {@code CANCELLED}되고 재고까지 회수된 뒤에 {@code purchase}가 확정되는 창은
     * <b>체인 지연에 상한이 없어 항상 남는다</b>(만료 시간을 늘려도 같은 창이 그대로 있다).
     *
     * <p><b>여기로 오는 것은 아직 결제로 적히지 않은 receipt뿐이다.</b> 사용자가 같은 주문에 두 번
     * 서명해 두 tx가 모두 성공한 경우는 사유가 달라({@code CANCELLED}가 아니라 "이미 받은 돈이
     * 또 들어왔다") {@link #confirmDuplicatePurchase}가 따로 맡는다 — 감사 로그 표식도 다르다.
     *
     * <p>"무시"(사용자 돈이 체인에서 나갔는데 장부에 없다)와 "그냥 {@code PAID}"(재고 없이 티켓
     * 초과 발급) 둘 다 틀렸다. 갈라 적는다.
     *
     * <table border="1">
     *   <caption>늦은 receipt 처리</caption>
     *   <tr><th>대상<th>처리<th>이유
     *   <tr><td>{@code chain_job}<td>{@code CONFIRMED}<td>온체인 성공은 사실이다
     *   <tr><td>{@code payment}<td>{@code PAID} 기록<td>돈이 실제로 나갔다. 장부에서 지우면 안 된다
     *   <tr><td>티켓<td><b>발급 안 함</b><td>재고가 이미 회수됐다
     *   <tr><td>주문<td>{@code CANCELLED} 유지 + 환불 대상 표시<td>받은 돈을 돌려줄 책임이 남는다
     * </table>
     *
     * <p><b>환불 대상 표시는 {@code audit_log}로 한다.</b> {@code refund} 행은 만들 수 없다 —
     * {@code refund.ticket_id}가 NOT NULL인데(ERD v5) 이 경우 발급된 티켓이 없다.
     * {@code payment.failure_code}는 실패 코드 자리라 {@code PAID}인 건에 쓰면 뜻이 뒤집힌다.
     * 스키마를 늘리지 않고 운영자가 찾을 수 있는 자리는 감사 로그다 —
     * {@code resource_type='ticket_order'} · {@code result=FAILURE} · {@code request_summary}가
     * {@code LATE_PURCHASE_RECEIPT}로 시작한다. <b>한계</b>: 이 목록을 뽑는 관리자 API가 아직
     * 없어 DB·로그로만 발견된다(V2 후보 — {@code ticket_order.refund_required} 또는 감사 조회 API).
     */
    private Result confirmLatePurchase(TicketOrder order, Payment payment, TxReceipt receipt) {
        if (!payment.isPaid()) {
            payment.markPaid(receipt.txHash());
        }
        // 두 번 결제된 경우에도 매번 빠졌으므로 캐시를 그만큼 낮춘다(§0.12 갱신 시점 2).
        adjustBalance(payment.getPayerWallet().getWalletId(), -payment.getAmount());

        auditLogRepository.save(AuditLog.builder()
                // 주체는 시스템(체인 워커)이라 actor 가 없다 — V1 FK 는 SET NULL 이다.
                .actionType(AuditLog.ActionType.STATUS_CHANGE)
                .resourceType("ticket_order")
                .resourceId(order.getTicketOrderId())
                .requestSummary("LATE_PURCHASE_RECEIPT orderStatus=" + order.getStatus()
                        + " paymentId=" + payment.getPaymentId()
                        + " amount=" + payment.getAmount() + " refundRequired=true")
                .result(AuditLog.Result.FAILURE)
                .txHash(receipt.txHash())
                .build());
        log.error("만료·확정 이후 결제 receipt 가 도착했다 — 티켓을 발급하지 않고 환불 대상으로 "
                        + "남긴다 (orderId={} orderStatus={} paymentId={} amount={})",
                order.getTicketOrderId(), order.getStatus(), payment.getPaymentId(),
                payment.getAmount());
        return Result.ok();
    }

    /** {@code DepositPaid(showId, from, amount)} — 보증금 납부 확정(API-performance-14). */
    private Result confirmDeposit(ChainJob job, TxReceipt receipt) {
        Optional<Performance> found = performanceRepository.findById(job.getTargetPerformanceId());
        if (found.isEmpty()) {
            return fail(job, ErrorCode.PERFORMANCE_NOT_FOUND);
        }
        Performance performance = found.get();
        Optional<TxReceipt.TxEvent> event = receipt.event("DepositPaid");
        if (event.isEmpty()
                || !numberEquals(event.get(), "showId", performance.getPerformanceId())
                || !numberEquals(event.get(), "amount", performance.getDepositAmount())) {
            return fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }
        performance.markDepositPaid(job.getChainJobId(), receipt.txHash());
        adjustBalance(job.getWalletId(), -performance.getDepositAmount());
        return Result.ok();
    }

    /**
     * {@code RulesAgreed(showId, team, rulesHash, agreedCount, teamCount)} —
     * 팀 동의 확정(API-rule-05). <b>{@code rulesHash}가 서버 현재 해시와 같아야 한다.</b>
     */
    private Result confirmAgree(ChainJob job, TxReceipt receipt) {
        Optional<RuleAgreement> found = ruleAgreementRepository
                .findByPerformance_PerformanceIdAndTeam_TeamId(job.getTargetPerformanceId(),
                        job.getTargetTeamId());
        Optional<SettlementRule> rule = settlementRuleRepository
                .findByPerformance_PerformanceId(job.getTargetPerformanceId());
        if (found.isEmpty() || rule.isEmpty()) {
            return fail(job, ErrorCode.COMMON_NOT_FOUND);
        }
        Optional<TxReceipt.TxEvent> event = receipt.event("RulesAgreed");
        if (event.isEmpty() || !numberEquals(event.get(), "showId", job.getTargetPerformanceId())) {
            return fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }
        if (!hexEquals(event.get(), "rulesHash", rule.get().getRulesHash())) {
            // 서명 대기 중 규칙이 바뀌었다 - 팀이 보지 않은 규칙으로 잠기면 안 된다.
            return fail(job, ErrorCode.RULE_HASH_MISMATCH);
        }
        found.get().markAgreed(receipt.txHash());
        return Result.ok();
    }

    /**
     * {@code ShowCreated(showId, teamWallets, hostTeamIndex, rulesHash, ...)} — 온체인 공연 등록
     * (계약 문서 §4.1). 이 확정이 끝나야 {@code deposit}·{@code agreeToRules}·{@code startSale}이
     * 통과한다(그 전에는 {@code ShowNotFound}로 revert 한다).
     *
     * <p><b>보낸 배열과 이벤트가 같은지 대조한다.</b> {@code teamWallets}·{@code hostTeamIndex}는
     * 이후 {@code purchase}의 {@code teamIndex}와 정산 수령 주소의 근거가 되므로, 여기서 어긋난
     * 채 확정하면 그 뒤의 모든 tx 가 남의 팀에 기록된다. 대조 재료는 receipt 이벤트다 —
     * {@code teamWalletsOf} view 를 다시 부르지 않는다(같은 값을 같은 tx 에서 이미 받았고,
     * 트랜잭션 안에서 체인을 읽으면 확정이 RPC 지연에 묶인다).
     */
    private Result confirmCreateShow(ChainJob job, TxReceipt receipt) {
        Optional<Performance> found = performanceRepository.findById(job.getTargetPerformanceId());
        if (found.isEmpty()) {
            return fail(job, ErrorCode.COMMON_NOT_FOUND);
        }
        Performance performance = found.get();
        Optional<TxReceipt.TxEvent> event = receipt.event("ShowCreated");
        if (event.isEmpty() || !numberEquals(event.get(), "showId", performance.getPerformanceId())) {
            return fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }

        // 조건은 ShowCreationService.onChainOrder 하나다 - 빌더가 보낸 배열과 같은 규칙으로
        // 뽑지 않으면 정상 tx 를 불일치로 판정한다.
        List<PerformanceParticipant> ordered = ShowCreationService.onChainOrder(
                participantRepository.findByPerformance_PerformanceIdAndStatus(
                        performance.getPerformanceId(),
                        PerformanceParticipant.Status.REGISTERED));
        String expectedWallets = ReceiptEvents.joinAddresses(
                ordered.stream().map(PerformanceParticipant::getWalletAddress).toList());
        Long hostTeamId = performance.getCreatorTeam().getTeamId();
        Long expectedHostIndex = null;
        for (PerformanceParticipant participant : ordered) {
            if (hostTeamId.equals(participant.getTeam().getTeamId())) {
                expectedHostIndex = participant.getOnChainIndex().longValue();
            }
        }
        if (ordered.isEmpty() || expectedHostIndex == null
                || !hexEquals(event.get(), "teamWallets", expectedWallets)
                || !numberEquals(event.get(), "hostTeamIndex", expectedHostIndex)) {
            return fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }

        performance.bindOnChain(receipt.to(), performance.getPerformanceId());
        return Result.ok();
    }

    /**
     * {@code RulesUpdated(showId, rulesHash, fixedRatioBp, selectionRatioBp)} +
     * {@code AgreementsReset(showId)} — 온체인 규칙 교체(S15P21B204-70).
     *
     * <p><b>도메인 전이가 없다.</b> 규칙 자체는 {@code RuleService.setRule}이 이미 저장했고,
     * 동의도 그때 전원 {@code PENDING}으로 되돌아갔다({@code ensureAgreements}가 기존 행을
     * 무조건 {@code reset()}한다). 컨트랙트의 {@code rulesEpoch} 증가와 서버의 그 초기화가 같은
     * 일이므로 여기서 다시 되돌리지 않는다 — 두 번 하면 "확정이 동의를 지웠다"는 착시가 생긴다.
     *
     * <p>그래서 여기서 하는 일은 <b>대조</b>뿐이다. 이벤트의 {@code rulesHash}가 다르면 우리가
     * 모르는 규칙이 온체인에 박힌 것이고, 그대로 {@code CONFIRMED}로 두면 참여팀의
     * {@code agreeToRules}가 전부 {@code RulesHashMismatch}로 revert 한다.
     * {@code AgreementsReset}은 인자가 {@code showId}뿐이라 존재만 확인한다 — 이것이 없으면
     * 온체인 동의가 리셋되지 않은 것이고, 이미 동의한 팀이 {@code AlreadyAgreed}로 막혀
     * {@code startSale}이 영영 열리지 않는다.
     *
     * <p><b>대조 대상은 이 job 이 겨냥한 해시다</b>(리뷰 !80 🔴 3 · {@code chain_job}의 멱등키에
     * 실려 있다). 현재 DB 해시로 대조하면, 전송 뒤 규칙이 또 저장됐을 때 <b>성공한 tx 가
     * {@code FAILED}로 기록된다</b> — 체인은 우리가 보낸 그 해시를 박았는데 서버가 나중 해시를
     * 들이대는 것이라, 틀린 쪽은 체인이 아니라 대조다.
     */
    private Result confirmUpdateRules(ChainJob job, TxReceipt receipt) {
        String targetRulesHash = ShowCreationService.targetRulesHash(job);
        Optional<TxReceipt.TxEvent> event = receipt.event("RulesUpdated");
        if (targetRulesHash == null || event.isEmpty()
                || receipt.event("AgreementsReset").isEmpty()
                || !numberEquals(event.get(), "showId", job.getTargetPerformanceId())
                || !hexEquals(event.get(), "rulesHash", targetRulesHash)) {
            return fail(job, ErrorCode.RULE_HASH_MISMATCH);
        }
        return Result.ok();
    }

    /** {@code SaleStarted(showId, rulesHash)} — 규칙 영구 잠금 + 예매 개시(API-rule-04). */
    private Result confirmStartSale(ChainJob job, TxReceipt receipt) {
        Optional<Performance> found = performanceRepository.findById(job.getTargetPerformanceId());
        Optional<SettlementRule> rule = settlementRuleRepository
                .findByPerformance_PerformanceId(job.getTargetPerformanceId());
        if (found.isEmpty() || rule.isEmpty()) {
            return fail(job, ErrorCode.COMMON_NOT_FOUND);
        }
        Optional<TxReceipt.TxEvent> event = receipt.event("SaleStarted");
        if (event.isEmpty() || !numberEquals(event.get(), "showId", job.getTargetPerformanceId())
                || !hexEquals(event.get(), "rulesHash", rule.get().getRulesHash())) {
            return fail(job, ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }
        // 규칙 잠금·온체인 바인딩은 실제로 일어난 일이라 취소 여부와 무관하게 적는다.
        rule.get().lock(receipt.txHash());
        found.get().bindOnChain(receipt.to(), job.getTargetPerformanceId());
        // 취소된 공연은 되살리지 않는다. 판매 전 취소가 열린 뒤(S15P21B204-140) startSale job 이
        // SUBMITTED 인 채로 취소가 접수될 수 있고, 워커는 chain_job_id 오름차순이라 이 확정이
        // HALT 보다 먼저 온다. 여기서 markOnSale 을 부르면 CANCELLED 가 ON_SALE 로 덮여, 뒤이은
        // halt 확정의 returnDepositIfCancelledAndDrained 가 "취소 아님"으로 물러나 보증금이 이
        // MR 이 풀려던 그 상태로 다시 묶인다(MR !141 자동 리뷰 🔴).
        // 온체인은 SALE → HALTED 로 이어져 판매가 열리지 않는다 — halt 는 RELEASED·HALTED 만
        // 거부한다(RevenueSplitter.sol:894).
        if (found.get().getStatus() == Performance.Status.CANCELLED) {
            log.warn("startSale 확정이 취소된 공연에 도착 — ON_SALE 전이를 건너뛴다 (performanceId={})",
                    job.getTargetPerformanceId());
            return Result.ok();
        }
        found.get().markOnSale(TimeSupport.nowStored());
        return Result.ok();
    }

    /** {@code Minted(to, amount, grantRef)} — 시연용 지급. 잔액 캐시만 올린다(§0.12 갱신 시점 2). */
    private Result confirmMint(ChainJob job) {
        adjustBalance(job.getWalletId(), job.getAmount() == null ? 0L : job.getAmount());
        return Result.ok();
    }

    /**
     * {@code Refunded(showId, orderRef, buyer, teamIndex, refundAmount, quantity)} —
     * <b>환불 성립 지점</b>이다. 여기서만 티켓이 죽고 재고가 돌아온다.
     *
     * <p>전이 — {@code refund} {@code PROCESSING → COMPLETED} · 티켓
     * {@code ISSUED → CANCELLED} · {@code ticket_type.sold_quantity} 원복 · <b>Redis 재고
     * 원복</b>(주문 만료 경로와 같은 {@link TicketStock#release}) · 주문 전량 취소면
     * {@code TicketOrder.markRefunded}. 대조가 어긋나면 <b>아무것도 전이하지 않는다</b> —
     * 티켓만 죽고 코인은 안 온 중간 상태를 만들지 않는다.
     *
     * <p>취소 단위가 두 가지다. 개별 취소({@code CUSTOMER_CANCEL})는 {@code refund.ticket} 한 장,
     * 공연 취소({@code PERFORMANCE_CANCEL})는 <b>그 주문의 살아 있는 티켓 전부</b>다 — 온체인
     * {@code refund}가 주문 단위이고 공연 취소는 주문마다 한 건이기 때문이다.
     */
    private Result confirmRefund(ChainJob job, TxReceipt receipt) {
        Optional<TxReceipt.TxEvent> event = receipt.event("Refunded");
        if (event.isEmpty()) {
            return fail(job, ErrorCode.REFUND_TRANSFER_FAILED);
        }
        Refund refund = refundRepository.findByChainJobId(job.getChainJobId()).orElse(null);
        if (refund == null) {
            // 워커가 인자를 이 행에서 읽어 tx 를 만들었으므로 여기 없을 수 없다. 있다면 배선 결함이다.
            log.error("REFUND job 에 대응하는 refund 행이 없다 (chainJobId={})", job.getChainJobId());
            return fail(job, ErrorCode.COMMON_NOT_FOUND);
        }
        if (refund.getStatus() == Refund.Status.COMPLETED) {
            // 같은 receipt 재확정. 재고를 두 번 되돌리면 없던 표가 생긴다.
            return Result.ok();
        }

        TicketOrder order = refund.getTicketOrder();
        TxReceipt.TxEvent refunded = event.get();
        boolean matched = numberEquals(refunded, "showId",
                        order.getPerformance().onChainShowId())
                && hexEquals(refunded, "orderRef", order.getOrderRef())
                && numberEquals(refunded, "refundAmount", refund.getRefundAmount())
                && addressEquals(refunded, "buyer", refund.getReceiverWallet().getAddress());
        if (!matched) {
            refund.markFailed();
            log.warn("Refunded 인자가 서버 상태와 다르다 — 티켓을 살려 둔다 (refundId={})",
                    refund.getRefundId());
            return fail(job, ErrorCode.REFUND_TRANSFER_FAILED);
        }

        refund.markCompleted(receipt.txHash());
        cancelTickets(refund, order);
        // §0.12 갱신 시점 ② — 수령 지갑으로 코인이 돌아왔다.
        adjustBalance(refund.getReceiverWallet().getWalletId(), refund.getRefundAmount());
        // 보증금 반환은 여기서 걸지 않는다 — sweepCancelledDepositReturns 가 확정 트랜잭션 밖에서
        // 판정한다(체인 조회가 이 트랜잭션의 행 잠금을 붙잡지 않게 하려고).
        return Result.ok();
    }

    /**
     * {@code Halted(showId)} — 공연 취소(API-performance-12)의 온체인 확정. 정산을
     * <b>{@code HALTED}(종단)</b>로 보낸다.
     *
     * <p><b>이 전이의 유일한 자리다.</b> {@code SettlementService}는 "{@code HALTED}로 전이시키는
     * 코드가 여기에 없다 — 그 판정은 사람이 한다(공연 취소 API-performance-12 · 관리자
     * API-admin-06)"고 적어 두었고(그 클래스 javadoc), {@code Settlement.markHalted()}는 호출자가
     * 없었다. 즉 정산 도메인이 비워 둔 자리를 채우는 것이며 그쪽 판정(게이트·계산·대사)은 건드리지
     * 않는다.
     *
     * <p><b>접수 시점이 아니라 확정 시점이다.</b> {@code HALTED}는 종단이고 뒤늦게 확정된 tx로도
     * 되살아나지 않는다({@code SettlementConfirmationService}). halt tx가 실패했는데 정산을 먼저
     * 종단으로 보내면 되돌릴 수단이 없다 — 실패 receipt는 {@link #confirm}이 이 앞에서
     * {@code FAILED}로 끊으므로 여기 오지 않는다.
     *
     * <p>정산 행이 없을 수 있다(-12는 집계 전 {@code NONE} 단계에서도 가능하다). 그때는 만든다 —
     * 공연이 취소됐다는 사실이 정산 조회에도 보여야 한다. <b>이 트랜잭션에서 직접 INSERT 하지
     * 않는다</b>(S15P21B204-155). 정산 상세 조회·집계도 {@code SettlementStateWriter.ensureSettlement}
     * 로 같은 행을 만들기 때문에, 여기서 INSERT 하면 그쪽 커밋과 {@code settlement.performance_id}
     * UNIQUE 로 부딪혀 이 확정이 통째로 롤백되고 재시도 한 칸을 쓴다 — 한도 끝이면 체인은
     * 성공했는데 job 이 {@code FAILED} 로 닫혀 정산이 영영 {@code NONE} 이다. 그래서 행 생성은
     * 모두 {@code ensureSettlement}(별 트랜잭션, 충돌하면 재조회) 한 곳을 거친다.
     *
     * <p>그 행은 별 트랜잭션이 커밋했으므로 이 트랜잭션(REPEATABLE READ)의 일반 읽기 스냅숏에는
     * 없을 수 있다. 그래서 <b>PK 잠금 읽기</b>로 가져온다 — 잠금 읽기는 스냅숏이 아니라 최신
     * 커밋을 읽고, 있는 행의 PK 등치라 갭 잠금 없이 그 레코드만 잠근다. 존재 확인을 잠금 읽기로
     * 하지 않는 이유가 이것이다: 빈 결과의 {@code FOR UPDATE}는 갭 잠금이라 상대 INSERT 와
     * 교착할 수 있다(MR !137 리뷰 제안을 받지 않은 근거).
     *
     * <h2>있던 정산 행은 잠그고 최신 커밋으로 판정한다 (S15P21B204-148)</h2>
     *
     * <p>{@code SettlementConfirmationService.apply}가 같은 정산 행을 동시에 건드릴 수 있다 —
     * 취소 접수({@code PerformanceService#cancel})는 <b>{@code RELEASE} job만</b> 막으므로
     * {@code CONFIRMED}-미반영 {@code AGGREGATE}·{@code LOCK} job이 남은 채로 {@code HALT}가
     * 큐에 선다(그쪽 게이트가 취소된 공연을 막는 것은 <b>새</b> 접수뿐이다). 확정 워커의 receipt
     * 폴링(1.5초)과 정산 반영 훑기(2초)는 스케줄러 스레드가 달라(pool 4) <b>단일 인스턴스에서도</b>
     * 나란히 돈다.
     *
     * <p>잠금 없이 읽으면 이 트랜잭션의 스냅숏이 낡는다. 그 상태로 {@code markHalted}만 하면
     * Hibernate가 <b>전 컬럼 UPDATE</b>를 보내므로, 그 사이 상대가 커밋한 {@code total_revenue}·
     * {@code aggregated_at}·{@code locked_at}이 스냅숏의 {@code NULL}로 덮인다 — {@code HALTED}는
     * 남고 그 앞의 집계·잠금 근거만 사라지는, 조용해서 더 나쁜 결말이다({@code settlement_share}는
     * 다른 표라 그대로 남아 금액과 근거가 어긋난다). PK 잠금 읽기는 같은 잠금을 잡으면서 최신
     * 커밋으로 채운다 — {@code SettlementConfirmationService.lockLatest}와 같은 함정·같은 해법이다
     * (이 트랜잭션에서 정산을 먼저 읽는 코드가 없어 1차 캐시에 낡은 인스턴스가 없다).
     *
     * <p><b>잠기는 행은 {@code chain_job} → {@code settlement} 둘뿐이다.</b> 위 공연 조회는 일반
     * 읽기라 잠금이 아니다. 공연 행을 먼저 잡는 경로({@code PerformanceService#cancel} ·
     * {@code SettlementService#releaseInternal})는 그 잠금 아래에서 {@code chain_job}을 <b>새로
     * 넣거나 자기 job을 갱신</b>할 뿐 남의 job 행을 기다리지 않으므로, 이 순서와 엇갈리지 않는다.
     * 행이 없을 때 {@code ensureSettlement}의 별 트랜잭션 INSERT 는 FK 검사로 공연 행 공유 잠금을
     * 기다릴 수 있지만, 같은 이유로 그 공연 잠금 보유자가 이 {@code chain_job}을 기다리지 않아
     * 순환이 생기지 않는다.
     */
    private Result confirmHalt(ChainJob job) {
        Performance performance = job.getTargetPerformanceId() == null ? null
                : performanceRepository.findById(job.getTargetPerformanceId()).orElse(null);
        if (performance == null) {
            log.error("HALT job 의 대상 공연이 없다 (chainJobId={})", job.getChainJobId());
            return Result.ok();
        }
        // 행 생성은 별 트랜잭션에서 끝낸다 — 동시 생성과 부딪혀도 여기가 롤백되지 않는다(위 javadoc).
        Long settlementId = settlementStateWriter.ensureSettlement(performance);
        Settlement settlement = em.find(Settlement.class, settlementId,
                LockModeType.PESSIMISTIC_WRITE);
        if (settlement == null) {
            // 전이를 포기하고 job 은 CONFIRMED 로 닫힌다(보류가 아니다) — 정산 행이 사라진 공연에
            // 되돌아올 전이가 없다. 사라진 것 자체가 비정상이라 ERROR 로 남긴다.
            log.error("halt 전이 포기 — 정산 행이 사라졌다 (settlementId={})", settlementId);
            return Result.ok();
        }
        if (settlement.getStatus() != Settlement.Status.HALTED) {
            settlement.markHalted();
            log.info("공연 취소 halt 확정 — 정산을 HALTED(종단)로 보낸다 (performanceId={})",
                    performance.getPerformanceId());
        }
        // 보증금 반환은 sweepCancelledDepositReturns 가 건다 — 확정마다 한 번씩 기회를 주는 대신
        // 조건이 맞을 때까지 주기적으로 다시 판정한다(S15P21B204-140).
        return Result.ok();
    }

    /** 환불 확정에 따른 티켓·재고 원복. 이미 {@code CANCELLED}인 티켓은 건드리지 않는다. */
    private void cancelTickets(Refund refund, TicketOrder order) {
        List<Ticket> scope = refund.getReason() == Refund.Reason.PERFORMANCE_CANCEL
                ? ticketRepository.findByTicketOrder_TicketOrderId(order.getTicketOrderId())
                : List.of(refund.getTicket());
        Map<Long, Integer> released = new LinkedHashMap<>();
        for (Ticket ticket : scope) {
            if (ticket.getStatus() != Ticket.Status.ISSUED) {
                continue;
            }
            ticket.markCancelled();
            // sold_quantity 는 결과 기록이다(발급 시 addSold 와 짝).
            ticket.getTicketType().restore(1);
            released.merge(ticket.getTicketType().getTicketTypeId(), 1, Integer::sum);
        }
        if (!released.isEmpty()) {
            ticketStock.release(order.getPerformance().getPerformanceId(), released);
        }
        boolean allCancelled = ticketRepository
                .findByTicketOrder_TicketOrderId(order.getTicketOrderId()).stream()
                .allMatch(ticket -> ticket.getStatus() == Ticket.Status.CANCELLED);
        if (allCancelled && order.getStatus() != TicketOrder.Status.REFUNDED) {
            order.markRefunded();
        }
    }

    /**
     * 공연 취소의 마지막 조각 — <b>보증금 반환</b>({@code returnDeposit}).
     *
     * <p>컨트랙트가 {@code escrow == 0}을 요구하므로(2026-09-07 M-04) <b>전 건 환불이 끝난
     * 뒤에만</b> 보낼 수 있다. 그 순간을 아는 자리가 여기다 — 접수 시점(API-performance-12)에
     * 보내면 {@code InsufficientEscrow}로 revert한다. 정상 정산의 보증금 반환은 그쪽
     * ({@code SettlementConfirmationService.applyRelease})이 맡으므로 <b>취소된 공연만</b> 본다.
     *
     * <p><b>부르는 자리는 {@link #sweepCancelledDepositReturns} 하나다.</b> 종전에는 refund·halt
     * 확정이 직접 불렀는데, 그 둘은 단발이라 한 번 물러나면 다시 판정할 자리가 없었다 — 마지막
     * 환불 확정 순간 RPC 가 한 번 흔들리면 보증금이 영구히 {@code PAID} 로 굳는다
     * (MR !141 자동 리뷰 🔴). 주기 실행이라 조건이 맞을 때까지 다시 본다.
     */
    private boolean returnDepositIfCancelledAndDrained(Performance performance) {
        if (performance.getStatus() != Performance.Status.CANCELLED
                || performance.getDepositStatus() != Performance.DepositStatus.PAID
                || performance.getDepositAmount() == null || performance.getDepositAmount() <= 0) {
            return false;
        }
        Long performanceId = performance.getPerformanceId();
        // halt 가 온체인에서 확정된 뒤여야 한다. returnDeposit 은 stage ∈ {RELEASED, HALTED} 에서만
        // 통과하므로(RevenueSplitter.sol:870), HALT job 이 PENDING 이거나 revert·타임아웃으로
        // FAILED 인 채로 반환을 걸면 InvalidStage 로 revert 하고 죽은 job 이 고정 멱등키로 굳는다.
        // 판매 전 취소는 접수 즉시 CANCELLED 이고 환불 0건·에스크로 0 이라 이 검사가 없으면
        // 다음 스윕이 바로 걸어 버린다 — 종전 confirmHalt 훅은 이 조건을 구조적으로 보장했다
        // (MR !141 자동 리뷰 🔴).
        if (!chainJobRepository.existsByTargetPerformanceIdAndTxTypeAndStatusIn(
                performanceId, ChainJob.TxType.HALT, List.of(ChainJob.Status.CONFIRMED))) {
            log.debug("halt 확정 전이라 보증금 반환을 미룬다 (performanceId={})", performanceId);
            return false;
        }
        if (refundRepository.countByPerformanceAndStatusIn(performanceId,
                List.of(Refund.Status.PENDING, Refund.Status.PROCESSING)) > 0) {
            return false;
        }
        // 위 검사만으로는 부족하다 — 환불 행이 **아직 없는** 돈이 에스크로에 남을 수 있다.
        // 취소 접수의 planPerformanceCancel 은 그 시점의 PAID·REFUNDED 주문만 담으므로, 그때
        // PENDING_PAYMENT 였던 주문의 PURCHASE 가 halt 보다 먼저 확정되면(job id 오름차순) 결제가
        // 성립해 에스크로가 늘어나는데 환불 행은 0건이다. 그대로 반환을 걸면 returnDeposit 이
        // InsufficientEscrow 로 revert 하고, 멱등키가 고정이라 죽은 job 이 영영 재생된다
        // (S15P21B204-156).
        //
        // 두 검사의 역할이 다르다 — 위는 "행은 있는데 아직 안 나간 돈"(PENDING·PROCESSING 환불은
        // 금액이 이미 잡혀 있어 아래 계산에서는 0 으로 보인다), 아래는 "행조차 없는 돈"이다.
        //
        // 표 수로 세지 않는다. cancelTickets 는 ISSUED 만 CANCELLED 로 바꿔 입장 스캔이 있었던
        // USED 표가 환불 뒤에도 남고, 반대로 개별 취소로 CANCELLED 가 된 표도 50% 수수료를
        // 에스크로에 남긴다(MR !141 자동 리뷰). 금액이 정본이고 식은 RefundService 한 곳에 있다.
        long outstanding = refundService.outstandingRefundAmount(performanceId);
        if (outstanding > 0) {
            // 아직 관객에게 돌아갈 돈이 남았다. 다음 주기가 다시 본다 — 환불이 끝나면 0 이 된다.
            log.debug("취소 공연에 환불로 나갈 금액이 남아 보증금 반환을 미룬다 "
                    + "(performanceId={}, outstanding={})", performanceId, outstanding);
            return false;
        }
        // 마지막 판정은 체인이다. DB 로는 "행조차 없는 돈"을 못 본다 — confirmLatePurchase ·
        // confirmDuplicatePurchase 가 남긴 대금은 refund 행도 주문 전이도 없이 감사 로그
        // (refundRequired)에만 남아 위 계산에서 0 으로 보인다. 그 상태로 반환을 걸면
        // returnDeposit 이 escrow != 0 으로 revert 하고 죽은 job 이 고정 멱등키로 굳는다.
        // 읽을 수 없으면(체인 설정 없음) DB 판정만으로 진행하고, 읽었는데 남아 있거나 읽지
        // 못하면 미룬다 — 죽은 job 을 남기는 쪽보다 다음 주기를 기다리는 쪽이 낫다. 이 조회가
        // 확정 트랜잭션 밖에 있는 것이 중요하다(그 안이면 노드가 느린 만큼 티켓·주문 행 잠금을
        // 붙잡는다 — PerformanceService#cancel 이 requireEscrow 를 락 밖에 둔 것과 같은 이유다).
        if (chainReader.isAvailable()) {
            Optional<Long> escrow = chainReader.escrowOf(performance.onChainShowId());
            if (escrow.isEmpty() || escrow.get() > 0) {
                log.warn("에스크로가 비지 않아 보증금 반환을 미룬다 (performanceId={}, escrow={})",
                        performanceId, escrow.map(String::valueOf).orElse("읽지 못함"));
                return false;
            }
        }
        String key = depositReturnKey(performanceId);
        SettlementJobEnqueuer.Enqueued enqueued = jobEnqueuer.enqueue(
                ChainJob.TxType.DEPOSIT_RETURN, performanceId, performance.getDepositAmount(),
                key, null);
        if (!enqueued.replayed()) {
            log.info("취소 공연의 환불이 전부 끝났다 — 보증금 반환 job 을 넣는다 (performanceId={})",
                    performanceId);
            return true;
        }
        // 여기부터는 **이미 있는 job 을 되돌려받은 것**이다. 재생을 "걸었다"로 세면 주기 실행이
        // 매 분 성공 로그를 찍으면서 아무 tx 도 내보내지 않는다(MR !141 자동 리뷰 🔴).
        ChainJob previous = enqueued.job();
        if (previous.getStatus() != ChainJob.Status.FAILED) {
            // PENDING·SUBMITTED·CONFIRMED — 살아 있거나 이미 끝났다. 다음 주기가 다시 본다.
            return false;
        }
        // FAILED 는 되살릴 방법이 재생뿐이 아니다 — 워커는 PENDING 만 집으므로(ChainJobWorker)
        // 죽은 job 을 그대로 돌려주면 보증금이 영구히 PAID 로 굳는다. RELEASE 와 같은 선례대로
        // 멱등키를 접미로 밀어 새 job 을 만든다(SettlementService.releaseInternal).
        //
        // 두 번 나가도 안전하다: returnDeposit 은 stage ∈ {RELEASED, HALTED} + deposit > 0 에서만
        // 통과하므로, 첫 tx 가 사실은 성공했는데 서버가 FAILED 로 적은 경우 두 번째는
        // NoDepositToReturn 으로 revert 한다(RevenueSplitter.sol:874). 이중 반환이 되지 않는다.
        long attempts = chainJobRepository.countByIdempotencyKeyStartingWith(key + "#failed:") + 1;
        if (attempts >= DEPOSIT_RETURN_MAX_ATTEMPTS) {
            log.error("보증금 반환 재시도 상한 도달 — performanceId={} attempts={}/{} lastJobId={}"
                            + " reason={}. 자동 재시도를 멈춘다. 온체인 stage·deposit 을 확인하고"
                            + " 사람이 판단해야 한다.",
                    performanceId, attempts, DEPOSIT_RETURN_MAX_ATTEMPTS,
                    previous.getChainJobId(), previous.getFailureReason());
            return false;
        }
        previous.retireIdempotencyKey();
        chainJobRepository.saveAndFlush(previous);
        log.warn("DEPOSIT_RETURN job {} 이 FAILED 라 새 job 을 만든다 — performanceId={} attempts={}/{} reason={}",
                previous.getChainJobId(), performanceId, attempts, DEPOSIT_RETURN_MAX_ATTEMPTS,
                previous.getFailureReason());
        return !jobEnqueuer.enqueue(ChainJob.TxType.DEPOSIT_RETURN, performanceId,
                performance.getDepositAmount(), key, null).replayed();
    }

    private static String depositReturnKey(Long performanceId) {
        return "performance:cancel:deposit-return:" + performanceId;
    }

    /**
     * 취소됐는데 보증금이 아직 {@code PAID} 인 공연을 다시 판정한다 — 주기 실행
     * ({@code SettlementScheduler}).
     *
     * <p><b>왜 확정 경로가 아니라 여기인가.</b> 반환 조건(관객 환불 완료 · 에스크로 0)이 갖춰지는
     * 순간이 확정 한 번과 일치하지 않는다. refund·halt 확정은 단발이라 그때 조건이 안 맞으면
     * 다시 볼 자리가 없고, 체인 조회가 한 번 흔들리기만 해도 보증금이 영구히 {@code PAID} 로
     * 굳는다(MR !141 자동 리뷰 🔴). 주기 실행은 조건이 맞을 때까지 다시 본다.
     *
     * <p>덤으로 <b>체인 조회가 확정 트랜잭션 밖으로 나온다</b> — 확정 안에서 부르면 노드가 느린
     * 만큼 티켓·주문 행 잠금을 붙잡는다.
     *
     * <p>대상이 없으면 쿼리 한 번으로 끝난다. 취소 공연은 드물고, 반환이 확정되면
     * {@code deposit_status} 가 {@code RETURNED} 로 바뀌어 다음 주기부터 빠진다.
     *
     * @return 이번 주기에 새로 걸린 반환 job 수
     */
    @Transactional
    public int sweepCancelledDepositReturns() {
        List<Performance> candidates = performanceRepository.findByStatusAndDepositStatus(
                Performance.Status.CANCELLED, Performance.DepositStatus.PAID);
        int enqueued = 0;
        for (Performance performance : candidates) {
            if (returnDepositIfCancelledAndDrained(performance)) {
                enqueued++;
            }
        }
        return enqueued;
    }

    // ------------------------------------------------------------------ 공통

    /**
     * revert receipt → 기록할 {@link ErrorCode}.
     *
     * <p>워커가 계약 §4.6으로 번역한 이름이 있으면 그것을, 없거나 규격에 없는 이름이면
     * {@code PAYMENT_AMOUNT_MISMATCH}를 쓴다(이 카드까지의 동작).
     */
    private static ErrorCode revertCode(TxReceipt receipt) {
        String name = receipt == null ? null : receipt.failureCode();
        if (name == null || name.isBlank()) {
            return ErrorCode.PAYMENT_AMOUNT_MISMATCH;
        }
        try {
            return ErrorCode.valueOf(name.trim());
        } catch (IllegalArgumentException e) {
            log.warn("규격에 없는 revert 사유가 왔다 - 금액 불일치로 기록한다 ({})", name);
            return ErrorCode.PAYMENT_AMOUNT_MISMATCH;
        }
    }

    private Result fail(ChainJob job, ErrorCode code) {
        job.markFailed(code.getCode());
        return Result.failed(code);
    }

    /** 검증 2·3 — {@code to}는 언제나, {@code from}은 {@code USER} job에서만 대조한다. */
    private boolean addressMatches(ChainJob job, TxReceipt receipt) {
        String expectedTo = contractAddress(isYoYoCall(job.getTxType()));
        if (expectedTo != null && receipt.to() != null
                && !EthCrypto.sameAddress(expectedTo, receipt.to())) {
            return false;
        }
        if (job.getSignerType() != ChainJob.SignerType.USER || job.getWalletId() == null) {
            return true;
        }
        return walletRepository.findById(job.getWalletId())
                .map(Wallet::getAddress)
                .map(address -> receipt.from() == null
                        || EthCrypto.sameAddress(address, receipt.from()))
                .orElse(false);
    }

    /**
     * 그 tx가 <b>YoYo</b>로 가는가 <b>RevenueSplitter</b>로 가는가.
     *
     * <p>{@code APPROVE}(allowance 승인)와 {@code MINT}(시연용 지급)만 YoYo다 — 나머지 10종은
     * 전부 Splitter다. <b>{@code MINT}가 빠져 있으면</b> 지급 job의 {@code to}(YoYo)를 Splitter와
     * 대조하게 되어 <b>성공한 지급이 전부 확정 실패</b>가 된다. 워커가 이 자리를 부르기 전에는
     * 드러나지 않던 결함이다.
     */
    private static boolean isYoYoCall(ChainJob.TxType txType) {
        return txType == ChainJob.TxType.APPROVE || txType == ChainJob.TxType.MINT;
    }

    private String contractAddress(boolean yoyo) {
        ChainProperties.Contract contract = chainProperties.contract();
        if (contract == null) {
            return null;
        }
        String address = yoyo ? contract.yoyoAddress() : contract.splitterAddress();
        return address == null || address.isBlank() ? null : address;
    }

    /**
     * 결제 확정 시 티켓 발급 — 주문 항목의 수량만큼 만들고 {@code qr_secret}을 1회 생성한다.
     * 재생성 경로는 없다(SEC-07).
     */
    private List<Long> issueTickets(TicketOrder order, String purchaseTxHash) {
        List<Long> ids = new ArrayList<>();
        for (OrderItem item : order.getItems()) {
            for (int i = 0; i < item.getQuantity(); i++) {
                Ticket ticket = Ticket.builder()
                        .ticketOrder(order)
                        .ticketType(item.getTicketType())
                        .performance(order.getPerformance())
                        .member(order.getMember())
                        .purchasePrice(item.getUnitPrice())
                        .qrSecret(newQrSecret())
                        .build();
                ticket.recordOnChain(null, purchaseTxHash);
                ids.add(ticketRepository.save(ticket).getTicketId());
            }
            // sold_quantity 는 결과 기록이다. 경합 차단은 Redis 재고가 이미 했다.
            item.getTicketType().addSold(item.getQuantity());
        }
        ticketOrderRepository.save(order);
        return ids;
    }

    private static String newQrSecret() {
        byte[] secret = new byte[32];
        RANDOM.nextBytes(secret);
        return HexFormat.of().formatHex(secret);
    }

    /** 캐시가 없으면 만들지 않는다 — 원장은 체인이고 다음 조회에서 재구축된다(§0.12). */
    private void adjustBalance(Long walletId, long delta) {
        if (walletId == null || delta == 0) {
            return;
        }
        balanceCache.get(walletId).ifPresent(
                cached -> balanceCache.put(walletId, Math.max(0L, cached.balance() + delta)));
    }

    private static boolean numberEquals(TxReceipt.TxEvent event, String key, Long expected) {
        return expected != null && event.number(key).map(expected::equals).orElse(false);
    }

    private static boolean hexEquals(TxReceipt.TxEvent event, String key, String expected) {
        return expected != null && event.text(key)
                .map(actual -> normalize(actual).equals(normalize(expected))).orElse(false);
    }

    private static boolean addressEquals(TxReceipt.TxEvent event, String key, String expected) {
        return event.text(key).map(actual -> EthCrypto.sameAddress(actual, expected)).orElse(false);
    }

    private static String normalize(String hex) {
        String t = hex.trim().toLowerCase();
        return t.startsWith("0x") ? t : "0x" + t;
    }

    /** 같은 tx인가 — 둘 다 있고 해시가 같을 때만 참이다({@code null}은 "모른다"이지 같음이 아니다). */
    private static boolean sameTxHash(String left, String right) {
        return left != null && right != null && normalize(left).equals(normalize(right));
    }
}
