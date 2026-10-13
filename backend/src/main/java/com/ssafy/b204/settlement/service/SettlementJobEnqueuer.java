package com.ssafy.b204.settlement.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.repository.SettlementMemberRepository;
import java.util.Objects;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 운영자 tx를 {@code chain_job}에 넣는 유일한 입구(정산 도메인 한정).
 *
 * <p><b>요청 스레드에서 전송하지 않는다.</b> 여기서 하는 일은 행을 하나 INSERT하는 것뿐이고, 서명·
 * nonce·전송은 이강륜의 워커가 지갑별 단일 큐로 처리한다(API v6 §0.3). 그래서 이 메서드는 202
 * 응답의 근거만 만든다.
 *
 * <p>지금 {@code ChainJobService.enqueue}가 없어서 엔티티를 직접 만든다(open-questions D-5 —
 * coin 브랜치도 같다). {@code enqueue(ChainJobRequest)}가 열리면 이 클래스의 몸통 한 줄이 그 호출로
 * 바뀌고 호출부는 그대로다.
 *
 * <p>또 하나 알고 시작할 것 — {@code OperatorTxBuilder} 구현체가 아직 없어서 여기서 넣은 job은
 * 워커가 집어가지 않고 {@code PENDING}으로 남는다. <b>워커의 의도된 동작이지 버그가 아니다</b>
 * (그 인터페이스의 javadoc). 구현체가 붙으면 쌓인 job이 그대로 처리된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SettlementJobEnqueuer {

    /** {@code jobId} 문자열 규약 — coin 브랜치와 같다(D-7). API-chain-01이 이 문자열을 되판다. */
    public static final String JOB_ID_PREFIX = "chain_";

    private final SettlementChainJobRepository chainJobRepository;
    private final SettlementMemberRepository memberRepository;

    /**
     * @param replayed 같은 멱등키로 이미 만들어진 job을 되돌려 준 경우 {@code true} — 새 tx가 생기지 않았다
     */
    public record Enqueued(String jobId, ChainJob job, boolean replayed) {}

    /**
     * @param amount 참고용(정산 총액·보증금). 체인 인자는 워커가 도메인에서 다시 읽는다
     * @param requesterMemberId 자동 스케줄이면 {@code null}
     */
    public Enqueued enqueue(ChainJob.TxType txType, Long performanceId, Long amount,
                            String idempotencyKey, Long requesterMemberId) {
        return enqueue(txType, performanceId, amount, idempotencyKey, requesterMemberId, null);
    }

    /**
     * @param walletId 그 tx가 움직이는 <b>지갑</b>. 환불처럼 <b>수신 지갑</b>이 있는 유형은 반드시
     *                 채운다 — API-wallet-02의 거래 목록이 {@code chain_job.wallet_id}로 조회하고
     *                 ({@code findByWalletIdAndTxTypeIn}) 확정 시 잔액 갱신도 이 값을 쓴다
     *                 ({@code ChainJobWorker.confirmDomain}). 비워 두면 <b>환불이 지갑 내역에
     *                 나타나지 않는다</b>. 정산·집계처럼 지갑이 여럿이거나 없는 유형은 {@code null}
     */
    public Enqueued enqueue(ChainJob.TxType txType, Long performanceId, Long amount,
                            String idempotencyKey, Long requesterMemberId, Long walletId) {
        Optional<ChainJob> existing = chainJobRepository.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            ChainJob job = existing.get();
            // 같은 키인데 대상이 다르면 클라이언트가 키를 재사용한 것이다. 조용히 다른 tx를 만들지 않는다.
            if (job.getTxType() != txType
                    || !Objects.equals(job.getTargetPerformanceId(), performanceId)) {
                throw ErrorCode.COMMON_CONFLICT.toException(
                        "같은 요청 키가 다른 작업에 이미 사용되었습니다.");
            }
            return new Enqueued(jobId(job.getChainJobId()), job, true);
        }

        Member requester = requesterMemberId == null
                ? null : memberRepository.findById(requesterMemberId).orElse(null);

        ChainJob job = chainJobRepository.save(ChainJob.builder()
                .txType(txType)
                .signerType(ChainJob.SignerType.OPERATOR)
                .feeDelegated(false)
                .issuerType(ChainJob.IssuerType.MOCK)
                .requester(requester)
                .walletId(walletId)
                .targetPerformanceId(performanceId)
                .amount(amount)
                .idempotencyKey(idempotencyKey)
                .build());

        log.info("chain_job 생성 — type={} performanceId={} jobId={}",
                txType, performanceId, jobId(job.getChainJobId()));
        return new Enqueued(jobId(job.getChainJobId()), job, false);
    }

    public static String jobId(Long chainJobId) {
        return JOB_ID_PREFIX + chainJobId;
    }
}
