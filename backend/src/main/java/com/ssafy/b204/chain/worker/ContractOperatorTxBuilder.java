package com.ssafy.b204.chain.worker;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.config.ChainClientConfig;
import com.ssafy.b204.chain.contract.YoYo;
import com.ssafy.b204.chain.contract.RevenueSplitter;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.service.ShowCreationService;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.refund.repository.RefundRepository;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.DynamicArray;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint16;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.abi.datatypes.generated.Uint8;
import org.web3j.crypto.Hash;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.crypto.RawTransaction;
import org.web3j.crypto.TransactionEncoder;
import org.web3j.utils.Numeric;

/**
 * OPERATOR job → 서명된 raw tx (컨트랙트 인터페이스 v1 · ABI {@code blockchain/deployments/abi}).
 *
 * <p><b>운영자 tx는 대납이 아니다.</b> OPERATOR·MINTER 지갑이 자기 KAIA로 가스를 내므로 표준
 * legacy tx({@link RawTransaction})로 만들고 {@link TransactionEncoder#signMessage}로 서명한다.
 * Kaia 타입({@code TxTypeFeeDelegated*})은 사용자 서명 경로 전용이다 — 운영자 tx에 쓰면 노드가
 * 대납 서명을 기다리다 거절한다.
 *
 * <p>calldata는 web3j 래퍼의 {@code FUNC_*} 상수 + {@link FunctionEncoder}로 만든다. 래퍼의
 * {@code RemoteFunctionCall}은 전송까지 해버리므로 쓰지 않는다(전송은 워커가 한다 — 그래야
 * "보냈는데 PENDING"이 안 생긴다).
 *
 * <p><b>인자를 지어내지 않는다.</b> DB에서 인자를 못 구하는 유형은 {@link #supports}가
 * {@code false}이고, 필요한 값이 비어 있으면 {@code COMMON_INTERNAL_ERROR}로 명시적으로 실패한다
 * (조용히 잘못된 tx를 보내는 것보다 낫다).
 */
@Component
@Slf4j
public class ContractOperatorTxBuilder implements OperatorTxBuilder {

    /**
     * 서명 지갑이 서버에 있고 인자를 DB에서 전부 구할 수 있는 유형.
     *
     * <p>빠진 것 — {@code APPROVE}·{@code PURCHASE}·{@code DEPOSIT}·{@code AGREE}는 사용자 서명
     * (USER job)이라 여기 오지 않고, {@code DEPOSIT_FORFEIT}는 P1 예약값이라 이 job을 만드는
     * 경로가 없다.
     */
    private static final Set<ChainJob.TxType> SUPPORTED = EnumSet.of(
            ChainJob.TxType.MINT, ChainJob.TxType.CREATE_SHOW, ChainJob.TxType.START_SALE,
            ChainJob.TxType.UPDATE_RULES, ChainJob.TxType.LOCK, ChainJob.TxType.AGGREGATE,
            ChainJob.TxType.RELEASE, ChainJob.TxType.HALT, ChainJob.TxType.DEPOSIT_RETURN,
            ChainJob.TxType.REFUND);

    /** 운영자 tx는 전부 반환값이 없다({@code lock}·{@code mint}…). */
    private static final List<TypeReference<?>> NO_OUTPUT = List.of();

    /** {@code eth_estimateGas} 실패 시 상한. 초과분은 쓰지 않은 만큼 돌려받는다. */
    private static final BigInteger MINT_GAS_CAP = BigInteger.valueOf(120_000);
    private static final BigInteger SPLITTER_GAS_CAP = BigInteger.valueOf(300_000);

    /** {@code createShow}는 팀 수만큼 배열 슬롯을 새로 쓴다 — 다른 splitter 호출보다 비싸다. */
    private static final BigInteger CREATE_SHOW_GAS_CAP = BigInteger.valueOf(800_000);

    /** estimate에 붙이는 여유. 정산 release는 팀 수만큼 transfer가 돌아 추정이 빡빡할 수 있다. */
    private static final BigInteger GAS_BUFFER_NUMERATOR = BigInteger.valueOf(12);
    private static final BigInteger GAS_BUFFER_DENOMINATOR = BigInteger.TEN;

    private final KaiaChainClient chainClient;
    private final ChainProperties chainProperties;
    private final WalletRepository walletRepository;
    private final PerformanceRepository performanceRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final SettlementRuleRepository settlementRuleRepository;
    private final SettlementRepository settlementRepository;
    private final RefundRepository refundRepository;
    private final ObjectProvider<KaiaCredentials> operatorCredentials;
    private final ObjectProvider<KaiaCredentials> minterCredentials;

    // @Qualifier 를 생성자 파라미터에 직접 붙인다 — lombok.config 가 없어 @RequiredArgsConstructor
    // 는 필드의 @Qualifier 를 복사하지 않고, 그러면 두 KaiaCredentials 빈이 섞인다.
    public ContractOperatorTxBuilder(KaiaChainClient chainClient,
                                     ChainProperties chainProperties,
                                     WalletRepository walletRepository,
                                     PerformanceRepository performanceRepository,
                                     PerformanceParticipantRepository participantRepository,
                                     SettlementRuleRepository settlementRuleRepository,
                                     SettlementRepository settlementRepository,
                                     RefundRepository refundRepository,
                                     @Qualifier(ChainClientConfig.OPERATOR_CREDENTIALS)
                                     ObjectProvider<KaiaCredentials> operatorCredentials,
                                     @Qualifier(ChainClientConfig.MINTER_CREDENTIALS)
                                     ObjectProvider<KaiaCredentials> minterCredentials) {
        this.chainClient = chainClient;
        this.chainProperties = chainProperties;
        this.walletRepository = walletRepository;
        this.performanceRepository = performanceRepository;
        this.participantRepository = participantRepository;
        this.settlementRuleRepository = settlementRuleRepository;
        this.settlementRepository = settlementRepository;
        this.refundRepository = refundRepository;
        this.operatorCredentials = operatorCredentials;
        this.minterCredentials = minterCredentials;
    }

    @Override
    public boolean supports(ChainJob.TxType txType) {
        return txType != null && SUPPORTED.contains(txType);
    }

    @Override
    public String buildSignedTx(ChainJob job) {
        ChainJob.TxType txType = job.getTxType();
        if (!supports(txType)) {
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        boolean mint = txType == ChainJob.TxType.MINT;
        KaiaCredentials signer = required(mint ? minterCredentials : operatorCredentials);
        ChainProperties.Contract contract = required(chainProperties.contract());
        String to = required(mint ? contract.yoyoAddress() : contract.splitterAddress());

        String data = FunctionEncoder.encode(function(job));
        BigInteger gasLimit = gasLimit(signer.getAddress(), to, data, gasCap(txType));
        RawTransaction raw = RawTransaction.createTransaction(
                chainClient.pendingNonce(signer.getAddress()),
                chainClient.gasPrice(),
                gasLimit,
                to,
                data);
        // 개인키는 여기서 밖으로 나가지 않는다 — 서명 결과만 반환하고 로그에도 주소만 남긴다.
        byte[] signed = TransactionEncoder.signMessage(raw, chainProperties.chainId(),
                signer.convertToCredentials());
        log.info("chain_job {} 서명 완료 type={} signer={} to={} gasLimit={}",
                job.getChainJobId(), txType, signer.getAddress(), to, gasLimit);
        return Numeric.toHexString(signed);
    }

    /** 유형 → 컨트랙트 함수 호출. 인자 출처는 전부 DB다(§13 표). */
    private Function function(ChainJob job) {
        return switch (job.getTxType()) {
            case MINT -> new Function(YoYo.FUNC_MINT, List.<Type>of(
                    new Address(160, mintTarget(job)),
                    new Uint256(amount(job)),
                    new Bytes32(grantRef(job))), NO_OUTPUT);
            case CREATE_SHOW -> createShowCall(job);
            case UPDATE_RULES -> updateRulesCall(job);
            // START_SALE(API-rule-04)과 LOCK(API-settlement-03)은 v6에서 ENUM 값이 갈렸다.
            // 종전에는 둘 다 LOCK 이라 멱등키 접두로 갈랐고, 보낸 tx 와 확정 기대 이벤트가
            // 어긋나는 사고를 냈다.
            case START_SALE -> showIdCall(RevenueSplitter.FUNC_STARTSALE, job);
            case LOCK -> showIdCall(RevenueSplitter.FUNC_LOCK, job);
            case RELEASE -> showIdCall(RevenueSplitter.FUNC_RELEASE, job);
            case HALT -> showIdCall(RevenueSplitter.FUNC_HALT, job);
            case DEPOSIT_RETURN -> showIdCall(RevenueSplitter.FUNC_RETURNDEPOSIT, job);
            case AGGREGATE -> new Function(RevenueSplitter.FUNC_AGGREGATE, List.<Type>of(
                    new Uint256(showId(job)),
                    new Uint256(BigInteger.valueOf(validTicketCount(job)))), NO_OUTPUT);
            case REFUND -> refundCall(job);
            default -> throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        };
    }

    private Function showIdCall(String func, ChainJob job) {
        return new Function(func, List.<Type>of(new Uint256(showId(job))), NO_OUTPUT);
    }

    /** {@code refund(showId, orderRef, refundAmount)} — 인자는 refund + ticket_order에서 온다. */
    private Function refundCall(ChainJob job) {
        Refund refund = refundRepository.findByChainJobId(job.getChainJobId())
                .orElseThrow(ErrorCode.COMMON_INTERNAL_ERROR::toException);
        byte[] orderRef = Numeric.hexStringToByteArray(
                required(refund.getTicketOrder().getOrderRef()));
        if (orderRef.length != 32) {
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return new Function(RevenueSplitter.FUNC_REFUND, List.<Type>of(
                new Uint256(showId(job)),
                new Bytes32(orderRef),
                new Uint256(BigInteger.valueOf(positive(refund.getRefundAmount())))), NO_OUTPUT);
    }

    // ------------------------------------------------------------------ 인자 조회

    /**
     * 온체인 공연 식별자. <b>{@code showId = performance_id}</b>다(컨트랙트 인터페이스 v1 §4.8).
     *
     * <p>{@code on_chain_id}는 {@code ShowCreated} 확정 시 서버가 되채우는 <b>사본</b>이고 값도
     * {@code performance_id}와 같다. 그것을 강제하면 순환이 된다 — {@code on_chain_id}를 채우는
     * 유일한 자리가 체인 job 확정이라, 그 job 자신이 자기 확정 결과를 선행 조건으로 요구하게 되어
     * 최초 build 가 반드시 실패하고 3회 재시도 뒤 {@code FAILED}가 된다(S15P21B204-67).
     * 그래서 <b>있으면 그것을, 없으면 {@code performance_id}를</b> 쓴다.
     */
    private BigInteger showId(ChainJob job) {
        return BigInteger.valueOf(showIdOf(performance(job)));
    }

    private static long showIdOf(Performance performance) {
        return performance.onChainShowId();
    }

    private Performance performance(ChainJob job) {
        return performanceRepository.findById(required(job.getTargetPerformanceId()))
                .orElseThrow(ErrorCode.COMMON_INTERNAL_ERROR::toException);
    }

    /**
     * {@code createShow(showId, teamWallets, hostTeamIndex, rulesHash, fixedRatioBp,
     * selectionRatioBp, teamShareBp, depositAmount)} — 컨트랙트 인터페이스 v1 §4.1.
     *
     * <p><b>배열 순서는 {@code performance_participant.on_chain_index}가 정본이다.</b> 그 값을
     * 굳히는 자리는 {@code ShowCreationService}이고(job 생성 시점), 여기서는 읽기만 한다 —
     * 워커가 재시도할 때마다 순서가 흔들리면 {@code teamIndex}로 기록된 주문·정산이 전부 어긋난다.
     */
    private Function createShowCall(ChainJob job) {
        Performance performance = performance(job);
        SettlementRule rule = rule(performance);
        TeamArrays teams = teamArrays(performance);

        return new Function(RevenueSplitter.FUNC_CREATESHOW, List.<Type>of(
                new Uint256(BigInteger.valueOf(showIdOf(performance))),
                new DynamicArray<>(Address.class, teams.wallets()),
                new Uint8(BigInteger.valueOf(teams.hostTeamIndex())),
                new Bytes32(rulesHash(rule)),
                new Uint16(BigInteger.valueOf(required(rule.getFixedRatioBp()))),
                new Uint16(BigInteger.valueOf(required(rule.getSelectionRatioBp()))),
                new DynamicArray<>(Uint16.class, teams.shares()),
                new Uint256(BigInteger.valueOf(positive(performance.getDepositAmount())))),
                NO_OUTPUT);
    }

    /**
     * {@code updateRules(showId, rulesHash, fixedRatioBp, selectionRatioBp, teamShareBp)} —
     * 컨트랙트 인터페이스 v1 §4.8 (S15P21B204-70).
     *
     * <p>인자 출처는 {@code createShow}와 <b>같다</b>({@code settlement_rule} +
     * {@code performance_participant}). 팀 구성은 바꿀 수 없으므로({@code teamWallets}는
     * {@code createShow} 이후 불변) 배열은 비율만 나른다 — 그래서 {@link #teamArrays}를 그대로
     * 재사용한다. <b>순서가 {@code createShow}와 다르면 컨트랙트가 엉뚱한 팀에 비율을 준다</b>
     * (컨트랙트는 배열 위치로만 팀을 안다).
     *
     * <p><b>겨냥한 해시가 현재 규칙과 다르면 보내지 않는다.</b> 이 job 이 큐에 있는 동안 규칙이
     * 또 저장된 경우다. 해시는 job 에서, 비율은 DB 에서 가져오면 <b>서로 다른 규칙이 섞인 tx</b>가
     * 되어 온체인 해시와 온체인 비율이 어긋난다(팀이 서명한 해시가 실제 분배와 달라진다 —
     * 이 프로젝트의 신뢰 장치가 조용히 무너지는 자리다). 뒤이은 job 이 현재 규칙을 온전히
     * 보내므로 여기서 멈추는 쪽이 옳다.
     */
    private Function updateRulesCall(ChainJob job) {
        Performance performance = performance(job);
        SettlementRule rule = rule(performance);
        String targetRulesHash = ShowCreationService.targetRulesHash(job);
        if (targetRulesHash == null
                || !targetRulesHash.equalsIgnoreCase(required(rule.getRulesHash()))) {
            throw ErrorCode.RULE_HASH_MISMATCH.toException();
        }

        return new Function(RevenueSplitter.FUNC_UPDATERULES, List.<Type>of(
                new Uint256(BigInteger.valueOf(showIdOf(performance))),
                new Bytes32(rulesHash(rule)),
                new Uint16(BigInteger.valueOf(required(rule.getFixedRatioBp()))),
                new Uint16(BigInteger.valueOf(required(rule.getSelectionRatioBp()))),
                new DynamicArray<>(Uint16.class, teamArrays(performance).shares())),
                NO_OUTPUT);
    }

    /** {@code teamWallets}·{@code teamShareBp}와 {@code hostTeamIndex} — 배열 위치가 곧 팀이다. */
    private record TeamArrays(List<Address> wallets, List<Uint16> shares, int hostTeamIndex) {}

    /**
     * 온체인 배열을 {@code on_chain_index} 순서로 만든다. <b>{@code createShow}와
     * {@code updateRules}가 이 하나를 쓴다</b> — 두 곳에서 따로 만들면 나중에 보내는 쪽이 다른
     * 팀에 비율을 줄 수 있고, 그 사고는 정산 때까지 드러나지 않는다.
     */
    private TeamArrays teamArrays(Performance performance) {
        List<PerformanceParticipant> ordered = orderedParticipants(performance.getPerformanceId());
        List<Address> wallets = new ArrayList<>();
        List<Uint16> shares = new ArrayList<>();
        int hostTeamIndex = -1;
        Long hostTeamId = required(performance.getCreatorTeam()).getTeamId();
        for (int index = 0; index < ordered.size(); index++) {
            PerformanceParticipant participant = ordered.get(index);
            // 인덱스가 배열 위치와 다르면 굳힌 값과 보내는 값이 갈린다 - 그때는 보내지 않는다.
            if (participant.getOnChainIndex() == null || participant.getOnChainIndex() != index) {
                throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
            }
            wallets.add(new Address(160, required(participant.getWalletAddress())));
            shares.add(new Uint16(BigInteger.valueOf(required(participant.getTeamShareBp()))));
            if (hostTeamId.equals(participant.getTeam().getTeamId())) {
                hostTeamIndex = index;
            }
        }
        if (wallets.isEmpty() || hostTeamIndex < 0) {
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return new TeamArrays(wallets, shares, hostTeamIndex);
    }

    private SettlementRule rule(Performance performance) {
        return settlementRuleRepository
                .findByPerformance_PerformanceId(performance.getPerformanceId())
                .orElseThrow(ErrorCode.COMMON_INTERNAL_ERROR::toException);
    }

    private static byte[] rulesHash(SettlementRule rule) {
        byte[] rulesHash = Numeric.hexStringToByteArray(required(rule.getRulesHash()));
        if (rulesHash.length != 32) {
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return rulesHash;
    }

    /**
     * {@code on_chain_index} 오름차순 참여팀. 조건은 {@link ShowCreationService#onChainOrder}
     * 하나뿐이다 — 여기서 다시 적으면 <b>보내는 배열과 확정 때 대조하는 배열이 갈린다</b>.
     */
    private List<PerformanceParticipant> orderedParticipants(Long performanceId) {
        return ShowCreationService.onChainOrder(participantRepository
                .findByPerformance_PerformanceIdAndStatus(performanceId,
                        PerformanceParticipant.Status.REGISTERED));
    }

    private int validTicketCount(ChainJob job) {
        Settlement settlement = settlementRepository
                .findByPerformance_PerformanceId(required(job.getTargetPerformanceId()))
                .orElseThrow(ErrorCode.COMMON_INTERNAL_ERROR::toException);
        Integer count = settlement.getValidTicketCount();
        if (count == null || count < 0) {
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return count;
    }

    private String mintTarget(ChainJob job) {
        return walletRepository.findById(required(job.getWalletId()))
                .map(wallet -> required(wallet.getAddress()))
                .orElseThrow(ErrorCode.COMMON_INTERNAL_ERROR::toException);
    }

    private BigInteger amount(ChainJob job) {
        // YoYo decimals = 0. 1 YoYo = ₩1 이므로 스케일링하지 않는다(인터페이스 v1 §2).
        return BigInteger.valueOf(positive(job.getAmount()));
    }

    /**
     * {@code grantRef = keccak256(chain_job.idempotency_key)} — 인터페이스 v1 §2.4.
     *
     * <p>같은 멱등키로 두 번 mint하면 컨트랙트가 {@code GrantRefUsed}로 revert 한다. 재시도해도
     * 값이 바뀌지 않아야 하므로 <b>job의 멱등키만</b> 재료로 쓴다(시각·nonce를 섞지 않는다).
     */
    private byte[] grantRef(ChainJob job) {
        return Hash.sha3(required(job.getIdempotencyKey()).getBytes(StandardCharsets.UTF_8));
    }

    // ------------------------------------------------------------------ 가스

    private static BigInteger gasCap(ChainJob.TxType txType) {
        return switch (txType) {
            case MINT -> MINT_GAS_CAP;
            // updateRules 도 팀 수만큼 배열 슬롯을 다시 쓴다 - createShow 와 같은 상한을 준다.
            case CREATE_SHOW, UPDATE_RULES -> CREATE_SHOW_GAS_CAP;
            default -> SPLITTER_GAS_CAP;
        };
    }

    private BigInteger gasLimit(String from, String to, String data, BigInteger cap) {
        return chainClient.estimateGas(from, to, data)
                .map(estimate -> estimate.multiply(GAS_BUFFER_NUMERATOR).divide(GAS_BUFFER_DENOMINATOR))
                .orElse(cap);
    }

    // ------------------------------------------------------------------ 검증 헬퍼

    private KaiaCredentials required(ObjectProvider<KaiaCredentials> provider) {
        KaiaCredentials credentials = provider.getIfAvailable();
        if (credentials == null) {
            // 키 없이 워커가 여기까지 왔다 = 설정 분기 누락. 사용자 문구는 규격 기본값.
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return credentials;
    }

    private static <T> T required(T value) {
        if (value == null || (value instanceof String s && s.isBlank())) {
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return value;
    }

    private static long positive(Long value) {
        if (value == null || value <= 0) {
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return value;
    }
}
