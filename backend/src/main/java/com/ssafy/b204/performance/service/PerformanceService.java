package com.ssafy.b204.performance.service;

import com.ssafy.b204.audit.entity.AuditLog;
import com.ssafy.b204.audit.repository.AuditLogRepository;
import com.ssafy.b204.chain.dto.ChainDtos.SignRequest;
import com.ssafy.b204.chain.dto.ChainDtos.SignedTxRequest;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.SignRequestFactory;
import com.ssafy.b204.chain.service.ShowCreationService;
import com.ssafy.b204.chain.service.UserSignedTxService;
import com.ssafy.b204.chain.support.ChainJobIds;
import com.ssafy.b204.chain.support.ContractCalls;
import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.config.AppProperties;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.config.EntryProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.EntityLocks;
import com.ssafy.b204.common.support.Paging;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.entry.service.EntryLinkTokens;
import com.ssafy.b204.entry.support.EntryWindows;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.dto.PerformanceDtos.AcceptParticipationResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.CancelPerformanceRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.CancelPerformanceResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.CreatePerformanceRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.CreatePerformanceResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.DeletePerformanceResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.DepositBlock;
import com.ssafy.b204.performance.dto.PerformanceDtos.DepositPrepareResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.DepositSignedTxResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.EntryLinkResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.EntryWindow;
import com.ssafy.b204.performance.dto.PerformanceDtos.InviteParticipantRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.InviteParticipantResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.MyParticipatingTeam;
import com.ssafy.b204.performance.dto.PerformanceDtos.MyPerformanceItem;
import com.ssafy.b204.performance.dto.PerformanceDtos.MyPerformancesResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.ParticipantDetail;
import com.ssafy.b204.performance.dto.PerformanceDtos.ParticipantRemovedResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.ParticipantSummary;
import com.ssafy.b204.performance.dto.PerformanceDtos.ParticipantsResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.PerformanceDetailResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.PerformanceListItem;
import com.ssafy.b204.performance.dto.PerformanceDtos.PerformanceListResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.SalesStatusResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.SetTicketTypesRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.SetTicketTypesResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.TeamChoice;
import com.ssafy.b204.performance.dto.PerformanceDtos.TicketTypeDetail;
import com.ssafy.b204.performance.dto.PerformanceDtos.TicketTypeInput;
import com.ssafy.b204.performance.dto.PerformanceDtos.TicketTypeSales;
import com.ssafy.b204.performance.dto.PerformanceDtos.TicketTypeSummary;
import com.ssafy.b204.performance.dto.PerformanceDtos.UpdatePerformanceRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.UpdatePerformanceResponse;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.entity.TicketType;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.refund.service.RefundService;
import com.ssafy.b204.rule.entity.RuleAgreement;
import com.ssafy.b204.rule.repository.RuleAgreementRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.file.entity.UploadedFile;
import com.ssafy.b204.file.service.FileStorageService;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.repository.SettlementShareRepository;
import com.ssafy.b204.settlement.repository.SettlementShareRepository.ShareApproval;
import com.ssafy.b204.settlement.service.SettlementChainReader;
import com.ssafy.b204.settlement.service.SettlementJobEnqueuer;
import com.ssafy.b204.settlement.service.SettlementReconciler;
import com.ssafy.b204.settlement.service.SettlementReconciler.Reconciliation;
import com.ssafy.b204.settlement.service.SettlementReconciler.ServerAggregate;
import com.ssafy.b204.settlement.service.SettlementTeams;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.ticket.entity.Ticket;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.ticket.service.TicketStock;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import com.ssafy.b204.wallet.service.WalletBalanceService;
import com.ssafy.b204.webauthn.service.StepUpAction;
import com.ssafy.b204.webauthn.service.StepUpTokenService;
import java.time.LocalDate;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * performance 도메인 서비스 — API v6 §4.
 *
 * <p><b>구현 범위</b> — S15P21B204-47이 01(생성)·02(공개 목록)·03(공개 상세)·05(티켓 옵션)·
 * 07(참여팀 초대)·08(참여 수락)·13·14(보증금 서명 흐름)를, S15P21B204-72가 스튜디오 화면이
 * 부르는 04(수정)·06(내 공연)·09(참여팀 제외)·11(판매·선택 현황)을 채웠다.
 * <b>12(공연 취소)만 스켈레톤이다</b> — 온체인 refund 실행 경로를 refund 도메인
 * (S15P21B204-73)과 한 벌로 만든다.
 *
 * <p><b>ERD와 어긋나 우회한 곳 2개</b>(be_performance-rule-ticket-payment_endpoints.md §명세 확인 필요)
 *
 * <ul>
 *   <li>{@code endAt} — 저장 컬럼 {@code performance.end_at}을 V6이 <b>nullable</b>로 더했다.
 *       ERD v5에는 아직 없다(문서가 따라와야 한다). 기존 행을 백필하지 않았으므로 조회는
 *       저장값이 없으면 {@link EntryWindows#closesAt} 추정값으로 폴백한다.
 *       <p><b>{@code ENDED} 자동 전이·검표 링크 만료는 아직 이 값을 쓰지 않는다</b> — 계속
 *       {@code entry_end_at} 기반이라 V6 이후 행부터는 <b>응답의 종료 시각과 전이 판정이
 *       갈린다</b>. 기존 행 백필과 ERD v5 개정 뒤 후속 작업으로 옮긴다.
 *   <li>{@code participationStatus} — ERD ENUM이 {@code ('REGISTERED','REMOVED')} 2값이라
 *       명세의 {@code INVITED}/{@code ACCEPTED}를 담을 자리가 없다.
 *       {@code wallet_address}의 유무로 파생한다({@link PerformanceParticipant#participationStatus()}).
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PerformanceService {

    /** P-21 · 미결 안건 9 — 플랫폼 고정값이라 요청 필드가 아니다. */
    public static final long DEPOSIT_AMOUNT = 50_000L;

    /** §4 API-performance-07 — 참여팀 상한. 계약 문서 {@code MAX_TEAMS}와 같다. */
    public static final int MAX_PARTICIPANTS = 8;

    /** 공동 공연의 참여팀 하한(요구사항 v6 · {@code TEAM_MIN_COUNT_NOT_MET}). 생성팀을 포함해 센다. */
    public static final int MIN_JOINT_TEAMS = 2;

    /** P-6 — 1인 1공연 최대 매수. ERD에 저장 컬럼이 없어 상수로 둔다. */
    public static final int PURCHASE_LIMIT_PER_MEMBER = 4;

    /**
     * 판매 마감 = 공연 시작 <b>1분 전</b>(P-9).
     *
     * <p>종전 1시간에서 당겼다. 입장 시작(시작 60분 전, {@code EntryProperties.OPEN_BEFORE_START})과
     * 같은 시각이라 "판매가 열려 있는 동안 입장 시간대가 절대 열리지 않는다"가 성립했는데, 이제는
     * <b>시작 60분 전부터 1분 전까지 판매와 입장이 겹친다.</b> 코드가 막는 곳은 없다 — 입장은
     * {@code EntryWindows.isOpen} 만 보고, 주문·결제는 이 저장값만 본다. 겹침을 막으려면 입장
     * 상수를 같이 당겨야 하는데, 그쪽은 관객이 미리 들어오는 시간이라 건드리지 않는다.
     */
    private static final int SALE_CLOSE_MINUTES_BEFORE = 1;

    /** 취소 마감 = 공연일 D-3 00:00(P-8). */
    private static final int CANCEL_DEADLINE_DAYS_BEFORE = 3;

    /** 전액 환불 마감 = 공연일 D-7 00:00(P-8). 이후는 수수료 50%다. */
    private static final int FULL_REFUND_DAYS_BEFORE = 7;

    /** 서명 파라미터 유효 시간(§0.4 {@code expiresAt}). */
    private static final int PREPARE_TTL_MINUTES = 5;

    private static final int POLL_AFTER_MS = 1500;

    /** API-performance-12는 일괄 작업이라 폴링 간격이 길다(openapi 예시값). */
    private static final int CANCEL_POLL_AFTER_MS = 2000;

    /**
     * API-performance-03 {@code refundPolicyNotice} — 환불은 지갑 잔액으로 돌아간다(P-20).
     * 원화 출구가 없는 세계라 문구가 고정이다. {@code Accept-Language} 분기는 i18n 도입 시 붙인다.
     */
    private static final String REFUND_POLICY_NOTICE =
            "Refunds are returned to your balance in Korean won.";

    private static final int MIN_TICKET_TYPES = 1;
    private static final int MAX_TICKET_TYPES = 10;
    private static final long MAX_TICKET_PRICE = 1_000_000L;
    private static final int MAX_TICKET_QUANTITY = 5_000;

    /** 락 아래에서 최신 커밋을 다시 읽는 자리 — {@code cancel}·{@code resetAgreements} 참조. */
    @PersistenceContext
    private EntityManager em;

    /**
     * 취소를 막는 {@code RELEASE} job 상태 — {@code ChainJob.Status} 4종에서 {@code FAILED}만 뺀 것.
     * "FAILED가 아닌 것"으로 적지 않는다(막는 이유가 상태별로 다르다: 큐에 있거나 전송됐거나
     * 이미 에스크로를 비웠거나).
     */
    private static final List<ChainJob.Status> RELEASE_IN_FLIGHT =
            List.of(ChainJob.Status.PENDING, ChainJob.Status.SUBMITTED, ChainJob.Status.CONFIRMED);

    /** 아직 결말이 나지 않은 job — 공연 삭제(API-performance-18)를 막는 상태. */
    private static final List<ChainJob.Status> JOB_IN_FLIGHT =
            List.of(ChainJob.Status.PENDING, ChainJob.Status.SUBMITTED);

    /** API-performance-02 — 공개 대상 상태. {@code DRAFT}는 존재 자체를 숨긴다. */
    private static final List<Performance.Status> PUBLIC_STATUSES =
            List.of(Performance.Status.ON_SALE, Performance.Status.SALE_CLOSED);

    /** 명세의 정렬 필드 이름 → 엔티티 속성. {@code startAt}은 ERD에서 {@code performance_at}이다. */
    private static final Map<String, String> LIST_SORT =
            Map.of("startAt", "performanceAt", "createdAt", "createdAt");

    private final PerformanceRepository performanceRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final TicketTypeRepository ticketTypeRepository;
    private final RuleAgreementRepository ruleAgreementRepository;
    private final SettlementRuleRepository settlementRuleRepository;
    private final TeamRepository teamRepository;
    private final MemberRepository memberRepository;
    private final WalletRepository walletRepository;
    private final WalletBalanceService walletBalanceService;
    private final DisplayRateService displayRateService;
    private final SignRequestFactory signRequestFactory;
    private final UserSignedTxService userSignedTxService;
    private final ShowCreationService showCreationService;
    private final TicketStock ticketStock;
    private final ChainProperties chainProperties;
    private final AppProperties appProperties;
    /** 공연 생성·수정의 {@code uploadId} → 저장 경로 해석. 소유자·용도·중복 바인딩을 검증한다. */
    private final FileStorageService fileStorageService;
    private final EntryProperties entryProperties;
    private final EntryLinkTokens entryLinkTokens;
    private final AuditLogRepository auditLogRepository;
    /** API-performance-04 — 무효화된 동의의 진행 중 서명 job을 닫는다. */
    private final ChainJobRepository chainJobRepository;
    /** API-performance-11 — 판매 수량. ticket 도메인 리포지토리를 <b>고치지 않고</b> 읽기만 한다. */
    private final TicketRepository ticketRepository;
    /** API-performance-06 {@code settlementStatus}. 없으면 {@code NONE}이다. */
    private final SettlementRepository settlementRepository;
    /** API-performance-06 {@code myTeamSettlementApproved}. 페이지 단위 한 번에 읽는다. */
    private final SettlementShareRepository settlementShareRepository;
    /** API-performance-11 집계·대사의 유일한 정의. 이 도메인에서 다시 세지 않는다. */
    private final SettlementReconciler reconciler;
    /** API-performance-12 — 환불 실행은 refund 도메인 한 자리뿐이다(API-refund-02와 공용). */
    private final RefundService refundService;
    /** API-performance-12 {@code halt} 접수. 운영자 job 입구는 이것 하나다. */
    private final SettlementJobEnqueuer jobEnqueuer;
    /** API-performance-12 에스크로 확인. 못 읽었을 때를 통과로 처리하지 않는다. */
    private final SettlementChainReader chainReader;
    /** [2026-09-24] 보증금 보고 본인 확인(API v7 §7.W). 스위치가 꺼져 있으면 아무것도 하지 않는다. */
    private final StepUpTokenService stepUpTokens;

    // ================================================================ API-performance-01

    /**
     * API-performance-01 공연 생성. 생성 직후 {@code DRAFT} · {@code depositStatus=UNPAID} ·
     * {@code nextAction=PAY_DEPOSIT}이다.
     *
     * <p>취소 마감·판매 마감은 <b>요청으로 받지 않고 서버가 {@code startAt}에서 계산</b>한다
     * (P-8·P-9). 클라이언트가 정하면 환불 정책이 공연마다 달라진다.
     */
    @Transactional
    public CreatePerformanceResponse create(MemberPrincipal me, CreatePerformanceRequest request) {
        Member member = requireMember(me);
        Team team = teamRepository.findById(request.hostTeamId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.TEAM_NOT_FOUND));
        if (!team.isLedBy(member.getMemberId())) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        // [v4] 보증금 서명을 할 수 없으므로 지갑이 없으면 만들지 못한다.
        Wallet wallet = requireWallet(member.getMemberId());

        LocalDateTime startAt = toStorage(request.startAt());
        LocalDateTime endAt = toStorage(request.endAt());
        if (!startAt.isAfter(TimeSupport.nowStored()) || !endAt.isAfter(startAt)) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_DATE_INVALID);
        }

        // 새 공연이라 "같은 자리에 이미 있던 경로"가 없다 — 이미 다른 공연에 매인 uploadId 는
        // 여기서 전부 FILE_ALREADY_BOUND(409)다.
        String posterPath = fileStorageService.bind(member.getMemberId(), request.posterUploadId(),
                UploadedFile.Purpose.POSTER, null);
        String ticketImagePath = fileStorageService.bind(member.getMemberId(),
                request.ticketArtworkUploadId(), UploadedFile.Purpose.TICKET_ARTWORK, null);

        Performance performance = performanceRepository.save(Performance.builder()
                .title(request.title())
                .description(request.description())
                .posterImagePath(posterPath)
                .ticketImagePath(ticketImagePath)
                .performanceAt(startAt)
                .endAt(endAt)
                .venueName(request.venueName())
                .venueAddress(request.venueAddress())
                .creatorTeam(team)
                .joint(Boolean.TRUE.equals(request.jointPerformance()))
                .cancelDeadlineAt(cancelDeadlineOf(startAt))
                .saleCloseAt(startAt.minusMinutes(SALE_CLOSE_MINUTES_BEFORE))
                .depositAmount(DEPOSIT_AMOUNT)
                .build());

        // 생성자 팀은 자동으로 참여팀 1번이고 이미 수락 상태다 — 리더 지갑 주소를 곧바로 굳힌다.
        participantRepository.save(PerformanceParticipant.builder()
                .performance(performance)
                .team(team)
                .teamShareBp(0)
                .walletAddress(wallet.getAddress())
                .build());

        Long balance = walletBalanceService.find(wallet)
                .map(WalletBalanceService.Balance::amount).orElse(null);
        Money money = displayRateService.money(DEPOSIT_AMOUNT, member.getDisplayCurrency(),
                member.getTimezone());

        return new CreatePerformanceResponse(
                performance.getPerformanceId(),
                performance.getTitle(),
                performance.getStatus().name(),
                team.getTeamId(),
                offset(performance.getPerformanceAt(), member),
                offset(performance.getEndAt(), member),
                offset(performance.getSaleCloseAt(), member),
                offset(performance.getCancelDeadlineAt(), member),
                new DepositBlock("UNPAID", DEPOSIT_AMOUNT, Money.BASE_CURRENCY, money.display(),
                        balance, balance != null && balance >= DEPOSIT_AMOUNT),
                "PAY_DEPOSIT");
    }

    // ================================================================ API-performance-02

    /** API-performance-02 공개 목록. 권한 GUEST — {@code ON_SALE}·{@code SALE_CLOSED}만 보인다. */
    public PerformanceListResponse list(String keyword, LocalDate fromDate, LocalDate toDate,
                                        String status, Pageable pageable) {
        List<Performance.Status> statuses = publicStatuses(status);
        if (fromDate != null && toDate != null && toDate.isBefore(fromDate)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        Page<Performance> page = performanceRepository.search(
                statuses,
                keyword == null || keyword.isBlank() ? null : keyword.trim(),
                fromDate == null ? null : fromDate.atStartOfDay(),
                toDate == null ? null : toDate.atTime(LocalTime.MAX),
                PerformanceParticipant.Status.REGISTERED,
                Paging.of(pageable, LIST_SORT, Sort.by(Sort.Direction.ASC, "performanceAt")));

        List<PerformanceListItem> items = page.getContent().stream()
                .map(this::toListItem)
                .toList();
        return new PerformanceListResponse(displayRateService.listRate(null, null), items,
                PageInfo.from(page));
    }

    /**
     * 공개 목록 항목 한 줄 — <b>요청자를 모르는</b> 경우. 공개 목록(API-performance-02)은
     * GUEST 도 부르므로 일시를 기본 시간대로 내린다.
     */
    public PerformanceListItem toListItem(Performance performance) {
        return toListItem(performance, null);
    }

    /**
     * 공개 목록 항목 한 줄. 추천(API-recommendation-01)이 같은 필드를 내려야 해서
     * {@code public}이다 — 최저가·매진 판정·팀명 수집을 두 번 구현하면 두 화면의 숫자가
     * 언젠가 갈라진다.
     *
     * <p>{@code member}가 있으면 일시를 그 회원의 시간대로 내린다(§0.6). 회원 전용 API 가
     * 회원의 시간대를 알면서 기본값으로 내리면, 같은 응답의 {@code rate.asOf}와 오프셋이
     * 엇갈린다. {@code null}이면 기본 시간대다.
     */
    public PerformanceListItem toListItem(Performance performance, Member member) {
        List<TicketType> types =
                ticketTypeRepository.findByPerformance_PerformanceId(performance.getPerformanceId());
        Long minPrice = types.stream().map(TicketType::getPrice).min(Comparator.naturalOrder())
                .orElse(null);
        boolean soldOut = !types.isEmpty()
                && types.stream().allMatch(t -> remainingOf(performance, t) <= 0);
        List<String> teamNames = acceptedParticipants(performance.getPerformanceId()).stream()
                .map(p -> p.getTeam().getName())
                .toList();
        return new PerformanceListItem(
                performance.getPerformanceId(),
                performance.getTitle(),
                appProperties.uploadUrl(performance.getPosterImagePath()),
                appProperties.uploadUrl(performance.getTicketImagePath()),
                performance.getVenueName(),
                offset(performance.getPerformanceAt(), member),
                performance.getStatus().name(),
                minPrice,
                Money.BASE_CURRENCY,
                soldOut,
                teamNames);
    }

    // ================================================================ API-performance-03

    /**
     * API-performance-03 공개 상세. 권한 GUEST.
     *
     * <p>{@code DRAFT}·{@code PENDING_AGREEMENT}는 <b>관계자에게만</b> 보이고 그 밖에는
     * {@code PERFORMANCE_NOT_FOUND}로 존재를 숨긴다 — 준비 중인 공연이 검색으로 새면 안 된다.
     *
     * <p>관객 화면이라 지갑 주소·해시·컨트랙트 용어를 담지 않는다(§0.7 · P-22).
     */
    public PerformanceDetailResponse detail(Long performanceId, MemberPrincipal me) {
        Performance performance = requirePerformance(performanceId);
        if (!PUBLIC_STATUSES.contains(performance.getStatus()) && !isInsider(performance, me)) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_NOT_FOUND);
        }
        Member member = me == null ? null
                : memberRepository.findById(me.memberId()).orElse(null);

        List<ParticipantSummary> participants = acceptedParticipants(performanceId).stream()
                .map(p -> new ParticipantSummary(p.getTeam().getTeamId(), p.getTeam().getName(),
                        p.getTeam().getTeamId().equals(
                                performance.getCreatorTeam().getTeamId())))
                .toList();

        List<TicketTypeDetail> ticketTypes =
                ticketTypeRepository.findByPerformance_PerformanceId(performanceId).stream()
                        .map(t -> new TicketTypeDetail(t.getTicketTypeId(), t.getName(),
                                money(t.getPrice(), member), t.getTotalQuantity(),
                                remainingOf(performance, t)))
                        .toList();

        return new PerformanceDetailResponse(
                performance.getPerformanceId(),
                performance.getTitle(),
                performance.getDescription(),
                appProperties.uploadUrl(performance.getPosterImagePath()),
                appProperties.uploadUrl(performance.getTicketImagePath()),
                performance.getVenueName(),
                performance.getVenueAddress(),
                offset(performance.getPerformanceAt(), member),
                // 저장값(V6 end_at)이 있으면 그 값이다. 비어 있으면 EntryWindows.closesAt 으로
                // 폴백한다 — V6 이전에 만들어진 행에는 종료 일시가 없고(백필하지 않았다) null 을
                // 내려보내면 P-03 수정 화면이 필수 값 누락으로 보고 폼을 열지 못한다.
                offset(endAtOrEstimate(performance), member),
                offset(performance.getSaleCloseAt(), member),
                offset(performance.getCancelDeadlineAt(), member),
                performance.getStatus().name(),
                performance.isJoint(),
                PURCHASE_LIMIT_PER_MEMBER,
                displayRateService.listRate(
                        member == null ? null : member.getDisplayCurrency(),
                        member == null ? null : member.getTimezone()),
                participants,
                ticketTypes,
                REFUND_POLICY_NOTICE,
                appProperties.verificationUrl(performanceId));
    }

    // ================================================================ API-performance-15

    /**
     * API-performance-15 티켓 옵션 조회.
     *
     * <p>응답은 {@link #setTicketTypes}(05)와 <b>같은 shape</b>다 — P-03 수정 화면이 저장 전후로
     * 같은 값을 쓴다. 옵션이 없으면 빈 배열이다(404가 아니다 — 공연 생성 직후가 그렇다).
     *
     * <p>공개 상세(03)에도 {@code ticketTypes}가 있지만 그쪽은 관객용이라 생성자 화면이 쓰는
     * 금액 shape({@code priceAmount} 평면형)와 다르다.
     */
    @Transactional(readOnly = true)
    public SetTicketTypesResponse ticketTypes(MemberPrincipal me, Long performanceId) {
        Member member = requireMember(me);
        Performance performance = requireOwnedPerformance(performanceId, member);
        List<TicketTypeSummary> summaries = ticketTypeRepository
                .findByPerformance_PerformanceId(performance.getPerformanceId()).stream()
                .map(PerformanceService::toTicketTypeSummary)
                .toList();
        return new SetTicketTypesResponse(performance.getPerformanceId(),
                displayRateService.listRate(member.getDisplayCurrency(), member.getTimezone()),
                summaries);
    }

    private static TicketTypeSummary toTicketTypeSummary(TicketType t) {
        return new TicketTypeSummary(t.getTicketTypeId(), t.getName(), t.getPrice(),
                Money.BASE_CURRENCY, t.getTotalQuantity(), t.remainingQuantity());
    }

    // ================================================================ API-performance-05

    /**
     * API-performance-05 티켓 옵션 설정. {@code PUT}이라 <b>통째로 교체</b>한다.
     *
     * <p>가격은 YoYo 정수다({@code decimals=0}) — 소수·문자열 금액은 받지 않는다. 표시 통화로
     * 가격을 입력받지도 않는다(P-17 환율은 표시에만).
     *
     * <p>이미 팔린 수량보다 적게 줄일 수 없다. 줄이면 이미 발급된 티켓이 정원을 넘는다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public SetTicketTypesResponse setTicketTypes(MemberPrincipal me, Long performanceId,
                                                 SetTicketTypesRequest request) {
        Member member = requireMember(me);
        Performance performance = requireOwnedPerformance(performanceId, member);
        // delete 와 같은 순서로 공연 행부터 잠근다 — ticket_type 행을 쥔 채 새 행 FK 검사(공연 S락)를
        // 기다리면 공연 X락을 쥐고 ticket_type 을 지우려는 delete 와 데드락이 난다(!202 리뷰).
        // READ_COMMITTED 라 아래 기존 타입 조회가 앞선 저장이 커밋한 목록을 본다.
        EntityLocks.lockForUpdate(em, performance);
        requireModifiable(performance);

        List<TicketTypeInput> inputs = request.ticketTypes();
        if (inputs.size() < MIN_TICKET_TYPES || inputs.size() > MAX_TICKET_TYPES) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        Set<String> names = new HashSet<>();
        for (TicketTypeInput input : inputs) {
            if (!names.add(input.name().trim().toLowerCase(Locale.ROOT))
                    || input.price() < 0 || input.price() > MAX_TICKET_PRICE
                    || input.totalQuantity() < 1 || input.totalQuantity() > MAX_TICKET_QUANTITY) {
                throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
            }
        }

        List<TicketType> existing = ticketTypeRepository.findByPerformance_PerformanceId(performanceId);
        Map<Long, TicketType> byId = new LinkedHashMap<>();
        existing.forEach(t -> byId.put(t.getTicketTypeId(), t));

        List<TicketType> result = new ArrayList<>();
        Set<Long> kept = new HashSet<>();
        for (TicketTypeInput input : inputs) {
            if (input.ticketTypeId() == null) {
                result.add(ticketTypeRepository.save(TicketType.builder()
                        .performance(performance)
                        .name(input.name())
                        .price(input.price())
                        .totalQuantity(input.totalQuantity())
                        .build()));
                continue;
            }
            TicketType type = byId.get(input.ticketTypeId());
            if (type == null) {
                throw BusinessException.of(ErrorCode.TICKET_OPTION_NOT_FOUND);
            }
            if (input.totalQuantity() < type.getSoldQuantity()) {
                throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
            }
            type.replace(input.name(), input.price(), input.totalQuantity());
            kept.add(type.getTicketTypeId());
            result.add(type);
        }
        // 목록에서 빠진 기존 타입은 삭제한다. 이미 팔린 타입은 FK(RESTRICT)가 막는다.
        existing.stream()
                .filter(t -> !kept.contains(t.getTicketTypeId()))
                .forEach(t -> {
                    if (t.getSoldQuantity() > 0) {
                        throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
                    }
                    ticketTypeRepository.delete(t);
                });

        // Redis 재고 재초기화 — 판매 시작 전이라 선점된 재고가 없다.
        Map<Long, Integer> stock = new LinkedHashMap<>();
        result.forEach(t -> stock.put(t.getTicketTypeId(), t.remainingQuantity()));
        ticketStock.initialize(performanceId, stock);

        List<TicketTypeSummary> summaries = result.stream()
                .map(PerformanceService::toTicketTypeSummary)
                .toList();
        return new SetTicketTypesResponse(performanceId,
                displayRateService.listRate(member.getDisplayCurrency(), member.getTimezone()),
                summaries);
    }

    // ================================================================ API-performance-07

    /**
     * API-performance-07 참여팀 초대. 상대 팀 리더의 수락(08)으로 확정된다.
     *
     * <p><b>초대 대상 팀의 리더 지갑 연결을 여기서 확인</b>한다 — {@code createShow}의
     * {@code teamWallets}에 넣을 주소가 없으면 판매 시작 자체가 불가능하고, 그 사실을 판매 시작
     * 직전에 알면 늦다.
     *
     * <p>규칙이 설정된 뒤 초대하면 <b>기존 동의를 전부 초기화</b>한다 — 참여팀 구성이 규칙 해시의
     * 입력이기 때문이다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public InviteParticipantResponse inviteParticipant(MemberPrincipal me, Long performanceId,
                                                       InviteParticipantRequest request) {
        Member member = requireMember(me);
        Performance performance = requireOwnedPerformance(performanceId, member);
        // 공연 행부터 잠근다 — delete 와 같은 순서(!202 후속). 삭제가 먼저 끝났으면 404 다.
        EntityLocks.lockForUpdate(em, performance);
        requireModifiable(performance);

        requireParticipantsUnlocked(performanceId);

        Team invited = teamRepository.findById(request.teamId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.TEAM_NOT_FOUND));
        if (participantRepository.existsByPerformance_PerformanceIdAndTeam_TeamId(performanceId,
                invited.getTeamId())) {
            throw BusinessException.of(ErrorCode.TEAM_ALREADY_JOINED);
        }
        if (participantRepository.countByPerformance_PerformanceIdAndStatus(performanceId,
                PerformanceParticipant.Status.REGISTERED) >= MAX_PARTICIPANTS) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        // 지갑이 없는 팀은 동의 서명도 정산 수령도 할 수 없다.
        requireWallet(invited.getLeader().getMemberId());

        PerformanceParticipant participant = participantRepository.save(
                PerformanceParticipant.builder()
                        .performance(performance)
                        .team(invited)
                        .teamShareBp(0)
                        .build());
        resetAgreements(performanceId);

        return new InviteParticipantResponse(performanceId, invited.getTeamId(), invited.getName(),
                participant.participationStatus(), true,
                offset(participant.getRegisteredAt(), member));
    }

    // ================================================================ API-performance-08

    /** API-performance-08 참여 수락. 이 시점의 리더 지갑 주소를 스냅샷으로 굳힌다. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public AcceptParticipationResponse acceptParticipation(MemberPrincipal me, Long performanceId,
                                                           Long teamId) {
        Member member = requireMember(me);
        Performance performance = requirePerformance(performanceId);
        // 공연 행부터 잠근다 — delete 와 같은 순서(!202 후속). 삭제가 먼저 끝났으면 404 다.
        EntityLocks.lockForUpdate(em, performance);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.TEAM_NOT_FOUND));
        if (!team.isLedBy(member.getMemberId())) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        PerformanceParticipant participant = participantRepository
                .findByPerformance_PerformanceIdAndTeam_TeamId(performanceId, teamId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.TEAM_NOT_FOUND));
        if (performance.isOnSaleOrLater()) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_ALREADY_ON_SALE);
        }
        requireParticipantsUnlocked(performanceId);
        if (participant.isAccepted()) {
            throw BusinessException.of(ErrorCode.TEAM_ALREADY_JOINED);
        }
        Wallet wallet = requireWallet(member.getMemberId());
        participant.accept(wallet.getAddress());

        return new AcceptParticipationResponse(performanceId, teamId,
                participant.participationStatus(), wallet.getAddress(),
                wallet.getProvider().name(), "AGREE_RULES", TimeSupport.nowFor(member.getTimezone()));
    }

    // ================================================================ API-performance-13

    /**
     * API-performance-13 보증금 서명 파라미터(§0.4 {@code prepare}).
     *
     * <p>{@code signRequests}는 2건이다 — {@code APPROVE}(YoYo 사용 승인) 다음
     * {@code DEPOSIT}(RevenueSplitter 납부). allowance 조회 경로가 아직 없어
     * {@code APPROVE.required}는 보수적으로 항상 {@code true}다(모르면 건너뛰지 않는다).
     */
    // createShow job 등록은 REQUIRES_NEW 로 자기 트랜잭션에서 커밋한다 - 이쪽은 §0.4 대로
    // 도메인 상태를 바꾸지 않으므로 readOnly 를 유지한다.
    @Transactional(readOnly = true)
    public DepositPrepareResponse depositPrepare(MemberPrincipal me, Long performanceId) {
        Member member = requireMember(me);
        Performance performance = requireOwnedPerformance(performanceId, member);
        if (performance.getStatus() != Performance.Status.DRAFT
                && performance.getStatus() != Performance.Status.PENDING_AGREEMENT) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
        // 잔액 부족·규칙 미저장이 전용 코드로 빠져 이 API 의 COMMON_CONFLICT 는 이제
        // "이미 낸 보증금(PAID·RETURNED)" 하나만 뜻한다 - 화면은 depositStatus 로 이미 안다.
        if (performance.getDepositStatus() != Performance.DepositStatus.UNPAID) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        Wallet wallet = requireWallet(member.getMemberId());

        // 공동 공연 1팀은 어차피 판매 시작에서 막힌다. 그런데 그 판정이 보증금 뒤에 있으면
        // 온체인에 들어간 50,000 을 되돌릴 방법이 없다(D-63, 리허설 2). 잔액 검사와 같은 자리,
        // createShow job 을 걸기 전에 같은 판정을 한 번 더 세운다.
        if (jointTeamCountUnmet(performance, acceptedParticipants(performanceId).size())) {
            throw BusinessException.of(ErrorCode.TEAM_MIN_COUNT_NOT_MET);
        }

        long amount = performance.getDepositAmount();
        WalletBalanceService.Balance balance = walletBalanceService.require(wallet);
        if (balance.amount() < amount) {
            // msg 는 덮는다 - 부족액은 서버만 아는 값이라 코드로 옮길 수 없다(§16.1 · 명세 2382행
            // 예시). 코드가 "무엇을 할지"를, msg 가 "얼마나 모자란지"를 나른다.
            throw BusinessException.of(ErrorCode.WALLET_BALANCE_INSUFFICIENT,
                    shortfallMessage(amount, balance.amount()));
        }

        // deposit(showId) 은 컨트랙트에 공연이 등록된 뒤에만 통과한다(stage=CREATED). 아직이면
        // 운영자 createShow job 을 걸고 그 jobId 를 prerequisiteJobId 로 내려준다 - 프론트는
        // 그 job 이 CONFIRMED 가 된 뒤 서명한다(명세 2257행).
        ShowCreationService.ShowCreation creation =
                showCreationService.ensureShowCreated(performanceId, member.getMemberId());
        if (creation.notCreatable()) {
            // 규칙이 없으면 createShow 를 걸 수 없고, 그대로 서명을 내주면 deposit 이
            // ShowNotFound 로 revert 한다. msg 는 덮지 않는다 - 담을 값이 없고 문구가
            // 코드의 기본값과 같아 두 벌이 갈릴 자리만 만든다.
            throw BusinessException.of(ErrorCode.PERFORMANCE_RULES_REQUIRED);
        }
        String prerequisiteJobId = creation.prerequisiteJobId();

        Money money = displayRateService.money(amount, member.getDisplayCurrency(),
                member.getTimezone());
        List<SignRequest> signRequests = List.of(
                signRequestFactory.approve(amount, true, Map.of(
                        "title", "Allow deposit of the show deposit",
                        "amount", amount,
                        "currency", Money.BASE_CURRENCY,
                        "spender", "RevenueSplitter",
                        "spenderAddress", signRequestFactory.splitterAddress())),
                // 워커(createShow)와 **같은 파생**을 써야 한다 — performanceId 를 그대로 넣으면
                // on_chain_id 가 채워진 뒤 서로 다른 show 를 가리킨다.
                signRequestFactory.deposit(performance.onChainShowId(), Map.of(
                        "title", "Pay show deposit",
                        "amount", amount,
                        "currency", Money.BASE_CURRENCY,
                        "performanceId", performanceId)));

        return new DepositPrepareResponse(performanceId, amount, Money.BASE_CURRENCY,
                money.display(), prerequisiteJobId, signRequests,
                TimeSupport.nowFor(member.getTimezone()).plusMinutes(PREPARE_TTL_MINUTES),
                stepUpTokens.requiredFlag());
    }

    // ================================================================ API-performance-14

    /**
     * API-performance-14 보증금 tx 보고(§0.4 {@code signed-tx}). 202 + 폴링.
     *
     * <p>보고 시점에는 {@code chain_job}만 만든다. {@code deposit_status}는 <b>receipt의
     * {@code DepositPaid} 검증까지 끝난 뒤</b>에 {@code PAID}가 된다
     * ({@link com.ssafy.b204.chain.service.ChainJobConfirmationService}).
     */
    @Transactional
    public DepositSignedTxResponse depositSignedTx(MemberPrincipal me, Long performanceId,
                                                    SignedTxRequest request) {
        return depositSignedTx(me, performanceId, request, null);
    }

    /**
     * {@code stepUpToken} — [2026-09-24] 본인 확인 토큰({@code X-Step-Up-Token}, API v7 §7.W). 스위치가
     * 꺼져 있으면 읽지 않는다. 켜져 있으면 공연 소유 확인 <b>뒤</b>에 검사한다 — 남의 공연 id로 토큰을
     * 태우지 못하게. APPROVE → DEPOSIT 두 보고는 같은 토큰으로 통과한다(범위 = DEPOSIT·공연).
     */
    @Transactional
    public DepositSignedTxResponse depositSignedTx(MemberPrincipal me, Long performanceId,
                                                    SignedTxRequest request, String stepUpToken) {
        Member member = requireMember(me);
        Performance performance = requireOwnedPerformance(performanceId, member);
        stepUpTokens.guard(member.getMemberId(), StepUpAction.DEPOSIT, performanceId, stepUpToken);
        if (performance.getDepositStatus() == Performance.DepositStatus.PAID) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        Wallet wallet = requireWallet(member.getMemberId());
        // 온체인 공연이 없으면 브로드캐스트해도 ShowNotFound 로 revert 하고 대납 가스만 탄다.
        // APPROVE 는 YoYo 대상이라 공연과 무관하지만 prepare 가 둘을 한 묶음으로 내주므로 같이 막는다.
        if (!showCreationService.isCreated(performanceId)) {
            // isCreated 는 "createShow 가 CONFIRMED 인가" 하나만 본다. 규칙이 없어 job 이 생길
            // 수조차 없는 경우까지 같은 답을 주면 화면이 규칙 저장으로 보내지 못하므로,
            // prepare(API-performance-13)와 같은 코드로 가른다(S15P21B204-151).
            if (!showCreationService.hasSettlementRule(performanceId)) {
                throw BusinessException.of(ErrorCode.PERFORMANCE_RULES_REQUIRED);
            }
            // 규칙은 있는데 job 이 하나도 없다 = prepare 를 건너뛴 직접 호출이다(명세 2430행
            // "prepare 발의 기록 존재 확인"). 409 "다시 시작해 주세요"는 원인을 잘못 말한다 -
            // 저쪽은 진행 중이라는 뜻이고 여기는 시작한 적이 없다는 뜻이다. msg 를 덮는 이유는
            // 코드 기본값("요청한 정보를 찾을 수 없습니다")이 무엇을 못 찾았는지 말하지 않아
            // 화면이 막다른 곳이 되기 때문이다.
            if (!showCreationService.hasCreateShowJob(performanceId)) {
                throw BusinessException.of(ErrorCode.COMMON_NOT_FOUND,
                        "보증금 납부를 시작한 기록이 없습니다. 처음부터 다시 진행해 주세요");
            }
            // 나머지는 PENDING·SUBMITTED·FAILED 다. FAILED 는 기다려도 오지 않고
            // prepare 를 다시 부르면 새 job 이 걸리므로(ensureShowCreated 가 키를 반납한다)
            // 문구는 "기다려라"가 아니라 되는 행동을 말한다. 진행 중이면 prepare 가 멱등이라
            // 같은 job 을 돌려주고 프론트가 그 확정을 기다린다 - 다시 시작해도 손해가 없다.
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT,
                    "온체인 공연 등록이 끝나지 않았습니다. 보증금 납부를 다시 시작해 주세요");
        }

        ChainJob.TxType txType = switch (kindOf(request)) {
            case "APPROVE" -> ChainJob.TxType.APPROVE;
            case "DEPOSIT" -> ChainJob.TxType.DEPOSIT;
            default -> throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        };
        long amount = performance.getDepositAmount();
        String expectedTo = txType == ChainJob.TxType.APPROVE
                ? signRequestFactory.yoyoAddress() : signRequestFactory.splitterAddress();
        String expectedData = txType == ChainJob.TxType.APPROVE
                ? ContractCalls.approve(signRequestFactory.splitterAddress(), amount)
                : ContractCalls.deposit(performanceId);

        UserSignedTxService.Accepted accepted = userSignedTxService.accept(
                request.senderSignedRlp(),
                new UserSignedTxService.Expectation(txType, expectedTo, expectedData,
                        wallet.getAddress(), member, wallet.getWalletId(), performanceId, null,
                        amount));
        ChainJob job = accepted.job();

        return new DepositSignedTxResponse(
                ChainJobIds.toJobId(job.getChainJobId()),
                job.getStatus().name(),
                job.getSignerType().name(),
                POLL_AFTER_MS,
                performanceId,
                txType.name(),
                job.isFeeDelegated(),
                job.getTxHash(),
                explorerTxUrl(job.getTxHash()),
                txType == ChainJob.TxType.DEPOSIT ? "PAID" : performance.getDepositStatus().name());
    }

    // ================================================================ API-performance-10

    /**
     * API-performance-10 검표 페이지 링크 조회.
     *
     * <p><b>검표 담당자를 회원으로 만들지 않는다</b>(SEC-03 · P-15). 대신 이 공연에만 유효한 서명
     * 토큰을 링크에 박아 공유한다 — 그 토큰으로는 검표 2개 API 말고 아무것도 못 한다. 지갑·자금
     * API에는 접근할 수 없다([v4]).
     *
     * <p>토큰을 저장하지 않는다. {@code performanceId} + <b>버전</b> + 만료를 서명한 문자열이라
     * 같은 버전이면 몇 번을 조회해도 같은 토큰이 나온다. {@code rotate=true}가 버전을 올려 이전
     * 링크를 즉시 죽인다({@link EntryLinkTokens}).
     *
     * <p>유효기간은 <b>입장 종료 + 2시간</b>[권]이다. 입장 종료 시각은 {@code entry_end_at}이
     * 비면 추정값이다 — {@code performance.end_at} 컬럼이 ERD v5에 없다(§4-1 #1).
     */
    @Transactional
    public EntryLinkResponse entryLink(MemberPrincipal me, Long performanceId, boolean rotate) {
        Member member = requireMember(me);
        Performance performance = requirePerformance(performanceId);
        if (performance.getStatus() == Performance.Status.CANCELLED) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
        if (!isInsider(performance, me)) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        // 회전은 생성자만 — 참여팀이 남의 검표 링크를 임의로 죽이면 현장이 멈춘다.
        if (rotate && !performance.getCreatorTeam().isLedBy(member.getMemberId())) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_NOT_OWNER);
        }

        EntryLinkTokens.Version version = entryLinkTokens.issueVersion(performanceId, rotate);
        LocalDateTime opensAt = EntryWindows.opensAt(performance);
        LocalDateTime closesAt = EntryWindows.closesAt(performance, entryProperties);
        LocalDateTime expiresAt = closesAt.plus(entryProperties.linkGrace());
        String token = entryLinkTokens.issue(performanceId, version.value(),
                expiresAt.atZone(TimeSupport.STORAGE_ZONE).toInstant());

        if (version.created()) {
            // SEC-11 — 토큰 발급·재발급 사실만 남긴다. 조회는 같은 토큰의 재생이라 남기지 않는다.
            // audit_log.action_type ENUM 8종에 검표 링크 항목이 없어 STATUS_CHANGE 로 적는다(§4-3).
            auditLogRepository.save(AuditLog.builder()
                    .actor(member)
                    .actionType(AuditLog.ActionType.STATUS_CHANGE)
                    .resourceType("performance_entry_link")
                    .resourceId(performanceId)
                    .requestSummary((rotate ? "rotated" : "issued") + " entry link v"
                            + version.value())
                    .result(AuditLog.Result.SUCCESS)
                    .build());
        }

        return new EntryLinkResponse(
                performanceId,
                performance.getTitle(),
                appProperties.entryUrl(performanceId) + "?token=" + token,
                token,
                offset(expiresAt, member),
                new EntryWindow(offset(opensAt, member), offset(closesAt, member)),
                offset(TimeSupport.nowStored(), member),
                rotate);
    }

    // ================================================================ API-performance-04

    /**
     * API-performance-04 공연 수정(잠금 전). 생성자 팀 리더만 · {@code DRAFT}·
     * {@code PENDING_AGREEMENT}만({@link #requireModifiable}).
     *
     * <p><b>전 필드 선택이다</b> — {@code null}인 필드는 그대로 둔다({@link Performance#edit}).
     *
     * <p>{@code startAt}이 실제로 바뀌면 취소 마감·판매 마감을 다시 계산한다(P-8·P-9).
     * {@code endAt}은 그 둘의 입력이 아니라 저장만 한다(V6 {@code end_at}).
     *
     * <p><b>일시가 실제로 바뀌면 팀별 동의를 전부 초기화</b>한다 — 팀이 동의한 전제가 달라졌다.
     * 명세 §4 API-performance-04 요구사항이 초기화 조건을 "일시·공동 여부 변경"으로 적고
     * {@code endAt}을 일시 필드로 둔다. V6 이전에는 {@code endAt}만 바꾸는 요청이 아무것도
     * 저장하지 않아 초기화 대상이 아니었지만, 이제 실제로 저장되므로 {@code startAt}과 똑같이
     * 다룬다. 이미 납부된 보증금은 초기화 대상이 아니다(응답 {@code depositStatus} 그대로).
     *
     * <p><b>예외 하나 — 화면이 우리 추정값을 그대로 되돌려 준 요청은 저장도 초기화도 하지
     * 않는다</b>({@link #isReturnedEstimate}). 조회가 V6 이전 행에 추정값을 내려보내고 화면이
     * 그 값을 함께 PATCH하므로, 그걸 변경으로 세면 제목만 고쳐도 모든 팀이 다시 서명해야 한다.
     * <b>값이 다르면 비어 있던 행이라도 변경이다</b> — 22:00을 24:00으로 바꾼 것을 놓치면
     * 팀들이 보지 못한 일정으로 규칙이 잠긴 채 온체인에 올라간다.
     *
     * <p>(초기화는 {@code rulesHash} 때문이 아니다 — 해시 입력은 {@code performanceId}·비율·
     * 팀 지분뿐이고 일시가 없다. 명세 §4의 제품 규칙이다.)
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public UpdatePerformanceResponse update(MemberPrincipal me, Long performanceId,
                                             UpdatePerformanceRequest request) {
        Member member = requireMember(me);
        Performance performance = requireOwnedPerformance(performanceId, member);
        // 공연 행부터 잠근다 — delete 와 같은 순서(!202 후속). 삭제가 먼저 끝났으면 404 다.
        EntityLocks.lockForUpdate(em, performance);
        requireModifiable(performance);

        boolean dateChanged = false;
        if (request.startAt() != null || request.endAt() != null) {
            // 둘 다 "안 보내면 저장값 그대로"다. 그래야 startAt 만 뒤로 밀어 저장된 endAt 을
            // 넘어서는 요청도 역전으로 잡힌다.
            LocalDateTime startAt = request.startAt() == null
                    ? performance.getPerformanceAt() : toStorage(request.startAt());
            LocalDateTime endAt = request.endAt() == null
                    ? performance.getEndAt() : toStorage(request.endAt());
            if (!startAt.isAfter(TimeSupport.nowStored())
                    || (endAt != null && !endAt.isAfter(startAt))) {
                throw BusinessException.of(ErrorCode.PERFORMANCE_DATE_INVALID);
            }
            if (!startAt.equals(performance.getPerformanceAt())) {
                performance.reschedule(startAt, cancelDeadlineOf(startAt),
                        startAt.minusMinutes(SALE_CLOSE_MINUTES_BEFORE));
                dateChanged = true;
            }
            if (endAt != null && !endAt.equals(performance.getEndAt())
                    && !isReturnedEstimate(performance, endAt)) {
                performance.changeEndAt(endAt);
                dateChanged = true;
            }
        }
        // 같은 공연에 같은 이미지를 다시 저장하는 것(수정 재시도)은 허용해야 하므로 현재 경로를
        // 함께 넘긴다. 교체되면 옛 file 행은 BOUND 인 채 참조만 끊긴다(정리 대상 아님).
        String posterPath = fileStorageService.bind(member.getMemberId(), request.posterUploadId(),
                UploadedFile.Purpose.POSTER, performance.getPosterImagePath());
        String ticketImagePath = fileStorageService.bind(member.getMemberId(),
                request.ticketArtworkUploadId(), UploadedFile.Purpose.TICKET_ARTWORK,
                performance.getTicketImagePath());
        performance.edit(request.title(), request.description(), posterPath, ticketImagePath,
                request.venueName(), request.venueAddress());

        boolean agreementsReset = dateChanged && resetAgreements(performanceId);

        return new UpdatePerformanceResponse(
                performanceId,
                performance.getStatus().name(),
                offset(performance.getPerformanceAt(), member),
                offset(performance.getSaleCloseAt(), member),
                offset(performance.getCancelDeadlineAt(), member),
                agreementsReset,
                performance.getDepositStatus().name());
    }

    // ================================================================ API-performance-18

    /**
     * API-performance-18 공연 삭제(신설). 생성자 팀 리더만.
     *
     * <p><b>규칙 동의 전만 지운다</b> — {@link #requireModifiable}가 -04·-05·-07·-09와 같은
     * 게이트다(DRAFT · PENDING_AGREEMENT). {@code ON_SALE} 이후는 표가 팔렸으므로 삭제가 아니라
     * {@code POST .../cancel}(API-performance-12)의 환불 흐름을 타야 한다.
     *
     * <p><b>보증금이 {@code PAID}면 막는다.</b> 상태만 보면 {@code PENDING_AGREEMENT}인 공연도
     * 보증금을 먼저 낼 수 있는데(동의 → 보증금 순서는 서버 제약이 아니라 화면 결정이다),
     * 그 공연을 지우면 에스크로에 잠긴 코인을 돌려받을 주인이 사라진다.
     *
     * <p><b>종결되지 않은 온체인 job 이 하나라도 있으면 막는다</b>({@link #JOB_IN_FLIGHT}).
     * {@code deposit_status} 는 확정({@code CONFIRMED})돼야 {@code PAID} 가 되므로 보증금 tx 가
     * {@code PENDING}·{@code SUBMITTED} 인 동안에는 위 검사를 그냥 통과한다. 그때 지우면
     * {@code chain_job.target_performance_id} 가 {@code SET NULL} 이 되고
     * {@code ChainJobConfirmationService.confirmDeposit} 이 공연을 못 찾아 에스크로 코인이 주인
     * 없이 잠긴다. tx 타입을 열거하지 않는 이유는
     * {@link ChainJobRepository#existsByTargetPerformanceIdAndStatusIn} 참고.
     *
     * <p>물리 삭제다. 이 상태에서는 주문·티켓·정산이 붙을 수 없으므로 지울 자식은 넷뿐이고,
     * {@code chain_job.target_performance_id}는 FK가 {@code SET NULL}이라 job 기록은 남는다.
     * 온체인 {@code createShow}가 이미 걸린 공연이면 체인 쪽 show는 참조 없이 남는다 —
     * 되돌릴 방법이 컨트랙트에 없다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public DeletePerformanceResponse delete(MemberPrincipal me, Long performanceId) {
        Member member = requireMember(me);
        Performance performance = requireOwnedPerformance(performanceId, member);
        // 자식 행보다 공연 행을 먼저 잠근다 — setRule 과 같은 순서라야 서로 기다리는 데드락이
        // 없다(!202 리뷰). READ_COMMITTED 라 아래 job 검사도 락을 기다리는 동안 커밋된 job 을 본다.
        EntityLocks.lockForUpdate(em, performance);
        requireModifiable(performance);
        if (performance.isDepositPaid()) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                    "보증금을 납부한 공연은 삭제할 수 없습니다. 공연 취소로 반환받아 주세요.");
        }
        if (chainJobRepository.existsByTargetPerformanceIdAndStatusIn(performanceId,
                JOB_IN_FLIGHT)) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                    "처리 중인 온체인 작업이 있습니다. 작업이 끝난 뒤 다시 시도해 주세요.");
        }
        String title = performance.getTitle();

        ruleAgreementRepository.deleteByPerformance_PerformanceId(performanceId);
        settlementRuleRepository.deleteByPerformance_PerformanceId(performanceId);
        ticketTypeRepository.deleteByPerformance_PerformanceId(performanceId);
        participantRepository.deleteByPerformance_PerformanceId(performanceId);
        // 자식 DELETE 를 먼저 내보낸다 — FK 가 RESTRICT 라 한 배치로 묶이면 순서를 못 믿는다.
        performanceRepository.flush();
        performanceRepository.delete(performance);

        auditLogRepository.save(AuditLog.builder()
                .actor(member)
                .actionType(AuditLog.ActionType.STATUS_CHANGE)
                .resourceType("performance")
                .resourceId(performanceId)
                .requestSummary("performance deleted: " + title)
                .result(AuditLog.Result.SUCCESS)
                .build());

        return new DeletePerformanceResponse(performanceId, title);
    }

    // ================================================================ API-performance-06

    /**
     * API-performance-06 내 팀 참여 공연 목록. 권한 PERFORMER —
     * <b>회원이 리더인 팀</b>이 주최하거나 참여 중인 공연을 {@code DRAFT}~{@code CANCELLED} 전부.
     *
     * <p>리더인 팀이 하나도 없으면 {@code COMMON_FORBIDDEN}(403)이다 — 공연자가 아니다.
     * ERD v5에 팀원 테이블이 없어 "소속"의 실체가 팀 리더라는 점은 {@link #isInsider}와 같다.
     *
     * <p>{@code participationStatus}는 {@code wallet_address} 유무에서 파생한다
     * ({@link PerformanceParticipant#participationStatus()}) — ERD v5
     * {@code performance_participant.status} ENUM이 {@code ('REGISTERED','REMOVED')} 2값이라
     * 명세의 {@code INVITED}/{@code ACCEPTED}를 담을 컬럼이 없다(V2 후보 · S15P21B204-66).
     */
    public MyPerformancesResponse myPerformances(MemberPrincipal me, String status,
                                                  Pageable pageable) {
        Member member = requireMember(me);
        List<Team> myTeams = teamRepository.findByLeader_MemberIdAndStatus(member.getMemberId(),
                Team.Status.ACTIVE);
        if (myTeams.isEmpty()) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        List<Long> teamIds = myTeams.stream().map(Team::getTeamId).toList();
        Map<Long, Team> mine = new LinkedHashMap<>();
        myTeams.forEach(team -> mine.put(team.getTeamId(), team));

        Page<Performance> page = performanceRepository.findByParticipatingTeamIds(
                teamIds,
                PerformanceParticipant.Status.REGISTERED,
                myStatus(status),
                // 정렬 허용값은 startAt 하나다(§4 API-performance-06) — createdAt 은 400.
                Paging.of(pageable, Map.of("startAt", "performanceAt"),
                        Sort.by(Sort.Direction.DESC, "performanceAt")));

        // ponytail: 행마다 참여팀·동의·정산을 따로 읽는다(size ≤ 100). 대시보드 한 화면이라
        // 지금은 충분하고, 느려지면 performanceId in (...) 배치 조회로 바꾼다.
        // 정산 조기 동의는 이 페이지의 공연 id 전부를 한 번에 읽는다 — 새로 얹는 조회까지 행마다
        // 돌리지 않는다. 키는 (공연, 팀)이고 값은 approvedAt 유무다.
        List<Long> performanceIds = page.getContent().stream()
                .map(Performance::getPerformanceId)
                .toList();
        Map<List<Long>, Boolean> approvals = performanceIds.isEmpty() ? Map.of()
                : settlementShareRepository.findApprovals(performanceIds, teamIds).stream()
                        .collect(Collectors.toMap(
                                a -> List.of(a.getPerformanceId(), a.getTeamId()),
                                a -> a.getApprovedAt() != null,
                                (x, y) -> x));
        List<MyPerformanceItem> items = page.getContent().stream()
                .map(p -> toMyItem(p, mine, member, approvals))
                .toList();
        return new MyPerformancesResponse(items, PageInfo.from(page));
    }

    /**
     * 공연 한 행. <b>내가 리더인 팀이 여럿 엮여 있어도 행은 하나</b>이고, 팀은
     * {@code myParticipatingTeams} 배열로 나간다.
     *
     * <p><b>정렬 규칙 — 주최팀 우선, 그다음 {@code teamId} 오름차순.</b> 평면 필드
     * ({@code teamId}·{@code host}·{@code participationStatus}·{@code myTeamAgreementStatus}·
     * {@code pendingSignature}·{@code myTeamSettlementApproved})는 이 정렬의 <b>첫 항목</b>을 그대로 복사한 값이다(프론트 호환).
     * 이전에는 {@code findFirst()}로 아무 팀이나 골라 같은 요청이 매번 다른 팀을 가리킬 수 있었다.
     */
    private MyPerformanceItem toMyItem(Performance performance, Map<Long, Team> myTeams,
                                       Member member, Map<List<Long>, Boolean> approvals) {
        Long performanceId = performance.getPerformanceId();
        Long creatorTeamId = performance.getCreatorTeam().getTeamId();

        List<MyParticipatingTeam> teams = new ArrayList<>();
        participantRepository
                .findByPerformance_PerformanceIdAndStatus(performanceId,
                        PerformanceParticipant.Status.REGISTERED)
                .stream()
                .filter(p -> myTeams.containsKey(p.getTeam().getTeamId()))
                .sorted(Comparator
                        .comparingInt((PerformanceParticipant p) ->
                                p.getTeam().getTeamId().equals(creatorTeamId) ? 0 : 1)
                        .thenComparing(p -> p.getTeam().getTeamId()))
                .forEach(p -> teams.add(myTeamOf(performance, p.getTeam().getTeamId(),
                        p.getTeam().getName(), p.participationStatus(), approvals)));

        if (teams.isEmpty() && myTeams.containsKey(creatorTeamId)) {
            // 참여팀 행 없이 만들어진 옛 공연. 주최팀은 행이 없어도 주최팀이라 배열이 비면 안 된다 —
            // 화면이 "내 팀 없음"으로 읽고 보증금 서명 버튼을 잃는다.
            teams.add(myTeamOf(performance, creatorTeamId,
                    myTeams.get(creatorTeamId).getName(), "ACCEPTED", approvals));
        }

        String settlementStatus = settlementRepository
                .findByPerformance_PerformanceId(performanceId)
                .map(s -> s.getStatus().name())
                .orElse(Settlement.Status.NONE.name());
        // 방어. 쿼리가 "내 팀이 주최이거나 참여"인 공연만 주므로 여기까지 비어 올 수 없다.
        MyParticipatingTeam first = teams.isEmpty()
                ? new MyParticipatingTeam(creatorTeamId, performance.getCreatorTeam().getName(),
                        false, "ACCEPTED", RuleAgreement.Status.PENDING.name(), null, null)
                : teams.get(0);

        return new MyPerformanceItem(
                performanceId,
                performance.getTitle(),
                appProperties.uploadUrl(performance.getPosterImagePath()),
                appProperties.uploadUrl(performance.getTicketImagePath()),
                offset(performance.getPerformanceAt(), member),
                performance.getStatus().name(),
                settlementStatus,
                performance.getDepositStatus().name(),
                first.teamId(),
                first.host(),
                first.participationStatus(),
                first.agreementStatus(),
                first.pendingSignature(),
                first.settlementApproved(),
                teams);
    }

    private MyParticipatingTeam myTeamOf(Performance performance, Long teamId, String teamName,
                                         String participationStatus,
                                         Map<List<Long>, Boolean> approvals) {
        boolean host = performance.getCreatorTeam().getTeamId().equals(teamId);
        String agreementStatus = ruleAgreementRepository
                .findByPerformance_PerformanceIdAndTeam_TeamId(performance.getPerformanceId(),
                        teamId)
                .map(a -> a.getStatus().name())
                .orElse(RuleAgreement.Status.PENDING.name());
        return new MyParticipatingTeam(teamId, teamName, host, participationStatus,
                agreementStatus, pendingSignatureOf(performance, host, agreementStatus),
                // 정산 행·그 팀 몫이 없으면 null(키 생략). 없는 걸 미동의로 보이면 할 일이 거짓으로 뜬다.
                // 맵은 myPerformances가 페이지당 1번 읽은 것 — 팀마다 다시 조회하지 않는다.
                approvals.get(List.of(performance.getPerformanceId(), teamId)));
    }

    /**
     * 이 <b>팀</b>이 지금 서명해야 하는 것. 없으면 {@code null}.
     *
     * <p>판정이 팀 단위다 — {@code DEPOSIT}은 그 팀이 주최팀일 때만, {@code AGREE}는 그 팀의
     * 동의가 {@code PENDING}일 때만. 한 회원이 주최팀과 참여팀을 함께 이끌면 둘의 답이 다르다.
     *
     * <p>{@code TREASURY_IN}(openapi 4번째 값)은 내려주지 않는다 — 공연 단위로 판정할 근거가
     * ERD에 없다. 판매가 시작되면 서명할 것이 없다(규칙·참여팀이 컨트랙트에 잠긴다).
     */
    private static String pendingSignatureOf(Performance performance, boolean host,
                                             String agreementStatus) {
        if (!performance.isModifiable()) {
            return null;
        }
        if (host && !performance.isDepositPaid()) {
            return "DEPOSIT";
        }
        return RuleAgreement.Status.PENDING.name().equals(agreementStatus)
                && performance.getStatus() == Performance.Status.PENDING_AGREEMENT
                ? "AGREE" : null;
    }

    /** {@code status} 필터 — 6종 전부 허용한다(공개 목록과 달리 {@code DRAFT}도 내 것이다). */
    private static Performance.Status myStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return Performance.Status.valueOf(status);
        } catch (IllegalArgumentException e) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
    }

    // ================================================================ API-performance-19

    /**
     * API-performance-19 공연 참여팀 조회(신설). 권한 <b>주최팀 리더 또는 참여팀 리더</b>.
     *
     * <p>인가는 {@link #isInsider}를 그대로 쓴다 — {@code REGISTERED} 행이면 수락 전이어도
     * 통과하므로 <b>초대만 받은 팀의 리더도 조회할 수 있다</b>. {@code RuleService.ruleStatus}는
     * {@code acceptedParticipants}(수락 완료)로 판정해 더 좁다. 여기가 넓은 이유는 이 화면이
     * "초대를 수락할지 정하는" 자리이기 때문이다.
     *
     * <p>{@code REMOVED} 행은 내려주지 않는다. 제외된 팀은 이 공연의 참여팀이 아니다.
     *
     * <p>API-performance-03의 {@code participants}(관객용)는 수락 완료 팀만 담으며 <b>그대로 둔다</b>.
     */
    public ParticipantsResponse participants(MemberPrincipal me, Long performanceId) {
        Member member = requireMember(me);
        Performance performance = requirePerformance(performanceId);
        if (!isInsider(performance, me)) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        Long creatorTeamId = performance.getCreatorTeam().getTeamId();
        List<ParticipantDetail> items = participantRepository
                .findByPerformance_PerformanceIdAndStatus(performanceId,
                        PerformanceParticipant.Status.REGISTERED)
                .stream()
                .sorted(Comparator
                        .comparingInt((PerformanceParticipant p) ->
                                p.getTeam().getTeamId().equals(creatorTeamId) ? 0 : 1)
                        .thenComparing(PerformanceParticipant::getPerformanceParticipantId))
                .map(p -> new ParticipantDetail(
                        p.getTeam().getTeamId(),
                        p.getTeam().getName(),
                        p.getTeam().getTeamId().equals(creatorTeamId),
                        p.participationStatus(),
                        offset(p.getRegisteredAt(), member),
                        offset(p.getAcceptedAt(), member)))
                .toList();
        return new ParticipantsResponse(performanceId, items);
    }

    // ================================================================ API-performance-09

    /**
     * API-performance-09 참여팀 제외(잠금 전) — 초대 취소와 수락한 팀 제외를 겸한다.
     *
     * <p><b>주최 팀 자신은 제외할 수 없다</b>({@code COMMON_VALIDATION_FAILED}) — 정산의 dust
     * 귀속처가 사라지고({@link com.ssafy.b204.settlement.service.SettlementTeams}) 공연에 주인이
     * 없어진다.
     *
     * <p>제외 후 2팀 미만이 되어도 <b>제외 자체는 허용한다</b> — 판매 시작이
     * {@code TEAM_MIN_COUNT_NOT_MET}으로 막는다. 여기서 막으면 잘못 초대한 팀을 되돌릴 방법이 없다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ParticipantRemovedResponse removeParticipant(MemberPrincipal me, Long performanceId,
                                                        Long teamId) {
        Member member = requireMember(me);
        Performance performance = requireOwnedPerformance(performanceId, member);
        // 공연 행부터 잠근다 — participant 를 쥔 채 rule_agreement 를 기다리면, rule_agreement 를
        // 먼저 지우고 participant 를 기다리는 delete 와 데드락이다(!202 후속).
        EntityLocks.lockForUpdate(em, performance);
        requireModifiable(performance);
        if (performance.getCreatorTeam().getTeamId().equals(teamId)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "주최 팀은 참여팀에서 제외할 수 없습니다.");
        }
        // createShow 확정 후에는 온체인 teamWallets 를 고칠 수 없다 — 빼면 영구히 갈린다.
        requireParticipantsUnlocked(performanceId);

        PerformanceParticipant participant = participantRepository
                .findByPerformance_PerformanceIdAndTeam_TeamId(performanceId, teamId)
                .filter(p -> p.getStatus() == PerformanceParticipant.Status.REGISTERED)
                .orElseThrow(() -> BusinessException.of(ErrorCode.TEAM_NOT_FOUND));
        participant.remove();

        boolean agreementsReset = resetAgreements(performanceId);
        return new ParticipantRemovedResponse(performanceId, teamId,
                acceptedParticipants(performanceId).size(), agreementsReset);
    }

    // ================================================================ API-performance-11

    /**
     * API-performance-11 판매·선택 현황(P-07). 권한 참여팀 내부인.
     *
     * <p><b>집계를 여기서 다시 구현하지 않는다</b> — {@link SettlementReconciler}가 정산이 쓰는
     * 것과 같은 값을 낸다. 두 벌이 되면 이 화면이 "맞다"고 한 뒤 집계 확정이 막히는 일이 생긴다.
     *
     * <p>{@code counterMatched}(팀별 표)와 {@code escrowMatched}(정산 재원)는 <b>별개 필드</b>라
     * 대사기의 단일 {@code matched}를 쓰지 않고 그가 낸 배열·금액을 각각 비교한다. 비교 규칙을
     * 새로 정의하는 것이 아니라 같은 입력을 읽는 것이다.
     *
     * <p>체인을 못 읽으면({@code chainRead=false}) 두 필드는 <b>{@code null}</b>이다 —
     * {@code false}로 내려주면 화면이 "위조 발각"으로 읽는다. 화면은 그때 {@code dbCount}만
     * 그린다({@code onchainAvailable=false}).
     *
     * <p><b>온체인 30초 캐시는 붙이지 않았다</b> — 저장소에 캐시 계층(@Cacheable·CacheManager)이
     * 아직 없다. 새 인프라를 이 카드에서 만들지 않고 사실만 남긴다(be_performance-studio §캐시).
     */
    public SalesStatusResponse salesStatus(MemberPrincipal me, Long performanceId) {
        Member member = requireMember(me);
        Performance performance = requirePerformance(performanceId);
        if (!isInsider(performance, me)) {
            throw BusinessException.of(ErrorCode.SETTLEMENT_NOT_PARTICIPANT);
        }
        if (performance.getStatus() == Performance.Status.DRAFT
                || performance.getStatus() == Performance.Status.PENDING_AGREEMENT) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }

        List<PerformanceParticipant> participants = acceptedParticipants(performanceId);
        SettlementTeams teams = SettlementTeams.of(participants,
                performance.getCreatorTeam().getTeamId());
        ServerAggregate aggregate = reconciler.serverAggregate(performanceId);
        Reconciliation reconciliation =
                reconciler.reconcile(performance.getOnChainId(), teams, aggregate);

        long[] serverCounts = reconciliation.serverCounts();
        long[] chainCounts = reconciliation.onChainCounts();
        List<TeamChoice> teamChoices = new ArrayList<>();
        for (int i = 0; i < teams.size(); i++) {
            Integer onchainCount = chainCounts != null && i < chainCounts.length
                    ? Math.toIntExact(chainCounts[i]) : null;
            Integer dbCount = Math.toIntExact(serverCounts[i]);
            teamChoices.add(new TeamChoice(teams.at(i).getTeam().getTeamId(),
                    teams.at(i).getTeam().getName(), i, dbCount, onchainCount,
                    onchainCount == null ? null : onchainCount.equals(dbCount)));
        }

        List<TicketTypeSales> ticketTypes =
                ticketTypeRepository.findByPerformance_PerformanceId(performanceId).stream()
                        .map(t -> new TicketTypeSales(t.getTicketTypeId(), t.getName(),
                                t.getPrice(), t.getSoldQuantity(), remainingOf(performance, t)))
                        .toList();

        return new SalesStatusResponse(
                performanceId,
                performance.getStatus().name(),
                displayRateService.listRate(member.getDisplayCurrency(), member.getTimezone()),
                aggregate.grossRevenue(),
                aggregate.refundedAmount(),
                // 에스크로 = 순매출(gross − refunded). 보증금은 별도 계정이라 들어가지 않는다.
                aggregate.netRevenue(),
                Money.BASE_CURRENCY,
                Math.toIntExact(ticketRepository.countByPerformance_PerformanceIdAndStatusIn(
                        performanceId, List.of(Ticket.Status.ISSUED, Ticket.Status.USED))),
                Math.toIntExact(ticketRepository.countByPerformance_PerformanceIdAndStatus(
                        performanceId, Ticket.Status.CANCELLED)),
                ticketTypes,
                teamChoices,
                reconciliation.chainRead()
                        ? Arrays.equals(serverCounts, chainCounts) : null,
                reconciliation.chainRead()
                        ? Long.valueOf(reconciliation.serverNetRevenue())
                                .equals(reconciliation.onChainEscrow()) : null,
                reconciliation.chainRead(),
                splitterAddressOf(performance),
                offset(TimeSupport.nowStored(), member));
    }

    /** 이 공연이 잠긴 컨트랙트 주소. 아직 등록 전이면 설정값으로 떨어진다({@code null} 허용). */
    private String splitterAddressOf(Performance performance) {
        if (performance.getContractAddress() != null) {
            return performance.getContractAddress();
        }
        return chainProperties.contract() == null ? null
                : chainProperties.contract().splitterAddress();
    }

    // ================================================================ API-performance-12

    /**
     * API-performance-12 공연 취소(일괄 환불). 권한 생성자 팀 리더. 202 + 폴링.
     *
     * <p>온체인 순서는 <b>{@code halt(showId)} → 주문별 {@code refund} N건 → 전 건 완료 후
     * {@code returnDeposit}</b>이다. 접수 응답의 {@code jobId}는 {@code halt} job의 것이고
     * (openapi가 전체를 하나로 폴링하게 한다) refund job들은 그 뒤에 붙는다 — 워커가
     * {@code chain_job_id} 오름차순으로 집으므로 순서가 유지되고, {@code refund}는 stage
     * {@code HALTED}에서 허용되므로 이 순서가 <b>요구사항</b>이다.
     *
     * <p><b>{@code returnDeposit}은 여기서 보내지 않는다.</b> 컨트랙트가 {@code escrow == 0}을
     * 요구하므로(2026-09-07 M-04) 전 건 환불이 확정된 뒤에야 가능하고, 그 자리는
     * {@code ChainJobConfirmationService}의 refund 확정이다. 응답이
     * {@code depositReturnPlanned}(예정)인 이유다.
     *
     * <p><b>판매 전 공연도 보증금을 냈으면 받는다</b>(S15P21B204-140). 티켓·주문이 0이라 환불은
     * 0건이고 {@code halt} → {@code returnDeposit} 두 tx 만 나간다. {@code halt}를 건너뛸 수는
     * 없다 — 컨트랙트 {@code returnDeposit}은 stage ∈ {@code {RELEASED, HALTED}}를 요구하고
     * (문서 13 §4.1 11행) 판매 전 stage 는 {@code CREATED}다. 환불이 0건이면
     * {@code returnDeposit} job 을 걸어 주는 자리가 refund 확정이 아니라 halt 확정이다
     * ({@code ChainJobConfirmationService.confirmHalt}).
     *
     * <p>환불 실행 로직을 이 클래스에 복사하지 않는다 — {@link RefundService}가 개별 취소
     * (API-refund-02)와 <b>같은 자리</b>에서 {@code refund} 행과 job을 만든다.
     *
     * <p><b>격리 수준을 {@code READ_COMMITTED}로 내린다.</b> 기본 REPEATABLE READ에서는 read
     * view가 이 트랜잭션의 <b>첫 읽기</b>({@code requireMember}·{@code requireOwnedPerformance}·
     * 멱등키 조회) 시점에 고정돼, 아래 공연 행 락을 기다리는 동안 상대가 커밋한 {@code RELEASE}
     * job이 일반 조회에 보이지 않는다. READ COMMITTED는 문장마다 스냅샷을 새로 뜨므로 락에서
     * 깨어난 뒤의 조회가 상대의 커밋을 본다. 잠금 읽기({@code FOR UPDATE})로도 최신을 읽을 수
     * 있지만 {@code chain_job}은 FK 자동 인덱스가 {@code target_performance_id} 한 컬럼뿐이어서
     * (V4 복합 인덱스 전) 그 공연의 job을 {@code tx_type}과 무관하게 통째로 잠갔고, 인덱스로
     * 좁힌 뒤에도 next-key·gap 락이 남아 같은 공연의 결제·환불 insert와 워커의 상태 update가
     * 취소 커밋(온체인 RPC 포함)까지 기다린다. 격리 수준은 잠금 범위를 <b>늘리지 않는다</b> —
     * 잠금 읽기 대신 이쪽을 쓰는 이유다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public CancelPerformanceResponse cancel(MemberPrincipal me, Long performanceId,
                                             String idempotencyKey,
                                             CancelPerformanceRequest request) {
        Member member = requireMember(me);
        Performance performance = requireOwnedPerformance(performanceId, member);
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "Idempotency-Key 헤더가 필요합니다.");
        }
        String key = idempotencyKey.trim();

        // 같은 키의 재요청이면 게이트를 다시 태우지 않고 최초 응답을 재생한다(§0.8).
        // 순서가 중요하다 — 첫 요청이 공연을 CANCELLED 로 만들어 두므로, 게이트를 먼저 태우면
        // 재호출이 PERFORMANCE_INVALID_STATUS 로 떨어져 폴링할 jobId 를 잃는다.
        Optional<ChainJob> replay = chainJobRepository.findByIdempotencyKey(key);
        if (replay.isPresent()) {
            ChainJob job = replay.get();
            if (job.getTxType() != ChainJob.TxType.HALT
                    || !performanceId.equals(job.getTargetPerformanceId())) {
                throw BusinessException.of(ErrorCode.COMMON_CONFLICT,
                        "같은 요청 키가 다른 작업에 이미 사용되었습니다.");
            }
            // 대상 건수·총액은 접수 시점의 것이다. 총액은 job.amount 에 남아 있고, 티켓 수는
            // 아직 확정되지 않은 티켓 수와 같다(환불 확정이 CANCELLED 로 바꾼다).
            long stillAlive = ticketRepository.countByPerformance_PerformanceIdAndStatusIn(
                    performanceId, List.of(Ticket.Status.ISSUED, Ticket.Status.USED));
            return cancelResponse(performance, SettlementJobEnqueuer.jobId(job.getChainJobId()),
                    job.getStatus(), Math.toIntExact(stillAlive),
                    job.getAmount() == null ? 0L : job.getAmount());
        }

        // 이미 취소된 공연은 종단이다.
        // 판매 전(DRAFT·PENDING_AGREEMENT)은 보증금을 낸 공연만 받는다 — 티켓이 없으니 환불할
        // 것은 없지만 온체인 에스크로에 보증금 50,000 이 남는다. 그 회수 경로가 이 API 뿐이다
        // (S15P21B204-140. 리허설 2 의 공연 11 이 PENDING_AGREEMENT · PAID 로 묶였다).
        // 보증금이 없는 판매 전 공연은 되돌릴 돈이 정말 없으므로 그대로 거절한다.
        if (performance.getStatus() == Performance.Status.CANCELLED
                || (performance.isModifiable() && !performance.isDepositPaid())) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
        // release 가 끝나면 에스크로가 팀 지갑으로 나갔다 — 온체인에서 되돌릴 방법이 없다.
        settlementRepository.findByPerformance_PerformanceId(performanceId)
                .filter(settlement -> settlement.getStatus() == Settlement.Status.RELEASED)
                .ifPresent(settlement -> {
                    throw BusinessException.of(ErrorCode.SETTLEMENT_ALREADY_RELEASED);
                });
        // 비싼 검사는 락 앞에서 끝낸다 — 환불 총액 계산(티켓·결제 스캔)과 에스크로 조회
        // (온체인 RPC)가 락 구간에 있으면 노드가 느린 만큼 공연 행을 붙잡고, 그 사이 같은
        // 공연의 release·재취소가 전부 대기한다. 락 구간에는 DB 판정과 쓰기만 남긴다.
        // 여기서 떨어지는 요청은 어차피 아무것도 쓰지 않으므로 락 없이 거절해도 같다.
        // plan 이 낡을 수 있는 것은 이 순서 때문이 아니다 — 개별 취소(API-refund-02)는 공연 행
        // 락을 잡지 않으므로 plan 을 락 뒤로 옮겨도 그 사이 커밋을 막지 못한다. 창이 RPC 시간만큼
        // 넓어질 뿐이고, 닫으려면 주문 단위 잠금이 필요하다(별건).
        RefundService.BulkRefundPlan plan = refundService.planPerformanceCancel(performanceId);
        requireEscrow(performance, plan.totalRefundAmount());

        // 아래 검사와 markCancelled 를 한 락 구간에 넣는다 — 락이 없으면 release 게이트가
        // "CANCELLED 아님"을 본 직후 이 트랜잭션이 커밋하기 전 찰나에 RELEASE·HALT 가 함께
        // 큐에 선다(SettlementService.releaseInternal 이 같은 행을 잡는다). 멱등 재생 뒤에
        // 잡아 재호출이 락을 기다리지 않게 한다.
        // 위 requireEscrow 의 RPC 결과는 락을 얻은 시점에 낡아 있을 수 있다 — 기다리는 동안
        // release 가 에스크로를 비울 수 있기 때문이다. 그 갈래는 아래 RELEASE job 검사가 잡는다
        // (에스크로를 비우는 것은 release 뿐이고, 그 job 은 CONFIRMED 또는 selector 없는 FAILED 로
        // 남는다 — 둘 다 아래에서 막힌다).
        // 락 파인더로는 안 된다 — 이 인스턴스는 이미 영속성 컨텍스트에 있어 Hibernate 가 락 모드만
        // 올리고 필드를 덮어쓰지 않는다. 그러면 아래 재검사가 락을 기다리기 전의 status 를 본다.
        // refresh 는 같은 락을 잡으면서 DB 상태로 덮어쓴다(아직 미저장 변경이 없어 잃을 것이 없다).
        EntityLocks.lockForUpdate(em, performance);
        // 락 앞 CANCELLED 검사는 낡은 인스턴스를 본다 — 멱등키가 다른 두 취소가 나란히 들어오면
        // 둘 다 통과하고, 뒤엣것이 HALT 와 refund 를 한 벌 더 만든다(멱등 dedupe 가 전부 키 기준이라
        // 키가 다르면 뚫린다: enqueue 는 findByIdempotencyKey, 환불은 "{키}:refund:{orderId}",
        // refund 테이블 유니크도 idempotency_key 하나뿐이다). 락 아래에서 다시 본다.
        if (performance.getStatus() == Performance.Status.CANCELLED) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
        // 아직 안 나간 release 는 halt 로 못 막는다 — 워커가 chain_job_id 오름차순으로 집으므로
        // 여기서 붙는 halt 는 큐에 있던 release 뒤에 선다. release 가 먼저 나가 에스크로를
        // 팀 지갑으로 비우면 그 뒤 refund N건이 전부 자금 없이 실패하고, 관객에게 돌려줄 돈을
        // 온체인에서 되돌릴 방법이 없다. 그래서 접수 자체를 거절한다.
        // CONFIRMED 도 막는다 — 확정과 위 RELEASED 반영 사이 구간이 있어 그때 들어온 취소는
        // 두 검사를 다 통과한다. 앞의 requireEscrow 는 백스톱이 못 된다(리더가 없으면 조회 없이
        // 통과하고, 살아 있어도 이미 비워진 에스크로를 원인과 무관한 코드로 보고한다).
        // 마지막 job 하나가 아니라 존재 여부를 본다 — CONFIRMED 인 release 뒤에 두 번째
        // RELEASE job 이 붙어 FAILED 로 끝나면(정산 게이트의 in-flight 검사는 PENDING·SUBMITTED
        // 만 보므로 CONFIRMED 는 재시도를 막지 않는다) 마지막 = FAILED 가 되어 이미 에스크로를
        // 비운 CONFIRMED release 가 보이지 않는다.
        // FAILED 는 revert 가 확정된 것만 통과시키고 나머지는 전부 막는다(모르면 막는다). FAILED 로
        // 닫히는 길 중 에스크로를 비웠거나 결말을 모르는 것이 여럿이다 — 타임아웃(CHAIN_TX_TIMEOUT:
        // 브로드캐스트된 tx 가 나중에 블록에 들어갈 수 있다), sendRawTransaction 뒤 예외(노드 수락
        // 여부를 모른다), receipt 검증 통과 뒤 confirm 예외(실행됨 = 에스크로를 비웠다). 이들은 전부
        // selector 없는 코드만 남긴다(retryOrFail·markFailed(CODE)).
        // revert 확정의 표식은 failure_reason 의 selector 접미(CODE#0x…)다. 붙는 곳은
        // ChainJobWorker.pollOne 의 검증 실패 분기 하나이고, RELEASE 는 OPERATOR job 이라 RLP 가 없어
        // 검증이 status 만 본다(to·from 기대값 null) — 그 분기에 오면 receipt status 가 1 이 아니다.
        // 그래서 RELEASE 에 한해 "selector 있음 = revert 확정"이다. status 1 인데 to·from 이 어긋나
        // 재생 selector 가 붙는 경우는 USER job(RLP 보유)에만 있다 — OPERATOR job 에 to·from 대조가
        // 붙으면 이 전제가 깨지니 이 검사도 함께 고친다.
        // ponytail: selector 없이 revert 된 release(재생이 revert 안 하거나 노드가 revert data 를 안 줌)는
        // COMMON_INTERNAL_ERROR 로 남아 confirm 예외와 구분이 안 되므로 막힌다 — 그 공연은 수동 정리
        // 전까지 취소 불가다. 드물고 돈은 안전한 방향이다. 필요해지면 워커가 status 0 을 따로 기록한다.
        // tx_hash 유무로 가르면 revert 된 job 도 해시가 있어 과하게 막히고, 전송 뒤 예외는 해시가 없다.
        // 이 일반 조회가 락에서 깨어난 뒤의 최신을 보는 것은 이 메서드의 READ_COMMITTED 덕이다
        // (이유는 javadoc 마지막 단락).
        if (chainJobRepository.existsByTargetPerformanceIdAndTxTypeAndStatusIn(
                performanceId, ChainJob.TxType.RELEASE, RELEASE_IN_FLIGHT)
                || chainJobRepository.existsFailedWithoutRevertSelector(
                        performanceId, ChainJob.TxType.RELEASE)) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT,
                    "정산 실행이 진행 중이라 공연을 취소할 수 없습니다.");
        }

        SettlementJobEnqueuer.Enqueued halt = jobEnqueuer.enqueue(ChainJob.TxType.HALT,
                performanceId, plan.totalRefundAmount(), key, member.getMemberId());
        // 판매를 즉시 닫는다 — halt 확정을 기다리면 그 사이 주문이 더 들어온다.
        performance.markCancelled();
        refundService.enqueuePerformanceCancel(plan, key, member.getMemberId());
        auditLogRepository.save(AuditLog.builder()
                .actor(member)
                .actionType(AuditLog.ActionType.STATUS_CHANGE)
                .resourceType("performance")
                .resourceId(performanceId)
                .requestSummary("PERFORMANCE_CANCEL targetTicketCount="
                        + plan.targetTicketCount() + " totalRefundAmount="
                        + plan.totalRefundAmount() + " reason="
                        + (request == null ? "" : request.reason()))
                .result(AuditLog.Result.SUCCESS)
                .build());
        log.info("공연 취소 접수 — performanceId={} jobId={} 대상 {}매 총 {}원",
                performanceId, halt.jobId(), plan.targetTicketCount(),
                plan.totalRefundAmount());

        return cancelResponse(performance, halt.jobId(), halt.job().getStatus(),
                plan.targetTicketCount(), plan.totalRefundAmount());
    }

    /**
     * 접수·재생이 <b>같은 shape</b>을 내려주게 하는 자리.
     *
     * <p>{@code depositReturnPlanned}는 "예정"이다 — 보증금 반환 tx는 전 건 환불이 확정된 뒤에야
     * 나간다({@code escrow == 0} 요구, 2026-09-07 M-04).
     */
    private CancelPerformanceResponse cancelResponse(Performance performance, String jobId,
                                                      ChainJob.Status status, int targetTicketCount,
                                                      long totalRefundAmount) {
        boolean depositReturnPlanned =
                performance.getDepositStatus() == Performance.DepositStatus.PAID
                        && performance.getDepositAmount() != null
                        && performance.getDepositAmount() > 0;
        return new CancelPerformanceResponse(jobId, status.name(), CANCEL_POLL_AFTER_MS,
                performance.getPerformanceId(), targetTicketCount, totalRefundAmount,
                Money.BASE_CURRENCY, depositReturnPlanned, performance.getDepositAmount());
    }

    /**
     * 에스크로에 환불 총액이 남아 있는가 — <b>못 읽었을 때를 통과로 처리하지 않는다.</b>
     *
     * <p>체인 설정 자체가 없으면({@code isAvailable() == false}) 대사할 대상이 없으므로 건너뛴다.
     * 설정이 있는데 읽지 못한 것은 다르다 — 그때 통과시키면 되돌릴 수 없는 일괄 취소를 근거 없이
     * 접수한다. {@code showId}는 {@link Performance#onChainShowId()} 하나로 고른다.
     *
     * <p><b>온체인에 공연이 아직 없는 경우는 여기 오지 않는다.</b> {@code need}는 발권된 티켓의
     * 환불 총액이고, 판매는 {@code startSale} 확정 뒤에만 열리며 그것은 {@code createShow}
     * 확정을 선행으로 요구한다. 그래서 {@code need > 0}이면 온체인 show 가 이미 있다 —
     * 미생성 공연은 {@code need == 0}으로 위에서 돌아간다.
     */
    private void requireEscrow(Performance performance, long need) {
        if (need <= 0 || !chainReader.isAvailable()) {
            return;
        }
        Optional<Long> escrow = chainReader.escrowOf(performance.onChainShowId());
        if (escrow.isEmpty() || escrow.get() < need) {
            throw BusinessException.of(ErrorCode.COIN_ESCROW_INSUFFICIENT);
        }
    }

    // ================================================================ 상태 자동 전이(스케줄러)

    /**
     * 판매 마감·공연 종료 자동 전이 — 요구사항 명세서 v5 §공연 상태({@code performance.status}).
     *
     * <p><b>주체는 스케줄러다.</b> API v6 §4·§13에 닫기 엔드포인트가 없다. 이 전이가 없으면
     * {@link com.ssafy.b204.settlement.service.SettlementGates#aggregate}의 {@code ENDED}
     * 조건이 영구히 막혀 집계·잠금·release·검증이 통째로 도달 불가가 된다.
     *
     * <p><b>한 tick에서 두 단을 연속 처리한다.</b> 스케줄러가 멎어 있던 구간이 스스로 메워진다 —
     * 서버가 몇 시간 죽어 있다 다시 뜨면 {@code ON_SALE}로 남은 공연이 같은 실행에서
     * {@code SALE_CLOSED}를 거쳐 {@code ENDED}까지 간다. 중간 단계를 건너뛰지 않는 이유는 그
     * 구간에서만 "신규 예매 불가·기존 티켓 입장 가능"이 성립하기 때문이다
     * ({@code OrderService}가 {@code SALE_CLOSED}를 {@code TICKET_SALE_CLOSED}로 다룬다).
     *
     * <p><b>경계는 포함</b>이다 — {@code now == saleCloseAt}이면 마감한다(명세의 "도달 자동 전이").
     * {@link EntryWindows#isOpen}의 양쪽 포함 경계와 같은 약속이다.
     *
     * <p><b>{@code DRAFT}·{@code PENDING_AGREEMENT}·{@code CANCELLED}는 대상이 아니다.</b> 앞의 둘은
     * 판매가 열린 적이 없어 마감할 것이 없고, {@code CANCELLED}는 종단이다 — 되살리면 일괄
     * 환불이 끝난 공연이 판매 흐름으로 돌아온다. 이 제약을 지키는 곳은 전이 질의의
     * {@code where} 한 군데다({@link PerformanceRepository#transitionStatus}).
     *
     * <p><b>{@code ENDED}의 기준 시각은 파생값이다.</b> {@code performance}에 {@code end_at}
     * 컬럼이 없다(ERD v5 §4-1 #1 · V2 후보). {@link EntryWindows#closesAt}가 이 저장소의 유일한
     * "공연 종료 시각" 정의이므로({@code entry_end_at}, 비면
     * {@code performance_at + b204.entry.default-duration}) 새 추정을 만들지 않고 그대로 쓴다 —
     * 상태 전이와 입장 처리 종료가 같은 시각이어야 한다(상태표 "{@code ENDED} = 입장 처리 종료").
     *
     * @return 이 실행이 전이시킨 건수(한 공연이 두 단을 모두 가면 2로 센다)
     */
    @Transactional
    public int sweepStatusTransitions() {
        LocalDateTime now = TimeSupport.nowStored();
        int transitioned = 0;

        for (Performance performance : performanceRepository
                .findByStatusAndSaleCloseAtLessThanEqual(Performance.Status.ON_SALE, now)) {
            if (performanceRepository.transitionStatus(performance.getPerformanceId(),
                    Performance.Status.ON_SALE, Performance.Status.SALE_CLOSED) == 1) {
                transitioned++;
                log.info("판매 마감 자동 전이 — performanceId={} saleCloseAt={}",
                        performance.getPerformanceId(), performance.getSaleCloseAt());
            }
        }

        // 위 UPDATE 는 DB 로 바로 나간다(벌크 @Modifying) — 방금 마감한 공연이 이 질의에 잡힌다.
        for (Performance performance : performanceRepository
                .findByStatusAndPerformanceAtLessThanEqual(Performance.Status.SALE_CLOSED, now)) {
            // 공연 종료의 정본은 저장값 end_at(V6)이다. 화면이 "이 시각이 지나면 공연이 종료
            // 상태가 됩니다"라고 약속하는 값이 이것인데, 여기가 입장 종료 추정(entry_end_at 또는
            // 시작 + 3h)만 보고 있어 종료를 5분 뒤로 적어도 3시간을 기다렸다(D-79, 2026-09-21).
            // 저장값이 없는 V6 이전 행만 추정으로 판정한다 - endAtOrEstimate 가 그 폴백이다.
            if (now.isBefore(endAtOrEstimate(performance))) {
                continue;
            }
            if (performanceRepository.transitionStatus(performance.getPerformanceId(),
                    Performance.Status.SALE_CLOSED, Performance.Status.ENDED) == 1) {
                transitioned++;
                log.info("공연 종료 자동 전이 — performanceId={} performanceAt={} endAt={}",
                        performance.getPerformanceId(), performance.getPerformanceAt(),
                        endAtOrEstimate(performance));
            }
        }
        return transitioned;
    }

    // ================================================================ 공용

    /** 규칙·동의 조회에서 함께 쓴다 — {@code REGISTERED} + 수락 완료(주소 있음)만 참여팀이다. */
    /**
     * 참여팀 구성이 아직 바뀔 수 있는가 — {@code createShow} 확정 전인가.
     *
     * <p>확정 뒤에는 온체인 {@code teamWallets} 배열을 고칠 방법이 없다({@code updateRules}는
     * 비율·해시만 바꾼다 · 문서 13 §4.8). 그 뒤에 팀을 더하거나 빼면 DB 와 체인이 영구히
     * 갈리고, 주문의 {@code teamIndex}·정산 수령 주소가 통째로 어긋난다. {@code PENDING}
     * 단계는 막지 않는다 — {@code ShowCreationService}가 순서를 다시 굳힌다.
     */
    private void requireParticipantsUnlocked(Long performanceId) {
        if (showCreationService.isCreated(performanceId)) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                    "온체인에 공연이 등록되어 참여팀을 바꿀 수 없습니다.");
        }
    }

    public List<PerformanceParticipant> acceptedParticipants(Long performanceId) {
        return participantRepository
                .findByPerformance_PerformanceIdAndStatus(performanceId,
                        PerformanceParticipant.Status.REGISTERED)
                .stream()
                .filter(PerformanceParticipant::isAccepted)
                .sorted(Comparator.comparing(PerformanceParticipant::getPerformanceParticipantId))
                .toList();
    }

    /**
     * 공동 공연인데 참여팀이 {@link #MIN_JOINT_TEAMS}에 못 미치는가 — {@code TEAM_MIN_COUNT_NOT_MET}
     * 의 <b>단일 판정</b>이다.
     *
     * <p>세는 대상은 {@link #acceptedParticipants}가 돌려주는 팀이다: {@code REGISTERED} 이고
     * 지갑 주소가 굳은(= 수락 완료) 행. 생성팀도 그 행을 가지므로 <b>포함해서</b> 센다.
     *
     * <p>판정이 두 곳에 있으면 갈라진다. 판매 시작({@code RuleService.startSaleBlockedReason})과
     * 보증금 prepare({@link #depositPrepare})가 같은 답을 내야 하는데, 이전에는 판매 시작에만
     * 있어서 공동 공연 1팀이 보증금을 <b>온체인에 낸 뒤</b> 막혔다(D-63, 리허설 2). 보증금은
     * 되돌릴 수 없으므로 판정은 돈이 움직이기 전에 와야 한다.
     *
     * @param acceptedTeamCount {@link #acceptedParticipants} 크기. 호출부가 이미 목록을 들고 있으면
     *                          같은 쿼리를 두 번 내지 않도록 그 크기를 넘긴다
     */
    public static boolean jointTeamCountUnmet(Performance performance, int acceptedTeamCount) {
        return performance.isJoint() && acceptedTeamCount < MIN_JOINT_TEAMS;
    }

    public Performance requirePerformance(Long performanceId) {
        return performanceRepository.findById(performanceId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.PERFORMANCE_NOT_FOUND));
    }

    /** 생성자(주최) 팀 리더만 통과한다 — {@code PERFORMANCE_NOT_OWNER}(403). */
    public Performance requireOwnedPerformance(Long performanceId, Member member) {
        Performance performance = requirePerformance(performanceId);
        if (!performance.getCreatorTeam().isLedBy(member.getMemberId())) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_NOT_OWNER);
        }
        return performance;
    }

    /**
     * 요청자 회원 행. <b>두 실패를 갈라 던진다</b> — 클라이언트가 정반대로 움직인다.
     *
     * <ul>
     *   <li>{@code me == null} → {@code COMMON_UNAUTHORIZED} : 이 요청이 인증되지 않았다.
     *       클라이언트가 재발급을 한 번 시도한다.
     *   <li>토큰은 유효한데 <b>그 회원 행이 없다</b> → {@code AUTH_TOKEN_INVALID} : 재발급해도
     *       같은 결과다. 클라이언트가 즉시 로그아웃시켜 재로그인으로 보낸다.
     * </ul>
     *
     * 둘째를 {@code COMMON_UNAUTHORIZED}로 내면 재발급이 성공한 뒤에도 같은 401이 돌아와
     * 화면이 아무것도 못 하는 상태로 남는다. {@code MemberService}·{@code TeamService}·
     * {@code WalletService}가 이미 이 규칙을 쓴다 — 여기만 갈리면 같은 세션이 엔드포인트마다
     * 다르게 행동한다.
     */
    public Member requireMember(MemberPrincipal me) {
        if (me == null) {
            throw BusinessException.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        return memberRepository.findById(me.memberId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID));
    }

    /**
     * 지갑 미등록은 <b>{@code WALLET_NOT_FOUND}(404)</b>다 — 각 절 4xx 표의 코드다.
     * {@code WALLET_NOT_LINKED}(409)는 §16.1 신설 제안이라 쓰지 않는다.
     */
    public Wallet requireWallet(Long memberId) {
        Wallet wallet = walletRepository.findByMember_MemberId(memberId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.WALLET_NOT_FOUND));
        if (wallet.getStatus() == Wallet.Status.SUSPENDED) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        return wallet;
    }

    /** Redis 재고가 정본이고, 아직 초기화되지 않았으면 DB 값으로 근사한다(API-performance-03). */
    public int remainingOf(Performance performance, TicketType type) {
        return ticketStock.remaining(performance.getPerformanceId(), type.getTicketTypeId())
                .orElseGet(type::remainingQuantity);
    }

    public String explorerTxUrl(String txHash) {
        return txHash == null ? null : chainProperties.explorerBaseUrl() + "/tx/" + txHash;
    }

    /** 잔액 부족 안내 — 실패 응답의 {@code data}는 언제나 {@code null}이라 문구에 담는다(§0.1). */
    public static String shortfallMessage(long need, long have) {
        return "Insufficient balance · ₩" + (need - have) + " short. (need ₩" + need
                + " · have ₩" + have + ")";
    }

    /**
     * 잠금 전 변경(-04·-05·-07·-09)의 <b>단일 게이트</b>.
     *
     * <p><b>종단 상태를 먼저 거른다.</b> {@code ENDED}는 {@link Performance#isOnSaleOrLater()}에도
     * 걸리는데, API v6 §4 -04의 409 표는 {@code CANCELLED}·{@code ENDED}를
     * {@code PERFORMANCE_INVALID_STATUS}로 따로 적는다({@code PERFORMANCE_ALREADY_ON_SALE}은
     * "{@code ON_SALE} 이후"). 순서를 뒤집으면 끝난 공연이 "판매 중이라 못 바꿉니다"로 안내된다.
     *
     * <p>-05·-07의 409 표는 {@code ALREADY_ON_SALE} 한 줄뿐이고 {@code ENDED}를 언급하지 않아
     * 이 순서와 충돌하지 않는다 — 그래서 판정을 두 벌로 만들지 않고 여기 한 곳만 고쳤다.
     *
     * <p>{@code SALE_CLOSED}는 여전히 {@code ALREADY_ON_SALE}이다(판매가 열렸던 공연이고 아직
     * 끝나지 않았다). 그것이 이 정정의 경계다.
     */
    private void requireModifiable(Performance performance) {
        if (performance.isTerminal()) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
        if (performance.isOnSaleOrLater()) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_ALREADY_ON_SALE);
        }
        // 남은 것은 DRAFT·PENDING_AGREEMENT뿐이다. 상태가 늘어나도 닫힌 쪽으로 실패한다.
        if (!performance.isModifiable()) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
    }

    /**
     * 참여팀 구성·일시가 바뀌면 규칙 해시의 입력이 달라진다 — 동의를 전부 되돌린다.
     *
     * <p><b>진행 중이던 {@code SIGNING} job을 함께 {@code FAILED}로 닫는다</b>(API-performance-04).
     * {@link RuleAgreement#reset()}이 {@code chain_job_id}를 지우므로, 닫지 않으면 그 job은
     * 주인이 없는 채 남아 옛 해시의 receipt로 확정될 수 있다. 확정 경로를 건드리지 않고
     * <b>발의 쪽에서</b> 닫는 것이 안전한 방향이다.
     *
     * @return 되돌릴 동의가 실제로 있었는가(응답 {@code agreementsReset}).
     *         {@code RuleService.ensureAgreements}와 같은 정의 — {@code PENDING}이 아니었던 건이 있으면 참
     */
    private boolean resetAgreements(Long performanceId) {
        boolean reset = false;
        for (RuleAgreement agreement
                : ruleAgreementRepository.findByPerformance_PerformanceId(performanceId)) {
            if (agreement.getStatus() != RuleAgreement.Status.PENDING) {
                reset = true;
            }
            if (agreement.getStatus() == RuleAgreement.Status.SIGNING
                    && agreement.getChainJobId() != null) {
                // 잠금으로 최신 커밋을 읽은 뒤 종단을 본다 — 스냅숏으로 거르면 다른 인스턴스의 AGREE
                // 확정 커밋을 기다렸다가 CONFIRMED 를 FAILED 로 덮는다(S15P21B204-119). 락 파인더가
                // 아니라 refresh 인 이유는 cancel 의 같은 자리와 같다(영속성 컨텍스트에 있으면 필드를
                // 갱신하지 않는다).
                chainJobRepository.findById(agreement.getChainJobId()).ifPresent(job -> {
                    em.refresh(job, LockModeType.PESSIMISTIC_WRITE);
                    if (!job.isTerminal()) {
                        job.markFailed("규칙 동의 전제가 바뀌어 서명을 무효화했습니다(API-performance-04·09).");
                    }
                });
            }
            agreement.reset();
        }
        return reset;
    }

    /**
     * 참여팀 내부인 판정 — 생성자 팀 리더 또는 참여팀 리더.
     *
     * <p>entry 도메인이 그대로 쓴다(API-entry-01·02의 "참여팀 소속 회원" 경로). ERD v5에 팀원
     * 테이블이 없어 <b>"소속"의 실체는 팀 리더</b>다({@code team.leader_member_id}).
     */
    public boolean isInsider(Performance performance, MemberPrincipal me) {
        if (me == null) {
            return false;
        }
        if (performance.getCreatorTeam().isLedBy(me.memberId())) {
            return true;
        }
        return participantRepository
                .findByPerformance_PerformanceIdAndStatus(performance.getPerformanceId(),
                        PerformanceParticipant.Status.REGISTERED)
                .stream()
                .anyMatch(p -> p.getTeam().isLedBy(me.memberId()));
    }

    private List<Performance.Status> publicStatuses(String status) {
        if (status == null || status.isBlank()) {
            return PUBLIC_STATUSES;
        }
        Performance.Status parsed;
        try {
            parsed = Performance.Status.valueOf(status);
        } catch (IllegalArgumentException e) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        if (!PUBLIC_STATUSES.contains(parsed)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        return List.of(parsed);
    }

    private static String kindOf(SignedTxRequest request) {
        if (request == null || request.kind() == null || request.senderSignedRlp() == null
                || request.senderSignedRlp().isBlank()) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        return request.kind().trim().toUpperCase(Locale.ROOT);
    }

    /**
     * 취소 마감 = 공연일 D-3의 00:00(P-8). 날짜 기준이라 시각은 자정으로 자른다.
     *
     * <p><b>이 계산의 유일한 정의다</b> — refund 도메인(API-refund-01·02)이 같은 값을 써야
     * 미리보기의 마감 시각과 실행의 차단 시점이 갈리지 않는다.
     */
    public static LocalDateTime cancelDeadlineOf(LocalDateTime startAt) {
        return startAt.toLocalDate().minusDays(CANCEL_DEADLINE_DAYS_BEFORE).atStartOfDay();
    }

    /** 전액 환불 마감 = 공연일 D-7의 00:00(P-8). 이 시각 이후는 수수료 50%다. */
    public static LocalDateTime fullRefundUntilOf(LocalDateTime startAt) {
        return startAt.toLocalDate().minusDays(FULL_REFUND_DAYS_BEFORE).atStartOfDay();
    }

    private static LocalDateTime toStorage(OffsetDateTime value) {
        return value.atZoneSameInstant(TimeSupport.STORAGE_ZONE).toLocalDateTime();
    }

    /**
     * 응답에 내보낼 공연 종료 일시 — 저장값({@code end_at}, V6) 우선, 없으면
     * {@link EntryWindows#closesAt} 추정값.
     *
     * <p>폴백이 필요한 이유는 V6 이전 행에 값이 없기 때문이다(nullable 추가 · 백필 없음).
     * ERD v5 에 {@code end_at} 이 아직 없어 문서가 따라올 때까지 이 폴백을 유지한다.
     */
    private LocalDateTime endAtOrEstimate(Performance performance) {
        return performance.getEndAt() != null ? performance.getEndAt()
                : EntryWindows.closesAt(performance, entryProperties);
    }

    /**
     * 화면이 <b>우리가 방금 내려보낸 추정값을 그대로 되돌려 준 것</b>인가 — 저장돼 있던 값이
     * 없고, 들어온 값이 {@link #endAtOrEstimate} 와 분 단위까지 같을 때다.
     *
     * <p>V6 이전 행은 {@code end_at} 이 비어 있고 상세 조회가 추정값을 대신 내려보낸다.
     * P-03 수정 화면은 그 값을 폼에 담아 <b>제목만 고쳐도 {@code endAt} 을 함께 PATCH</b> 한다.
     * 그 요청은 종료 시각을 바꾸겠다는 뜻이 아니므로 저장하지도, 동의를 되돌리지도 않는다.
     *
     * <p><b>같은 값일 때만이다.</b> 주최자가 22:00 을 24:00 으로 진짜로 바꾸면 비어 있던
     * 행이라도 변경으로 센다 — 팀들이 보지 못한 일정으로 규칙이 잠긴 채 온체인에 올라가면 안 된다.
     *
     * <p>추정값을 저장하지 않는 이유는 V6 이 백필을 거부한 이유와 같다 — 저장해 버리면
     * "서버가 추정한 값" 과 "주최자가 입력한 값" 을 구분할 수 없고, {@code entry_end_at} 이
     * 채워진 행에서는 <b>입장 종료가 공연 종료로 굳는다</b>({@link EntryWindows} 머리말이
     * 정본으로 쓰지 말라고 적은 그 값이다).
     *
     * <p>분 단위로 비교하는 것은 화면 입력이 분 정밀도이기 때문이다 — 추정값의 초·나노가
     * 왕복에서 잘려 돌아온다.
     */
    private boolean isReturnedEstimate(Performance performance, LocalDateTime endAt) {
        return performance.getEndAt() == null
                && endAt.truncatedTo(ChronoUnit.MINUTES)
                        .equals(endAtOrEstimate(performance).truncatedTo(ChronoUnit.MINUTES));
    }

    private OffsetDateTime offset(LocalDateTime value, Member member) {
        return TimeSupport.toOffset(value, member == null ? null : member.getTimezone());
    }

    private Money money(long amount, Member member) {
        return displayRateService.money(amount, member == null ? null : member.getDisplayCurrency(),
                member == null ? null : member.getTimezone());
    }
}
