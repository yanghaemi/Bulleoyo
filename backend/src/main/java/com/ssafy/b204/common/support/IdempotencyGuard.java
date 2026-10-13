package com.ssafy.b204.common.support;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

/**
 * 멱등키 자리 선점 — API v6 §0.8.
 *
 * <p><b>조회 후 기록(check-then-act)이 아니라 처리 전 선점(SET NX)이다.</b> "먼저 읽어 보고
 * 없으면 처리한 뒤 기록한다"는 순서는 두 요청이 겹치면 둘 다 조회에서 빈 값을 받아 <b>부작용을 두
 * 번 실행</b>한다(주문 2건 + 재고 2배 차감). 그래서 처리 <b>전에</b> {@code SET NX}로 자리를
 * 잡고, 잡지 못한 쪽은 이미 있는 값을 읽어 분기한다.
 *
 * <pre>
 * SET NX 성공 → 최초 요청. 처리 후 complete()로 완료 값(TTL 24h) 기록
 * SET NX 실패 → 기존 값을 읽어 분기
 *               ├ 완료 + 같은 요청 해시 → 최초 결과 재생        (§0.8)
 *               ├ 완료 + 다른 요청 해시 → 409 COMMON_CONFLICT  (§0.8)
 *               └ 진행 중(선점 마커)     → 409 COMMON_CONFLICT  (명세 밖 · 우리 결정)
 * </pre>
 *
 * <p><b>"진행 중 → 409"는 명세에 없는 판단이다.</b> §0.8이 요구하는 "최초 응답 재생"은 응답이 아직
 * 없는 상태에서는 불가능하다. 요청 스레드를 붙잡아 첫 요청이 끝나기를 기다리는 방식은 rate
 * limit(§0.9)·타임아웃과 얽혀 택하지 않았다. {@code COMMON_CONFLICT}의 기본 문구가
 * "다른 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요."라 이 상황을 그대로 설명한다.
 *
 * <p><b>값 형식</b> — 기존 {@code {요청해시}|{결과id}}를 유지하고 진행 중 상태를 덧댔다.
 * 결과 id는 양수라 {@code -} 접두로 둘을 가른다.
 *
 * <pre>
 * 완료   : {요청해시}|{결과id}          TTL 24시간 (§0.8 보존)
 * 진행 중: {요청해시}|-{선점토큰}        TTL 60초
 * </pre>
 *
 * <p><b>선점 마커의 TTL이 60초인 근거.</b> 선점 후 프로세스가 죽으면 마커를 지울 주체가 없다.
 * 24시간을 그대로 쓰면 사용자는 같은 키로 하루 동안 재시도할 수 없다. 반대로 너무 짧으면 아직
 * 처리 중인 첫 요청 위로 두 번째 요청이 올라타 중복이 난다. 주문 생성·결제 시작은 DB 트랜잭션
 * 하나(Hikari {@code connection-timeout} 3초 포함)라 초 단위로 끝나므로 60초는 정상 처리보다
 * 한참 길고, <b>결제 만료 15분</b>({@code b204.ticket.payment-timeout})보다는 한참 짧다 — 크래시로
 * 남은 마커가 풀리는 시점이 그 주문이 만료되는 시점보다 훨씬 앞이라 사용자가 갇히지 않는다.
 *
 * <p><b>남는 창</b> — 커밋은 됐는데 {@link #complete}를 적기 전에 프로세스가 죽으면, 60초 뒤
 * 같은 키의 재시도가 새 주문을 만든다. 이 창을 없애려면 결과 id와 멱등키를 같은 트랜잭션에
 * 적어야 하고, 그것은 {@code ticket_order}에 멱등키 컬럼을 더하는 ERD v5 변경이다(V2 후보).
 */
@Component
public class IdempotencyGuard {

    private static final Logger log = LoggerFactory.getLogger(IdempotencyGuard.class);

    /** §0.8 — 보존 24시간. */
    public static final Duration COMPLETED_TTL = Duration.ofHours(24);

    /** 선점 마커 수명. 크래시로 남은 자리를 풀어 주는 상한이다. */
    public static final Duration IN_PROGRESS_TTL = Duration.ofSeconds(60);

    static final String DELIMITER = "|";

    /** 진행 중 표시. 결과 id(양수)와 겹치지 않는 접두다. */
    static final String IN_PROGRESS = "-";

    /** 내 선점 마커일 때만 지운다 — GET 후 DEL 사이에 남의 마커로 바뀌는 창을 없앤다. */
    private static final RedisScript<Long> RELEASE_IF_MINE = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) "
                    + "else return 0 end", Long.class);

    private final StringRedisTemplate redis;

    public IdempotencyGuard(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * 선점 결과.
     *
     * @param key           Redis 키
     * @param requestHash   요청 본문 해시
     * @param token         선점 토큰. 최초 요청일 때만 값이 있다
     * @param completedId   이미 끝난 같은 요청의 결과 id
     */
    public record Reservation(String key, String requestHash, String token, Long completedId) {

        /** 내가 자리를 잡았다 — 처리한 뒤 {@code complete} 또는 {@code release}를 불러야 한다. */
        public boolean firstAttempt() {
            return token != null;
        }

        /** 이미 끝난 요청의 결과. 최초 요청이면 비어 있다. */
        public Optional<Long> replayed() {
            return Optional.ofNullable(completedId);
        }
    }

    /**
     * 처리 전 자리를 잡는다.
     *
     * @throws BusinessException 같은 키·다른 요청 본문(§0.8) 또는 같은 키가 처리 중이면
     *                           {@code COMMON_CONFLICT}(409)
     */
    public Reservation begin(String key, String requestBody) {
        String hash = hash(requestBody);
        String token = UUID.randomUUID().toString().replace("-", "");
        if (Boolean.TRUE.equals(redis.opsForValue()
                .setIfAbsent(key, marker(hash, token), IN_PROGRESS_TTL))) {
            return new Reservation(key, hash, token, null);
        }

        String raw = redis.opsForValue().get(key);
        if (raw == null) {
            // 방금 만료·해제됐다. 한 번만 더 잡아 본다 — 무한 재시도는 하지 않는다.
            if (Boolean.TRUE.equals(redis.opsForValue()
                    .setIfAbsent(key, marker(hash, token), IN_PROGRESS_TTL))) {
                return new Reservation(key, hash, token, null);
            }
            raw = redis.opsForValue().get(key);
            if (raw == null) {
                throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
            }
        }

        int sep = raw.lastIndexOf(DELIMITER);
        if (sep <= 0) {
            // 우리가 쓴 적 없는 형식이다. 부작용을 다시 실행하느니 충돌로 돌려보낸다.
            log.warn("멱등키 값 형식이 규약과 다르다 — 충돌로 처리한다 (key={})", key);
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        if (!raw.substring(0, sep).equals(hash)) {
            // §0.8 — 같은 키에 다른 요청 본문.
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        String suffix = raw.substring(sep + 1);
        if (suffix.startsWith(IN_PROGRESS)) {
            // 명세 밖 판단 — 재생할 응답이 아직 없다.
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        try {
            return new Reservation(key, hash, null, Long.parseLong(suffix));
        } catch (NumberFormatException e) {
            log.warn("멱등키 완료 값이 숫자가 아니다 — 충돌로 처리한다 (key={})", key);
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
    }

    /**
     * 처리 성공 — 선점 마커를 완료 값으로 올리고 TTL을 24시간으로 늘린다.
     *
     * <p><b>커밋 이후에 부른다</b>({@link TxCallbacks#afterCommit}). 커밋 전에 적으면 아직 보이지
     * 않는 결과 id를 다른 요청이 재생해 404를 받는다.
     */
    public void complete(Reservation reservation, Long resultId) {
        if (!reservation.firstAttempt()) {
            return;
        }
        redis.opsForValue().set(reservation.key(),
                reservation.requestHash() + DELIMITER + resultId, COMPLETED_TTL);
    }

    /**
     * 처리 실패 — 잡아 둔 자리를 돌려준다. 지우지 않으면 사용자가 24시간(마커 TTL 만큼) 같은
     * 키로 재시도할 수 없다.
     */
    public void release(Reservation reservation) {
        if (!reservation.firstAttempt()) {
            return;
        }
        redis.execute(RELEASE_IF_MINE, List.of(reservation.key()),
                marker(reservation.requestHash(), reservation.token()));
    }

    /** {@code {prefix}{memberId}:{Idempotency-Key}} — 회원 범위로 가둬 교차 재생을 막는다. */
    public static String key(String prefix, Long memberId, String idempotencyKey) {
        return prefix + memberId + ":" + idempotencyKey;
    }

    private static String marker(String hash, String token) {
        return hash + DELIMITER + IN_PROGRESS + token;
    }

    /**
     * 요청 본문은 원문이 아니라 <b>keccak-256 해시</b>로 저장한다 — 본문에 개인정보가 없더라도
     * 캐시에 요청을 통째로 남길 이유가 없다.
     */
    private static String hash(String requestBody) {
        return HexFormat.of().formatHex(
                EthCrypto.keccak256(requestBody.getBytes(StandardCharsets.UTF_8)));
    }
}
