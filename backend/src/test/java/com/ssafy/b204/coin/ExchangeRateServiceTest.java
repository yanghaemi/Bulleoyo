package com.ssafy.b204.coin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.ssafy.b204.coin.dto.CoinDtos.RateInput;
import com.ssafy.b204.coin.dto.CoinDtos.RatesResponse;
import com.ssafy.b204.coin.dto.CoinDtos.RegisterRatesRequest;
import com.ssafy.b204.coin.entity.ExchangeRate;
import com.ssafy.b204.coin.repository.ExchangeRateRepository;
import com.ssafy.b204.coin.service.ExchangeRateService;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 표시 환율(API-coin-02·03) — <b>표시 전용</b>이라는 규칙이 코드에서 지켜지는지.
 *
 * <p>등록이 append-only이고 과거 시각을 거부하는 것이 핵심이다. 소급 등록을 허용하면 이미 보여준
 * 표시값이 사후에 달라진다.
 */
class ExchangeRateServiceTest {

    private static final MemberPrincipal ADMIN = MemberPrincipal.of(1L, "admin@b204.test", true);

    private ExchangeRateRepository exchangeRateRepository;
    private MemberRepository memberRepository;
    private ExchangeRateService service;

    @BeforeEach
    void setUp() {
        exchangeRateRepository = mock(ExchangeRateRepository.class);
        memberRepository = mock(MemberRepository.class);
        service = new ExchangeRateService(exchangeRateRepository, memberRepository);
        when(memberRepository.findById(1L)).thenReturn(Optional.of(member()));
    }

    @Test
    @DisplayName("통화쌍별로 현재 적용중인 최신 1건만 준다")
    void keepsLatestRatePerPair() {
        when(exchangeRateRepository.findByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
                .thenReturn(List.of(
                        rate("USD_KRW", "1350.0", LocalDateTime.now().minusHours(1)),
                        rate("USD_KRW", "1300.0", LocalDateTime.now().minusDays(1)),
                        rate("JPY_KRW", "9.12", LocalDateTime.now().minusDays(1))));

        RatesResponse response = service.rates(null);

        assertThat(response.rates()).hasSize(2);
        assertThat(response.rates().get(0).pair()).isEqualTo("USD_KRW");
        assertThat(response.rates().get(0).rate()).isEqualByComparingTo("1350.0");
        assertThat(response.rates().get(0).base()).isEqualTo("USD");
        assertThat(response.rates().get(0).quote()).isEqualTo("KRW");
        assertThat(response.usageNotice()).contains("display only");
    }

    @Test
    @DisplayName("등록된 환율이 없으면 빈 배열 — 404가 아니다")
    void emptyIsNotAnError() {
        when(exchangeRateRepository.findByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
                .thenReturn(List.of());

        assertThat(service.rates(null).rates()).isEmpty();
    }

    @Test
    @DisplayName("pair 형식 위반은 COMMON_VALIDATION_FAILED")
    void rejectsMalformedPair() {
        assertThatThrownBy(() -> service.rates("USDKRW"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
    }

    @Test
    @DisplayName("과거 시각 적용은 거부한다 — 이미 보여준 표시값을 소급 변경하기 때문")
    void rejectsPastEffectiveFrom() {
        RegisterRatesRequest request = new RegisterRatesRequest(List.of(
                new RateInput("USD_KRW", new BigDecimal("1350.0"),
                        OffsetDateTime.now().minusDays(1), "MANUAL")));

        assertThatThrownBy(() -> service.registerRates(ADMIN, request))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
    }

    @Test
    @DisplayName("한 요청에 같은 통화쌍이 두 번 오면 전량 거부한다")
    void rejectsDuplicatePairInOneRequest() {
        RegisterRatesRequest request = new RegisterRatesRequest(List.of(
                new RateInput("USD_KRW", new BigDecimal("1350.0"), null, "MANUAL"),
                new RateInput("usd_krw", new BigDecimal("1360.0"), null, "MANUAL")));

        assertThatThrownBy(() -> service.registerRates(ADMIN, request))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
    }

    @Test
    @DisplayName("0 이하 환율은 거부한다")
    void rejectsNonPositiveRate() {
        RegisterRatesRequest request = new RegisterRatesRequest(List.of(
                new RateInput("USD_KRW", BigDecimal.ZERO, null, "MANUAL")));

        assertThatThrownBy(() -> service.registerRates(ADMIN, request))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("표시 통화가 KRW인 회원에게는 display를 내리지 않는다")
    void skipsDisplayForKrwMember() {
        Member krwMember = Member.builder().email("krw@b204.test").name("krw")
                .authProvider(Member.AuthProvider.GOOGLE).countryCode("KR")
                .displayCurrency("KRW").build();
        when(memberRepository.findById(9L)).thenReturn(Optional.of(krwMember));

        assertThat(service.displayFor(9L, 10_000L)).isNull();
        assertThat(service.rateFor(9L)).isNull();
    }

    @Test
    @DisplayName("비로그인(memberId null)이면 display가 없다")
    void noDisplayForGuest() {
        assertThat(service.displayFor(null, 10_000L)).isNull();
    }

    private static Member member() {
        return Member.builder().email("admin@b204.test").name("admin")
                .authProvider(Member.AuthProvider.GOOGLE).countryCode("KR")
                .displayCurrency("USD").admin(true).build();
    }

    private static ExchangeRate rate(String pair, String value, LocalDateTime effectiveFrom) {
        return ExchangeRate.builder().pair(pair).rate(new BigDecimal(value))
                .effectiveFrom(effectiveFrom).creator(member()).source("MANUAL").build();
    }
}
