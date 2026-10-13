package com.ssafy.b204.coin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinRequest;
import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinResponse;
import com.ssafy.b204.coin.dto.CoinDtos.GrantHistoryResponse;
import com.ssafy.b204.coin.dto.CoinDtos.RateInput;
import com.ssafy.b204.coin.dto.CoinDtos.RegisterRatesRequest;
import com.ssafy.b204.coin.dto.CoinDtos.RegisterRatesResponse;
import com.ssafy.b204.coin.dto.CoinDtos.SupplyResponse;
import com.ssafy.b204.coin.repository.CoinPerformanceRepository;
import com.ssafy.b204.coin.repository.CoinWalletRepository;
import com.ssafy.b204.coin.service.CoinGrantService;
import com.ssafy.b204.coin.service.CoinService;
import com.ssafy.b204.coin.service.SupplyReconciler;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * coin API 통합 — MySQL·Redis 컨테이너 위에서 Flyway V1 스키마로 돈다(H2 아님).
 *
 * <p>테스트 프로파일은 <b>체인 변수를 비워 둔다</b>. 그래서 이 테스트는 "키 없는 팀원의 로컬"과
 * 같은 상태이고, 공시가 그 상태에서도 200으로 답하는지를 함께 확인한다.
 */
@Transactional
class CoinApiIntegrationTest extends IntegrationTestBase {

    @Autowired
    private CoinService coinService;
    @Autowired
    private CoinGrantService coinGrantService;
    @Autowired
    private SupplyReconciler supplyReconciler;
    @Autowired
    private MemberRepository memberRepository;
    @Autowired
    private WalletRepository walletRepository;
    @Autowired
    private ChainJobRepository chainJobRepository;
    @Autowired
    private CoinWalletRepository coinWalletRepository;
    @Autowired
    private CoinPerformanceRepository coinPerformanceRepository;
    @Autowired
    private PerformanceRepository performanceRepository;
    @Autowired
    private TeamRepository teamRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    private MemberPrincipal admin;
    private Member target;
    private Wallet wallet;

    @BeforeEach
    void setUp() {
        supplyReconciler.invalidate();
        Member adminMember = memberRepository.save(member("admin-" + UUID.randomUUID() + "@b204.test",
                "admin", true));
        admin = MemberPrincipal.of(adminMember.getMemberId(), adminMember.getEmail(), true);
        target = memberRepository.save(member("target-" + UUID.randomUUID() + "@b204.test",
                "Alex Kim", false));
        wallet = walletRepository.save(Wallet.builder()
                .member(target)
                .provider(Wallet.Provider.WEB3AUTH)
                .address(randomAddress())
                .status(Wallet.Status.LINKED)
                .build());
    }

    @Test
    @DisplayName("대사 지갑 청크: 실제 DB 에서 LINKED 만, afterId 뒤부터, 청크 크기만큼")
    void walletChunkReadsOnlyLinkedAfterId() {
        Wallet suspended = walletRepository.save(Wallet.builder()
                .member(memberRepository.save(member("s-" + UUID.randomUUID() + "@b204.test", "S", false)))
                .provider(Wallet.Provider.WEB3AUTH)
                .address(randomAddress())
                .status(Wallet.Status.SUSPENDED)
                .build());
        Wallet linked2 = walletRepository.save(Wallet.builder()
                .member(memberRepository.save(member("l-" + UUID.randomUUID() + "@b204.test", "L", false)))
                .provider(Wallet.Provider.WEB3AUTH)
                .address(randomAddress())
                .status(Wallet.Status.LINKED)
                .build());

        // 다른 테스트 클래스가 남긴 지갑이 DB 에 있을 수 있어 전체 개수에는 기대지 않는다 — setUp 의
        // 지갑보다 큰 id 는 이 트랜잭션이 만든 둘(suspended·linked2)뿐이다(테스트 클래스는 직렬).
        List<Object[]> after = coinWalletRepository.findChunkAfter(Wallet.Status.LINKED,
                wallet.getWalletId(), PageRequest.of(0, 100));
        assertThat(after.stream().map(r -> (Long) r[0]).toList())
                .as("afterId 는 제외, SUSPENDED 는 제외")
                .containsExactly(linked2.getWalletId());
        assertThat((String) after.get(0)[1]).isEqualTo(linked2.getAddress());

        List<Object[]> chunk = coinWalletRepository.findChunkAfter(Wallet.Status.LINKED,
                wallet.getWalletId() - 1, PageRequest.of(0, 1));
        assertThat(chunk).as("청크 크기만큼, PK 오름차순").hasSize(1);
        assertThat((Long) chunk.get(0)[0]).isEqualTo(wallet.getWalletId());
    }

    @Test
    @DisplayName("API-coin-01 — 체인 키가 없어도 200으로 응답하고 stale로 알린다")
    void supplyRespondsWithoutChain() {
        SupplyResponse response = coinService.supply();

        assertThat(response.stale()).isTrue();
        assertThat(response.supplyMatched()).isTrue();
        assertThat(response.mintHalted()).isFalse();
        assertThat(response.releaseHalted()).isFalse();
        assertThat(response.currency()).isEqualTo("KRW");
        // 코인 rename(S15P21B204-41)에서 이 값만 유지했다 — API v6 예시와 프론트 openapi.ts의
        // 리터럴 타입이 아직 "YoYo"다. 명세 개정 + 프론트 타입 재생성 커밋에서 "YoYo"로 함께 바꾼다.
        assertThat(response.tokenSymbol()).isEqualTo("YoYo");
        assertThat(response.tokenDecimals()).isZero();
        assertThat(response.network()).isEqualTo("kaia-kairos");
        assertThat(response.chainId()).isEqualTo(1001L);
        assertThat(response.issuer().type()).isEqualTo("MOCK");
        assertThat(response.issuer().replaceable()).isTrue();
        assertThat(response.invariants()).hasSize(4);
        assertThat(response.invariants()).extracting("no").containsExactly(1, 2, 3, 4);
        assertThat(response.asOf()).isNotNull();
        assertThat(response.nextRefreshAt()).isAfter(response.asOf());
        assertThat(response.disclosure()).isNotBlank();
        assertThat(response.grantNotice()).isNotBlank();
        // 키가 없으면 주소도 링크도 없다 — 빈 문자열을 내려보내지 않는다.
        assertThat(response.tokenAddress()).isNull();
        assertThat(response.explorerUrl()).isNull();
    }

    @Test
    @DisplayName("API-coin-07 — 지급은 MINT chain_job 한 건이 되고 같은 멱등키는 재생된다")
    void grantCreatesSingleMintJob() {
        String key = UUID.randomUUID().toString();
        GrantCoinResponse first = coinGrantService.grantCoin(admin,
                new GrantCoinRequest(target.getMemberId(), null, 200_000L, "demo"), key);

        assertThat(first.status()).isEqualTo("PENDING");
        assertThat(first.jobId()).startsWith("chain_");
        assertThat(first.address()).isEqualTo(wallet.getAddress());
        assertThat(first.grantRef()).matches("^0x[0-9a-f]{64}$");

        ChainJob saved = chainJobRepository.findByIdempotencyKey(key).orElseThrow();
        assertThat(saved.getTxType()).isEqualTo(ChainJob.TxType.MINT);
        assertThat(saved.getSignerType()).isEqualTo(ChainJob.SignerType.OPERATOR);
        assertThat(saved.getIssuerType()).isEqualTo(ChainJob.IssuerType.MOCK);
        assertThat(saved.getStatus()).isEqualTo(ChainJob.Status.PENDING);
        assertThat(saved.getAmount()).isEqualTo(200_000L);
        assertThat(saved.getWalletId()).isEqualTo(wallet.getWalletId());
        assertThat(saved.isFeeDelegated()).isFalse();

        GrantCoinResponse replay = coinGrantService.grantCoin(admin,
                new GrantCoinRequest(target.getMemberId(), null, 200_000L, "demo"), key);
        assertThat(replay.jobId()).isEqualTo(first.jobId());
    }

    @Test
    @DisplayName("API-coin-08 — 지급 이력은 chain_job(MINT)에서 나오고 확정 전에는 합계가 0이다")
    void grantHistoryReadsFromChainJob() {
        String key = UUID.randomUUID().toString();
        coinGrantService.grantCoin(admin,
                new GrantCoinRequest(target.getMemberId(), null, 150_000L, "demo"), key);

        GrantHistoryResponse history = coinGrantService.grantHistory(admin, "ADMIN", null,
                target.getMemberId(), null, PageRequest.of(0, 20));

        assertThat(history.items()).hasSize(1);
        assertThat(history.items().get(0).source()).isEqualTo("ADMIN");
        assertThat(history.items().get(0).status()).isEqualTo("PENDING");
        assertThat(history.items().get(0).amount()).isEqualTo(150_000L);
        assertThat(history.items().get(0).address()).isEqualTo(wallet.getAddress());
        assertThat(history.items().get(0).memberId()).isEqualTo(target.getMemberId());
        assertThat(history.items().get(0).requesterId()).isEqualTo(admin.memberId());
        assertThat(history.pageInfo().page()).isZero();
        // summary는 CONFIRMED만 센다 — 불변식 1(totalSupply = grantedTotal)과 대조하기 위해서다.
        assertThat(history.summary().grantedTotal()).isZero();
        assertThat(history.summary().currency()).isEqualTo("KRW");
    }

    @Test
    @DisplayName("API-coin-08 — 허용되지 않는 source는 400")
    void grantHistoryRejectsUnknownSource() {
        assertThatThrownBy(() -> coinGrantService.grantHistory(admin, "EVERYONE", null, null, null,
                PageRequest.of(0, 20)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
    }

    @Test
    @DisplayName("API-coin-02·03 — 등록한 표시 환율이 조회에 그대로 나온다")
    void registerAndReadRates() {
        RegisterRatesResponse registered = coinService.registerRates(admin,
                new RegisterRatesRequest(List.of(
                        new RateInput("USD_KRW", new BigDecimal("1350.000000"), null, "MANUAL"))));

        assertThat(registered.registered()).hasSize(1);
        assertThat(registered.registered().get(0).rateId()).isNotNull();
        assertThat(registered.publishedBy()).isEqualTo(admin.memberId());
        assertThat(registered.cacheInvalidated()).isTrue();

        assertThat(coinService.rates("USD_KRW").rates())
                .extracting("pair").contains("USD_KRW");
    }

    /**
     * D-71 — 대사 스캔은 공연 상태로 거르지 않는다. 보증금은 {@code createShow} 직후, 공연이 아직
     * {@code DRAFT}·{@code PENDING_AGREEMENT}일 때 온체인에 들어간다. 판단은 JPQL 안에 있으므로
     * 실제 DB 로 확인해야 한다 — 단위 테스트의 목은 이 조건을 재현하지 못한다.
     */
    @Test
    @DisplayName("대사 공연 목록: on_chain_id가 있으면 DRAFT·PENDING_AGREEMENT도 스캔 대상이다")
    void onChainShowScanIgnoresPerformanceStatus() {
        Member leader = memberRepository.save(
                member("leader-" + UUID.randomUUID() + "@b204.test", "리더", false));
        Team team = teamRepository.save(Team.builder().name("팀-" + UUID.randomUUID()).leader(leader).build());
        Long pending = onChainPerformance(team, "PENDING_AGREEMENT");
        Long draft = onChainPerformance(team, "DRAFT");
        Long offChain = performanceRepository.save(performance(team)).getPerformanceId();

        List<Long> scanned = coinPerformanceRepository.findOnChainShows().stream()
                .map(row -> ((Number) row[0]).longValue())
                .toList();

        assertThat(scanned).as("판매 전이어도 온체인 장부가 있으면 읽는다").contains(pending, draft);
        assertThat(scanned).as("createShow 전 공연은 읽을 것이 없다").doesNotContain(offChain);
    }

    /** {@code on_chain_id}는 {@code CREATE_SHOW} 확정에서만 채워지므로 SQL 로 심는다(픽스처 관례). */
    private Long onChainPerformance(Team team, String status) {
        Long id = performanceRepository.save(performance(team)).getPerformanceId();
        jdbcTemplate.update(
                "UPDATE performance SET status = ?, on_chain_id = ? WHERE performance_id = ?",
                status, id, id);
        return id;
    }

    private static Performance performance(Team team) {
        return Performance.builder()
                .title("공시 대사 대상 " + UUID.randomUUID())
                .performanceAt(LocalDateTime.now().plusDays(10))
                .creatorTeam(team)
                .joint(false)
                .saleCloseAt(LocalDateTime.now().plusDays(9))
                .cancelDeadlineAt(LocalDateTime.now().plusDays(7))
                .depositAmount(50_000L)
                .build();
    }

    private static Member member(String email, String name, boolean admin) {
        return Member.builder()
                .email(email)
                .name(name)
                .authProvider(Member.AuthProvider.GOOGLE)
                .providerUserId(UUID.randomUUID().toString())
                .countryCode("KR")
                .admin(admin)
                .build();
    }

    /** 지갑 주소는 UNIQUE라 테스트마다 다른 값을 쓴다. */
    private static String randomAddress() {
        return "0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }
}
