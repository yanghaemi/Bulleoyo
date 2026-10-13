package com.ssafy.b204.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcBuilderCustomizer;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.ConfigurableMockMvcBuilder;
import org.yaml.snakeyaml.Yaml;

/**
 * MockMvc 로 나가는 <b>실물 응답 JSON</b>을 {@code docs/design/api/openapi.yaml} 과 대조하고,
 * 프론트 픽스처로 쓸 수 있게 덤프한다.
 *
 * <p><b>왜 HTTP 경로에 거는가.</b> {@code ApiSpec202BodyTest} 는 리플렉션으로 "명세 필드 집합 ==
 * record 컴포넌트 이름"만 본다. 그런데 서버는 전역 {@code non_null} 직렬화라 <b>값이 null 이면 키를
 * 지운다</b>. 즉 명세의 {@code required} 가 맞는지는 타입이 아니라 "그 서비스가 실제로 값을
 * 채우는가" 가 정하고, 그건 <b>응답 JSON 을 봐야만</b> 확인된다. 여기가 그 자리다.
 *
 * <p>대조 규칙은 둘이다.
 * <ol>
 *   <li>응답에 있는 키가 전부 명세에 선언돼 있다 — 빠지면 {@code pnpm gen:api} 생성 타입에 그 필드가
 *       없어 프론트가 서버가 준 값을 못 읽는다(S15P21B204-92 가 고친 사고).</li>
 *   <li>명세가 {@code required} 로 선언한 키가 응답에 실제로 있다 — 없으면 생성 타입이
 *       non-optional 로 나와 화면이 {@code undefined} 를 값으로 믿는다.</li>
 * </ol>
 *
 * <p><b>모르는 것은 실패로 만들지 않는다.</b> 202 가 아니거나 요청 경로에 대응하는 operationId 가
 * 없으면 조용히 건너뛴다.
 *
 * <p><b>등록 방식.</b> {@code @Component} 라 {@code com.ssafy.b204} 컴포넌트 스캔이 테스트
 * 클래스패스에서 이 빈을 집어 간다. Boot 의 {@code MockMvcAutoConfiguration} 이 컨텍스트의
 * {@link MockMvcBuilderCustomizer} 를 전부 적용하므로 {@code @AutoConfigureMockMvc} 를 쓰는 모든
 * 테스트가 <b>수정 없이</b> 이 검사를 통과하게 된다. 3400줄짜리 흐름 테스트를 건드리지 않는 것이
 * 목적이다. 운영 jar 에는 테스트 소스가 들어가지 않으므로 런타임 영향은 없다.
 */
@Component
public class LiveApiSpecRecorder implements MockMvcBuilderCustomizer {

    /** 정본은 기계가 읽는 산출물이다(= {@code gen:api} 의 입력). parts/*.yaml 이 아니다. */
    private static final Path OPENAPI = Path.of("..", "docs", "design", "api", "openapi.yaml");

    /** 프론트 픽스처 후보. 서버가 쓴 바이트 그대로 둔다 — 정렬·보정하지 않는다. */
    private static final Path DUMP_DIR = Path.of("..", "_workspace", "live-json");

    /**
     * 덤프 대상. 202 열 건(=-92 대상)과, 화면 하나가 통째로 그 응답으로 그려지는 200 여섯 건.
     * 여기에 없는 operationId 는 대조만 하고 파일로 남기지 않는다.
     */
    private static final Set<String> DUMP = Set.of(
            "performance_12", "performance_14", "rule_04", "rule_05", "payment_03",
            "coin_07", "refund_02", "settlement_02", "settlement_03", "settlement_05",
            "settlement_01", "verify_01", "settlement_07", "admin_09", "coin_08",
            "performance_11");

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Map<String, Object> SPEC = loadSpec();
    private static final List<Route> ROUTES = loadRoutes();

    /**
     * 같은 operationId 는 <b>처음 본 응답 하나만</b> 남긴다. 한 번의 테스트 실행에서 같은 API 를
     * 여러 번 치는데(에러 케이스 포함) 마지막 것이 덮으면 실행마다 파일이 흔들린다. 여러 상태를
     * 일부러 남기고 싶으면 {@link #dumpAs} 로 이름을 붙인다.
     */
    private static final Set<String> DUMPED = ConcurrentHashMap.newKeySet();

    @Override
    public void customize(ConfigurableMockMvcBuilder<?> builder) {
        builder.alwaysDo(LiveApiSpecRecorder::observe);
    }

    /** 같은 operationId 의 다른 상태를 따로 남긴다 — 예: {@code settlement_01.before-aggregate}. */
    public static void dumpAs(MvcResult result, String name) throws Exception {
        write(name, result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    /* ─────────────────────────────── 관측 ─────────────────────────────── */

    private static void observe(MvcResult result) throws Exception {
        MockHttpServletRequest request = result.getRequest();
        MockHttpServletResponse response = result.getResponse();

        Route route = resolve(request.getMethod(), request.getRequestURI());
        if (route == null) {
            return; // 명세에 없는 경로(actuator 등) — 모르는 것을 실패로 만들지 않는다.
        }
        String contentType = response.getContentType();
        if (contentType == null || !contentType.contains("json")) {
            return;
        }
        String body = response.getContentAsString(StandardCharsets.UTF_8);
        if (body.isBlank()) {
            return; // 비동기 디스패치 전 등 — 본문이 아직 없다.
        }
        int status = response.getStatus();
        if (status / 100 != 2) {
            return; // 4xx·5xx 봉투는 대조 대상도 픽스처도 아니다.
        }

        JsonNode envelope = MAPPER.readTree(body);
        if (status == 202) {
            verify202(route, envelope);
        }
        if (DUMP.contains(route.operationId) && DUMPED.add(route.operationId)) {
            write(route.operationId, body);
        }
    }

    /**
     * 실물 202 본문 ↔ 명세. 어긋난 것을 <b>한 번에 모두</b> 보고한다 — 한 건 고치고 다시 돌리는
     * 왕복을 만들지 않는다.
     */
    @SuppressWarnings("unchecked")
    private static void verify202(Route route, JsonNode envelope) {
        Map<String, Object> dataSchema = data202Schema(route.operation);
        if (dataSchema == null) {
            throw new AssertionError(route.operationId + ": 서버가 202 를 냈는데 openapi.yaml 의 그"
                    + " 오퍼레이션에는 202 의 data 스키마가 없다. 명세를 고친다(record 가 정본).");
        }
        JsonNode data = envelope.get("data");
        if (data == null || !data.isObject()) {
            return; // data 없는 202 는 대조할 것이 없다.
        }

        Set<String> declared = new LinkedHashSet<>(
                ((Map<String, Object>) dataSchema.get("properties")).keySet());
        Set<String> required = dataSchema.get("required") == null
                ? Set.of()
                : new LinkedHashSet<>((List<String>) dataSchema.get("required"));

        Set<String> actual = new LinkedHashSet<>();
        data.fieldNames().forEachRemaining(actual::add);

        Set<String> undeclared = new LinkedHashSet<>(actual);
        undeclared.removeAll(declared);

        Set<String> missingRequired = new LinkedHashSet<>(required);
        missingRequired.removeAll(actual);

        if (undeclared.isEmpty() && missingRequired.isEmpty()) {
            return;
        }
        StringBuilder message = new StringBuilder()
                .append("실물 202 본문이 openapi.yaml 과 어긋난다 — ").append(route.operationId)
                .append(" (").append(route.method).append(' ').append(route.template).append(')');
        if (!undeclared.isEmpty()) {
            message.append("\n  명세에 없는 응답 키: ").append(undeclared)
                    .append("\n    → gen:api 생성 타입에 이 필드가 없다. parts/*.yaml 에 더하고"
                            + " build.py 로 openapi.yaml 을 다시 만든다.");
        }
        if (!missingRequired.isEmpty()) {
            message.append("\n  required 인데 응답에 없는 키: ").append(missingRequired)
                    .append("\n    → 전역 non_null 이 지운 자리다. 그 필드는 required 가 아니다.");
        }
        message.append("\n  명세 선언: ").append(declared)
                .append("\n  명세 required: ").append(required)
                .append("\n  실제 응답: ").append(actual);
        throw new AssertionError(message.toString());
    }

    private static void write(String name, String body) throws Exception {
        Files.createDirectories(DUMP_DIR);
        Files.writeString(DUMP_DIR.resolve(name + ".json"), body, StandardCharsets.UTF_8);
    }

    /* ─────────────────────────── 경로 → operationId ─────────────────────────── */

    /** 리터럴이 많은(= 경로 변수가 적은) 쪽이 이긴다 — {@code /performances/me} 가 {@code /{id}} 를 앞선다. */
    private static Route resolve(String method, String uri) {
        return ROUTES.stream()
                .filter(route -> route.method.equals(method) && route.pattern.matcher(uri).matches())
                .min(Comparator.comparingInt(route -> route.variables))
                .orElse(null);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> loadSpec() {
        try (InputStream in = Files.newInputStream(OPENAPI)) {
            return (Map<String, Object>) new Yaml().load(in);
        } catch (Exception e) {
            throw new IllegalStateException("openapi.yaml 을 읽지 못했다: " + OPENAPI.toAbsolutePath(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Route> loadRoutes() {
        List<Route> routes = new ArrayList<>();
        ((Map<String, Object>) SPEC.get("paths")).forEach((template, item) ->
                ((Map<String, Object>) item).forEach((method, operation) -> {
                    if (!(operation instanceof Map<?, ?> map)) return;
                    Object operationId = map.get("operationId");
                    if (operationId == null) return;
                    routes.add(new Route(
                            method.toUpperCase(),
                            template,
                            Pattern.compile("^" + template.replaceAll("\\{[^/}]+}", "[^/]+") + "$"),
                            (int) template.chars().filter(c -> c == '{').count(),
                            (String) operationId,
                            (Map<String, Object>) map));
                }));
        return List.copyOf(routes);
    }

    /** {@code responses.202.content.application/json.schema.allOf[*].properties.data} */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> data202Schema(Map<String, Object> operation) {
        Map<String, Object> responses = (Map<String, Object>) operation.get("responses");
        if (responses == null) return null;
        // snakeyaml 은 따옴표 없는 202 를 Integer 로 읽는다. 양쪽을 다 본다.
        Object accepted = responses.get("202");
        if (accepted == null) accepted = responses.get(202);
        if (!(accepted instanceof Map<?, ?> acceptedMap)) return null;

        Map<String, Object> content = (Map<String, Object>) acceptedMap.get("content");
        if (content == null) return null;
        Map<String, Object> json = (Map<String, Object>) content.get("application/json");
        if (json == null) return null;
        Map<String, Object> schema = (Map<String, Object>) json.get("schema");
        if (schema == null) return null;
        List<Object> allOf = (List<Object>) schema.get("allOf");
        if (allOf == null) return null;

        for (Object part : allOf) {
            Map<String, Object> properties = (Map<String, Object>) ((Map<String, Object>) part)
                    .get("properties");
            if (properties == null) continue;
            Map<String, Object> data = deref((Map<String, Object>) properties.get("data"));
            if (data == null || data.get("properties") == null) continue;
            return data;
        }
        return null;
    }

    /**
     * {@code $ref: '#/components/schemas/X'} 를 따라간다.
     *
     * <p>202 의 {@code data} 를 인라인으로 적은 오퍼레이션도 있고({@code settlement_02}) 이름 붙은
     * 컴포넌트로 적은 오퍼레이션도 있다({@code wallet_04 → WalletLinkResponse}). 둘 다 정상이므로
     * 여기서 흡수한다 — 안 그러면 후자를 "명세에 202 가 없다" 로 잘못 보고한다.
     */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> deref(Map<String, Object> schema) {
        Map<String, Object> current = schema;
        for (int hop = 0; current != null && current.get("$ref") instanceof String ref; hop++) {
            if (hop > 10 || !ref.startsWith("#/")) return null; // 순환·외부 참조는 따라가지 않는다.
            Object node = SPEC;
            for (String segment : ref.substring(2).split("/")) {
                if (!(node instanceof Map<?, ?> map)) return null;
                node = map.get(segment);
            }
            current = node instanceof Map ? (Map<String, Object>) node : null;
        }
        return current;
    }

    private record Route(String method, String template, Pattern pattern, int variables,
                         String operationId, Map<String, Object> operation) {}
}
