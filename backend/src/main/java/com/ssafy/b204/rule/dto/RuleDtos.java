package com.ssafy.b204.rule.dto;

import com.ssafy.b204.chain.dto.ChainDtos.SignRequest;
import com.ssafy.b204.common.response.Money;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * rule 도메인 DTO — API v6 §5 (API-rule-01~05). 접두 {@code RULE_*}.
 *
 * <p><b>이 도메인이 프로젝트의 핵심이다.</b> 판매 시작 전 참여팀 전원이 동의해 컨트랙트에 규칙을
 * 잠그면 사후 변조가 불가능해진다 — 블록체인을 쓰는 유일한 이유다.
 *
 * <p>비율은 bp(basis point, 1bp = 0.01%)이고 {@code fixedRatioBp + selectionRatioBp == 10000},
 * {@code teamShares[].shareBp} 합도 {@code 10000}이어야 한다. 아니면
 * {@code RULE_RATIO_SUM_INVALID}(400).
 */
public final class RuleDtos {

    private RuleDtos() {
    }

    /** 고정 풀 내 팀별 몫(bp). 합이 10000. */
    public record TeamShare(
            @NotNull Long teamId,
            @NotNull @Min(0) @Max(10_000) Integer shareBp
    ) {}

    // ------------------------------------------------------------ API-rule-01

    /**
     * {@code PUT /api/v1/performances/{id}/rules} — 정산 규칙 설정. 권한 생성자.
     *
     * <p>선행 조건은 <b>보증금 납부</b>다(v4 변경). 미납이면
     * {@code PERFORMANCE_INVALID_STATUS}(409).
     *
     * <p>{@code simulationRevenue}는 화면 미리보기용 가정 매출이며 저장하지 않는다 —
     * 팀이 "이 규칙이면 얼마를 받는지"를 동의 전에 확인해야 하기 때문이다.
     */
    public record SetRuleRequest(
            @NotNull @Min(0) @Max(10_000) Integer fixedRatioBp,
            @NotNull @Min(0) @Max(10_000) Integer selectionRatioBp,
            @NotEmpty(message = "참여팀 배분 비율을 입력해 주세요.") @Valid List<TeamShare> teamShares,
            Long simulationRevenue
    ) {}

    /**
     * {@code rulesHash}가 동의 대조의 기준이다. {@code agreementsReset}이 {@code true}면 규칙이
     * 바뀌어 기존 동의가 무효화됐다는 뜻이다.
     */
    public record SetRuleResponse(
            Long performanceId,
            String status,
            String depositStatus,
            Integer fixedRatioBp,
            Integer selectionRatioBp,
            List<TeamShare> teamShares,
            String rulesHash,
            boolean agreementsReset,
            Money.Rate rate,
            Simulation simulation,
            String nextAction
    ) {}

    /**
     * 분배 미리보기.
     *
     * <p>{@code dustTeamId}는 정수 나눗셈에서 남는 잔여(dust)를 귀속시킬 팀이다. 버리면
     * Σ분배액 ≠ 총매출이 되어 에스크로에 먼지가 남고 대사가 영구히 어긋난다.
     */
    public record Simulation(
            Long assumedRevenueAmount,
            Long distributableAmount,
            String currency,
            Long dustTeamId,
            List<SimulatedShare> shares
    ) {}

    public record SimulatedShare(Long teamId, String teamName, Long amount) {}

    // ------------------------------------------------------------ API-rule-02

    /** 규칙·동의 현황. 권한 PERFORMER(참여팀). 미동의 팀을 화면에 노출한다. */
    public record RuleStatusResponse(
            Long performanceId,
            String performanceStatus,
            String depositStatus,
            boolean locked,
            String rulesHash,
            RuleBlock rule,
            List<AgreementItem> agreements,
            /** 내 팀의 다음 행동 — {@code SIGN}/{@code WAIT}/{@code NONE}. 참여팀이 아니면 없다. */
            MyAgreement myAgreement,
            /** 판매 시작 버튼 활성 조건을 <b>서버가 정한다</b> — 화면이 규칙을 다시 구현하지 않게. */
            boolean startSaleAvailable,
            /** 막힌 이유(에러 코드 문자열). 가능하면 {@code null}. */
            String startSaleBlockedReason,
            /**
             * 요청자가 리더인 <b>이 공연의 참여팀 전부</b>. 화면이 팀을 전환할 수 있게
             * ({@code ?teamId=}) 목록을 내려준다.
             *
             * <p>정렬 — <b>주최팀 우선, 그다음 {@code teamId} 오름차순</b>. {@code teamId}를 주지
             * 않으면 {@code myAgreement}가 이 배열의 첫 항목이다(API-performance-06과 같은 규칙).
             */
            List<MyTeamAgreement> myParticipatingTeams
    ) {}

    /** 내가 리더인 참여팀 하나의 동의 상태. {@code myAgreement} 전환 후보다. */
    public record MyTeamAgreement(Long teamId, String teamName, boolean host,
                                   String agreementStatus) {}

    /** {@code nextAction} — {@code PENDING}이면 {@code SIGN}, {@code SIGNING}이면 {@code WAIT}. */
    public record MyAgreement(Long teamId, String status, String nextAction) {}

    public record RuleBlock(Integer fixedRatioBp, Integer selectionRatioBp,
                             List<TeamShare> teamShares) {}

    /** {@code status}는 {@code PENDING}/{@code SIGNING}/{@code AGREED}(ERD ENUM과 같다). */
    public record AgreementItem(
            Long teamId,
            String teamName,
            String walletAddress,
            String status,
            String txHash,
            String explorerUrl,
            OffsetDateTime agreedAt
    ) {}

    // ------------------------------------------------------------ API-rule-03

    /**
     * 규칙 동의 서명 파라미터(§0.4 {@code prepare}). 권한 참여팀 리더.
     *
     * <p>요청 {@code rulesHash}가 현재 서버 규칙의 해시와 다르면
     * {@code RULE_HASH_MISMATCH}(409)다 — 규칙이 중간에 바뀐 상황이라 그대로 서명시키면
     * 팀이 보지 않은 규칙에 동의하게 된다.
     */
    public record AgreePrepareRequest(
            @NotNull Long teamId,
            @NotBlank @Pattern(regexp = "^0x[0-9a-fA-F]{64}$",
                    message = "규칙 해시는 0x + 64 hex 형식이어야 합니다.") String rulesHash
    ) {}

    public record AgreePrepareResponse(
            Long performanceId,
            Long teamId,
            String rulesHash,
            String prerequisiteJobId,
            List<SignRequest> signRequests,
            OffsetDateTime expiresAt,
            /** [2026-09-24] 본인 확인 스위치가 켜졌을 때만 {@code true}. 꺼져 있으면 키가 없다(API v7 §7.W). */
            Boolean stepUpRequired
    ) {}

    // ------------------------------------------------------------ API-rule-05

    /**
     * 동의 tx 보고(§0.4 {@code signed-tx}).
     *
     * <p><b>{@code kind}는 선택이다.</b> md 본문 표(API-rule-05)는 {@code {teamId,
     * senderSignedRlp}} 두 개만 적었고, {@code openapi.yaml}은 공통 {@code SignedTxRequest}를
     * 상속시켜 {@code kind}를 필수로 만들었다(QA 2026-09-09 D-1). 어느 쪽이 정본이 되든
     * <b>추가 필드 하나에 400을 내는 것</b>이 통합 실패 지점이라(전역
     * {@code fail-on-unknown-properties: true}) 받아 두되 요구하지는 않는다.
     *
     * <p>값이 오면 검증한다 — §0.4 ③은 {@code kind}를 "①에서 받은 {@code signRequests[].kind}
     * 그대로"로 정의하고 API-rule-03이 내려주는 것은 {@code AGREE} 하나뿐이다. 다른 값을 조용히
     * 무시하면 프론트가 {@code APPROVE} 서명을 동의로 잘못 보고해도 서버가 알려 주지 않는다.
     * API-payment-03의 400 조건 "허용되지 않는 {@code kind}"와 같은 규칙이다.
     */
    public record AgreeSignedTxRequest(
            String kind,
            @NotNull Long teamId,
            @NotBlank String senderSignedRlp
    ) {}

    /**
     * {@code allAgreed}·{@code pendingTeamIds}·{@code startSaleAvailable}이 다음 단계를 지시한다.
     * 전원 동의 전에 판매 시작을 시도하면 {@code RULE_NOT_AGREED_BY_ALL}(409).
     */
    public record AgreeSignedTxResponse(
            String jobId,
            String status,
            String signerType,
            Integer pollAfterMs,
            Long performanceId,
            Long teamId,
            String agreementStatus,
            String txHash,
            String explorerUrl,
            boolean allAgreed,
            List<Long> pendingTeamIds,
            boolean startSaleAvailable
    ) {}

    // ------------------------------------------------------------ API-rule-04

    /**
     * 판매 시작({@code startSale} 잠금). 권한 생성자. 202 + 폴링.
     *
     * <p><b>여기서 규칙이 컨트랙트에 잠긴다.</b> 이후 규칙 수정은 서버가 막고
     * ({@code RULE_ALREADY_LOCKED}) <b>컨트랙트에서도 revert된다</b> — 서버만 막는 것이 아니라는
     * 점이 이 설계의 요지다.
     *
     * <p>선행 조건 — 보증금 납부 + 참여팀 전원 동의 + (공동 공연이면) 2팀 이상.
     */
    public record StartSaleRequest(
            @NotBlank @Pattern(regexp = "^0x[0-9a-fA-F]{64}$",
                    message = "규칙 해시는 0x + 64 hex 형식이어야 합니다.") String rulesHash) {}

    /**
     * {@code teamWallets}의 {@code teamIndex}가 컨트랙트가 팀을 가리키는 인덱스다.
     *
     * <p><b>{@code prerequisiteJobId}가 있으면 판매 시작 tx 는 아직 걸리지 않았다</b>
     * (S15P21B204-67). {@code startSale}은 온체인 stage 가 {@code CREATED}일 때만 통과하므로
     * {@code createShow}가 확정되기 전에는 {@code START_SALE} job 을 만들지 않는다 — 두 job 이
     * 동시에 {@code PENDING}이면 워커가 {@code startSale}을 먼저 보내 revert 한다. 그때
     * {@code jobId}는 {@code null}이고 프론트는 {@code prerequisiteJobId}를 폴링해 확정을 본
     * 뒤 이 API 를 다시 부른다.
     */
    public record StartSaleResponse(
            String jobId,
            String status,
            String signerType,
            Integer pollAfterMs,
            Long performanceId,
            String nextStatus,
            String splitterAddress,
            List<TeamWallet> teamWallets,
            String prerequisiteJobId
    ) {}

    public record TeamWallet(Long teamId, Integer teamIndex, String walletAddress) {}
}
