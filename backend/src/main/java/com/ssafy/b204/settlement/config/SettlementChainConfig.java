package com.ssafy.b204.settlement.config;

import com.ssafy.b204.chain.config.ChainConditions;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.settlement.service.AllowReleaseHaltGuard;
import com.ssafy.b204.settlement.service.ContractSettlementChainReader;
import com.ssafy.b204.settlement.service.ReleaseHaltGuard;
import com.ssafy.b204.settlement.service.SettlementChainReader;
import com.ssafy.b204.settlement.service.UnavailableSettlementChainReader;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.web3j.protocol.Web3j;

/**
 * settlement가 체인·coin에 의존하는 두 지점의 배선.
 *
 * <p><b>둘 다 "없어도 기동한다"가 요건이다</b>(README §9.3). 체인 주소·RPC가 비면
 * {@link UnavailableSettlementChainReader}가 들어가 조회는 되고 대사가 필요한 게이트만 막힌다.
 * {@code Web3j} 빈은 {@link ChainConditions.ReadOnlyConfigured}일 때만 존재하므로
 * ({@code chain/config/ChainClientConfig}) 같은 조건을 그대로 쓴다 — 조건이 갈라지면
 * "빈은 만들어지는데 주입할 Web3j가 없다"가 된다.
 */
@Configuration
public class SettlementChainConfig {

    @Bean
    @Conditional(ChainConditions.ReadOnlyConfigured.class)
    public SettlementChainReader contractSettlementChainReader(Web3j web3j,
                                                               ChainProperties chainProperties) {
        return new ContractSettlementChainReader(web3j, chainProperties);
    }

    /**
     * 조건을 {@code @ConditionalOnMissingBean}이 아니라 <b>정반대 조건</b>으로 적는다 —
     * 같은 클래스 안의 빈 등록 순서에 기대면 나중에 빈이 하나 끼어들 때 조용히 뒤집힌다.
     */
    @Bean
    @Conditional(NotReadOnlyConfigured.class)
    public SettlementChainReader unavailableSettlementChainReader() {
        return new UnavailableSettlementChainReader();
    }

    /** {@link ChainConditions.ReadOnlyConfigured}의 부정. */
    public static class NotReadOnlyConfigured extends ChainConditions.ReadOnlyConfigured {
        @Override
        public boolean matches(org.springframework.context.annotation.ConditionContext context,
                               org.springframework.core.type.AnnotatedTypeMetadata metadata) {
            return !super.matches(context, metadata);
        }
    }

    /** coin의 {@code SupplyReconciler}가 합류하면 그쪽 빈이 우선한다. */
    @Bean
    @ConditionalOnMissingBean(ReleaseHaltGuard.class)
    public ReleaseHaltGuard allowReleaseHaltGuard() {
        return new AllowReleaseHaltGuard();
    }
}
