package com.ssafy.b204.webauthn.service;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.webauthn.config.WebAuthnProperties;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * step-up 토큰 발급·소비 — API v7 §7.W · §0.12.
 *
 * <p><b>범위 = 회원 + 동작 + 대상.</b> 토큰은 발급 때 이미 범위가 정해져 있다 — 본인 확인 옵션
 * (API-webauthn-03)이 동작·대상을 받아 챌린지에 붙여 두고, 그 챌린지로 서명된 인증만 이 범위의
 * 토큰을 받는다. 생체 인증이 "무엇에 대한 동의인가"까지 서명하게 되고, 쓰지 않은 토큰이 새어도
 * 다른 동작(예: 보증금 → 정산금 지급)으로 돌려쓸 수 없다.
 *
 * <p><b>왜 "1회용 + 범위 묶음"인가.</b> 한 동작이 보고를 여러 번 하는 경우가 있다 — 결제는
 * {@code APPROVE} 1 + {@code PURCHASE} × N, 보증금은 {@code APPROVE} → {@code DEPOSIT}. 보고마다
 * 토큰을 지우면 생체 인증을 여러 번 해야 한다. 그래서 첫 보고가 토큰을 {@code GETDEL}로 소비하며
 * {@code webauthn:stepup:scope:{memberId}:{action}:{targetId}}(= 토큰, 소비 시점부터 TTL)에 묶고,
 * 같은 범위의 이어지는 보고는 같은 토큰이면 통과한다.
 *
 * <p>⚠ 가드는 호출부가 <b>권한·소유를 확인한 뒤</b> 부른다 — 남의 대상 id로 들어온 요청이 토큰을
 * 태우지 못하게 하려는 것이다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StepUpTokenService {

    public static final String TOKEN_PREFIX = "webauthn:stepup:";
    public static final String SCOPE_PREFIX = "webauthn:stepup:scope:";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final StringRedisTemplate redis;
    private final WebAuthnProperties properties;

    /** 스위치(STEP_UP_ENABLED). 꺼져 있으면 호출부가 가드 경로를 통째로 건너뛴다. */
    public boolean enabled() {
        return properties.enabled();
    }

    /**
     * 응답의 {@code stepUpRequired} 값 — 켜짐이면 {@code TRUE}, 꺼짐이면 <b>null</b>.
     * 전역 {@code non_null}이 키를 지워 스위치가 꺼진 응답은 이 기능 이전과 같다.
     */
    public Boolean requiredFlag() {
        return enabled() ? Boolean.TRUE : null;
    }

    public record Issued(String token, Instant expiresAt) {}

    /** 본인 확인 성공 직후 발급. 값은 {@code memberId|action|targetId}. */
    public Issued issue(long memberId, StepUpAction action, long targetId) {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        redis.opsForValue().set(TOKEN_PREFIX + token, value(memberId, action, targetId),
                properties.stepUpTtl());
        return new Issued(token, Instant.now().plus(properties.stepUpTtl()));
    }

    public static String scopeKey(long memberId, StepUpAction action, long targetId) {
        return SCOPE_PREFIX + memberId + ":" + action.name() + ":" + targetId;
    }

    /**
     * 스위치가 켜져 있을 때만 가드한다. 꺼져 있으면 헤더를 보지도 않는다.
     */
    public void guard(long memberId, StepUpAction action, long targetId, String token) {
        if (enabled()) {
            require(memberId, action, targetId, token);
        }
    }

    /**
     * 가드 본체. 통과하지 못하면 {@code WEBAUTHN_STEP_UP_REQUIRED}(403).
     *
     * @param token {@code X-Step-Up-Token} 헤더값(없으면 null)
     */
    public void require(long memberId, StepUpAction action, long targetId, String token) {
        if (token == null || token.isBlank() || token.length() > 128) {
            throw BusinessException.of(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        }
        String scopeKey = scopeKey(memberId, action, targetId);
        if (token.equals(redis.opsForValue().get(scopeKey))) {
            return; // 같은 동작 시퀀스의 이어지는 보고
        }
        String stored = redis.opsForValue().getAndDelete(TOKEN_PREFIX + token);
        if (stored == null) {
            // 같은 범위의 첫 보고 두 건이 동시에 들어오면 앞쪽이 방금 묶었을 수 있다.
            if (token.equals(redis.opsForValue().get(scopeKey))) {
                return;
            }
            log.info("step-up 토큰 없음·만료·소비됨 memberId={} action={} targetId={}",
                    memberId, action, targetId);
            throw BusinessException.of(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        }
        if (!stored.equals(value(memberId, action, targetId))) {
            // 다른 회원의 토큰이거나 다른 동작·대상에 발급된 토큰. 이미 GETDEL 로 소비됐으므로 다시 못 쓴다.
            log.warn("step-up 토큰 범위 불일치 memberId={} action={} targetId={}", memberId, action, targetId);
            throw BusinessException.of(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        }
        redis.opsForValue().set(scopeKey, token, properties.stepUpTtl());
    }

    private static String value(long memberId, StepUpAction action, long targetId) {
        return memberId + "|" + action.name() + "|" + targetId;
    }
}
