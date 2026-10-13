package com.ssafy.b204.coin.service;

import com.ssafy.b204.coin.dto.CoinDtos.RateInput;
import com.ssafy.b204.coin.dto.CoinDtos.RateItem;
import com.ssafy.b204.coin.dto.CoinDtos.RatesResponse;
import com.ssafy.b204.coin.dto.CoinDtos.RegisterRatesRequest;
import com.ssafy.b204.coin.dto.CoinDtos.RegisterRatesResponse;
import com.ssafy.b204.coin.dto.CoinDtos.RegisteredRate;
import com.ssafy.b204.coin.entity.ExchangeRate;
import com.ssafy.b204.coin.repository.ExchangeRateRepository;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.common.support.TimeSupport;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 표시 환율 — API-coin-02(조회) · API-coin-03(등록) + 응답 {@code display} 조립.
 *
 * <p><b>표시에만 쓴다</b>(P-17). 정산·분배·컨트랙트 인자·티켓 가격·지급 금액에 절대 들어가지
 * 않는다. 그래서 이 서비스가 내놓는 값은 {@code Money.Display}·{@code Money.Rate}뿐이고
 * 금액 계산 API에 {@code BigDecimal}을 넘기는 메서드가 없다. 환율이 계산에 섞이면 환율이 바뀔
 * 때마다 이미 확정된 분배액이 달라지고 컨트랙트의 결정론적 재현이 깨진다.
 *
 * <p><b>등록은 append-only</b>다(API-coin-03). 기존 행을 수정하지 않고 새 {@code exchange_rate}
 * 행을 만든다 — 과거 화면이 어떤 환율로 표시됐는지가 남아야 한다. 과거 시각 적용을 거부하는 것도
 * 같은 이유다(이미 보여준 표시값을 소급해 바꾸게 된다).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExchangeRateService {

    /** {@code ^[A-Z]{3}_KRW$} — quote는 KRW 하나다(openapi {@code ExchangeRateRegisterItem}). */
    private static final Pattern PAIR = Pattern.compile("^[A-Z]{3}_KRW$");

    private static final int MAX_RATES_PER_REQUEST = 10;

    /**
     * API v6 §0.6 기본 언어가 en이라 영문을 기본으로 둔다. {@code Accept-Language} 분기는
     * {@code messages_*.properties}가 생기면 {@code MessageSource}로 옮긴다(현재 번들 없음).
     */
    private static final String USAGE_NOTICE_EN =
            "Rates are for display only. All payments, refunds and settlements are calculated in Korean won.";

    private static final String USAGE_NOTICE_KO =
            "표시 환산에만 사용됩니다. 정산·분배·티켓 가격·지급 금액은 YoYo(=₩) 정수로 계산됩니다.";

    private final ExchangeRateRepository exchangeRateRepository;
    private final MemberRepository memberRepository;

    // ------------------------------------------------------------ API-coin-02

    /**
     * 현재 유효한 표시 환율. <b>미등록은 오류가 아니다</b> — 빈 배열 200이다(404가 아니다).
     *
     * @param pair {@code USD_KRW} 같은 통화쌍. {@code null}이면 전체
     */
    public RatesResponse rates(String pair) {
        String normalized = normalizePair(pair);
        List<RateItem> items = currentRates().values().stream()
                .filter(rate -> normalized == null || rate.getPair().equals(normalized))
                .map(ExchangeRateService::toItem)
                .toList();
        return new RatesResponse(items, USAGE_NOTICE_EN, CoinTime.now());
    }

    // ------------------------------------------------------------ API-coin-03

    /**
     * 표시 환율 등록. 부분 실패 없이 전량 롤백한다 — 두 통화쌍 중 하나만 반영되면 화면이 서로 다른
     * 시점의 환율을 섞어 보여준다.
     */
    @Transactional
    public RegisterRatesResponse registerRates(MemberPrincipal me, RegisterRatesRequest request) {
        if (me == null) {
            throw ErrorCode.COMMON_UNAUTHORIZED.toException();
        }
        List<RateInput> inputs = request.rates();
        if (inputs.size() > MAX_RATES_PER_REQUEST) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "한 번에 등록할 수 있는 통화쌍은 최대 " + MAX_RATES_PER_REQUEST + "개입니다.");
        }
        Member creator = memberRepository.findById(me.memberId())
                .orElseThrow(ErrorCode.COMMON_NOT_FOUND::toException);

        LocalDateTime now = TimeSupport.nowStored();
        Set<String> seen = new HashSet<>();
        List<ExchangeRate> toSave = new ArrayList<>(inputs.size());
        for (RateInput input : inputs) {
            String pair = normalizePair(input.pair());
            if (pair == null) {
                throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                        "통화쌍 형식이 올바르지 않습니다. 예: USD_KRW");
            }
            if (!seen.add(pair)) {
                throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                        "같은 통화쌍이 두 번 들어 있습니다: " + pair);
            }
            if (input.rate() == null || input.rate().signum() <= 0) {
                throw ErrorCode.COMMON_VALIDATION_FAILED.toException("환율은 0보다 커야 합니다.");
            }
            LocalDateTime effectiveFrom = input.effectiveFrom() == null
                    ? now
                    : input.effectiveFrom().atZoneSameInstant(CoinTime.ZONE).toLocalDateTime();
            if (effectiveFrom.isBefore(now)) {
                // 과거 시각은 이미 보여준 표시값을 소급 변경한다.
                throw ErrorCode.COMMON_VALIDATION_FAILED.toException("적용 시각은 현재 이후여야 합니다.");
            }
            toSave.add(ExchangeRate.builder()
                    .pair(pair)
                    .rate(input.rate())
                    .effectiveFrom(effectiveFrom)
                    .creator(creator)
                    .source(input.source())
                    .build());
        }

        List<RegisteredRate> registered = exchangeRateRepository.saveAll(toSave).stream()
                .map(saved -> new RegisteredRate(saved.getExchangeRateId(), saved.getPair(),
                        saved.getRate(), CoinTime.of(saved.getEffectiveFrom()), saved.getSource()))
                .toList();
        return new RegisterRatesResponse(registered, me.memberId(), true, USAGE_NOTICE_KO);
    }

    // ------------------------------------------------------------ display 조립

    /**
     * 회원의 {@code display_currency}로 환산한 표시값(§0.5).
     *
     * <p>{@code KRW}이거나 그 통화쌍 환율이 없으면 {@code null} — <b>필드째 생략</b>된다
     * ({@code spring.jackson.default-property-inclusion=non_null}). 환율 미등록은 오류가 아니다.
     */
    public Money.Display displayFor(Long memberId, long amount) {
        return currentRateOf(memberId)
                .map(rate -> Money.of(amount, rate.getPair().substring(0, 3), rate.getRate(),
                        CoinTime.of(rate.getEffectiveFrom())).display())
                .orElse(null);
    }

    /** 목록 응답의 축약형 환율(§0.5) — 항목마다 {@code display}를 반복하지 않는다. */
    public Money.Rate rateFor(Long memberId) {
        return currentRateOf(memberId)
                .map(rate -> new Money.Rate(rate.getPair().substring(0, 3), rate.getRate(),
                        CoinTime.of(rate.getEffectiveFrom())))
                .orElse(null);
    }

    private Optional<ExchangeRate> currentRateOf(Long memberId) {
        if (memberId == null) {
            return Optional.empty();
        }
        return memberRepository.findById(memberId)
                .map(Member::getDisplayCurrency)
                .filter(currency -> currency != null && !Money.BASE_CURRENCY.equals(currency))
                .flatMap(currency -> Optional.ofNullable(currentRates().get(currency + "_KRW")));
    }

    /**
     * 통화쌍별 <b>현재 적용중</b> 환율 1건씩.
     *
     * <p>리포지토리가 {@code effective_from <= now}를 최신순으로 주므로 통화쌍별 첫 행만 남긴다.
     * 미래 적용분은 아직 표시하지 않는다.
     */
    private Map<String, ExchangeRate> currentRates() {
        Map<String, ExchangeRate> latest = new LinkedHashMap<>();
        for (ExchangeRate rate : exchangeRateRepository
                .findByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(TimeSupport.nowStored())) {
            latest.putIfAbsent(rate.getPair(), rate);
        }
        return latest;
    }

    /** 형식 위반은 {@code null}이 아니라 예외다 — 조회는 400, 등록은 호출부가 다시 문구를 붙인다. */
    private static String normalizePair(String pair) {
        if (pair == null || pair.isBlank()) {
            return null;
        }
        String normalized = pair.trim().toUpperCase();
        if (!PAIR.matcher(normalized).matches()) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "통화쌍 형식이 올바르지 않습니다. 예: USD_KRW");
        }
        return normalized;
    }

    private static RateItem toItem(ExchangeRate rate) {
        // base·quote는 pair에서 파생한다 — ERD exchange_rate에 별도 컬럼이 없다.
        return new RateItem(rate.getPair(), rate.getPair().substring(0, 3), Money.BASE_CURRENCY,
                rate.getRate(), CoinTime.of(rate.getEffectiveFrom()), rate.getSource());
    }
}
