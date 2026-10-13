package com.ssafy.b204.coin.service;

import com.ssafy.b204.coin.entity.ExchangeRate;
import com.ssafy.b204.coin.repository.ExchangeRateRepository;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.support.TimeSupport;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 표시 환율 조회 — API v6 §0.5.
 *
 * <p><b>표시 전용이다.</b> 여기서 나온 값은 응답의 {@code display}·{@code rate} 객체에만 들어간다.
 * 정산·분배·컨트랙트 인자·티켓 가격·지급 금액에는 절대 쓰지 않는다(P-17). 그래서 이 클래스는
 * {@code long amount}를 받아 {@link Money}를 조립할 뿐 금액을 <b>바꾸지 않는다</b>.
 *
 * <p><b>환율 미등록은 오류가 아니다.</b> 레코드가 없거나 {@code displayCurrency}가 {@code KRW}면
 * {@code display}를 통째로 생략한다(§0.5). {@code COIN_RATE_NOT_FOUND}는 §16.1의 신설 제안이며
 * 본문에서 쓰지 않는다.
 *
 * <p>통화쌍 표기는 {@code exchange_rate.pair}의 {@code "USD_KRW"} 형식이다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DisplayRateService {

    private final ExchangeRateRepository exchangeRateRepository;

    /** 회원의 표시 통화에 대응하는 유효 환율. 없거나 KRW면 {@link Optional#empty()}. */
    public Optional<ExchangeRate> effectiveRate(String displayCurrency) {
        if (displayCurrency == null || displayCurrency.isBlank()
                || Money.BASE_CURRENCY.equals(displayCurrency)) {
            return Optional.empty();
        }
        return exchangeRateRepository
                .findFirstByPairAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                        displayCurrency + "_" + Money.BASE_CURRENCY, TimeSupport.nowStored());
    }

    /** 금액 + {@code display}. 환율이 없으면 원본만. */
    public Money money(long amount, String displayCurrency, String timezone) {
        return effectiveRate(displayCurrency)
                .map(rate -> Money.of(amount, displayCurrency, rate.getRate(),
                        TimeSupport.toOffset(rate.getEffectiveFrom(), timezone)))
                .orElseGet(() -> Money.of(amount));
    }

    /**
     * 목록 축약형의 응답 루트 {@code rate}(§0.5). 없으면 {@code null}이고 항목은 원 값만 쓴다.
     */
    public Money.Rate listRate(String displayCurrency, String timezone) {
        return effectiveRate(displayCurrency)
                .map(rate -> new Money.Rate(displayCurrency, rate.getRate(),
                        TimeSupport.toOffset(rate.getEffectiveFrom(), timezone)))
                .orElse(null);
    }

    /** API-member-06의 {@code displaySupported} — 저장은 허용하고 표시 가능 여부만 알린다. */
    public boolean isSupported(String displayCurrency) {
        return Money.BASE_CURRENCY.equals(displayCurrency)
                || effectiveRate(displayCurrency).isPresent();
    }
}
