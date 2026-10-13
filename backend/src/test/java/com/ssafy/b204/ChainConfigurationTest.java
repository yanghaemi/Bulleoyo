package com.ssafy.b204;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.support.IntegrationTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * <b>개발 환경 안내 v1 §3.1의 요구사항을 테스트로 고정한다.</b>
 *
 * <blockquote>체인 변수(OPERATOR·MINTER 키, 컨트랙트 주소)가 비어 있어도 기동돼야 한다.
 * 빈 값이면 체인 빈을 비활성 또는 지연 초기화. <b>키 없는 팀원이 API 개발을 해야 한다.</b>
 * </blockquote>
 *
 * <p>{@code application-test.yml}이 체인 변수를 일부러 비워 두므로, 이 클래스가 뜨는 것 자체가
 * 그 요구사항의 증거다. 누군가 체인 빈을 필수로 만들면 <b>이 테스트가 먼저 깨진다</b> —
 * 다른 팀원의 로컬 개발이 막히기 전에 CI에서 잡힌다.
 */
class ChainConfigurationTest extends IntegrationTestBase {

    @Autowired
    private ChainProperties chainProperties;

    @Test
    @DisplayName("체인 키·컨트랙트 주소가 비어 있어도 애플리케이션 컨텍스트가 뜬다")
    void contextLoadsWithoutChainConfiguration() {
        // 여기까지 왔다는 것이 곧 기동 성공이다.
        assertThat(chainProperties).isNotNull();
    }

    @Test
    @DisplayName("설정이 비면 isConfigured() 가 false 다 — 체인 경로만 막고 기동은 막지 않는다")
    void isConfiguredIsFalseWhenEmpty() {
        assertThat(chainProperties.isConfigured()).isFalse();
        assertThat(chainProperties.isReadOnlyConfigured()).isFalse();
    }

    @Test
    @DisplayName("체인 설정과 무관한 값(익스플로러·네트워크 이름)은 항상 쓸 수 있다")
    void staticChainMetadataIsAlwaysAvailable() {
        assertThat(chainProperties.networkName()).isEqualTo("kaia-kairos");
        assertThat(chainProperties.explorerBaseUrl()).isEqualTo("https://kairos.kaiascan.io");
        assertThat(chainProperties.chainId()).isEqualTo(1001L);
        assertThat(chainProperties.chainIdHex()).isEqualTo("0x3e9");
    }
}
