package com.ssafy.b204.chain.config;

import com.ssafy.b204.chain.entity.ChainJob;

/**
 * 서버가 키를 가진 운영 지갑 2개 — API v6 §0 전제.
 *
 * <p>ADMIN 키(컨트랙트 배포·pause·rotate)는 서버에 넣지 않는다(Jenkins Credentials 전용).
 * 사용자 키는 애초에 서버에 오지 않는다 — {@code USER} job은 발신자 서명 RLP만 받는다.
 *
 * <p>이 enum이 곧 <b>nonce 직렬 큐의 단위</b>다. API v6 §0.3 — "OPERATOR·MINTER 각 지갑의 tx는
 * 지갑별 단일 nonce 직렬 큐로 처리한다". 지갑이 늘면 큐도 함께 늘어야 하므로 값을 추가할 때는
 * {@link com.ssafy.b204.chain.worker.ChainWalletQueue}가 자동으로 스레드를 만든다.
 */
public enum ChainWallet {

    /** 대납(fee payer) 겸 일반 운영 tx 서명자. */
    OPERATOR,

    /** YoYo 발행 전용. {@code MINT} 하나만 이 키로 서명한다. */
    MINTER;

    /**
     * 작업 유형 → 서명 지갑. {@code MINT}만 MINTER고 나머지는 전부 OPERATOR다.
     *
     * <p>{@code USER} job(발신자 서명 대납)에서도 서버가 쓰는 키는 fee payer = OPERATOR다.
     */
    public static ChainWallet forTxType(ChainJob.TxType txType) {
        return txType == ChainJob.TxType.MINT ? MINTER : OPERATOR;
    }
}
