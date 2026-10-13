package com.ssafy.b204.team.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.team.dto.TeamDtos.CreateTeamRequest;
import com.ssafy.b204.team.dto.TeamDtos.CreateTeamResponse;
import com.ssafy.b204.team.dto.TeamDtos.DisbandTeamResponse;
import com.ssafy.b204.team.dto.TeamDtos.MyTeamsResponse;
import com.ssafy.b204.team.dto.TeamDtos.TeamDetailResponse;
import com.ssafy.b204.team.dto.TeamDtos.TeamSearchResponse;
import com.ssafy.b204.team.dto.TeamDtos.UpdateTeamRequest;
import com.ssafy.b204.team.dto.TeamDtos.UpdateTeamResponse;
import com.ssafy.b204.team.service.TeamService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * team — 공연팀 (API v6 §2). 에러 코드 접두 {@code TEAM_*}.
 *
 * <p>팀 지갑은 리더의 {@code wallet}으로 파생한다 — 팀에 별도 주소 컬럼이 없다.
 * 그래서 팀 생성·초대 수락의 선행 조건이 "리더에게 등록된 지갑이 있는가"다.
 */
@RestController
@RequestMapping("/api/v1/teams")
@RequiredArgsConstructor
public class TeamController {

    private final TeamService teamService;

    /** API-team-01 · 권한 회원. */
    @PostMapping
    public ResponseEntity<ApiResponse<CreateTeamResponse>> createTeam(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody CreateTeamRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(teamService.createTeam(me, request),
                        "팀이 생성되었습니다."));
    }

    /** API-team-02 · 권한 회원. 내가 리더인 팀만 반환하고, 팀이 없으면 빈 목록. */
    @GetMapping("/me")
    public ApiResponse<MyTeamsResponse> myTeams(@AuthenticationPrincipal MemberPrincipal me,
                                                Pageable pageable) {
        return ApiResponse.success(teamService.myTeams(me, pageable));
    }

    /**
     * API-team-06 팀 검색(2026-09-26 신설) · 권한 회원. P-04 초대 자동완성.
     *
     * <p>{@code q}를 필수 파라미터로 선언하지 않는다 — 누락·공백을 서비스가 같은 문구의
     * {@code COMMON_VALIDATION_FAILED}로 내리게 한 곳에서 검사한다. 리터럴 경로 {@code /search}는
     * {@code /{teamId}}보다 구체적이라 Spring이 먼저 고른다.
     */
    @GetMapping("/search")
    public ApiResponse<TeamSearchResponse> searchTeams(@AuthenticationPrincipal MemberPrincipal me,
                                                       @RequestParam(required = false) String q,
                                                       @RequestParam(required = false) Integer size) {
        return ApiResponse.success(teamService.searchTeams(me, q, size));
    }

    /** API-team-03 · 권한 PERFORMER(해당 팀 리더). */
    @GetMapping("/{teamId}")
    public ApiResponse<TeamDetailResponse> teamDetail(@AuthenticationPrincipal MemberPrincipal me,
                                                       @PathVariable Long teamId) {
        return ApiResponse.success(teamService.teamDetail(me, teamId));
    }

    /** API-team-04 · 권한 리더. 응답은 명세 예시대로 {@code teamId}·{@code teamName}·{@code genre}. */
    @PatchMapping("/{teamId}")
    public ApiResponse<UpdateTeamResponse> updateTeam(@AuthenticationPrincipal MemberPrincipal me,
                                                      @PathVariable Long teamId,
                                                      @Valid @RequestBody UpdateTeamRequest request) {
        return ApiResponse.success(teamService.updateTeam(me, teamId, request),
                "팀 정보가 수정되었습니다.");
    }

    /**
     * API-team-05 팀 해산(신설) · 권한 리더. 소프트 삭제이며 진행 중 공연·미반환 보증금·미정산이
     * 있으면 {@code TEAM_HAS_ACTIVE_PERFORMANCE}(409)로 막는다.
     */
    @DeleteMapping("/{teamId}")
    public ApiResponse<DisbandTeamResponse> disbandTeam(@AuthenticationPrincipal MemberPrincipal me,
                                                        @PathVariable Long teamId) {
        return ApiResponse.success(teamService.disbandTeam(me, teamId), "팀을 해산했습니다.");
    }
}
