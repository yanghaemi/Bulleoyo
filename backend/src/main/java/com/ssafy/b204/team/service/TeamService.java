package com.ssafy.b204.team.service;

import com.ssafy.b204.audit.entity.AuditLog;
import com.ssafy.b204.audit.repository.AuditLogRepository;
import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.PageInfo;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.team.dto.TeamDtos.CreateTeamRequest;
import com.ssafy.b204.team.dto.TeamDtos.CreateTeamResponse;
import com.ssafy.b204.team.dto.TeamDtos.DisbandTeamResponse;
import com.ssafy.b204.team.dto.TeamDtos.MyTeamItem;
import com.ssafy.b204.team.dto.TeamDtos.MyTeamsResponse;
import com.ssafy.b204.team.dto.TeamDtos.TeamDetailResponse;
import com.ssafy.b204.team.dto.TeamDtos.TeamSearchItem;
import com.ssafy.b204.team.dto.TeamDtos.TeamSearchResponse;
import com.ssafy.b204.team.dto.TeamDtos.UpdateTeamRequest;
import com.ssafy.b204.team.dto.TeamDtos.UpdateTeamResponse;
import com.ssafy.b204.team.dto.TeamDtos.WalletBlock;
import com.ssafy.b204.team.entity.Genre;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import com.ssafy.b204.wallet.service.WalletBalanceCache;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * team 도메인 서비스 — API v6 §2 (API-team-01~04).
 *
 * <p><b>팀 지갑 = 리더 지갑</b>이다. {@code team} 테이블에 주소 컬럼이 없고
 * {@code leader_member_id → wallet}으로 파생한다. 그래서 팀 생성의 선행 조건이 "리더에게 등록된
 * 지갑이 있는가"이며, 없으면 팀이 정산금을 받을 곳이 없다.
 *
 * <p><b>v5에서 금전 수단 필드가 전부 사라졌다.</b> 요청·응답 어디에도 계좌·수령 수단이 없고
 * API-team-07(수령 수단 등록)은 경로째 삭제됐다.
 *
 * <p>팀원 소속 개념이 없다({@code team_member} 테이블이 ERD에 없다). 팀은 리더 1인이 관리하고,
 * 밴드 멤버에게 결과를 보여주는 경로는 정산 공유 링크(API-settlement-06·07)다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TeamService {

    private final TeamRepository teamRepository;
    private final MemberRepository memberRepository;
    private final WalletRepository walletRepository;
    private final AuditLogRepository auditLogRepository;
    private final PerformanceRepository performanceRepository;
    private final SettlementRepository settlementRepository;
    private final WalletBalanceCache balanceCache;
    private final DisplayRateService displayRateService;
    private final ChainProperties chainProperties;

    // ================================================================ API-team-01

    /**
     * API-team-01 팀 생성. 만든 회원이 자동으로 리더가 되고 {@code PERFORMER} 역할을 얻는다.
     *
     * <p><b>리더 지갑 등록이 선행 조건</b>이다. 없으면 {@code WALLET_NOT_FOUND}(404)로 막고
     * C-05로 보낸다 — 전용 코드 {@code WALLET_NOT_LINKED}(409)는 §16.1 <b>신설 제안</b>이라
     * 본문에서 쓰지 않는다.
     *
     * <p>지갑을 새로 만들지 않고, 리더 지갑에 KAIA를 넣는 단계도 없다(수수료 대납).
     */
    @Transactional
    public CreateTeamResponse createTeam(MemberPrincipal me, CreateTeamRequest request) {
        Member member = requireMember(me);
        Wallet wallet = requireLinkedWallet(member.getMemberId());

        // 팀 이름은 전역 유니크가 아니다 — 동일인의 중복 생성만 막는다(명세 §2 요구사항).
        // ⚠️ 다만 ERD v5 team.name 에 UNIQUE 제약이 있어 DB는 전역 유니크를 강제한다.
        //    명세 ↔ ERD 충돌이며 산출물 "명세 확인 필요"에 적었다. 여기서는 명세대로 먼저 검사하고,
        //    DB 제약에 걸리는 경우는 GlobalExceptionHandler 가 같은 COMMON_CONFLICT 로 내린다.
        boolean duplicated = teamRepository
                .findByLeader_MemberIdAndStatus(member.getMemberId(), Team.Status.ACTIVE).stream()
                .anyMatch(team -> team.getName().equals(request.teamName()));
        if (duplicated) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT, "같은 이름의 팀이 이미 있습니다.");
        }

        Team team = teamRepository.save(Team.builder()
                .name(request.teamName())
                .genre(Genre.of(request.genre()))
                .description(request.introduction())
                .leader(member)
                .status(Team.Status.ACTIVE)
                .build());

        auditLogRepository.save(AuditLog.builder()
                .actor(member)
                .actionType(AuditLog.ActionType.STATUS_CHANGE)
                .resourceType("team")
                .resourceId(team.getTeamId())
                .requestSummary("team created: " + team.getName())
                .result(AuditLog.Result.SUCCESS)
                .build());

        return new CreateTeamResponse(
                team.getTeamId(),
                team.getName(),
                member.getMemberId(),
                wallet.getAddress(),
                wallet.getProvider().name(),
                addressExplorerUrl(wallet.getAddress()),
                TimeSupport.toOffset(team.getCreatedAt(), member.getTimezone()));
    }

    // ================================================================ API-team-02

    /**
     * API-team-02 내 팀 목록. <b>내가 리더인</b> 팀 전부. 팀이 없으면 빈 배열이다(404가 아니다).
     *
     * <p>잔액은 Redis {@code wallet:balance} 캐시값이며 <b>노드를 조회하지 않는다</b>
     * (§0.12 · PERF-01). 캐시가 비어 있으면 {@code balanceAmount}가 {@code null}이고 화면은
     * 실시간 값이 필요할 때 API-wallet-01을 호출한다.
     *
     * <p>금액은 §0.5 축약형 — 응답 루트에 {@code rate} 하나, 항목에는 {@code amount}만.
     */
    public MyTeamsResponse myTeams(MemberPrincipal me, Pageable pageable) {
        Member member = requireMember(me);
        if (pageable.getPageSize() > 100) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "한 번에 100건까지 조회할 수 있습니다.");
        }

        List<Team> teams = teamRepository
                .findByLeader_MemberIdAndStatus(member.getMemberId(), Team.Status.ACTIVE);
        Page<Team> page = paginate(teams, pageable);

        // 리더가 곧 요청자이므로 지갑은 한 번만 읽으면 된다(팀 지갑 = 리더 지갑).
        Wallet wallet = walletRepository.findByMember_MemberId(member.getMemberId()).orElse(null);
        Long balance = wallet == null ? null
                : balanceCache.get(wallet.getWalletId())
                        .map(WalletBalanceCache.CachedBalance::balance)
                        .orElse(null);

        List<MyTeamItem> items = page.getContent().stream()
                .map(team -> new MyTeamItem(
                        team.getTeamId(),
                        team.getName(),
                        team.getGenre().name(),
                        true,
                        wallet == null ? null : wallet.getAddress(),
                        balance))
                .toList();

        return new MyTeamsResponse(
                displayRateService.listRate(member.getDisplayCurrency(), member.getTimezone()),
                items,
                PageInfo.from(page));
    }

    // ================================================================ API-team-03

    /** API-team-03 팀 상세. <b>팀 리더가 아니면 조회할 수 없다</b>(SEC-03). */
    public TeamDetailResponse teamDetail(MemberPrincipal me, Long teamId) {
        Member member = requireMember(me);
        Team team = requireLedTeam(member.getMemberId(), teamId);
        // 리더 지갑 레코드가 없는 것은 비정상 상태다(팀 생성이 지갑을 요구한다) — 관리자 확인 대상.
        Wallet wallet = walletRepository.findByMember_MemberId(team.getLeader().getMemberId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.WALLET_NOT_FOUND));

        return detail(team, wallet);
    }

    // ================================================================ API-team-04

    /**
     * API-team-04 팀 수정. 리더만. 전달된 필드만 바꾼다.
     *
     * <p>리더와 지갑 주소는 이 API로 바꿀 수 없다 — 정산 주소가
     * {@code performance_participant.wallet_address} 스냅샷으로 고정되기 때문이다. 요청 DTO에
     * 그 필드가 없고, 보내면 알 수 없는 필드 거부로 400이 된다.
     */
    @Transactional
    public UpdateTeamResponse updateTeam(MemberPrincipal me, Long teamId,
                                         UpdateTeamRequest request) {
        Member member = requireMember(me);
        Team team = requireLedTeam(member.getMemberId(), teamId);
        team.update(request.teamName(), request.introduction(),
                request.genre() == null ? null : Genre.of(request.genre()));
        return new UpdateTeamResponse(team.getTeamId(), team.getName(), team.getGenre().name());
    }

    // ================================================================ API-team-06

    /** 검색어 길이 상한(명세 {@code q} 1~50자). */
    static final int SEARCH_QUERY_MAX = 50;
    /** 결과 상한(명세 {@code size} 1~10). */
    static final int SEARCH_SIZE_MAX = 10;
    /** 팀 ID 정확 일치 후보 — 숫자만. 18자리로 막아 {@code Long} 오버플로를 피한다. */
    private static final Pattern NUMERIC = Pattern.compile("\\d{1,18}");

    /**
     * API-team-06 팀 검색(2026-09-26 신설) — P-04 초대 콤보박스의 자동완성.
     *
     * <p><b>순서 = 팀 ID 정확 일치 → 이름 정확 일치 → 이름 오름차순</b>. 세 번 나눠 읽는다.
     * 한 쿼리의 {@code ORDER BY CASE}로 합치면 정확 일치가 {@code LIMIT} 안에 드는지를 DB 정렬에
     * 맡기게 되는데, 그 식이 파라미터를 품어 Hibernate·MySQL 조합마다 렌더링이 달라질 여지가 있다.
     * 발표 직전이라 단순한 쪽을 택했다 — 정확 일치 두 건은 PK·유니크 조회라 비용이 거의 없다.
     *
     * <p>해산 팀은 세 경로 모두 {@code ACTIVE}로 거른다. 검색 결과에 자기 팀·이미 초대한 팀도
     * <b>그대로 포함</b>한다 — 공연 문맥이 없는 API라 서버가 거를 근거가 없고, 화면이 "이미 초대함"
     * 같은 이유를 붙여 비활성으로 보여 주는 편이 사용자가 헷갈리지 않는다.
     */
    public TeamSearchResponse searchTeams(MemberPrincipal me, String q, Integer size) {
        requireMember(me);
        String query = q == null ? "" : q.strip();
        if (query.isEmpty() || query.length() > SEARCH_QUERY_MAX) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "검색어는 1자 이상 " + SEARCH_QUERY_MAX + "자 이하로 입력해 주세요.");
        }
        int limit = size == null ? SEARCH_SIZE_MAX : size;
        if (limit < 1 || limit > SEARCH_SIZE_MAX) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "한 번에 " + SEARCH_SIZE_MAX + "건까지 조회할 수 있습니다.");
        }

        // teamId 순서를 보존하며 중복을 지운다 — 같은 팀이 ID·이름 두 경로로 잡힐 수 있다.
        Map<Long, Team> hits = new LinkedHashMap<>();
        if (NUMERIC.matcher(query).matches()) {
            teamRepository.findById(Long.parseLong(query))
                    .filter(team -> team.getStatus() == Team.Status.ACTIVE)
                    .ifPresent(team -> hits.put(team.getTeamId(), team));
        }
        teamRepository.findByNameIgnoreCaseAndStatus(query, Team.Status.ACTIVE)
                .forEach(team -> hits.putIfAbsent(team.getTeamId(), team));
        if (hits.size() < limit) {
            teamRepository.searchByNameContaining(escapeLike(query), Team.Status.ACTIVE,
                            PageRequest.of(0, limit))
                    .forEach(team -> hits.putIfAbsent(team.getTeamId(), team));
        }

        List<TeamSearchItem> items = hits.values().stream()
                .limit(limit)
                .map(team -> new TeamSearchItem(team.getTeamId(), team.getName(),
                        team.getGenre().name()))
                .toList();
        return new TeamSearchResponse(items);
    }

    /**
     * LIKE 이스케이프 — {@code !}를 이스케이프 문자로 쓴다({@code TeamRepository#searchByNameContaining}).
     * {@code !} 자신을 먼저 바꿔야 뒤에서 넣은 {@code !}가 다시 이스케이프되지 않는다.
     */
    static String escapeLike(String raw) {
        return raw.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    // ================================================================ API-team-05

    /**
     * API-team-05 팀 해산(신설). 리더만. <b>소프트 삭제</b>다 — {@link Team#disband()}가
     * {@code status = DISBANDED} + {@code deleted_at}을 쓰고 행은 남는다.
     *
     * <p>물리 삭제하지 않는 이유는 V1 FK가 {@code RESTRICT}이고 공연·티켓·정산이 팀을 참조하기
     * 때문이다. 지우면 이미 팔린 티켓이 "어느 팀 공연인가"를 답할 수 없다.
     *
     * <p><b>세 가지를 막는다</b>(전부 {@code TEAM_HAS_ACTIVE_PERFORMANCE} 409, 이유는 {@code msg}).
     * <ul>
     *   <li>종료·취소되지 않은 공연에 주최·참여로 엮여 있다 — 관객이 이미 표를 살 수 있는 공연의
     *       수령 주체가 사라진다
     *   <li>주최한 공연의 보증금이 {@code PAID}로 남아 있다(반환 전) — 되돌려 받을 팀이 없어진다.
     *       참여팀 공연의 보증금은 그 팀 돈이 아니므로 세지 않는다
     *   <li>{@code RELEASED}에 닿지 않은 정산이 있다 — 아직 받지 않은 몫이 있다
     * </ul>
     *
     * <p>해산한 팀은 {@code findByLeader_MemberIdAndStatus(..., ACTIVE)}를 쓰는 곳에서 이미
     * 빠진다(내 팀 목록·내 공연 목록·규칙 현황). 그 호출부에 필터를 더하지 않는다.
     */
    @Transactional
    public DisbandTeamResponse disbandTeam(MemberPrincipal me, Long teamId) {
        Member member = requireMember(me);
        Team team = requireLedTeam(member.getMemberId(), teamId);
        if (team.getStatus() == Team.Status.DISBANDED) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT, "이미 해산한 팀입니다.");
        }
        requireNoOpenObligations(team);

        team.disband();
        auditLogRepository.save(AuditLog.builder()
                .actor(member)
                .actionType(AuditLog.ActionType.STATUS_CHANGE)
                .resourceType("team")
                .resourceId(team.getTeamId())
                .requestSummary("team disbanded: " + team.getName())
                .result(AuditLog.Result.SUCCESS)
                .build());

        return new DisbandTeamResponse(team.getTeamId(), team.getName(), team.getStatus().name(),
                TimeSupport.toOffset(team.getDeletedAt(), member.getTimezone()));
    }

    /** 해산 차단 3종. 걸리면 {@code TEAM_HAS_ACTIVE_PERFORMANCE}(409) + 이유가 다른 {@code msg}. */
    private void requireNoOpenObligations(Team team) {
        // 주최(creator_team)거나 REGISTERED 참여팀인 공연 전부. 제외(REMOVED)된 행은 빠진다.
        // ponytail: 한 팀의 공연은 많아야 수십 건이라 메모리에서 센다. 늘면 count 쿼리로 바꾼다.
        List<Performance> involved = performanceRepository.findByParticipatingTeamIds(
                        List.of(team.getTeamId()), PerformanceParticipant.Status.REGISTERED, null,
                        Pageable.unpaged())
                .getContent();
        if (involved.isEmpty()) {
            return;
        }

        boolean live = involved.stream().anyMatch(p -> p.getStatus() != Performance.Status.ENDED
                && p.getStatus() != Performance.Status.CANCELLED);
        if (live) {
            throw BusinessException.of(ErrorCode.TEAM_HAS_ACTIVE_PERFORMANCE,
                    "진행 중인 공연이 있어 팀을 해산할 수 없습니다. 공연을 마치거나 취소한 뒤 다시 시도해 주세요.");
        }

        boolean depositHeld = involved.stream()
                .filter(p -> p.getCreatorTeam().getTeamId().equals(team.getTeamId()))
                .anyMatch(p -> p.getDepositStatus() == Performance.DepositStatus.PAID);
        if (depositHeld) {
            throw BusinessException.of(ErrorCode.TEAM_HAS_ACTIVE_PERFORMANCE,
                    "반환되지 않은 보증금이 있어 팀을 해산할 수 없습니다.");
        }

        List<Long> performanceIds = involved.stream().map(Performance::getPerformanceId).toList();
        if (settlementRepository.countUnreleased(performanceIds, Settlement.Status.RELEASED) > 0) {
            throw BusinessException.of(ErrorCode.TEAM_HAS_ACTIVE_PERFORMANCE,
                    "정산이 끝나지 않은 공연이 있어 팀을 해산할 수 없습니다.");
        }
    }

    // ================================================================ 공통

    private TeamDetailResponse detail(Team team, Wallet wallet) {
        return new TeamDetailResponse(
                team.getTeamId(),
                team.getName(),
                team.getGenre().name(),
                team.getDescription(),
                // ⚠️ ERD v5 team 에 contact_email 컬럼이 없어 저장할 곳이 없다. 항상 null 이며
                //    명세 ↔ ERD 충돌로 산출물 "명세 확인 필요"에 적었다.
                null,
                team.getLeader().getMemberId(),
                new WalletBlock(wallet.getProvider().name(), wallet.getAddress(),
                        wallet.getStatus().name(), addressExplorerUrl(wallet.getAddress())));
    }

    private Member requireMember(MemberPrincipal me) {
        if (me == null) {
            throw BusinessException.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        return memberRepository.findById(me.memberId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID));
    }

    /** 팀 생성 선행 조건. 지갑 정지({@code SUSPENDED})는 403이다(명세 §2 4xx 표). */
    private Wallet requireLinkedWallet(Long memberId) {
        Wallet wallet = walletRepository.findByMember_MemberId(memberId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.WALLET_NOT_FOUND,
                        "지갑을 먼저 연결해 주세요."));
        if (wallet.getStatus() != Wallet.Status.LINKED) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        return wallet;
    }

    /** 없으면 {@code TEAM_NOT_FOUND}(404), 리더가 아니면 {@code COMMON_FORBIDDEN}(403). */
    private Team requireLedTeam(Long memberId, Long teamId) {
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.TEAM_NOT_FOUND));
        if (!team.isLedBy(memberId)) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        return team;
    }

    /**
     * 리더 팀은 많아야 몇 개라 목록을 메모리에서 자른다. 페이지 계약(§0.2)은 그대로 지킨다 —
     * 팀 수가 늘면 {@code TeamRepository}에 {@code Page} 조회를 추가한다.
     */
    private static Page<Team> paginate(List<Team> teams, Pageable pageable) {
        Pageable request = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        int from = (int) Math.min(request.getOffset(), teams.size());
        int to = Math.min(from + request.getPageSize(), teams.size());
        return new PageImpl<>(teams.subList(from, to), request, teams.size());
    }

    private String addressExplorerUrl(String address) {
        return chainProperties.explorerBaseUrl() + "/address/" + address;
    }
}
