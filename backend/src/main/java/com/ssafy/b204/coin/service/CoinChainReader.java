package com.ssafy.b204.coin.service;

/**
 * coin 도메인이 필요로 하는 <b>온체인 읽기 전용 조회</b>.
 *
 * <p><b>이 인터페이스는 임시 소유다.</b> 원래 자리는 서버 체인 모듈({@code feat/be/chain}, 이강륜)의
 * {@code ChainReader}이고, 그쪽에 같은 역할의 빈이 생기면 이 인터페이스는 지우고 주입 지점만 바꾼다
 * ({@code _workspace/10_coin-settlement-engineer_coin-api.md} — 합의 대기). coin 쪽 도메인 코드는
 * 이 인터페이스에만 의존하므로 교체해도 서비스·테스트는 그대로다.
 *
 * <p><b>tx를 보내지 않는다.</b> 여기 있는 것은 전부 {@code eth_call}이고, 구현체는
 * {@code ReadonlyTransactionManager}로 로드해 실수로 전송할 수 없게 한다.
 *
 * <p>금액 단위는 YoYo 정수(= ₩)다. {@code decimals() == 0}이므로 스케일링을 하지 않는다 —
 * 10,000원은 {@code 10000}이다.
 */
public interface CoinChainReader {

    /**
     * 체인 조회가 가능한 상태인지.
     *
     * <p>{@code false}면 호출부는 체인을 건너뛰고 DB 집계만으로 응답해야 한다. 체인 변수가 비어도
     * 애플리케이션이 기동해야 하고(README §9.3), 공시(API-coin-01)는 노드가 없어도 200이어야 한다.
     */
    boolean isAvailable();

    /** {@code YoYo.totalSupply()}. mint만 있으므로 단조 증가한다. */
    long totalSupply();

    /** {@code YoYo.balanceOf(address)}. */
    long balanceOf(String address);

    /** {@code RevenueSplitter.escrowOf(showId)} — 보증금은 포함하지 않는다. */
    long escrowOf(long showId);

    /** {@code RevenueSplitter.depositOf(showId)} — 보증금 계정(정산 재원 아님). */
    long depositOf(long showId);
}
