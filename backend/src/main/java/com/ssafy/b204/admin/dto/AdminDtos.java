package com.ssafy.b204.admin.dto;

import com.ssafy.b204.common.response.PageInfo;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * admin 도메인 DTO — API v6 §13 (API-admin-06·09, 01~05·07·08은 P1). 접두 {@code COMMON_*}.
 *
 * <p>MVP 관리자 기능은 <b>이의제기 처리 2개</b>뿐이다. 회원 정지·정산 강제 개입 등은 P1이다.
 *
 * <p><b>필드 구성의 정본은 {@code docs/design/api/parts/13_admin.yaml}이다</b> — 프론트 타입이
 * openapi에서 생성되므로 여기서 이름·개수를 바꾸면 그대로 화면이 깨진다. 스켈레톤 시절의
 * {@code settlementId}·{@code calculatedAmount}·{@code submittedAt}·{@code haltSettlement}는
 * openapi에 없어 지웠다(S15P21B204-74).
 */
public final class AdminDtos {

    private AdminDtos() {
    }

    /**
     * {@code GET /api/v1/admin/disputes} — 이의제기 목록(API-admin-09). 권한 ADMIN.
     *
     * <p>openapi {@code data}는 {@code summary}·{@code items}·{@code pageInfo} <b>3키</b>다.
     */
    public record DisputeListResponse(DisputeListSummary summary, List<DisputeItem> items,
                                      PageInfo pageInfo) {}

    /**
     * openapi {@code DisputeAdminListSummary}.
     *
     * @param openCount        미처리 이의 수
     * @param releaseHeldCount release가 보류된 <b>정산</b> 수 — {@code Settlement.isReleasePossible()}
     *                         하나로 판정한다(별도 규칙을 만들지 않는다)
     */
    public record DisputeListSummary(int openCount, int releaseHeldCount) {}

    /**
     * openapi {@code DisputeAdminListItem} — 14필드. <b>관객 개인정보는 담지 않는다</b>(명세 명시).
     *
     * @param expectedAmount  팀이 주장한 정산액. <b>지금은 항상 {@code null}</b>이다 — ERD v5
     *                        {@code dispute}에 저장 컬럼이 없다(open-questions D-15). openapi가
     *                        {@code nullable: true}라 계약 위반은 아니다
     * @param createdAt       엔티티 필드는 {@code submittedAt}이고 <b>응답 키만</b> openapi의
     *                        {@code createdAt}으로 맞춘다
     * @param disputeClosesAt 이의제기 마감 = {@code settlement.dispute_deadline_at}. 마감 시각의
     *                        출처는 {@code markLocked}가 세운 그 값 하나다
     */
    public record DisputeItem(
            Long disputeId,
            Long performanceId,
            String performanceTitle,
            Long teamId,
            String teamName,
            String status,
            String reason,
            Long expectedAmount,
            String currency,
            String settlementStatus,
            OffsetDateTime disputeClosesAt,
            boolean releaseHeld,
            OffsetDateTime createdAt,
            OffsetDateTime resolvedAt
    ) {}

    /**
     * {@code PATCH /api/v1/admin/disputes/{disputeId}} — 이의제기 처리(API-admin-06). 권한 ADMIN.
     *
     * <p>{@code status}는 {@code RESOLVED} 또는 {@code REJECTED}다(ERD ENUM과 같다).
     *
     * <p><b>{@code RESOLVED} 후 재집계 경로는 없다</b>(v6 §11 정정). 복구 불가 판정이면 정산을
     * {@code HALTED}(종단)로 보내는데, 그 전이는 <b>이 API가 아니라</b> 공연 취소
     * (API-performance-12)의 몫이다 — 이 API는 온체인 tx를 만들지 않고 이의 상태만 바꾼다.
     * 그래서 스켈레톤의 {@code haltSettlement} 플래그를 지웠다.
     *
     * @param adminComment 참여팀에 공개된다. 10~1000자(openapi {@code minLength}·{@code maxLength})
     */
    public record ResolveDisputeRequest(
            @NotBlank @Pattern(regexp = "RESOLVED|REJECTED",
                    message = "처리 상태는 RESOLVED 또는 REJECTED 여야 합니다.") String status,
            @NotBlank(message = "처리 의견을 입력해 주세요.")
            @Size(min = 10, max = 1000, message = "처리 의견은 10자 이상 1000자 이하로 입력해 주세요.")
            String adminComment
    ) {}

    /**
     * openapi {@code DisputeResolveResult} — 6필드.
     *
     * @param releaseHeld 처리 후에도 이 정산의 release가 보류 중인가. 남은 열린 이의가 있으면
     *                    {@code true}다 — {@code REJECTED}로 마지막 이의가 풀리면 {@code false}가
     *                    되고 자동 스케줄이 재개된다
     */
    public record ResolveDisputeResponse(
            Long disputeId,
            Long performanceId,
            Long teamId,
            String status,
            boolean releaseHeld,
            OffsetDateTime resolvedAt
    ) {}
}
