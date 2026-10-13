package com.ssafy.b204.rule.repository;

import com.ssafy.b204.rule.entity.SettlementRule;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettlementRuleRepository extends JpaRepository<SettlementRule, Long> {

    /** 공연 1:1(UNIQUE). */
    Optional<SettlementRule> findByPerformance_PerformanceId(Long performanceId);

    boolean existsByPerformance_PerformanceId(Long performanceId);

    /** 공연 삭제(API-performance-18) — FK가 RESTRICT라 부모보다 먼저 지운다. */
    void deleteByPerformance_PerformanceId(Long performanceId);
}
