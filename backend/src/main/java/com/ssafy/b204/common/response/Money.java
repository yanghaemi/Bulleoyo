package com.ssafy.b204.common.response;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;

/**
 * 금액 표기 — API v6 §0.5.
 *
 * <p>{@code amount}(YoYo 정수)가 <b>원본</b>이고, 표시 통화 환산은 {@code display}로만 내려간다.
 *
 * <pre>{@code
 * { "amount": 15000, "currency": "KRW",
 *   "display": { "currency": "USD", "approx": 11.11, "rate": 1350.0, "asOf": "..." } }
 * }</pre>
 *
 * <p><b>환율은 표시에만 쓴다</b>(P-17). 정산·분배·컨트랙트 인자·티켓 가격·지급 금액에는 절대 쓰지
 * 않는다. 서버는 요청 본문의 {@code display*} 필드를 전부 무시하며 금액 검증은 {@code amount}만 본다
 * — 그래서 이 타입은 <b>응답 전용</b>이고 요청 DTO에 쓰지 않는다.
 *
 * <p>{@code display}는 회원의 {@code display_currency}가 {@code KRW}이거나 환율 레코드가 없으면
 * 생략한다(환율 미등록은 오류가 아니다). {@code @JsonInclude(NON_NULL)}이 전역 설정이라
 * {@code null}이면 필드째 빠진다.
 */
public record Money(long amount, String currency, Display display) {

    public static final String BASE_CURRENCY = "KRW";

    /** 환산 없이 원본만. {@code display_currency}가 KRW이거나 환율이 없을 때. */
    public static Money of(long amount) {
        return new Money(amount, BASE_CURRENCY, null);
    }

    /**
     * 표시 환산을 붙인다.
     *
     * @param displayCurrency 회원의 {@code display_currency}
     * @param rate {@code 1 displayCurrency = rate KRW}
     * @param asOf 그 환율의 {@code effective_from}
     */
    public static Money of(long amount, String displayCurrency, BigDecimal rate, OffsetDateTime asOf) {
        if (displayCurrency == null || BASE_CURRENCY.equals(displayCurrency) || rate == null
                || rate.signum() <= 0) {
            return of(amount);
        }
        BigDecimal approx = BigDecimal.valueOf(amount).divide(rate, 2, RoundingMode.HALF_UP);
        return new Money(amount, BASE_CURRENCY, new Display(displayCurrency, approx, rate, asOf));
    }

    /** 표시 전용 환산값. 요청 본문으로 되돌려 보낼 수 없다. */
    public record Display(String currency, BigDecimal approx, BigDecimal rate, OffsetDateTime asOf) {}

    /**
     * 목록 축약형 — 항목마다 {@code display}를 반복하지 않고 응답 루트에 하나만 담는 형태(§0.5).
     * 항목에는 {@code amount}만 두고 이 객체를 {@code data.rate}에 넣는다.
     */
    public record Rate(String currency, BigDecimal rate, OffsetDateTime asOf) {}
}
