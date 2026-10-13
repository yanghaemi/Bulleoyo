package com.ssafy.b204.recommendation.service;

import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.dto.PerformanceDtos.PerformanceListItem;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.entity.TicketType;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.recommendation.dto.RecommendationDtos.RecommendationItem;
import com.ssafy.b204.recommendation.dto.RecommendationDtos.RecommendationResponse;
import com.ssafy.b204.recommendation.entity.MemberPreferredGenre;
import com.ssafy.b204.recommendation.entity.RecommendationBasis;
import com.ssafy.b204.recommendation.entity.RecommendationLog;
import com.ssafy.b204.recommendation.repository.MemberPreferredGenreRepository;
import com.ssafy.b204.recommendation.repository.RecommendationCandidateRepository;
import com.ssafy.b204.team.entity.Genre;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.temporal.ChronoUnit;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * recommendation 도메인 서비스 — API v7 §14 (API-recommendation-01).
 *
 * <p>1차는 <b>장르 SQL 매칭</b>이다. 신규 회원·신규 공연 모두 이력이 없어(양쪽 콜드스타트)
 * 협업 필터링을 학습할 수 없다 — 가입 때 받은 선호 장르와 팀 장르를 맞추는 것이 우리가 가진
 * 유일한 신호다(설계 §1·§7.1).
 *
 * <p>Redis 캐시를 쓰지 않는다(D-R13). 회원마다 결과가 다르고 후보가 수십 건이라 조인 비용이
 * 5~10ms 수준이다 — 병목이 확인되지 않은 상태에서 캐시를 끼우면 정체된 추천만 얻는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RecommendationService {

    /** 홈 섹션 ④가 노출하는 카드 수. {@code recommendation_log.position}은 1~6이다. */
    private static final int MAX_ITEMS = 6;

    private final MemberRepository memberRepository;
    private final MemberPreferredGenreRepository preferredGenreRepository;
    private final RecommendationCandidateRepository candidateRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final TicketTypeRepository ticketTypeRepository;
    private final TicketOrderRepository ticketOrderRepository;
    private final PerformanceService performanceService;
    private final DisplayRateService displayRateService;
    private final RecommendationLogWriter logWriter;

    /**
     * API-recommendation-01 맞춤 추천 목록. 권한 회원.
     *
     * <p>순서: 겹침 수 내림차순 → 공연일 오름차순, 최대 6건. 선호가 0개이거나 겹침이 0건이면
     * "곧 시작하는 {@code ON_SALE}" 폴백으로 통째로 바꾸고 {@code basis=FALLBACK}이다.
     * 겹침이 6건에 못 미치면 부족분만 폴백으로 채우되 {@code basis}는 {@code GENRE}를 유지하고,
     * 채운 항목의 {@code matchedGenres}는 빈 배열이다 — 폴백을 {@code GENRE}로 위장하지 않는다
     * (D-R06).
     */
    public RecommendationResponse recommend(MemberPrincipal me) {
        if (me == null) {
            throw BusinessException.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        Member member = memberRepository.findById(me.memberId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID));
        Long memberId = member.getMemberId();
        // §0.5 축약형 — 환율은 응답 루트에 하나. 회원 전용 API 라 목록(GUEST)과 달리 회원의
        // 표시 통화·시간대를 그대로 쓴다. 유효 환율이 없으면 null 이고 키가 빠진다.
        Money.Rate rate = displayRateService.listRate(member.getDisplayCurrency(),
                member.getTimezone());

        Set<Genre> preferred = preferredGenreRepository.findByMemberId(memberId).stream()
                .map(MemberPreferredGenre::getGenre)
                .collect(java.util.stream.Collectors.toCollection(() -> EnumSet.noneOf(Genre.class)));

        // 노출 시각을 후보 조회보다 먼저 잡는다 — "이미 시작한 공연 제외"와 로그의
        // served_at·days_until 이 같은 순간을 기준으로 해야 음수 피처가 안 생긴다.
        LocalDateTime servedAt = TimeSupport.nowStored();

        // 후보는 이미 공연일 오름차순이다 — 폴백 순서가 곧 이 순서다.
        List<Performance> candidates = candidateRepository.findCandidates(
                Performance.Status.ON_SALE, memberId, TicketOrder.Status.PAID, servedAt);
        if (candidates.isEmpty()) {
            return new RecommendationResponse(RecommendationBasis.FALLBACK.name(),
                    UUID.randomUUID().toString(), rate, List.of());
        }

        Map<Long, Set<Genre>> genresByPerformance = genresOf(candidates);

        // 겹침이 있는 후보만 위로 끌어올린다. 정렬은 안정 정렬이라 겹침 수가 같으면 후보 목록의
        // 순서(= 공연일 오름차순)가 그대로 남는다 — 2차 정렬 키를 따로 쓸 필요가 없다.
        List<Performance> matched = new ArrayList<>();
        if (!preferred.isEmpty()) {
            matched = candidates.stream()
                    .filter(p -> overlapOf(preferred, genresByPerformance.get(p.getPerformanceId()))
                            > 0)
                    .sorted(Comparator.comparingInt(
                            (Performance p) -> overlapOf(preferred,
                                    genresByPerformance.get(p.getPerformanceId()))).reversed())
                    .limit(MAX_ITEMS)
                    .toList();
        }

        // 응답의 basis 와 로그 행의 basis 는 뜻이 다르다. 응답 basis 는 "이 세션을 무엇으로
        // 뽑았나"(겹침이 하나라도 있으면 GENRE), 로그 basis 는 "이 카드가 왜 거기 있나"다.
        // 응답 basis 를 여섯 행에 복사하면 6건을 못 채워 폴백으로 메운 카드까지 GENRE 로 남아
        // basis 별 전환율 비교(설계 §10)가 오염된다 — 행 basis 는 snapshots() 가 카드마다 정한다.
        RecommendationBasis basis =
                matched.isEmpty() ? RecommendationBasis.FALLBACK : RecommendationBasis.GENRE;

        // 부족분은 아직 뽑히지 않은 후보를 공연일 순으로 채운다(matchedGenres 는 빈 배열).
        List<Performance> chosen = new ArrayList<>(matched);
        Set<Long> taken = new java.util.HashSet<>(chosen.stream()
                .map(Performance::getPerformanceId).toList());
        for (Performance candidate : candidates) {
            if (chosen.size() >= MAX_ITEMS) {
                break;
            }
            if (taken.add(candidate.getPerformanceId())) {
                chosen.add(candidate);
            }
        }

        String sessionId = UUID.randomUUID().toString();

        List<RecommendationItem> items = new ArrayList<>();
        for (Performance performance : chosen) {
            // 회원 전용 API 라 일시를 회원 시간대로 내린다(§0.6 · 화면 v8 A-01 카드).
            PerformanceListItem base = performanceService.toListItem(performance, member);
            List<String> matchedGenres = matched.contains(performance)
                    ? matchedGenreNames(preferred, genresByPerformance.get(
                            performance.getPerformanceId()))
                    : List.of();
            items.add(new RecommendationItem(
                    base.performanceId(), base.title(), base.posterImageUrl(),
                    base.ticketImageUrl(), base.venueName(),
                    base.startAt(), base.status(), base.minPriceAmount(), base.currency(),
                    base.soldOut(), base.teamNames(), matchedGenres,
                    // 추천 사유는 2차(LLM) 산출물이다. 전역 non_null 직렬화라 키가 빠진다.
                    null));
        }

        // 노출 로그는 응답의 부산물이지 응답의 조건이 아니다. 피처를 뜨다 실패하든 비동기 큐가
        // 거절하든 추천은 그대로 내려간다 — 학습 데이터 한 세션을 잃는 편이 홈 화면이 500 이
        // 되는 것보다 낫다.
        try {
            logWriter.writeAsync(snapshots(memberId, chosen, items, preferred, sessionId,
                    servedAt));
        } catch (RuntimeException e) {
            log.warn("추천 노출 로그 기록 실패 — sessionId={}, memberId={}", sessionId, memberId, e);
        }

        return new RecommendationResponse(basis.name(), sessionId, rate, items);
    }

    /**
     * 공연 장르 = 생성 팀 + <b>수락한</b> 참여 팀 장르의 합집합(ERD v6 §2 team).
     *
     * <p>초대만 받은 팀도 {@code REGISTERED}라 상태만으로는 못 거른다 — 카드의 {@code teamNames}와
     * 같은 {@link PerformanceParticipant#isAccepted()} 기준을 써야 로그의 {@code genre_overlap}과
     * {@code n_teams}가 같은 팀 집합을 본다(!192 리뷰).
     *
     * <p>{@code performance}에 장르 컬럼이 없어 매 조회 시 만든다 — 컬럼으로 복제하면 참여 팀이
     * 바뀔 때마다 동기화 대상이 하나 늘 뿐이다.
     *
     * <p>2차에서는 여기에 {@code performance.tags}의 LLM 태그 장르를 합집합으로 더한다
     * (설계 §7.1 — 컬럼이 아직 없어 자리만 남긴다). 태그 덕에 겹친 항목이 하나라도 생기면
     * {@code basis}는 {@code TAGGED}가 된다.
     */
    private Map<Long, Set<Genre>> genresOf(List<Performance> candidates) {
        Map<Long, Set<Genre>> genres = new LinkedHashMap<>();
        for (Performance performance : candidates) {
            genres.computeIfAbsent(performance.getPerformanceId(),
                            id -> EnumSet.noneOf(Genre.class))
                    .add(performance.getCreatorTeam().getGenre());
        }
        participantRepository.findWithTeamByPerformanceIdsAndStatus(
                        List.copyOf(genres.keySet()), PerformanceParticipant.Status.REGISTERED)
                .stream()
                .filter(PerformanceParticipant::isAccepted)
                .forEach(participant -> genres
                        .get(participant.getPerformance().getPerformanceId())
                        .add(participant.getTeam().getGenre()));
        return genres;
    }

    private static int overlapOf(Set<Genre> preferred, Set<Genre> performanceGenres) {
        if (performanceGenres == null) {
            return 0;
        }
        return (int) performanceGenres.stream().filter(preferred::contains).count();
    }

    private static List<String> matchedGenreNames(Set<Genre> preferred, Set<Genre> genres) {
        if (genres == null) {
            return List.of();
        }
        return genres.stream().filter(preferred::contains).map(Enum::name).toList();
    }

    /**
     * 노출 6건의 피처 스냅샷. <b>서빙 시점 값</b>이라 응답을 만드는 이 자리에서 뜬다 — 남은
     * 일수·판매율은 나중에 되돌려 계산할 수 없다(설계 §4.3).
     */
    private List<RecommendationLog> snapshots(Long memberId, List<Performance> chosen,
                                              List<RecommendationItem> items,
                                              Set<Genre> preferred,
                                              String sessionId, LocalDateTime servedAt) {
        List<Long> ids = chosen.stream().map(Performance::getPerformanceId).toList();
        Map<Long, BigDecimal> soldRatios = soldRatios(ids);
        int pastOrders = (int) ticketOrderRepository
                .countByMember_MemberIdAndStatus(memberId, TicketOrder.Status.PAID);

        List<RecommendationLog> logs = new ArrayList<>();
        for (int i = 0; i < chosen.size(); i++) {
            Performance performance = chosen.get(i);
            RecommendationItem item = items.get(i);
            LocalDateTime performanceAt = performance.getPerformanceAt();
            logs.add(RecommendationLog.builder()
                    .memberId(memberId)
                    .performanceId(performance.getPerformanceId())
                    .sessionId(sessionId)
                    .position(i + 1)
                    .basis(rowBasis(item))
                    .servedAt(servedAt)
                    .genreOverlap(item.matchedGenres().size())
                    .prefCount(preferred.size())
                    // 옵션이 하나도 없는 공연은 최저가가 없다 — 피처는 NOT NULL 이라 0으로 둔다.
                    .minPrice(item.minPriceAmount() == null ? 0L : item.minPriceAmount())
                    // 달력 날짜 차이다. Duration.toDays()는 24시간 단위라 금요일 23시에 본
                    // 토요일 14시 공연이 0이 된다. 학습 쪽은 DATEDIFF(날짜 차이)로 라벨을
                    // 조인하므로 서빙 피처도 같은 정의여야 분포가 어긋나지 않는다(!192 리뷰).
                    .daysUntil((int) ChronoUnit.DAYS.between(servedAt.toLocalDate(),
                            performanceAt.toLocalDate()))
                    // 설계 §4.3 은 0=월. DayOfWeek 는 1=월이라 1을 뺀다.
                    .weekday(performanceAt.getDayOfWeek().getValue() - 1)
                    .nTeams(item.teamNames().size())
                    .isJoint(performance.isJoint())
                    .soldRatio(soldRatios.getOrDefault(performance.getPerformanceId(),
                            BigDecimal.ZERO))
                    .pastOrders(pastOrders)
                    .build());
        }
        return logs;
    }

    /**
     * 카드 한 장의 실제 근거. 겹쳐서 올라왔으면 {@code GENRE}, 자리를 메우려고 넣었으면
     * {@code FALLBACK}이다 — 폴백을 {@code GENRE}로 위장하지 않는다(D-R06).
     *
     * <p>2차는 태그 장르로 겹친 카드에 {@code TAGGED}, 3차는 랭커가 올린 카드에 {@code RANKED}를
     * 넣는다. 지금은 겹침의 출처가 팀 장르 하나뿐이라 두 값이 나올 수 없다.
     */
    private static RecommendationBasis rowBasis(RecommendationItem item) {
        return item.matchedGenres().isEmpty()
                ? RecommendationBasis.FALLBACK
                : RecommendationBasis.GENRE;
    }

    /** 판매율 = 판매 수량 합 / 총 수량 합. 옵션이 여러 개면 합계 기준이다. */
    private Map<Long, BigDecimal> soldRatios(List<Long> performanceIds) {
        Map<Long, long[]> totals = new LinkedHashMap<>();
        for (TicketType type : ticketTypeRepository
                .findByPerformance_PerformanceIdIn(performanceIds)) {
            long[] sums = totals.computeIfAbsent(
                    type.getPerformance().getPerformanceId(), id -> new long[2]);
            sums[0] += type.getSoldQuantity();
            sums[1] += type.getTotalQuantity();
        }
        Map<Long, BigDecimal> ratios = new LinkedHashMap<>();
        totals.forEach((id, sums) -> ratios.put(id, sums[1] == 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(sums[0])
                        .divide(BigDecimal.valueOf(sums[1]), 3, RoundingMode.HALF_UP)));
        return ratios;
    }
}
