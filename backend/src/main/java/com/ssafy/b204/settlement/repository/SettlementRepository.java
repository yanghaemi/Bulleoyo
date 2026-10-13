package com.ssafy.b204.settlement.repository;

import com.ssafy.b204.settlement.entity.Settlement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SettlementRepository extends JpaRepository<Settlement, Long> {

    /** 공연 1:1(UNIQUE). */
    Optional<Settlement> findByPerformance_PerformanceId(Long performanceId);

    /** API-settlement-07 공개 조회 — 인증 없이 열린다. */
    Optional<Settlement> findByShareToken(String shareToken);

    /**
     * 아직 {@code RELEASED}에 닿지 않은 정산 수 — 팀 해산(API-team-05) 차단 판정.
     *
     * <p>{@code HALTED}·{@code DISPUTE_OPEN}도 미정산으로 센다. 돈이 아직 팀 지갑으로 가지
     * 않았다는 뜻이 같기 때문이다. 정산 행이 아예 없는 공연은 여기서 세지 않는다 — 그 경우는
     * 공연 상태 검사(종료·취소 여부)가 먼저 답한다.
     *
     * <p>{@code ids}가 비면 호출하지 않는다(JPQL {@code in ()}은 MySQL에서 문법 오류다).
     */
    @Query("""
            select count(s) from Settlement s
             where s.performance.performanceId in :ids and s.status <> :released
            """)
    long countUnreleased(@Param("ids") List<Long> ids,
                         @Param("released") Settlement.Status released);

    /**
     * 자동 release 스케줄의 후보 — 잠긴 정산 중 <b>이의제기 기간이 더는 붙잡지 않는 것</b>.
     *
     * <p><b>이 조건은 {@link com.ssafy.b204.settlement.service.SettlementGates#release}의
     * 이의제기 기간 판정을 따라간다. 그쪽이 바뀌면 여기도 바꾼다.</b> 사본을 두는 것이 원칙에
     * 어긋나는 것을 알고 있다 — 그래도 두는 이유는 상태만으로 후보를 뽑으면 이의제기 기간 중인
     * 정산이 <b>매 분</b> {@code releaseInternal}까지 내려가 공연 행에 쓰기 락을 잡았다 롤백하고,
     * {@code SETTLEMENT_DISPUTE_PERIOD} 보류 로그가 48시간 × 1분 = 2,880줄 쌓이기 때문이다.
     * D-68이 확인 지점으로 삼은 "이의 때문에 멈췄다" 줄이 그 안에 묻힌다. 두 곳이 어긋나면
     * {@code SettlementApiIntegrationTest}가 깨진다.
     *
     * <p>반영한 것은 <b>타이밍 조건뿐</b>이다 — 대사·에스크로·열린 이의·권한은 그대로 게이트가
     * 판정한다. 게이트의 {@code settlement.isInDisputePeriod(now) && !allApproved(shares)}를
     * 뒤집은 모양이다.
     *
     * <ul>
     *   <li>{@code disputeDeadlineAt <= now} — {@code isInDisputePeriod}의
     *       {@code disputeDeadlineAt.isAfter(now)}와 같은 경계다
     *   <li>마감이 {@code NULL}이면 비교가 거짓이라 후보에서 빠진다 — {@code isInDisputePeriod}가
     *       {@code NULL}을 fail-closed 로 {@code true}(기간 중)로 보는 것과 같은 결론이다(D-26)
     *   <li>동의하지 않은 분배 행이 하나도 없으면(전원 동의) 마감과 무관하게 후보다
     *       (API-settlement-08). 분배 행이 아예 없는 정산도 여기서는 통과하지만 게이트가
     *       {@code SETTLEMENT_NOT_LOCKED}로 막는다 — 후보를 넓게 잡는 방향의 오차라 안전하다
     * </ul>
     */
    @Query("""
            select s from Settlement s
             where s.status in :statuses
               and (s.disputeDeadlineAt <= :now
                    or not exists (select 1 from SettlementShare sh
                                    where sh.settlement = s and sh.approvedAt is null))
            """)
    List<Settlement> findReleaseCandidates(@Param("statuses") List<Settlement.Status> statuses,
                                           @Param("now") LocalDateTime now);

    /**
     * 서버 집계값과 대사 결과를 갱신한다 — <b>상태({@code status})는 건드리지 않는다.</b>
     *
     * <p>엔티티에 setter를 열지 않고 갱신 쿼리로 두는 이유: 이 세 값은 {@code markAggregated}가
     * 함께 쓰는 필드라 setter를 열면 상태와 따로 노는 경로가 생긴다. 집계 요청 시점의 기록은
     * {@link com.ssafy.b204.settlement.service.SettlementStateWriter}가 별도 트랜잭션으로만 쓴다.
     *
     * <p>{@code validTicketCount}는 단순한 진단값이 아니라 <b>온체인 {@code aggregate}의 두 번째
     * 인자</b>다({@code ContractOperatorTxBuilder}가 전송 시점에 읽는다).
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Settlement s
               set s.counterMatch = :matched,
                   s.validTicketCount = :validTicketCount,
                   s.totalChoiceCount = :totalChoiceCount
             where s.settlementId = :settlementId
            """)
    int updateServerAggregate(@Param("settlementId") Long settlementId,
                              @Param("matched") boolean matched,
                              @Param("validTicketCount") int validTicketCount,
                              @Param("totalChoiceCount") int totalChoiceCount);
}
