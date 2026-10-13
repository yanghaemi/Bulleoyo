package com.ssafy.b204.verify.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * verify 도메인 DTO — API v6 §12 (API-verify-01) · openapi {@code VerificationData}.
 *
 * <p><b>이 API가 "누구나 검증 가능"의 실행 지점이다.</b> 브라우저가 이 데이터만으로 분배액을
 * 재계산해 온체인 값과 맞는지 확인할 수 있어야 한다 — 그래서 잠긴 규칙 원문
 * ({@code lockedRule.raw})과 온체인 해시({@code onchainRulesHash})를 나란히 내려준다.
 *
 * <p><b>필드 이름·순서는 openapi {@code Verification*} 스키마와 글자 단위로 같다.</b> record의
 * 선언 순서가 곧 JSON 순서라 여기서 순서를 바꾸면 명세와 어긋난다. 편의상 필드를 더하지 않는다 —
 * 유일한 예외가 {@link OnchainCounter}의 세 필드이고, 그것은 명세 개정(B-5)으로 들어온 것이다.
 *
 * <p><b>{@code matched}는 세 값을 가진다</b> — {@code true}(대사 통과) · {@code false}(불일치) ·
 * <b>필드 없음</b>(판정 불가: 아직 일어나지 않았거나 온체인 값을 읽지 못했다). 판정 불가를
 * {@code false}로 내리면 화면이 정상 상태를 사고로 표시한다.
 *
 * <p>권한이 <b>PERFORMER(참여팀, 로그인 필수)</b>다 — 공개 페이지는 API-settlement-07이고, 이쪽은
 * 검증에 필요한 원자료 전체(주소·해시·tx)를 담기 때문에 참여팀으로 제한한다. 관객 지갑·주문·티켓
 * 식별자는 어느 필드에도 담기지 않는다(§0.7).
 */
public final class VerifyDtos {

    private VerifyDtos() {
    }

    /**
     * {@code GET /api/v1/performances/{id}/verification} — 정산 검증 데이터.
     *
     * @param stale 노드 장애로 <b>마지막 캐시 값</b>을 보여주는 중인지. {@code true}면 아래 온체인
     *              대사 결과는 그 시점의 판정이지 지금 다시 읽은 값이 아니다
     */
    public record VerificationResponse(
            Long performanceId,
            String performanceTitle,
            OffsetDateTime performedAt,
            String settlementStatus,
            String network,
            Integer chainId,
            Contracts contracts,
            LockedRule lockedRule,
            List<Agreement> agreements,
            List<OnchainCounter> onchainCounters,
            RecalculationInput recalculationInput,
            List<Share> shares,
            EscrowReconciliation escrowReconciliation,
            ReleaseReconciliation releaseReconciliation,
            DepositReconciliation depositReconciliation,
            List<ReceiptItem> receiptSummary,
            ReleaseTx releaseTx,
            Guarantees guarantees,
            String simulationNotice,
            OffsetDateTime refreshedAt,
            boolean stale
    ) {
        /** 캐시된 응답을 "지금은 다시 읽지 못했다"로 표시해 되돌려줄 때 쓴다. */
        public VerificationResponse asStale() {
            return stale ? this : new VerificationResponse(performanceId, performanceTitle,
                    performedAt, settlementStatus, network, chainId, contracts, lockedRule,
                    agreements, onchainCounters, recalculationInput, shares, escrowReconciliation,
                    releaseReconciliation, depositReconciliation, receiptSummary, releaseTx,
                    guarantees, simulationNotice, refreshedAt, true);
        }
    }

    /** 컨트랙트 좌표. 브라우저가 같은 주소로 직접 view를 부를 수 있어야 한다. */
    public record Contracts(
            String tokenAddress,
            String tokenSymbol,
            Integer tokenDecimals,
            String revenueSplitter,
            String explorerBaseUrl
    ) {}

    /**
     * 잠긴 규칙.
     *
     * <p>{@code raw}가 <b>해시의 원본</b>이다. 브라우저는 이 객체를 같은 방식으로 직렬화해 해시하고
     * {@code rulesHash}·{@code onchainRulesHash}와 비교한다. 그래서 직렬화 방식이 서버·컨트랙트·
     * 프론트에서 <b>글자 단위로</b> 같아야 한다.
     *
     * <p>{@code hashMatched}가 {@code false}면 서버 규칙과 온체인 규칙이 다르다는 뜻이고, 그것이 곧
     * 이 프로젝트가 막으려는 상황이다. <b>둘 중 하나라도 읽지 못했으면 {@code false}다</b> —
     * "모르겠다"를 "맞다"로 내리지 않는다.
     */
    public record LockedRule(
            String rulesHash,
            LockedRuleRaw raw,
            String onchainRulesHash,
            boolean hashMatched,
            OffsetDateTime lockedAt,
            String startSaleTxHash
    ) {}

    /** 해시 입력값. 필드 순서가 곧 직렬화 순서다 — 임의로 바꾸지 않는다. */
    public record LockedRuleRaw(
            Long performanceId,
            Integer fixedRatioBp,
            Integer selectionRatioBp,
            List<TeamShare> teamShares,
            Long hostTeamId
    ) {}

    /** 고정 풀 내 팀별 비율(basis point). 합이 10000이어야 한다. */
    public record TeamShare(Long teamId, Integer shareBp) {}

    /**
     * 팀별 동의 증거. {@code onchainAgreed}가 컨트랙트에서 읽은 값이다.
     *
     * <p><b>판정 불가면 필드가 없다</b>(null) — 온체인 조회 실패, 또는 온체인 팀 지갑 배열과 서버
     * 참여팀 순서가 어긋나 "이 지갑이 이 공연의 그 팀 지갑인지" 자체를 믿을 수 없는 경우다. 그때
     * {@code false}로 내리면 <b>동의한 팀이 미동의로 보인다.</b>
     */
    public record Agreement(
            Long teamId,
            String teamName,
            String walletAddress,
            Boolean onchainAgreed,
            String signerType,
            String txHash,
            OffsetDateTime agreedAt
    ) {}

    /**
     * 팀별 온체인 선택 카운터 + <b>장부 관측값 3종</b>.
     *
     * <p>{@code purchaseCount}·{@code refundCount}·{@code refundedAmount}는 명세 개정(B-5 ·
     * 컨트랙트 인터페이스 v1 §4.1 감사 M-10)으로 추가된 필드다. 환불은 <b>금액과 무관하게</b> 그
     * 주문의 표를 전량 빼므로, 1원 환불 30건으로 팀 카운터를 통째로 없앨 수 있다. 그 공격은
     * 집계 대사를 통과하고 <b>이 세 값을 나란히 보는 것으로만</b> 드러난다.
     *
     * @param choiceCount    온체인 값. 이미 차감이 반영된 <b>순 카운터</b>다. 팀 순서 대조가 깨지면
     *                       어느 팀의 값인지 알 수 없어 <b>필드가 없다</b>(null)
     * @param purchaseCount  결제 완료 주문 수(서버 장부)
     * @param refundCount    환불 이력이 있는 주문 수(서버 장부)
     * @param refundedAmount 환불 금액 합(서버 장부, YoYo)
     */
    public record OnchainCounter(
            Long teamId,
            Integer teamIndex,
            Long choiceCount,
            Long purchaseCount,
            Long refundCount,
            Long refundedAmount
    ) {}

    /**
     * 재계산 입력 — <b>이 값들만으로 {@code shares}가 재현되어야 한다.</b>
     *
     * <p>{@code distributableAmount}가 계산의 R이다. release 이후 온체인 {@code escrowOf}는 0이
     * 되므로 그 값을 R로 쓰면 재계산이 무너진다 — 집계 확정 시점에 얼린 값을 그대로 싣는다.
     */
    public record RecalculationInput(
            Long grossRevenueAmount,
            Long refundedAmount,
            Long netRevenueAmount,
            Long distributableAmount,
            Integer fixedRatioBp,
            Integer selectionRatioBp,
            List<TeamShare> teamShares,
            Integer participantCount,
            Long totalChoiceCount,
            String roundingRule,
            String remainderRule,
            Long hostTeamId,
            Long dustAmount,
            Integer tokenDecimals,
            String currency
    ) {}

    /** 팀별 몫 — {@code recalculationInput}으로 재현되는 값. */
    public record Share(
            Long teamId,
            String teamName,
            Long fixedAmount,
            Long choiceAmount,
            Long dustAmount,
            Long totalAmount
    ) {}

    /** 불변식 2 — {@code escrowOf(showId) = Σpurchase − Σrefund − Σrelease}. */
    public record EscrowReconciliation(
            Long purchasedTotal,
            Long refundedTotal,
            Long releasedTotal,
            Long escrowBalanceOnchain,
            Long expectedEscrowBalance,
            Boolean matched,
            String note
    ) {}

    /**
     * 불변식 3 — 온체인 지급 합 vs 잠긴 규칙 × 카운터 재계산 합. <b>dust 포함 1원도 다르지 않아야
     * 한다.</b>
     *
     * <p>{@code releasedEvents}는 온체인 {@code payoutsOf}에서 만든다({@code eth_getLogs}를 쓰지
     * 않는다 — 공용 RPC 블록 범위 제한).
     *
     * <p><b>release 전에는 판정하지 않는다.</b> {@code releasedEventTotal}·{@code difference}·
     * {@code matched}가 {@code null}이고(JSON에서 필드째 빠진다) {@code releasedEvents}는 빈
     * 배열이다. 0을 채워 넣으면 화면이 "0 ≠ 재계산액"으로 읽어 <b>아직 일어나지 않은 일을 불일치로
     * 표시</b>한다 — 판정 없음과 불일치는 다른 사건이다. {@code recalculatedTotal}은 언제나 준다,
     * 그것은 지금 계산할 수 있는 값이기 때문이다.
     */
    public record ReleaseReconciliation(
            Long releasedEventTotal,
            Long recalculatedTotal,
            Long difference,
            Boolean matched,
            List<ReleasedEvent> releasedEvents
    ) {}

    /** 팀 지갑 단위 지급액. 관객 지갑은 어디에도 나오지 않는다. */
    public record ReleasedEvent(String teamWallet, Long amount) {}

    /** 보증금 납부·반환 대사. 에스크로와 <b>별도 계정</b>이라 R에 들어가지 않는다. */
    public record DepositReconciliation(
            Long amount,
            String status,
            String paidTxHash,
            String returnTxHash,
            Boolean matched
    ) {}

    /**
     * 팀별 수령 여부·시각. <b>release 확정이 곧 수령</b>이라 이 값이 종단 정보다(v5에서 수령 이후
     * 요약이 삭제된 이유).
     */
    public record ReceiptItem(
            Long teamId,
            String walletAddress,
            Long receivedAmount,
            boolean received,
            OffsetDateTime receivedAt
    ) {}

    /** release tx. {@code explorerUrl}은 서버가 완성된 절대 URL로 내려준다(§0.7). */
    public record ReleaseTx(String txHash, String explorerUrl, OffsetDateTime releasedAt) {}

    /** 보장 범위를 정직하게 표기한다 — 입력 데이터의 진실성·탈중앙 운영은 보장하지 않는다. */
    public record Guarantees(List<String> guaranteed, List<String> notGuaranteed) {}
}
