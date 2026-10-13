package com.ssafy.b204.coin.repository;

import com.ssafy.b204.coin.entity.ExchangeRate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExchangeRateRepository extends JpaRepository<ExchangeRate, Long> {

    /**
     * 통화쌍의 현재 적용 환율 — {@code effective_from <= now} 중 가장 최근 것.
     * 없으면 {@code display}를 내리지 않는다(미등록은 오류가 아니다).
     */
    Optional<ExchangeRate> findFirstByPairAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
            String pair, LocalDateTime now);

    /** API-coin-02 표시 환율 조회 — 통화쌍별 최신 1건씩. */
    List<ExchangeRate> findByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDateTime now);
}
