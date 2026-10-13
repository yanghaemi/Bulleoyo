package com.ssafy.b204.team.dto;

import com.ssafy.b204.common.response.Money;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/** team 도메인 DTO — API v6 §2 (API-team-01~04 · 05). 에러 코드 접두 {@code TEAM_*}. */
public final class TeamDtos {

    private TeamDtos() {
    }

    /**
     * {@code POST /api/v1/teams} — 팀 생성(API-team-01).
     *
     * <p>v5에서 금전 수단 필드(정산 계좌 등)가 전부 사라졌다 — 법정화폐 입출구가 없는 세계다.
     * 팀 지갑은 리더의 {@code wallet}으로 파생하므로 여기서 주소를 받지 않는다.
     *
     * <p>선행 조건 — 리더에게 등록된 지갑이 있어야 한다. 없으면 {@code WALLET_NOT_FOUND}(404)
     * (전용 코드 {@code WALLET_NOT_LINKED} 제안은 §16.1).
     *
     * <p>[v7] {@code genre}는 자유 문자열이 아니라 <b>장르 코드 10종 enum 중 1개, 필수</b>다.
     * 길이 제약({@code @Size(max=20)})은 사라졌다 — 코드는 길이가 아니라 값 집합으로 검증한다.
     *
     * <p>길이 제약은 명세 Body 표(1~30 · 500)를 따른다. ERD 컬럼
     * ({@code name VARCHAR(100)}·{@code genre VARCHAR(50)}·{@code description TEXT})보다 좁으므로
     * DB에 닿기 전에 400으로 걸러진다.
     *
     * <p>⚠️ <b>{@code contactEmail}은 ERD v5 {@code team}에 대응 컬럼이 없다.</b> 받되 저장하지
     * 않고, 조회 응답에서는 {@code null}로 나간다. 명세 ↔ ERD 충돌이므로 산출물의
     * "명세 확인 필요"에 적었다 — 임의로 V2 마이그레이션을 만들지 않는다.
     */
    public record CreateTeamRequest(
            @NotBlank @Size(min = 1, max = 30,
                    message = "팀 이름은 1자 이상 30자 이하로 입력해 주세요.") String teamName,
            // [v7] 장르 코드 10종 중 1개, 필수. 허용값 검사는 Genre.of 한 곳에서 한다 —
            // @Pattern 으로 값 목록을 한 번 더 적으면 enum 과 갈라진다.
            @NotBlank(message = "장르를 선택해 주세요.") String genre,
            @Size(max = 500, message = "팀 소개는 500자 이하로 입력해 주세요.") String introduction,
            @Email(message = "이메일 형식이 올바르지 않습니다.") String contactEmail
    ) {}

    public record CreateTeamResponse(
            Long teamId,
            String teamName,
            Long leaderMemberId,
            String walletAddress,
            String walletProvider,
            String explorerUrl,
            OffsetDateTime createdAt
    ) {}

    /**
     * {@code GET /api/v1/teams/me} 항목(API-team-02).
     *
     * <p>목록 축약형이다 — 항목에는 {@code balanceAmount}(YoYo 정수)만 두고 환율은 응답 루트의
     * {@code rate} 하나로 내린다(§0.5). v5에서 수령 가능액·계좌 등록 여부가 삭제됐다.
     */
    public record MyTeamItem(
            Long teamId,
            String teamName,
            String genre,
            boolean leader,
            String walletAddress,
            Long balanceAmount
    ) {}

    /** 목록 응답 루트 — {@code rate} + {@code items} + {@code pageInfo}. */
    public record MyTeamsResponse(
            Money.Rate rate,
            java.util.List<MyTeamItem> items,
            com.ssafy.b204.common.response.PageInfo pageInfo
    ) {}

    /** {@code GET /api/v1/teams/{teamId}} — 팀 상세(API-team-03). 금전 수단 블록은 v5에서 삭제. */
    public record TeamDetailResponse(
            Long teamId,
            String teamName,
            String genre,
            String introduction,
            String contactEmail,
            Long leaderMemberId,
            WalletBlock wallet
    ) {}

    /** 팀 지갑 = 리더 지갑. 주소는 공연자·검증 화면에만 노출한다(§0.7). */
    public record WalletBlock(String provider, String address, String status, String explorerUrl) {}

    /**
     * {@code PATCH /api/v1/teams/{teamId}} — 팀 수정(API-team-04). 리더만. 온 필드만 바꾼다.
     *
     * <p>{@code leaderMemberId}·{@code walletAddress}는 <b>이 레코드에 없다</b>. 명세가
     * "변경 불가 필드 전달 = {@code COMMON_VALIDATION_FAILED}"라고 정했고, Jackson의 알 수 없는
     * 필드 거부(기본 설정)가 그대로 그 동작이 된다 — 별도 검사를 쓰지 않는다.
     */
    public record UpdateTeamRequest(
            @Size(min = 1, max = 30,
                    message = "팀 이름은 1자 이상 30자 이하로 입력해 주세요.") String teamName,
            // [v7] 선택. 전달하면 장르 코드 10종이어야 한다(Genre.of 가 400 을 낸다).
            String genre,
            @Size(max = 500, message = "팀 소개는 500자 이하로 입력해 주세요.") String introduction,
            @Email(message = "이메일 형식이 올바르지 않습니다.") String contactEmail
    ) {}

    /**
     * {@code GET /api/v1/teams/search} 항목(API-team-06, 2026-09-26 신설) — 초대 자동완성용.
     *
     * <p><b>이미 공개되는 최소 필드만</b> 둔다. 지갑 주소·리더 이름·이메일은 넣지 않는다 — 로그인한
     * 누구나 호출할 수 있는 검색이라 여기 실린 값은 사실상 전체 공개다.
     */
    public record TeamSearchItem(Long teamId, String teamName, String genre) {}

    /** 팀 검색 응답 루트. 페이지가 아니라 상위 N건(최대 10)이라 {@code pageInfo}가 없다. */
    public record TeamSearchResponse(java.util.List<TeamSearchItem> items) {}

    /** 팀 수정 200 응답 — 명세 예시가 {@code teamId}·{@code teamName}·{@code genre} 셋뿐이다. */
    public record UpdateTeamResponse(Long teamId, String teamName, String genre) {}

    /**
     * {@code DELETE /api/v1/teams/{teamId}} — 팀 해산(API-team-05 신설). 리더만.
     *
     * <p><b>소프트 삭제다</b>({@code team.status = DISBANDED} + {@code deleted_at}). 공연·티켓·정산이
     * 팀을 참조하고 V1 FK가 {@code RESTRICT}라 물리 삭제할 수 없다 — 지우면 이미 팔린 티켓의
     * "어느 팀 공연인가"를 답할 수 없다.
     *
     * <p>⚠️ v6 §2 말미는 {@code API-team-05}를 <b>팀원 초대</b>(v3 삭제)로 쓰고 있다. 팀원 소속
     * 개념이 없어 그 번호는 비어 있으므로 해산이 이어받았다 — 문서 개정 대상이다.
     */
    public record DisbandTeamResponse(
            Long teamId,
            String teamName,
            String status,
            OffsetDateTime disbandedAt
    ) {}
}
