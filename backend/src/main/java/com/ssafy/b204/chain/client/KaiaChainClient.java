package com.ssafy.b204.chain.client;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.io.IOException;
import java.math.BigInteger;
import java.util.Locale;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameter;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.Response;
import org.web3j.protocol.core.methods.request.Transaction;
import org.web3j.protocol.core.methods.response.EthCall;
import org.web3j.protocol.core.methods.response.EthSendTransaction;
import org.web3j.protocol.core.methods.response.TransactionReceipt;

/**
 * Kairos JSON-RPC 얇은 래퍼. <b>체인에 나가는 모든 호출은 이 클래스를 지난다.</b>
 *
 * <p>존재 이유 셋.
 *
 * <ol>
 *   <li><b>부재를 흡수한다.</b> 체인 설정이 없으면 {@code Web3j} 빈이 아예 없다
 *       ({@link com.ssafy.b204.chain.config.ChainClientConfig}). 호출부마다 null 검사를 흩뿌리는
 *       대신 {@link #isAvailable()} 하나로 묻는다.
 *   <li><b>RPC 오류를 규격 코드로 번역한다.</b> 노드가 주는 문자열은 사용자에게 노출하지 않고
 *       (SEC-09) 규격 v3 §3에 있는 코드로만 바꾼다 — 새 코드는 만들지 않는다(API v6 §16.1).
 *   <li><b>전송에 {@code eth_sendRawTransaction}을 쓴다.</b> Kaia는 {@code kaia_sendRawTransaction}
 *       도 제공하지만 대납 tx(0x31) 전송은 표준 메서드로 스파이크에서 검증됐고
 *       (blockchain/spike RESULT.md Layer 3b), 표준을 쓰면 확장 {@code Web3j} 타입에 묶이지 않는다.
 * </ol>
 */
@Component
@Slf4j
public class KaiaChainClient {

    private final ObjectProvider<Web3j> web3jProvider;

    public KaiaChainClient(ObjectProvider<Web3j> web3jProvider) {
        this.web3jProvider = web3jProvider;
    }

    /** 체인 호출이 가능한지. {@code false}면 워커도 도메인도 체인 경로를 시도하지 않는다. */
    public boolean isAvailable() {
        return web3jProvider.getIfAvailable() != null;
    }

    private Web3j web3j() {
        Web3j web3j = web3jProvider.getIfAvailable();
        if (web3j == null) {
            // 설정이 없는데 체인 경로를 탔다 = 호출부의 분기 누락이다. 사용자 문구는 규격 기본값.
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return web3j;
    }

    /**
     * 서명이 끝난 raw tx 전송 → txHash.
     *
     * <p>노드가 거절하면 이유를 <b>코드로만</b> 바꿔 던진다. 원문은 로그에만 남는다.
     */
    public String sendRawTransaction(String signedRawTxHex) {
        try {
            EthSendTransaction response = web3j().ethSendRawTransaction(signedRawTxHex).send();
            if (response.hasError()) {
                throw translate(response.getError());
            }
            return response.getTransactionHash();
        } catch (IOException e) {
            log.warn("eth_sendRawTransaction 실패(네트워크)", e);
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR, e);
        }
    }

    /** receipt 조회. 아직 블록에 안 들어갔으면 비어 있다 — 예외가 아니라 정상 상태다. */
    public Optional<TransactionReceipt> receipt(String txHash) {
        try {
            return web3j().ethGetTransactionReceipt(txHash).send().getTransactionReceipt();
        } catch (IOException e) {
            log.warn("eth_getTransactionReceipt 실패(네트워크) txHash={}", txHash, e);
            return Optional.empty();
        }
    }

    /**
     * 이미 보낸 tx의 <b>calldata</b>를 노드에서 되찾는다.
     *
     * <p>revert 사유를 캐려면 같은 호출을 그 블록에서 {@code eth_call}로 재생해야 하는데
     * ({@link #revertData}) 그 입력이 되는 calldata가 서버에 남아 있지 않은 경우가 있다 —
     * <b>{@code OPERATOR} job</b>이다({@code sender_signed_rlp}는 {@code USER} job만 채운다).
     * 그래서 노드에 되묻는다. 이것이 없으면 {@code MINT}의 {@code GrantRefUsed}처럼
     * <b>운영자 tx의 revert 사유를 영영 알 수 없다</b>(계약 §4.6 매핑이 통째로 무력해진다).
     *
     * <p>실패하면 조용히 비운다 — 진단 보조일 뿐 판정 근거가 아니다.
     */
    public Optional<String> transactionInput(String txHash) {
        try {
            return web3j().ethGetTransactionByHash(txHash).send().getTransaction()
                    .map(org.web3j.protocol.core.methods.response.Transaction::getInput);
        } catch (IOException | RuntimeException e) {
            log.debug("eth_getTransactionByHash 실패 txHash={}", txHash, e);
            return Optional.empty();
        }
    }

    /**
     * 노드가 이 tx 를 <b>아는가</b> — {@code eth_getTransactionByHash} 가 {@code null} 이 아닌가.
     *
     * <p>receipt 를 시한 안에 못 찾은 tx 가 <b>아직 살아 있는지</b>(풀에 대기 중이거나 방금
     * 채굴됐다) <b>정말 유실됐는지</b> 가르는 근거다(S15P21B204-76). 그래서 {@link #transactionInput}
     * 과 달리 <b>모르면 삼키지 않는다</b> — 네트워크·RPC 오류를 "없다" 로 읽으면 살아 있는 tx 를
     * 실패로 닫는다. 판단할 수 없으면 예외를 던지고 호출부는 다음 주기에 다시 묻는다.
     */
    public boolean isTransactionKnown(String txHash) {
        try {
            var response = web3j().ethGetTransactionByHash(txHash).send();
            if (response.hasError()) {
                log.warn("eth_getTransactionByHash 거절 txHash={} message={}", txHash,
                        response.getError().getMessage());
                throw ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR.toException();
            }
            return response.getTransaction().isPresent();
        } catch (IOException e) {
            log.warn("eth_getTransactionByHash 실패(네트워크) txHash={}", txHash, e);
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR, e);
        }
    }

    public BigInteger blockNumber() {
        try {
            return web3j().ethBlockNumber().send().getBlockNumber();
        } catch (IOException e) {
            log.warn("eth_blockNumber 실패(네트워크)", e);
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR, e);
        }
    }

    /**
     * 다음 nonce. {@code PENDING} 기준으로 읽는다 — 직전 tx가 아직 블록에 안 들어갔어도 다음
     * 값을 받아야 지갑별 직렬 큐가 연속으로 보낼 수 있다.
     */
    public BigInteger pendingNonce(String address) {
        try {
            return web3j().ethGetTransactionCount(address, DefaultBlockParameterName.PENDING)
                    .send().getTransactionCount();
        } catch (IOException e) {
            log.warn("eth_getTransactionCount 실패(네트워크)", e);
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR, e);
        }
    }

    /** Kairos baseFee가 반영된 값을 쓴다. 하드코딩하지 않는다(스파이크 RESULT.md "참고"). */
    public BigInteger gasPrice() {
        try {
            return web3j().ethGasPrice().send().getGasPrice();
        } catch (IOException e) {
            log.warn("eth_gasPrice 실패(네트워크)", e);
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR, e);
        }
    }

    /**
     * {@code eth_estimateGas}. 실패하면 비어 있다 — 호출부가 유형별 상한으로 대체한다.
     *
     * <p>추정 실패는 대개 "그 tx가 revert된다"는 뜻이지만, 그것만으로 job을 실패시키지 않는다.
     * 상한으로 실제로 보내 보고 receipt·revert selector로 판정하는 편이 원인이 정확하다.
     */
    public Optional<BigInteger> estimateGas(String from, String to, String data) {
        try {
            var response = web3j().ethEstimateGas(
                    Transaction.createEthCallTransaction(from, to, data)).send();
            if (response.hasError()) {
                log.debug("eth_estimateGas 거절 to={} message={}", to, response.getError().getMessage());
                return Optional.empty();
            }
            return Optional.ofNullable(response.getAmountUsed());
        } catch (IOException | RuntimeException e) {
            log.debug("eth_estimateGas 실패 to={}", to, e);
            return Optional.empty();
        }
    }

    /**
     * {@code eth_call}(latest) — <b>상태를 바꾸지 않고</b> 같은 calldata를 지금 상태에서 실행해 본다.
     *
     * <p>{@link #revertData}가 이미 실패한 tx의 사유를 캐는 <b>사후</b> 진단이라면, 이쪽은 보내기
     * 전에 "이 tx가 revert 하는가"를 묻는 <b>사전</b> 확인이다. MINT E2E 드라이런
     * ({@code ChainMintE2ETest})이 이걸로 calldata를 검증한다 — 실 컨트랙트에 민팅하면 서버 장부
     * 밖 발행이 생겨 발행량 불변식이 영구히 깨지기 때문에 전송 대신 여기까지만 한다.
     *
     * <p>revert도 RPC 오류도 예외로 올리지 않는다. 판단은 호출부가 한다.
     */
    public CallResult ethCall(String from, String to, String data) {
        try {
            EthCall call = web3j().ethCall(
                    Transaction.createEthCallTransaction(from, to, data),
                    DefaultBlockParameterName.LATEST).send();
            if (call.hasError()) {
                // 노드에 따라 revert를 error로 준다. revert 데이터는 error.data에 실린다.
                Response.Error error = call.getError();
                log.debug("eth_call 거절 to={} message={}", to, error.getMessage());
                return new CallResult(true, errorData(error), error.getMessage());
            }
            if (call.isReverted()) {
                return new CallResult(true, call.getValue(), call.getRevertReason());
            }
            return new CallResult(false, call.getValue(), null);
        } catch (IOException | RuntimeException e) {
            log.debug("eth_call 실패 to={}", to, e);
            return new CallResult(false, null, String.valueOf(e.getMessage()));
        }
    }

    /**
     * {@link #ethCall} 결과.
     *
     * @param reverted 컨트랙트가 revert 했는가
     * @param data revert 데이터(revert일 때, 있으면 selector 4바이트로 시작) 또는 반환값 hex
     * @param errorMessage revert 사유·RPC 오류 원문. 성공이면 {@code null}
     */
    public record CallResult(boolean reverted, String data, String errorMessage) {

        /** revert도 오류도 없었다 = 같은 tx를 지금 보내면 성공한다. */
        public boolean succeeded() {
            return !reverted && errorMessage == null;
        }
    }

    /** 운영지갑 KAIA 잔액(peb). {@code b204_operator_kaia_balance} 지표용. */
    public Optional<BigInteger> kaiaBalance(String address) {
        try {
            return Optional.of(web3j().ethGetBalance(address, DefaultBlockParameterName.LATEST)
                    .send().getBalance());
        } catch (IOException | RuntimeException e) {
            log.debug("eth_getBalance 실패 address={}", address, e);
            return Optional.empty();
        }
    }

    /**
     * revert된 tx를 같은 블록에서 {@code eth_call}로 재생해 revert 데이터를 얻는다.
     *
     * <p>receipt에는 revert 사유가 없다 — Kaia·이더리움 공통이다. 실패 원인을 알려면 그 시점의
     * 상태에서 같은 호출을 다시 해야 한다. 실패해도 조용히 비운다(진단 보조일 뿐 판정 근거가 아니다).
     */
    public Optional<String> revertData(String from, String to, String data, BigInteger blockNumber) {
        try {
            EthCall call = web3j().ethCall(
                    Transaction.createEthCallTransaction(from, to, data),
                    DefaultBlockParameter.valueOf(blockNumber)).send();
            if (call.hasError()) {
                // 노드에 따라 revert 데이터가 error.data에 들어온다.
                return Optional.ofNullable(errorData(call.getError()));
            }
            return call.isReverted() ? Optional.ofNullable(call.getRevertReason()) : Optional.empty();
        } catch (IOException | RuntimeException e) {
            log.debug("revert 재생(eth_call) 실패 to={} block={}", to, blockNumber, e);
            return Optional.empty();
        }
    }

    /**
     * {@code error.data} 원문. web3j 4.9.8 은 이 필드를 {@code KeepAsJsonDeserialzier}로 읽어
     * JSON 문자열을 <b>따옴표째</b>({@code "0x2630f88b…"}) 준다. 벗기지 않으면 selector 가
     * {@code 0x"0x2630f}로 잘려 매핑·서버 결함 알림·{@code GrantRefUsed} 동기화가 전부 빗나간다
     * (2026-09-17 dev 공연 6). 객체 등 문자열이 아닌 data 는 그대로 둔다.
     */
    private static String errorData(Response.Error error) {
        String data = error.getData();
        return data != null && data.length() >= 2 && data.startsWith("\"") && data.endsWith("\"")
                ? data.substring(1, data.length() - 1)
                : data;
    }

    /**
     * RPC 오류 → 규격 코드. <b>새 코드를 만들지 않는다</b>(API v6 §16.1이 신설 제안을
     * "본문 미사용"으로 고정). 매칭은 노드 메시지 문자열이라 취약하므로 기본값이 있다.
     */
    private BusinessException translate(Response.Error error) {
        String message = error.getMessage() == null ? "" : error.getMessage().toLowerCase(Locale.ROOT);
        log.warn("RPC 거절 code={} message={}", error.getCode(), error.getMessage());
        if (message.contains("insufficient funds") || message.contains("not enough")) {
            // 운영지갑 KAIA 부족. 알림 대상이다(API v6 §0.4 실패 표).
            return ErrorCode.CHAIN_GAS_INSUFFICIENT.toException();
        }
        if (message.contains("nonce")) {
            return ErrorCode.CHAIN_NONCE_CONFLICT.toException();
        }
        if (message.contains("known transaction") || message.contains("already known")) {
            // 같은 tx 재전송. 멱등하게 성공으로 볼 수도 있으나 호출부가 판단하도록 충돌로 올린다.
            return ErrorCode.COMMON_CONFLICT.toException();
        }
        return ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR.toException();
    }
}
