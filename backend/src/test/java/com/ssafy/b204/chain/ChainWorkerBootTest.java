package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThatCode;

import com.ssafy.b204.chain.worker.ChainJobWorker;
import com.ssafy.b204.support.IntegrationTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

/**
 * <b>워커가 켜진 채로도 키 없이 기동된다.</b>
 *
 * <p>{@code application-test.yml}은 워커를 끈다(스케줄러가 테스트끼리 간섭한다). 그런데 운영·로컬
 * 기본값은 {@code enabled=true}이므로, 그대로 두면 <b>실제로 뜨는 구성이 어느 테스트에서도 검증되지
 * 않는다.</b> 누가 워커에 {@code Web3j}를 필수 주입하는 순간 키 없는 팀원의 로컬 기동이 막히는데
 * {@code ChainConfigurationTest}는 워커를 안 만들어서 그것을 놓친다.
 *
 * <p>그래서 이 클래스만 워커를 켜고, 한 주기를 손으로 돌려 <b>체인 빈 없이도 조용히 지나가는지</b>
 * 확인한다.
 */
@TestPropertySource(properties = "b204.chain.worker.enabled=true")
class ChainWorkerBootTest extends IntegrationTestBase {

    @Autowired
    private ChainJobWorker worker;

    @Test
    @DisplayName("체인 변수가 비어도 워커 빈이 뜨고 한 주기가 아무 일 없이 지나간다")
    void workerRunsWithoutChainBeans() {
        assertThatCode(() -> {
            worker.dispatchPendingOperatorJobs();
            worker.pollSubmittedJobs();
            worker.refreshMetrics();
        }).doesNotThrowAnyException();
    }
}
