package com.ssafy.b204.support;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import org.web3j.abi.EventEncoder;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.datatypes.Event;
import org.web3j.abi.datatypes.Type;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.core.methods.response.TransactionReceipt;

/**
 * <b>실체인 없이</b> receipt 로그를 만든다 — 체인 워커의 이벤트 파싱·확정 경로를 검증하기 위한
 * 유일한 방법이다.
 *
 * <p>Kairos에 실제로 tx를 보내는 E2E는 {@code CHAIN_E2E=1}에서만 도는 별도 테스트
 * ({@code ChainFeeDelegationE2ETest}·{@code ChainMintE2ETest})이고, 기본 빌드에서는 키도 가스도
 * 네트워크도 없다. 그래서 <b>로그를 규격대로 직접 조립</b>한다.
 *
 * <p><b>topic0·인코딩을 손으로 적지 않는다.</b> 이벤트 정의는 ABI 생성물
 * ({@code RevenueSplitter.PURCHASED_EVENT} 같은 {@link Event} 상수)를 그대로 받고, topic0은
 * {@link EventEncoder#encode(Event)}로, 인자는 web3j ABI 인코더로 만든다. 그래야 <b>테스트가
 * 만드는 로그와 서버가 파싱하는 로그가 같은 정의에서 나온다</b> — 손으로 적은 hex였다면 서버가
 * 못 읽는 로그를 "맞다"고 우기는 테스트가 된다.
 *
 * <pre>
 *   topics[0]      = keccak256("Purchased(uint256,bytes32,address,uint8,uint256,uint16)")
 *   topics[1..n]   = indexed 인자 (각 32바이트 워드)
 *   data           = non-indexed 인자를 이어 붙인 것
 * </pre>
 */
@SuppressWarnings({"rawtypes", "unchecked"})
public final class ChainLogs {

    private ChainLogs() {
    }

    /** 이벤트 로그 한 줄. {@code address}는 그 이벤트를 낸 컨트랙트 주소다(서버가 이것으로 거른다). */
    public static Log log(String address, Event event, List<Type> indexed, List<Type> nonIndexed) {
        List<String> topics = new ArrayList<>();
        topics.add(EventEncoder.encode(event));
        indexed.forEach(value -> topics.add(word(value)));

        Log log = new Log();
        log.setAddress(address);
        log.setTopics(topics);
        log.setData("0x" + FunctionEncoder.encodeConstructor(nonIndexed));
        log.setRemoved(false);
        return log;
    }

    /** 성공 receipt. {@code status=0x1}. */
    public static TransactionReceipt receipt(String txHash, String to, String from, List<Log> logs) {
        return receipt(txHash, "0x1", to, from, logs);
    }

    /** revert receipt. {@code status=0x0}이고 로그가 없다. */
    public static TransactionReceipt reverted(String txHash, String to, String from) {
        return receipt(txHash, "0x0", to, from, List.of());
    }

    public static TransactionReceipt receipt(String txHash, String status, String to, String from,
                                             List<Log> logs) {
        TransactionReceipt receipt = new TransactionReceipt();
        receipt.setTransactionHash(txHash);
        receipt.setStatus(status);
        receipt.setTo(to);
        receipt.setFrom(from);
        receipt.setBlockNumber("0x64");
        receipt.setLogs(new ArrayList<>(logs));
        return receipt;
    }

    /** 32바이트 hex 한 워드. indexed 인자는 topic에 이 형태로 들어간다. */
    private static String word(Type value) {
        return "0x" + FunctionEncoder.encodeConstructor(List.of(value));
    }

    /** {@code 0x} + 64 hex → {@code bytes32} 바이트 배열. */
    public static byte[] bytes32(String hex) {
        return org.web3j.utils.Numeric.hexStringToByteArray(hex);
    }

    public static BigInteger uint(long value) {
        return BigInteger.valueOf(value);
    }
}
