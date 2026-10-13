package com.ssafy.b204.recommendation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.dto.PerformanceDtos.PerformanceListItem;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.recommendation.dto.RecommendationDtos.RecommendationItem;
import com.ssafy.b204.recommendation.dto.RecommendationDtos.RecommendationResponse;
import com.ssafy.b204.recommendation.entity.MemberPreferredGenre;
import com.ssafy.b204.recommendation.entity.RecommendationBasis;
import com.ssafy.b204.recommendation.entity.RecommendationLog;
import com.ssafy.b204.recommendation.repository.MemberPreferredGenreRepository;
import com.ssafy.b204.recommendation.repository.RecommendationCandidateRepository;
import com.ssafy.b204.recommendation.service.RecommendationLogWriter;
import com.ssafy.b204.recommendation.service.RecommendationService;
import com.ssafy.b204.team.entity.Genre;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * API-recommendation-01 정렬·폴백 규칙(설계 §7.1).
 *
 * <p>여기서 지키는 것은 <b>순서와 basis</b>다. 겹침이 많은 공연이 먼저 오고, 폴백은 폴백이라고
 * 말한다(D-R06). 폴백을 {@code GENRE}로 위장하면 basis 별 전환율이라는 이 기능의 유일한 평가
 * 지표가 통째로 무의미해진다.
 *
 * <p>Testcontainers 를 쓰지 않는다 — 검증 대상이 SQL 이 아니라 후보를 고르고 줄 세우는 규칙이라
 * 저장소를 mock 으로 두면 규칙만 남는다.
 */
class RecommendationServiceTest {

    private static final MemberPrincipal ME = MemberPrincipal.of(7L, "me@b204.test", false);

    private MemberRepository memberRepository;
    private MemberPreferredGenreRepository preferredGenreRepository;
    private RecommendationCandidateRepository candidateRepository;
    private PerformanceParticipantRepository participantRepository;
    private TicketTypeRepository ticketTypeRepository;
    private TicketOrderRepository ticketOrderRepository;
    private PerformanceService performanceService;
    private DisplayRateService displayRateService;
    private RecommendationLogWriter logWriter;
    private RecommendationService service;
    private Member member;

    @BeforeEach
    void setUp() {
        memberRepository = mock(MemberRepository.class);
        preferredGenreRepository = mock(MemberPreferredGenreRepository.class);
        candidateRepository = mock(RecommendationCandidateRepository.class);
        participantRepository = mock(PerformanceParticipantRepository.class);
        ticketTypeRepository = mock(TicketTypeRepository.class);
        ticketOrderRepository = mock(TicketOrderRepository.class);
        performanceService = mock(PerformanceService.class);
        displayRateService = mock(DisplayRateService.class);
        logWriter = mock(RecommendationLogWriter.class);
        service = new RecommendationService(memberRepository, preferredGenreRepository,
                candidateRepository, participantRepository, ticketTypeRepository,
                ticketOrderRepository, performanceService, displayRateService, logWriter);

        member = Member.builder().email("me@b204.test").name("나")
                .authProvider(Member.AuthProvider.GOOGLE).countryCode("KR").build();
        ReflectionTestUtils.setField(member, "memberId", 7L);
        when(memberRepository.findById(7L)).thenReturn(Optional.of(member));

        when(preferredGenreRepository.findByMemberId(7L)).thenReturn(List.of());
        when(participantRepository.findWithTeamByPerformanceIdsAndStatus(anyList(),
                eq(PerformanceParticipant.Status.REGISTERED))).thenReturn(List.of());
        when(ticketTypeRepository.findByPerformance_PerformanceIdIn(anyList()))
                .thenReturn(List.of());
        when(ticketOrderRepository.countByMember_MemberIdAndStatus(anyLong(),
                eq(TicketOrder.Status.PAID))).thenReturn(0L);
        // 회원을 받는 오버로드를 쓴다 — 회원 전용 API 라 일시를 회원 시간대로 내려야 한다(§0.6).
        when(performanceService.toListItem(any(Performance.class), eq(member)))
                .thenAnswer(call -> listItem(call.getArgument(0)));
    }

    @Test
    @DisplayName("선호와 겹치는 공연이 먼저 온다 — 겹침 수 내림차순 → 공연일 오름차순")
    void ordersByOverlapThenDate() {
        prefer(Genre.ROCK, Genre.JAZZ);
        // 후보 순서는 이미 공연일 오름차순이다(리포지토리 계약).
        candidates(
                performance(1L, Genre.POP, 1),        // 겹침 0 — 가장 빠르지만 밀린다
                performance(2L, Genre.ROCK, 2),       // 겹침 1
                performance(3L, Genre.JAZZ, 3),       // 겹침 1 — 2번과 같은 겹침, 날짜로 뒤
                performance(4L, Genre.ROCK, 4, Genre.JAZZ)); // 겹침 2 — 가장 늦지만 1등

        RecommendationResponse response = service.recommend(ME);

        assertThat(response.basis()).isEqualTo(RecommendationBasis.GENRE.name());
        assertThat(response.items()).extracting(RecommendationItem::performanceId)
                .containsExactly(4L, 2L, 3L, 1L);
        // 폴백으로 채운 꼬리는 matchedGenres 가 비어 있다 — 겹쳐서 올라온 게 아니라는 표시.
        assertThat(response.items().get(0).matchedGenres())
                .containsExactlyInAnyOrder("ROCK", "JAZZ");
        assertThat(response.items().get(3).matchedGenres()).isEmpty();
        assertThat(response.sessionId()).isNotBlank();

        // 로그 행의 basis 는 응답 basis 의 사본이 아니라 그 카드의 실제 근거다 — 자리를 메우려고
        // 넣은 4번째 카드가 GENRE 로 남으면 basis 별 전환율 비교가 오염된다.
        assertThat(capturedLogs()).extracting(RecommendationLog::getBasis)
                .containsExactly(RecommendationBasis.GENRE, RecommendationBasis.GENRE,
                        RecommendationBasis.GENRE, RecommendationBasis.FALLBACK);
    }

    @Test
    @DisplayName("선호 장르가 0개면 곧 시작하는 순 폴백이고 basis=FALLBACK 이다")
    void fallsBackWhenNoPreference() {
        candidates(performance(1L, Genre.POP, 1), performance(2L, Genre.ROCK, 2));

        RecommendationResponse response = service.recommend(ME);

        assertThat(response.basis()).isEqualTo(RecommendationBasis.FALLBACK.name());
        assertThat(response.items()).extracting(RecommendationItem::performanceId)
                .containsExactly(1L, 2L);
        assertThat(response.items()).allSatisfy(
                item -> assertThat(item.matchedGenres()).isEmpty());
    }

    @Test
    @DisplayName("선호는 있는데 겹치는 공연이 하나도 없으면 basis=FALLBACK 이다")
    void fallsBackWhenNothingOverlaps() {
        prefer(Genre.CLASSICAL);
        candidates(performance(1L, Genre.POP, 1), performance(2L, Genre.ROCK, 2));

        RecommendationResponse response = service.recommend(ME);

        assertThat(response.basis()).isEqualTo(RecommendationBasis.FALLBACK.name());
        assertThat(response.items()).extracting(RecommendationItem::performanceId)
                .containsExactly(1L, 2L);
    }

    @Test
    @DisplayName("초대만 받고 수락하지 않은 팀의 장르는 겹침에 들어가지 않는다")
    void ignoresInvitedParticipantGenre() {
        prefer(Genre.JAZZ);
        Performance joint = performance(1L, Genre.POP, 1);
        candidates(joint, performance(2L, Genre.POP, 2));
        PerformanceParticipant invited = participant(joint, Genre.JAZZ);
        when(invited.isAccepted()).thenReturn(false);
        when(participantRepository.findWithTeamByPerformanceIdsAndStatus(anyList(),
                eq(PerformanceParticipant.Status.REGISTERED))).thenReturn(List.of(invited));

        RecommendationResponse response = service.recommend(ME);

        assertThat(response.basis()).isEqualTo(RecommendationBasis.FALLBACK.name());
        assertThat(response.items()).allSatisfy(
                item -> assertThat(item.matchedGenres()).isEmpty());
    }

    @Test
    @DisplayName("이미 PAID 주문한 공연은 후보에서 빠진다 — 산 표를 다시 권하지 않는다")
    void excludesAlreadyPurchased() {
        prefer(Genre.ROCK);
        candidates(performance(2L, Genre.ROCK, 2));

        RecommendationResponse response = service.recommend(ME);

        assertThat(response.items()).extracting(RecommendationItem::performanceId)
                .containsExactly(2L);
        // 제외 조건은 쿼리가 진다 — status=PAID 를 넘기지 않으면 산 공연이 그대로 다시 뜬다.
        verify(candidateRepository).findCandidates(eq(Performance.Status.ON_SALE), eq(7L),
                eq(TicketOrder.Status.PAID), any(LocalDateTime.class));
    }

    @Test
    @DisplayName("후보가 6건을 넘어도 6건까지만 내리고 로그도 6건이다")
    void capsAtSixItems() {
        prefer(Genre.ROCK);
        candidates(performance(1L, Genre.ROCK, 1), performance(2L, Genre.ROCK, 2),
                performance(3L, Genre.ROCK, 3), performance(4L, Genre.ROCK, 4),
                performance(5L, Genre.ROCK, 5), performance(6L, Genre.ROCK, 6),
                performance(7L, Genre.ROCK, 7), performance(8L, Genre.ROCK, 8));

        RecommendationResponse response = service.recommend(ME);

        assertThat(response.items()).hasSize(6);
        assertThat(response.items()).extracting(RecommendationItem::performanceId)
                .containsExactly(1L, 2L, 3L, 4L, 5L, 6L);

        List<RecommendationLog> logs = capturedLogs();
        assertThat(logs).hasSize(6);
        assertThat(logs).extracting(RecommendationLog::getPosition)
                .containsExactly(1, 2, 3, 4, 5, 6);
        assertThat(logs).allSatisfy(logRow -> {
            assertThat(logRow.getBasis()).isEqualTo(RecommendationBasis.GENRE);
            assertThat(logRow.getSessionId()).isEqualTo(response.sessionId());
            assertThat(logRow.getGenreOverlap()).isEqualTo(1);
            assertThat(logRow.getPrefCount()).isEqualTo(1);
        });
    }

    @Test
    @DisplayName("days_until 은 24시간 단위가 아니라 달력 날짜 차이다 — 내일 0시 공연은 1이다")
    void daysUntilCountsCalendarDays() {
        prefer(Genre.ROCK);
        Performance tomorrowMidnight = performance(1L, Genre.ROCK, 1);
        // 지금이 몇 시든 내일 0시까지는 24시간이 안 된다. Duration.toDays()면 0, 날짜 차이면 1.
        // 학습 라벨 조인이 DATEDIFF 라 서빙 피처도 날짜 차이여야 한다(!192 리뷰).
        ReflectionTestUtils.setField(tomorrowMidnight, "performanceAt",
                TimeSupport.nowStored().toLocalDate().plusDays(1).atStartOfDay());
        candidates(tomorrowMidnight);

        service.recommend(ME);

        assertThat(capturedLogs()).singleElement()
                .extracting(RecommendationLog::getDaysUntil).isEqualTo(1);
    }

    @Test
    @DisplayName("노출 로그 기록이 실패해도 추천은 그대로 내려간다")
    void survivesLogFailure() {
        prefer(Genre.ROCK);
        candidates(performance(1L, Genre.ROCK, 1));
        doThrow(new IllegalStateException("로그 적재 실패")).when(logWriter).writeAsync(anyList());

        RecommendationResponse response = service.recommend(ME);

        assertThat(response.basis()).isEqualTo(RecommendationBasis.GENRE.name());
        assertThat(response.items()).extracting(RecommendationItem::performanceId)
                .containsExactly(1L);
    }

    @Test
    @DisplayName("추천 항목은 공연 목록 항목의 필드를 하나도 빠뜨리지 않는다")
    void recommendationItemCarriesEveryListItemField() {
        // API v7 §14 은 추천 항목 = PerformanceListItem + matchedGenres·reason(allOf)이다.
        // 서비스가 필드를 손으로 복사하므로 목록 항목에 필드가 늘면 추천에서만 조용히 빠진다 —
        // !192 머지 직전 develop 이 ticketImageUrl 을 더했을 때 실제로 그랬다.
        List<String> listFields = Arrays.stream(PerformanceListItem.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName).toList();
        List<String> itemFields = Arrays.stream(RecommendationItem.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName).toList();

        assertThat(itemFields).containsAll(listFields);
    }

    private List<RecommendationLog> capturedLogs() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RecommendationLog>> captor = ArgumentCaptor.forClass(List.class);
        verify(logWriter).writeAsync(captor.capture());
        return captor.getValue();
    }

    // ---------------------------------------------------------------- 픽스처

    private void prefer(Genre... genres) {
        when(preferredGenreRepository.findByMemberId(7L)).thenReturn(
                Arrays.stream(genres).map(genre -> new MemberPreferredGenre(7L, genre)).toList());
    }

    private void candidates(Performance... performances) {
        when(candidateRepository.findCandidates(eq(Performance.Status.ON_SALE), eq(7L),
                eq(TicketOrder.Status.PAID), any(LocalDateTime.class)))
                .thenReturn(List.of(performances));
    }

    /**
     * 생성 팀 장르 1개 + 참여 팀 장르 0~n개를 가진 공연. {@code daysFromNow}가 커질수록 늦게
     * 열리는 공연이다 — 후보 목록의 순서가 곧 공연일 순서라는 리포지토리 계약을 흉내 낸다.
     */
    private Performance performance(Long id, Genre creatorGenre, int daysFromNow,
                                    Genre... participantGenres) {
        Team creator = Team.builder().name("팀-" + id).genre(creatorGenre).build();
        Performance performance = Performance.builder()
                .title("공연-" + id)
                // 서비스와 같은 저장 시간대 기준이다. LocalDateTime.now()는 시스템 시간대라
                // CI 가 UTC 면 days_until 이 하루씩 어긋난다(!192 리뷰).
                .performanceAt(TimeSupport.nowStored().plusDays(daysFromNow))
                .creatorTeam(creator)
                .joint(participantGenres.length > 0)
                .depositAmount(0L)
                .build();
        ReflectionTestUtils.setField(performance, "performanceId", id);
        ReflectionTestUtils.setField(performance, "status", Performance.Status.ON_SALE);
        if (participantGenres.length > 0) {
            // 참여팀 mock 을 먼저 다 만든 뒤에 stub 한다 — thenReturn 인자 안에서 또 when 을
            // 부르면 Mockito 가 스터빙이 끝나지 않았다고 본다(UnfinishedStubbingException).
            List<PerformanceParticipant> participants = Arrays.stream(participantGenres)
                    .map(genre -> participant(performance, genre)).toList();
            when(participantRepository.findWithTeamByPerformanceIdsAndStatus(anyList(),
                    eq(PerformanceParticipant.Status.REGISTERED))).thenReturn(participants);
        }
        return performance;
    }

    private static PerformanceParticipant participant(Performance performance, Genre genre) {
        PerformanceParticipant participant = mock(PerformanceParticipant.class);
        Team team = Team.builder().name("참여팀-" + genre).genre(genre).build();
        when(participant.getPerformance()).thenReturn(performance);
        when(participant.getTeam()).thenReturn(team);
        when(participant.isAccepted()).thenReturn(true);
        return participant;
    }

    private static PerformanceListItem listItem(Performance performance) {
        return new PerformanceListItem(performance.getPerformanceId(), performance.getTitle(),
                null, null, null,
                OffsetDateTime.of(performance.getPerformanceAt(), ZoneOffset.ofHours(9)),
                performance.getStatus().name(), 25_000L, "KRW", false, List.of("팀"));
    }
}
