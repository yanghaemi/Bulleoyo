package com.ssafy.b204.common.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.common.config.StorageTimeZoneInitializer;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 저장 시각의 시각대 규약 — <b>배포 환경 TZ에 결과가 달라지지 않는다.</b>
 *
 * <p>버그의 모양은 이랬다. {@code Ticket.markUsed}가 {@code LocalDateTime.now()}(JVM 기본
 * 시각대)로 {@code entered_at}을 찍는데 {@link TimeSupport#toOffset}은 저장값을 <b>KST로</b>
 * 해석한다. 개발 노트북(KST)에서는 두 값이 같아 아무 일도 없지만 <b>EC2 기본값은 UTC</b>라
 * 그 환경에서는 응답의 시각이 9시간 어긋난다. 같은 패턴이 performance·ticket·order의 만료·마감
 * 판정에도 있었다(QA 후속 · {@code be_entry_endpoints.md} §5-3).
 *
 * <p>스프링 컨텍스트가 필요 없다 — 순수 계산과 소스 스캔이다. 컨테이너를 띄우지 않으므로
 * 테스트 시간에도 영향이 없다.
 */
class StorageTimeZoneTest {

    private final TimeZone original = TimeZone.getDefault();

    @AfterEach
    void restoreTimeZone() {
        TimeZone.setDefault(original);
    }

    @Test
    @DisplayName("UTC JVM 에서도 nowStored() 는 KST 벽시계다 — 저장·되읽기가 왕복한다")
    void nowStoredIsIndependentOfJvmTimeZone() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));

        LocalDateTime stored = TimeSupport.nowStored();
        LocalDateTime jvmLocal = LocalDateTime.now();

        // UTC JVM 에서 둘은 9시간 벌어진다 — 이 차이가 곧 옛 버그의 크기다.
        assertThat(Duration.between(jvmLocal, stored).toMinutes())
                .isBetween(9L * 60 - 1, 9L * 60 + 1);

        // 되읽기(toOffset)가 저장값을 KST 로 해석하므로 실제 순간이 복원된다.
        OffsetDateTime readBack = TimeSupport.toOffset(stored, "UTC");
        assertThat(Duration.between(readBack.toInstant(), Instant.now()).abs())
                .isLessThan(Duration.ofSeconds(5));
    }

    @Test
    @DisplayName("KST JVM 에서는 동작이 그대로다 — 노트북에서 결과가 바뀌지 않는다")
    void nowStoredMatchesJvmLocalWhenJvmIsKst() {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"));

        assertThat(Duration.between(LocalDateTime.now(), TimeSupport.nowStored()).abs())
                .isLessThan(Duration.ofSeconds(5));
    }

    /**
     * {@code @CreationTimestamp}·{@code @UpdateTimestamp}·JPA Auditing 은 우리가 부르는 코드가
     * 아니라 <b>JVM 기본 시각대</b>로 시각을 만든다. 그래서 애플리케이션이 기동 전에 기본
     * 시각대를 저장 기준으로 못 박는다({@code StorageTimeZoneInitializer}).
     *
     * <p><b>이 테스트만으로는 부족하다.</b> {@code pin()}을 직접 부르므로 <b>등록 파일을 지워도
     * 통과한다</b> — 등록이 실제로 읽히는지는
     * {@link StorageTimeZoneBootstrapTest}가 스프링을 부팅해 확인한다.
     */
    @Test
    @DisplayName("UTC 로 떠도 초기화 훅이 기본 시각대를 저장 기준으로 바꾼다 — created_at 이 어긋나지 않는다")
    void initializerPinsDefaultTimeZone() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        assertThat(LocalDateTime.now()).isNotEqualTo(TimeSupport.nowStored());

        StorageTimeZoneInitializer.pin();

        assertThat(TimeZone.getDefault().toZoneId()).isEqualTo(TimeSupport.STORAGE_ZONE);
        assertThat(Duration.between(LocalDateTime.now(), TimeSupport.nowStored()).abs())
                .isLessThan(Duration.ofSeconds(5));
    }

    @Test
    @DisplayName("STORAGE_ZONE 은 hibernate.jdbc.time_zone 설정과 같아야 한다")
    void storageZoneMatchesHibernateSetting() throws IOException {
        String yml = Files.readString(Path.of("src/main/resources/application.yml"),
                StandardCharsets.UTF_8);
        assertThat(yml).contains("time_zone: " + TimeSupport.STORAGE_ZONE.getId());
        assertThat(TimeSupport.STORAGE_ZONE).isEqualTo(ZoneId.of("Asia/Seoul"));
    }

    /**
     * <b>회귀 방지</b> — 새 코드가 다시 {@code LocalDateTime.now()}(인자 없는 형태)를 쓰면
     * 여기서 막힌다. 저장·비교용 "지금"은 {@link TimeSupport#nowStored()} 하나로 통일한다.
     *
     * <p>{@link Instant#now()}는 대상이 아니다 — 시각대가 없는 절대 시각이라 JVM 설정에
     * 영향받지 않는다(JWT 만료 · QR 윈도우 · Redis 캐시 신선도가 이걸 쓴다).
     *
     * <p><b>{@code java.time}의 인자 없는 {@code now()} 전부를 본다.</b> QA 가 남긴 빈틈이다 —
     * 이전 정규식은 {@code LocalDateTime}·{@code LocalDate}만 봐서
     * {@code OffsetDateTime.now()}·{@code ZonedDateTime.now()}·{@code LocalTime.now()}가
     * 그대로 통과했다. 그것들은 오프셋을 <b>가지고</b> 있어 값이 조용히 틀리지는 않지만 그
     * 오프셋이 배포 환경 TZ 다 — UTC 박스에서 응답에 {@code +00:00}이 실려 나가고,
     * 화면이 KST 를 병기하는 §0.1 규약이 깨진다. 존을 명시한 형태
     * ({@code OffsetDateTime.now(KST)})는 대상이 아니다.
     */
    @Test
    @DisplayName("main 소스에 인자 없는 java.time now() 가 남아 있지 않다 — 존을 명시한 형태만 허용")
    void noZonelessNowInMainSources() throws IOException {
        Pattern zoneless = Pattern.compile("\\b(LocalDateTime|LocalDate|LocalTime|OffsetDateTime"
                + "|OffsetTime|ZonedDateTime|Year|YearMonth|MonthDay)\\.now\\(\\s*\\)");
        List<String> offenders = new ArrayList<>();

        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            for (Path file : files.filter(f -> f.toString().endsWith(".java")).toList()) {
                List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    String trimmed = line.strip();
                    // 주석·Javadoc 은 설명이라 대상이 아니다(이 규약을 적어 둔 자리가 있다).
                    if (trimmed.startsWith("*") || trimmed.startsWith("//")
                            || trimmed.startsWith("/*")) {
                        continue;
                    }
                    if (zoneless.matcher(line).find()) {
                        offenders.add(file + ":" + (i + 1) + "  " + trimmed);
                    }
                }
            }
        }

        assertThat(offenders)
                .withFailMessage("배포 환경 TZ 에 의존하는 시각 생성이 남았다 —"
                        + " TimeSupport.nowStored() 를 쓴다.%n%s", String.join("\n", offenders))
                .isEmpty();
    }
}
