package com.ssafy.b204.verify;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * {@code verifyClock} 자리의 시계 — 60초 TTL을 실제로 기다리지 않기 위한 것.
 *
 * <p>모든 통합 테스트가 한 컨텍스트를 공유하므로 기본은 <b>시스템 시계를 따른다</b>
 * (프로덕션 {@code Clock.systemUTC()}와 같다). {@link #reset()}을 부른 테스트만 고정 시각으로
 * 바꾸고, {@code IntegrationTestBase}가 매 테스트 앞에서 {@link #useSystemClock()}으로 되돌린다.
 */
public class MutableClock extends Clock {

    private static final Instant FIXED = Instant.parse("2026-09-09T09:00:00Z");

    /** {@code null}이면 시스템 시계. */
    private volatile Instant instant;

    public void advance(Duration duration) {
        instant = instant().plus(duration);
    }

    /** 고정 시각 {@code 2026-09-09T09:00:00Z}로 멈춘다. */
    public void reset() {
        instant = FIXED;
    }

    public void useSystemClock() {
        instant = null;
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }

    @Override
    public Instant instant() {
        Instant fixed = instant;
        return fixed != null ? fixed : Instant.now();
    }
}
