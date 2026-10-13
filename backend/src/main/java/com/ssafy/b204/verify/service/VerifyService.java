package com.ssafy.b204.verify.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.service.ChainJobService;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.rule.entity.RuleAgreement;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.entity.SettlementShare;
import com.ssafy.b204.settlement.service.SettlementCalculator;
import com.ssafy.b204.settlement.service.SettlementReconciler;
import com.ssafy.b204.settlement.service.SettlementTeams;
import com.ssafy.b204.settlement.service.SettlementTime;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.verify.dto.VerifyDtos.Agreement;
import com.ssafy.b204.verify.dto.VerifyDtos.Contracts;
import com.ssafy.b204.verify.dto.VerifyDtos.DepositReconciliation;
import com.ssafy.b204.verify.dto.VerifyDtos.EscrowReconciliation;
import com.ssafy.b204.verify.dto.VerifyDtos.Guarantees;
import com.ssafy.b204.verify.dto.VerifyDtos.LockedRule;
import com.ssafy.b204.verify.dto.VerifyDtos.LockedRuleRaw;
import com.ssafy.b204.verify.dto.VerifyDtos.OnchainCounter;
import com.ssafy.b204.verify.dto.VerifyDtos.RecalculationInput;
import com.ssafy.b204.verify.dto.VerifyDtos.ReceiptItem;
import com.ssafy.b204.verify.dto.VerifyDtos.ReleaseReconciliation;
import com.ssafy.b204.verify.dto.VerifyDtos.ReleaseTx;
import com.ssafy.b204.verify.dto.VerifyDtos.ReleasedEvent;
import com.ssafy.b204.verify.dto.VerifyDtos.Share;
import com.ssafy.b204.verify.dto.VerifyDtos.TeamShare;
import com.ssafy.b204.verify.dto.VerifyDtos.VerificationResponse;
import com.ssafy.b204.verify.service.VerifyLedger.TeamLedger;
import com.ssafy.b204.verify.service.VerifySnapshotLoader.Snapshot;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

/**
 * verify 도메인 서비스 — API v6 §12(API-verify-01).
 *
 * <p><b>이 API의 값은 "재현 가능성"에 있다.</b> 서버가 "맞습니다"라고 말하는 것이 아니라, 브라우저가
 * 스스로 계산해 같은 답이 나오는지 보게 하는 것이 목적이다. 그래서 네 가지를 지킨다.
 *
 * <ul>
 *   <li><b>온체인 값은 컨트랙트에서 직접 읽는다.</b> {@code onchainRulesHash}·{@code onchainAgreed}·
 *       {@code choiceCount}·{@code escrowBalanceOnchain}·{@code releasedEvents}가 그것이다. DB
 *       사본으로 채우면 대조할 두 값이 같은 출처가 되어 <b>거짓 검증</b>이 된다.
 *   <li><b>못 읽으면 못 읽었다고 한다.</b> 노드 실패 시 마지막 캐시 + {@code stale:true}, 캐시도
 *       없으면 502({@code COMMON_EXTERNAL_SERVICE_ERROR}). 판정할 수 없으면 {@code matched}는
 *       {@code false}가 아니라 <b>필드 없음</b>이다.
 *   <li><b>팀 순서를 믿지 않고 확인한다.</b> 온체인 배열의 {@code i}번이 서버의 {@code i}번 팀과
 *       같은지 {@code teamWalletsOf}·{@code hostTeamIndexOf}로 대조한다({@link #checkTeamOrder}).
 *       어긋나면 <b>금액은 맞는데 팀이 바뀐다</b> — 합계 검산으로는 잡히지 않는 사고라, 팀별 온체인
 *       값을 전부 판정 없음으로 낮춘다.
 *   <li><b>계산기를 새로 만들지 않는다.</b> {@link SettlementCalculator}는 컨트랙트·TypeScript
 *       calcSpec과 6벡터 일치가 검증된 구현이다.
 * </ul>
 *
 * <p><b>60초 캐시</b>(공연 단위). {@code coin}의 {@code SupplyReconciler}와 같은 방식·같은 TTL이다.
 * DB는 {@link VerifySnapshotLoader}가 트랜잭션 안에서 한 번에 뜨고, <b>체인 호출·조립은 트랜잭션
 * 밖</b>에서 한다 — eth_call을 기다리는 동안 DB 커넥션을 쥐고 있지 않기 위해서다.
 */
@Slf4j
@Service
public class VerifyService {

    /** API v6 §12 "60초 캐시" [권]. coin {@code SupplyReconciler.CACHE_TTL}과 같은 값이다. */
    static final Duration CACHE_TTL = Duration.ofMinutes(1);

    private static final String TOKEN_SYMBOL = "YoYo";
    private static final int TOKEN_DECIMALS = 0;
    private static final String CURRENCY = "KRW";
    private static final String ROUNDING_RULE = "FLOOR_TO_INTEGER_KRW";
    private static final String REMAINDER_RULE = "ASSIGN_DUST_TO_HOST_TEAM";
    private static final String ESCROW_NOTE = "escrowOf(showId) = Σpurchase − Σrefund − Σrelease";

    /**
     * 팀 순서 대조가 깨졌을 때 {@code escrowReconciliation.note}에 덧붙이는 문장.
     *
     * <p>응답에 새 필드를 만들지 않는다(명세 밖). 이미 있는 {@code note}가 "이 숫자를 어떻게 읽어야
     * 하는가"를 적는 자리이므로 여기에 싣고, 원인 상세는 로그에 남긴다.
     */
    private static final String TEAM_ORDER_NOTE =
            " · ⚠ 온체인 팀 배열과 서버 참여팀 순서가 일치하지 않아 팀별 온체인 값(선택 수·지급액·동의)은"
                    + " 판정하지 않았습니다. 공연 전체 합계만 유효합니다.";

    /** API v6 §12 200 예시 문구 그대로. 화면이 이 문장을 그대로 보여준다. */
    private static final Guarantees GUARANTEES = new Guarantees(
            List.of("잠긴 규칙의 사후 변조 불가",
                    "기록의 소급 수정 불가",
                    "분배 계산의 결정론적 재현",
                    "참여팀의 독립 검증 경로",
                    "결제·환불·분배가 모두 같은 원장(YoYo) 위에 있음"),
            List.of("입력 데이터(선택·매출)의 진실성",
                    "탈중앙 운영 — 정산 흐름은 운영자가 발의·실행한다"));

    private static final String SIMULATION_NOTICE =
            "테스트넷에서 플랫폼이 발행한 시연용 가상 원화 코인으로 정산했습니다. 실제 자금이 아닙니다.";

    private final VerifySnapshotLoader snapshotLoader;
    private final VerifyChainReader chainReader;
    private final SettlementCalculator calculator;
    private final ChainJobService chainJobService;
    private final ChainProperties chainProperties;
    /** 캐시 만료 판정에만 쓴다 — 테스트가 60초를 실제로 기다리지 않게 하는 유일한 이음매다. */
    private final Clock clock;

    /**
     * 생성자를 직접 적는다. {@code @RequiredArgsConstructor}는 필드의 {@code @Qualifier}를 생성자
     * 파라미터로 <b>복사하지 않아</b>({@code lombok.config} 없음) {@code Clock} 빈이 둘일 때 주입이
     * 어느 쪽으로 갈지 소리 없이 갈린다.
     */
    public VerifyService(VerifySnapshotLoader snapshotLoader,
                         VerifyChainReader chainReader,
                         SettlementCalculator calculator,
                         ChainJobService chainJobService,
                         ChainProperties chainProperties,
                         @Qualifier("verifyClock") Clock clock) {
        this.snapshotLoader = snapshotLoader;
        this.chainReader = chainReader;
        this.calculator = calculator;
        this.chainJobService = chainJobService;
        this.chainProperties = chainProperties;
        this.clock = clock;
    }

    /** 공연 단위 캐시. 응답에 요청자별 값이 없어 참여팀 누구에게나 같은 문서다. */
    private final Map<Long, Cached> cache = new ConcurrentHashMap<>();

    private record Cached(VerificationResponse response, Instant computedAt) {

        boolean isFresh(Instant now) {
            return computedAt.plus(CACHE_TTL).isAfter(now);
        }
    }

    /**
     * API-verify-01 정산 검증 데이터. 권한 PERFORMER(참여팀, 로그인 필수).
     *
     * <p>순서가 곧 명세의 "시스템 처리 1"이다 — 공연 존재 → 검증 대상 상태 → 참여팀 소속 → 캐시.
     * 앞의 셋은 {@link VerifySnapshotLoader#load}가 트랜잭션 안에서 끝낸다. <b>권한 검사가 캐시보다
     * 먼저다</b> — 캐시가 앞서면 남의 공연 검증 데이터가 캐시 적중으로 새어 나간다.
     *
     * <p>이 메서드에 {@code @Transactional}이 없는 것은 의도다. 아래 {@link #compute}가 공용 RPC를
     * 여러 번 부르는데, 그 시간 동안 DB 커넥션을 쥐고 있을 이유가 없다.
     */
    public VerificationResponse verification(MemberPrincipal me, Long performanceId) {
        Snapshot snapshot = snapshotLoader.load(me, performanceId);

        Instant now = clock.instant();
        Cached cached = cache.get(performanceId);
        if (cached != null && cached.isFresh(now)) {
            return cached.response();
        }

        VerificationResponse fresh = compute(snapshot);
        if (fresh == null) {
            if (cached != null) {
                // 노드가 죽었다 — 마지막으로 읽은 값을 주되 "지금 읽은 값이 아니다"를 명시한다.
                log.warn("체인 조회 불가 — 캐시된 검증 데이터를 stale 로 내려준다. performanceId={}",
                        performanceId);
                return cached.response().asStale();
            }
            throw ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR.toException();
        }
        cache.put(performanceId, new Cached(fresh, now));
        return fresh;
    }

    /** 값이 바뀐 것이 확실한 시점에 캐시를 버린다. 테스트도 쓴다. */
    public void invalidate(Long performanceId) {
        cache.remove(performanceId);
    }

    /** 전체 무효화. */
    public void invalidateAll() {
        cache.clear();
    }

    // ------------------------------------------------------------------ 조립

    /**
     * 검증 문서를 만든다. <b>온체인 핵심 3종을 읽지 못하면 {@code null}</b> — 호출부가 캐시·502로
     * 처리한다. 트랜잭션 밖에서 돌므로 스냅샷에 없는 DB 값을 여기서 읽지 않는다.
     */
    private VerificationResponse compute(Snapshot snapshot) {
        Performance performance = snapshot.performance();
        SettlementTeams teams = snapshot.teams();
        Long showId = performance.getOnChainId();
        if (showId == null || !chainReader.isAvailable()) {
            return null;
        }

        Optional<Long> escrow = chainReader.escrowOf(showId);
        Optional<long[]> counts = chainReader.choiceCountsOf(showId);
        Optional<String> onchainRulesHash = chainReader.rulesHashOf(showId);
        if (escrow.isEmpty() || counts.isEmpty() || onchainRulesHash.isEmpty()) {
            // 이 셋 없이는 대사도 재계산도 못 한다. 절반만 읽은 검증 문서를 만들지 않는다.
            return null;
        }
        long[] chainCounts = counts.get();
        long[] payouts = chainReader.payoutsOf(showId).orElse(null);
        Long depositOnchain = chainReader.depositOf(showId).orElse(null);
        TeamOrder order = checkTeamOrder(showId, teams);

        // 부수적인 값 하나라도 못 읽었으면 문서 전체를 stale 로 표시한다 — 어떤 칸이 옛 값인지
        // 필드마다 표시할 자리가 명세에 없으므로, 문서 단위로 정직하게 낮춘다.
        // 팀 순서 불일치는 stale 이 아니다(옛 값이 아니라 배선이 틀린 것) — note 로 알린다.
        boolean degraded = payouts == null || depositOnchain == null || order.unread();

        Settlement settlement = snapshot.settlement();
        SettlementRule rule = snapshot.rule();
        SettlementReconciler.ServerAggregate aggregate = snapshot.aggregate();

        long distributable = distributableOf(settlement, escrow.get());
        // 팀 순서를 못 믿으면 재계산도 못 한다 — chainCounts[i] 를 어느 팀에 줄지가 그 순서다.
        SettlementCalculator.Result recalculated = order.trusted()
                ? recalculate(rule, teams, chainCounts, distributable, snapshot.performanceId())
                : null;

        ChainJob releaseJob = snapshot.lastTx(ChainJob.TxType.RELEASE);
        AgreementBlock agreements = agreements(showId, teams, snapshot, order);
        degraded = degraded || agreements.degraded();

        boolean released = settlement != null
                && settlement.getStatus() == Settlement.Status.RELEASED;
        // release 확정 + payouts 를 읽었고 + 팀 순서를 믿을 수 있을 때만 불변식 3을 판정한다.
        boolean releaseComparable = released && payouts != null && order.trusted();

        return new VerificationResponse(
                snapshot.performanceId(),
                performance.getTitle(),
                SettlementTime.toOffset(performance.getPerformanceAt()),
                settlement == null ? Settlement.Status.NONE.name() : settlement.getStatus().name(),
                chainProperties.networkName(),
                Math.toIntExact(chainProperties.chainId()),
                contracts(),
                lockedRule(performance, rule, teams, onchainRulesHash.get()),
                agreements.items(),
                onchainCounters(teams, chainCounts, snapshot.teamLedgers(), order),
                recalculationInput(performance, rule, teams, chainCounts, aggregate, distributable,
                        recalculated, order),
                shares(teams, recalculated),
                escrowReconciliation(aggregate, escrow.get(), releasedTotal(released, payouts),
                        order),
                releaseReconciliation(teams, payouts, releaseComparable, recalculated),
                depositReconciliation(performance, depositOnchain, snapshot),
                receiptSummary(teams, payouts, releaseComparable, recalculated, settlement,
                        releaseJob, snapshot.sharesByTeam()),
                releaseTx(settlement, releaseJob),
                GUARANTEES,
                SIMULATION_NOTICE,
                SettlementTime.now(),
                degraded);
    }

    // ------------------------------------------------------------------ 팀 순서 대조

    /**
     * 온체인 팀 배열과 서버 참여팀 순서가 같은가.
     *
     * @param trusted {@code i}번이 같은 팀을 가리킨다고 믿을 수 있는가
     * @param unread  대조 자체를 못 했는가(노드 조회 실패). {@code true}면 문서가 stale 이다
     */
    private record TeamOrder(boolean trusted, boolean unread) {

        static TeamOrder ok() {
            return new TeamOrder(true, false);
        }

        static TeamOrder mismatched() {
            return new TeamOrder(false, false);
        }

        static TeamOrder unreadable() {
            return new TeamOrder(false, true);
        }
    }

    /**
     * <b>서버가 매기는 팀 순서는 추측일 수 있다.</b> 정본은 {@code createShow}가 잠근 온체인
     * {@code teamWallets} 배열인데, 서버는 {@code performance_participant.on_chain_index}가 비면
     * 등록 순서(PK)로 잇는다({@link SettlementTeams}). 그 추측이 어긋나면 배열 인덱스가 한 칸씩
     * 밀려 <b>금액은 맞는데 팀이 바뀐다</b> — Σpay = R 검산은 그대로 통과하므로 계산기는 못 잡는다.
     *
     * <p>그래서 지갑 배열을 그대로 받아 서버 순서와 <b>주소 단위로</b> 맞춰 본다. 대소문자는 무시한다
     * (EIP-55 체크섬 표기와 소문자 저장이 섞인다). {@code hostTeamIndexOf}도 dust 귀속처가 같은지
     * 확인한다 — 이쪽이 어긋나면 dust가 다른 팀에 붙는다.
     */
    private TeamOrder checkTeamOrder(long showId, SettlementTeams teams) {
        Optional<List<String>> onchainWallets = chainReader.teamWalletsOf(showId);
        Optional<Integer> onchainHost = chainReader.hostTeamIndexOf(showId);
        if (onchainWallets.isEmpty() || onchainHost.isEmpty()) {
            log.warn("팀 순서 대조 불가 — teamWalletsOf·hostTeamIndexOf 를 읽지 못했다. showId={}",
                    showId);
            return TeamOrder.unreadable();
        }

        List<String> wallets = onchainWallets.get();
        if (wallets.size() != teams.size()) {
            log.error("팀 순서 불일치 — 팀 수가 다르다. showId={} 온체인={} 서버={}",
                    showId, wallets.size(), teams.size());
            return TeamOrder.mismatched();
        }
        for (int i = 0; i < wallets.size(); i++) {
            String server = teams.at(i).getWalletAddress();
            if (server == null || !server.equalsIgnoreCase(wallets.get(i))) {
                // 주소를 로그에 남긴다 — 팀 리더 지갑은 정산 수령 주소라 공개 대상이다(§0.7).
                log.error("팀 순서 불일치 — showId={} teamIndex={} 온체인={} 서버={} (teamId={})",
                        showId, i, wallets.get(i), server, teams.at(i).getTeam().getTeamId());
                return TeamOrder.mismatched();
            }
        }
        if (onchainHost.get() != teams.hostIndex()) {
            log.error("host 팀 인덱스 불일치 — showId={} 온체인={} 서버={}",
                    showId, onchainHost.get(), teams.hostIndex());
            return TeamOrder.mismatched();
        }
        return TeamOrder.ok();
    }

    /**
     * 이미 나간 금액. release 전이면 0, release 후인데 {@code payoutsOf}를 못 읽었으면 {@code null}.
     *
     * <p>삼항 연산자로 한 줄에 쓰지 않는다 — {@code cond ? null : 0L}처럼 {@code Long}과
     * {@code long}을 섞으면 자바가 <b>결과 타입을 {@code long}으로 승격</b>시켜 {@code null}을
     * 언박싱하다 NPE를 낸다. 컴파일러가 잡아 주지 않는 자리라 메서드로 떼어 놓는다.
     */
    private static Long releasedTotal(boolean released, long[] payouts) {
        if (!released) {
            return 0L;
        }
        return payouts == null ? null : sum(payouts);
    }

    /**
     * R — 재계산의 분모가 아니라 <b>분배 대상 총액</b>이다.
     *
     * <p>집계 확정 시점에 {@code settlement.total_revenue}로 얼린 값을 우선한다. release가 끝나면
     * 온체인 {@code escrowOf}는 0이 되므로 그 값을 R로 쓰면 <b>재계산이 전부 0</b>이 되어 검증이
     * 무너진다. 아직 확정 전이면 지금의 에스크로가 곧 R이다.
     */
    private static long distributableOf(Settlement settlement, long escrowOnchain) {
        return settlement != null && settlement.getTotalRevenue() != null
                ? settlement.getTotalRevenue() : escrowOnchain;
    }

    /**
     * 잠긴 규칙 × 온체인 카운터로 다시 계산한다. 규칙이 없거나 형태가 깨져 있으면 {@code null} —
     * <b>지어내지 않는다.</b>
     */
    private SettlementCalculator.Result recalculate(SettlementRule rule, SettlementTeams teams,
                                                    long[] chainCounts, long distributable,
                                                    Long performanceId) {
        if (rule == null || chainCounts.length != teams.size()) {
            return null;
        }
        try {
            return calculator.calculate(distributable, rule.getFixedRatioBp(),
                    rule.getSelectionRatioBp(), teams.teamShareBp(), chainCounts,
                    teams.hostIndex());
        } catch (RuntimeException e) {
            // 규칙 형태가 깨진 상태는 그 자체가 검증 결과다. 500으로 만들지 않고 판정 없음으로 둔다.
            log.warn("검증 재계산 실패 — performanceId={}: {}", performanceId, e.toString());
            return null;
        }
    }

    private Contracts contracts() {
        ChainProperties.Contract contract = chainProperties.contract();
        return new Contracts(
                contract == null ? null : contract.yoyoAddress(),
                TOKEN_SYMBOL,
                TOKEN_DECIMALS,
                contract == null ? null : contract.splitterAddress(),
                chainProperties.explorerBaseUrl());
    }

    private static LockedRule lockedRule(Performance performance, SettlementRule rule,
                                         SettlementTeams teams, String onchainRulesHash) {
        String rulesHash = rule == null ? null : rule.getRulesHash();
        return new LockedRule(
                rulesHash,
                new LockedRuleRaw(
                        performance.getPerformanceId(),
                        rule == null ? null : rule.getFixedRatioBp(),
                        rule == null ? null : rule.getSelectionRatioBp(),
                        teamShares(teams),
                        performance.getCreatorTeam().getTeamId()),
                onchainRulesHash,
                // 둘 중 하나라도 없으면 false. "모르겠다"를 "맞다"로 내리지 않는다.
                rulesHash != null && rulesHash.equalsIgnoreCase(onchainRulesHash),
                rule == null ? null : SettlementTime.toOffset(rule.getLockedAt()),
                rule == null ? null : rule.getLockTxHash());
    }

    private static List<TeamShare> teamShares(SettlementTeams teams) {
        List<TeamShare> shares = new ArrayList<>(teams.size());
        for (PerformanceParticipant participant : teams.ordered()) {
            shares.add(new TeamShare(participant.getTeam().getTeamId(),
                    participant.getTeamShareBp()));
        }
        return List.copyOf(shares);
    }

    /** 동의 블록 + "온체인 동의 여부를 못 읽은 팀이 있었는가". */
    private record AgreementBlock(List<Agreement> items, boolean degraded) {}

    /**
     * 팀별 동의 증거.
     *
     * <p>{@code agreedOf}는 인덱스가 아니라 <b>지갑 주소</b>로 묻는다. 그런데 팀 순서 대조가 깨졌다는
     * 것은 서버가 아는 지갑이 이 공연의 팀 지갑이 아닐 수 있다는 뜻이고, 그 주소로 물으면 컨트랙트는
     * 조용히 {@code false}를 준다 — <b>동의한 팀이 "미동의"로 보인다.</b> 그래서 순서를 못 믿을 때는
     * 묻지 않고 판정 없음({@code null})으로 둔다.
     */
    private AgreementBlock agreements(long showId, SettlementTeams teams, Snapshot snapshot,
                                      TeamOrder order) {
        List<ChainJob> agreeJobs = snapshot.confirmedTx().get(ChainJob.TxType.AGREE);
        Map<Long, ChainJob> jobByTeam = new HashMap<>();
        if (agreeJobs != null) {
            for (ChainJob job : agreeJobs) {
                if (job.getTargetTeamId() != null) {
                    jobByTeam.put(job.getTargetTeamId(), job);
                }
            }
        }

        boolean degraded = false;
        List<Agreement> items = new ArrayList<>(teams.size());
        for (PerformanceParticipant participant : teams.ordered()) {
            Team team = participant.getTeam();
            RuleAgreement agreement = snapshot.agreementsByTeam().get(team.getTeamId());
            ChainJob job = jobByTeam.get(team.getTeamId());
            String wallet = participant.getWalletAddress();

            Boolean onchainAgreed = null;
            if (order.trusted()) {
                Optional<Boolean> onchain = chainReader.agreedOf(showId, wallet);
                if (onchain.isEmpty()) {
                    degraded = true;
                }
                onchainAgreed = onchain.orElse(null);
            }
            String txHash = agreement != null && agreement.getAgreeTxHash() != null
                    ? agreement.getAgreeTxHash() : (job == null ? null : job.getTxHash());
            LocalDateTime agreedAt = agreement != null && agreement.getAgreedAt() != null
                    ? agreement.getAgreedAt() : (job == null ? null : job.getConfirmedAt());

            items.add(new Agreement(team.getTeamId(), team.getName(), wallet, onchainAgreed,
                    // 서명 주체는 chain_job 이 유일한 근거다. 근거가 없으면 비운다.
                    job == null ? null : job.getSignerType().name(),
                    txHash, SettlementTime.toOffset(agreedAt)));
        }
        return new AgreementBlock(List.copyOf(items), degraded);
    }

    /**
     * 팀별 카운터. 팀 순서를 못 믿으면 {@code choiceCount}가 판정 없음({@code null})이다 — 장부
     * 관측값(결제·환불)은 팀 id로 세므로 온체인 순서와 무관하게 그대로 준다.
     */
    private static List<OnchainCounter> onchainCounters(SettlementTeams teams, long[] chainCounts,
                                                        Map<Long, TeamLedger> ledgerByTeam,
                                                        TeamOrder order) {
        List<OnchainCounter> counters = new ArrayList<>(teams.size());
        for (int i = 0; i < teams.size(); i++) {
            Long teamId = teams.at(i).getTeam().getTeamId();
            TeamLedger teamLedger = ledgerByTeam.getOrDefault(teamId, VerifyLedger.emptyLedger());
            Long choiceCount = order.trusted() && i < chainCounts.length ? chainCounts[i] : null;
            counters.add(new OnchainCounter(teamId, i, choiceCount,
                    teamLedger.purchaseCount(), teamLedger.refundCount(),
                    teamLedger.refundedAmount()));
        }
        return List.copyOf(counters);
    }

    private static RecalculationInput recalculationInput(
            Performance performance, SettlementRule rule, SettlementTeams teams, long[] chainCounts,
            SettlementReconciler.ServerAggregate aggregate, long distributable,
            SettlementCalculator.Result recalculated, TeamOrder order) {
        return new RecalculationInput(
                aggregate.grossRevenue(),
                aggregate.refundedAmount(),
                aggregate.netRevenue(),
                distributable,
                rule == null ? null : rule.getFixedRatioBp(),
                rule == null ? null : rule.getSelectionRatioBp(),
                teamShares(teams),
                teams.size(),
                // 합계는 순서와 무관하다 — 팀 귀속이 틀려도 T = Σn_i 는 그대로다.
                sum(chainCounts),
                ROUNDING_RULE,
                REMAINDER_RULE,
                performance.getCreatorTeam().getTeamId(),
                recalculated == null ? null : recalculated.dust(),
                TOKEN_DECIMALS,
                CURRENCY);
    }

    /**
     * 팀별 몫 — <b>{@code recalculationInput}으로 방금 계산한 값</b>이다.
     *
     * <p>DB {@code settlement_share}를 그대로 내려주지 않는다. 그러면 "입력으로 재현되는 값"이라는
     * 보장이 사라지고, 저장값과 재계산이 어긋난 사고를 이 화면이 못 보게 된다. 차이는
     * {@code releaseReconciliation}이 드러낸다.
     */
    private static List<Share> shares(SettlementTeams teams,
                                      SettlementCalculator.Result recalculated) {
        if (recalculated == null) {
            return List.of();
        }
        List<Share> shares = new ArrayList<>(teams.size());
        for (SettlementCalculator.Share share : recalculated.shares()) {
            Team team = teams.at(share.teamIndex()).getTeam();
            shares.add(new Share(team.getTeamId(), team.getName(), share.fixedAmount(),
                    share.choiceAmount(), share.dustAmount(), share.totalAmount()));
        }
        return List.copyOf(shares);
    }

    /**
     * 불변식 2.
     *
     * @param releasedTotal 이미 나간 금액. release 전이면 {@code 0}, <b>release 후인데
     *                      {@code payoutsOf}를 읽지 못했으면 {@code null}</b>이다. 그때는 기대값을
     *                      세울 수 없으므로 {@code expectedEscrowBalance}·{@code matched}도 판정
     *                      없음으로 둔다 — 못 읽은 항을 0으로 놓으면 정상 정산이 불일치로 보인다
     * @param order         팀 순서가 어긋났으면 {@code note}에 그 사실을 덧붙인다. <b>합계는 순서와
     *                      무관하므로 대사 자체는 그대로 판정한다</b>
     */
    private static EscrowReconciliation escrowReconciliation(
            SettlementReconciler.ServerAggregate aggregate, long escrowOnchain, Long releasedTotal,
            TeamOrder order) {
        Long expected = releasedTotal == null ? null
                : aggregate.grossRevenue() - aggregate.refundedAmount() - releasedTotal;
        return new EscrowReconciliation(
                aggregate.grossRevenue(),
                aggregate.refundedAmount(),
                releasedTotal,
                escrowOnchain,
                expected,
                expected == null ? null : expected == escrowOnchain,
                order.trusted() ? ESCROW_NOTE : ESCROW_NOTE + TEAM_ORDER_NOTE);
    }

    /**
     * 불변식 3. 온체인 {@code payoutsOf}(= 지급된 금액)와 재계산 합을 맞춰 본다.
     *
     * <p><b>release 전에는 판정하지 않는다.</b> 아직 나가지 않은 돈을 0으로 적고 재계산액과 비교하면
     * {@code difference = −재계산액}이 되어 화면이 <b>정상 상태를 불일치로</b> 그린다. 그래서
     * {@code releasedEventTotal}·{@code difference}·{@code matched}를 {@code null}로 두고
     * ({@code non_null} 직렬화라 JSON에서 필드째 빠진다) {@code releasedEvents}는 빈 배열로 준다.
     * 지금 계산할 수 있는 {@code recalculatedTotal}만은 언제나 채운다.
     *
     * <p>{@code payoutsOf}를 못 읽었거나 <b>팀 순서를 못 믿을 때</b>도 같은 "판정 없음"이다 —
     * 후자에서는 {@code releasedEvents[i].teamWallet}이 엉뚱한 팀을 가리키게 된다.
     */
    private static ReleaseReconciliation releaseReconciliation(
            SettlementTeams teams, long[] payouts, boolean releaseComparable,
            SettlementCalculator.Result recalculated) {
        Long recalculatedTotal = recalculated == null ? null : recalculated.payoutSum();
        if (!releaseComparable) {
            return new ReleaseReconciliation(null, recalculatedTotal, null, null, List.of());
        }
        long eventTotal = sum(payouts);
        List<ReleasedEvent> events = new ArrayList<>(payouts.length);
        for (int i = 0; i < payouts.length; i++) {
            String wallet = i < teams.size() ? teams.at(i).getWalletAddress() : null;
            events.add(new ReleasedEvent(wallet, payouts[i]));
        }
        if (recalculatedTotal == null) {
            // 지급은 있었는데 규칙이 깨져 재계산을 못 했다 — 비교 자체가 불가능하다.
            return new ReleaseReconciliation(eventTotal, null, null, null, List.copyOf(events));
        }
        long difference = eventTotal - recalculatedTotal;
        return new ReleaseReconciliation(eventTotal, recalculatedTotal, difference,
                difference == 0, List.copyOf(events));
    }

    private DepositReconciliation depositReconciliation(Performance performance,
                                                        Long depositOnchain, Snapshot snapshot) {
        Performance.DepositStatus status = performance.getDepositStatus();
        long amount = performance.getDepositAmount() == null ? 0 : performance.getDepositAmount();
        // 납부 상태에서만 컨트랙트가 보증금을 들고 있다. 반환·미납은 0이어야 한다.
        long expected = status == Performance.DepositStatus.PAID ? amount : 0L;

        ChainJob paidJob = snapshot.lastTx(ChainJob.TxType.DEPOSIT);
        ChainJob returnJob = snapshot.lastTx(ChainJob.TxType.DEPOSIT_RETURN);
        String paidTxHash = performance.getDepositTxHash() != null
                ? performance.getDepositTxHash() : (paidJob == null ? null : paidJob.getTxHash());
        String returnTxHash = performance.getDepositReturnTxHash() != null
                ? performance.getDepositReturnTxHash()
                : (returnJob == null ? null : returnJob.getTxHash());

        // 온체인 잔액을 못 읽었으면 판정 없음(null)이다. false 는 "읽었는데 틀렸다"만 뜻한다.
        Boolean matched = depositOnchain == null ? null : depositOnchain == expected;
        return new DepositReconciliation(performance.getDepositAmount(), status.name(),
                paidTxHash, returnTxHash, matched);
    }

    /**
     * 팀별 수령 여부·시각. <b>release 확정이 곧 수령</b>이므로 확정 tx의 시각이 수령 시각이다.
     *
     * <p>금액은 온체인 지급액을 우선하되, 그것을 팀에 귀속시킬 수 없으면(순서 불일치·미조회)
     * 팀 id로 저장된 {@code settlement_share}를 쓴다 — 이쪽은 배열 인덱스를 타지 않는다.
     */
    private static List<ReceiptItem> receiptSummary(
            SettlementTeams teams, long[] payouts, boolean releaseComparable,
            SettlementCalculator.Result recalculated, Settlement settlement, ChainJob releaseJob,
            Map<Long, SettlementShare> shareByTeam) {
        boolean released = settlement != null
                && settlement.getStatus() == Settlement.Status.RELEASED;
        LocalDateTime fallbackAt = releaseJob != null && releaseJob.getConfirmedAt() != null
                ? releaseJob.getConfirmedAt()
                : (settlement == null ? null : settlement.getReleasedAt());

        List<ReceiptItem> items = new ArrayList<>(teams.size());
        for (int i = 0; i < teams.size(); i++) {
            PerformanceParticipant participant = teams.at(i);
            Long teamId = participant.getTeam().getTeamId();
            SettlementShare share = shareByTeam.get(teamId);
            // 같은 언박싱 함정 — 분기마다 Long 으로 명시한다.
            Long amount;
            if (releaseComparable && i < payouts.length) {
                amount = payouts[i];
            } else if (share != null) {
                amount = share.getTotalAmount();
            } else {
                amount = recalculated == null ? null
                        : recalculated.shares().get(i).totalAmount();
            }
            // release 는 팀별로 부분 성공할 수 있다 — 팀 행이 있으면 그 행이 정본이다.
            boolean receivedByTeam = share != null ? share.isReleased() : released;
            LocalDateTime receivedAt = share != null && share.getReleasedAt() != null
                    ? share.getReleasedAt() : fallbackAt;
            items.add(new ReceiptItem(teamId, participant.getWalletAddress(), amount,
                    receivedByTeam, receivedByTeam ? SettlementTime.toOffset(receivedAt) : null));
        }
        return List.copyOf(items);
    }

    private ReleaseTx releaseTx(Settlement settlement, ChainJob releaseJob) {
        String txHash = settlement != null && settlement.getReleaseTxHash() != null
                ? settlement.getReleaseTxHash() : (releaseJob == null ? null : releaseJob.getTxHash());
        LocalDateTime releasedAt = settlement != null && settlement.getReleasedAt() != null
                ? settlement.getReleasedAt()
                : (releaseJob == null ? null : releaseJob.getConfirmedAt());
        // 아직 release 전이어도 객체 자체는 내려준다 — 필드가 사라지면 프론트 타입이 흔들린다.
        return new ReleaseTx(txHash, chainJobService.txExplorerUrl(txHash),
                SettlementTime.toOffset(releasedAt));
    }

    private static long sum(long[] values) {
        long total = 0;
        for (long value : values) {
            total += value;
        }
        return total;
    }
}
