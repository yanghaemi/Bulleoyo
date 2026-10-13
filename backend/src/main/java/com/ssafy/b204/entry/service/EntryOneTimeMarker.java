package com.ssafy.b204.entry.service;

import com.ssafy.b204.common.config.EntryProperties;
import com.ssafy.b204.common.config.RedisConfig;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * 입장 원타임 마커 — {@code entry:{ticketId}} SETNX. <b>§0.12 규약에 이미 정의된 키</b>다
 * (string · SETNX 마커 · TTL = QR 유효 구간 60초 · SEC-06 · REL-07 "중복 입장 0").
 *
 * <p><b>이 클래스가 필요한 이유는 DB 상태만으로는 부족하기 때문이다.</b> 두 대의 스캐너가 같은 QR을
 * 동시에 읽으면 두 트랜잭션이 모두 {@code ticket.status = ISSUED}를 읽고 둘 다 통과한다
 * (READ COMMITTED). {@code SETNX}는 원자적이라 둘 중 하나만 참을 받는다.
 *
 * <p><b>DB 상태 검사를 대체하지 않는다 — 보완한다.</b> 마커 TTL은 60초뿐이므로 1분 뒤 같은 QR
 * (정확히는 그 티켓의 새 QR)로 다시 오면 {@code SETNX}는 다시 성공한다. 그 지점을 막는 것은
 * {@code ticket.status = USED}다. 두 장치의 역할이 다르다:
 *
 * <ul>
 *   <li>{@code ticket.status} — <b>영구적인</b> "이미 입장했다". 최초 입장 시각도 여기서 나온다
 *   <li>{@code SETNX} 마커 — <b>동시성</b> 창(60초) 안의 경쟁을 한 건으로 줄인다
 * </ul>
 *
 * <p>그래서 검사 순서가 "상태 → SETNX"이고, 둘 다 실패 코드는 {@code ENTRY_ALREADY_ENTERED}다.
 */
@Component
@RequiredArgsConstructor
public class EntryOneTimeMarker {

    private final StringRedisTemplate redis;
    private final EntryProperties entryProperties;

    /**
     * 원타임 획득. <b>참이면 이 호출만 입장 처리를 진행한다.</b>
     *
     * <p>Redis 장애 시에는 참을 돌려준다 — 현장 입장을 멈추는 대신 DB 상태 검사에 의존한다
     * (AVAIL). 동시 스캔 창이 열리지만 티켓 1장이 두 번 입장하는 것은 여전히
     * {@code ticket.status}가 막는다.
     */
    public boolean acquire(Long ticketId) {
        try {
            Boolean acquired = redis.opsForValue().setIfAbsent(key(ticketId),
                    String.valueOf(System.currentTimeMillis()),
                    entryProperties.qrTtl().toMillis(), TimeUnit.MILLISECONDS);
            return !Boolean.FALSE.equals(acquired);
        } catch (RuntimeException e) {
            return true;
        }
    }

    /**
     * 획득한 마커를 되돌린다 — 입장 처리가 <b>롤백된 경우</b>에만 부른다. 마커만 남고 DB가
     * 롤백되면 그 티켓은 TTL 60초 동안 정상 입장도 거부된다.
     */
    public void release(Long ticketId) {
        try {
            redis.delete(key(ticketId));
        } catch (RuntimeException e) {
            // TTL 60초 뒤 사라진다. 여기서 더 할 일이 없다.
        }
    }

    private static String key(Long ticketId) {
        return RedisConfig.KEY_ENTRY + ticketId;
    }
}
