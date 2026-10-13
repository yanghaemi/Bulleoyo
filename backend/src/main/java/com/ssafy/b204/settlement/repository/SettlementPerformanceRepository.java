package com.ssafy.b204.settlement.repository;

import com.ssafy.b204.performance.entity.Performance;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 정산이 공연 테이블에 쓰는 <b>단 한 가지</b> — 보증금 반환 확정.
 *
 * <p>API-settlement-05가 "release 확정 시 {@code deposit_status=RETURNED} 기록"까지를 이 흐름의
 * 책임으로 못박았는데, {@code Performance} 엔티티에는 그 상태를 바꾸는 메서드가 없고 엔티티는
 * performance 도메인(양해미) 소유다. 남의 엔티티에 메서드를 더하는 대신 <b>settlement 소유의
 * 갱신 쿼리</b>로 좁게 연다 — 바꾸는 컬럼이 세 개로 고정돼 있어 경계가 분명하다.
 *
 * <p>공연 도메인에 {@code markDepositReturned()}가 생기면 이 인터페이스를 지우고 그 메서드를 부른다.
 */
public interface SettlementPerformanceRepository extends JpaRepository<Performance, Long> {

    /**
     * 보증금 반환 확정 — <b>{@code expected} 를 본 사람만 바꾼다</b>(조건부 UPDATE = 펜싱).
     *
     * <p><b>왜 {@code where} 에 상태를 넣는가.</b> 부르는 쪽
     * ({@code SettlementConfirmationService#applyDepositReturn})은 {@code settlement} 행을
     * 잠그고 들어오지만, 그 잠금은 <b>공연 행을 덮지 않는다.</b> 두 인스턴스가 같은
     * {@code DEPOSIT_RETURN} job 을 보면 뒤에 온 쪽은 정산 잠금을 기다린 뒤
     * {@code em.refresh} 로 <b>정산만</b> 최신이 되고, {@code settlement.getPerformance()} 는
     * 1차 캐시에 남은 REPEATABLE READ 스냅숏({@code PAID})이다. 그 가드만 믿으면 뒤에 온 쪽도
     * 통과해 {@code SettlementPayoutConfirmedEvent} 가 두 번 나간다.
     *
     * <p>UPDATE 는 스냅숏이 아니라 <b>최신 커밋</b>을 읽으므로(MySQL current read), 앞선
     * 인스턴스가 {@code RETURNED} 로 바꿔 커밋했으면 여기서 0행이 된다. 그 0이 "내가 졌다"는
     * 유일하게 믿을 수 있는 판정이다 — 호출부는 반환값이 0이면 이벤트를 발행하지 않는다.
     *
     * <p><b>{@code clearAutomatically = true} 주의.</b> 이 호출 뒤 1차 캐시가 비워져
     * {@code performance} 인스턴스는 <b>떨어져 나간(detached) 낡은 값</b>이 된다. 같은
     * 트랜잭션에서 {@code depositStatus} 를 다시 판단해야 한다면 그 값을 믿지 말고
     * {@code em.refresh(performance)} 로 다시 읽어야 한다. 지금 호출부는 이 뒤로
     * {@code depositStatus} 를 읽지 않는다.
     *
     * @param expected 이 상태일 때만 바꾼다. 보증금 반환은 언제나 {@code PAID}
     * @return 갱신된 행 수. 0이면 이미 다른 인스턴스가 반환을 확정했다
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Performance p
               set p.depositStatus = :status,
                   p.depositReturnTxHash = :txHash,
                   p.depositReturnedAt = :returnedAt
             where p.performanceId = :performanceId
               and p.depositStatus = :expected
            """)
    int markDepositReturned(@Param("performanceId") Long performanceId,
                            @Param("expected") Performance.DepositStatus expected,
                            @Param("status") Performance.DepositStatus status,
                            @Param("txHash") String txHash,
                            @Param("returnedAt") LocalDateTime returnedAt);
}
