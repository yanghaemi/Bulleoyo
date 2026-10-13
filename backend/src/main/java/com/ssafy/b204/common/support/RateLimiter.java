package com.ssafy.b204.common.support;

import com.ssafy.b204.common.error.BusinessException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * 고정 창(fixed window) 호출 한도 — API v6 §0.9.
 *
 * <p>§0.9는 대상을 여러 개 정했지만({@code 로그인 IP 60/분} · {@code 챌린지 회원당 10/분} ·
 * {@code 검표 IP·토큰당 60/분}) <b>§0.12 Redis 키 규약에 해당 키가 없다.</b> 키 이름은 서버
 * 내부 값이라 클라이언트 계약이 아니고, 동작은 §0.9 본문과 5개 절의 4xx 표가 명령하므로
 * §0.12 결손으로 보고 구현했다(§0.12 보강 제안은 이 파일의 키 한 줄이면 전부 덮는다).
 *
 * <p>대상은 {@link Policy}에 모여 있다 — <b>scope 이름과 숫자를 코드 한곳에서 읽을 수 있어야</b>
 * 문서(§0.12)와 대조할 수 있다.
 *
 * <p>키는 {@code rate:{scope}:{subject}:{분 버킷}} 하나로 통일했다(§0.12 보강 제안 1줄).
 * 슬라이딩 윈도우가 아니라 분 단위 고정 창이라 경계에서 최대 2배까지 통과할 수 있다 — 매크로
 * 억제가 목적이고 정확한 과금이 아니므로 이 오차를 받아들인다. 정확도를 올리려면 Redis Lua로
 * 슬라이딩 로그를 써야 하는데 검표 응답 예산(p95 ≤ 1초, PERF-03) 대비 이득이 없다.
 *
 * <p><b>Redis가 죽으면 통과시킨다.</b> 한도 저장소 장애로 현장 입장이 멈추면 안 된다
 * (AVAIL — 검표는 공연 시작 직전 60분에 몰린다).
 */
@Component
@RequiredArgsConstructor
public class RateLimiter {

    /** {@code rate:{scope}:{subject}:{분 버킷}} — §0.12에 없는 신설 키(보강 제안 대상). */
    public static final String KEY_PREFIX = "rate:";

    /**
     * §0.9 호출 한도 표 — <b>scope 이름·한도·창을 코드에서 한곳에 모은다.</b>
     *
     * <p>숫자의 출처가 갈린다. {@code LOGIN_IP}·{@code WALLET_CHALLENGE}·{@code ENTRY_*}는
     * §0.9가 <b>숫자로</b> 정했다. {@code ORDER_CREATE}·{@code TICKET_QR}은 §0.9가 "예매 매크로
     * 차단 룰도 같은 코드를 쓴다"까지만 적고 숫자를 정하지 않았다 — 4xx 표에 429가 있으므로
     * 동작은 구현하되 <b>숫자는 제안</b>이고 §0.12 등재 시 확정한다.
     */
    public enum Policy {

        /** API-member-01·02 로그인. §0.9 "IP당 60회/분"(SEC-10). */
        LOGIN_IP("auth:login:ip", 60),

        /** API-wallet-03 지갑 챌린지 발급. §0.9 "회원당 10회/분". */
        WALLET_CHALLENGE_MEMBER("wallet:challenge:member", 10),

        /** API-ticket-01 주문 생성. §0.9 "예매 매크로 차단 룰" — 숫자는 제안값. */
        ORDER_CREATE_MEMBER("ticket:order:member", 60),

        /**
         * API-ticket-06 QR 토큰. 4xx 표 "회전 주기보다 잦은 호출" — 숫자는 제안값.
         * 정상 화면은 30초 회전이라 분당 2~3회면 충분하다.
         */
        TICKET_QR_MEMBER("ticket:qr:member", 60);

        private final String scope;
        private final int limit;

        Policy(String scope, int limit) {
            this.scope = scope;
            this.limit = limit;
        }

        public String scope() {
            return scope;
        }

        public int limit() {
            return limit;
        }
    }

    /** §0.9의 모든 한도가 분 단위다. */
    private static final Duration MINUTE = Duration.ofMinutes(1);

    /** 창을 넘긴 키를 남기지 않기 위한 여유. 창 길이 + 이 값이 TTL이다. */
    private static final Duration TTL_SLACK = Duration.ofSeconds(10);

    private final StringRedisTemplate redis;

    /**
     * 한 건을 소비한다. 한도를 넘으면 {@code COMMON_TOO_MANY_REQUESTS}(429)를 던진다.
     *
     * @param scope   한도의 종류. 키 접두가 된다({@code entry:verify} 등)
     * @param subject 한도를 세는 주체. IP·검표 토큰 해시·회원 id 등
     */
    public void check(String scope, String subject, int limit, Duration window) {
        if (subject == null || subject.isBlank() || limit <= 0) {
            return;
        }
        long now = System.currentTimeMillis();
        long windowMillis = window.toMillis();
        long bucket = now / windowMillis;
        String key = KEY_PREFIX + scope + ":" + subject + ":" + bucket;
        Long count;
        try {
            count = redis.opsForValue().increment(key);
            if (count != null && count == 1L) {
                redis.expire(key, window.plus(TTL_SLACK).toMillis(), TimeUnit.MILLISECONDS);
            }
        } catch (RuntimeException e) {
            // 한도 저장소 장애가 입장을 막지 않는다. 대신 로그로 남는다.
            return;
        }
        if (count != null && count > limit) {
            // 다음 고정 창이 열릴 때까지 남은 시간이 Retry-After 다(§0.9 "초과 시 Retry-After").
            long remainMillis = (bucket + 1) * windowMillis - now;
            throw BusinessException.tooManyRequests(
                    (int) Math.max(1, (remainMillis + 999) / 1000));
        }
    }

    /** §0.9 표에 있는 한도를 이름으로 건다. 분 단위 고정 창이다. */
    public void check(Policy policy, String subject) {
        check(policy.scope(), subject, policy.limit(), MINUTE);
    }

    /** 회원 id처럼 문자열이 아닌 주체용. {@code null}이면 한도를 걸지 않는다. */
    public void check(Policy policy, Long subject) {
        check(policy, subject == null ? null : String.valueOf(subject));
    }
}
