package com.ssafy.b204.rule.service;

import com.ssafy.b204.chain.dto.ChainDtos.SignRequest;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.ShowCreationService;
import com.ssafy.b204.chain.service.SignRequestFactory;
import com.ssafy.b204.chain.service.UserSignedTxService;
import com.ssafy.b204.chain.support.ChainJobIds;
import com.ssafy.b204.chain.support.ContractCalls;
import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.EntityLocks;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.rule.dto.RuleDtos.AgreePrepareRequest;
import com.ssafy.b204.rule.dto.RuleDtos.AgreePrepareResponse;
import com.ssafy.b204.rule.dto.RuleDtos.AgreeSignedTxRequest;
import com.ssafy.b204.rule.dto.RuleDtos.AgreeSignedTxResponse;
import com.ssafy.b204.rule.dto.RuleDtos.AgreementItem;
import com.ssafy.b204.rule.dto.RuleDtos.MyAgreement;
import com.ssafy.b204.rule.dto.RuleDtos.MyTeamAgreement;
import com.ssafy.b204.rule.dto.RuleDtos.RuleBlock;
import com.ssafy.b204.rule.dto.RuleDtos.RuleStatusResponse;
import com.ssafy.b204.rule.dto.RuleDtos.SetRuleRequest;
import com.ssafy.b204.rule.dto.RuleDtos.SetRuleResponse;
import com.ssafy.b204.rule.dto.RuleDtos.SimulatedShare;
import com.ssafy.b204.rule.dto.RuleDtos.Simulation;
import com.ssafy.b204.rule.dto.RuleDtos.StartSaleRequest;
import com.ssafy.b204.rule.dto.RuleDtos.StartSaleResponse;
import com.ssafy.b204.rule.dto.RuleDtos.TeamShare;
import com.ssafy.b204.rule.dto.RuleDtos.TeamWallet;
import com.ssafy.b204.rule.entity.RuleAgreement;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.RuleAgreementRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.rule.support.RulesHash;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.webauthn.service.StepUpAction;
import com.ssafy.b204.webauthn.service.StepUpTokenService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * rule 도메인 서비스 — API v6 §5 (API-rule-01·02·03·05·04).
 *
 * <p><b>이 도메인이 프로젝트의 신뢰 구조 그 자체다.</b> 판매 시작 전에 참여팀 전원이 규칙 해시에
 * <b>자기 지갑으로 서명</b>하고, 서버가 그 서명 tx를 대납 전송해 컨트랙트에 잠근다. 잠근 뒤에는
 * 서버가 막는 것이 아니라 <b>컨트랙트가 revert한다.</b>
 *
 * <p><b>{@code rulesHash}는 분배율 3종을 반드시 포함한다</b>(계약 문서 §4.1 규약 ①).
 * {@link RulesHash}가 그 정규화를 맡는다 — 여기서 다시 계산하지 않는다. 해시가 규칙의 일부만
 * 반영하면 bp를 바꿔도 팀 지갑 팝업의 값이 그대로여서 신뢰 장치가 조용히 사라진다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RuleService {

    /** bp 합계 기준값. 1·2단계 모두 이 값이어야 한다. */
    private static final int TOTAL_BP = SettlementRule.TOTAL_BP;

    private static final int PREPARE_TTL_MINUTES = 5;
    private static final int POLL_AFTER_MS = 1500;
    private static final int START_SALE_POLL_AFTER_MS = 2000;
    /** API-rule-03이 내려주는 유일한 {@code signRequests[].kind}(§0.4 ①). */
    private static final String AGREE_KIND = "AGREE";

    /**
     * §0.8 — 판매 시작은 공연당 1회다. 재요청은 같은 job을 재생한다.
     *
     * <p>이제 <b>멱등 보장에만</b> 쓴다. 종전에는 이 접두가 {@code tx_type=LOCK}의 뜻(판매 시작
     * ↔ 정산 잠금)을 가르는 표식이기도 했는데, v6에서 {@code TxType.START_SALE}이 생겨 그 역할이
     * 사라졌다(S15P21B204-67).
     */
    private static final String START_SALE_KEY_PREFIX = "startSale:";

    private final SettlementRuleRepository settlementRuleRepository;
    private final RuleAgreementRepository ruleAgreementRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final TicketTypeRepository ticketTypeRepository;
    private final ChainJobRepository chainJobRepository;
    private final PerformanceService performanceService;
    private final SignRequestFactory signRequestFactory;
    private final UserSignedTxService userSignedTxService;
    private final ShowCreationService showCreationService;
    private final DisplayRateService displayRateService;
    private final ChainProperties chainProperties;
    /** [2026-09-24] 규칙 동의 보고 본인 확인(API v7 §7.W). */
    private final StepUpTokenService stepUpTokens;

    /** 규칙 저장을 공연 행 락으로 직렬화하는 자리 — {@link #setRule} 참조. */
    @PersistenceContext
    private EntityManager em;

    // ================================================================ API-rule-01

    /**
     * API-rule-01 정산 규칙 설정.
     *
     * <p><b>보증금 {@code PAID} 선행 조건을 걷었다(2026-09-09 · S15P21B204-67).</b> API v6 [v4]는
     * 보증금을 규칙보다 앞에 뒀지만 온체인 순서가 그것을 허용하지 않는다 — {@code deposit(showId)}은
     * 컨트랙트에 공연이 등록된 뒤에만 동작하고({@code createShow} 선행), {@code createShow}는
     * {@code rulesHash == 0}을 {@code ZeroRulesHash}로 거절한다(`RevenueSplitter.sol:1112`).
     * 셋을 그대로 두면 규칙 ← 보증금 ← createShow ← 규칙의 원이 되어 <b>0층이 통째로 막힌다.</b>
     * 그래서 순서를 <b>규칙 → createShow → 보증금 → 동의 → 판매 시작</b>으로 바꾼다.
     * "판매 전에 보증금을 받는다"는 의도는 {@code startSale}이 그대로 지킨다(그쪽은 {@code PAID} 요구).
     *
     * <p>저장할 때마다 {@code rulesHash}를 재산출하고 <b>기존 동의를 전부 초기화</b>한다.
     * 동의는 해시에 대한 서명이므로, 해시가 바뀌면 이전 서명은 다른 규칙에 대한 것이 된다.
     *
     * <p><b>공연 행을 잠그고 판정한다(S15P21B204-77).</b> 저장 버튼 두 번이 나란히 들어오면 둘 다
     * 같은 마지막 {@code UPDATE_RULES} job 을 읽어 같은 멱등키를 만들고, 뒤 요청이 UNIQUE 위반으로
     * 500 이 되며 그 요청의 규칙 저장까지 함께 롤백된다. 락을 잡으면 뒤 요청은 앞 요청의 커밋을
     * 보고 {@link #enqueueUpdateRules} 의 "같은 규칙 전송 중"으로 합쳐진다. 락 파인더가 아니라
     * {@code em.refresh} 인 이유와 {@code READ_COMMITTED} 인 이유는
     * {@code PerformanceService.cancel} 과 같다 — 이미 로드된 인스턴스를 DB 로 덮어쓰고, 락에서
     * 깨어난 뒤의 일반 조회가 상대의 커밋을 봐야 한다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public SetRuleResponse setRule(MemberPrincipal me, Long performanceId, SetRuleRequest request) {
        Member member = performanceService.requireMember(me);
        Performance performance = performanceService.requireOwnedPerformance(performanceId, member);
        EntityLocks.lockForUpdate(em, performance);

        if (performance.isOnSaleOrLater()) {
            throw BusinessException.of(ErrorCode.RULE_ALREADY_LOCKED);
        }
        if (!performance.isModifiable()) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
        List<PerformanceParticipant> participants =
                performanceService.acceptedParticipants(performanceId);
        List<TeamShare> shares = validateShares(request, participants);

        String rulesHash = RulesHash.of(performanceId, request.fixedRatioBp(),
                request.selectionRatioBp(), toHashInput(shares));
        // 저장이 해시를 덮어쓰기 전에 판정한다 - 덮어쓴 뒤에는 "바뀌었는가"를 알 방법이 없다.
        boolean rulesChanged = !settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId)
                .map(existing -> rulesHash.equalsIgnoreCase(existing.getRulesHash()))
                .orElse(false);
        requireRuleChangeable(performanceId, rulesChanged);

        // 팀별 몫을 참여팀 행에 반영한다 — createShow 의 teamShareBp[] 가 여기서 나온다.
        Map<Long, Integer> shareByTeam = new LinkedHashMap<>();
        shares.forEach(s -> shareByTeam.put(s.teamId(), s.shareBp()));
        participants.forEach(p -> p.changeShareBp(shareByTeam.get(p.getTeam().getTeamId())));

        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId)
                .map(existing -> {
                    existing.update(request.fixedRatioBp(), request.selectionRatioBp(), rulesHash);
                    return existing;
                })
                .orElseGet(() -> settlementRuleRepository.save(SettlementRule.builder()
                        .performance(performance)
                        .fixedRatioBp(request.fixedRatioBp())
                        .selectionRatioBp(request.selectionRatioBp())
                        .rulesHash(rulesHash)
                        .build()));
        if (rule.isLocked()) {
            throw BusinessException.of(ErrorCode.RULE_ALREADY_LOCKED);
        }
        // 동의 초기화가 먼저다 - 되돌린 팀이 있으면 그것만으로도 전송 사유가 된다(아래 불변식).
        boolean agreementsReset = ensureAgreements(performance, participants, member);

        // 불변식: 서버 동의를 되돌렸으면 온체인 rulesEpoch 도 올려야 한다.
        //
        // ① 해시가 바뀌었으면 당연히 보낸다.
        // ② 해시가 그대로여도 온체인과 갈려 있으면 보낸다 - 앞선 전송이 실패한 뒤 같은 규칙을
        //    다시 저장하는 것이 리더가 아는 유일한 복구 동작이다.
        // ③ 해시가 그대로이고 온체인과 맞아도, 되돌린 동의가 있으면 보낸다. 전원 동의 뒤 저장
        //    버튼을 다시 누르면 서버는 전부 PENDING 인데 온체인 epoch 는 그대로라, 팀들이 다시
        //    동의하려 하면 컨트랙트가 AlreadyAgreed 로 revert 한다(RevenueSplitter.sol:560).
        //    DB 는 영영 PENDING 이고 판매 시작이 RULE_NOT_AGREED_BY_ALL 로 영구히 막힌다.
        //    되돌릴 동의가 애초에 없었다면(전원 PENDING) agreementsReset 이 false 라 보내지 않는다.
        if (showCreationService.isCreated(performanceId)
                && (rulesChanged || agreementsReset
                        || showCreationService.isRulesOutOfSync(performanceId, rulesHash))) {
            enqueueUpdateRules(performance, rulesHash, member);
        }
        performance.markPendingAgreement();

        long assumedRevenue = request.simulationRevenue() == null ? 0L : request.simulationRevenue();
        return new SetRuleResponse(
                performanceId,
                performance.getStatus().name(),
                performance.getDepositStatus().name(),
                rule.getFixedRatioBp(),
                rule.getSelectionRatioBp(),
                shares,
                rulesHash,
                agreementsReset,
                displayRateService.listRate(member.getDisplayCurrency(), member.getTimezone()),
                simulate(assumedRevenue, performance, participants, shareByTeam,
                        rule.getFixedRatioBp(), rule.getSelectionRatioBp()),
                "COLLECT_AGREEMENTS");
    }

    /**
     * 규칙을 바꿔도 되는가 — <b>{@code createShow} 가 전송 중인 동안만 막는다</b>(S15P21B204-70).
     *
     * <p>{@code createShow} 가 확정되면 컨트랙트에 {@code rulesHash} 가 박힌다. 그 뒤 서버에서만
     * 규칙을 다시 저장하면 DB 해시와 온체인 해시가 갈리고, 참여팀이 서명해 보내는
     * {@code agreeToRules} 는 옛 해시를 기대하는 컨트랙트에서 revert 한다. 종전에는 그 사고를
     * 막으려고 재저장 자체를 409 로 거절했는데(MR !77), 이제는 <b>바꾸면 온체인도 같이 바꾼다</b>
     * — {@link #enqueueUpdateRules} 가 {@code updateRules} 를 보낸다.
     *
     * <p><b>전송 중({@code PENDING}·{@code SUBMITTED})은 여전히 막는다.</b> 아직 온체인에 박히지
     * 않은 규칙을 {@code updateRules} 로 고칠 수는 없고({@code showExists} 로 revert 한다),
     * 무엇이 박힐지도 모른다 — 빌더가 규칙을 읽는 것과 저장이 경쟁한다. {@code FAILED} 는 열려
     * 있다({@code isRulesFrozen} 이 false 다) — 재시도가 새 규칙을 읽어 가야 한다.
     *
     * <p>같은 규칙을 다시 저장하는 것은 어느 구간에서도 막지 않는다 — 온체인과 갈리지 않는다.
     */
    private void requireRuleChangeable(Long performanceId, boolean rulesChanged) {
        if (isSaleStarting(performanceId)) {
            throw BusinessException.of(ErrorCode.RULE_SYNC_IN_PROGRESS);
        }
        if (!rulesChanged || !showCreationService.isRulesFrozen(performanceId)
                || showCreationService.isCreated(performanceId)) {
            return;
        }
        // 코드가 곧 문구다 - 별도 msg 를 실으면 화면이 표 문구 뒤에 이어 붙여
        // "보증금 납부를 먼저 끝내 주세요. 온체인 공연 등록이 진행 중입니다." 라는 모순된 두
        // 문장을 띄운다(studioFailureText · 리뷰 !80 4차). 둘 다 "기다리면 풀린다"는 뜻이라
        // RULE_SYNC_IN_PROGRESS 하나로 내려준다.
        throw BusinessException.of(ErrorCode.RULE_SYNC_IN_PROGRESS);
    }

    /**
     * {@code startSale} 이 떠 있는가 — job 이 {@code PENDING}·{@code SUBMITTED} 인가(리뷰 !80 3차).
     *
     * <p>이 구간에서는 <b>같은 규칙 재저장까지 막는다.</b> {@code createShow} 쪽({@link
     * #requireRuleChangeable} 아래 절)이 바뀐 규칙만 막는 것과 다르다 — {@code startSale} 은
     * 규칙이 <b>영구히 잠기는</b> tx 라 해시가 그대로여도 움직이면 안 되는 것이 하나 더 있다:
     * 저장은 {@code ensureAgreements} 로 <b>서버 동의를 되돌린다.</b> 온체인은 전원 동의한 채로
     * 잠기는데 DB 만 {@code PENDING} 이 되고, 그 불일치를 되돌릴 {@code updateRules} 는 잠긴 뒤라
     * {@code RulesLocked} 로 revert 한다.
     *
     * <p>해시가 바뀌는 경우는 더 나쁘다. 워커가 옛 해시로 {@code startSale} 을 보내 온체인은 옛
     * 규칙으로 잠기고, {@code confirmStartSale}({@code ChainJobConfirmationService})이 <b>현재
     * DB 해시</b>와 대조해 <b>성공한 tx 를 {@code FAILED} 로 적는다</b> — 공연이 영영
     * {@code ON_SALE} 이 되지 않는다. 이 MR 이 없애려던 바로 그 "복구 불가"다.
     *
     * <p>{@code FAILED} 는 열어 둔다 — 재시도가 새 규칙을 읽어 가야 한다. {@code CONFIRMED} 도
     * 보지 않는다: 그때는 공연이 {@code ON_SALE} 이라 {@code setRule} 첫 줄의
     * {@code isOnSaleOrLater} 가 {@code RULE_ALREADY_LOCKED} 로 먼저 막는다.
     */
    private boolean isSaleStarting(Long performanceId) {
        return chainJobRepository.findByIdempotencyKey(START_SALE_KEY_PREFIX + performanceId)
                .map(job -> job.getStatus() == ChainJob.Status.PENDING
                        || job.getStatus() == ChainJob.Status.SUBMITTED)
                .orElse(false);
    }

    /**
     * 바뀐 규칙을 온체인에 보낸다 — {@code RevenueSplitter.updateRules} OPERATOR job.
     *
     * <p><b>판정은 "마지막 job 이 무엇을 겨냥했는가"다</b>(리뷰 !80 🔴 1). 멱등키의 존재로
     * 판정하면 A → B → A → B 에서 두 번째 B 가 첫 B 의 키를 만나 조기 return 하고, 온체인은 A ·
     * DB 는 B 인 채 <b>몇 번을 저장해도 복구되지 않는다</b>. 키는 회차를 붙여 UNIQUE 충돌만
     * 피한다.
     *
     * <p>여기서 합치는 것은 <b>같은 규칙이 아직 전송 중</b>인 경우 하나뿐이다(저장 버튼 두 번).
     * {@code CONFIRMED} 를 만나도 새로 보낸다 — <b>"보낼 필요가 있는가"는 호출부가 이미
     * 판정했다</b>. 되돌린 동의가 있으면 해시가 같아도 온체인 {@code rulesEpoch} 를 올려야 하고
     * (2차 리뷰 🔴), 여기서 "같은 해시가 이미 확정됐다"고 건너뛰면 그 사고가 그대로 난다.
     *
     * <p>전송은 여기서 하지 않는다 — 워커가 지갑 큐에서 서명·전송한다(§0.3). 이 job 은
     * {@code setRule} 과 <b>같은 트랜잭션</b>에서 만든다: 규칙 저장이 롤백되면 보낼 규칙도
     * 없어져야 한다({@code createShow} 쪽 {@code REQUIRES_NEW} 와 반대인 이유 — 그쪽은 prepare
     * 응답이 jobId 를 내보내 롤백되면 죽은 id 를 폴링하게 된다).
     *
     * <p>응답에 이 job id 를 싣지 않는다 — API-rule-01 명세에 담을 필드가 없다. 프론트는
     * 규칙·동의 현황(API-rule-02)의 {@code startSaleBlockedReason} 으로 진행 중임을 본다.
     */
    private void enqueueUpdateRules(Performance performance, String rulesHash, Member member) {
        ChainJob latest = showCreationService.latestUpdateRules(performance.getPerformanceId());
        boolean sameRuleInFlight = latest != null
                && (latest.getStatus() == ChainJob.Status.PENDING
                        || latest.getStatus() == ChainJob.Status.SUBMITTED)
                && rulesHash.equalsIgnoreCase(ShowCreationService.targetRulesHash(latest));
        if (sameRuleInFlight) {
            return;
        }
        String key = ShowCreationService.updateRulesKey(performance.getPerformanceId(), rulesHash,
                showCreationService.nextUpdateRulesSequence(latest));
        chainJobRepository.save(ChainJob.builder()
                .txType(ChainJob.TxType.UPDATE_RULES)
                .signerType(ChainJob.SignerType.OPERATOR)
                .requester(member)
                .targetPerformanceId(performance.getPerformanceId())
                .targetTeamId(performance.getCreatorTeam().getTeamId())
                .idempotencyKey(key)
                .build());
    }

    // ================================================================ API-rule-02

    /**
     * API-rule-02 규칙·동의 현황. P-06 화면 전체가 이 응답 하나로 그려진다.
     *
     * <p>{@code teamId}는 <b>한 회원이 이 공연의 팀을 둘 이상 이끌 때</b> 어느 팀으로 볼지 고르는
     * 값이다. 주면 그 팀이 요청자의 팀이고 이 공연의 참여팀인지 검증하고({@code COMMON_FORBIDDEN}),
     * 주지 않으면 <b>주최팀 우선 → {@code teamId} 오름차순</b>의 첫 팀을 쓴다. 이전에는 루프가
     * {@code mine}을 마지막 소유 팀으로 덮어써 같은 요청이 매번 다른 팀을 가리킬 수 있었다.
     */
    public RuleStatusResponse ruleStatus(MemberPrincipal me, Long performanceId, Long teamId) {
        Member member = performanceService.requireMember(me);
        Performance performance = performanceService.requirePerformance(performanceId);
        List<PerformanceParticipant> participants =
                performanceService.acceptedParticipants(performanceId);
        boolean insider = performance.getCreatorTeam().isLedBy(member.getMemberId())
                || participants.stream().anyMatch(p -> p.getTeam().isLedBy(member.getMemberId()));
        if (!insider) {
            throw BusinessException.of(ErrorCode.SETTLEMENT_NOT_PARTICIPANT);
        }
        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));

        Map<Long, RuleAgreement> agreementByTeam = new LinkedHashMap<>();
        ruleAgreementRepository.findByPerformance_PerformanceId(performanceId)
                .forEach(a -> agreementByTeam.put(a.getTeam().getTeamId(), a));
        Long creatorTeamId = performance.getCreatorTeam().getTeamId();

        List<AgreementItem> agreements = new ArrayList<>();
        List<TeamShare> shares = new ArrayList<>();
        for (PerformanceParticipant participant : participants) {
            Long participantTeamId = participant.getTeam().getTeamId();
            RuleAgreement agreement = agreementByTeam.get(participantTeamId);
            String status = agreementStatusOf(agreement);
            agreements.add(new AgreementItem(participantTeamId, participant.getTeam().getName(),
                    participant.getWalletAddress(), status,
                    agreement == null ? null : agreement.getAgreeTxHash(),
                    agreement == null ? null
                            : performanceService.explorerTxUrl(agreement.getAgreeTxHash()),
                    agreement == null ? null
                            : TimeSupport.toOffset(agreement.getAgreedAt(), member.getTimezone())));
            shares.add(new TeamShare(participantTeamId, participant.getTeamShareBp()));
        }

        // 내가 리더인 참여팀 — 주최팀 우선, 그다음 teamId 오름차순(API-performance-06과 같은 규칙).
        List<MyTeamAgreement> myTeams = participants.stream()
                .filter(p -> p.getTeam().isLedBy(member.getMemberId()))
                .sorted(Comparator
                        .comparingInt((PerformanceParticipant p) ->
                                p.getTeam().getTeamId().equals(creatorTeamId) ? 0 : 1)
                        .thenComparing(p -> p.getTeam().getTeamId()))
                .map(p -> new MyTeamAgreement(p.getTeam().getTeamId(), p.getTeam().getName(),
                        p.getTeam().getTeamId().equals(creatorTeamId),
                        agreementStatusOf(agreementByTeam.get(p.getTeam().getTeamId()))))
                .toList();

        MyTeamAgreement selected;
        if (teamId != null) {
            // 남의 팀이거나 이 공연의 참여팀이 아니면 403. 두 경우를 나누지 않는다 —
            // 나눠 주면 존재하지 않는 팀과 남의 팀을 구분하는 탐색 수단이 된다.
            selected = myTeams.stream().filter(t -> t.teamId().equals(teamId)).findFirst()
                    .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_FORBIDDEN));
        } else {
            selected = myTeams.isEmpty() ? null : myTeams.get(0);
        }
        MyAgreement mine = selected == null ? null
                : new MyAgreement(selected.teamId(), selected.agreementStatus(),
                        nextActionOf(selected.agreementStatus()));

        String blockedReason = startSaleBlockedReason(performance, rule, participants);
        return new RuleStatusResponse(
                performanceId,
                performance.getStatus().name(),
                performance.getDepositStatus().name(),
                rule.isLocked(),
                rule.getRulesHash(),
                new RuleBlock(rule.getFixedRatioBp(), rule.getSelectionRatioBp(), shares),
                agreements,
                mine,
                blockedReason == null,
                blockedReason,
                myTeams);
    }

    private static String agreementStatusOf(RuleAgreement agreement) {
        return agreement == null ? RuleAgreement.Status.PENDING.name()
                : agreement.getStatus().name();
    }

    // ================================================================ API-rule-03

    /**
     * API-rule-03 규칙 동의 서명 파라미터(§0.4 {@code prepare}).
     *
     * <p>{@code signRequests}는 1건({@code AGREE})이고 {@code approve}가 없다 — 자금이 움직이지
     * 않는 동의 tx이기 때문이다. 요약({@code summary})에 비율·내 몫을 담아 리더가 <b>무엇에
     * 동의하는지</b> 읽게 한다(결정 v2 §2.3).
     *
     * <p>요청 {@code rulesHash}가 서버 현재 해시와 다르면 {@code RULE_HASH_MISMATCH}(409)다 —
     * 규칙이 중간에 바뀐 상황이라 그대로 서명시키면 팀이 보지 않은 규칙에 동의하게 된다.
     */
    @Transactional
    public AgreePrepareResponse agreePrepare(MemberPrincipal me, Long performanceId,
                                             AgreePrepareRequest request) {
        Member member = performanceService.requireMember(me);
        Performance performance = performanceService.requirePerformance(performanceId);
        PerformanceParticipant participant = requireLedParticipant(performanceId, request.teamId(),
                member);
        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));

        if (rule.isLocked() || performance.isOnSaleOrLater()) {
            throw BusinessException.of(ErrorCode.RULE_ALREADY_LOCKED);
        }
        if (!rule.getRulesHash().equalsIgnoreCase(request.rulesHash())) {
            throw BusinessException.of(ErrorCode.RULE_HASH_MISMATCH);
        }
        requireRulesInSync(performanceId, rule);
        RuleAgreement agreement = ruleAgreementRepository
                .findByPerformance_PerformanceIdAndTeam_TeamId(performanceId, request.teamId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));
        if (agreement.getStatus() != RuleAgreement.Status.PENDING) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        Wallet wallet = performanceService.requireWallet(member.getMemberId());

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("title", "Agree to the settlement rules");
        summary.put("performanceId", performanceId);
        summary.put("teamName", participant.getTeam().getName());
        summary.put("fixedRatioBp", rule.getFixedRatioBp());
        summary.put("selectionRatioBp", rule.getSelectionRatioBp());
        summary.put("myShareBp", participant.getTeamShareBp());
        summary.put("rulesHash", rule.getRulesHash());

        List<SignRequest> signRequests =
                // 워커와 같은 파생(on_chain_id ?? performance_id)을 쓴다.
                List.of(signRequestFactory.agree(performance.onChainShowId(),
                        rule.getRulesHash(), summary));

        // agreeToRules 는 teamWallets 에 msg.sender 가 있어야 통과한다 = createShow 가 선행이다
        // (명세 2579행). 미확정이면 그 jobId 를 내려주고 프론트가 확정 후 서명한다.
        return new AgreePrepareResponse(performanceId, request.teamId(), rule.getRulesHash(),
                showCreationService.ensureShowCreated(performanceId, member.getMemberId())
                        .prerequisiteJobId(), signRequests,
                TimeSupport.nowFor(member.getTimezone()).plusMinutes(PREPARE_TTL_MINUTES),
                stepUpTokens.requiredFlag());
    }

    // ================================================================ API-rule-05

    /**
     * API-rule-05 규칙 동의 tx 보고(§0.4 {@code signed-tx}). 202 + 폴링.
     *
     * <p>보고 시점에는 {@code SIGNING}까지만 올린다 — RLP를 받았을 뿐 체인에 들어갔다는 보장이
     * 없다. {@code AGREED}는 {@code RulesAgreed} receipt 검증 후다
     * ({@link com.ssafy.b204.chain.service.ChainJobConfirmationService}).
     */
    @Transactional
    public AgreeSignedTxResponse agreeSignedTx(MemberPrincipal me, Long performanceId,
                                               AgreeSignedTxRequest request) {
        return agreeSignedTx(me, performanceId, request, null);
    }

    /**
     * {@code stepUpToken} — [2026-09-24] 본인 확인 토큰({@code X-Step-Up-Token}, API v7 §7.W). 스위치가
     * 꺼져 있으면 읽지 않는다. 켜져 있으면 참여팀 리더 확인 <b>뒤</b>에 검사한다(범위 = RULE_AGREE·공연).
     */
    @Transactional
    public AgreeSignedTxResponse agreeSignedTx(MemberPrincipal me, Long performanceId,
                                               AgreeSignedTxRequest request, String stepUpToken) {
        requireAgreeKind(request.kind());
        Member member = performanceService.requireMember(me);
        Performance performance = performanceService.requirePerformance(performanceId);
        requireLedParticipant(performanceId, request.teamId(), member);
        stepUpTokens.guard(member.getMemberId(), StepUpAction.RULE_AGREE, performanceId, stepUpToken);
        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));
        if (rule.isLocked() || performance.isOnSaleOrLater()) {
            throw BusinessException.of(ErrorCode.RULE_ALREADY_LOCKED);
        }
        // 서명을 미리 쥔 클라이언트가 rule-03 게이트를 건너뛰지 못하게 같은 판정을 다시 본다.
        requireRulesInSync(performanceId, rule);
        RuleAgreement agreement = ruleAgreementRepository
                .findByPerformance_PerformanceIdAndTeam_TeamId(performanceId, request.teamId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));
        if (agreement.isAgreed()) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        Wallet wallet = performanceService.requireWallet(member.getMemberId());

        UserSignedTxService.Accepted accepted = userSignedTxService.accept(
                request.senderSignedRlp(),
                new UserSignedTxService.Expectation(ChainJob.TxType.AGREE,
                        signRequestFactory.splitterAddress(),
                        ContractCalls.agreeToRules(performanceId, rule.getRulesHash()),
                        wallet.getAddress(), member, wallet.getWalletId(), performanceId,
                        request.teamId(), null));
        ChainJob job = accepted.job();
        if (!accepted.replayed()) {
            agreement.markSigning(job.getChainJobId(), rule.getRulesHash());
        }

        List<PerformanceParticipant> participants =
                performanceService.acceptedParticipants(performanceId);
        List<Long> pendingTeamIds = pendingTeamIds(performanceId, participants);
        boolean allAgreed = pendingTeamIds.isEmpty();

        return new AgreeSignedTxResponse(
                ChainJobIds.toJobId(job.getChainJobId()),
                job.getStatus().name(),
                job.getSignerType().name(),
                POLL_AFTER_MS,
                performanceId,
                request.teamId(),
                agreement.getStatus().name(),
                job.getTxHash(),
                performanceService.explorerTxUrl(job.getTxHash()),
                allAgreed,
                pendingTeamIds,
                allAgreed && startSaleBlockedReason(performance, rule, participants) == null);
    }

    // ================================================================ API-rule-04

    /**
     * API-rule-04 판매 시작({@code startSale} 잠금). 202 + 폴링.
     *
     * <p>여기서 <b>팀 인덱스가 확정</b>된다 — {@code performance_participant.on_chain_index}가
     * {@code createShow}의 {@code teamWallets} 배열 인덱스이며, 이후 바뀌지 않는다. 주문의
     * {@code teamIndex}·정산 카운터가 전부 이 값을 쓴다. 리더 지갑 주소도 이 시점 스냅샷으로
     * 굳는다(미결 안건 20).
     *
     * <p>공연 {@code ON_SALE} 전이는 <b>{@code SaleStarted} receipt 확정 후</b>다. 확정 전 예매
     * 시도는 {@code TICKET_SALE_NOT_STARTED}(409)다.
     */
    @Transactional
    public StartSaleResponse startSale(MemberPrincipal me, Long performanceId,
                                       StartSaleRequest request) {
        Member member = performanceService.requireMember(me);
        Performance performance = performanceService.requireOwnedPerformance(performanceId, member);
        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));

        if (rule.isLocked() || performance.isOnSaleOrLater()) {
            throw BusinessException.of(ErrorCode.RULE_ALREADY_LOCKED);
        }
        if (performance.getStatus() != Performance.Status.PENDING_AGREEMENT
                || !performance.isDepositPaid()) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
        if (!rule.getRulesHash().equalsIgnoreCase(request.rulesHash())) {
            throw BusinessException.of(ErrorCode.RULE_HASH_MISMATCH);
        }

        List<PerformanceParticipant> participants =
                performanceService.acceptedParticipants(performanceId);
        String blocked = startSaleBlockedReason(performance, rule, participants);
        if (blocked != null) {
            throw BusinessException.of(ErrorCode.valueOf(blocked));
        }

        // 팀 인덱스·지갑 스냅샷은 createShow job 쪽에서 굳는다. 여기서는 그 결과를 받아 응답에
        // 싣는다 - 두 곳에서 굳히면 보낸 배열과 DB 가 갈린다. 다시 조회하지 않는 이유는
        // ensureShowCreated 가 REQUIRES_NEW 라 이 컨텍스트의 1차 캐시가 옛 값을 들고 있어서다.
        ShowCreationService.ShowCreation createShow =
                showCreationService.ensureShowCreated(performanceId, member.getMemberId());
        List<TeamWallet> teamWallets = createShow.teams().stream()
                .map(t -> new TeamWallet(t.teamId(), t.teamIndex(), t.walletAddress()))
                .toList();

        // startSale 은 stage=CREATED 에서만 통과한다. createShow 가 확정되기 전에 START_SALE job
        // 을 만들면 두 job 이 동시에 PENDING 이 되고 워커가 startSale 을 먼저 보내 revert 한다.
        if (!createShow.confirmed()) {
            return new StartSaleResponse(
                    null,
                    createShow.job() == null ? ChainJob.Status.PENDING.name()
                            : createShow.job().getStatus().name(),
                    ChainJob.SignerType.OPERATOR.name(),
                    START_SALE_POLL_AFTER_MS,
                    performanceId,
                    Performance.Status.ON_SALE.name(),
                    signRequestFactory.splitterAddress(),
                    teamWallets,
                    createShow.prerequisiteJobId());
        }

        String key = START_SALE_KEY_PREFIX + performanceId;
        ChainJob existing = chainJobRepository.findByIdempotencyKey(key).orElse(null);
        if (existing != null && existing.getStatus() == ChainJob.Status.FAILED) {
            // FAILED 를 그대로 돌려주면 프론트가 죽은 jobId 를 무한 폴링한다 - createShow 와 같은
            // 방식으로 옛 행의 UNIQUE 키를 풀어 주고 실패 이력은 남긴다
            // ({@code ShowCreationService.ensureShowCreated}).
            existing.retireIdempotencyKey();
            chainJobRepository.saveAndFlush(existing);
            existing = null;
        }
        ChainJob job = existing != null ? existing
                : chainJobRepository.save(ChainJob.builder()
                        .txType(ChainJob.TxType.START_SALE)
                        .signerType(ChainJob.SignerType.OPERATOR)
                        .requester(member)
                        .targetPerformanceId(performanceId)
                        .targetTeamId(performance.getCreatorTeam().getTeamId())
                        .idempotencyKey(key)
                        .build());

        // 전송은 여기서 하지 않는다 - OPERATOR tx 는 chain_job 을 남기고 워커가 지갑 큐에서
        // 서명·전송한다(§0.3). 요청 스레드에서 보내면 nonce 직렬화가 깨지고, 전송이 성공했는데
        // 트랜잭션이 롤백되면 같은 tx 를 두 번 보낸다. 이 job 은 PENDING 으로 나가고 폴링
        // (API-chain-01)이 SUBMITTED -> CONFIRMED 를 따라간다.

        return new StartSaleResponse(
                ChainJobIds.toJobId(job.getChainJobId()),
                job.getStatus().name(),
                job.getSignerType().name(),
                START_SALE_POLL_AFTER_MS,
                performanceId,
                Performance.Status.ON_SALE.name(),
                signRequestFactory.splitterAddress(),
                teamWallets,
                null);
    }

    // ================================================================ 자가 치유 스윕

    /**
     * {@code chain_job} 은 닫혔는데 동의가 {@code SIGNING} 으로 남은 행을 {@code PENDING} 으로
     * 되돌린다 — {@code RuleAgreementScheduler} 가 60초마다 부른다.
     *
     * <p>제1 경로는 job 을 닫는 자리에서 같은 트랜잭션으로 되돌리는 것이다
     * ({@code ChainJobStateWriter.applyAgreementFailure} 전송 실패 ·
     * {@code ChainJobConfirmationService.applyAgreementFailure} 확정 실패). 이 스윕은 <b>그 뒤를
     * 받치는 두 번째 그물</b>이다 — 이 코드가 배포되기 전에 이미 갈라진 행, 전이 코드가 도는
     * 도중 프로세스가 죽어 생긴 갈림, 그리고 앞으로 새로 생길 실패 경로를 사람 손 없이
     * 정리한다(장부 D-81).
     *
     * <p>되돌리지 <b>않는</b> 것: {@code AGREED}(finder 가 {@code SIGNING} 만 읽는다) ·
     * job 이 아직 {@code PENDING}·{@code SUBMITTED} 인 동의(정상적인 서명 대기다).
     * {@code chain_job} 행 자체가 없으면 되돌린다 — 주인 없는 {@code SIGNING} 은 폴링할 job 도
     * 없어 영원히 화면을 막는다.
     *
     * @return 되돌린 건수
     */
    @Transactional
    public int failSigningsWithClosedJobs() {
        List<RuleAgreement> signing =
                ruleAgreementRepository.findByStatus(RuleAgreement.Status.SIGNING);
        int reverted = 0;
        for (RuleAgreement agreement : signing) {
            Long chainJobId = agreement.getChainJobId();
            ChainJob job = chainJobId == null ? null
                    : chainJobRepository.findById(chainJobId).orElse(null);
            if (job != null && job.getStatus() != ChainJob.Status.FAILED) {
                continue;
            }
            agreement.reset();
            reverted++;
            log.warn("규칙 동의 {} PENDING 으로 되돌렸다 - chain_job {} 이 이미 닫혀 있었다(스윕)",
                    agreement.getRuleAgreementId(), chainJobId);
        }
        return reverted;
    }

    // ================================================================ 내부

    /** 규칙 설정 시 참여팀마다 동의 행을 만들고, 이미 있으면 되돌린다. */
    private boolean ensureAgreements(Performance performance,
                                     List<PerformanceParticipant> participants, Member requester) {
        boolean reset = false;
        for (PerformanceParticipant participant : participants) {
            Optional<RuleAgreement> found = ruleAgreementRepository
                    .findByPerformance_PerformanceIdAndTeam_TeamId(
                            performance.getPerformanceId(), participant.getTeam().getTeamId());
            if (found.isPresent()) {
                if (found.get().getStatus() != RuleAgreement.Status.PENDING) {
                    reset = true;
                }
                found.get().reset();
            } else {
                ruleAgreementRepository.save(RuleAgreement.builder()
                        .performance(performance)
                        .team(participant.getTeam())
                        .requester(requester)
                        .build());
            }
        }
        return reset;
    }

    /**
     * bp 검증 — <b>2단계 모두</b> 합이 10000이어야 한다(P-5). 참여팀이 빠지거나 남으면
     * {@code COMMON_VALIDATION_FAILED}다. 규칙에서 누락된 팀은 분배액 0으로 잠긴다.
     */
    private List<TeamShare> validateShares(SetRuleRequest request,
                                           List<PerformanceParticipant> participants) {
        if (request.fixedRatioBp() + request.selectionRatioBp() != TOTAL_BP) {
            throw BusinessException.of(ErrorCode.RULE_RATIO_SUM_INVALID);
        }
        Set<Long> participantTeamIds = new HashSet<>();
        participants.forEach(p -> participantTeamIds.add(p.getTeam().getTeamId()));

        Set<Long> given = new HashSet<>();
        int sum = 0;
        for (TeamShare share : request.teamShares()) {
            if (!participantTeamIds.contains(share.teamId()) || !given.add(share.teamId())) {
                throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
            }
            sum += share.shareBp();
        }
        if (!given.equals(participantTeamIds)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        if (sum != TOTAL_BP) {
            throw BusinessException.of(ErrorCode.RULE_RATIO_SUM_INVALID);
        }
        return List.copyOf(request.teamShares());
    }

    /**
     * 시뮬레이션 — 관객 선택 카운터가 아직 없으므로 <b>선택 풀은 균등 분배로 가정</b>한다.
     * dust는 생성팀(host)에 귀속한다(P-5 · 계약 문서 §4.7). 버리면 Σ분배액 ≠ 총매출이 되어
     * 에스크로에 먼지가 남는다.
     */
    private Simulation simulate(long revenue, Performance performance,
                                List<PerformanceParticipant> participants,
                                Map<Long, Integer> shareByTeam, int fixedRatioBp,
                                int selectionRatioBp) {
        Long hostTeamId = performance.getCreatorTeam().getTeamId();
        long fixedPool = revenue * fixedRatioBp / TOTAL_BP;
        long selectionPool = revenue * selectionRatioBp / TOTAL_BP;

        List<SimulatedShare> shares = new ArrayList<>();
        long assigned = 0;
        for (PerformanceParticipant participant : participants) {
            Long teamId = participant.getTeam().getTeamId();
            long fixedPart = fixedPool * shareByTeam.getOrDefault(teamId, 0) / TOTAL_BP;
            long choicePart = participants.isEmpty() ? 0 : selectionPool / participants.size();
            long total = fixedPart + choicePart;
            assigned += total;
            shares.add(new SimulatedShare(teamId, participant.getTeam().getName(), total));
        }
        long dust = revenue - assigned;
        if (dust > 0 && !shares.isEmpty()) {
            for (int i = 0; i < shares.size(); i++) {
                if (shares.get(i).teamId().equals(hostTeamId)) {
                    SimulatedShare host = shares.get(i);
                    shares.set(i, new SimulatedShare(host.teamId(), host.teamName(),
                            host.amount() + dust));
                    break;
                }
            }
        }
        return new Simulation(revenue, revenue, Money.BASE_CURRENCY, hostTeamId, shares);
    }

    /**
     * 동의 준비(API-rule-03)와 동의 tx 보고(API-rule-05)가 함께 쓰는 판정이다.
     *
     * <p>온체인 해시가 아직 옛 값이다(전송 중이거나 실패했다). 이때 동의하면 컨트랙트에서
     * {@code RulesHashMismatch}(해시가 바뀐 경우) 또는 {@code AlreadyAgreed}(같은 규칙 재저장으로
     * epoch 가 아직 안 오른 경우)로 revert 한다 - 서버 해시가 맞아도 소용없다.
     */
    private void requireRulesInSync(Long performanceId, SettlementRule rule) {
        if (showCreationService.isRulesOutOfSync(performanceId, rule.getRulesHash())) {
            throw BusinessException.of(ErrorCode.RULE_SYNC_IN_PROGRESS);
        }
    }

    /** {@code null}이면 판매 시작 가능. 아니면 그 이유의 에러 코드 문자열이다. */
    private String startSaleBlockedReason(Performance performance, SettlementRule rule,
                                          List<PerformanceParticipant> participants) {
        if (rule.isLocked() || performance.isOnSaleOrLater()) {
            return ErrorCode.RULE_ALREADY_LOCKED.getCode();
        }
        // DB 규칙이 온체인에 아직 반영되지 않았으면 startSale 이 옛 해시로 잠근다. 여기에 두면
        // 판매 시작(API-rule-04)과 현황 조회(API-rule-02)가 같은 판정을 쓴다.
        if (showCreationService.isRulesOutOfSync(performance.getPerformanceId(),
                rule.getRulesHash())) {
            return ErrorCode.RULE_SYNC_IN_PROGRESS.getCode();
        }
        if (!performance.isDepositPaid()) {
            return ErrorCode.PERFORMANCE_INVALID_STATUS.getCode();
        }
        // 판정은 PerformanceService 한 곳이다 — 보증금 prepare 도 같은 것을 쓴다(D-63).
        if (PerformanceService.jointTeamCountUnmet(performance, participants.size())) {
            return ErrorCode.TEAM_MIN_COUNT_NOT_MET.getCode();
        }
        if (ticketTypeRepository.findByPerformance_PerformanceId(performance.getPerformanceId())
                .isEmpty()) {
            return ErrorCode.COMMON_VALIDATION_FAILED.getCode();
        }
        if (!pendingTeamIds(performance.getPerformanceId(), participants).isEmpty()) {
            return ErrorCode.RULE_NOT_AGREED_BY_ALL.getCode();
        }
        return null;
    }

    /** 아직 {@code AGREED}가 아닌 팀. 하나라도 남으면 판매를 시작할 수 없다. */
    private List<Long> pendingTeamIds(Long performanceId,
                                      List<PerformanceParticipant> participants) {
        Map<Long, RuleAgreement> byTeam = new LinkedHashMap<>();
        ruleAgreementRepository.findByPerformance_PerformanceId(performanceId)
                .forEach(a -> byTeam.put(a.getTeam().getTeamId(), a));
        List<Long> pending = new ArrayList<>();
        for (PerformanceParticipant participant : participants) {
            RuleAgreement agreement = byTeam.get(participant.getTeam().getTeamId());
            if (agreement == null || !agreement.isAgreed()) {
                pending.add(participant.getTeam().getTeamId());
            }
        }
        return pending;
    }

    private PerformanceParticipant requireLedParticipant(Long performanceId, Long teamId,
                                                         Member member) {
        PerformanceParticipant participant = participantRepository
                .findByPerformance_PerformanceIdAndTeam_TeamId(performanceId, teamId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.SETTLEMENT_NOT_PARTICIPANT));
        if (!participant.getTeam().isLedBy(member.getMemberId())) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        if (!participant.isAccepted()) {
            throw BusinessException.of(ErrorCode.SETTLEMENT_NOT_PARTICIPANT);
        }
        return participant;
    }

    private static List<RulesHash.TeamShare> toHashInput(List<TeamShare> shares) {
        List<RulesHash.TeamShare> out = new ArrayList<>();
        shares.forEach(s -> out.add(new RulesHash.TeamShare(s.teamId(), s.shareBp())));
        return out;
    }

    /**
     * 선택 필드 {@code kind} 검증 — 생략은 허용, 값이 오면 {@code AGREE}만 허용한다.
     *
     * <p>md는 본문에 {@code kind}가 없다고 적었고 {@code openapi.yaml}은 필수라고 적었다(QA
     * 2026-09-09 D-1). 둘 다 만족하려면 "없어도 되고 있으면 맞아야 한다"가 유일한 교집합이다.
     * API-rule-03이 내려주는 {@code signRequests[].kind}는 {@code AGREE} 하나뿐이므로 다른 값은
     * 프론트가 다른 서명을 잘못 보고한 것이다 — {@code COMMON_VALIDATION_FAILED}(400)로 알린다
     * (API-payment-03 400 행 "허용되지 않는 {@code kind}"와 같은 규칙).
     */
    private static void requireAgreeKind(String kind) {
        if (kind == null) {
            return;
        }
        if (!AGREE_KIND.equals(kind.trim().toUpperCase(Locale.ROOT))) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
    }

    private static String nextActionOf(String status) {
        return switch (status) {
            case "PENDING" -> "SIGN";
            case "SIGNING" -> "WAIT";
            default -> "NONE";
        };
    }
}
