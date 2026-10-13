package com.ssafy.b204.support;

import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.FakeSettlementChainReader;
import com.ssafy.b204.settlement.PayoutEventCounter;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.verify.FakeVerifyChainReader;
import com.ssafy.b204.verify.MutableClock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 모든 통합 테스트가 공유하는 테스트 빈 — {@link IntegrationTestBase}가 import 한다.
 *
 * <p>Spring 테스트 컨텍스트는 {@code @TestConfiguration}·bean override·프로퍼티 조합이 <b>완전히
 * 같을 때만</b> 재사용된다. 클래스마다 비슷한 Fake 설정을 따로 두면 그 수만큼 컨텍스트(와 Hikari 풀)가
 * 뜬다(S15P21B204-182 — 실측 23개 → 5개). 그래서 Fake를 여기 한 벌로 모은다.
 *
 * <p>체인 리더 Fake는 {@code @Primary}로 실제 빈({@code Unavailable*}·{@code Contract*})을 덮는다 —
 * 어떤 테스트도 Kaia RPC로 나가지 않는다. 테스트 간 상태는 {@link IntegrationTestBase}의
 * {@code @BeforeEach}가 <b>"체인 미설정"과 같은 상태</b>(available=false)로 되돌리고, Fake를 쓰는
 * 테스트는 자기 {@code @BeforeEach}에서 {@code reset()}으로 켠다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class SharedTestBeans {

    @Bean
    @Primary
    FakeSettlementChainReader fakeSettlementChainReader() {
        return new FakeSettlementChainReader();
    }

    @Bean
    @Primary
    FakeVerifyChainReader fakeVerifyChainReader() {
        return new FakeVerifyChainReader();
    }

    /**
     * {@code VerifyService}가 {@code @Qualifier("verifyClock")}으로 받으므로 이름이 아니라
     * {@code @Qualifier}로 후보에 든다(같은 이름의 빈을 또 만들면 정의 충돌이다). 프로덕션
     * {@code verifyClock}과 둘 다 후보가 되므로 {@code @Primary}로 이쪽을 고른다. 기본은 시스템 시계다.
     */
    @Bean
    @Primary
    @Qualifier("verifyClock")
    MutableClock verifyTestClock() {
        return new MutableClock();
    }

    @Bean
    PayoutEventCounter payoutEventCounter() {
        return new PayoutEventCounter();
    }

    @Bean
    SettlementTestFixture settlementTestFixture(
            MemberRepository memberRepository, TeamRepository teamRepository,
            PerformanceRepository performanceRepository,
            PerformanceParticipantRepository participantRepository,
            TicketTypeRepository ticketTypeRepository,
            TicketOrderRepository ticketOrderRepository, TicketRepository ticketRepository,
            SettlementRuleRepository settlementRuleRepository, JdbcTemplate jdbcTemplate) {
        return new SettlementTestFixture(memberRepository, teamRepository, performanceRepository,
                participantRepository, ticketTypeRepository, ticketOrderRepository,
                ticketRepository, settlementRuleRepository, jdbcTemplate);
    }
}
