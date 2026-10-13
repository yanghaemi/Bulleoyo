package com.ssafy.b204.coin.service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/**
 * coin 응답의 시각 표기 — API v6 §0.2는 <b>ISO 8601 오프셋</b>을 요구한다(기본 {@code +09:00}).
 *
 * <p>{@code Instant}·{@code LocalDateTime}을 그대로 직렬화하면 {@code Z}가 나오거나 오프셋이
 * 사라진다. DB는 {@code DATETIME(6)}(오프셋 없음)이고 서버·MySQL 모두 {@code Asia/Seoul}로
 * 도므로({@code application.yml} {@code hibernate.jdbc.time_zone}) 그 존을 붙여 변환한다.
 */
final class CoinTime {

    static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private CoinTime() {
    }

    static OffsetDateTime of(LocalDateTime value) {
        return value == null ? null : value.atZone(ZONE).toOffsetDateTime();
    }

    static OffsetDateTime of(Instant value) {
        return value == null ? null : value.atZone(ZONE).toOffsetDateTime();
    }

    static OffsetDateTime now() {
        return OffsetDateTime.now(ZONE);
    }
}
