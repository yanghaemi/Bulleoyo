package com.ssafy.b204.settlement.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 정산 설정 — {@code application.yml}의 {@code b204.settlement}.
 *
 * <p>{@code dispute-period}는 이미 {@code application.yml}에 {@code 48h}로 있었지만 바인딩되는
 * 클래스가 없었다. 여기서 묶어 준다. <b>값을 코드에 박지 않는 이유</b>는 시연에서 48시간을 기다릴 수
 * 없기 때문이다 — 발표용 프로파일에서 짧게 줄이려면 설정이어야 한다.
 *
 * @param disputePeriod 정산 잠금 후 이의제기 기간(요구사항 v6 §7.4 — 48시간)
 * @param shareBaseUrl  공유 링크 절대 URL 접두. 서버가 완성된 URL을 내려준다(§0.7 — 프론트가 조립하지 않는다)
 */
@ConfigurationProperties(prefix = "b204.settlement")
public record SettlementProperties(Duration disputePeriod, String shareBaseUrl) {

    private static final Duration DEFAULT_DISPUTE_PERIOD = Duration.ofHours(48);
    private static final String DEFAULT_SHARE_BASE_URL = "https://b204.ssafy.io/settlement/share";

    public SettlementProperties {
        if (disputePeriod == null) {
            disputePeriod = DEFAULT_DISPUTE_PERIOD;
        }
        if (shareBaseUrl == null || shareBaseUrl.isBlank()) {
            shareBaseUrl = DEFAULT_SHARE_BASE_URL;
        }
    }
}
