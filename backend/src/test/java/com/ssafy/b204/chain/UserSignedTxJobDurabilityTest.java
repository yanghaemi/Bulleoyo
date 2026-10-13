package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.FeeDelegationService;
import com.ssafy.b204.chain.service.SignRequestFactory;
import com.ssafy.b204.chain.service.UserSignedTxJobWriter;
import com.ssafy.b204.chain.service.UserSignedTxService;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.support.IntegrationTestBase;
import java.math.BigInteger;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.web3j.crypto.transaction.type.TxType;

/**
 * <b>{@code chain_job}은 대납 전송보다 오래 산다</b> — MR !60 리뷰 지적 ②.
 *
 * <p>버그의 모양은 이랬다. {@code UserSignedTxService.accept}가 {@code @Transactional}이고 그
 * 안에서 {@code chain_job}을 저장한 뒤 체인 노드로 RPC를 보냈다. 전송이 실패하면
 * {@code job.markFailed(...)} 후 {@code CHAIN_GAS_INSUFFICIENT}를 던지는데 언체크 예외라
 * <b>트랜잭션 전체가 롤백돼 job 생성과 실패 기록이 함께 사라졌다.</b> 운영자가 "대납 지갑 KAIA
 * 부족"으로 실패한 건을 DB에서 찾을 수 없었다. API v6 §0.4 실패 표는 그 반대를 요구한다.
 *
 * <blockquote>③ 전송 · 노드 오류·대납 잔액 부족 → {@code chain_job} {@code FAILED} +
 * {@code CHAIN_GAS_INSUFFICIENT}(운영지갑 KAIA 부족은 알림 대상)</blockquote>
 *
 * <p><b>실물 DB 위에서 본다.</b> Testcontainers MySQL + Flyway V1 스키마 + 실제
 * {@link UserSignedTxJobWriter} 빈(프록시)이 돌고, 바뀌는 것은 체인 노드 자리
 * ({@link FeeDelegationService} 목) 하나다. 트랜잭션 롤백을 <b>진짜로</b> 일으키기 위해
 * {@link TransactionTemplate}로 호출부 트랜잭션을 흉내내고, 검증은 JPA 세션을 거치지 않는
 * {@link JdbcTemplate}로 한다 — 영속성 컨텍스트 캐시가 아니라 <b>커밋된 행</b>을 봐야 한다.
 */
class UserSignedTxJobDurabilityTest extends IntegrationTestBase {

    private static final String YOYO = "0xA5d7031D70DAab33EACDfC912baC0668D5776e5b";
    private static final String FEE_PAYER = "0xfbB324CC674dD2FF21Dff670404391e78F4a199f";
    private static final String SENDER = "0x1234567890abcdef1234567890abcdef12345678";
    private static final String CALLDATA = "0x095ea7b3deadbeef";

    @Autowired
    private ChainJobRepository chainJobRepository;

    @Autowired
    private UserSignedTxJobWriter jobWriter;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private FeeDelegationService feeDelegation;
    private UserSignedTxService service;
    private Member requester;

    @BeforeEach
    void setUp() {
        feeDelegation = mock(FeeDelegationService.class);
        SignRequestFactory signRequestFactory = mock(SignRequestFactory.class);
        given(signRequestFactory.feePayerAddress()).willReturn(FEE_PAYER);

        service = new UserSignedTxService(chainJobRepository, feeDelegation, signRequestFactory,
                jobWriter);

        // FK 부모는 바깥 트랜잭션과 무관하게 이미 커밋돼 있어야 한다 — REQUIRES_NEW 는 다른
        // 커넥션이라 커밋 전 행을 보지 못한다.
        requester = memberRepository.save(Member.builder()
                .email("usertx-" + UUID.randomUUID() + "@b204.test")
                .name("Alex Kim")
                .authProvider(Member.AuthProvider.GOOGLE)
                .providerUserId(UUID.randomUUID().toString())
                .countryCode("KR")
                .build());
    }

    // ================================================================ ① 전송 실패

    /**
     * <b>이 클래스의 핵심.</b> 전송이 실패하고 호출부 트랜잭션이 롤백돼도 실패 이력이 남는다.
     *
     * <p>롤백을 흉내내는 것이 아니라 실제로 일으킨다 — {@code CHAIN_GAS_INSUFFICIENT}가
     * {@link TransactionTemplate#execute} 밖으로 나가면 그 트랜잭션은 롤백된다. 예전 코드에서는
     * 이 시점에 {@code chain_job} 행 자체가 사라졌다.
     */
    @Test
    @DisplayName("대납 전송이 실패하면 호출부 트랜잭션이 롤백돼도 chain_job 이 FAILED 로 남는다")
    void failedSubmitSurvivesCallerRollback() {
        String rlp = randomRlp();
        given(feeDelegation.isAvailable()).willReturn(true);
        given(feeDelegation.decode(rlp)).willReturn(decoded());
        // 운영지갑 KAIA 부족의 모양 — web3j 가 언체크 예외로 올려 준다.
        given(feeDelegation.submit(anyString(), any()))
                .willThrow(new RuntimeException("insufficient funds of the fee payer"));

        TransactionTemplate callerTx = new TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> callerTx.execute(status -> service.accept(rlp, expectation())))
                .isInstanceOf(BusinessException.class)
                // 응답 계약은 그대로다 — 클라이언트가 받는 것이 달라지지 않는다(§0.4 실패 표).
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.CHAIN_GAS_INSUFFICIENT);

        Map<String, Object> row = rowOf(rlp);
        assertThat(row)
                .withFailMessage("전송 실패 이력이 롤백과 함께 사라졌다 — 운영자가 대납 지갑 "
                        + "KAIA 부족을 DB 에서 추적할 수 없다(API v6 §0.4 ③ 전송 행).")
                .isNotNull();
        assertThat(row.get("status")).isEqualTo("FAILED");
        assertThat(row.get("failure_reason")).isEqualTo(ErrorCode.CHAIN_GAS_INSUFFICIENT.getCode());
        assertThat(row.get("tx_hash")).isNull();
        assertThat(row.get("signer_type")).isEqualTo("USER");
        // 발신자 서명 RLP 가 남아 있어야 운영자가 무엇을 보내려 했는지 되짚을 수 있다.
        assertThat(row.get("sender_signed_rlp")).isEqualTo(rlp);
    }

    @Test
    @DisplayName("같은 RLP를 재보고해도 FAILED job은 감사 이력으로 밀고 새 job으로 다시 전송한다")
    void retriesSameRlpAfterFailedJob() {
        String rlp = randomRlp();
        String txHash = "0x" + "cd".repeat(32);
        String key = UserSignedTxService.idempotencyKey(rlp);
        given(feeDelegation.isAvailable()).willReturn(true);
        given(feeDelegation.decode(rlp)).willReturn(decoded());
        given(feeDelegation.submit(anyString(), any()))
                .willThrow(new RuntimeException("temporary fee payer outage"))
                .willReturn(txHash);

        TransactionTemplate callerTx = new TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> callerTx.execute(status -> service.accept(rlp, expectation())))
                .isInstanceOf(BusinessException.class);
        Long failedJobId = jdbc.queryForObject(
                "SELECT chain_job_id FROM chain_job WHERE idempotency_key = ?", Long.class, key);

        UserSignedTxService.Accepted retried =
                callerTx.execute(status -> service.accept(rlp, expectation()));

        assertThat(retried.replayed()).isFalse();
        assertThat(retried.job().getChainJobId()).isNotEqualTo(failedJobId);
        assertThat(retried.job().getStatus()).isEqualTo(ChainJob.Status.SUBMITTED);
        assertThat(retried.job().getTxHash()).isEqualTo(txHash);
        assertThat(jdbc.queryForObject(
                "SELECT idempotency_key FROM chain_job WHERE chain_job_id = ?",
                String.class, failedJobId)).isEqualTo(key + "#failed:" + failedJobId);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM chain_job WHERE idempotency_key = ?",
                Integer.class, key)).isOne();
    }

    @Test
    @DisplayName("도메인 링크가 이전 job을 가리켜도 연속 FAILED RLP를 retire하고 끝내 재전송한다")
    void retriesSameRlpAfterConsecutiveFailuresWithStaleReplayLink() {
        String rlp = randomRlp();
        String txHash = "0x" + "ef".repeat(32);
        String key = UserSignedTxService.idempotencyKey(rlp);
        UserSignedTxService.Expectation staleLinkExpectation =
                new UserSignedTxService.Expectation(ChainJob.TxType.APPROVE, YOYO, CALLDATA,
                        SENDER, requester, null, null, null, 50_000L, existing -> false);
        given(feeDelegation.isAvailable()).willReturn(true);
        given(feeDelegation.decode(rlp)).willReturn(decoded());
        given(feeDelegation.submit(anyString(), any()))
                .willThrow(new RuntimeException("first temporary outage"))
                .willThrow(new RuntimeException("second temporary outage"))
                .willReturn(txHash);

        TransactionTemplate callerTx = new TransactionTemplate(transactionManager);
        assertThatThrownBy(
                () -> callerTx.execute(status -> service.accept(rlp, staleLinkExpectation)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(
                () -> callerTx.execute(status -> service.accept(rlp, staleLinkExpectation)))
                .isInstanceOf(BusinessException.class);

        UserSignedTxService.Accepted recovered =
                callerTx.execute(status -> service.accept(rlp, staleLinkExpectation));

        assertThat(recovered.replayed()).isFalse();
        assertThat(recovered.job().getStatus()).isEqualTo(ChainJob.Status.SUBMITTED);
        assertThat(recovered.job().getTxHash()).isEqualTo(txHash);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM chain_job WHERE sender_signed_rlp = ?",
                Integer.class, rlp)).isEqualTo(3);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM chain_job WHERE idempotency_key LIKE ?",
                Integer.class, key + "#failed:%")).isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM chain_job WHERE idempotency_key = ?",
                Integer.class, key)).isOne();
    }

    /**
     * 전송이 실패했으니 도메인 상태는 <b>전이되지 않아야</b> 한다 — 그것이 롤백의 목적이다.
     * 남는 것은 {@code chain_job} 하나뿐이라는 뜻을 함께 못 박는다.
     *
     * <p>도메인 쓰기의 대역으로 <b>다른 회원 행을 새로 넣는다.</b> 세 호출부(payment ·
     * performance-14 · rule-05)가 {@code accept} 뒤에 쓰는 것은
     * {@code payment}·{@code rule_agreement}이고, 그것들은
     * {@code chain_job}의 FK 부모가 아니다 — {@link UserSignedTxJobWriter} 클래스 주석의
     * "호출부가 지켜야 하는 것" 참고.
     */
    @Test
    @DisplayName("전송 실패 시 같은 트랜잭션의 도메인 쓰기는 롤백된다 — 남는 것은 chain_job 뿐이다")
    void domainWritesStillRollBackOnFailure() {
        String rlp = randomRlp();
        String marker = "rolled-back-" + UUID.randomUUID() + "@b204.test";
        given(feeDelegation.isAvailable()).willReturn(true);
        given(feeDelegation.decode(rlp)).willReturn(decoded());
        given(feeDelegation.submit(anyString(), any()))
                .willThrow(new RuntimeException("insufficient funds of the fee payer"));

        TransactionTemplate callerTx = new TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> callerTx.execute(status -> {
            jdbc.update("INSERT INTO member (email, name, auth_provider, provider_user_id,"
                            + " country_code, status, is_admin) VALUES (?,?,?,?,?,?,?)",
                    marker, "Rolled Back", "GOOGLE", UUID.randomUUID().toString(),
                    "KR", "ACTIVE", false);
            return service.accept(rlp, expectation());
        })).isInstanceOf(BusinessException.class);

        assertThat(rowOf(rlp)).isNotNull();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM member WHERE email = ?",
                Integer.class, marker)).isZero();
    }

    // ================================================================ ② 전송 성공

    /**
     * 반대 방향도 고정한다. tx가 실제로 체인에 나갔으면 <b>기록이 반드시 남아야</b> 한다 —
     * "전송은 나갔는데 기록이 없다"가 이 설계에서 피하려는 창이다. 바깥이 무슨 이유로 롤백해도
     * {@code SUBMITTED} + {@code txHash}는 남고, 확정 워커가 그 해시로 receipt를 잇는다.
     */
    @Test
    @DisplayName("전송에 성공하면 호출부가 롤백해도 SUBMITTED·txHash 가 남는다 — 확정 워커가 이어받는다")
    void submittedStateSurvivesCallerRollback() {
        String rlp = randomRlp();
        String txHash = "0x" + "ab".repeat(32);
        given(feeDelegation.isAvailable()).willReturn(true);
        given(feeDelegation.decode(rlp)).willReturn(decoded());
        given(feeDelegation.submit(anyString(), any())).willReturn(txHash);

        UserSignedTxService.Accepted accepted = new TransactionTemplate(transactionManager)
                .execute(status -> {
                    UserSignedTxService.Accepted result = service.accept(rlp, expectation());
                    status.setRollbackOnly();
                    return result;
                });

        // 손에 든 엔티티도 같은 값을 보여야 한다 — 호출부가 이 값을 202 응답에 담는다.
        assertThat(accepted.replayed()).isFalse();
        assertThat(accepted.job().getStatus()).isEqualTo(ChainJob.Status.SUBMITTED);
        assertThat(accepted.job().getTxHash()).isEqualTo(txHash);

        Map<String, Object> row = rowOf(rlp);
        assertThat(row).isNotNull();
        assertThat(row.get("status")).isEqualTo("SUBMITTED");
        assertThat(row.get("tx_hash")).isEqualTo(txHash);
    }

    // ================================================================ ③ 체인 미구성

    /**
     * <b>키 없는 팀원의 로컬·CI가 도는 경로</b>({@code ChainConfigurationTest}가 고정하는 전제).
     * 체인이 구성돼 있지 않으면 아무것도 보내지 않고 job을 {@code PENDING}으로 남긴다 —
     * 트랜잭션 경계를 갈랐어도 이 동작은 그대로다.
     */
    @Test
    @DisplayName("체인이 구성돼 있지 않으면 전송하지 않고 job 을 PENDING 으로 남긴다")
    void keepsJobPendingWhenChainIsNotConfigured() {
        String rlp = randomRlp();
        given(feeDelegation.isAvailable()).willReturn(false);
        given(feeDelegation.decode(rlp)).willReturn(decoded());

        UserSignedTxService.Accepted accepted =
                new TransactionTemplate(transactionManager)
                        .execute(status -> service.accept(rlp, expectation()));

        verify(feeDelegation, never()).submit(anyString(), any());
        assertThat(accepted.job().getStatus()).isEqualTo(ChainJob.Status.PENDING);

        Map<String, Object> row = rowOf(rlp);
        assertThat(row).isNotNull();
        assertThat(row.get("status")).isEqualTo("PENDING");
        assertThat(row.get("tx_hash")).isNull();
        assertThat(row.get("fee_delegated")).isEqualTo(true);
    }

    // ================================================================ ④ 멱등 재보고

    /**
     * 트랜잭션을 갈라도 <b>멱등 재보고 판정이 그대로</b>여야 한다. {@code sameTarget}이
     * {@code job.getRequester()}(LAZY {@code @ManyToOne})를 만지므로 세션이 살아 있어야 한다 —
     * 그래서 {@code accept}의 {@code @Transactional}을 떼지 않았다.
     */
    @Test
    @DisplayName("같은 RLP 재보고는 최초 jobId 를 재생하고, 다른 대상이면 409 다")
    void replayJudgementIsUnchanged() {
        String rlp = randomRlp();
        given(feeDelegation.isAvailable()).willReturn(false);
        given(feeDelegation.decode(rlp)).willReturn(decoded());

        TransactionTemplate callerTx = new TransactionTemplate(transactionManager);
        Long firstId = callerTx.execute(status -> service.accept(rlp, expectation()))
                .job().getChainJobId();

        UserSignedTxService.Accepted again =
                callerTx.execute(status -> service.accept(rlp, expectation()));
        assertThat(again.replayed()).isTrue();
        assertThat(again.job().getChainJobId()).isEqualTo(firstId);

        // 같은 RLP 를 다른 회원이 주워 보고하면 409 다(남의 jobId 를 받아낼 수 없다).
        Member other = memberRepository.save(Member.builder()
                .email("other-" + UUID.randomUUID() + "@b204.test")
                .name("Bo Park")
                .authProvider(Member.AuthProvider.GOOGLE)
                .providerUserId(UUID.randomUUID().toString())
                .countryCode("KR")
                .build());
        assertThatThrownBy(() -> callerTx.execute(status -> service.accept(rlp,
                new UserSignedTxService.Expectation(ChainJob.TxType.APPROVE, YOYO, CALLDATA,
                        SENDER, other, null, null, null, 50_000L))))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_CONFLICT);
    }

    // ================================================================ 헬퍼

    private UserSignedTxService.Expectation expectation() {
        return new UserSignedTxService.Expectation(ChainJob.TxType.APPROVE, YOYO, CALLDATA,
                SENDER, requester, null, null, null, 50_000L);
    }

    /** {@link UserSignedTxService#verify}를 통과하는 디코드 결과 — 서명 복구값이 {@code from}과 같다. */
    private static FeeDelegationService.DecodedUserTx decoded() {
        return new FeeDelegationService.DecodedUserTx(
                TxType.Type.FEE_DELEGATED_SMART_CONTRACT_EXECUTION,
                SENDER, SENDER, YOYO,
                BigInteger.ZERO, BigInteger.ONE, BigInteger.TEN, BigInteger.valueOf(70_000),
                CALLDATA);
    }

    /** 멱등키가 UNIQUE 라 테스트마다 다른 RLP 를 쓴다. 목이 디코드하므로 내용은 무의미하다. */
    private static String randomRlp() {
        return "0x31" + UUID.randomUUID().toString().replace("-", "");
    }

    /** JPA 세션을 거치지 않고 <b>커밋된 행</b>을 읽는다. 없으면 {@code null}. */
    private Map<String, Object> rowOf(String rlp) {
        String key = UserSignedTxService.idempotencyKey(rlp);
        var rows = jdbc.queryForList("SELECT status, tx_hash, failure_reason, signer_type,"
                + " fee_delegated, sender_signed_rlp FROM chain_job WHERE idempotency_key = ?", key);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
