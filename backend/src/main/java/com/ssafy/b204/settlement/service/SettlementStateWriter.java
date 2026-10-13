package com.ssafy.b204.settlement.service;

import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 실패해도 남아야 하는 기록을 <b>별도 트랜잭션</b>으로 쓴다.
 *
 * <p>집계 대사가 어긋나면 409를 던지는데, 그 예외가 호출 트랜잭션을 롤백시키므로 같은 트랜잭션에서
 * 남긴 {@code counter_match = false}는 함께 사라진다. "왜 막혔는가"가 사라지면 운영자는 화면에서
 * 아무것도 볼 수 없다. 그래서 {@link Propagation#REQUIRES_NEW}로 먼저 커밋한다.
 *
 * <p><b>상태({@code status})는 여기서 건드리지 않는다.</b> 대사 실패는 되돌릴 수 있는 정지이고
 * 상태 기계를 움직이지 않는다(project-truth §6). 이 클래스가 쓰는 것은 진단값뿐이다.
 */
@Component
public class SettlementStateWriter {

    private final SettlementRepository settlementRepository;
    private final TransactionTemplate requiresNew;

    public SettlementStateWriter(SettlementRepository settlementRepository,
                                 PlatformTransactionManager transactionManager) {
        this.settlementRepository = settlementRepository;
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * 정산 행이 없으면 만든다. 공연 생성 시점에 만들어 두지 않아도 집계 확정에서 이어지도록.
     *
     * <p><b>별도 트랜잭션에서 만들고, 동시에 만들어졌으면 그 행을 돌려준다</b>(S15P21B204-155).
     * 호출자가 셋이다 — 정산 상세 조회(-01) · 집계(-02) · halt 확정({@code ChainJobConfirmationService}).
     * 같은 공연을 동시에 부르면 둘 다 "없음"을 보고 INSERT 해 {@code settlement.performance_id}
     * UNIQUE 에 걸린다. 그 실패를 여기 안에서 삼키고 <b>새 트랜잭션</b>으로 다시 읽는다 — 새
     * 스냅숏이라 상대가 커밋한 행이 보인다. 호출자 트랜잭션은 어느 쪽이든 롤백되지 않는다.
     *
     * <p>{@code @Transactional(REQUIRES_NEW)} 대신 {@link TransactionTemplate}을 쓴 이유: 충돌한
     * 트랜잭션은 rollback-only 라 그 안에서 예외를 잡아도 커밋이 실패한다. 재조회는 그 밖에서,
     * 다른 트랜잭션으로 해야 한다. 존재 확인을 잠금 읽기로 바꾸지 않는다 — 빈 결과의
     * {@code FOR UPDATE}는 갭 잠금이라 상대 INSERT 와 교착할 수 있다.
     *
     * @return {@code settlement_id}
     */
    public Long ensureSettlement(Performance performance) {
        Long performanceId = performance.getPerformanceId();
        try {
            return requiresNew.execute(status -> settlementRepository
                    .findByPerformance_PerformanceId(performanceId)
                    .orElseGet(() -> settlementRepository.saveAndFlush(
                            Settlement.builder().performance(performance).build()))
                    .getSettlementId());
        } catch (DataIntegrityViolationException e) {
            // UNIQUE 충돌이면 상대의 행이 이미 커밋돼 있다. 없으면 다른 제약 위반이니 원래 예외를 낸다.
            return requiresNew.execute(status -> settlementRepository
                    .findByPerformance_PerformanceId(performanceId)
                    .orElseThrow(() -> e)
                    .getSettlementId());
        }
    }

    /**
     * 서버 집계값과 대사 결과. 성공·실패 모두 즉시 커밋한다.
     *
     * <p>두 값이 여기 함께 있는 이유가 다르다.
     *
     * <ul>
     *   <li>{@code counterMatch} — 대사가 어긋나면 409가 호출 트랜잭션을 롤백시켜 "왜 막혔는가"가
     *       사라진다. 먼저 커밋해야 화면에 남는다.
     *   <li>{@code validTicketCount} — <b>tx 인자다.</b> {@code ContractOperatorTxBuilder}가
     *       전송 시점에 이 컬럼을 읽어 {@code aggregate(showId, validTicketCount)}를 만든다
     *       (chain_job에 payload 컬럼을 두지 않는 것이 이강륜과의 규약). 확정 반영에서 처음 쓰면
     *       <b>값이 있어야 tx를 만들고 tx가 확정돼야 값을 쓰는</b> 순환이 되어 AGGREGATE job이
     *       영원히 나가지 못한다.
     * </ul>
     *
     * <p>재요청으로 값이 덮일 수 있다는 것은 규약이 받아들인 위험이다 — 틀린 값이 나가면 컨트랙트가
     * {@code AggregateMismatch}로 revert하고 정산 상태는 그대로 남는다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordServerAggregate(Long settlementId, boolean matched, int validTicketCount,
                                      int totalChoiceCount) {
        settlementRepository.updateServerAggregate(settlementId, matched, validTicketCount,
                totalChoiceCount);
    }
}
