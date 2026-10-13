package com.ssafy.b204.entry.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * 검표 이력 — API-entry-01(기록) · API-entry-02(조회).
 *
 * <p><b>ERD v5에 이 이력을 담을 테이블이 없다.</b> {@code ticket}에는 {@code entry_result} ·
 * {@code entered_at} 단일 값만 있어 <b>성공한 마지막 입장 1건</b>밖에 남지 않는다. 그런데
 * API-entry-01은 "만료·서명 실패도 검표 이력에 기록"을 요구하고 API-entry-02 응답은
 * {@code entryLogId} · {@code result: FAILED} · {@code failureCode} ·
 * {@code duplicateAttemptCount} · {@code expiredQrCount} · {@code scannerSource}를 요구한다 —
 * 저장할 컬럼이 하나도 없다.
 *
 * <p>그래서 <b>Redis에 둔다.</b> 이 선택의 근거와 한계:
 *
 * <ul>
 *   <li>성공 입장의 <b>정본은 그대로 {@code ticket}</b>({@code entry_result}·{@code entered_at})이다.
 *       Redis가 비어도 입장 여부·입장 수는 DB에서 그대로 나온다 — 사라지는 것은 실패 시도의
 *       "현장 진단 정보"뿐이다.
 *   <li>공연 당일 몇 시간만 필요한 값이고(현장 화면 S-03) 쓰기가 스캔마다 발생한다. 감사·정산에
 *       쓰이지 않는다.
 *   <li>대신 <b>영구 보관이 아니다</b> — 목록은 최근 {@value #MAX_ITEMS}건으로 자르고 TTL은
 *       {@value #TTL_DAYS}일이다. 사후 분석까지 필요하면 {@code entry_log} 테이블을 만들어야 한다
 *       (V2 마이그레이션 후보 1번).
 * </ul>
 *
 * <p>키 2개 모두 §0.12 규약에 없는 신설 키다(보강 제안 대상).
 *
 * <ul>
 *   <li>{@code entry:log:{performanceId}} — list(JSON), 최신이 앞(LPUSH), 최근 500건, TTL 7일
 *   <li>{@code entry:log:stat:{performanceId}} — hash. {@code seq}(entryLogId 발급) +
 *       판정별 누적 카운터. 목록을 잘라도 {@code duplicateAttemptCount}·
 *       {@code expiredQrCount}가 남아야 하므로 카운터를 따로 둔다
 * </ul>
 *
 * <p>세 번째 키 {@code entry:summary:{performanceId}}는 §10 "요약값은 5초 캐시한다"[권](PERF-01)
 * 를 구현한 것이다. <b>입장 성공 시 즉시 무효화</b>한다 — 검표 담당자가 방금 통과시킨 사람이
 * 카운터에 안 보이면 캐시가 아니라 버그로 읽힌다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class EntryLogStore {

    /** {@code entry:log:{performanceId}} — 검표 이력(최신 순). */
    public static final String KEY_LOG_PREFIX = "entry:log:";

    /** {@code entry:log:stat:{performanceId}} — entryLogId 시퀀스 + 판정별 카운터. */
    public static final String KEY_STAT_PREFIX = "entry:log:stat:";

    /** {@code entry:summary:{performanceId}} — 입장 수·발급 수 5초 캐시(§10 [권]). */
    public static final String KEY_SUMMARY_PREFIX = "entry:summary:";

    /** 목록 보관 상한. 현장 화면은 최근 것만 본다. */
    public static final int MAX_ITEMS = 500;

    private static final int TTL_DAYS = 7;
    private static final Duration TTL = Duration.ofDays(TTL_DAYS);

    /** §10 [권] — 요약 5초 캐시. */
    private static final Duration SUMMARY_TTL = Duration.ofSeconds(5);

    private static final String FIELD_SEQ = "seq";

    /** {@code result} 값 2종 — API-entry-02 응답과 쿼리 필터의 값 집합이다. */
    public static final String RESULT_SUCCESS = "SUCCESS";
    public static final String RESULT_FAILED = "FAILED";

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    /**
     * 이력 1건을 남긴다. <b>실패도 남는다</b> — 캡처·복제 시도를 현장에서 보기 위한 것이 이 이력의
     * 존재 이유다.
     *
     * <p>Redis 장애가 입장을 막지 않는다 — 기록 실패는 로그만 남기고 통과시킨다. 입장의 정본은
     * {@code ticket}이다.
     *
     * @return 발급된 {@code entryLogId}. 기록에 실패하면 0
     */
    public long append(Long performanceId, Long ticketId, String holderNameMasked,
                       String failureCode, String scannerSource, long scannedAtEpochMilli) {
        String result = failureCode == null ? RESULT_SUCCESS : RESULT_FAILED;
        try {
            String statKey = KEY_STAT_PREFIX + performanceId;
            Long seq = redis.opsForHash().increment(statKey, FIELD_SEQ, 1L);
            redis.opsForHash().increment(statKey, failureCode == null ? RESULT_SUCCESS : failureCode,
                    1L);
            redis.expire(statKey, TTL.toMillis(), TimeUnit.MILLISECONDS);

            Item item = new Item(seq, ticketId, holderNameMasked, result, failureCode,
                    scannedAtEpochMilli, scannerSource);
            String logKey = KEY_LOG_PREFIX + performanceId;
            redis.opsForList().leftPush(logKey, objectMapper.writeValueAsString(item));
            redis.opsForList().trim(logKey, 0, MAX_ITEMS - 1);
            redis.expire(logKey, TTL.toMillis(), TimeUnit.MILLISECONDS);

            if (failureCode == null) {
                // 성공은 DB 집계(입장 수)를 바꾼다 → 5초 캐시를 즉시 버린다.
                redis.delete(KEY_SUMMARY_PREFIX + performanceId);
            }
            return seq == null ? 0L : seq;
        } catch (RuntimeException | com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("검표 이력 기록 실패 performanceId={} ticketId={} result={}", performanceId,
                    ticketId, result, e);
            return 0L;
        }
    }

    /** 최신 순 이력. Redis가 비면 빈 목록이다(404가 아니다). */
    public List<Item> recent(Long performanceId) {
        try {
            List<String> raw = redis.opsForList().range(KEY_LOG_PREFIX + performanceId, 0, -1);
            if (raw == null || raw.isEmpty()) {
                return List.of();
            }
            List<Item> items = new ArrayList<>(raw.size());
            for (String json : raw) {
                try {
                    items.add(objectMapper.readValue(json, Item.class));
                } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                    log.warn("검표 이력 역직렬화 실패 performanceId={}", performanceId, e);
                }
            }
            return items;
        } catch (RuntimeException e) {
            log.warn("검표 이력 조회 실패 performanceId={}", performanceId, e);
            return List.of();
        }
    }

    /** 판정별 누적 카운터. 목록을 잘라도 남는다. 키는 {@code SUCCESS} 또는 에러 code 문자열이다. */
    public Map<String, Integer> counters(Long performanceId) {
        try {
            Map<Object, Object> raw = redis.opsForHash().entries(KEY_STAT_PREFIX + performanceId);
            Map<String, Integer> counters = new java.util.LinkedHashMap<>();
            raw.forEach((field, value) -> {
                if (!FIELD_SEQ.equals(String.valueOf(field))) {
                    try {
                        counters.put(String.valueOf(field),
                                Integer.parseInt(String.valueOf(value)));
                    } catch (NumberFormatException ignored) {
                        // 카운터가 깨졌으면 그 항목만 버린다. 화면은 0으로 보인다.
                    }
                }
            });
            return counters;
        } catch (RuntimeException e) {
            log.warn("검표 카운터 조회 실패 performanceId={}", performanceId, e);
            return Map.of();
        }
    }

    /** 입장 수·발급 수 캐시 조회(§10 [권] 5초). */
    public Optional<long[]> cachedTicketCounts(Long performanceId) {
        try {
            String value = redis.opsForValue().get(KEY_SUMMARY_PREFIX + performanceId);
            if (value == null) {
                return Optional.empty();
            }
            int bar = value.indexOf('|');
            if (bar <= 0) {
                return Optional.empty();
            }
            return Optional.of(new long[]{Long.parseLong(value.substring(0, bar)),
                    Long.parseLong(value.substring(bar + 1))});
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    public void cacheTicketCounts(Long performanceId, long enteredCount, long totalIssuedCount) {
        try {
            redis.opsForValue().set(KEY_SUMMARY_PREFIX + performanceId,
                    enteredCount + "|" + totalIssuedCount, SUMMARY_TTL.toMillis(),
                    TimeUnit.MILLISECONDS);
        } catch (RuntimeException e) {
            log.warn("검표 요약 캐시 실패 performanceId={}", performanceId, e);
        }
    }

    /**
     * 이력 1건. Redis에 JSON으로 들어간다.
     *
     * <p>{@code entryLogId}는 DB 시퀀스가 아니라 공연별 Redis {@code INCR} 값이다 — <b>공연 안에서만
     * 유일</b>하다. 명세는 이 값의 전역 유일성을 요구하지 않고 화면도 목록 키로만 쓴다.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Item(
            Long entryLogId,
            Long ticketId,
            String holderNameMasked,
            String result,
            String failureCode,
            long scannedAtEpochMilli,
            String scannerSource
    ) {}
}
