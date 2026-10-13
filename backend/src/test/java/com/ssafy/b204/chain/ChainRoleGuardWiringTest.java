package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.ssafy.b204.chain.config.ChainRoleGuard;
import com.ssafy.b204.chain.config.ChainRoleReader;
import com.ssafy.b204.support.IntegrationTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

/**
 * <b>체인 주소가 있는 구성에서 실제로 빈이 엮이는지</b>를 본다 — 규칙 자체는
 * {@link ChainRoleGuardTest}가 노드 없이 검증하고, 여기서는 배선만 확인한다.
 *
 * <p>RPC는 <b>아무도 듣지 않는 주소</b>다. 그래서 이 테스트는 두 가지를 동시에 증명한다.
 *
 * <ol>
 *   <li>{@code Web3j} → {@link ChainRoleReader} → {@link ChainRoleGuard}가 컨트랙트 래퍼
 *       ({@code YoYo.load}·{@code RevenueSplitter.load})까지 포함해 생성된다.
 *   <li><b>노드가 없어도 컨텍스트가 뜬다</b>(AVAIL-02). 여기서 기동이 막히면 시연 당일 공용 노드가
 *       흔들릴 때 서버 전체가 못 뜬다.
 * </ol>
 */
@TestPropertySource(properties = {
        "b204.chain.rpc-url=http://127.0.0.1:1",
        "b204.chain.contract.yoyo-address=0x000000000000000000000000000000000000dEaD",
        "b204.chain.contract.splitter-address=0x000000000000000000000000000000000000bEEF"
})
class ChainRoleGuardWiringTest extends IntegrationTestBase {

    @Autowired
    private ChainRoleGuard guard;

    @Test
    @DisplayName("컨트랙트 주소가 있으면 역할 검증 빈이 뜨고, 노드가 없어도 기동을 막지 않는다")
    void guardIsWiredAndDegradesWhenNodeIsUnreachable() {
        assertThat(guard).isNotNull();
        assertThatCode(guard::verify).doesNotThrowAnyException();
    }
}
