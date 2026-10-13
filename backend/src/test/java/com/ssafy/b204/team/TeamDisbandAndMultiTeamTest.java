package com.ssafy.b204.team;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.dto.PerformanceDtos.MyPerformanceItem;
import com.ssafy.b204.performance.dto.PerformanceDtos.ParticipantDetail;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.rule.service.RuleService;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.team.service.TeamService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 프론트가 제기한 3건 — 팀 해산(API-team-05) · 참여팀 조회(API-performance-19) ·
 * 여러 팀을 이끄는 회원의 참여·동의 대상.
 *
 * <p>세계를 여기서 직접 짠다({@code SettlementTestFixture}를 쓰지 않는다). <b>팀 id의 순서</b>가
 * 검증 대상이기 때문이다 — 정렬 규칙이 "주최팀 우선, 그다음 teamId 오름차순"인데 픽스처는 주최팀을
 * 항상 먼저 만들어 id가 가장 작다. 그러면 id 정렬만으로도 통과해 규칙의 앞부분을 못 잡는다.
 * 여기서는 <b>참여팀을 먼저 만들어 주최팀 id가 더 크게</b> 한다.
 */
class TeamDisbandAndMultiTeamTest extends IntegrationTestBase {

    @Autowired TeamService teamService;
    @Autowired PerformanceService performanceService;
    @Autowired RuleService ruleService;
    @Autowired MemberRepository memberRepository;
    @Autowired TeamRepository teamRepository;
    @Autowired PerformanceRepository performanceRepository;
    @Autowired PerformanceParticipantRepository participantRepository;
    @Autowired SettlementRuleRepository settlementRuleRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    // ============================================================ API-team-05

    @Nested
    @DisplayName("API-team-05 팀 해산")
    class Disband {

        @Test
        @DisplayName("진행 중인 공연이 있으면 409로 막는다 — 표를 파는 공연의 수령 주체가 사라진다")
        void blockedByLivePerformance() {
            Member leader = member("live");
            Team host = team("주최", leader);
            Performance performance = performance(host);
            participant(performance, host, address(1));
            setStatus(performance, "ON_SALE");

            assertError(() -> teamService.disbandTeam(principal(leader), host.getTeamId()),
                    ErrorCode.TEAM_HAS_ACTIVE_PERFORMANCE);
        }

        @Test
        @DisplayName("반환되지 않은 보증금이 있으면 409 — 이유가 다른 msg로 구분된다")
        void blockedByHeldDeposit() {
            Member leader = member("deposit");
            Team host = team("보증금", leader);
            Performance performance = performance(host);
            participant(performance, host, address(1));
            jdbcTemplate.update("UPDATE performance SET status = 'ENDED', "
                            + "deposit_status = 'PAID' WHERE performance_id = ?",
                    performance.getPerformanceId());

            assertThatThrownBy(
                    () -> teamService.disbandTeam(principal(leader), host.getTeamId()))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("보증금");
        }

        @Test
        @DisplayName("해산하면 DISBANDED가 되고 내 팀 목록(GET /teams/me)에서 빠진다")
        void disbandRemovesFromMyTeams() {
            Member leader = member("ok");
            Team host = team("해산", leader);
            Performance performance = performance(host);
            participant(performance, host, address(1));
            jdbcTemplate.update("UPDATE performance SET status = 'CANCELLED', "
                            + "deposit_status = 'RETURNED' WHERE performance_id = ?",
                    performance.getPerformanceId());

            var response = teamService.disbandTeam(principal(leader), host.getTeamId());

            assertThat(response.status()).isEqualTo("DISBANDED");
            assertThat(response.disbandedAt()).isNotNull();
            assertThat(teamService.myTeams(principal(leader), PageRequest.of(0, 20)).items())
                    .extracting(item -> item.teamId())
                    .doesNotContain(host.getTeamId());
        }

        @Test
        @DisplayName("이미 해산한 팀은 409 COMMON_CONFLICT, 남의 팀은 403")
        void conflictAndForbidden() {
            Member leader = member("twice");
            Team host = team("두번", leader);
            teamService.disbandTeam(principal(leader), host.getTeamId());

            assertError(() -> teamService.disbandTeam(principal(leader), host.getTeamId()),
                    ErrorCode.COMMON_CONFLICT);
            assertError(() -> teamService.disbandTeam(principal(member("other")),
                    host.getTeamId()), ErrorCode.COMMON_FORBIDDEN);
        }
    }

    // ============================================================ API-performance-19

    @Nested
    @DisplayName("API-performance-19 공연 참여팀 조회")
    class Participants {

        @Test
        @DisplayName("INVITED 팀은 보이고 REMOVED 팀은 빠진다 — 주최팀이 맨 앞")
        void invitedVisibleRemovedHidden() {
            Member hostLeader = member("p-host");
            Team guestTeam = team("먼저 만든 참여팀", member("p-guest"));
            Team invitedTeam = team("초대만 받은 팀", member("p-invited"));
            Team removedTeam = team("제외된 팀", member("p-removed"));
            Team hostTeam = team("나중에 만든 주최팀", hostLeader);
            Performance performance = performance(hostTeam);
            participant(performance, hostTeam, address(1));
            participant(performance, guestTeam, address(2));
            participant(performance, invitedTeam, null);
            PerformanceParticipant removed = participant(performance, removedTeam, null);
            removed.remove();
            participantRepository.save(removed);

            List<ParticipantDetail> items = performanceService
                    .participants(principal(hostLeader), performance.getPerformanceId()).items();

            assertThat(items).extracting(ParticipantDetail::teamId)
                    .containsExactly(hostTeam.getTeamId(), guestTeam.getTeamId(),
                            invitedTeam.getTeamId())
                    .doesNotContain(removedTeam.getTeamId());
            assertThat(items.get(0).host()).isTrue();
            assertThat(items.get(0).participationStatus()).isEqualTo("ACCEPTED");
            assertThat(items.get(0).acceptedAt()).isNotNull();
            assertThat(items.get(2).participationStatus()).isEqualTo("INVITED");
            assertThat(items.get(2).invitedAt()).isNotNull();
            assertThat(items.get(2).acceptedAt()).isNull();
        }

        @Test
        @DisplayName("초대만 받은 팀의 리더도 조회할 수 있고, 외부인은 403")
        void invitedLeaderAllowedOutsiderForbidden() {
            Member hostLeader = member("q-host");
            Member invitedLeader = member("q-invited");
            Team hostTeam = team("주최", hostLeader);
            Team invitedTeam = team("초대", invitedLeader);
            Performance performance = performance(hostTeam);
            participant(performance, hostTeam, address(1));
            participant(performance, invitedTeam, null);

            assertThat(performanceService
                    .participants(principal(invitedLeader), performance.getPerformanceId())
                    .items()).hasSize(2);
            assertError(() -> performanceService.participants(principal(member("q-outsider")),
                    performance.getPerformanceId()), ErrorCode.COMMON_FORBIDDEN);
        }
    }

    // ============================================================ 여러 팀을 이끄는 회원

    @Nested
    @DisplayName("한 회원이 두 팀을 이끌고 둘 다 한 공연에 엮였을 때")
    class MultiTeam {

        @Test
        @DisplayName("myParticipatingTeams가 2개이고 주최팀이 먼저다 — 평면 필드는 첫 항목과 같다")
        void myPerformancesGroupsBothTeams() {
            Member leader = member("multi");
            // 참여팀을 먼저 만들어 teamId 가 주최팀보다 작다. id 정렬만으로는 통과할 수 없다.
            Team guestTeam = team("참여", leader);
            Team hostTeam = team("주최", leader);
            Performance performance = performance(hostTeam);
            participant(performance, hostTeam, address(1));
            participant(performance, guestTeam, address(2));

            List<MyPerformanceItem> items = performanceService
                    .myPerformances(principal(leader), null, PageRequest.of(0, 20)).items();

            assertThat(items).hasSize(1);
            MyPerformanceItem item = items.get(0);
            assertThat(item.myParticipatingTeams()).hasSize(2);
            assertThat(item.myParticipatingTeams().get(0).teamId()).isEqualTo(hostTeam.getTeamId());
            assertThat(item.myParticipatingTeams().get(0).host()).isTrue();
            assertThat(item.myParticipatingTeams().get(1).teamId()).isEqualTo(guestTeam.getTeamId());
            assertThat(item.myParticipatingTeams().get(1).host()).isFalse();
            // 주최팀만 DEPOSIT 서명 대상이다(보증금 미납 + 수정 가능 상태).
            assertThat(item.myParticipatingTeams().get(0).pendingSignature()).isEqualTo("DEPOSIT");
            assertThat(item.myParticipatingTeams().get(1).pendingSignature()).isNull();
            // 평면 필드(프론트 호환)는 첫 항목의 복사본이다.
            assertThat(item.teamId()).isEqualTo(hostTeam.getTeamId());
            assertThat(item.host()).isTrue();
            assertThat(item.pendingSignature()).isEqualTo("DEPOSIT");
        }

        @Test
        @DisplayName("ruleStatus는 teamId로 팀을 고르고, 내 팀이 아니면 403")
        void ruleStatusPicksTeam() {
            Member leader = member("r-multi");
            Team guestTeam = team("참여", leader);
            Team hostTeam = team("주최", leader);
            Team otherTeam = team("남의 팀", member("r-other"));
            Performance performance = performance(hostTeam);
            participant(performance, hostTeam, address(1));
            participant(performance, guestTeam, address(2));
            participant(performance, otherTeam, address(3));
            settlementRuleRepository.save(SettlementRule.builder()
                    .performance(performance)
                    .fixedRatioBp(6000)
                    .selectionRatioBp(4000)
                    .rulesHash("0x" + "ab".repeat(32))
                    .build());

            var noParam = ruleService.ruleStatus(principal(leader),
                    performance.getPerformanceId(), null);
            assertThat(noParam.myParticipatingTeams()).extracting(t -> t.teamId())
                    .containsExactly(hostTeam.getTeamId(), guestTeam.getTeamId());
            assertThat(noParam.myAgreement().teamId()).isEqualTo(hostTeam.getTeamId());

            var picked = ruleService.ruleStatus(principal(leader), performance.getPerformanceId(),
                    guestTeam.getTeamId());
            assertThat(picked.myAgreement().teamId()).isEqualTo(guestTeam.getTeamId());

            assertError(() -> ruleService.ruleStatus(principal(leader),
                            performance.getPerformanceId(), otherTeam.getTeamId()),
                    ErrorCode.COMMON_FORBIDDEN);
        }
    }

    // ============================================================ 세계 만들기

    private Member member(String tag) {
        return memberRepository.save(Member.builder()
                .email(tag + "-" + UUID.randomUUID().toString().substring(0, 8) + "@b204.test")
                .name(tag)
                .authProvider(Member.AuthProvider.GOOGLE)
                .countryCode("KR")
                .build());
    }

    private Team team(String name, Member leader) {
        return teamRepository.save(Team.builder()
                .name(name + "-" + UUID.randomUUID().toString().substring(0, 8))
                .leader(leader)
                .build());
    }

    private Performance performance(Team creatorTeam) {
        return performanceRepository.save(Performance.builder()
                .title("공연 " + UUID.randomUUID().toString().substring(0, 8))
                .performanceAt(LocalDateTime.now().plusDays(7))
                .creatorTeam(creatorTeam)
                .joint(true)
                .saleCloseAt(LocalDateTime.now().plusDays(6))
                .cancelDeadlineAt(LocalDateTime.now().plusDays(4))
                .depositAmount(50_000L)
                .build());
    }

    /** {@code walletAddress}가 {@code null}이면 아직 수락하지 않은({@code INVITED}) 행이다. */
    private PerformanceParticipant participant(Performance performance, Team team,
                                               String walletAddress) {
        return participantRepository.save(PerformanceParticipant.builder()
                .performance(performance)
                .team(team)
                .teamShareBp(0)
                .walletAddress(walletAddress)
                .build());
    }

    private void setStatus(Performance performance, String status) {
        jdbcTemplate.update("UPDATE performance SET status = ? WHERE performance_id = ?",
                status, performance.getPerformanceId());
    }

    private static String address(int seed) {
        return "0x" + String.format("%040d", seed);
    }

    private static MemberPrincipal principal(Member member) {
        return MemberPrincipal.of(member.getMemberId(), member.getEmail(), member.isAdmin());
    }

    private static void assertError(Runnable call, ErrorCode expected) {
        assertThatThrownBy(call::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(expected);
    }
}
