package com.ssafy.b204.chain.worker;

import com.ssafy.b204.chain.entity.ChainJob;

/**
 * OPERATOR job의 서명된 raw tx를 만드는 자리 — <b>구현체는 아직 없다.</b>
 *
 * <p>{@code MINT}·{@code RELEASE}·{@code REFUND} 같은 운영자 tx는 컨트랙트 함수 호출이라
 * calldata를 만들려면 ABI가 있어야 한다. 컨트랙트 인터페이스는 9/9 고정 예정이고(Jira -25) 그 전에
 * 함수 이름·인자를 지어내면 <b>조용히 틀린 tx를 보내는 코드</b>가 된다. 그래서 인터페이스만 두고
 * 구현체를 만들지 않는다.
 *
 * <p>구현체가 없으면 {@link ChainJobWorker}는 OPERATOR job을 <b>집어가지 않고 PENDING으로 둔다</b> —
 * 실패로 만들지 않는다. ABI가 고정되고 구현체가 붙으면 그동안 쌓인 job이 그대로 처리된다.
 *
 * <p>구현 시 계약
 *
 * <ul>
 *   <li>호출은 <b>지갑 큐 스레드</b>에서 일어난다({@link ChainWalletQueue}). 같은 지갑의 호출이
 *       겹치지 않으므로 nonce를 조회해 그대로 써도 된다.
 *   <li>서명까지 마친 raw tx hex({@code 0x…})를 돌려준다. 전송은 워커가 한다 — 전송과 상태 전이를
 *       한 곳에 모아야 "보냈는데 PENDING" 창이 생기지 않는다.
 *   <li>gasPrice는 {@code eth_gasPrice}를 읽어 쓴다. 하드코딩하지 않는다(Kairos baseFee 변동).
 * </ul>
 */
public interface OperatorTxBuilder {

    /**
     * @return 서명된 raw tx hex
     * @throws com.ssafy.b204.common.error.BusinessException 만들 수 없는 job이면 규격 코드로 던진다
     */
    String buildSignedTx(ChainJob job);

    /** 이 빌더가 처리할 수 있는 유형인지. 유형별로 구현을 나눌 때 쓴다. */
    boolean supports(ChainJob.TxType txType);
}
