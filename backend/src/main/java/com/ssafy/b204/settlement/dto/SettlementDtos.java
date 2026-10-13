package com.ssafy.b204.settlement.dto;

import com.ssafy.b204.common.response.Money;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * settlement 도메인 DTO — API v6 §11 (API-settlement-01~07). 접두 {@code SETTLEMENT_*}.
 *
 * <p><b>{@code RELEASED}가 종단이다</b>(v5 변경) — 팀 수령 이후 단계가 없다. 법정화폐 출구가
 * 사라져 {@code withdraw} 도메인이 삭제됐고 {@code withdrawnAmount}·수령 계좌·2차 서명이 없다.
 * release가 확정되면 각 팀 리더 지갑에 코인이 도착하고 그것으로 수령이 끝난다.
 */
public final class SettlementDtos {

    private SettlementDtos() {
    }

    // ------------------------------------------------------------ API-settlement-01

    /**
     * {@code GET /api/v1/performances/{id}/settlement} — 정산 상태·집계·분배액·tx.
     * 권한 PERFORMER(참여팀). 참여팀이 아니면 {@code SETTLEMENT_NOT_PARTICIPANT}(403).
     *
     * <p>{@code dustAmount}·{@code dustTeamId}가 있는 이유 — 정수 나눗셈 잔여를 어딘가에
     * 귀속시켜야 Σ분배액 = 총매출이 성립한다. 버리면 에스크로에 먼지가 남아 대사가 영구히 어긋난다.
     */
    public record SettlementDetailResponse(
            Long performanceId,
            Long settlementId,
            String status,
            Money.Rate rate,
            String currency,
            Long grossRevenueAmount,
            Long refundedAmount,
            Long netRevenueAmount,
            Long distributableAmount,
            Long escrowBalanceAmount,
            Integer fixedRatioBp,
            Integer selectionRatioBp,
            Long dustAmount,
            Long dustTeamId,
            String rulesHash,
            OffsetDateTime aggregatedAt,
            OffsetDateTime lockedAt,
            OffsetDateTime disputeClosesAt,
            OffsetDateTime releasedAt,
            String releaseTxHash,
            Boolean counterMatched,
            DepositBlock deposit,
            List<ShareItem> shares,
            MyTeam myTeam,
            List<DisputeResponse> disputes,
            List<TransactionItem> transactions,
            Actions actions,
            /**
             * [2026-09-24] 본인 확인 스위치가 켜졌을 때만 {@code true}(API v7 §7.W) — 조기 동의
             * (settlement-08)·정산금 지급(settlement-05)이 {@code X-Step-Up-Token}을 요구한다는 뜻.
             * 꺼져 있으면 키가 없다(전역 non_null).
             */
            Boolean stepUpRequired
    ) {}

    /**
     * 요청자 팀의 몫 — 로그인 회원 → 팀 매핑이 서버에만 있어 여기서 접어 준다.
     *
     * <p>{@code nextAction}은 {@code NONE}·{@code WAIT_RELEASE} 둘뿐이다. release가 정산의 종단이라
     * 팀이 그 뒤에 할 일이 없다(v5에서 {@code withdraw} 도메인이 사라졌다).
     *
     * <p>참여팀이 아닌 ADMIN이 조회하면 {@code null}이다(전역 {@code non_null}이라 필드째 빠진다).
     */
    public record MyTeam(Long teamId, Long totalAmount, boolean released,
                          OffsetDateTime releasedAt, String walletAddress, String nextAction,
                          boolean approved) {

        public static final String ACTION_NONE = "NONE";
        public static final String ACTION_WAIT_RELEASE = "WAIT_RELEASE";
    }

    /** 정산 관련 확정 tx. {@code explorerUrl}은 서버가 완성한 절대 URL이다(§0.7). */
    public record TransactionItem(String type, String txHash, String explorerUrl) {}

    /**
     * 단계별 액션 실행 가능 여부. <b>버튼 활성 조건을 서버가 정한다</b>(API v6 §11 -01).
     *
     * <p>프론트가 상태·이의·마감·대사를 다시 판정하면 서버 게이트와 갈라진다 — 서버는 409를 내는데
     * 버튼은 활성인 상태가 그것이다. 그래서 {@code blockedReason}은 실제로 던져질
     * {@code ErrorCode}와 <b>같은 문자열</b>이어야 한다.
     */
    public record Actions(ActionState aggregate, ActionState lock, ActionState dispute,
                           ActionState release, ActionState approve) {}

    /** {@code blockedReason}은 {@code available == false}일 때만 채워진다. */
    public record ActionState(boolean available, String blockedReason) {

        public static ActionState allow() {
            return new ActionState(true, null);
        }

        public static ActionState block(String reason) {
            return new ActionState(false, reason);
        }
    }

    public record DepositBlock(String status, Long amount, String returnTxHash,
                                OffsetDateTime returnedAt) {}

    /**
     * ⚠️ 필드명이 ERD 컬럼명과 다르다 — {@code fixedAmount} ↔ {@code equal_amount},
     * {@code choiceAmount} ↔ {@code selection_amount}. 값은 같고 이름만 다르므로 매핑에서 맞춘다.
     */
    public record ShareItem(
            Long teamId,
            String teamName,
            String walletAddress,
            Long fixedAmount,
            Long choiceAmount,
            Long dustAmount,
            Long totalAmount,
            Integer choiceCount,
            boolean released,
            OffsetDateTime releasedAt,
            boolean approved,
            OffsetDateTime approvedAt
    ) {}

    // ------------------------------------------------------------ API-settlement-02·03·05

    /**
     * 집계 확정(API-settlement-02). 권한 생성자·ADMIN. 202 + 폴링.
     *
     * <p><b>여기서 온체인 카운터와 서버 집계를 대조한다.</b> 어긋나면
     * {@code SETTLEMENT_AGGREGATE_MISMATCH}(409)로 자동 정산을 중단하고 관리자 확인으로 넘긴다.
     */
    public record AggregateResponse(
            String jobId,
            String status,
            String signerType,
            Integer pollAfterMs,
            Long performanceId,
            String nextStatus,
            Integer validTicketCount
    ) {}

    /** 정산 잠금 = 이의제기 시작(API-settlement-03). 권한 생성자·ADMIN. 202 + 폴링. */
    public record LockResponse(
            String jobId,
            String status,
            String signerType,
            Integer pollAfterMs,
            Long performanceId,
            String nextStatus,
            OffsetDateTime disputeClosesAt
    ) {}

    /**
     * release 실행(API-settlement-05). 권한 생성자·ADMIN(자동 스케줄 병행). 202 + 폴링.
     *
     * <p>이의제기 기간 중이면 {@code SETTLEMENT_DISPUTE_PERIOD}(409) — 마감 시각을 {@code msg}에
     * 넣어 안내한다. 집계 확정 전이면 {@code SETTLEMENT_NOT_LOCKED}(409).
     */
    public record ReleaseRequest(String note) {}

    public record ReleaseResponse(
            String jobId,
            String status,
            String signerType,
            Integer pollAfterMs,
            Long performanceId,
            Long settlementId,
            String nextStatus,
            Integer targetTeamCount,
            Long totalAmount,
            String currency,
            boolean depositReturnPlanned,
            Long depositAmount,
            String payoutNotice
    ) {}

    // ------------------------------------------------------------ API-settlement-04

    /**
     * 이의제기(API-settlement-04). 권한 참여팀 리더.
     *
     * <p>{@code expectedAmount}는 "내가 받을 줄 알았던 금액"이다 — 관리자가 판단할 근거로 남긴다.
     */
    public record DisputeRequest(
            @NotNull Long teamId,
            @NotBlank(message = "이의 사유를 입력해 주세요.") String reason,
            Long expectedAmount
    ) {}

    /**
     * openapi {@code Dispute} 스키마와 필드가 1:1이다(API v6 §11).
     *
     * <p>{@code settlementId} 대신 {@code performanceId}를 내리는 이유 — 이의는 팀 단위이고 화면의
     * 축은 공연이다. 정산 id는 이 응답의 어떤 후속 호출에도 쓰이지 않는다.
     *
     * <p>{@code releaseHeld} = 이 이의 때문에 release 자동 실행이 보류 중인가. API v6이 별도 이의
     * 목록 API를 만들지 않은 근거가 이 필드와 {@code SettlementDetailResponse.disputes}다.
     */
    public record DisputeResponse(
            Long disputeId,
            Long performanceId,
            Long teamId,
            String status,
            OffsetDateTime createdAt,
            boolean releaseHeld
    ) {}

    // ------------------------------------------------------------ API-settlement-08

    /**
     * 정산 조기 동의(API-settlement-08). 권한 참여팀 리더. 온체인 작업이 아니라 동기 201이다.
     *
     * <p>참여팀 <b>전원</b>(주최팀 포함)이 동의하면 48시간 이의제기 기간을 건너뛰고 release 가
     * 열린다. 동의는 되돌릴 수 없다 — 생각이 바뀐 팀은 이의제기(API-settlement-04)로 막는다.
     *
     * <p>{@code releaseUnlocked} = <b>이 동의로</b> 전원이 찼는가. 화면이 "이제 지급할 수 있습니다"
     * 를 띄우는 근거다. 열린 이의·대사 같은 나머지 게이트까지 통과했다는 뜻은 아니다 — 그쪽은
     * {@code actions.release} 가 답한다.
     */
    public record ApprovalResponse(Long teamId, OffsetDateTime approvedAt, int approvedCount,
                                    int requiredCount, boolean releaseUnlocked) {}

    // ------------------------------------------------------------ API-settlement-06·07

    /** 정산 공유 링크 생성(API-settlement-06). 권한 생성자(리더). */
    public record ShareLinkResponse(Long performanceId, String shareUrl, String shareToken,
                                     OffsetDateTime issuedAt) {}

    /**
     * {@code GET /api/v1/public/settlement/{shareToken}} — 공개 조회(API-settlement-07).
     * 권한 <b>GUEST</b>.
     *
     * <p>공개 페이지라 {@code teamId}·{@code walletAddress}를 담지 않고 <b>{@code teamName}만</b>
     * 내린다 — 정산 결과는 공개해도 팀의 지갑 주소를 링크만 아는 사람에게까지 노출할 이유는 없다.
     *
     * <p>{@code simulationNotice}는 "테스트넷 시연 정산입니다. 실제 자금이 아닙니다."다 —
     * 가정 기반 시연임을 공개 페이지에 반드시 명시한다(결정 v2 §2.1).
     */
    public record PublicSettlementResponse(
            Long performanceId,
            String performanceTitle,
            OffsetDateTime performedAt,
            String settlementStatus,
            Money.Rate rate,
            String currency,
            Long grossRevenueAmount,
            Long refundedAmount,
            Long netRevenueAmount,
            Integer fixedRatioBp,
            Integer selectionRatioBp,
            List<PublicShareItem> shares,
            String releaseTxHash,
            String explorerUrl,
            String simulationNotice
    ) {}

    public record PublicShareItem(String teamName, Long fixedAmount, Long choiceAmount,
                                   Long dustAmount, Long totalAmount, Integer choiceCount,
                                   boolean released) {}
}
