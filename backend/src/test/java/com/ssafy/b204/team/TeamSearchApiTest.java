package com.ssafy.b204.team;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.support.Bearer;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.team.dto.TeamDtos.TeamSearchItem;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.team.service.TeamService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

/**
 * API-team-06 팀 검색(2026-09-26 신설) — P-04 초대 자동완성.
 *
 * <p>컨테이너 DB를 모든 테스트 클래스가 공유하고 {@code team.name}이 전역 유니크라, 테스트마다
 * <b>무작위 토큰</b>을 이름에 넣고 그 토큰으로만 검색한다. 다른 테스트가 만든 팀이 결과에 섞이지
 * 않게 하려는 것이다.
 */
@AutoConfigureMockMvc
class TeamSearchApiTest extends IntegrationTestBase {

    @Autowired MockMvc mockMvc;
    @Autowired JwtTokenProvider tokens;
    @Autowired TeamService teamService;
    @Autowired MemberRepository memberRepository;
    @Autowired TeamRepository teamRepository;

    @Test
    @DisplayName("이름 부분 일치는 대소문자를 무시하고, 이름 정확 일치가 맨 앞 · 나머지는 이름 오름차순")
    void partialMatchCaseInsensitiveExactFirst() {
        String tok = token();
        Member leader = member("search");
        Team beta = team("beta-" + tok, leader);
        Team alpha = team("Alpha-" + tok, leader);
        Team exact = team(tok.toUpperCase(), leader);
        team("unrelated-" + token(), leader);

        List<TeamSearchItem> items = search(leader, tok, null);

        assertThat(items).extracting(TeamSearchItem::teamId)
                .containsExactly(exact.getTeamId(), alpha.getTeamId(), beta.getTeamId());
        assertThat(items.get(0).genre()).isEqualTo("ETC");
    }

    @Test
    @DisplayName("해산한 팀은 이름·ID 어느 경로로도 나오지 않는다")
    void disbandedExcluded() {
        String tok = token();
        Member leader = member("disband");
        Team live = team("live-" + tok, leader);
        Team gone = team("gone-" + tok, leader);
        gone.disband();
        teamRepository.save(gone);

        assertThat(search(leader, tok, null)).extracting(TeamSearchItem::teamId)
                .containsExactly(live.getTeamId());
        assertThat(search(leader, String.valueOf(gone.getTeamId()), null))
                .extracting(TeamSearchItem::teamId)
                .doesNotContain(gone.getTeamId());
    }

    @Test
    @DisplayName("% 와 _ 는 와일드카드가 아니라 글자 그대로 찾는다")
    void likeWildcardsAreEscaped() {
        String tok = token();
        Member leader = member("escape");
        Team percent = team("a%b" + tok, leader);
        team("axb" + tok, leader);
        Team underscore = team("c_d" + tok, leader);
        team("cxd" + tok, leader);
        Team bang = team("e!f" + tok, leader);

        assertThat(search(leader, "a%b" + tok, null)).extracting(TeamSearchItem::teamId)
                .containsExactly(percent.getTeamId());
        assertThat(search(leader, "c_d" + tok, null)).extracting(TeamSearchItem::teamId)
                .containsExactly(underscore.getTeamId());
        assertThat(search(leader, "e!f" + tok, null)).extracting(TeamSearchItem::teamId)
                .containsExactly(bang.getTeamId());
    }

    @Test
    @DisplayName("숫자 검색어는 팀 ID 정확 일치를 맨 앞에 둔다 — 이름에 그 숫자가 없어도 나온다")
    void numericQueryMatchesTeamIdFirst() {
        Member leader = member("byid");
        Team target = team("id-target-" + token(), leader);

        List<TeamSearchItem> items = search(leader, "  " + target.getTeamId() + "  ", null);

        assertThat(items).isNotEmpty();
        assertThat(items.get(0).teamId()).isEqualTo(target.getTeamId());
    }

    @Test
    @DisplayName("size 만큼만 준다(기본·상한 10)")
    void sizeLimitsResults() {
        String tok = token();
        Member leader = member("size");
        for (int i = 0; i < 3; i++) {
            team("s" + i + "-" + tok, leader);
        }

        assertThat(search(leader, tok, 2)).hasSize(2);
        assertThat(search(leader, tok, null)).hasSize(3);
    }

    @Test
    @DisplayName("q 누락·공백뿐·51자, size 0·11 은 COMMON_VALIDATION_FAILED")
    void validation() {
        Member leader = member("valid");
        assertValidation(() -> search(leader, null, null));
        assertValidation(() -> search(leader, "   ", null));
        assertValidation(() -> search(leader, "x".repeat(51), null));
        assertValidation(() -> search(leader, "ok", 0));
        assertValidation(() -> search(leader, "ok", 11));
        // 경계값은 통과한다
        search(leader, "x".repeat(50), 10);
        search(leader, " " + "x".repeat(50) + " ", 1);
    }

    @Test
    @DisplayName("HTTP — /teams/search 가 /teams/{teamId} 에 먹히지 않고, 응답에 지갑 주소가 없다")
    void httpContract() throws Exception {
        String tok = token();
        Member leader = member("http");
        Team team = team("http-" + tok, leader);

        mockMvc.perform(get("/api/v1/teams/search").param("q", tok)
                        .with(Bearer.of(tokens, leader)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].teamId").value(team.getTeamId()))
                .andExpect(jsonPath("$.data.items[0].teamName").value(team.getName()))
                .andExpect(jsonPath("$.data.items[0].genre").value("ETC"))
                .andExpect(jsonPath("$.data.items[0].walletAddress").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].leaderMemberId").doesNotExist());

        mockMvc.perform(get("/api/v1/teams/search").param("q", " ")
                        .with(Bearer.of(tokens, leader)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));

        mockMvc.perform(get("/api/v1/teams/search").param("q", tok))
                .andExpect(status().isUnauthorized());
    }

    // ============================================================ 픽스처

    private List<TeamSearchItem> search(Member me, String q, Integer size) {
        return teamService.searchTeams(MemberPrincipal.of(me.getMemberId(), me.getEmail(), false),
                q, size).items();
    }

    private static void assertValidation(Runnable call) {
        assertThatThrownBy(call::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
    }

    private static String token() {
        return "tq" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    private Member member(String tag) {
        return memberRepository.save(Member.builder()
                .email(tag + "-" + UUID.randomUUID().toString().substring(0, 8) + "@b204.test")
                .name(tag)
                .authProvider(Member.AuthProvider.GOOGLE)
                .countryCode("KR")
                .build());
    }

    private Team team(String name, Member leader) {
        return teamRepository.save(Team.builder().name(name).leader(leader).build());
    }
}
