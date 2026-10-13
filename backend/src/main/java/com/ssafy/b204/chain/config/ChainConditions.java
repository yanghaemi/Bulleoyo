package com.ssafy.b204.chain.config;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

/**
 * 체인 빈 생성 조건 — <b>"체인 변수가 전부 비어도 기동된다"를 지키는 장치</b>다
 * (개발 환경 안내 v1 §3.1 · {@code ChainConfigurationTest}).
 *
 * <p>{@code @ConditionalOnProperty}를 쓰지 않는 이유: 그 조건은 <b>빈 문자열을 "값이 있음"으로
 * 본다.</b> {@code application.yml}이 {@code ${OPERATOR_PRIVATE_KEY:}}로 빈 값을 기본값으로
 * 두므로(= 키 없는 팀원의 정상 상태) 그대로 쓰면 키가 없는데도 빈을 만들려다 기동이 깨진다.
 * 그래서 {@code hasText} 판정을 직접 한다.
 *
 * <p>속성 이름은 {@link com.ssafy.b204.common.config.ChainProperties}의 바인딩 경로와 같아야
 * 한다. 프로퍼티를 옮기면 여기도 함께 고친다 — 조건은 바인딩된 record가 아니라
 * {@code Environment}를 직접 읽는다(조건 평가 시점에는 아직 바인딩 전이다).
 */
public final class ChainConditions {

    static final String RPC_URL = "b204.chain.rpc-url";
    static final String YOYO_ADDRESS = "b204.chain.contract.yoyo-address";
    static final String SPLITTER_ADDRESS = "b204.chain.contract.splitter-address";
    static final String OPERATOR_KEY = "b204.chain.operator-private-key";
    static final String MINTER_KEY = "b204.chain.minter-private-key";

    private ChainConditions() {
    }

    private static boolean hasText(ConditionContext context, String key) {
        String value = context.getEnvironment().getProperty(key);
        return value != null && !value.isBlank();
    }

    /**
     * 읽기 전용 조회가 가능한 상태 — RPC + 컨트랙트 주소 2개.
     * {@link com.ssafy.b204.common.config.ChainProperties#isReadOnlyConfigured()}와 같은 판정이다.
     */
    public static class ReadOnlyConfigured implements Condition {
        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return hasText(context, RPC_URL)
                    && hasText(context, YOYO_ADDRESS)
                    && hasText(context, SPLITTER_ADDRESS);
        }
    }

    /**
     * {@link ReadOnlyConfigured}의 부정 — "체인을 못 읽는 상태"에서만 만드는 대체 빈들이 쓴다.
     *
     * <p>{@code @ConditionalOnMissingBean}으로 대신하지 않는다. 그 조건은 같은 설정 클래스 안의
     * <b>빈 등록 순서</b>에 기대므로, 나중에 빈이 하나 끼어들면 조용히 뒤집힌다. 조건을 명시적으로
     * 적으면 순서와 무관하다.
     */
    public static class NotReadOnlyConfigured extends ReadOnlyConfigured {
        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return !super.matches(context, metadata);
        }
    }

    /** OPERATOR(= fee payer) 키가 있는지. 키만 보고 RPC는 보지 않는다 — 서명은 오프라인이다. */
    public static class OperatorKeyPresent implements Condition {
        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return hasText(context, OPERATOR_KEY);
        }
    }

    /** MINTER 키가 있는지. */
    public static class MinterKeyPresent implements Condition {
        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return hasText(context, MINTER_KEY);
        }
    }
}
