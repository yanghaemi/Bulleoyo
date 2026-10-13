package com.ssafy.b204.entry.support;

import com.ssafy.b204.common.config.EntryProperties;
import com.ssafy.b204.performance.entity.Performance;
import java.time.LocalDateTime;

/**
 * 입장 허용 시간대 — API v6 §10 "시작 60분 전 ~ 종료".
 *
 * <p>API-entry-01의 {@code ENTRY_NOT_IN_TIME_WINDOW}(409) 판정과 API-performance-10의
 * {@code entryWindow} 응답이 <b>같은 계산</b>을 써야 한다. 두 곳에 흩어지면 검표 담당자가 링크
 * 화면에서 본 시간대와 서버 판정이 어긋난다.
 *
 * <p>API-ticket-05의 {@code entryOpenAt}도 같은 여는 시각이다({@code TicketService}가 먼저
 * 같은 규칙을 썼다 — {@code entry_start_at}이 있으면 그 값, 없으면 시작 60분 전).
 *
 * <p><b>닫는 시각은 추정이다.</b> {@code entry_end_at}이 비면
 * {@code b204.entry.default-duration}(3시간)으로 종료를 대신한다.
 *
 * <p>⚠️ <b>여기서 말하는 것은 입장 종료지 공연 종료가 아니다.</b> 공연 종료는 V6부터
 * {@code performance.end_at}에 따로 저장된다. 둘은 뜻이 다르니 이 값을 공연 종료 정본으로
 * 쓰지 마라. {@code ENDED} 전이는 저장된 {@code end_at}을 먼저 보고, 그 값이 없는 V6 이전 행에서만
 * 이 추정값으로 판정한다({@code PerformanceService#sweepStatusTransitions}, D-79).
 */
public final class EntryWindows {

    private EntryWindows() {
    }

    /** 입장 시작 — {@code entry_start_at}이 있으면 그 값, 없으면 공연 시작 60분 전. */
    public static LocalDateTime opensAt(Performance performance) {
        return performance.getEntryStartAt() != null ? performance.getEntryStartAt()
                : performance.getPerformanceAt().minus(EntryProperties.OPEN_BEFORE_START);
    }

    /** 입장 종료 — {@code entry_end_at}이 있으면 그 값, 없으면 공연 시작 + 기본 공연 길이. */
    public static LocalDateTime closesAt(Performance performance, EntryProperties properties) {
        return performance.getEntryEndAt() != null ? performance.getEntryEndAt()
                : performance.getPerformanceAt().plus(properties.defaultDuration());
    }

    /** 지금이 입장 허용 시간대 안인가. 경계는 <b>양쪽 포함</b>이다. */
    public static boolean isOpen(Performance performance, EntryProperties properties,
                                 LocalDateTime now) {
        return !now.isBefore(opensAt(performance)) && !now.isAfter(closesAt(performance, properties));
    }
}
