package com.ssafy.b204.common.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.common.config.StorageTimeZoneInitializer;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.TimeZone;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.Banner;
import org.springframework.boot.DefaultBootstrapContext;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.boot.env.EnvironmentPostProcessorsFactory;
import org.springframework.boot.logging.DeferredLogs;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * <b>{@link StorageTimeZoneInitializer} 등록이 실제로 동작하는가.</b>
 *
 * <p>{@link StorageTimeZoneTest}에는 빈틈이 있었다 — 그쪽은 {@code pin()}을 <b>직접 호출</b>해
 * 검증하므로 <b>등록 파일을 지워도 통과한다.</b> 그런데 이 훅의 값은 전부 등록에 달려 있다.
 * 등록이 읽히지 않으면 {@code pin()}이 조용히 실행되지 않고, 개발 노트북(KST)에서는 증상이
 * 없다가 <b>EC2·도커(UTC)에서만</b> {@code @CreationTimestamp}·{@code @CreatedDate}가 9시간
 * 어긋난다. 그래서 여기서는 <b>스프링 부팅 과정</b>을 실제로 태워 확인한다.
 *
 * <p><b>Spring Boot 3.5.6에서 {@code spring.factories}가 읽히는가 — 실측 판정(2026-09-09).</b>
 * "Boot 3.0부터 {@code EnvironmentPostProcessor}를 {@code spring.factories}에서 읽지 않는다"는
 * 통설이 있으나 <b>우리 버전에는 해당하지 않는다.</b> {@code spring-boot-3.5.6.jar} 바이트코드가
 * 근거다.
 *
 * <pre>
 *   EnvironmentPostProcessorApplicationListener()            // 기본 생성자
 *     → BootstrapMethods #0
 *         = EnvironmentPostProcessorsFactory.fromSpringFactories(ClassLoader)
 *     → SpringFactoriesLoader.forDefaultResourceLocation(cl)
 *     → ldc "META-INF/spring.factories"
 * </pre>
 *
 * <p>또 그 jar에서 {@code ImportCandidates}({@code "META-INF/spring/%s.imports"})를 참조하는
 * 클래스는 <b>자기 자신뿐</b>이다 — {@code .imports} 규약은
 * {@code spring-boot-autoconfigure}의 {@code AutoConfiguration} 전용이고
 * {@code EnvironmentPostProcessor}에는 걸리지 않는다. 그래서 {@code .imports} 파일은 Boot 4.x
 * 대비 보험으로만 두고({@code pin()}은 멱등이라 중복 등록도 무해하다) 지금 값을 내는 등록은
 * {@code spring.factories}다. 판정이 뒤집히는 날 <b>{@link #bootPinsStorageZoneOnUtcJvm()}이
 * 먼저 깨진다.</b>
 *
 * <p>컨테이너를 띄우지 않는다 — {@code SpringApplication} 하나를
 * {@code web-application-type=none}으로 부팅할 뿐이다.
 */
class StorageTimeZoneBootstrapTest {

    private final TimeZone original = TimeZone.getDefault();

    @AfterEach
    void restoreTimeZone() {
        TimeZone.setDefault(original);
    }

    /**
     * <b>이 클래스의 핵심.</b> UTC JVM으로 EC2를 흉내내고 스프링을 <b>실제로 부팅</b>한다.
     * 부팅이 끝난 뒤 기본 시각대가 저장 기준이어야 한다.
     *
     * <p>{@code capturedAtBeanCreation}은 <b>순서</b>까지 못 박는다 — Hibernate
     * {@code SessionFactory}가 {@code Clock.systemDefaultZone()}을 생성 시점에 붙잡으므로
     * 빈이 하나라도 만들어지기 <b>전에</b> 고정돼 있어야 한다.
     *
     * <p>{@code spring.config.location}으로 {@code application.yml}을 일부러 읽지 않는다.
     * 등록 메커니즘은 설정 파일과 무관하고, 읽으면 {@code logging.level}이 같은 JVM의 다른
     * 테스트에 남는다({@code application-test.yml}은 {@code root: WARN}이다).
     */
    @Test
    @DisplayName("UTC JVM 으로 스프링을 부팅하면 등록된 훅이 돌아 기본 시각대가 KST 로 고정된다")
    void bootPinsStorageZoneOnUtcJvm() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        assertThat(TimeZone.getDefault().toZoneId()).isNotEqualTo(TimeSupport.STORAGE_ZONE);

        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(BareBoot.class)
                .web(WebApplicationType.NONE)
                .bannerMode(Banner.Mode.OFF)
                .registerShutdownHook(false)
                .properties("spring.config.location=optional:classpath:/b204-no-such-config/")
                .run()) {

            assertThat(TimeZone.getDefault().toZoneId())
                    .withFailMessage("부팅해도 기본 시각대가 고정되지 않았다 — "
                            + "EnvironmentPostProcessor 등록(META-INF/spring.factories · "
                            + "META-INF/spring/*.imports)이 읽히지 않는다. "
                            + "EC2·도커(UTC)에서 created_at 이 9시간 어긋난다.")
                    .isEqualTo(TimeSupport.STORAGE_ZONE);

            // 빈 생성 시점에 이미 고정돼 있었어야 한다 — Hibernate 가 Clock 을 그때 붙잡는다.
            assertThat(context.getBean(BareBoot.class).capturedAtBeanCreation.get())
                    .isEqualTo(TimeSupport.STORAGE_ZONE.getId());
        }
    }

    /**
     * 부팅 없이 <b>Boot 가 쓰는 그 팩토리</b>로 직접 조회한다. 등록 파일이 사라지거나 FQCN 이
     * 어긋나면 여기서 잡힌다 — 위 테스트보다 실패 원인이 좁게 나온다.
     */
    @Test
    @DisplayName("Boot 가 쓰는 팩토리가 StorageTimeZoneInitializer 를 찾아낸다")
    void bootFactoryDiscoversTheInitializer() {
        List<EnvironmentPostProcessor> processors = EnvironmentPostProcessorsFactory
                .fromSpringFactories(getClass().getClassLoader())
                .getEnvironmentPostProcessors(new DeferredLogs(), new DefaultBootstrapContext());

        assertThat(processors).hasAtLeastOneElementOfType(StorageTimeZoneInitializer.class);
    }

    /**
     * 등록 파일 <b>두 개</b>가 함께 있고 같은 FQCN 을 가리키는지.
     *
     * <p>클래스 이름을 바꾸거나 패키지를 옮기면 컴파일은 통과하고 <b>등록만 조용히 끊긴다.</b>
     * 문자열을 소스에서 가져와 대조해 그 창을 막는다.
     */
    @Test
    @DisplayName("등록은 spring.factories 와 .imports 두 곳에 같은 FQCN 으로 있다")
    void bothRegistrationFilesNameTheInitializer() throws IOException {
        String fqcn = StorageTimeZoneInitializer.class.getName();
        String hookType = EnvironmentPostProcessor.class.getName();

        String springFactories = read("src/main/resources/META-INF/spring.factories");
        assertThat(springFactories).contains(hookType).contains(fqcn);

        // Boot 4.x 대비 보험. 지금은 읽히지 않지만(클래스 Javadoc 참고) 함께 유지한다.
        String imports = read("src/main/resources/META-INF/spring/" + hookType + ".imports");
        assertThat(imports.lines().map(String::strip)
                .filter(line -> !line.isEmpty() && !line.startsWith("#")).toList())
                .containsExactly(fqcn);
    }

    private static String read(String path) throws IOException {
        return Files.readString(Path.of(path), StandardCharsets.UTF_8);
    }

    /**
     * 자동 구성 없는 최소 부팅 대상. {@code @SpringBootApplication}을 쓰지 않는다 —
     * DataSource·Flyway·Redis 가 붙으면 이 테스트가 컨테이너를 요구하게 된다.
     */
    @Configuration(proxyBeanMethods = false)
    static class BareBoot {

        /** 빈이 처음 만들어진 순간의 JVM 기본 시각대. */
        final AtomicReference<String> capturedAtBeanCreation =
                new AtomicReference<>(TimeZone.getDefault().getID());

        @Bean
        String marker() {
            return capturedAtBeanCreation.get();
        }
    }
}
