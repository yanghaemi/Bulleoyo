package com.ssafy.b204.verify.config;

import com.ssafy.b204.chain.config.ChainConditions;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.verify.service.ContractVerifyChainReader;
import com.ssafy.b204.verify.service.UnavailableVerifyChainReader;
import com.ssafy.b204.verify.service.VerifyChainReader;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.web3j.protocol.Web3j;

/**
 * verify가 체인에 의존하는 단 한 지점의 배선 — {@code SettlementChainConfig}와 같은 규칙이다.
 *
 * <p><b>체인 변수가 없어도 기동한다</b>(README §9.3 · {@code ChainConfigurationTest}). 주소·RPC가
 * 비면 {@link UnavailableVerifyChainReader}가 들어가고, API-verify-01만 캐시 없을 때 502로 떨어진다.
 * 나머지 API는 영향이 없다.
 *
 * <p>{@code Web3j} 빈은 {@link ChainConditions.ReadOnlyConfigured}일 때만 존재하므로 같은 조건을
 * 그대로 쓴다 — 조건이 갈라지면 "빈은 만들어지는데 주입할 Web3j가 없다"가 된다.
 */
@Configuration
public class VerifyChainConfig {

    @Bean
    @Conditional(ChainConditions.ReadOnlyConfigured.class)
    public VerifyChainReader contractVerifyChainReader(Web3j web3j,
                                                       ChainProperties chainProperties) {
        return new ContractVerifyChainReader(web3j, chainProperties);
    }

    /**
     * {@code @ConditionalOnMissingBean}이 아니라 <b>정반대 조건</b>으로 적는다 — 같은 클래스 안의
     * 빈 등록 순서에 기대면 나중에 빈이 하나 끼어들 때 조용히 뒤집힌다(settlement와 같은 판단).
     */
    @Bean
    @Conditional(ChainConditions.NotReadOnlyConfigured.class)
    public VerifyChainReader unavailableVerifyChainReader() {
        return new UnavailableVerifyChainReader();
    }

    /**
     * 캐시 만료 판정용 시계. {@code VerifyService}가 {@code Instant.now()}를 직접 부르면 60초 TTL을
     * 테스트에서 확인할 방법이 <b>60초를 실제로 기다리는 것뿐</b>이라, 시계만 밖으로 뺀다.
     * 응답 시각({@code refreshedAt})은 KST 표기라 {@code SettlementTime}이 따로 만든다.
     */
    @Bean("verifyClock")
    public Clock verifyClock() {
        return Clock.systemUTC();
    }
}
