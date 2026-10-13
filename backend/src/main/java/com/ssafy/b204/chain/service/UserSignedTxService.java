package com.ssafy.b204.chain.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.FeeDelegationService.DecodedUserTx;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.support.EthCrypto;
import com.ssafy.b204.member.entity.Member;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code signed-tx} 공통 처리 — API v6 §0.4 ③의 1~3단계.
 *
 * <p>네 곳이 같은 절차를 탄다 — 보증금(API-performance-14) · 규칙 동의(API-rule-05) ·
 * 결제 {@code APPROVE}/{@code PURCHASE}(API-payment-03). 도메인마다 따로 쓰면 검증 항목이 하나씩
 * 빠지고, 빠진 곳이 곧 "무엇이든 대납 전송해 주는 구멍"이 된다.
 *
 * <p><b>절차</b>
 *
 * <ol>
 *   <li><b>멱등</b> — {@code keccak256(senderSignedRlp)}가 자연 멱등키다(§0.8 "signed-tx 계열은
 *       헤더를 요구하지 않는다"). 같은 RLP 재보고는 진행 중·확정 job이면 <b>최초
 *       {@code jobId}를 재생</b>하고 부작용을 재실행하지 않는다. 종단 {@code FAILED} job은 실패
 *       이력을 보존한 채 키를 retire하고 새 job으로 한 번 더 제출한다. 다만 <b>보고자와 대상이
 *       같을 때만</b>이다 — 다른 회원·다른 지갑·다른
 *       주문·다른 공연·다른 팀으로 오면 {@code COMMON_CONFLICT}(409)다({@code sameTarget}).
 *       이 비교가 없으면 남의 RLP를 주워 보고해 타인의 {@code jobId}를 받아낼 수 있다.
 *   <li><b>RLP 디코드</b> — 실패는 {@code COMMON_VALIDATION_FAILED}(400).
 *   <li><b>대조</b> — {@code from} == 요청자 등록 지갑 · {@code to} == 서버가 내려준 컨트랙트 ·
 *       {@code data} == {@code prepare}가 만든 calldata · {@code value} == 0 ·
 *       타입 == {@code 0x31}. 하나라도 어긋나면 <b>대납 서명하지 않고</b>
 *       {@code PAYMENT_AMOUNT_MISMATCH}(409)이며 {@code chain_job}을 만들지 않는다
 *       (전용 코드 {@code PAYMENT_TX_MISMATCH}는 §16.1 신설 제안이라 쓰지 않는다).
 *   <li><b>job 생성 · 전송</b> — {@code signer_type=USER}, {@code fee_delegated=true}.
 *       전송에 성공하면 {@code SUBMITTED}, 체인 모듈이 없으면 {@code PENDING}으로 남는다.
 * </ol>
 *
 * <p>{@code data}를 <b>다시 계산해</b> 대조하는 것이 요점이다. {@code prepare} 시점의 값을 어딘가
 * 저장해 두고 비교하면 저장소가 하나 더 늘고, 그 저장소가 비면 검증이 조용히 통과한다.
 * calldata는 주문·규칙에서 결정론적으로 재생성되므로 저장할 이유가 없다.
 *
 * <p><b>기록이 전송보다 앞선다.</b> 4단계의 job 생성·상태 전이는 {@link UserSignedTxJobWriter}가
 * <b>자기 트랜잭션</b>에서 커밋하고, 체인 RPC는 그 트랜잭션 밖에서 부른다. 예전에는 둘이 같은
 * 트랜잭션이라 전송 실패 시 {@code CHAIN_GAS_INSUFFICIENT}를 던지는 순간 <b>job 생성과 실패
 * 기록이 함께 롤백</b>돼 운영자가 "대납 지갑 KAIA 부족"을 DB에서 추적할 수 없었다(MR !60 리뷰).
 * API v6 §0.4 실패 표는 {@code chain_job} {@code FAILED}를 남기라고 요구한다.
 *
 * <p><b>어느 쪽으로 실패하는가.</b> 경계를 어디에 두든 창이 하나 남는다 — "전송은 나갔는데
 * 기록이 없다" 또는 "기록은 있는데 전송이 안 됐다". 후자를 골랐다.
 *
 * <ul>
 *   <li>전자는 <b>복구 불가</b>다. 코인이 온체인에서 실제로 움직였는데 {@code chain_job}이
 *       없으면 확정 워커가 볼 대상이 없고 주문은 영원히 {@code PAID}가 되지 않는다. 조사할
 *       {@code jobId}조차 없다.
 *   <li>후자는 <b>무해</b>하다. 돈은 움직이지 않았고, 워커의 전송 대상은
 *       {@code PENDING} + {@code OPERATOR}뿐이라({@code ChainJobWorker#dispatchPendingOperatorJobs})
 *       {@code USER} job은 다시 보내지지 않는다. 120초가 지나면
 *       {@code expireStalePendingUserJobs}가 {@code CHAIN_TX_TIMEOUT}으로 닫는다.
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class UserSignedTxService {

    /** {@code chain_job.idempotency_key} 접두 — {@code MINT}의 {@code grant:signup:*}과 구분한다. */
    public static final String IDEMPOTENCY_PREFIX = "usertx:";

    private static final Logger log = LoggerFactory.getLogger(UserSignedTxService.class);

    private final ChainJobRepository chainJobRepository;
    private final FeeDelegationService feeDelegationService;
    private final SignRequestFactory signRequestFactory;
    /** {@code chain_job} 쓰기 전용 트랜잭션 경계. 별도 빈이어야 프록시가 걸린다. */
    private final UserSignedTxJobWriter jobWriter;

    /**
     * 이번 보고가 만족해야 하는 조건. {@code prepare}가 만든 값과 <b>같은 방식으로</b> 다시 계산해
     * 넣는다.
     *
     * <p>{@code requester}·{@code walletId}·{@code targetPerformanceId}·{@code targetTeamId}는
     * <b>재보고 판정의 비교 키</b>이기도 하다({@link #accept}). {@code chain_job}에 그대로
     * 저장되므로 기존 job과 대조할 수 있다.
     *
     * @param replayGuard 위 네 키로 가려지지 않는 대상(같은 회원의 <b>다른 주문</b>)까지 봐야 할 때
     *                    쓴다. {@code null}이면 위 키만 본다 — {@link ReplayGuard} 참고
     */
    public record Expectation(
            ChainJob.TxType txType,
            String expectedTo,
            String expectedData,
            String senderAddress,
            Member requester,
            Long walletId,
            Long targetPerformanceId,
            Long targetTeamId,
            Long amount,
            ReplayGuard replayGuard
    ) {

        /** {@code replayGuard} 없는 형태 — 대상이 (공연 · 팀 · 지갑)으로 완전히 정해지는 tx용. */
        public Expectation(ChainJob.TxType txType, String expectedTo, String expectedData,
                           String senderAddress, Member requester, Long walletId,
                           Long targetPerformanceId, Long targetTeamId, Long amount) {
            this(txType, expectedTo, expectedData, senderAddress, requester, walletId,
                    targetPerformanceId, targetTeamId, amount, null);
        }
    }

    /**
     * 재보고가 <b>같은 대상</b>인지 호출부에 되묻는 훅.
     *
     * <p>{@code chain_job}은 주문·결제를 가리키는 컬럼이 없다(ERD v5 — 링크가 반대 방향이다:
     * {@code payment.approve_chain_job_id}·{@code payment.purchase_chain_job_id}). 그래서 "같은
     * 회원이 주문 A의 RLP를 주문 B에 보고했다"는 이 서비스 혼자 판정할 수 없다. 호출부가 자기
     * 도메인의 링크로 답한다.
     *
     * @return 기존 job이 이번 요청과 같은 대상이면 {@code true}. {@code false}면 409
     */
    @FunctionalInterface
    public interface ReplayGuard {
        boolean sameTarget(ChainJob existing);
    }

    /** 처리 결과. {@code replayed}면 비실패 job의 같은 RLP 재보고라 부작용을 다시 실행하지 않았다. */
    public record Accepted(ChainJob job, boolean replayed) {}

    /**
     * <p><b>이 {@code @Transactional}은 조회·재보고 판정을 위한 것이다.</b> {@code chain_job}
     * 쓰기는 {@link UserSignedTxJobWriter}가 {@code REQUIRES_NEW}로 따로 커밋하므로 이
     * 트랜잭션(또는 호출부 트랜잭션)이 롤백돼도 job은 남는다. 읽기 트랜잭션이 필요한 이유는
     * {@link #sameTarget}이 {@code job.getRequester()}(LAZY {@code @ManyToOne})를 만지기
     * 때문이다 — 세션이 없으면 재보고 판정이 깨진다.
     *
     * <p><b>⚠️ 호출부 제약</b> — 이 메서드를 부르기 <b>전에</b> {@code member}·{@code wallet}·
     * {@code performance}·{@code team}·{@code ticket}의 해당 행을 UPDATE 하지 않는다.
     * {@code chain_job} INSERT가 다른 커넥션에서 돌면서 그 부모 행에 공유 락을 잡기 때문이다 —
     * 이유와 실측은 {@link UserSignedTxJobWriter} 클래스 주석에 있다.
     */
    @Transactional
    public Accepted accept(String senderSignedRlp, Expectation expectation) {
        String key = idempotencyKey(senderSignedRlp);
        DecodedUserTx tx = null;

        Optional<ChainJob> existing = chainJobRepository.findByIdempotencyKey(key);
        if (existing.isPresent()) {
            ChainJob job = existing.get();
            if (job.getStatus() != ChainJob.Status.FAILED) {
                if (!sameTarget(job, expectation)) {
                    // 같은 RLP 가 다른 회원·다른 주문·다른 팀으로 보고됐다
                    // (API-performance-14 · API-payment-03 의 409 행).
                    log.warn("이미 보고된 RLP 가 다른 대상으로 다시 왔다 - 409 (chainJobId={}, txType={})",
                            job.getChainJobId(), expectation.txType());
                    throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
                }
                return new Accepted(job, true);
            }

            if (!sameStoredTarget(job, expectation)) {
                // 같은 RLP 가 다른 회원·다른 주문·다른 팀으로 보고됐다
                // (API-performance-14 · API-payment-03 의 409 행).
                log.warn("이미 보고된 RLP 가 다른 대상으로 다시 왔다 - 409 (chainJobId={}, txType={})",
                        job.getChainJobId(), expectation.txType());
                throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
            }
            // 전송 실패는 호출부 트랜잭션을 롤백하므로 payment 같은 도메인 링크가 이 FAILED job을
            // 가리키지 못할 수 있다. 이때 replayGuard만 믿으면 두 번째 일시 장애부터 영구 409가
            // 된다. 저장된 주체 키를 먼저 대조하고, RLP 자체를 현재 요청의 to/data/from과 다시
            // 검증해 주문 단위까지 확인한다. 다른 주문의 RLP는 calldata가 달라 여기서 409가 난다.
            tx = feeDelegationService.decode(senderSignedRlp);
            verify(tx, expectation);
            // USER job은 서버가 새 발신자 서명을 만들 수 없어 자동 재시도하지 않는다. 다만 전송 전
            // 장애처럼 지갑 nonce가 그대로인 경우 사용자가 다시 서명해도 동일 RLP가 나온다. FAILED
            // 행을 그대로 재생하면 복구가 영구히 막히므로, 실패 이력은 보존한 채 정본 키만 비워
            // 아래에서 같은 RLP를 새 job으로 다시 제출한다.
            if (!jobWriter.retireFailedIdempotencyKey(job.getChainJobId(), key)) {
                throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
            }
        }

        // 디코드는 web3j-ext 가 한다 — 형식 위반은 COMMON_VALIDATION_FAILED(400) 로 먼저 막힌다.
        if (tx == null) {
            tx = feeDelegationService.decode(senderSignedRlp);
            verify(tx, expectation);
        }

        // ★ 전송보다 기록이 앞선다 — 자기 트랜잭션에서 커밋한다(클래스 Javadoc "어느 쪽으로
        //   실패하는가"). 바깥 트랜잭션이 롤백해도 이 행은 남는다.
        ChainJob job = jobWriter.create(ChainJob.builder()
                .txType(expectation.txType())
                .signerType(ChainJob.SignerType.USER)
                .feeDelegated(true)
                .feePayerAddress(signRequestFactory.feePayerAddress())
                .senderSignedRlp(senderSignedRlp)
                .requester(expectation.requester())
                .walletId(expectation.walletId())
                .targetPerformanceId(expectation.targetPerformanceId())
                .targetTeamId(expectation.targetTeamId())
                .amount(expectation.amount())
                .idempotencyKey(key)
                .build());

        submit(senderSignedRlp, expectation, job);
        return new Accepted(job, false);
    }

    /**
     * fee payer 서명 + 전송. <b>체인이 구성돼 있지 않으면 아무것도 하지 않는다</b> — job은
     * {@code PENDING}으로 남고 §0.3이 허용하는 상태값이라 응답 규격이 깨지지 않는다(키 없는
     * 팀원의 로컬·CI가 이 경로로 돌고, 확정은 체인 워커가 맡는다.
     * {@code ChainConfigurationTest}가 그 전제를 고정한다).
     *
     * <p>전송 실패(노드 오류·대납 지갑 KAIA 부족)는 {@code CHAIN_GAS_INSUFFICIENT}(500)다.
     * 노드 응답 원문은 사용자에게 내보내지 않는다(SEC-09). <b>응답 계약은 그대로다</b> —
     * 바뀐 것은 실패 이력이 DB에 남는지뿐이다.
     *
     * <p>상태 전이는 {@link UserSignedTxJobWriter}(별도 트랜잭션)가 쓰고, <b>같은 값을 손에 든
     * 엔티티에도 반영</b>한다. 그 엔티티는 이미 분리 상태라 이 대입은 DB를 건드리지 않는다 —
     * 호출부가 응답에 담는 {@code status}·{@code txHash}를 맞춰 주기 위한 것이다.
     */
    private void submit(String senderSignedRlp, Expectation expectation, ChainJob job) {
        if (!feeDelegationService.isAvailable()) {
            log.debug("체인이 구성돼 있지 않아 대납 전송을 건너뛴다 - chain_job {} 은 PENDING 으로 남는다",
                    job.getChainJobId());
            return;
        }
        Long jobId = job.getChainJobId();
        String txHash;
        try {
            txHash = feeDelegationService.submit(senderSignedRlp, expectation.senderAddress());
        } catch (BusinessException e) {
            // 전송 직전 재검증 실패. accept 의 verify 를 이미 통과했으니 실질적으로 오지 않는
            // 갈래지만, job 이 이미 커밋돼 있으므로 PENDING 으로 방치하지 않는다 — 그대로 두면
            // 120초 뒤 워커가 CHAIN_TX_TIMEOUT 으로 덮어 사유가 사실과 달라진다.
            log.error("대납 전송 전 재검증에 실패했다 (chainJobId={}, code={})",
                    jobId, e.getErrorCode().getCode());
            jobWriter.markFailed(jobId, ChainFailure.of(e.getErrorCode()));
            job.markFailed(ChainFailure.of(e.getErrorCode()));
            throw e;
        } catch (RuntimeException e) {
            // 운영지갑 KAIA 부족이 대표적이다. 운영자 알림 대상(§0.4 실패 표).
            log.error("대납 전송에 실패했다 (chainJobId={})", jobId, e);
            String reason = ChainFailure.of(ErrorCode.CHAIN_GAS_INSUFFICIENT);
            // 바깥 트랜잭션은 아래 예외로 롤백되지만 이 기록은 자기 트랜잭션에서 커밋된다.
            jobWriter.markFailed(jobId, reason);
            job.markFailed(reason);
            throw BusinessException.of(ErrorCode.CHAIN_GAS_INSUFFICIENT);
        }
        jobWriter.markSubmitted(jobId, txHash);
        job.markSubmitted(txHash);
    }

    /**
     * 재보고 멱등 재생을 허용해도 되는가 — <b>보고자와 대상이 최초 보고와 같아야 한다.</b>
     *
     * <p>여기서 지갑·요청자를 보지 않으면 구멍이 생긴다. 같은 공연의 <b>다른 관객 B</b>가 A의
     * {@code PURCHASE} RLP를 주워 자기 주문에 보고하면, RLP 해시가 이미 있으므로 디코드·대조를
     * 통째로 건너뛰고 <b>A의 {@code jobId}가 202로 재생</b>된다. 409여야 할 요청이 성공하고 남의
     * 작업 식별자가 노출된다.
     *
     * <p>{@code requester}·{@code walletId}는 {@code chain_job}에 저장돼 있어 여기서 본다. 주문
     * 단위 구분은 컬럼이 없어 {@link ReplayGuard}로 호출부에 되묻는다.
     */
    private static boolean sameTarget(ChainJob job, Expectation expectation) {
        return sameStoredTarget(job, expectation)
                && (expectation.replayGuard() == null
                        || expectation.replayGuard().sameTarget(job));
    }

    /** chain_job 자체에 저장된 주체·대상 키. 주문 단위는 RLP calldata 또는 replayGuard가 보완한다. */
    private static boolean sameStoredTarget(ChainJob job, Expectation expectation) {
        return job.getTxType() == expectation.txType()
                && Objects.equals(job.getTargetPerformanceId(), expectation.targetPerformanceId())
                && Objects.equals(job.getTargetTeamId(), expectation.targetTeamId())
                && Objects.equals(job.getWalletId(), expectation.walletId())
                && Objects.equals(memberIdOf(job.getRequester()),
                        memberIdOf(expectation.requester()));
    }

    private static Long memberIdOf(Member member) {
        return member == null ? null : member.getMemberId();
    }

    /**
     * §0.4 ③ 대조. 어긋나면 <b>대납 서명하지 않는다.</b>
     *
     * <p>{@link FeeDelegationService#decode}가 타입({@code 0x31})·RLP 형식을 이미 걸렀고
     * 서명에서 발신자를 <b>복구</b>해 왔다(스텅이 못 하던 일이다). 여기서는 그 복구값과
     * 도메인 기대값을 대조한다.
     *
     * <ul>
     *   <li>서명을 복구하지 못했다(= 서명이 없거나 깨졌다) → {@code COMMON_VALIDATION_FAILED}(400).
     *       tx 자체가 성립하지 않는 형식 문제다.
     *   <li>복구 주소 ≠ RLP {@code from} → <b>위조</b>다. {@code PAYMENT_AMOUNT_MISMATCH}(409)이며
     *       보안 로깅 대상이다(§0.4 ③ "복구된 발신자 주소").
     *   <li>{@code from}·{@code to}·{@code data}·{@code value} 대조 실패 → 같은 409.
     * </ul>
     */
    private void verify(DecodedUserTx tx, Expectation expectation) {
        if (tx.recoveredFrom() == null) {
            // 발신자 서명이 없거나 복구 불가 - prepare 로 받은 tx 에 서명을 붙이지 않은 경우다.
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        if (!tx.senderSignatureValid()) {
            log.warn("발신자 서명과 from 이 다르다 - 위조 시도 (txType={})", expectation.txType());
            throw BusinessException.of(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }
        boolean matched = EthCrypto.sameAddress(tx.from(), expectation.senderAddress())
                && EthCrypto.sameAddress(tx.to(), expectation.expectedTo())
                && tx.value().signum() == 0
                && normalizeHex(tx.data()).equals(normalizeHex(expectation.expectedData()));
        if (!matched) {
            log.warn("발신자 서명 RLP 가 발의 내용과 다르다 - 대납하지 않는다 (txType={})",
                    expectation.txType());
            throw BusinessException.of(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }
    }

    /** {@code keccak256(rlp)} — RLP 해시가 자연 멱등키다(§0.4 · 명세 183행). */
    public static String idempotencyKey(String senderSignedRlp) {
        byte[] hash = EthCrypto.keccak256(
                senderSignedRlp.trim().toLowerCase().getBytes(StandardCharsets.US_ASCII));
        return IDEMPOTENCY_PREFIX + HexFormat.of().formatHex(hash);
    }

    private static String normalizeHex(String hex) {
        if (hex == null) {
            return "";
        }
        String t = hex.trim().toLowerCase();
        return t.startsWith("0x") ? t : "0x" + t;
    }
}
