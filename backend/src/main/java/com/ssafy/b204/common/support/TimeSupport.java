package com.ssafy.b204.common.support;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * 시각 표기 — API v6 §0.1.
 *
 * <blockquote>ISO 8601 오프셋 표기. 서버는 요청자의 {@code timezone}(회원 프로필) 오프셋으로
 * 내려주고 화면이 KST를 병기한다(P-22). <b>비회원·미설정은 {@code +09:00}</b>(KST).</blockquote>
 *
 * <p>DB의 {@code DATETIME(6)}은 오프셋을 갖지 않는다. 저장 기준 시각대는 Hibernate 설정
 * ({@code spring.jpa.properties.hibernate.jdbc.time_zone: Asia/Seoul})에 따라 <b>KST</b>이므로,
 * 읽은 {@link LocalDateTime}은 KST로 해석한 뒤 회원 오프셋으로 옮긴다. 이 두 단계를 한곳에
 * 모아 두지 않으면 도메인마다 다른 시각이 나간다.
 */
public final class TimeSupport {

    /** 저장 기준 시각대. {@code hibernate.jdbc.time_zone}과 같은 값이어야 한다. */
    public static final ZoneId STORAGE_ZONE = ZoneId.of("Asia/Seoul");

    /** 비회원·미설정 기본 오프셋(§0.1). */
    public static final ZoneOffset DEFAULT_OFFSET = ZoneOffset.ofHours(9);

    private TimeSupport() {
    }

    /**
     * <b>저장·비교에 쓰는 "지금"</b>. {@code LocalDateTime.now()}를 직접 쓰지 않는다.
     *
     * <p>{@code LocalDateTime.now()}는 <b>JVM 기본 시각대</b>를 따른다. 개발 노트북은 KST라
     * 저장 기준과 우연히 같지만 EC2 기본값은 UTC다 — 그 환경에서는 저장한 값이 9시간 이르고,
     * {@link #toOffset}이 저장값을 KST로 되읽으므로 그 어긋남이 그대로 응답에 나간다.
     * 만료·마감 판정({@code paymentExpiresAt}·{@code saleCloseAt})은 더 나쁘다 — 배포 환경에
     * 따라 9시간 일찍 닫히거나 늦게 닫힌다.
     *
     * <p>그래서 <b>DB에 넣는 값과 DB에서 읽은 값과 비교하는 값</b>은 전부 이 메서드를 쓴다.
     * {@link java.time.Instant#now()}는 시각대가 없는 절대 시각이라 그대로 써도 된다(JWT 만료·
     * QR 윈도우·Redis 캐시 신선도).
     */
    public static LocalDateTime nowStored() {
        return LocalDateTime.now(STORAGE_ZONE);
    }

    /** 회원 프로필의 IANA {@code timezone}을 존으로 바꾼다. 알 수 없는 값은 KST로 폴백한다. */
    public static ZoneId zoneOf(String timezone) {
        if (timezone == null || timezone.isBlank()) {
            return DEFAULT_OFFSET;
        }
        try {
            return ZoneId.of(timezone);
        } catch (RuntimeException e) {
            return DEFAULT_OFFSET;
        }
    }

    /** DB에서 읽은 시각을 회원 오프셋 표기로 바꾼다. {@code null}은 {@code null}로 통과시킨다. */
    public static OffsetDateTime toOffset(LocalDateTime stored, String timezone) {
        if (stored == null) {
            return null;
        }
        return stored.atZone(STORAGE_ZONE).withZoneSameInstant(zoneOf(timezone)).toOffsetDateTime();
    }

    /** 지금 시각을 회원 오프셋 표기로. */
    public static OffsetDateTime nowFor(String timezone) {
        return OffsetDateTime.now(zoneOf(timezone));
    }

    /** epoch milli를 회원 오프셋 표기로. Redis {@code wallet:balance}의 {@code checkedAt}용. */
    public static OffsetDateTime fromEpochMilli(long epochMilli, String timezone) {
        return java.time.Instant.ofEpochMilli(epochMilli).atZone(zoneOf(timezone))
                .toOffsetDateTime();
    }
}
