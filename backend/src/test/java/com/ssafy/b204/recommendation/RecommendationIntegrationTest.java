package com.ssafy.b204.recommendation;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.recommendation.dto.RecommendationDtos.RecommendationItem;
import com.ssafy.b204.recommendation.dto.RecommendationDtos.RecommendationResponse;
import com.ssafy.b204.recommendation.entity.MemberPreferredGenre;
import com.ssafy.b204.recommendation.repository.MemberPreferredGenreRepository;
import com.ssafy.b204.recommendation.repository.RecommendationCandidateRepository;
import com.ssafy.b204.recommendation.service.RecommendationService;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.team.entity.Genre;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * API-recommendation-01 실 DB 검증 — 단위 테스트({@link RecommendationServiceTest})가 mock 이라
 * 못 보는 두 가지를 MySQL 위에서 고정한다(S15P21B204-180 QA 테스트 공백).
 *
 * <ul>
 *   <li>후보 JPQL 의 {@code not exists (… PAID)} · {@code performanceAt > now} 가 실제로 거른다.
 *   <li>D-R06 — 겹침이 6건에 못 미치면 폴백으로 채우되 응답 basis 는 GENRE, 채운 카드의
 *       matchedGenres 는 빈 배열, 노출 로그의 카드 basis 는 FALLBACK.
 * </ul>
 *
 * <p>컨테이너 DB 는 전 테스트가 공유해 다른 테스트가 남긴 ON_SALE 공연이 섞인다. 그래서 "후보가
 * 정확히 이것"이 아니라 <b>내가 만든 공연이 들어가는가/빠지는가</b>만 단정한다.
 */
class RecommendationIntegrationTest extends IntegrationTestBase {

    @Autowired private RecommendationCandidateRepository candidateRepository;
    @Autowired private RecommendationService recommendationService;
    @Autowired private MemberPreferredGenreRepository preferredGenreRepository;
    @Autowired private MemberRepository memberRepository;
    @Autowired private TeamRepository teamRepository;
    @Autowired private TicketOrderRepository ticketOrderRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("후보: 이 회원이 PAID 로 산 공연·시작 시각이 지난 공연은 빠지고, PAID 가 아닌 주문만 있으면 남는다")
    void candidatesExcludePaidAndStartedPerformances() {
        Team team = team(Genre.ROCK);
        Member buyer = member();
        Member other = member();
        LocalDateTime now = TimeSupport.nowStored();

        Performance paid = onSale(team, now.plusDays(3));
        Performance unpaidOnly = onSale(team, now.plusDays(4));
        Performance started = onSale(team, now.minusMinutes(5));

        order(paid, buyer, team, TicketOrder.Status.PAID);
        order(unpaidOnly, buyer, team, TicketOrder.Status.PENDING_PAYMENT);
        order(unpaidOnly, buyer, team, TicketOrder.Status.CANCELLED);

        List<Long> forBuyer = ids(candidateRepository.findCandidates(
                Performance.Status.ON_SALE, buyer.getMemberId(), TicketOrder.Status.PAID, now));
        assertThat(forBuyer)
                .contains(unpaidOnly.getPerformanceId())
                .doesNotContain(paid.getPerformanceId(), started.getPerformanceId());

        // PAID 제외는 회원 단위다 — 다른 회원에겐 같은 공연이 여전히 후보다.
        List<Long> forOther = ids(candidateRepository.findCandidates(
                Performance.Status.ON_SALE, other.getMemberId(), TicketOrder.Status.PAID, now));
        assertThat(forOther)
                .contains(paid.getPerformanceId(), unpaidOnly.getPerformanceId())
                .doesNotContain(started.getPerformanceId());
    }

    @Test
    @DisplayName("D-R06: 겹침이 6건 미만이면 폴백으로 채우고 basis=GENRE 유지, 채운 카드는 matchedGenres=[] · 로그 FALLBACK")
    void fillsShortfallWithFallbackButKeepsGenreBasis() throws InterruptedException {
        Member me = member();
        preferredGenreRepository.save(new MemberPreferredGenre(me.getMemberId(), Genre.CLASSICAL));

        LocalDateTime now = TimeSupport.nowStored();
        Performance matched = onSale(team(Genre.CLASSICAL), now.plusDays(30));
        // 겹치지 않는 후보를 6개 넣어 다른 테스트 데이터가 없어도 부족분이 반드시 채워지게 한다.
        Team filler = team(Genre.ETC);
        for (int i = 0; i < 6; i++) {
            onSale(filler, now.plusHours(1 + i));
        }

        RecommendationResponse response = recommendationService.recommend(
                MemberPrincipal.of(me.getMemberId(), me.getEmail(), false));

        assertThat(response.basis()).isEqualTo("GENRE");
        List<RecommendationItem> items = response.items();
        assertThat(items).hasSize(6);

        RecommendationItem matchedCard = items.stream()
                .filter(item -> item.performanceId().equals(matched.getPerformanceId()))
                .findFirst().orElseThrow();
        assertThat(matchedCard.matchedGenres()).containsExactly("CLASSICAL");

        List<RecommendationItem> filled = items.stream()
                .filter(item -> item.matchedGenres().isEmpty()).toList();
        assertThat(filled).isNotEmpty();
        // 겹친 카드가 먼저, 채운 카드가 뒤 — 폴백이 겹침 카드를 밀어내지 않는다.
        int firstFilled = items.indexOf(filled.get(0));
        assertThat(items.subList(firstFilled, items.size()))
                .allSatisfy(item -> assertThat(item.matchedGenres()).isEmpty());

        // 로그는 @Async(REQUIRES_NEW) 라 커밋을 기다린다. 카드 단위 basis 를 단정한다.
        List<Map<String, Object>> rows = awaitLogRows(response.sessionId(), items.size());
        assertThat(rows).hasSize(items.size());
        for (Map<String, Object> row : rows) {
            RecommendationItem item = items.get(((Number) row.get("position")).intValue() - 1);
            assertThat(((Number) row.get("performance_id")).longValue())
                    .isEqualTo(item.performanceId());
            assertThat(row.get("basis"))
                    .isEqualTo(item.matchedGenres().isEmpty() ? "FALLBACK" : "GENRE");
            assertThat(((Number) row.get("genre_overlap")).intValue())
                    .isEqualTo(item.matchedGenres().size());
        }
    }

    // ------------------------------------------------------------------ helpers

    private List<Map<String, Object>> awaitLogRows(String sessionId, int expected)
            throws InterruptedException {
        // ponytail: 5초 폴링. Awaitility 가 build.gradle 에 없어 의존을 늘리지 않았다.
        List<Map<String, Object>> rows = List.of();
        for (int i = 0; i < 50 && rows.size() < expected; i++) {
            rows = jdbcTemplate.queryForList("SELECT position, performance_id, basis, "
                    + "genre_overlap FROM recommendation_log WHERE session_id = ? "
                    + "ORDER BY position", sessionId);
            if (rows.size() < expected) {
                Thread.sleep(100);
            }
        }
        return rows;
    }

    private Member member() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        return memberRepository.save(Member.builder()
                .email("reco-" + tag + "@b204.test")
                .name("추천회원")
                .authProvider(Member.AuthProvider.GOOGLE)
                .countryCode("KR")
                .build());
    }

    private Team team(Genre genre) {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        return teamRepository.save(Team.builder()
                .name("추천팀-" + tag)
                .leader(member())
                .genre(genre)
                .build());
    }

    /** 공연 상태는 엔티티 전이 메서드 대신 SQL 로 세운다(SettlementTestFixture 와 같은 선택). */
    private Performance onSale(Team team, LocalDateTime performanceAt) {
        Performance performance = performanceRepository.save(Performance.builder()
                .title("추천 테스트 " + UUID.randomUUID().toString().substring(0, 8))
                .performanceAt(performanceAt)
                .creatorTeam(team)
                .saleCloseAt(performanceAt.minusHours(1))
                .cancelDeadlineAt(performanceAt.minusDays(3))
                .depositAmount(50_000L)
                .build());
        jdbcTemplate.update("UPDATE performance SET status = 'ON_SALE' WHERE performance_id = ?",
                performance.getPerformanceId());
        return performance;
    }

    private void order(Performance performance, Member buyer, Team team, TicketOrder.Status status) {
        TicketOrder order = TicketOrder.builder()
                .performance(performance)
                .member(buyer)
                .orderRef("0x" + UUID.randomUUID().toString().replace("-", "")
                        + UUID.randomUUID().toString().replace("-", ""))
                .totalAmount(10_000L)
                .totalQuantity(1)
                .selectedTeam(team)
                .paymentExpiresAt(LocalDateTime.now().plusMinutes(10))
                .build();
        if (status == TicketOrder.Status.PAID) {
            order.markPaid();
        } else if (status == TicketOrder.Status.CANCELLED) {
            order.cancel();
        }
        ticketOrderRepository.save(order);
        assertThat(order.getStatus()).isEqualTo(status);
    }

    private static List<Long> ids(List<Performance> performances) {
        return performances.stream().map(Performance::getPerformanceId).toList();
    }
}
