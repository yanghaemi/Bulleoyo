package com.ssafy.b204.performance.repository;

import com.ssafy.b204.performance.entity.TicketType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

public interface TicketTypeRepository extends JpaRepository<TicketType, Long> {

    List<TicketType> findByPerformance_PerformanceId(Long performanceId);

    /** 여러 공연의 옵션을 한 번에. 추천이 노출 6건의 판매율 피처를 만들 때 쓴다. */
    List<TicketType> findByPerformance_PerformanceIdIn(List<Long> performanceIds);

    void deleteByPerformance_PerformanceId(Long performanceId);

    /**
     * 결제 확정 시 {@code sold_quantity}를 올릴 때만 쓴다. 경합 차단 자체는 Redis 재고가 하고,
     * 이 락은 카운터 갱신이 서로 덮어쓰지 않게 하는 용도다 — 예매 조회 경로에서 쓰면
     * 행 락이 응답 시간을 지배한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<TicketType> findWithLockByTicketTypeId(Long ticketTypeId);
}
