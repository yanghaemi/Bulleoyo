package com.ssafy.b204.chain.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code signed-tx} 경로의 {@code chain_job} <b>트랜잭션 경계</b>. 외부 RPC와 DB 기록을 갈라놓는다.
 *
 * <p><b>왜 별도 빈인가.</b> {@link UserSignedTxService#accept}는 호출부(payment · performance-14 ·
 * rule-05)의 트랜잭션 안에서 돌고, 그 안에서 체인 노드로 tx를 보낸다. 기록과 전송이 <b>같은</b>
 * 트랜잭션이면 전송 실패 시 던지는 언체크 예외가 트랜잭션을 통째로 되돌려 <b>job 생성과 실패
 * 기록이 함께 사라진다</b> — 운영자가 "대납 지갑 KAIA 부족"을 DB에서 추적할 수 없다. API v6
 * §0.4 실패 표는 그 반대를 요구한다.
 *
 * <blockquote>③ 전송 · 노드 오류·대납 잔액 부족 → {@code chain_job} {@code FAILED} +
 * {@code CHAIN_GAS_INSUFFICIENT}</blockquote>
 *
 * <p>{@code REQUIRES_NEW}는 호출부 트랜잭션을 <b>미뤄 두고</b> 자기 트랜잭션에서 커밋한다.
 * 그래서 바깥이 롤백해도 {@code chain_job}은 남는다. {@code @Transactional}을 같은 클래스
 * 안에서 부르면 프록시를 타지 않아 아무 효과가 없으므로({@code self-invocation}) <b>반드시
 * 다른 빈</b>이어야 한다.
 *
 * <p><b>{@code chain.worker.ChainJobStateWriter}와 역할이 겹치지만 합치지 않는다.</b> 그쪽은
 * 워커({@code chain.worker})가 쓰는 빈이고, 여기서 그것을 주입하면
 * {@code chain.service → chain.worker → chain.service} 패키지 순환이 된다(워커가 이미
 * {@code chain.service}의 5개 빈을 쓴다). 순환을 만들지 않는 값으로 메서드 3개를 중복한다.
 *
 * <h2>⚠️ 호출부가 지켜야 하는 것 — FK 부모 행을 미리 잠그지 않는다</h2>
 *
 * <p>새 트랜잭션은 <b>다른 커넥션</b>이다. InnoDB는 FK가 걸린 자식 행을 넣을 때 부모 행에
 * <b>공유(S) 락</b>을 잡는데, 그 부모 행을 바깥 트랜잭션이 이미 배타(X) 락으로 물고 있으면
 * 서로 다른 트랜잭션이라 <b>기다린다</b> — {@code innodb_lock_wait_timeout}(기본 50초)만큼
 * 커넥션 2개를 붙잡고 있다가 {@code Lock wait timeout exceeded}로 죽는다. 실측으로 확인했다
 * (MR !60 수정 중, 이 클래스의 테스트를 짜면서 재현).
 *
 * <p>{@code chain_job}의 FK 부모는 다섯이다 — {@code member} · {@code wallet} ·
 * {@code performance} · {@code team} · {@code ticket}(V1 {@code fk_chain_job_*}). 그래서
 * <b>{@link UserSignedTxService#accept}를 부르기 전에 이 다섯 테이블의 해당 행을 UPDATE 하지
 * 않는다.</b>
 *
 * <p>현재 호출부 세 곳은 모두 이 조건을 만족한다(2026-09-09 확인).
 *
 * <ul>
 *   <li>{@code PaymentService.signedTx} — 앞은 전부 SELECT, {@code payment} 쓰기는
 *       {@code accept} <b>뒤</b>다. {@code payment}는 {@code chain_job}의 부모가 아니라
 *       <b>자식</b>이다({@code payment.approve_chain_job_id}).
 *   <li>{@code PerformanceService.depositSignedTx} — 쓰기가 없다.
 *   <li>{@code RuleService.agreeSignedTx} — {@code rule_agreement} 쓰기가 {@code accept}
 *       뒤다. 이것도 {@code chain_job}의 자식이다.
 * </ul>
 *
 * <p>새 호출부를 붙이거나 기존 호출부에 쓰기를 추가할 때 이 조건을 확인한다. {@code UserSignedTxFkParentLockGuardTest}가 이 조건을 소스 스캔으로 검사한다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class UserSignedTxJobWriter {

    private final ChainJobRepository chainJobRepository;

    /**
     * job을 <b>전송보다 먼저</b> 자기 트랜잭션에 커밋한다({@code PENDING}).
     *
     * <p>§0.4 서버 처리 2단계가 그 순서다 — "이 시점에 {@code chain_job}을 {@code PENDING}으로
     * 생성한다" 다음이 3단계 전송이다.
     *
     * @return 커밋된 job. 이 트랜잭션이 끝나므로 <b>분리(detached) 상태</b>다 — 기본 필드
     *         읽기만 한다(호출부가 응답에 쓰는 값이 전부 기본 필드다)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ChainJob create(ChainJob job) {
        ChainJob saved = chainJobRepository.saveAndFlush(job);
        log.debug("chain_job {} PENDING 생성 — 전송보다 기록이 앞선다", saved.getChainJobId());
        return saved;
    }

    /**
     * 같은 사용자 서명 RLP를 다시 보낼 수 있도록 실패 job의 UNIQUE 키를 감사용 키로 밀어 둔다.
     * 실패 행은 삭제하지 않고 보존하며, 잠금 읽기로 동시에 두 번 밀리는 것을 막는다.
     *
     * @return 정확히 그 실패 job의 키를 비웠으면 {@code true}
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean retireFailedIdempotencyKey(Long chainJobId, String expectedKey) {
        return chainJobRepository.findByIdForUpdate(chainJobId)
                .filter(job -> job.getStatus() == ChainJob.Status.FAILED)
                .filter(job -> expectedKey.equals(job.getIdempotencyKey()))
                .map(job -> {
                    job.retireIdempotencyKey();
                    chainJobRepository.saveAndFlush(job);
                    log.info("실패한 USER chain_job {}의 멱등키를 감사 이력으로 이동", chainJobId);
                    return true;
                })
                .orElse(false);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markSubmitted(Long chainJobId, String txHash) {
        chainJobRepository.findById(chainJobId).ifPresent(job -> {
            job.markSubmitted(txHash);
            log.info("chain_job {} SUBMITTED txHash={}", chainJobId, txHash);
        });
    }

    /** @param failureReason {@link ChainFailure} 규약 문자열({@code CODE} 또는 {@code CODE#0x…}) */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long chainJobId, String failureReason) {
        chainJobRepository.findById(chainJobId).ifPresent(job -> {
            job.markFailed(failureReason);
            log.warn("chain_job {} FAILED reason={}", chainJobId, failureReason);
        });
    }
}
