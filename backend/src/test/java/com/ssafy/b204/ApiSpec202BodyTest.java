package com.ssafy.b204;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.coin.dto.CoinDtos;
import com.ssafy.b204.payment.dto.PaymentDtos;
import com.ssafy.b204.performance.dto.PerformanceDtos;
import com.ssafy.b204.refund.dto.RefundDtos;
import com.ssafy.b204.rule.dto.RuleDtos;
import com.ssafy.b204.settlement.dto.SettlementDtos;
import java.io.InputStream;
import java.lang.reflect.RecordComponent;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * 202 응답 본문의 **명세 ↔ record 대조**를 저장소에 넣는다.
 *
 * <p>S15P21B204-92 가 고친 것이 바로 이 대조가 없어서 생긴 드리프트다. openapi 가 이 9건을
 * 공용 {@code ChainJobAccepted}(jobId·status·pollAfterMs 3필드)로 선언해 두는 동안 record 는
 * 7~14필드로 자라 있었다. 두 파일이 멀어 코드 리뷰로는 안 잡힌다 — 여기서 잡는다.
 *
 * <p><b>왜 이게 프론트 문제인가.</b> {@code openapi.yaml} 은 {@code pnpm gen:api} 의 입력이라
 * 여기가 좁으면 프론트의 생성 타입에 그 필드가 아예 없다. 화면은 서버가 주는 값을 "없는 값"으로
 * 취급하고, 최악의 경우 {@code rule_04} 처럼 폴링이 조용히 안 켜져 영원히 확정되지 않는 화면이 된다.
 *
 * <p><b>이 검사가 깨지면</b> record 가 정본이다. record 에 필드를 더했으면 {@code parts/*.yaml}
 * 의 해당 202 에도 더하고 {@code build.py} 로 {@code openapi.yaml} 을 다시 만든다. 명세를 지워서
 * 통과시키지 말 것.
 *
 * <p><b>required 는 여기서 판정하지 않는다.</b> 전역 {@code non_null} 직렬화라 값이 null 이면
 * 서버는 키를 지운다. 어떤 필드가 "항상 채워지는가" 는 타입이 아니라 생성 지점이 정하므로
 * 리플렉션으로 알 수 없다. 이 검사는 <b>키 집합</b>만 본다.
 */
class ApiSpec202BodyTest {

    /** 정본은 기계가 읽는 산출물이다(= {@code gen:api} 의 입력). parts/*.yaml 이 아니다. */
    private static final Path OPENAPI =
            Path.of("..", "docs", "design", "api", "openapi.yaml");

    /** operationId → 그 202 를 반환하는 record. -92 가 손본 9건이다. */
    private static final Map<String, Class<?>> BODIES = new LinkedHashMap<>();

    static {
        BODIES.put("performance_12", PerformanceDtos.CancelPerformanceResponse.class);
        BODIES.put("performance_14", PerformanceDtos.DepositSignedTxResponse.class);
        BODIES.put("rule_05", RuleDtos.AgreeSignedTxResponse.class);
        BODIES.put("payment_03", PaymentDtos.PaymentSignedTxResponse.class);
        BODIES.put("coin_07", CoinDtos.GrantCoinResponse.class);
        BODIES.put("refund_02", RefundDtos.CancelTicketResponse.class);
        BODIES.put("settlement_02", SettlementDtos.AggregateResponse.class);
        BODIES.put("settlement_03", SettlementDtos.LockResponse.class);
        BODIES.put("settlement_05", SettlementDtos.ReleaseResponse.class);
        // rule_04(StartSaleResponse)는 -67 에서 이미 맞춰졌다. 같은 대조 대상이라 함께 지킨다.
        BODIES.put("rule_04", RuleDtos.StartSaleResponse.class);
    }

    @Test
    @DisplayName("202 응답 본문의 명세 필드 집합이 record 와 같다")
    void spec202MatchesRecords() throws Exception {
        Map<String, Object> spec = loadOpenapi();

        // 한 건씩 끊지 않고 전부 모아 보고한다 — 하나 고치고 다시 돌리는 왕복을 없앤다.
        StringBuilder mismatches = new StringBuilder();

        for (Map.Entry<String, Class<?>> entry : BODIES.entrySet()) {
            String operationId = entry.getKey();

            Set<String> declared = declared202DataProperties(spec, operationId);
            Set<String> actual = recordComponents(entry.getValue());

            if (!declared.equals(actual)) {
                Set<String> missingInSpec = new LinkedHashSet<>(actual);
                missingInSpec.removeAll(declared);
                Set<String> extraInSpec = new LinkedHashSet<>(declared);
                extraInSpec.removeAll(actual);

                mismatches
                        .append("\n  ").append(operationId)
                        .append(" (").append(entry.getValue().getSimpleName()).append(')');
                if (!missingInSpec.isEmpty()) {
                    mismatches.append("\n    명세에 없는 record 필드: ").append(missingInSpec);
                }
                if (!extraInSpec.isEmpty()) {
                    mismatches.append("\n    record 에 없는 명세 필드: ").append(extraInSpec);
                }
            }
        }

        assertThat(mismatches.toString())
                .as("202 본문이 명세와 어긋났다. record 가 정본이다 — parts/*.yaml 을 고치고 "
                        + "build.py 로 openapi.yaml 을 다시 만든 뒤, 프론트에서 pnpm gen:api 를 돌린다.%s",
                        mismatches)
                .isEmpty();
    }

    @Test
    @DisplayName("202 본문을 공용 $ref 로 되돌려 놓지 않았다")
    void no202FallsBackToSharedRef() throws Exception {
        String raw = Files.readString(OPENAPI);

        // -92 이전의 모양이다. 공용 컴포넌트는 삭제됐으므로 이 문자열이 다시 나타나면
        // 누군가 되돌렸다는 뜻이고, 그러면 9건이 한꺼번에 3필드로 좁아진다.
        assertThat(raw)
                .as("공용 responses/ChainJobAccepted 참조가 되살아났다. 202 는 오퍼레이션마다 "
                        + "실제 반환 필드로 선언한다(S15P21B204-92).")
                .doesNotContain("responses/ChainJobAccepted");
    }

    /* ─────────────────────────────── 읽기 도우미 ─────────────────────────────── */

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadOpenapi() throws Exception {
        assertThat(OPENAPI)
                .as("openapi.yaml 을 찾지 못했다. 테스트 작업 디렉토리가 backend/ 인지 확인한다")
                .exists();
        try (InputStream in = Files.newInputStream(OPENAPI)) {
            return (Map<String, Object>) new Yaml().load(in);
        }
    }

    /** {@code paths.*.*} 를 훑어 operationId 를 찾고, 그 202 의 {@code data} 속성 이름을 모은다. */
    @SuppressWarnings("unchecked")
    private Set<String> declared202DataProperties(Map<String, Object> spec, String operationId) {
        Map<String, Object> paths = (Map<String, Object>) spec.get("paths");

        for (Object pathItem : paths.values()) {
            for (Object maybeOperation : ((Map<String, Object>) pathItem).values()) {
                if (!(maybeOperation instanceof Map<?, ?> operation)) continue;
                if (!operationId.equals(operation.get("operationId"))) continue;

                Map<String, Object> responses =
                        (Map<String, Object>) ((Map<String, Object>) operation).get("responses");
                // snakeyaml 은 따옴표 없는 202 를 Integer 로 읽는다. 양쪽을 다 본다.
                Object accepted = responses.get("202");
                if (accepted == null) accepted = responses.get(202);

                assertThat(accepted).as("%s 에 202 응답이 없다", operationId).isNotNull();

                Map<String, Object> json = (Map<String, Object>)
                        ((Map<String, Object>) ((Map<String, Object>) accepted).get("content"))
                                .get("application/json");

                assertThat(json)
                        .as("%s 의 202 에 content 가 없다 — $ref 옆 형제로 적으면 build.py 가 지운다",
                                operationId)
                        .isNotNull();

                Map<String, Object> schema = (Map<String, Object>) json.get("schema");
                List<Object> allOf = (List<Object>) schema.get("allOf");

                assertThat(allOf)
                        .as("%s 의 202 schema 가 Envelope + data 의 allOf 모양이 아니다", operationId)
                        .isNotNull();

                for (Object part : allOf) {
                    Map<String, Object> properties =
                            (Map<String, Object>) ((Map<String, Object>) part).get("properties");
                    if (properties == null) continue;

                    Map<String, Object> data = (Map<String, Object>) properties.get("data");
                    if (data == null) continue;

                    Map<String, Object> dataProperties =
                            (Map<String, Object>) data.get("properties");
                    assertThat(dataProperties)
                            .as("%s 의 202 data 에 properties 가 없다", operationId)
                            .isNotNull();

                    return new LinkedHashSet<>(dataProperties.keySet());
                }
            }
        }

        throw new AssertionError(operationId + " 를 openapi.yaml 에서 찾지 못했다");
    }

    private Set<String> recordComponents(Class<?> record) {
        assertThat(record.isRecord()).as("%s 가 record 가 아니다", record.getSimpleName()).isTrue();
        return Arrays.stream(record.getRecordComponents())
                .map(RecordComponent::getName)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }
}
