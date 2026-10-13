package com.ssafy.b204.coin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.ChainJobService;
import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinRequest;
import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinResponse;
import com.ssafy.b204.coin.repository.CoinChainJobRepository;
import com.ssafy.b204.coin.service.CoinGrantService;
import com.ssafy.b204.coin.service.ExchangeRateService;
import com.ssafy.b204.coin.service.SupplyReconciler;
import com.ssafy.b204.coin.service.WalletBalanceReader;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 시연용 코인 지급(API-coin-07)의 게이트 — <b>순서와 코드</b>가 계약이다.
 *
 * <p>같은 멱등키로 두 번 불러도 {@code chain_job}이 하나여야 한다. 여기가 뚫리면 워커가 두 번
 * 전송하고, 온체인 {@code usedGrantRef} 방어까지 함께 뚫리면 이중 발행이 된다.
 */
class CoinGrantServiceTest {

    private static final MemberPrincipal ADMIN = MemberPrincipal.of(1L, "admin@b204.test", true);
    private static final MemberPrincipal USER = MemberPrincipal.of(2L, "user@b204.test", false);
    private static final String KEY = "11111111-2222-3333-4444-555555555555";
    private static final String ADDRESS = "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a";

    private ChainJobRepository chainJobRepository;
    private CoinChainJobRepository coinChainJobRepository;
    private WalletRepository walletRepository;
    private MemberRepository memberRepository;
    private WalletBalanceReader walletBalanceReader;
    private SupplyReconciler supplyReconciler;
    private CoinGrantService service;

    @BeforeEach
    void setUp() {
        chainJobRepository = mock(ChainJobRepository.class);
        coinChainJobRepository = mock(CoinChainJobRepository.class);
        walletRepository = mock(WalletRepository.class);
        memberRepository = mock(MemberRepository.class);
        walletBalanceReader = mock(WalletBalanceReader.class);
        supplyReconciler = mock(SupplyReconciler.class);
        ExchangeRateService exchangeRateService = mock(ExchangeRateService.class);
        ChainJobService chainJobService = mock(ChainJobService.class);

        service = new CoinGrantService(chainJobRepository, coinChainJobRepository, walletRepository,
                memberRepository, walletBalanceReader, supplyReconciler, exchangeRateService,
                chainJobService);

        when(memberRepository.existsById(anyLong())).thenReturn(true);
        when(memberRepository.findById(1L)).thenReturn(Optional.of(admin()));
        when(walletRepository.findByMember_MemberId(1024L)).thenReturn(Optional.of(wallet()));
        when(walletRepository.findByAddress(ADDRESS)).thenReturn(Optional.of(wallet()));
        when(coinChainJobRepository.findByIdempotencyKey(any())).thenReturn(Optional.empty());
        when(supplyReconciler.mintHalted()).thenReturn(false);
        when(chainJobRepository.save(any())).thenAnswer(invocation -> {
            ChainJob job = invocation.getArgument(0);
            ReflectionTestUtils.setField(job, "chainJobId", 42L);
            return job;
        });
    }

    @Test
    @DisplayName("ADMIN이 아니면 COMMON_FORBIDDEN")
    void rejectsNonAdmin() {
        assertCode(() -> service.grantCoin(USER, request(1024L, null, 1000L), KEY),
                ErrorCode.COMMON_FORBIDDEN);
    }

    @Test
    @DisplayName("Idempotency-Key가 없으면 400 — 헤더가 곧 grantRef다")
    void requiresIdempotencyKey() {
        assertCode(() -> service.grantCoin(ADMIN, request(1024L, null, 1000L), null),
                ErrorCode.COMMON_VALIDATION_FAILED);
    }

    @Test
    @DisplayName("memberId와 address를 함께 주면 400(택일)")
    void rejectsBothTargets() {
        assertCode(() -> service.grantCoin(ADMIN, request(1024L, ADDRESS, 1000L), KEY),
                ErrorCode.COMMON_VALIDATION_FAILED);
    }

    @Test
    @DisplayName("대상 지갑이 없으면 WALLET_NOT_FOUND(404)")
    void rejectsMissingWallet() {
        when(walletRepository.findByMember_MemberId(1024L)).thenReturn(Optional.empty());

        assertCode(() -> service.grantCoin(ADMIN, request(1024L, null, 1000L), KEY),
                ErrorCode.WALLET_NOT_FOUND);
    }

    @Test
    @DisplayName("1회 지급 한도 1,000,000 초과는 400")
    void rejectsAmountOverLimit() {
        assertCode(() -> service.grantCoin(ADMIN, request(1024L, null, 1_000_001L), KEY),
                ErrorCode.COMMON_VALIDATION_FAILED);
    }

    @Test
    @DisplayName("0 이하 금액은 400")
    void rejectsNonPositiveAmount() {
        assertCode(() -> service.grantCoin(ADMIN, request(1024L, null, 0L), KEY),
                ErrorCode.COMMON_VALIDATION_FAILED);
    }

    @Test
    @DisplayName("발행량 대사가 깨진 상태에서는 COIN_RESERVE_MISMATCH(409)")
    void rejectsWhenMintHalted() {
        when(supplyReconciler.mintHalted()).thenReturn(true);

        assertCode(() -> service.grantCoin(ADMIN, request(1024L, null, 1000L), KEY),
                ErrorCode.COIN_RESERVE_MISMATCH);
        verify(chainJobRepository, never()).save(any());
    }

    @Test
    @DisplayName("정지된 지갑에는 지급하지 않는다(409)")
    void rejectsSuspendedWallet() {
        Wallet suspended = Wallet.builder().member(target()).provider(Wallet.Provider.WEB3AUTH)
                .address(ADDRESS).status(Wallet.Status.SUSPENDED).build();
        ReflectionTestUtils.setField(suspended, "walletId", 7L);
        when(walletRepository.findByMember_MemberId(1024L)).thenReturn(Optional.of(suspended));

        assertCode(() -> service.grantCoin(ADMIN, request(1024L, null, 1000L), KEY),
                ErrorCode.COMMON_CONFLICT);
    }

    @Test
    @DisplayName("정상 요청은 MINT job 하나를 만들고 202 본문을 돌려준다")
    void enqueuesMintJob() {
        when(walletBalanceReader.cachedBalance(7L)).thenReturn(100_000L);

        GrantCoinResponse response = service.grantCoin(ADMIN, request(1024L, null, 200_000L), KEY);

        assertThat(response.jobId()).isEqualTo("chain_42");
        assertThat(response.status()).isEqualTo("PENDING");
        assertThat(response.signerType()).isEqualTo("OPERATOR");
        assertThat(response.amount()).isEqualTo(200_000L);
        assertThat(response.currency()).isEqualTo("KRW");
        assertThat(response.address()).isEqualTo(ADDRESS);
        assertThat(response.balanceBefore()).isEqualTo(100_000L);
        assertThat(response.expectedBalanceAfter()).isEqualTo(300_000L);
        // grantRef = keccak256(멱등키) — 온체인 usedGrantRef와 이어지는 값이다.
        assertThat(response.grantRef()).matches("^0x[0-9a-f]{64}$");
        verify(chainJobRepository, times(1)).save(any());
    }

    @Test
    @DisplayName("같은 멱등키 재호출은 새 job을 만들지 않고 최초 jobId를 재생한다")
    void replaysOnSameIdempotencyKey() {
        ChainJob existing = ChainJob.builder().txType(ChainJob.TxType.MINT)
                .signerType(ChainJob.SignerType.OPERATOR).walletId(7L).amount(200_000L)
                .idempotencyKey(KEY).build();
        ReflectionTestUtils.setField(existing, "chainJobId", 42L);
        when(coinChainJobRepository.findByIdempotencyKey(KEY)).thenReturn(Optional.of(existing));

        GrantCoinResponse response = service.grantCoin(ADMIN, request(1024L, null, 200_000L), KEY);

        assertThat(response.jobId()).isEqualTo("chain_42");
        verify(chainJobRepository, never()).save(any());
    }

    @Test
    @DisplayName("같은 멱등키에 다른 금액이 오면 COMMON_CONFLICT — 조용히 다시 찍지 않는다")
    void rejectsSameKeyWithDifferentBody() {
        ChainJob existing = ChainJob.builder().txType(ChainJob.TxType.MINT)
                .signerType(ChainJob.SignerType.OPERATOR).walletId(7L).amount(200_000L)
                .idempotencyKey(KEY).build();
        ReflectionTestUtils.setField(existing, "chainJobId", 42L);
        when(coinChainJobRepository.findByIdempotencyKey(KEY)).thenReturn(Optional.of(existing));

        assertCode(() -> service.grantCoin(ADMIN, request(1024L, null, 999L), KEY),
                ErrorCode.COMMON_CONFLICT);
        verify(chainJobRepository, never()).save(any());
    }

    @Test
    @DisplayName("주소 형식이 틀리면 400")
    void rejectsMalformedAddress() {
        assertCode(() -> service.grantCoin(ADMIN, request(null, "0xnope", 1000L), KEY),
                ErrorCode.COMMON_VALIDATION_FAILED);
    }

    private static void assertCode(Runnable call, ErrorCode expected) {
        assertThatThrownBy(call::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(expected);
    }

    private static GrantCoinRequest request(Long memberId, String address, Long amount) {
        return new GrantCoinRequest(memberId, address, amount, "demo");
    }

    private static Wallet wallet() {
        Wallet wallet = Wallet.builder().member(target()).provider(Wallet.Provider.WEB3AUTH)
                .address(ADDRESS).status(Wallet.Status.LINKED).build();
        ReflectionTestUtils.setField(wallet, "walletId", 7L);
        return wallet;
    }

    private static Member target() {
        Member member = Member.builder().email("target@b204.test").name("Alex Kim")
                .authProvider(Member.AuthProvider.GOOGLE).countryCode("KR").build();
        ReflectionTestUtils.setField(member, "memberId", 1024L);
        return member;
    }

    private static Member admin() {
        Member member = Member.builder().email("admin@b204.test").name("admin")
                .authProvider(Member.AuthProvider.GOOGLE).countryCode("KR").admin(true).build();
        ReflectionTestUtils.setField(member, "memberId", 1L);
        return member;
    }
}
