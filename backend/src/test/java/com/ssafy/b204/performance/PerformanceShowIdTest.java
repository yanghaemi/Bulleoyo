package com.ssafy.b204.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.performance.entity.Performance;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 온체인 {@code showId} 파생 — 운영자 서명(worker)과 사용자 서명(prepare)이 같은 값을 써야 한다.
 *
 * <p>둘이 갈리면 서버는 show X 를 만들고 사용자는 show Y 에 보증금·구매·동의를 보낸다.
 * 2026-09-17 dev 에서 {@code deposit(6)} 이 {@code ShowNotFound(6)} 으로 revert 된 사고를 조사하다
 * 발견했다(그 사고의 직접 원인은 아니다 — 그때는 {@code on_chain_id} 가 비어 우연히 같았다).
 */
class PerformanceShowIdTest {

    @Test
    @DisplayName("on_chain_id 가 있으면 그 값이다 — performance_id 가 아니다")
    void onChainIdWins() {
        Performance performance = Performance.builder().build();
        ReflectionTestUtils.setField(performance, "performanceId", 6L);
        ReflectionTestUtils.setField(performance, "onChainId", 41L);

        assertThat(performance.onChainShowId()).isEqualTo(41L);
    }

    @Test
    @DisplayName("on_chain_id 가 없으면 performance_id 다 — 판매 시작 확정 전 구간")
    void fallsBackToPerformanceId() {
        Performance performance = Performance.builder().build();
        ReflectionTestUtils.setField(performance, "performanceId", 6L);

        assertThat(performance.onChainShowId()).isEqualTo(6L);
    }

    @Test
    @DisplayName("저장 전 엔티티는 0 을 지어내지 않고 막는다")
    void unsavedEntityIsRejected() {
        assertThatThrownBy(() -> Performance.builder().build().onChainShowId())
                .isInstanceOf(BusinessException.class);
    }
}
