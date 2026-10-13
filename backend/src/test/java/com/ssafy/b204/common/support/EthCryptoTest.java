package com.ssafy.b204.common.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.support.TestWallet;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link EthCrypto}를 <b>알려진 값</b>으로 고정한다.
 *
 * <p>이 클래스가 틀리면 지갑 소유 증명(API-wallet-04 {@code EXTERNAL})이 조용히 통과하거나 조용히
 * 막힌다. 둘 다 통합 테스트에서 원인을 찾기 어렵다. 그래서 라운드트립만 보지 않고 <b>외부에서
 * 검증 가능한 상수</b>로도 못박는다 — 우리 코드끼리만 일치하는 상태를 성공으로 읽지 않기 위해서다.
 *
 * <p>스프링 컨텍스트가 필요 없다(Testcontainers·Docker 없이 돈다).
 */
class EthCryptoTest {

    @Test
    @DisplayName("keccak-256이 표준 벡터와 같다 — SHA3-256과 다른 해시임을 확인한다")
    void keccak256MatchesKnownVectors() {
        assertThat(hex(EthCrypto.keccak256(new byte[0])))
                .isEqualTo("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
        assertThat(hex(EthCrypto.keccak256("abc".getBytes(StandardCharsets.UTF_8))))
                .isEqualTo("4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
    }

    @Test
    @DisplayName("개인키 1의 주소가 알려진 값과 같다 — 공개키 → 주소 파생 검증")
    void derivesKnownAddressFromPrivateKeyOne() {
        TestWallet wallet = TestWallet.of(BigInteger.ONE);
        assertThat(wallet.address())
                .isEqualToIgnoringCase("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
    }

    @Test
    @DisplayName("EIP-191 접두가 규격 그대로다 — 길이는 바이트 수다")
    void personalSignPrefixUsesByteLength() {
        assertThat(new String(EthCrypto.prefixed("abc"), StandardCharsets.UTF_8))
                .isEqualTo("Ethereum Signed Message:\n3abc");
        // 한글 한 글자는 UTF-8로 3바이트다. 문자 수를 쓰면 지갑과 해시가 달라진다.
        assertThat(new String(EthCrypto.prefixed("가"), StandardCharsets.UTF_8))
                .isEqualTo("Ethereum Signed Message:\n3가");
    }

    @Test
    @DisplayName("personal_sign 서명에서 서명자 주소를 복원한다")
    void recoversSignerAddress() {
        TestWallet wallet = TestWallet.random();
        String message = "B204 Stage wants you to link this wallet.\n\nNonce: 0123456789abcdef";

        String signature = wallet.personalSign(message);

        assertThat(signature).matches("^0x[0-9a-f]{130}$");
        assertThat(EthCrypto.recoverPersonalSign(message, signature))
                .get(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .isEqualToIgnoringCase(wallet.address());
    }

    @Test
    @DisplayName("메시지가 한 글자만 달라도 다른 주소가 복원된다 — 원문을 그대로 보관해야 하는 이유")
    void recoveryIsBoundToExactMessage() {
        TestWallet wallet = TestWallet.random();
        String message = "Nonce: 0123456789abcdef";
        String signature = wallet.personalSign(message);

        assertThat(EthCrypto.recoverPersonalSign(message + " ", signature))
                .get(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .isNotEqualToIgnoringCase(wallet.address());
    }

    @Test
    @DisplayName("형식이 아닌 서명은 복원하지 않고 비어 있다 — 예외로 500이 되면 안 된다")
    void malformedSignatureYieldsEmpty() {
        assertThat(EthCrypto.recoverPersonalSign("hello", "0xdeadbeef")).isEmpty();
        assertThat(EthCrypto.recoverPersonalSign("hello", "not-a-signature")).isEmpty();
        assertThat(EthCrypto.recoverPersonalSign("hello", null)).isEmpty();
    }

    @Test
    @DisplayName("압축·비압축 공개키가 같은 주소를 만든다")
    void compressedAndUncompressedAgree() {
        TestWallet wallet = TestWallet.random();
        String uncompressed = wallet.publicKeyHex();

        assertThat(EthCrypto.addressFromPublicKey(uncompressed))
                .get(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .isEqualToIgnoringCase(wallet.address());
        // 04 접두를 뗀 raw 128자도 같은 결과여야 한다(Web3Auth 클레임 표기가 갈린다).
        assertThat(EthCrypto.addressFromPublicKey(uncompressed.substring(4)))
                .get(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .isEqualToIgnoringCase(wallet.address());
    }

    @Test
    @DisplayName("주소 비교는 체크섬 대소문자를 무시한다 — 표기이지 값이 아니다")
    void addressComparisonIgnoresChecksumCase() {
        assertThat(EthCrypto.sameAddress("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
                "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf")).isTrue();
        assertThat(EthCrypto.sameAddress("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
                "0x0000000000000000000000000000000000000001")).isFalse();
    }

    private static String hex(byte[] bytes) {
        return HexFormat.of().formatHex(bytes);
    }
}
