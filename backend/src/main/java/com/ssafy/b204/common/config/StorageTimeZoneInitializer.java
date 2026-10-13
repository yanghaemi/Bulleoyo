package com.ssafy.b204.common.config;

import com.ssafy.b204.common.support.TimeSupport;
import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;

/**
 * JVM 기본 시각대를 <b>저장 기준</b>({@link TimeSupport#STORAGE_ZONE} = {@code Asia/Seoul})으로
 * 고정한다. <b>컨텍스트가 만들어지기 전에</b> 실행된다.
 *
 * <p>왜 필요한가 — 응답 변환({@link TimeSupport#toOffset})이 DB의 zoneless {@code DATETIME(6)}을
 * <b>KST로 해석</b>하므로 저장하는 쪽도 KST 벽시계여야 한다. 서비스 코드는
 * {@link TimeSupport#nowStored()}로 이 규약을 지키지만 <b>우리가 호출하지 않는 시각 생성자</b>가
 * 남는다.
 *
 * <ul>
 *   <li>{@code @CreationTimestamp}·{@code @UpdateTimestamp}({@code created_at}·{@code updated_at}) —
 *       Hibernate가 JVM 기본 시각대의 {@code Clock}으로 {@code LocalDateTime}을 만든다.
 *       {@code hibernate.jdbc.time_zone}은 시각대를 <b>가진</b> 타입에만 적용되고
 *       zoneless {@code LocalDateTime}에는 붙지 않는다.
 *   <li>{@code @EnableJpaAuditing}의 기본 {@code DateTimeProvider}도 같다.
 * </ul>
 *
 * <p>노트북(KST)에서는 티가 나지 않지만 <b>EC2 기본값은 UTC</b>다 — 그 환경에서
 * {@code created_at}이 9시간 이르게 저장되고 읽을 때 KST로 해석돼 응답의 모든 {@code createdAt}이
 * 어긋난다. 컨테이너에 {@code TZ}를 넣어 고칠 수도 있지만 <b>배포 설정 한 줄이 빠지면 조용히
 * 틀리는</b> 값이라 애플리케이션이 스스로 못 박는다.
 *
 * <p><b>{@code EnvironmentPostProcessor}인 이유</b> — Hibernate {@code SessionFactory}가
 * {@code Clock.systemDefaultZone()}을 <b>생성 시점에</b> 붙잡는다. 빈 초기화
 * ({@code @PostConstruct}) 시점에 바꾸면 이미 늦다. 이 훅은 스프링이 빈을 하나도 만들기 전에
 * 돌고, {@code @SpringBootTest}에서도 똑같이 돈다({@code META-INF/spring.factories}).
 */
public class StorageTimeZoneInitializer implements EnvironmentPostProcessor, Ordered {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment,
                                       SpringApplication application) {
        pin();
    }

    /** {@code main()}에서도 부른다 — 스프링을 거치지 않는 경로를 남기지 않는다. */
    public static void pin() {
        if (!TimeZone.getDefault().toZoneId().equals(TimeSupport.STORAGE_ZONE)) {
            TimeZone.setDefault(TimeZone.getTimeZone(TimeSupport.STORAGE_ZONE));
        }
    }

    @Override
    public int getOrder() {
        return HIGHEST_PRECEDENCE;
    }
}
