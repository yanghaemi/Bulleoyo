package com.ssafy.b204.settlement;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.settlement.config.SettlementProperties;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 이의제기 기간 기본값 가드 — 설정이 비어도 <b>짧아지지 않는다</b>.
 *
 * <p>기간을 환경변수로 열면서(S15P21B204-45) 생긴 위험은 "값을 안 넣은 환경이 조용히 0 이 되는
 * 것"이다. release 는 되돌릴 수 없으므로 실패는 <b>기다리는 쪽</b>이어야 한다. compose 가
 * {@code ${SETTLEMENT_DISPUTE_PERIOD:-48h}} 로 기본값을 넣고, 그마저 뚫려도 이 가드가 받는다.
 */
@DisplayName("§7.4 이의제기 기간 기본값")
class SettlementPropertiesTest {

    @Test
    @DisplayName("값이 없으면 48시간이다")
    void defaultsTo48Hours() {
        assertThat(new SettlementProperties(null, "https://x").disputePeriod())
                .isEqualTo(Duration.ofHours(48));
    }

    @Test
    @DisplayName("값이 있으면 그 값을 쓴다 — 시연은 PT1M 으로 줄인다")
    void keepsConfiguredValue() {
        assertThat(new SettlementProperties(Duration.ofMinutes(1), "https://x").disputePeriod())
                .isEqualTo(Duration.ofMinutes(1));
    }
}
