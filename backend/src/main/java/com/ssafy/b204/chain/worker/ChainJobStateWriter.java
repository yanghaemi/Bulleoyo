package com.ssafy.b204.chain.worker;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.refund.repository.RefundRepository;
import com.ssafy.b204.rule.entity.RuleAgreement;
import com.ssafy.b204.rule.repository.RuleAgreementRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * chain_job 상태 전이만 하는 얇은 트랜잭션 경계.
 *
 * <p>워커는 {@code @Scheduled} 스레드와 지갑 큐 스레드에서 도는데, 그 스레드에는 영속성 컨텍스트가
 * 없다. 전이마다 <b>짧은 트랜잭션</b>을 새로 열어 처리하고, 체인 호출(수 초)은 트랜잭션 밖에 둔다 —
 * RPC를 트랜잭션 안에서 기다리면 커넥션 풀이 그대로 잠긴다.
 *
 * <p>{@code REQUIRES_NEW}를 쓰는 이유: 호출부가 트랜잭션을 들고 있든 아니든 상태 전이는 즉시
 * 커밋돼야 한다. 전송은 성공했는데 바깥 트랜잭션이 롤백돼 {@code PENDING}으로 남으면 <b>같은 tx를
 * 두 번 보낸다</b>.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ChainJobStateWriter {

    private final ChainJobRepository chainJobRepository;
    private final RefundRepository refundRepository;
    private final RuleAgreementRepository ruleAgreementRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markSubmitted(Long chainJobId, String txHash) {
        chainJobRepository.findById(chainJobId).ifPresent(job -> {
            job.markSubmitted(txHash);
            log.info("chain_job {} SUBMITTED txHash={}", chainJobId, txHash);
        });
    }

    /**
     * @param confirmations 확정 시점의 확인 블록 수. Kairos 블록 시간이 1초라 1이면 충분하다
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markConfirmed(Long chainJobId, String txHash, int confirmations) {
        chainJobRepository.findById(chainJobId).ifPresent(job -> {
            job.markConfirmed(txHash, confirmations);
            log.info("chain_job {} CONFIRMED txHash={}", chainJobId, txHash);
        });
    }

    /**
     * @param failureReason {@link com.ssafy.b204.chain.service.ChainFailure} 규약 문자열
     *                      ({@code CODE} 또는 {@code CODE#0xselector})
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long chainJobId, String failureReason) {
        // 잠금 읽기 + 종단 가드 — 다른 인스턴스의 확정이 커밋을 기다리는 중이면 그 뒤의 CONFIRMED
        // 를 보고 멈춘다. 잠금 없이 읽으면 스냅숏의 SUBMITTED 로 FAILED 를 덮는다(S15P21B204-119).
        chainJobRepository.findByIdForUpdate(chainJobId).filter(job -> !job.isTerminal()).ifPresent(job -> {
            job.markFailed(failureReason);
            log.warn("chain_job {} FAILED reason={}", chainJobId, failureReason);
            applyRefundFailure(job);
            applyAgreementFailure(job);
        });
    }

    /**
     * 재시도 카운트를 올리고, 한도를 넘었으면 {@code FAILED}로 고정한다.
     *
     * <p>§0.3 — OPERATOR job만 자동 재시도 대상이고 최대 3회다(REL-09). {@code USER} job은 서버가
     * 발신자 서명을 다시 만들 수 없어 여기 오지 않는다.
     *
     * @return 더 재시도할 수 있으면 {@code true}
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean retryOrFail(Long chainJobId, int maxRetry, ErrorCode reason) {
        // markFailed 와 같은 이유로 잠금 읽기 + 종단 가드(S15P21B204-119).
        ChainJob job = chainJobRepository.findByIdForUpdate(chainJobId).orElse(null);
        if (job == null || job.isTerminal()) {
            return false;
        }
        job.increaseRetry();
        // `>` 다 — REL-09는 "최대 3회 자동 재시도"이지 "최대 3회 시도"가 아니다. `>=`로 두면
        // 최초 전송 + 재시도 2회로 끝나 규약보다 한 번 덜 시도한다.
        if (job.getRetryCount() > maxRetry) {
            job.markFailed(reason.name());
            log.warn("chain_job {} 재시도 {}회 소진 — FAILED({})", chainJobId, maxRetry, reason.name());
            applyRefundFailure(job);
            applyAgreementFailure(job);
            return false;
        }
        log.info("chain_job {} 재시도 {}회차", chainJobId, job.getRetryCount());
        return true;
    }

    /**
     * {@code REFUND} job 이 닫히면 그 {@code refund} 도 같이 닫는다 — <b>같은 트랜잭션</b>이다.
     *
     * <p>이것이 없어서 2026-09-17 리허설의 환불 한 건이 job 은 {@code FAILED}, {@code refund} 는
     * {@code PROCESSING} 으로 갈렸다. 그 잔류가 ① 같은 표의 재요청 ② 공연 취소 일괄 환불의 남은
     * 금액 계산 ③ 보증금 반환 시점 판정을 모두 막는다(S15P21B204-147).
     *
     * <p>이벤트가 아니라 직접 호출인 이유는 <b>원자성</b>이다. 커밋 사이에 프로세스가 죽으면 같은
     * 갈림이 다시 생긴다. 잠금 순서도 다른 경로와 같다({@code chain_job} → {@code refund}) —
     * 확정 경로({@code ChainJobConfirmationService.confirmRefund})가 이미 그 순서다.
     *
     * <p>다른 {@code tx_type} 은 건드리지 않는다. 확정·실패에 따르는 도메인 전이 규칙이 종류마다
     * 다르고(예: {@code MINT} 의 {@code GrantRefUsed} 는 실패가 아니라 동기화다), 여기는 상태 전이만
     * 하는 자리다. 놓친 갈림은 {@code RefundScheduler} 의 1분 스윕이 뒤에서 한 번 더 잡는다.
     */
    private void applyRefundFailure(ChainJob job) {
        if (job.getTxType() != ChainJob.TxType.REFUND) {
            return;
        }
        refundRepository.findByChainJobId(job.getChainJobId()).ifPresent(refund -> {
            if (refund.getStatus() == Refund.Status.COMPLETED) {
                return;
            }
            refund.markFailed();
            log.warn("환불 {} FAILED — chain_job {} 이 닫혔다", refund.getRefundId(), job.getChainJobId());
        });
    }

    /**
     * {@code AGREE} job 이 닫히면 그 {@code rule_agreement} 를 {@code PENDING} 으로 되돌린다 —
     * <b>같은 트랜잭션</b>이다.
     *
     * <p>{@code applyRefundFailure} 와 같은 결함의 rule 판이다(장부 D-81). 동의는 RLP 를 받은
     * 시점에 {@code SIGNING} 이 되는데, 그 job 이 전송·재시도 소진으로 닫혀도 동의는 그대로
     * {@code SIGNING} 에 남았다. P-06 화면의 {@code nextAction} 이 {@code WAIT} 로 굳어
     * "서명 확인 중" 에서 멈추고 재서명 버튼이 열리지 않는다 — 그 팀 하나 때문에 판매 시작
     * ({@code RULE_NOT_AGREED_BY_ALL})까지 막힌다. rule_05 명세는 "검증 실패는 {@code PENDING}
     * 으로 되돌리고 {@code chain_job} 을 {@code FAILED} 로 고정한다" 이므로 <b>문서가 맞고 코드가
     * 틀렸다.</b>
     *
     * <p>여기서 보는 조건은 "{@code AGREE} job 인가" 하나다. 나머지 둘({@code SIGNING} 일 것 ·
     * {@code chain_job_id} 가 이 job 일 것)은 {@link RuleAgreement#resetIfSigningFor(Long)} 이
     * 본다 — 같은 판정을 세 자리(전송 실패·확정 실패·스윕)에 복사해 두면 어긋난다. 되돌린 동의는
     * {@code agreedRulesHash}·{@code chainJobId}·{@code agreeTxHash}·{@code agreedAt} 이 비고
     * rule-03({@code prepare}) → rule-05 를 처음부터 다시 탄다.
     *
     * <p>놓친 갈림({@code fail()} 밖의 경로, 전이 도중 프로세스 종료)은
     * {@code RuleAgreementScheduler} 의 60초 스윕이 뒤에서 한 번 더 잡는다.
     */
    private void applyAgreementFailure(ChainJob job) {
        if (job.getTxType() != ChainJob.TxType.AGREE
                || job.getTargetPerformanceId() == null || job.getTargetTeamId() == null) {
            return;
        }
        ruleAgreementRepository.findByPerformance_PerformanceIdAndTeam_TeamId(
                job.getTargetPerformanceId(), job.getTargetTeamId()).ifPresent(agreement -> {
            if (agreement.resetIfSigningFor(job.getChainJobId())) {
                log.warn("규칙 동의 {} PENDING 으로 되돌렸다 — chain_job {} 이 닫혔다",
                        agreement.getRuleAgreementId(), job.getChainJobId());
            }
        });
    }
}
