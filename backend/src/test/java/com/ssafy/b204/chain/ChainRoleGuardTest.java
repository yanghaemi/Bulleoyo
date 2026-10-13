package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.ssafy.b204.chain.config.ChainRoleGuard;
import com.ssafy.b204.chain.config.ChainRoleReader;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 역할 키 분리 검증 규칙 — 컨트랙트 감사 L-10(Jira S15P21B204-41).
 *
 * <p>노드를 띄우지 않는다. 검증 대상은 <b>두 주소를 받아서 어떤 판정을 내리는가</b> 하나이고,
 * 그 판정은 조회 결과의 모양에만 의존하므로 {@link ChainRoleReader} mock으로 전부 재현된다
 * (web3j {@code Contract}까지 mock하면 테스트가 라이브러리 내부 구조에 묶인다).
 *
 * <p>실주소 대조는 컨트랙트 배포 후 서버를 실제 Kairos 구성으로 한 번 띄워 확인한다 —
 * 실행법은 {@code _workspace/be_chain_endpoints.md} §12.
 */
class ChainRoleGuardTest {

    private static final String MINTER = "0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA";
    private static final String OPERATOR = "0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB";

    private ChainRoleReader reader;

    @BeforeEach
    void setUp() {
        reader = mock(ChainRoleReader.class);
    }

    @Test
    @DisplayName("minter != operator 면 통과한다 — 서버 키가 없어도(조회 전용 구성) 본다")
    void passesWhenRolesAreSeparateKeys() throws Exception {
        given(reader.minter()).willReturn(MINTER);
        given(reader.operator()).willReturn(OPERATOR);

        assertThatCode(() -> new ChainRoleGuard(reader, null, null).verify())
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("minter == operator 면 기동을 세운다 — 한 키가 무한 발행 + 정산 실행을 동시에 갖는다")
    void failsWhenOneKeyHoldsBothRoles() throws Exception {
        // 대소문자만 다른 같은 주소도 같은 키다(EIP-55 체크섬 표기 섞임).
        given(reader.minter()).willReturn(MINTER);
        given(reader.operator()).willReturn("0x" + MINTER.substring(2).toUpperCase());

        assertThatThrownBy(() -> new ChainRoleGuard(reader, MINTER, MINTER).verify())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("감사 L-10")
                .hasMessageContaining("rotateMinter");
    }

    @Test
    @DisplayName("노드가 안 뜨면(IOException) 기동을 막지 않는다 — AVAIL-02 degrade")
    void skipsWhenNodeIsUnreachable() throws Exception {
        given(reader.minter()).willThrow(new IOException("connect timed out"));

        assertThatCode(() -> new ChainRoleGuard(reader, MINTER, OPERATOR).verify())
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("주소에 컨트랙트가 없어 빈 응답이면 건너뛴다 — 첫 배포 전 구성")
    void skipsWhenContractIsNotDeployed() throws Exception {
        given(reader.minter()).willThrow(new RuntimeException("Empty value (0x) returned from contract"));

        assertThatCode(() -> new ChainRoleGuard(reader, MINTER, OPERATOR).verify())
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("역할 주소가 제로 주소면 판정하지 않는다 — 둘 다 0x0이어도 '같은 키'로 보지 않는다")
    void skipsWhenRoleAddressIsZero() throws Exception {
        String zero = "0x0000000000000000000000000000000000000000";
        given(reader.minter()).willReturn(zero);
        given(reader.operator()).willReturn(zero);

        assertThatCode(() -> new ChainRoleGuard(reader, MINTER, OPERATOR).verify())
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("서버 MINTER 키의 주소가 온체인 minter 와 다르면 기동을 세운다")
    void failsWhenServerMinterKeyDoesNotMatchOnChain() throws Exception {
        given(reader.minter()).willReturn(MINTER);
        given(reader.operator()).willReturn(OPERATOR);
        String wrongKeyAddress = "0x3333333333333333333333333333333333333333";

        assertThatThrownBy(() -> new ChainRoleGuard(reader, wrongKeyAddress, OPERATOR).verify())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MINTER 키가 온체인 역할과 다르다")
                .hasMessageContaining(wrongKeyAddress);
    }

    @Test
    @DisplayName("서버 OPERATOR 키의 주소가 온체인 operator 와 다르면 기동을 세운다")
    void failsWhenServerOperatorKeyDoesNotMatchOnChain() throws Exception {
        given(reader.minter()).willReturn(MINTER);
        given(reader.operator()).willReturn(OPERATOR);
        String wrongKeyAddress = "0x4444444444444444444444444444444444444444";

        assertThatThrownBy(() -> new ChainRoleGuard(reader, MINTER, wrongKeyAddress).verify())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("OPERATOR 키가 온체인 역할과 다르다")
                .hasMessageContaining("RevenueSplitter.operator()");
    }

    @Test
    @DisplayName("서버 키가 한쪽만 있으면 키 대조를 건너뛴다 — 없는 키를 불일치로 볼 수 없다")
    void skipsKeyComparisonWhenOnlyOneKeyIsPresent() throws Exception {
        given(reader.minter()).willReturn(MINTER);
        given(reader.operator()).willReturn(OPERATOR);

        assertThatCode(() -> new ChainRoleGuard(reader, "0x9999999999999999999999999999999999999999", null)
                .verify()).doesNotThrowAnyException();
    }
}
