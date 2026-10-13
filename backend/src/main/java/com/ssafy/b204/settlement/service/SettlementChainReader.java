package com.ssafy.b204.settlement.service;

import java.util.Optional;

/**
 * 정산이 읽어야 하는 온체인 값 — <b>임시 소유 포트</b>.
 *
 * <p>체인 모듈({@code chain/}, 이강륜 소유)에는 아직 도메인이 쓸 조회 포트가 없다(coin의
 * {@code CoinChainReader}도 같은 이유로 도메인 안에 있다). 9/9 develop 정리에서 {@code chain.port} 패키지가
 * 걷혔으므로 "원래 자리"는 정해지지 않았다 — 체인 모듈이 조회 포트를 열면 <b>이 인터페이스를 지우고
 * 주입 지점만 바꾼다</b>(open-questions D-18). 도메인 코드(계산·게이트)는 그대로다.
 *
 * <p>전부 무료 {@code eth_call}이다. 실패·미설정은 예외가 아니라 {@link Optional#empty()}로 돌려준다 —
 * 조회가 안 된다는 사실 자체가 게이트의 입력이기 때문이다. "못 읽었는데 통과"가 생기면 안 되므로
 * 호출부가 {@code empty}를 <b>대사 불가</b>로 다룬다.
 */
public interface SettlementChainReader {

    /** 체인 설정(RPC·컨트랙트 주소)이 있어 조회를 시도할 수 있는가. */
    boolean isAvailable();

    /**
     * R = 분배 대상 총액. <b>보증금은 포함되지 않는다</b>(별도 계정).
     *
     * @param showId {@code performance.on_chain_id}
     */
    Optional<Long> escrowOf(long showId);

    /** 납부된 보증금 잔액. {@code escrowOf}와 분리된 계정이다. */
    Optional<Long> depositOf(long showId);

    /** 팀별 관객 선택 카운터(티켓 1매 = 1표). 배열 인덱스 = {@code teamIndex}. */
    Optional<long[]> choiceCountsOf(long showId);

    /**
     * {@code aggregate} 시점에 온체인에서 확정된 팀별 몫.
     *
     * <p>불변식 3의 서버 측 사전 검사 — {@link SettlementCalculator} 결과와 이 값이 다르면
     * release를 막아야 한다.
     */
    Optional<long[]> payoutsOf(long showId);

    /** 온체인 {@code Stage} 정수값(문서 13 §3.2). 미등록 공연은 0. */
    Optional<Integer> stageOf(long showId);
}
