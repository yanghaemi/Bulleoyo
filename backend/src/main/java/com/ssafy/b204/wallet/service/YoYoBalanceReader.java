package com.ssafy.b204.wallet.service;

import com.ssafy.b204.coin.service.CoinChainReader;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * {@code YoYo.balanceOf(address)} 조회 지점 — API-wallet-01 시스템 처리 3.
 *
 * <p><b>잔액의 원장은 언제나 체인이다.</b> Redis {@code wallet:balance}는 캐시일 뿐이고 DB에는
 * 사본이 없다(§0.12 · §B′). 이 클래스가 wallet 도메인의 유일한 읽기 경로다.
 *
 * <p><b>어댑터다.</b> 실제 {@code eth_call}은 {@link CoinChainReader}(체인 모듈의 web3j 래퍼)가
 * 하고, 여기서는 그 결과를 wallet 도메인의 계약으로 번역한다 — <b>조회 실패는 예외가
 * 아니라 {@link Optional#empty()}다.</b> 노드 오류는 서버 오류가 아니고, 호출부가 캐시
 * 폴백(stale)으로 처리해야 하기 때문이다(AVAIL-02). 캐시도 없으면 호출부가
 * {@code COMMON_EXTERNAL_SERVICE_ERROR}(502)로 만든다(API-wallet-01 4xx/5xx 표 그대로).
 *
 * <p>체인 설정이 비어 있어도 <b>기동을 막지 않는다</b>(개발 환경 안내 v1 §3.1) — 그래서
 * {@code @ConditionalOn*}을 걸지 않고 빈은 항상 만들되 {@link #isAvailable()}로 갈린다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class YoYoBalanceReader {

    private final CoinChainReader chainReader;

    /** RPC와 컨트랙트 주소가 모두 설정돼 조회를 시도할 수 있는 상태인지. */
    public boolean isAvailable() {
        return chainReader.isAvailable();
    }

    /**
     * @return 조회한 잔액(YoYo 정수 = ₩). 노드가 없거나 조회에 실패하면 {@link Optional#empty()}
     */
    public Optional<Long> balanceOf(String address) {
        if (address == null || address.isBlank() || !isAvailable()) {
            return Optional.empty();
        }
        try {
            return Optional.of(chainReader.balanceOf(address));
        } catch (RuntimeException e) {
            // 예외를 다시 던지지 않는다 — 위 javadoc 참조.
            log.warn("YoYo.balanceOf 조회 실패 — 캐시 폴백으로 넘긴다");
            return Optional.empty();
        }
    }
}
