package com.ssafy.b204.common.response;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.b204.common.error.ErrorCode;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 응답 래퍼가 규격 v3 §1의 3필드 계약을 지키는지 확인한다.
 *
 * <p>프론트가 {@code code}로만 분기하고 {@code data}가 실패 시 항상 {@code null}이라는 전제로
 * 타입을 만들기 때문에, 이 계약이 깨지면 프론트가 조용히 오동작한다.
 */
class ApiResponseTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("성공 응답은 code=SUCCESS · msg=\"\" 다")
    void success() {
        ApiResponse<Map<String, Object>> response = ApiResponse.success(Map.of("ticketId", 812));

        assertThat(response.code()).isEqualTo("SUCCESS");
        assertThat(response.msg()).isEmpty();
        assertThat(response.data()).containsEntry("ticketId", 812);
    }

    @Test
    @DisplayName("실패 응답의 data 는 예외 없이 null 이다")
    void errorDataIsAlwaysNull() {
        ApiResponse<Object> response = ApiResponse.error(ErrorCode.TICKET_SOLD_OUT);

        assertThat(response.code()).isEqualTo("TICKET_SOLD_OUT");
        assertThat(response.data()).isNull();
        assertThat(response.msg()).isEqualTo(ErrorCode.TICKET_SOLD_OUT.getDefaultMsg());
    }

    @Test
    @DisplayName("직렬화 결과는 정확히 code·data·msg 3필드다 — 래퍼에 필드를 추가하지 않는다")
    void serializedShapeHasExactlyThreeFields() throws Exception {
        String json = objectMapper.writeValueAsString(ApiResponse.success(Map.of("a", 1)));
        ObjectNode node = (ObjectNode) objectMapper.readTree(json);

        assertThat(fieldNames(node)).containsExactlyInAnyOrder("code", "data", "msg");
    }

    @Test
    @DisplayName("실패 응답에서도 data 키가 남는다 — 필드째 사라지면 프론트 타입이 깨진다")
    void nullDataKeyIsKept() throws Exception {
        String json = objectMapper.writeValueAsString(
                ApiResponse.error(ErrorCode.COMMON_NOT_FOUND));
        ObjectNode node = (ObjectNode) objectMapper.readTree(json);

        assertThat(fieldNames(node)).containsExactlyInAnyOrder("code", "data", "msg");
        assertThat(node.get("data").isNull()).isTrue();
    }

    @Test
    @DisplayName("payload 없는 성공도 3필드를 유지한다")
    void successWithoutPayload() {
        ApiResponse<Void> response = ApiResponse.success();

        assertThat(response.code()).isEqualTo("SUCCESS");
        assertThat(response.data()).isNull();
        assertThat(response.msg()).isEmpty();
    }

    @Test
    @DisplayName("PageInfo 는 0-base page 를 그대로 쓴다")
    void pageInfoIsZeroBased() {
        PageInfo pageInfo = new PageInfo(0, 20, 37, true);

        assertThat(pageInfo.page()).isZero();
        assertThat(pageInfo.size()).isEqualTo(20);
        assertThat(pageInfo.totalElements()).isEqualTo(37);
        assertThat(pageInfo.hasNext()).isTrue();
    }

    @Test
    @DisplayName("display_currency 가 KRW 면 display 를 내리지 않는다")
    void moneyOmitsDisplayForKrw() {
        Money money = Money.of(15000, "KRW", java.math.BigDecimal.valueOf(1350.0), null);

        assertThat(money.amount()).isEqualTo(15000);
        assertThat(money.currency()).isEqualTo("KRW");
        assertThat(money.display()).isNull();
    }

    @Test
    @DisplayName("환율이 없으면 display 를 내리지 않는다 — 미등록은 오류가 아니다")
    void moneyOmitsDisplayWithoutRate() {
        assertThat(Money.of(15000, "USD", null, null).display()).isNull();
    }

    @Test
    @DisplayName("display.approx 는 소수 2자리로 환산한다")
    void moneyComputesApprox() {
        Money money = Money.of(15000, "USD", java.math.BigDecimal.valueOf(1350.0), null);

        assertThat(money.display()).isNotNull();
        assertThat(money.display().currency()).isEqualTo("USD");
        // 15000 / 1350 = 11.111... → 11.11
        assertThat(money.display().approx()).isEqualByComparingTo("11.11");
    }

    /**
     * Jackson 2의 {@code ObjectNode}는 키 목록을 {@code Iterator}로 준다.
     * ({@code propertyNames()}는 Jackson 3 API다 — Boot 3.5는 Jackson 2를 쓴다)
     */
    private static java.util.List<String> fieldNames(ObjectNode node) {
        java.util.List<String> names = new java.util.ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }
}
