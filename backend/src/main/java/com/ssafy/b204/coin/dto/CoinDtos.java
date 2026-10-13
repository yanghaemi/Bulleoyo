package com.ssafy.b204.coin.dto;

import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * coin 도메인 DTO — API v6 §8 (API-coin-01·02·03·07·08, 04~06은 P1). 접두 {@code COIN_*}.
 *
 * <p><b>플랫폼은 화폐 발행 기관이 아니다.</b> 시연을 위해 가입자에게 기본 잔액을 지급할 뿐이고,
 * 발행·상환·준비금의 주체가 아니다(결정 v2 §0·§2.2). 지급 로직은 얇은 {@code CoinIssuerPort}
 * ({@code tokenAddress}·{@code mint}·{@code totalSupply}) 뒤에 있다.
 */
public final class CoinDtos {

    private CoinDtos() {
    }

    // ------------------------------------------------------------ API-coin-01

    /**
     * {@code GET /api/v1/coin/supply} — YoYo 발행량·에스크로 공시. 권한 <b>GUEST</b>.
     *
     * <p>v5에서 구 유통량 요약과 구 API-verify-02(준비금 증명)가 여기로 통합됐다.
     *
     * <p><b>{@code invariants}가 이 API의 요점이다</b> — 불변식 4개를 서버가 스스로 검사해
     * 공개한다. 하나라도 깨지면 {@code supplyMatched}가 {@code false}가 되고 mint·release를
     * 중단한다({@code COIN_RESERVE_MISMATCH}).
     */
    public record SupplyResponse(
            Long totalSupply,
            Long escrowTotal,
            Long walletTotal,
            Integer grantCount,
            boolean supplyMatched,
            String currency,
            Money.Display display,
            Issuer issuer,
            boolean mintHalted,
            boolean releaseHalted,
            String network,
            Long chainId,
            String tokenAddress,
            String tokenSymbol,
            Integer tokenDecimals,
            String explorerUrl,
            List<Invariant> invariants,
            List<PerformanceEscrow> perPerformanceEscrow,
            OffsetDateTime asOf,
            OffsetDateTime nextRefreshAt,
            boolean stale,
            String disclosure,
            String grantNotice
    ) {}

    /**
     * 공연별 에스크로·보증금 잔액. {@code openapi.yaml}의 {@code CoinSupply.perPerformanceEscrow}다.
     *
     * <p>보증금은 정산 재원이 아니므로({@code R}에 포함되지 않는다) 컬럼을 나눠 보여준다.
     */
    public record PerformanceEscrow(Long performanceId, Long escrowAmount, Long depositAmount) {}

    /** {@code replaceable: true}가 "인가 발행사 코인·CBDC로 교체 가능"이라는 서술의 근거다. */
    public record Issuer(String type, String label, boolean replaceable) {}

    /**
     * 불변식 검사 결과.
     *
     * <ol>
     *   <li>{@code SUPPLY_EQUALS_MINTED} — {@code totalSupply = Σ Minted}(mint만 하므로 감소 없음)
     *   <li>{@code ESCROW_PER_SHOW} — {@code escrowOf = Σpurchase − Σrefund − Σrelease}
     *   <li>{@code RELEASED_EQUALS_RULE_RECALC} — {@code Σ Released = 잠긴 규칙 × 카운터}(dust 포함)
     *   <li>{@code SUPPLY_EQUALS_WALLET_PLUS_ESCROW} — 발행량 = Σ지갑 + Σ에스크로
     * </ol>
     */
    public record Invariant(Integer no, String name, Long expected, Long actual,
                             Integer checkedShows, Integer mismatchedShows, Long maxDiff,
                             boolean matched, String note) {}

    // ------------------------------------------------------------ API-coin-02·03

    /** {@code GET /api/v1/coin/rates} — 표시 환율 조회. 권한 <b>GUEST</b>. */
    public record RatesResponse(List<RateItem> rates, String usageNotice,
                                 OffsetDateTime refreshedAt) {}

    /** {@code base}·{@code quote}는 {@code pair}에서 파생한다(ERD에 별도 컬럼 없음). */
    public record RateItem(String pair, String base, String quote, BigDecimal rate,
                            OffsetDateTime effectiveFrom, String source) {}

    /**
     * {@code PUT /api/v1/admin/coin/rates} — 표시 환율 등록. 권한 <b>ADMIN</b>.
     *
     * <p>⚠️ 등록한 환율은 <b>표시에만</b> 쓴다. 정산·분배·컨트랙트 인자·티켓 가격·지급 금액에
     * 절대 반영하지 않는다(P-17).
     */
    public record RegisterRatesRequest(
            @NotEmpty(message = "등록할 환율을 1개 이상 입력해 주세요.") @Valid List<RateInput> rates
    ) {}

    public record RateInput(
            @NotBlank String pair,
            @NotNull BigDecimal rate,
            OffsetDateTime effectiveFrom,
            String source
    ) {}

    public record RegisterRatesResponse(List<RegisteredRate> registered, Long publishedBy,
                                         boolean cacheInvalidated, String usageNotice) {}

    public record RegisteredRate(Long rateId, String pair, BigDecimal rate,
                                  OffsetDateTime effectiveFrom, String source) {}

    // ------------------------------------------------------------ API-coin-04 (P1)

    /**
     * {@code GET /api/v1/coin/config} — 체인·컨트랙트 설정. 권한 <b>GUEST</b> · <b>P1</b>.
     *
     * <p>MVP에서는 프론트가 환경변수({@code VITE_*})로 갖는다. 이 API는 그 대체 경로다.
     *
     * <p>{@code web3auth.clientIdPublic}은 공개 값이다 — 비밀이 아니다. OPERATOR·MINTER
     * <b>개인키는 어떤 응답에도 담지 않는다</b>. {@code feePolicy.feePayerAddress}는 §0.7의
     * 주소 노출 예외에 해당한다.
     */
    public record ChainConfigResponse(
            String network,
            String chainNamespace,
            Long chainId,
            String chainIdHex,
            String displayName,
            String ticker,
            String tickerName,
            String rpcTarget,
            String explorerBaseUrl,
            Contracts contracts,
            Web3AuthConfig web3auth,
            FeePolicy feePolicy,
            OffsetDateTime refreshedAt
    ) {}

    public record Contracts(String tokenAddress, String tokenSymbol, Integer tokenDecimals,
                             String splitterAddress, String abiVersion) {}

    public record Web3AuthConfig(String clientIdPublic, List<String> loginProviders) {}

    /** {@code userNativeBalanceRequired: false} — 사용자 지갑에 KAIA를 넣지 않는다. */
    public record FeePolicy(boolean feeDelegation, String feePayerAddress,
                             boolean userNativeBalanceRequired) {}

    // ------------------------------------------------------------ API-coin-07

    /**
     * {@code PUT /api/v1/admin/coin/grants} — 시연용 코인 지급. 권한 <b>ADMIN</b>. 202 + 폴링.
     *
     * <p>{@code memberId}와 {@code address} 중 <b>하나는 있어야 한다</b>(조건부 필수) —
     * 회원으로 지목하거나 주소로 직접 지목한다.
     *
     * <p>1회 최대 1,000,000 YoYo(P-19). 초과는 {@code COMMON_VALIDATION_FAILED}(400)
     * (전용 코드 {@code COIN_GRANT_LIMIT_EXCEEDED} 제안은 §16.1). 관리자당 30회/분(§0.9).
     */
    public record GrantCoinRequest(
            Long memberId,
            String address,
            @NotNull @Min(value = 1, message = "지급 금액은 1 이상이어야 합니다.") Long amount,
            String memo
    ) {}

    /** {@code grantRef}가 멱등키다({@code chain_job.idempotency_key}). */
    public record GrantCoinResponse(
            String jobId,
            String status,
            String signerType,
            Integer pollAfterMs,
            Long memberId,
            String address,
            Long amount,
            String currency,
            Money.Display display,
            String memo,
            String grantRef,
            Long balanceBefore,
            Long expectedBalanceAfter,
            OffsetDateTime requestedAt
    ) {}

    // ------------------------------------------------------------ API-coin-08

    /**
     * {@code GET /api/v1/admin/coin/grants} — 지급 이력. 권한 <b>ADMIN</b>.
     *
     * <p>전용 테이블이 없다 — {@code chain_job WHERE tx_type='MINT'}가 곧 지급 이력이다
     * (결정 v2 §2.2). {@code source}({@code SIGNUP}/{@code ADMIN})는
     * {@code requester_member_id}가 {@code null}인지로 파생한다.
     */
    public record GrantHistoryResponse(Money.Rate rate, GrantSummary summary,
                                        List<GrantItem> items, PageInfo pageInfo) {}

    public record GrantSummary(Integer grantCount, Long grantedTotal, Integer signupCount,
                                Long signupTotal, Integer adminCount, Long adminTotal,
                                String currency) {}

    public record GrantItem(
            String jobId,
            String source,
            String status,
            Long memberId,
            String memberName,
            String address,
            Long amount,
            String memo,
            Long requesterId,
            String requesterName,
            String grantRef,
            String txHash,
            String explorerUrl,
            OffsetDateTime requestedAt,
            OffsetDateTime confirmedAt
    ) {}
}
