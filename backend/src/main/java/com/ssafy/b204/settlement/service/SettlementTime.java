package com.ssafy.b204.settlement.service;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * {@code DATETIME(6)} ↔ 응답 시각 변환.
 *
 * <p>API v6 §0.2는 ISO 8601 <b>오프셋 표기</b>({@code +09:00})를 요구한다. {@code LocalDateTime}을
 * 그대로 직렬화하면 오프셋이 없고, {@code Instant}로 바꾸면 {@code Z}가 붙는다 — 둘 다 계약 위반이다.
 *
 * <p>DB는 {@code --default-time-zone=+09:00}으로 뜨고 엔티티가 {@code LocalDateTime}이라, 저장된
 * 값은 이미 KST 벽시계다. 그래서 변환이 아니라 <b>오프셋을 붙이기만</b> 한다.
 */
public final class SettlementTime {

    /** KST. 시연·발표가 한 지역에서만 일어나므로 고정한다. */
    public static final ZoneOffset KST = ZoneOffset.ofHours(9);

    private SettlementTime() {
    }

    public static OffsetDateTime toOffset(LocalDateTime value) {
        return value == null ? null : value.atOffset(KST);
    }

    /**
     * 지금(KST). <b>{@code LocalDateTime.now()}를 쓰지 않는다</b> — 그것은 JVM 기본 시각대를
     * 따르므로 UTC로 뜬 EC2에서는 9시간 이른 값에 {@code +09:00}을 붙이게 된다
     * ({@code StorageTimeZoneTest}가 회귀를 막는다).
     */
    public static OffsetDateTime now() {
        return OffsetDateTime.now(KST);
    }

    /** 사용자에게 보여줄 마감 시각 문구({@code SETTLEMENT_DISPUTE_PERIOD}의 {@code msg}). */
    public static String format(LocalDateTime value) {
        return value == null ? "-"
                : value.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
    }
}
