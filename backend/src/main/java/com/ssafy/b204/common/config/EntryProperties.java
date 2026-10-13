package com.ssafy.b204.common.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 입장·검표 설정 — API v6 §10 · §0.12.
 *
 * <p>{@code qr-ttl}은 이미 {@code application.yml}에 있던 값이고(동적 QR 유효 구간 = Redis
 * {@code entry:{ticketId}} SETNX 마커 TTL) 나머지 둘을 이 카드에서 추가했다.
 *
 * <p><b>{@code default-duration}이 존재하는 이유는 ERD 결손이다.</b> 명세는 입장 허용 시간대를
 * "공연 시작 60분 전 ~ <b>종료</b>"로 정했지만 {@code performance} 테이블에 {@code end_at}
 * 컬럼이 없다(직전 카드 §4-1 #1 · V2 마이그레이션 후보). {@code entry_end_at}이 채워져 있으면
 * 그 값을 쓰고, 비어 있으면 {@code performance_at + default-duration}으로 종료를 <b>추정</b>한다.
 * 명세 예시(시작 19:00 · 종료 22:00 · 입장 18:00~22:00)와 같은 3시간이 기본값이다.
 *
 * <p>{@code link-grace}는 검표 링크 토큰의 수명 여유다 — API-performance-10 "토큰 유효기간은
 * 공연 종료 + 2시간"[권].
 */
@ConfigurationProperties(prefix = "b204.entry")
public record EntryProperties(Duration qrTtl, Duration defaultDuration, Duration linkGrace) {

    private static final Duration DEFAULT_QR_TTL = Duration.ofSeconds(60);
    private static final Duration DEFAULT_DURATION = Duration.ofHours(3);
    private static final Duration DEFAULT_LINK_GRACE = Duration.ofHours(2);

    /** 입장 시작 = 공연 시작 60분 전(§10 · API-ticket-05 {@code entryOpenAt}과 같은 값). */
    public static final Duration OPEN_BEFORE_START = Duration.ofHours(1);

    @Override
    public Duration qrTtl() {
        return qrTtl == null ? DEFAULT_QR_TTL : qrTtl;
    }

    @Override
    public Duration defaultDuration() {
        return defaultDuration == null ? DEFAULT_DURATION : defaultDuration;
    }

    @Override
    public Duration linkGrace() {
        return linkGrace == null ? DEFAULT_LINK_GRACE : linkGrace;
    }
}
