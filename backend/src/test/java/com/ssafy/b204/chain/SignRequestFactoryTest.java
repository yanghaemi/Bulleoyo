package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.ssafy.b204.chain.dto.ChainDtos.SignRequest;
import com.ssafy.b204.chain.service.FeeDelegationService;
import com.ssafy.b204.chain.service.SignRequestFactory;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * §0.4 ① {@code signRequests}의 <b>필수 필드 보장</b>.
 *
 * <p>{@code openapi.base.yaml}의 {@code SignRequest.required}는 {@code kind}·{@code required}·
 * {@code txType}·{@code to}·{@code data}·{@code value}·{@code chainId}·<b>{@code feePayer}</b>·
 * {@code summary} 9개이고 어느 것도 nullable이 아니다. 전역
 * {@code default-property-inclusion: non_null} 때문에 값이 {@code null}이면 <b>필드째 사라지고</b>
 * 프론트 생성 타입({@code feePayer: Address})이 거짓말이 된다(QA 2026-09-09 A-0-1·B-2-2).
 *
 * <p>그래서 {@code OPERATOR_ADDRESS}도 운영 키도 없으면 서명 파라미터를 만들지 않고
 * {@code COMMON_EXTERNAL_SERVICE_ERROR}(502)로 끊는다 — 컨트랙트 주소가 비었을 때와 같은 규칙이다.
 * 네트워크가 필요 없어 단위 테스트로 고정한다.
 */
class SignRequestFactoryTest {

    private static final String YOYO = "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736";
    private static final String SPLITTER = "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
    private static final String OPERATOR = "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432";
    private static final String KEY_DERIVED = "0x1111111111111111111111111111111111111111";

    private SignRequestFactory factory(String operatorAddress, String keyDerivedAddress) {
        ChainProperties properties = new ChainProperties(
                "https://public-en-kairos.node.kaia.io", 1001L, "", "", operatorAddress,
                new ChainProperties.Contract(YOYO, SPLITTER));
        FeeDelegationService feeDelegation = mock(FeeDelegationService.class);
        given(feeDelegation.feePayerAddress())
                .willReturn(Optional.ofNullable(keyDerivedAddress));
        return new SignRequestFactory(properties, feeDelegation);
    }

    @Test
    @DisplayName("OPERATOR_ADDRESS 만 있어도 feePayer 가 채워진다 — 키 없는 환경의 서명 화면")
    void fillsFeePayerFromConfiguredAddress() {
        SignRequest request = factory(OPERATOR, null)
                .deposit(12L, Map.of("title", "Pay deposit"));

        assertThat(request.feePayer()).isEqualTo(OPERATOR);
        assertThat(request.to()).isEqualTo(SPLITTER);
        assertThat(request.value()).isEqualTo("0x0");
        assertThat(request.chainId()).isEqualTo("0x3e9");
    }

    @Test
    @DisplayName("운영 키가 있으면 키에서 나온 주소가 설정값보다 우선한다")
    void prefersKeyDerivedAddress() {
        SignRequest request = factory(OPERATOR, KEY_DERIVED)
                .agree(12L, "0x" + "1".repeat(64), Map.of("title", "Agree"));

        assertThat(request.feePayer()).isEqualTo(KEY_DERIVED);
    }

    @Test
    @DisplayName("feePayer 를 만들 수 없으면 필드를 비우지 않고 502 로 끊는다 — required 필드다")
    void failsFastWhenFeePayerUnknown() {
        SignRequestFactory factory = factory("", null);

        assertThatThrownBy(() -> factory.deposit(12L, Map.of("title", "Pay deposit")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR);
        assertThatThrownBy(() -> factory.approve(50_000L, true, Map.of("title", "Allow")))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> factory.purchase(12L, "0x" + "2".repeat(64), 0, 50_000L, 1,
                Map.of("title", "Confirm")))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("chain_job 기록용 주소는 여전히 null 을 허용한다 — 응답 스키마가 아니다")
    void jobRecordAddressStaysNullable() {
        assertThat(factory("", null).feePayerAddress()).isNull();
    }
}
