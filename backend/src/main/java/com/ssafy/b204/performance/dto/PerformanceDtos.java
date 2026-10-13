package com.ssafy.b204.performance.dto;

import com.ssafy.b204.chain.dto.ChainDtos.SignRequest;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * performance 도메인 DTO — API v6 §4 (API-performance-01~14). 접두 {@code PERFORMANCE_*}.
 *
 * <p>⚠️ 이 도메인에는 <b>ERD v5에 대응 컬럼이 없는 응답 필드가 있다</b>({@code purchaseLimitPerMember}).
 * 각 자리에 표시해 두었다 — 구현 전에 명세나 ERD 중 하나를 고쳐야 한다
 * (be-dev 규칙: 명세와 ERD가 충돌하면 임의 해석 금지).
 *
 * <p>{@code endAt}은 V6 {@code performance.end_at}으로 저장된다. ERD v5 문서에는 아직 없어
 * <b>문서 개정이 따라와야 한다</b>.
 */
public final class PerformanceDtos {

    private PerformanceDtos() {
    }

    // ------------------------------------------------------------ API-performance-01

    /**
     * {@code POST /api/v1/performances} — 공연 생성. 권한 리더.
     *
     * <p>{@code endAt}은 V6 {@code performance.end_at}에 저장된다(nullable — V6 이전 행은 비어
     * 있고 조회가 추정값으로 폴백한다). ERD v5 문서에는 아직 없다 — 개정 대기 중.
     */
    public record CreatePerformanceRequest(
            @NotNull Long hostTeamId,
            @NotBlank @Size(min = 1, max = 100,
                    message = "공연 제목은 1자 이상 100자 이하로 입력해 주세요.") String title,
            @Size(max = 2000) String description,
            /**
             * {@code POST /api/v1/files}가 돌려준 {@code uploadId}. <b>URL이 아니다.</b>
             *
             * <p>[2026-09-22 파괴적 변경] 이전 필드 {@code posterImageUrl}을 <b>제거</b>했다.
             * 클라이언트가 만든 임의 문자열이 {@code poster_image_path}에 그대로 들어가면 서버가
             * "이 이미지는 이 회원이 올린 것"을 증명할 수 없다. 알 수 없는 필드 거부가 켜져 있어
             * 옛 필드를 보내면 {@code COMMON_VALIDATION_FAILED}(400)다.
             */
            @Size(max = 36) String posterUploadId,
            /** 티켓 아트워크 업로드 id. {@code purpose = TICKET_ARTWORK}여야 한다. */
            @Size(max = 36) String ticketArtworkUploadId,
            @NotBlank @Size(min = 1, max = 100) String venueName,
            @NotBlank @Size(min = 1, max = 200) String venueAddress,
            @NotNull OffsetDateTime startAt,
            @NotNull OffsetDateTime endAt,
            @NotNull Boolean jointPerformance
    ) {}

    /**
     * {@code nextAction}이 화면의 다음 단계를 지시한다 — 생성 직후는 {@code PAY_DEPOSIT}이다.
     * 보증금 납부가 정산 규칙 설정·판매 시작의 선행 조건이기 때문이다.
     */
    public record CreatePerformanceResponse(
            Long performanceId,
            String title,
            String status,
            Long hostTeamId,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            OffsetDateTime saleCloseAt,
            OffsetDateTime cancelDeadlineAt,
            DepositBlock deposit,
            String nextAction
    ) {}

    /** {@code sufficient}가 {@code false}면 화면은 안내만 한다 — 잔액을 늘리는 버튼이 없다. */
    public record DepositBlock(
            String status,
            Long amount,
            String currency,
            Money.Display display,
            Long leaderBalance,
            boolean sufficient
    ) {}

    // ------------------------------------------------------------ API-performance-02

    /** 공개 목록 항목. 축약형 — 환율은 루트 {@code rate} 하나(§0.5). */
    public record PerformanceListItem(
            Long performanceId,
            String title,
            String posterImageUrl,
            String ticketImageUrl,
            String venueName,
            OffsetDateTime startAt,
            String status,
            Long minPriceAmount,
            String currency,
            boolean soldOut,
            List<String> teamNames
    ) {}

    public record PerformanceListResponse(Money.Rate rate, List<PerformanceListItem> items,
                                           PageInfo pageInfo) {}

    // ------------------------------------------------------------ API-performance-03

    /**
     * 공개 상세. 권한 GUEST.
     *
     * <p>⚠️ {@code purchaseLimitPerMember}는 ERD v5에 대응 컬럼이 없다 —
     * {@code TICKET_PURCHASE_LIMIT_EXCEEDED} 판정의 기준값인데 저장할 곳이 없다.
     *
     * <p><b>관객 화면이므로 주소·해시를 노출하지 않는다</b>(§0.7·P-22).
     */
    public record PerformanceDetailResponse(
            Long performanceId,
            String title,
            String description,
            String posterImageUrl,
            /** 발급 티켓 렌더의 배경(V10 {@code ticket_image_path}). 없으면 키가 없다. */
            String ticketImageUrl,
            String venueName,
            String venueAddress,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            OffsetDateTime saleCloseAt,
            OffsetDateTime cancelDeadlineAt,
            String status,
            boolean jointPerformance,
            Integer purchaseLimitPerMember,
            Money.Rate rate,
            List<ParticipantSummary> participants,
            List<TicketTypeDetail> ticketTypes,
            /** 환불이 지갑 잔액으로 돌아간다는 고지(P-20). 원화 출구가 없으므로 문구가 고정이다. */
            String refundPolicyNotice,
            /** 공개 검증 페이지(V-01) 링크. 관객 화면의 유일한 체인 접점이다. */
            String verificationUrl
    ) {}

    public record ParticipantSummary(Long teamId, String teamName, boolean host) {}

    public record TicketTypeDetail(Long ticketTypeId, String name, Money price,
                                    Integer totalQuantity, Integer remainingQuantity) {}

    // ------------------------------------------------------------ API-performance-04

    /**
     * 공연 수정(잠금 전). 권한 생성자.
     *
     * <p>{@code agreementsReset}이 응답에 있는 이유 — 일시·장소가 바뀌면 팀이 동의한 전제가
     * 달라지므로 <b>기존 동의를 무효화</b>한다. 그러지 않으면 팀이 보지 않은 조건으로 잠기게 된다.
     */
    public record UpdatePerformanceRequest(
            @Size(min = 1, max = 100) String title,
            @Size(max = 2000) String description,
            /** 업로드 id. [2026-09-22] {@code posterImageUrl} 제거 — 생성 요청과 같은 이유다. */
            @Size(max = 36) String posterUploadId,
            @Size(max = 36) String ticketArtworkUploadId,
            @Size(min = 1, max = 100) String venueName,
            @Size(min = 1, max = 200) String venueAddress,
            OffsetDateTime startAt,
            OffsetDateTime endAt
    ) {}

    public record UpdatePerformanceResponse(
            Long performanceId,
            String status,
            OffsetDateTime startAt,
            OffsetDateTime saleCloseAt,
            OffsetDateTime cancelDeadlineAt,
            boolean agreementsReset,
            String depositStatus
    ) {}

    // ------------------------------------------------------------ API-performance-18

    /**
     * {@code DELETE /api/v1/performances/{performanceId}} — 공연 삭제(신설). 생성자만.
     *
     * <p><b>물리 삭제다.</b> 규칙 동의 전(DRAFT · PENDING_AGREEMENT)이고 보증금이 납부되지 않은
     * 공연만 지우므로 주문 · 티켓 · 정산이 붙어 있을 수 없다 — 팀 해산(API-team-05)이 소프트
     * 삭제인 것과 다른 이유가 이것이다. 판매가 열린 뒤 되무르는 것은 {@code .../cancel}
     * (API-performance-12)이며 그쪽은 환불 · 온체인 job이 따라붙는다.
     */
    public record DeletePerformanceResponse(
            Long performanceId,
            String title
    ) {}

    // ------------------------------------------------------------ API-performance-05

    /**
     * 티켓 옵션 설정(잠금 전). <b>{@code PUT}이므로 통째로 교체한다.</b>
     *
     * <p>{@code ticketTypeId}가 있으면 수정, 없으면 신규다. 응답에 빠진 기존 옵션은 삭제되지만,
     * 이미 팔린 옵션은 지울 수 없다 — 주문·티켓이 참조하므로 FK가 막는다(RESTRICT).
     */
    public record SetTicketTypesRequest(
            @NotEmpty(message = "티켓 옵션을 1개 이상 등록해 주세요.")
            @Size(min = 1, max = 10, message = "티켓 옵션은 1~10개까지 등록할 수 있습니다.")
            @Valid List<TicketTypeInput> ticketTypes
    ) {}

    public record TicketTypeInput(
            Long ticketTypeId,
            @NotBlank @Size(min = 1, max = 30) String name,
            @NotNull @Min(value = 0, message = "가격은 0 이상이어야 합니다.")
            @Max(value = 1_000_000, message = "가격은 1,000,000 이하여야 합니다.") Long price,
            @NotNull @Min(value = 1, message = "수량은 1 이상이어야 합니다.")
            @Max(value = 5_000, message = "수량은 5,000 이하여야 합니다.") Integer totalQuantity
    ) {}

    public record SetTicketTypesResponse(Long performanceId, Money.Rate rate,
                                          List<TicketTypeSummary> ticketTypes) {}

    public record TicketTypeSummary(Long ticketTypeId, String name, Long priceAmount,
                                     String currency, Integer totalQuantity,
                                     Integer remainingQuantity) {}

    // ------------------------------------------------------------ API-performance-06

    /**
     * 내 팀 참여 공연 목록. 권한 PERFORMER.
     *
     * <p>{@code pendingSignature}가 공연자 대시보드(P-01)의 할 일을 지시한다 — openapi
     * ({@code openapi.yaml:6805})는 {@code DEPOSIT}·{@code AGREE}·{@code TREASURY_IN}·{@code null}
     * <b>4값</b>이다. 서버는 {@code TREASURY_IN}을 내려줄 수 없다 — 공연 단위로 "지금 서명할
     * 트레저리 입금"을 판정할 근거가 ERD에 없다(예약값).
     *
     * <p>⚠️ {@code participationStatus}가 {@code INVITED}/{@code ACCEPTED}인데 ERD v5
     * {@code performance_participant.status} ENUM은 {@code ('REGISTERED','REMOVED')}다 — 값이 다르다.
     */
    public record MyPerformanceItem(
            Long performanceId,
            String title,
            /** 스튜디오 목록 썸네일. 조립 규칙은 공개 목록과 같다({@code AppProperties#uploadUrl}). */
            String posterImageUrl,
            String ticketImageUrl,
            OffsetDateTime startAt,
            String status,
            String settlementStatus,
            String depositStatus,
            Long teamId,
            boolean host,
            String participationStatus,
            String myTeamAgreementStatus,
            String pendingSignature,
            /*
             * 평면 필드 규칙과 같다 — {@code myParticipatingTeams[0].settlementApproved}를 복사한다.
             * 정산 행이나 그 팀 몫({@code settlement_share})이 아직 없으면 {@code null} — 전역 non_null
             * 직렬화로 키가 빠진다. 모르는 값을 미동의({@code false})로 단정하지 않기 위해서다.
             */
            Boolean myTeamSettlementApproved,
            /**
             * 이 공연에 엮인 <b>내가 리더인 팀 전부</b>. 한 회원이 두 팀을 이끌고 두 팀이 같은
             * 공연에 참여하면 행이 둘로 갈리지 않고 이 배열이 2개가 된다(공연당 1행 유지).
             *
             * <p>정렬 — <b>주최팀 우선, 그다음 {@code teamId} 오름차순</b>. 위 평면 필드
             * ({@code teamId}·{@code host}·{@code participationStatus}·
             * {@code myTeamAgreementStatus}·{@code pendingSignature}·
             * {@code myTeamSettlementApproved})는 이 배열의 <b>첫 항목</b>과 같은 값이다.
             */
            List<MyParticipatingTeam> myParticipatingTeams
    ) {}

    /**
     * 내가 리더인 팀 하나의 공연 내 상태. {@code pendingSignature}는 <b>팀 단위</b> 판정이다 —
     * {@code DEPOSIT}은 그 팀이 주최팀일 때만, {@code AGREE}는 그 팀의 동의가 {@code PENDING}일 때만.
     *
     * <p>{@code settlementApproved}도 팀 단위다 — 정산 조기 동의(API-settlement-08)는 팀마다 따로
     * 한다. 정산 행이나 그 팀 몫이 없으면 {@code null}(키 생략).
     */
    public record MyParticipatingTeam(
            Long teamId,
            String teamName,
            boolean host,
            String participationStatus,
            String agreementStatus,
            String pendingSignature,
            Boolean settlementApproved
    ) {}

    public record MyPerformancesResponse(List<MyPerformanceItem> items, PageInfo pageInfo) {}

    // ------------------------------------------------------------ API-performance-19

    /**
     * 공연 참여팀 조회(API-performance-19 신설). 권한 주최팀 리더 또는 참여팀 리더.
     *
     * <p>API-performance-03의 {@code participants}(관객용, 수락 완료 팀만)와 <b>다르다</b> —
     * 여기는 스튜디오 화면용이라 아직 수락하지 않은 {@code INVITED} 팀도 보여야 초대 현황을
     * 관리할 수 있다. 제외된 팀({@code status = REMOVED})은 내려주지 않는다.
     *
     * <p>{@code invitedAt} = {@code registered_at}, {@code acceptedAt}은 V9에서 더한
     * {@code accepted_at}이다(표시용 — 수락 판정은 {@code wallet_address} 유무).
     */
    public record ParticipantsResponse(Long performanceId, List<ParticipantDetail> items) {}

    public record ParticipantDetail(
            Long teamId,
            String teamName,
            boolean host,
            String participationStatus,
            OffsetDateTime invitedAt,
            OffsetDateTime acceptedAt
    ) {}

    // ------------------------------------------------------------ API-performance-07·08·09

    /** 참여팀 초대. 권한 생성자. {@code leaderWalletLinked}가 {@code false}면 수락할 수 없다. */
    public record InviteParticipantRequest(@NotNull Long teamId) {}

    public record InviteParticipantResponse(
            Long performanceId,
            Long teamId,
            String teamName,
            String participationStatus,
            boolean leaderWalletLinked,
            OffsetDateTime invitedAt
    ) {}

    /**
     * 참여팀 제외(API-performance-09). openapi {@code ParticipantRemoved} 4필드.
     *
     * <p>{@code remainingParticipantCount}는 <b>제외 후 수락 완료 참여팀 수(주최 팀 포함, 미수락
     * {@code INVITED} 팀 제외)</b>다 — API-performance-03의 {@code participants} 목록과 같은
     * 정의({@code acceptedParticipants})를 쓴다. 두 화면이 다른 수를 보이면 안 된다.
     */
    public record ParticipantRemovedResponse(
            Long performanceId,
            Long teamId,
            Integer remainingParticipantCount,
            boolean agreementsReset
    ) {}

    /** 참여 수락. 권한 초대팀 리더. 이 시점의 리더 지갑 주소를 <b>스냅샷으로 굳힌다</b>. */
    public record AcceptParticipationResponse(
            Long performanceId,
            Long teamId,
            String participationStatus,
            String walletAddress,
            String walletProvider,
            String nextAction,
            OffsetDateTime acceptedAt
    ) {}

    // ------------------------------------------------------------ API-performance-10

    /**
     * 검표 페이지 링크. 권한 PERFORMER(참여팀).
     *
     * <p>{@code entryToken}은 해당 공연에만 유효하고, 입장 API에서 {@code Authorization} 대신
     * {@code X-Entry-Token} 헤더로 쓴다. {@code rotate=true}면 재발급해 기존 링크를 무효화한다 —
     * 링크가 새면 아무나 검표할 수 있으므로 회전 수단이 필요하다.
     */
    public record EntryLinkResponse(
            Long performanceId,
            String performanceTitle,
            String entryUrl,
            String entryToken,
            OffsetDateTime expiresAt,
            EntryWindow entryWindow,
            OffsetDateTime issuedAt,
            boolean rotated
    ) {}

    public record EntryWindow(OffsetDateTime opensAt, OffsetDateTime closesAt) {}

    // ------------------------------------------------------------ API-performance-11

    /**
     * 판매·선택 현황. 권한 PERFORMER(참여팀).
     *
     * <p><b>{@code teamChoices}의 {@code dbCount} vs {@code onchainCount}가 이 화면의 핵심이다</b> —
     * 서버 집계와 온체인 카운터를 나란히 보여주고 {@code matched}로 판정한다. 어긋나면 정산을
     * 멈춘다({@code SETTLEMENT_AGGREGATE_MISMATCH}). "위조하면 발각되는 구조"가 눈에 보이는 자리다.
     *
     * <p>{@code onchainAvailable}이 {@code false}면 노드 조회가 실패한 상태다 — 그때도 화면은
     * {@code dbCount}만으로 떠야 한다.
     */
    public record SalesStatusResponse(
            Long performanceId,
            String status,
            Money.Rate rate,
            Long grossRevenueAmount,
            Long refundedAmount,
            Long escrowBalanceAmount,
            String currency,
            Integer paidTicketCount,
            Integer cancelledTicketCount,
            List<TicketTypeSales> ticketTypes,
            List<TeamChoice> teamChoices,
            Boolean counterMatched,
            Boolean escrowMatched,
            boolean onchainAvailable,
            String splitterAddress,
            OffsetDateTime refreshedAt
    ) {}

    public record TicketTypeSales(Long ticketTypeId, String name, Long priceAmount,
                                   Integer soldQuantity, Integer remainingQuantity) {}

    public record TeamChoice(Long teamId, String teamName, Integer teamIndex, Integer dbCount,
                              Integer onchainCount, Boolean matched) {}

    // ------------------------------------------------------------ API-performance-12

    /** 공연 취소(일괄 환불). 권한 생성자. 202 + 폴링. */
    public record CancelPerformanceRequest(
            @NotBlank(message = "취소 사유를 입력해 주세요.") String reason
    ) {}

    public record CancelPerformanceResponse(
            String jobId,
            String status,
            Integer pollAfterMs,
            Long performanceId,
            Integer targetTicketCount,
            Long totalRefundAmount,
            String currency,
            boolean depositReturnPlanned,
            Long depositAmount
    ) {}

    // ------------------------------------------------------------ API-performance-13·14

    /**
     * 보증금 서명 파라미터(§0.4 {@code prepare}). 권한 생성자(팀 리더).
     *
     * <p>{@code signRequests}는 보통 2건이다 — {@code APPROVE}(YoYo 사용 승인) 다음
     * {@code DEPOSIT}(RevenueSplitter 납부). allowance가 이미 충분하면 첫 건의
     * {@code required}가 {@code false}로 온다.
     */
    public record DepositPrepareResponse(
            Long performanceId,
            Long depositAmount,
            String currency,
            Money.Display display,
            String prerequisiteJobId,
            List<SignRequest> signRequests,
            /** 서명 파라미터 유효 시각(§0.4). 지나면 다시 prepare 를 호출한다. */
            OffsetDateTime expiresAt,
            /**
             * [2026-09-24] 본인 확인 스위치가 켜졌을 때만 {@code true}(API v7 §7.W). 꺼져 있으면 null 이라
             * 키가 없다(전역 non_null) — 스위치 off 응답은 이 필드 이전과 같다.
             */
            Boolean stepUpRequired
    ) {}

    /** 보증금 tx 보고(§0.4 {@code signed-tx}). 본문은 {@code {kind, senderSignedRlp}}. */
    public record DepositSignedTxResponse(
            String jobId,
            String status,
            String signerType,
            Integer pollAfterMs,
            Long performanceId,
            String kind,
            boolean feeDelegated,
            String txHash,
            String explorerUrl,
            String nextDepositStatus
    ) {}
}
