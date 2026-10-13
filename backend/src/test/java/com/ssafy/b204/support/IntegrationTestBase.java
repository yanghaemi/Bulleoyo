package com.ssafy.b204.support;

import com.ssafy.b204.coin.service.SupplyReconciler;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.settlement.FakeSettlementChainReader;
import com.ssafy.b204.settlement.repository.SettlementShareRepository;
import com.ssafy.b204.verify.FakeVerifyChainReader;
import com.ssafy.b204.verify.MutableClock;
import com.ssafy.b204.wallet.service.WalletBalanceRefresher;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * 통합 테스트 기반 — Testcontainers로 MySQL·Redis를 띄운다.
 *
 * <p><b>H2를 쓰지 않는다.</b> 스키마 정본이 MySQL {@code ENUM}이고 재고·입장 차단이 Redis
 * {@code SETNX}에 의존하는데, H2는 둘 다 다르게 동작해 <b>테스트가 거짓 통과</b>한다
 * (b204-stack 참조 문서).
 *
 * <p>컨테이너는 {@code static}이라 <b>테스트 클래스 전체가 하나를 공유</b>한다 — 클래스마다
 * 띄우면 MySQL 기동(약 15초)이 테스트 시간을 지배한다. Flyway V1도 한 번만 돈다.
 *
 * <p>이미지 태그를 {@code docker-compose.local.yml}과 같은 {@code mysql:8.0} ·
 * {@code redis:7-alpine}으로 맞췄다. 로컬에서 통과한 것이 CI에서도 통과해야 한다.
 *
 * <p>{@link Web3AuthStubServer}도 여기서 띄운다 — <b>모든 테스트가 컨텍스트 하나를 공유</b>하기
 * 위해서다. 하위 클래스에서 {@code @DynamicPropertySource}를 따로 걸면 프로퍼티가 달라져
 * 컨텍스트가 갈라지고 기동 시간이 배로 든다. JWKS 검증을 mock으로 우회하지 않고 실제 HTTP로
 * 타게 하려면 프로퍼티 주입이 컨텍스트 생성 시점에 있어야 한다.
 *
 * <p>Jenkins에서는 컨트롤러 컨테이너가 <b>호스트 도커 소켓</b>을 쓰므로 그대로 동작한다
 * ({@code backend/Dockerfile} 주석 — 이미지 빌드 시에는 {@code -x test}로 테스트를 건너뛰고
 * CI의 test 스테이지에서 따로 돈다).
 *
 * <p><b>컨텍스트 하나를 공유하는 규칙</b>(S15P21B204-182). Spring은 {@code @TestConfiguration}·
 * {@code @Import}·{@code @MockitoBean}/{@code @MockitoSpyBean}·{@code @TestPropertySource}·
 * {@code @DynamicPropertySource}·{@code @AutoConfigureMockMvc} 조합이 완전히 같을 때만 컨텍스트를
 * 재사용한다. 그래서 하위 클래스에 그런 것을 따로 두지 않는다.
 * <ul>
 *   <li>Fake·픽스처 빈은 {@link SharedTestBeans} 한 곳에 둔다.
 *   <li>spy는 아래 필드로 여기 모은다. spy는 스텁이 없으면 진짜 빈 그대로 돌고, 매 테스트 앞에서
 *       {@link Mockito#reset}으로 스텁·호출 기록을 지운다.
 *   <li>일부러 다른 설정이 필요한 테스트(체인 주소 · webauthn 켜짐 · 워커 켜짐 · 죽은 RPC)만
 *       {@code @TestPropertySource}로 갈라진다. 같은 설정끼리는 프로퍼티 배열을 <b>같은 순서</b>로 적는다.
 * </ul>
 */
@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import(SharedTestBeans.class)
@Testcontainers
public abstract class IntegrationTestBase {

    @ServiceConnection
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>(DockerImageName.parse("mysql:8.0"))
            .withDatabaseName("b204")
            .withUsername("b204")
            .withPassword("b204")
            .withCommand("--character-set-server=utf8mb4",
                    "--collation-server=utf8mb4_0900_ai_ci",
                    "--default-time-zone=+09:00",
                    // 컨테이너는 전 테스트가 공유하지만 Hikari 풀은 **Spring 컨텍스트마다** 생긴다.
                    // 9/21에는 컨텍스트 16 × 기본 풀 10 이 MySQL 기본 max_connections(151)를 넘겨
                    // "Too many connections" 가 났다(9/28 실측 23개 · HikariPool-23). S15P21B204-182 로
                    // 컨텍스트를 5개로 줄여(5 × 10 = 50) 기본 한도로도 충분하지만, 누가 설정이 다른
                    // 테스트를 더해 컨텍스트가 다시 늘어도 이 벽에 바로 부딪히지 않게 안전 여유로 남긴다.
                    // 풀을 줄이면 동시성 테스트(두 스레드 + REQUIRES_NEW)가 굶으므로 여유는 서버 한도로 둔다.
                    "--max-connections=500");

    // Redis는 @ServiceConnection 지원 컨테이너 타입이 testcontainers 기본 모듈에 없어
    // GenericContainer + @DynamicPropertySource 로 붙인다.
    static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7-alpine")).withExposedPorts(6379);

    /** 운영과 같은 JWKS 검증 경로를 타게 하는 로컬 발급자. mock 이 아니라 실제 HTTP 서버다. */
    protected static final Web3AuthStubServer WEB3AUTH = Web3AuthStubServer.start();

    /**
     * 업로드 저장 루트 — 저장소({@code ./uploads})·운영 경로({@code /app/uploads})를 더럽히지 않게
     * 임시 디렉토리로 둔다. 부모가 있어야 "루트 밖" 경로 탈출을 안전하게 재현할 수 있다
     * ({@code FileUploadApiTest}). {@code @TempDir}가 아닌 이유: {@code @DynamicPropertySource}가
     * 컨텍스트 생성 시점에 값을 읽는다.
     */
    protected static final Path UPLOAD_ROOT = createTempParent().resolve("uploads");

    static {
        MYSQL.start();
        REDIS.start();
    }

    private static Path createTempParent() {
        try {
            Path dir = Files.createTempDirectory("b204-upload-test");
            // 로컬에서 테스트를 반복하면 OS 임시 디렉토리에 업로드 더미가 쌓인다(CI 는 컨테이너째 버린다).
            // 파일이 든 디렉토리라 File.deleteOnExit 로는 안 지워진다 — 종료 훅에서 재귀로 지운다.
            Runtime.getRuntime().addShutdownHook(new Thread(() -> deleteRecursively(dir)));
            return dir;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void deleteRecursively(Path root) {
        try (var paths = Files.walk(root)) {
            paths.sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException ignored) {
            // 종료 중 정리 실패는 테스트 결과와 무관하다
        }
    }

    // spy — 진짜 빈이 그대로 돈다. 쓰는 테스트: PerformanceStudioApiTest · SettlementApiIntegrationTest.
    @MockitoSpyBean protected PerformanceRepository performanceRepository;
    @MockitoSpyBean protected SettlementShareRepository settlementShareRepository;
    @MockitoSpyBean protected WalletBalanceRefresher balanceRefresher;
    @MockitoSpyBean protected SupplyReconciler supplyReconciler;

    @Autowired private FakeSettlementChainReader sharedSettlementChain;
    @Autowired private FakeVerifyChainReader sharedVerifyChain;
    @Autowired private MutableClock sharedVerifyClock;

    /**
     * 공용 빈을 <b>빈 설정 기본 상태</b>로 되돌린다 — Fake 리더는 {@code Unavailable*}와 같은
     * "체인 미설정"(available=false · 전부 empty), 시계는 시스템 시계. Fake를 쓰는 테스트는 자기
     * {@code @BeforeEach}(이것 다음에 돈다)에서 {@code reset()}으로 켠다.
     */
    @BeforeEach
    void resetSharedTestBeans() {
        sharedSettlementChain.reset();
        sharedSettlementChain.available = false;
        sharedVerifyChain.reset();
        sharedVerifyChain.available = false;
        sharedVerifyClock.useSystemClock();
        Mockito.reset(performanceRepository, settlementShareRepository, balanceRefresher,
                supplyReconciler);
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("b204.upload.dir", UPLOAD_ROOT::toString);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        registry.add("b204.web3auth.jwks-uri", WEB3AUTH::jwksUri);
        registry.add("b204.web3auth.client-id", () -> Web3AuthStubServer.CLIENT_ID);
        registry.add("b204.web3auth.issuer", () -> Web3AuthStubServer.ISSUER);
    }
}
