package com.ssafy.b204.chain.service;

import com.ssafy.b204.chain.config.ChainWorkerProperties;
import com.ssafy.b204.chain.dto.ChainDtos.JobStatusResponse;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * chain_job 조회·생성 — API v6 §0.3·§0.4·API-chain-01. <b>미구현 스켈레톤.</b>
 *
 * <p>이 클래스는 <b>체인에 붙지 않는다</b> — DB의 {@code chain_job} 행만 읽고 쓴다. 실제 전송·
 * 서명·receipt 검증은 {@code feat/be/chain}에서 붙이는 별도 컴포넌트(web3j-ext 래퍼 + 워커)가
 * 하고, 이 서비스는 그 컴포넌트가 없어도 동작해야 한다.
 *
 * <p><b>키·주소가 없어도 기동돼야 한다</b>(개발 환경 안내 v1 §3.1). {@link ChainProperties}를
 * 주입만 받고 {@link ChainProperties#isConfigured()}로 분기한다 — 설정이 없으면 체인을 타는
 * 경로에서만 {@code COMMON_INTERNAL_ERROR}로 떨어지고, 폴링·조회는 DB만 보므로 그대로 된다.
 *
 * <p>구현 시 지켜야 할 것
 *
 * <ul>
 *   <li><b>OPERATOR job은 지갑별 단일 nonce 직렬 큐</b>다. {@code @Scheduled} 단일 스레드 워커로
 *       처리하고 큐·ShedLock은 쓰지 않는다(단일 인스턴스). 직렬화 실패는
 *       {@code CHAIN_NONCE_CONFLICT}. 최대 3회 자동 재시도(REL-09).
 *   <li><b>USER job은 자동 재시도 대상이 아니다</b> — 서버가 발신자 서명을 다시 만들 수 없다.
 *       receipt 재조회만 최대 120초 반복하고 이후 {@code FAILED}.
 *   <li><b>확정은 이벤트 파싱으로 판정한다.</b> {@code receiptStatus}만 보지 않고
 *       {@code to}·{@code from}·{@code event}·{@code args}를 대조해 {@code verification}에 담는다.
 *   <li>확정 시 <b>지갑이 관여한 job이면 Redis {@code wallet:balance}를 갱신한다</b> — 발신 지갑
 *       (PURCHASE·DEPOSIT)과 수신 지갑(REFUND·RELEASE·DEPOSIT_RETURN·MINT) 모두. 빠뜨리면
 *       발행량 대사(불변식 4)가 정상 결제를 불일치로 읽는다(§0.12).
 *   <li>{@code explorerUrl}은 서버가 <b>완성된 절대 URL</b>로 내려준다(§0.7). 프론트가 조립하지
 *       않는다.
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChainJobService {

    /** 202 응답이 만드는 {@code jobId} 접두. {@code chain_{chain_job_id}} 한 형식뿐이다. */
    public static final String JOB_ID_PREFIX = "chain_";

    /** 폴링 간격 — §0.3 기본 1500ms. 종료 상태면 {@code null}을 내려 폴링을 멈추게 한다. */
    private static final int POLL_AFTER_MS = 1500;

    /** 가입 기본 지급 멱등키 접두 — §0.8 {@code grant:signup:{memberId}}. */
    private static final String SIGNUP_GRANT_KEY_PREFIX = "grant:signup:";

    private final ChainJobRepository chainJobRepository;
    private final ChainProperties chainProperties;
    private final ChainWorkerProperties workerProperties;
    private final WalletRepository walletRepository;
    private final TicketRepository ticketRepository;

    /** 202를 내려주는 쪽이 쓰는 단일 형식. 파싱({@link #jobStatus})과 짝을 맞춘다. */
    public static String jobIdOf(Long chainJobId) {
        return JOB_ID_PREFIX + chainJobId;
    }

    /**
     * API-chain-01 작업 상태 조회.
     *
     * <p>권한 — 요청자 본인 또는 ADMIN. 남의 작업이면 {@code COMMON_FORBIDDEN}(403).
     * DB만 읽으므로 체인 설정이 없어도 동작해야 한다.
     */
    public JobStatusResponse jobStatus(MemberPrincipal me, String jobId) {
        ChainJob job = chainJobRepository.findById(parseJobId(jobId))
                .filter(found -> canRead(me, found))
                // 남의 작업은 존재를 숨긴다 — 403이면 "그 jobId는 있다"가 새어 나간다(명세 [권]).
                .orElseThrow(ErrorCode.COMMON_NOT_FOUND::toException);

        boolean terminal = job.isTerminal();
        return new JobStatusResponse(
                jobIdOf(job.getChainJobId()),
                name(job.getTxType()),
                grantSource(job),
                name(job.getSignerType()),
                name(job.getIssuerType()),
                job.isFeeDelegated(),
                job.getFeePayerAddress(),
                name(job.getStatus()),
                walletAddress(job),
                job.getTargetPerformanceId(),
                orderId(job),
                job.getAmount(),
                "KRW",
                job.getTxHash(),
                txExplorerUrl(job.getTxHash()),
                // blockNumber·verification 은 chain_job 에 컬럼이 없어 저장되지 않는다(ERD v5).
                // 이 API 는 외부 호출 없이 DB 만 읽으므로(PERF-01) 지금은 null 이다 — 저장 컬럼이
                // 생기면 여기서 그대로 내려준다.
                null,
                null,
                job.getRetryCount(),
                // 저장 값은 `CODE#0xdeadbeef` 형태일 수 있다(ChainFailure). 응답에는 **코드만**
                // 나간다 — selector 는 운영 진단용이고(SEC-09) 클라이언트는 이 값을 규격 코드로
                // 읽어 문구를 고른다. 그대로 내려보내면 표에 없는 코드가 되어 화면에
                // "(코드 COMMON_FORBIDDEN#0x7c214f04)" 처럼 찍힌다.
                ChainFailure.codeOf(job.getFailureReason()),
                retryable(job),
                // 부분 성공 결과(release 건별)는 아직 저장하는 곳이 없다. 지어내지 않는다.
                null,
                terminal ? null : POLL_AFTER_MS,
                // chain_job 에 submitted_at 이 없다(ERD v5). 전송 시각 대용으로 요청 시각을 쓴다 —
                // 워커의 타임아웃 판정과 같은 대용이다(ChainJobWorker#isTimedOut).
                atOffset(job.getRequestedAt()),
                atOffset(job.getConfirmedAt()));
    }

    /** 요청자 본인 또는 ADMIN만. 요청자가 없는 시스템 job은 ADMIN만 본다. */
    private boolean canRead(MemberPrincipal me, ChainJob job) {
        if (me == null) {
            return false;
        }
        if (me.admin()) {
            return true;
        }
        Member requester = job.getRequester();
        return requester != null && requester.getMemberId().equals(me.memberId());
    }

    /** {@code chain_{id}} 외의 형식은 없는 작업과 같게 다룬다(존재를 숨긴다). */
    private Long parseJobId(String jobId) {
        if (jobId == null || !jobId.startsWith(JOB_ID_PREFIX)) {
            throw ErrorCode.COMMON_NOT_FOUND.toException();
        }
        try {
            return Long.parseLong(jobId.substring(JOB_ID_PREFIX.length()));
        } catch (NumberFormatException e) {
            throw ErrorCode.COMMON_NOT_FOUND.toException();
        }
    }

    /**
     * §0.3 — {@code USER} job은 서버가 발신자 서명을 다시 만들 수 없어 항상 {@code false}.
     * OPERATOR job은 실패했고 재시도 한도가 남았을 때만 {@code true}다.
     */
    private boolean retryable(ChainJob job) {
        return job.isAutoRetryable()
                && job.getStatus() == ChainJob.Status.FAILED
                && job.getRetryCount() < workerProperties.maxRetry();
    }

    private String walletAddress(ChainJob job) {
        return job.getWalletId() == null ? null
                : walletRepository.findById(job.getWalletId())
                        .map(wallet -> wallet.getAddress())
                        .orElse(null);
    }

    /** chain_job 은 티켓까지만 가리킨다 — 주문 id는 티켓을 통해 얻는다. */
    private Long orderId(ChainJob job) {
        return job.getTargetTicketId() == null ? null
                : ticketRepository.findById(job.getTargetTicketId())
                        .map(ticket -> ticket.getTicketOrder().getTicketOrderId())
                        .orElse(null);
    }

    /**
     * §8 API-coin-08과 같은 두 값({@code SIGNUP}·{@code ADMIN}). {@code MINT}가 아니면 {@code null}.
     *
     * <p>지급 종류 컬럼은 없다 — 멱등키 원문이 곧 종류다(문서 13 §2.4: 가입은
     * {@code grant:signup:{memberId}}, 관리자 지급은 요청 헤더 UUID). 지급 이력 전용 테이블을
     * 만들지 않기로 했으므로(결정 v2 §2.2·미결 31) 이 접두가 유일한 판별 근거다.
     */
    private static String grantSource(ChainJob job) {
        if (job.getTxType() != ChainJob.TxType.MINT) {
            return null;
        }
        String key = job.getIdempotencyKey();
        return key != null && key.startsWith(SIGNUP_GRANT_KEY_PREFIX) ? "SIGNUP" : "ADMIN";
    }

    private static String name(Enum<?> value) {
        return value == null ? null : value.name();
    }

    private static OffsetDateTime atOffset(LocalDateTime value) {
        return value == null ? null : value.atZone(ZoneId.systemDefault()).toOffsetDateTime();
    }

    /** tx 해시 → 익스플로러 절대 URL(§0.7). 체인 설정과 무관하게 조립 가능하다. */
    public String txExplorerUrl(String txHash) {
        return txHash == null ? null : chainProperties.explorerBaseUrl() + "/tx/" + txHash;
    }

    /** 주소 → 익스플로러 절대 URL(§0.7). */
    public String addressExplorerUrl(String address) {
        return address == null ? null : chainProperties.explorerBaseUrl() + "/address/" + address;
    }
}
