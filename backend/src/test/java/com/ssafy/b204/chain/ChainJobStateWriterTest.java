package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.worker.ChainJobStateWriter;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.refund.repository.RefundRepository;
import com.ssafy.b204.rule.entity.RuleAgreement;
import com.ssafy.b204.rule.repository.RuleAgreementRepository;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 재시도 한도의 경계 — 비기능 REL-09 "OPERATOR job은 큐에서 <b>최대 3회 자동 재시도</b>".
 *
 * <p>경계가 하나 어긋나면 tx를 한 번 덜 보내거나 한 번 더 보낸다. 후자는 돈이 두 번 움직일 수 있는
 * 자리라 숫자로 못 박아 둔다.
 */
class ChainJobStateWriterTest {

    @Test
    @DisplayName("재시도는 3회까지 허용하고 4번째 실패에서 FAILED로 고정한다")
    void allowsThreeRetriesThenFails() {
        ChainJob job = ChainJob.builder()
                .txType(ChainJob.TxType.MINT)
                .signerType(ChainJob.SignerType.OPERATOR)
                .build();
        ChainJobRepository repository = mock(ChainJobRepository.class);
        given(repository.findByIdForUpdate(1L)).willReturn(Optional.of(job));
        ChainJobStateWriter writer = new ChainJobStateWriter(repository,
                mock(RefundRepository.class), mock(RuleAgreementRepository.class));

        // 최초 전송 실패 → 재시도 1·2·3회차까지는 살아 있다.
        for (int attempt = 1; attempt <= 3; attempt++) {
            assertThat(writer.retryOrFail(1L, 3, ErrorCode.CHAIN_NONCE_CONFLICT)).isTrue();
            assertThat(job.getStatus()).isEqualTo(ChainJob.Status.PENDING);
        }

        assertThat(writer.retryOrFail(1L, 3, ErrorCode.CHAIN_NONCE_CONFLICT)).isFalse();
        assertThat(job.getStatus()).isEqualTo(ChainJob.Status.FAILED);
        assertThat(job.getFailureReason()).isEqualTo(ErrorCode.CHAIN_NONCE_CONFLICT.name());

        // 종단이면 카운트도 사유도 건드리지 않는다(S15P21B204-119).
        assertThat(writer.retryOrFail(1L, 3, ErrorCode.COMMON_INTERNAL_ERROR)).isFalse();
        assertThat(job.getRetryCount()).isEqualTo(4);
        assertThat(job.getFailureReason()).isEqualTo(ErrorCode.CHAIN_NONCE_CONFLICT.name());
    }

    @Test
    @DisplayName("REFUND job 이 닫히면 같은 트랜잭션에서 refund 도 FAILED 가 된다")
    void closesRefundWhenRefundJobFails() {
        ChainJob job = ChainJob.builder()
                .txType(ChainJob.TxType.REFUND)
                .signerType(ChainJob.SignerType.OPERATOR)
                .build();
        Refund refund = mock(Refund.class);
        given(refund.getStatus()).willReturn(Refund.Status.PROCESSING);
        ChainJobRepository repository = mock(ChainJobRepository.class);
        given(repository.findByIdForUpdate(7L)).willReturn(Optional.of(job));
        RefundRepository refunds = mock(RefundRepository.class);
        given(refunds.findByChainJobId(job.getChainJobId())).willReturn(Optional.of(refund));

        new ChainJobStateWriter(repository, refunds, mock(RuleAgreementRepository.class))
                .markFailed(7L, ErrorCode.COMMON_INTERNAL_ERROR.name());

        assertThat(job.getStatus()).isEqualTo(ChainJob.Status.FAILED);
        verify(refund).markFailed();
    }

    @Test
    @DisplayName("REFUND·AGREE 가 아닌 job 의 실패는 환불·동의를 조회하지도 않는다")
    void doesNotTouchRefundForOtherTxTypes() {
        ChainJob job = ChainJob.builder()
                .txType(ChainJob.TxType.MINT)
                .signerType(ChainJob.SignerType.OPERATOR)
                .build();
        ChainJobRepository repository = mock(ChainJobRepository.class);
        given(repository.findByIdForUpdate(8L)).willReturn(Optional.of(job));
        RefundRepository refunds = mock(RefundRepository.class);
        RuleAgreementRepository agreements = mock(RuleAgreementRepository.class);

        new ChainJobStateWriter(repository, refunds, agreements)
                .markFailed(8L, ErrorCode.CHAIN_TX_TIMEOUT.name());

        verifyNoInteractions(refunds);
        verifyNoInteractions(agreements);
    }

    // ================================================ AGREE job 실패 → 동의 되돌림 (장부 D-81)

    @Test
    @DisplayName("AGREE job 이 닫히면 같은 트랜잭션에서 동의가 SIGNING → PENDING 이 된다")
    void revertsAgreementWhenAgreeJobFails() {
        ChainJob job = agreeJob(11L);
        RuleAgreement agreement = signingAgreement(11L);

        writerFor(job, agreement).markFailed(11L, ErrorCode.CHAIN_TX_TIMEOUT.name());

        assertThat(job.getStatus()).isEqualTo(ChainJob.Status.FAILED);
        assertThat(agreement.getStatus()).isEqualTo(RuleAgreement.Status.PENDING);
        // reset() 이 서명 흔적까지 지운다 — 남으면 다음 prepare 가 옛 해시를 물고 간다.
        assertThat(agreement.getChainJobId()).isNull();
        assertThat(agreement.getAgreedRulesHash()).isNull();
    }

    @Test
    @DisplayName("이미 AGREED 인 동의는 AGREE job 이 닫혀도 그대로다")
    void keepsAgreedAgreement() {
        ChainJob job = agreeJob(12L);
        RuleAgreement agreement = signingAgreement(12L);
        agreement.markAgreed("0x" + "cd".repeat(32));

        writerFor(job, agreement).markFailed(12L, ErrorCode.CHAIN_TX_TIMEOUT.name());

        // receipt 로 확정된 동의를 실패한 job 이 지우면 잠긴 합의가 조용히 풀린다.
        assertThat(agreement.getStatus()).isEqualTo(RuleAgreement.Status.AGREED);
        assertThat(agreement.getAgreeTxHash()).isNotNull();
    }

    @Test
    @DisplayName("다른 job 으로 다시 서명 중인 동의는 옛 job 의 실패에 흔들리지 않는다")
    void keepsAgreementSignedByAnotherJob() {
        ChainJob job = agreeJob(13L);
        // 규칙이 바뀌어 reset 된 뒤 새 job(99)으로 다시 서명 중이다.
        RuleAgreement agreement = signingAgreement(99L);

        writerFor(job, agreement).markFailed(13L, ErrorCode.CHAIN_TX_TIMEOUT.name());

        assertThat(agreement.getStatus()).isEqualTo(RuleAgreement.Status.SIGNING);
        assertThat(agreement.getChainJobId()).isEqualTo(99L);
    }

    /** {@code chain_job_id} 는 IDENTITY 라 빌더로 정할 수 없다 — 되돌림 판정의 입력이라 박아 둔다. */
    private static ChainJob agreeJob(long chainJobId) {
        ChainJob job = ChainJob.builder()
                .txType(ChainJob.TxType.AGREE)
                .signerType(ChainJob.SignerType.USER)
                .targetPerformanceId(1L)
                .targetTeamId(2L)
                .build();
        ReflectionTestUtils.setField(job, "chainJobId", chainJobId);
        return job;
    }

    private static RuleAgreement signingAgreement(long chainJobId) {
        RuleAgreement agreement = RuleAgreement.builder().build();
        agreement.markSigning(chainJobId, "0x" + "ab".repeat(32));
        return agreement;
    }

    private static ChainJobStateWriter writerFor(ChainJob job, RuleAgreement agreement) {
        ChainJobRepository repository = mock(ChainJobRepository.class);
        given(repository.findByIdForUpdate(job.getChainJobId())).willReturn(Optional.of(job));
        RuleAgreementRepository agreements = mock(RuleAgreementRepository.class);
        given(agreements.findByPerformance_PerformanceIdAndTeam_TeamId(
                job.getTargetPerformanceId(), job.getTargetTeamId()))
                .willReturn(Optional.of(agreement));
        return new ChainJobStateWriter(repository, mock(RefundRepository.class), agreements);
    }
}
