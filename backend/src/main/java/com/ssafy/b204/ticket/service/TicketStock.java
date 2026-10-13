package com.ssafy.b204.ticket.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

/**
 * 티켓 재고 — Redis 해시 {@code stock:performance:{performanceId}}, field = {@code ticketTypeId}.
 *
 * <p><b>재고 차감을 DB로 하지 않는 이유.</b> {@code ticket_type.sold_quantity}로 경합을 막으려면
 * 행 락을 잡아야 하고, 그 락이 예매 응답 시간을 지배한다(PERF-02 · 초과 판매 0 = REL-01).
 * Redis는 단일 스레드라 스크립트 하나가 락 없이 원자적으로 돈다.
 * {@code sold_quantity}는 결제 확정 시 반영하는 <b>결과 기록</b>이다.
 *
 * <p>선점은 주문 생성 시점이다. 결제 화면에서 품절이 나면 안 되기 때문이다. 15분 안에 결제되지
 * 않으면 만료 스윕이 {@link #release}로 되돌린다.
 *
 * <p>⚠️ <b>이 키는 API v6 §0.12 규약 표에 없다.</b> §0.12는 "테이블 없이 Redis에만 두는 상태"를
 * 모았다고 하면서 재고를 빠뜨렸고, 본문(API-performance-03·05 · API-ticket-01)은 "Redis 재고"를
 * 세 곳에서 전제한다. 키 이름은 서버 내부 값이라 클라이언트 계약이 아니지만 <b>§0.12에 추가가
 * 필요하다</b>(be_*_endpoints.md의 "명세 확인 필요" 항목).
 *
 * <p><b>선점은 Lua 스크립트 하나다(2026-09-26).</b> 예전에는 {@code HINCRBY -qty} 후 음수면
 * {@code HINCRBY +qty}로 되돌렸는데, <b>필드가 없으면</b> {@code HINCRBY}가 {@code -qty}로 필드를
 * 만들고 되돌림이 {@code "0"}을 남겼다 — 그 뒤로 그 티켓 종류는 영구 매진으로 보였다. 이제
 * 스크립트가 ① 필드 부재를 먼저 알리고 ② 전 종류 잔량을 확인한 뒤에만 ③ 한꺼번에 차감한다.
 * 모자라면 <b>아무것도 쓰지 않는다</b> — 되돌림 자체가 없다.
 */
@Component
public class TicketStock {

    /** {@code stock:performance:{performanceId}} — 공연 하나가 해시 하나다. */
    public static final String KEY_PREFIX = "stock:performance:";

    private static final long RESERVED = 1L;
    private static final long MISSING_FIELD = -1L;

    /**
     * ARGV = [n, (field, qty, init) × n]. {@code init}이 빈 문자열이 아니면 {@code HSETNX}로 먼저
     * 깐다 — 두 요청이 동시에 부재를 보고 각자 기준값을 들고 와도 하나만 들어간다. 빈 문자열인데
     * 필드가 없으면 {@code -1}(기준값을 계산해 다시 부르라는 뜻). 하나라도 모자라면 {@code 0}이고
     * 아무것도 차감하지 않는다. 전부 충분하면 차감하고 {@code 1}.
     */
    private static final RedisScript<Long> RESERVE = new DefaultRedisScript<>("""
            local n = tonumber(ARGV[1])
            for i = 0, n - 1 do
              local field = ARGV[2 + i * 3]
              local init = ARGV[4 + i * 3]
              if init ~= '' then
                redis.call('HSETNX', KEYS[1], field, init)
              elseif redis.call('HEXISTS', KEYS[1], field) == 0 then
                return -1
              end
            end
            for i = 0, n - 1 do
              local left = tonumber(redis.call('HGET', KEYS[1], ARGV[2 + i * 3]))
              if left == nil or left < tonumber(ARGV[3 + i * 3]) then
                return 0
              end
            end
            for i = 0, n - 1 do
              redis.call('HINCRBY', KEYS[1], ARGV[2 + i * 3], -tonumber(ARGV[3 + i * 3]))
            end
            return 1
            """, Long.class);

    /** 값이 관측한 그대로일 때만 바꾼다 — 대사가 그 사이 들어온 선점·반납을 덮지 않게 한다. */
    private static final RedisScript<Long> COMPARE_AND_SET = new DefaultRedisScript<>("""
            if redis.call('HGET', KEYS[1], ARGV[1]) == ARGV[2] then
              redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
              return 1
            end
            return 0
            """, Long.class);

    private final StringRedisTemplate redis;
    private final TicketStockBaseline baseline;

    public TicketStock(StringRedisTemplate redis, TicketStockBaseline baseline) {
        this.redis = redis;
        this.baseline = baseline;
    }

    /** 티켓 옵션 설정(API-performance-05)·판매 시작 시 재고를 다시 깐다. */
    public void initialize(Long performanceId, Map<Long, Integer> remainingByTicketType) {
        String key = key(performanceId);
        redis.delete(key);
        remainingByTicketType.forEach((ticketTypeId, remaining) ->
                redis.opsForHash().put(key, String.valueOf(ticketTypeId), String.valueOf(remaining)));
    }

    /** 남은 수량. 키가 없으면(판매 전·재고 미초기화) {@link Optional#empty()}. */
    public Optional<Integer> remaining(Long performanceId, Long ticketTypeId) {
        Object raw = redis.opsForHash().get(key(performanceId), String.valueOf(ticketTypeId));
        if (raw == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(Integer.parseInt(raw.toString()));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    /**
     * 원자적 선점.
     *
     * <p><b>필드가 없으면</b>(Redis 소실·초기화 누락) DB 기준 가용 수량
     * ({@link TicketStockBaseline#expectedAvailable})으로 깐 뒤 차감한다. 기준값 계산은 DB 조회라
     * 부재일 때만 한다 — 평소 경로는 Redis 왕복 한 번이다.
     *
     * @return 하나라도 모자라면 {@code false}이고 <b>재고는 손대지 않은 상태</b>다
     */
    public boolean reserve(Long performanceId, Map<Long, Integer> quantities) {
        long result = runReserve(performanceId, quantities, Map.of());
        if (result == MISSING_FIELD) {
            result = runReserve(performanceId, quantities,
                    baseline.expectedAvailable(performanceId));
        }
        // 기준값에도 없는 종류(그 사이 옵션이 지워졌다)는 다시 -1 이다 — 팔 수 없으니 매진으로 답한다.
        return result == RESERVED;
    }

    private long runReserve(Long performanceId, Map<Long, Integer> quantities,
                            Map<Long, Integer> initial) {
        List<String> args = new ArrayList<>();
        args.add(String.valueOf(quantities.size()));
        quantities.forEach((ticketTypeId, quantity) -> {
            args.add(String.valueOf(ticketTypeId));
            args.add(String.valueOf(quantity));
            Integer init = initial.get(ticketTypeId);
            args.add(init == null ? "" : String.valueOf(init));
        });
        Long result = redis.execute(RESERVE, List.of(key(performanceId)), args.toArray());
        return result == null ? 0L : result;
    }

    /** 주문 만료·취소 시 원복. */
    public void release(Long performanceId, Map<Long, Integer> quantities) {
        String key = key(performanceId);
        quantities.forEach((ticketTypeId, quantity) -> redis.opsForHash()
                .increment(key, String.valueOf(ticketTypeId), quantity));
    }

    /** 대사용 — 공연 해시 전체. 숫자가 아닌 값은 뺀다. */
    public Map<Long, Integer> snapshot(Long performanceId) {
        Map<Long, Integer> result = new LinkedHashMap<>();
        redis.opsForHash().entries(key(performanceId)).forEach((field, value) -> {
            try {
                result.put(Long.parseLong(field.toString()), Integer.parseInt(value.toString()));
            } catch (NumberFormatException ignored) {
                // 알 수 없는 필드는 대사 대상이 아니다.
            }
        });
        return result;
    }

    /**
     * 대사 보정 — 현재 값이 {@code observed}일 때만 {@code expected}로 바꾼다.
     *
     * @return 바꿨으면 {@code true}. 그 사이 값이 움직였으면 {@code false}(다음 주기에 다시 본다)
     */
    public boolean compareAndSet(Long performanceId, Long ticketTypeId, int observed,
                                 int expected) {
        Long changed = redis.execute(COMPARE_AND_SET, List.of(key(performanceId)),
                String.valueOf(ticketTypeId), String.valueOf(observed), String.valueOf(expected));
        return changed != null && changed == 1L;
    }

    public void clear(Long performanceId) {
        redis.delete(key(performanceId));
    }

    private static String key(Long performanceId) {
        return KEY_PREFIX + performanceId;
    }
}
