package com.ssafy.b204.coin.service;

import com.ssafy.b204.chain.service.ChainJobService;
import com.ssafy.b204.coin.dto.CoinDtos.ChainConfigResponse;
import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinRequest;
import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinResponse;
import com.ssafy.b204.coin.dto.CoinDtos.GrantHistoryResponse;
import com.ssafy.b204.coin.dto.CoinDtos.Issuer;
import com.ssafy.b204.coin.dto.CoinDtos.RatesResponse;
import com.ssafy.b204.coin.dto.CoinDtos.RegisterRatesRequest;
import com.ssafy.b204.coin.dto.CoinDtos.RegisterRatesResponse;
import com.ssafy.b204.coin.dto.CoinDtos.SupplyResponse;
import com.ssafy.b204.coin.service.SupplyReconciler.Snapshot;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.security.MemberPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * coin 도메인 서비스 — API v6 §8.
 *
 * <p>이 클래스는 <b>컨트롤러가 부르는 얇은 창구</b>다. 실제 계산은 셋으로 나뉜다.
 *
 * <ul>
 *   <li>{@link SupplyReconciler} — 발행량 대사(불변식 4개)와 mint·release 중단 플래그
 *   <li>{@link ExchangeRateService} — 표시 환율 조회·등록과 응답 {@code display} 조립
 *   <li>{@link CoinGrantService} — 시연용 지급(202 + {@code chain_job}) 과 지급 이력
 * </ul>
 *
 * <p>구현하면서 지킨 것
 *
 * <ul>
 *   <li><b>지급은 {@code chain_job}에 {@code MINT} job을 넣는 것이 전부다.</b> 요청 스레드에서
 *       체인에 쓰지 않는다(§0.3). {@code issuer_type}은 항상 {@code MOCK}이고 {@code EXTERNAL}
 *       분기를 만들지 않는다 — P2 예약값이다.
 *   <li><b>환율은 표시에만 쓴다</b>(P-17). 지급 금액·정산·컨트랙트 인자에 들어가는 경로가 없다.
 *   <li>환율 미등록은 오류가 아니다 — 빈 배열 200이고 {@code display}를 생략한다.
 *   <li><b>{@code supply()}는 노드 조회 실패에도 200이다.</b> 체인을 못 읽으면 DB 집계로 답하고
 *       {@code stale: true}로 알린다.
 *   <li>불변식이 깨지면 mint를 중단하고 {@code COIN_RESERVE_MISMATCH}(409)를 던진다. 자동 복구하지
 *       않는다 — 관리자 확인 대상이다.
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CoinService {

    /** 관객 화면에 노출하지 않는 고지 문구(CON-03). 기본 언어는 en이다(§0.6). */
    private static final String DISCLOSURE =
            "A testnet demo set in a future where money is a coin. No real assets or currency. "
                    + "Coins are granted by the platform for the demo; balance figures are read "
                    + "through the platform server.";

    private static final String GRANT_NOTICE =
            "Every coin in circulation came from a demo grant: 100,000 on sign-up, "
                    + "plus manual admin grants.";

    /** {@code replaceable}이 "인가 발행사 코인·CBDC로 교체 가능"이라는 서술의 근거다. */
    private static final Issuer ISSUER = new Issuer("MOCK", "Platform (demo grant)", true);

    /**
     * 코인 rename(KRWS → YoYo, S15P21B204-41). 온체인 {@code symbol()}·API v6·openapi.yaml(MR !52)과 같은 값이다.
     * 응답 본문에 실려 나가는 값이라 명세(API v6 §coin-01·02·verify-01)·openapi.yaml과 함께 움직인다 —
     * 그 둘은 MR !52 에서 YoYo 로 바뀌었고 이 MR 은 !52 뒤에 머지한다. 프론트 생성 타입(리터럴 유니온)은
     * !52 머지 후 {@code pnpm gen:api}로 갱신한다.
     */
    private static final String TOKEN_SYMBOL = "YoYo";

    /** {@code YoYo.decimals() == 0}. 10,000원은 {@code 10000}이다 — 스케일링하지 않는다. */
    private static final int TOKEN_DECIMALS = 0;

    private final SupplyReconciler supplyReconciler;
    private final ExchangeRateService exchangeRateService;
    private final CoinGrantService coinGrantService;
    private final ChainJobService chainJobService;
    private final ChainProperties chainProperties;

    /** API-coin-01 발행량·에스크로 공시. 권한 GUEST. 노드 실패에도 응답한다. */
    public SupplyResponse supply() {
        Snapshot snapshot = supplyReconciler.snapshot();
        String tokenAddress = tokenAddress();
        return new SupplyResponse(
                snapshot.totalSupply(),
                snapshot.escrowTotal(),
                snapshot.walletTotal(),
                snapshot.grantCount(),
                snapshot.supplyMatched(),
                Money.BASE_CURRENCY,
                // GUEST 엔드포인트다. 로그인한 채로 열면 그 회원의 표시 통화로 환산해 준다(§0.5).
                exchangeRateService.displayFor(currentMemberId(), snapshot.totalSupply()),
                ISSUER,
                // mint는 불변식 1·4만 본다. release는 거기에 불변식 3(정산 재계산)을 더한다 —
                // 판정이 갈라지는 유일한 지점이라 두 값을 따로 읽는다(SupplyReconciler 주석).
                !snapshot.supplyMatched(),
                snapshot.releaseHalted(),
                chainProperties.networkName(),
                chainProperties.chainId(),
                tokenAddress,
                TOKEN_SYMBOL,
                TOKEN_DECIMALS,
                tokenAddress == null ? null : chainJobService.addressExplorerUrl(tokenAddress),
                snapshot.invariants(),
                snapshot.perPerformanceEscrow(),
                CoinTime.of(snapshot.computedAt()),
                CoinTime.of(snapshot.nextRefreshAt()),
                snapshot.stale(),
                DISCLOSURE,
                GRANT_NOTICE);
    }

    /** API-coin-02 표시 환율 조회. 권한 GUEST. 미등록은 빈 배열 200. */
    public RatesResponse rates(String pair) {
        return exchangeRateService.rates(pair);
    }

    /**
     * API-coin-04 체인·컨트랙트 설정. 권한 GUEST. <b>P1 — 아직 구현하지 않는다.</b>
     *
     * <p>MVP 프론트는 이 값을 {@code VITE_*} 환경변수로 갖는다(openapi {@code x-priority: P1}).
     * 응답에 필요한 {@code contracts.abiVersion}·{@code web3auth.loginProviders}가 아직 어디에도
     * 확정값으로 없어, 지어내 내려보내는 대신 미구현으로 둔다.
     */
    public ChainConfigResponse config() {
        throw ErrorCode.COMMON_INTERNAL_ERROR.toException("미구현: API-coin-04 체인·컨트랙트 설정(P1)");
    }

    /** API-coin-03 표시 환율 등록. 권한 ADMIN. {@code RATE_CHANGE} 감사 로그. */
    @Transactional
    public RegisterRatesResponse registerRates(MemberPrincipal me, RegisterRatesRequest request) {
        return exchangeRateService.registerRates(me, request);
    }

    /** API-coin-07 시연용 코인 지급. 권한 ADMIN. 202 + 폴링. */
    @Transactional
    public GrantCoinResponse grantCoin(MemberPrincipal me, GrantCoinRequest request) {
        return coinGrantService.grantCoin(me, request);
    }

    /** API-coin-08 지급 이력. 권한 ADMIN. {@code chain_job WHERE tx_type='MINT'}. */
    public GrantHistoryResponse grantHistory(MemberPrincipal me, String source, String status,
                                             Long memberId, String address, Pageable pageable) {
        return coinGrantService.grantHistory(me, source, status, memberId, address, pageable);
    }

    // ------------------------------------------------------------------ 보조

    /** 설정이 비어 있으면 빈 문자열이 들어온다 — 응답에서는 필드를 생략한다. */
    private String tokenAddress() {
        ChainProperties.Contract contract = chainProperties.contract();
        if (contract == null || contract.yoyoAddress() == null || contract.yoyoAddress().isBlank()) {
            return null;
        }
        return contract.yoyoAddress();
    }

    /**
     * 공시는 비인증 API라 {@code MemberPrincipal} 파라미터가 없다. 로그인 상태로 열었다면 표시
     * 통화를 맞춰 주고, 비로그인이면 {@code display}를 생략한다.
     */
    private Long currentMemberId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof MemberPrincipal me) {
            return me.memberId();
        }
        return null;
    }
}
