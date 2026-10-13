package com.ssafy.b204.admin.service;

import com.ssafy.b204.admin.dto.AdminDtos.DisputeItem;
import com.ssafy.b204.admin.dto.AdminDtos.DisputeListResponse;
import com.ssafy.b204.admin.dto.AdminDtos.DisputeListSummary;
import com.ssafy.b204.admin.dto.AdminDtos.ResolveDisputeRequest;
import com.ssafy.b204.admin.dto.AdminDtos.ResolveDisputeResponse;
import com.ssafy.b204.audit.entity.AuditLog;
import com.ssafy.b204.audit.repository.AuditLogRepository;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.Paging;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.settlement.entity.Dispute;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.DisputeRepository;
import com.ssafy.b204.settlement.service.SettlementTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * admin 이의제기 처리 — API v6 §13(API-admin-06·09).
 *
 * <h2>판정을 두 벌로 만들지 않는다</h2>
 *
 * <p>{@code releaseHeld}의 정의는 {@link Settlement#isReleasePossible()} 하나뿐이고, 팀 화면
 * (API-settlement-01 {@code disputes[]})과 이 관리자 목록·요약이 <b>같은 메서드</b>를 본다.
 * 여기에 식을 다시 적으면 "관리자 화면에서는 처리 가능인데 release는 막히는" 상태가 난다.
 * 실행 여부의 정본은 여전히 {@code SettlementGates#release}이며, 이 API는 그 게이트가 읽는 값
 * ({@code dispute.status})을 쓰기만 한다.
 *
 * <p>상태 전이도 이의 한 줄뿐이다 — {@code settlement.status}를 건드리지 않는다.
 * {@code REJECTED}면 열린 이의가 사라져 게이트가 스스로 풀리고(자동 스케줄 재개),
 * {@code HALTED}로 보내는 판정은 공연 취소(API-performance-12)의 몫이다. 이 API는 온체인 tx를
 * 만들지 않는다.
 *
 * <p>{@code RESOLVED} 후 재집계 경로는 만들지 않는다(v6 §11 정정) — {@code AGGREGATED}로
 * 되돌리는 경로가 없다.
 *
 * <p>모든 처리는 {@code ADMIN_ACTION} 감사 로그 대상이다(SEC-11) — 누가·언제·무엇을 바꿨는지
 * 남지 않으면 정산 분쟁에서 근거가 없다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminDisputeService {

    /** 명세의 정렬 필드 이름 → 엔티티 속성. 그 밖은 {@code COMMON_VALIDATION_FAILED}. */
    private static final Map<String, String> SORTABLE = Map.of(
            "createdAt", "submittedAt",
            "disputeClosesAt", "settlement.disputeDeadlineAt");

    /** 기본 정렬 = 미처리 우선·오래된 순. {@code status} ENUM 순서가 {@code OPEN}을 먼저 준다. */
    private static final Sort DEFAULT_SORT =
            Sort.by(Sort.Order.asc("status"), Sort.Order.asc("submittedAt"));

    private final DisputeRepository disputeRepository;
    private final MemberRepository memberRepository;
    private final AuditLogRepository auditLogRepository;

    /** API-admin-09 이의제기 목록. 권한 ADMIN. */
    public DisputeListResponse disputes(MemberPrincipal me, String status, Long performanceId,
                                        Pageable pageable) {
        requireAdmin(me);
        Page<Dispute> page = disputeRepository.search(parseStatus(status), performanceId,
                Paging.of(pageable, SORTABLE, DEFAULT_SORT));
        List<DisputeItem> items = page.getContent().stream().map(AdminDisputeService::toItem)
                .toList();
        return new DisputeListResponse(summary(performanceId), items, PageInfo.from(page));
    }

    /**
     * API-admin-06 이의제기 처리. 권한 ADMIN.
     *
     * <p>{@code REJECTED}면 release 보류가 풀려 자동 스케줄이 재개된다.
     */
    @Transactional
    public ResolveDisputeResponse resolveDispute(MemberPrincipal me, Long disputeId,
                                                 ResolveDisputeRequest request) {
        requireAdmin(me);
        Dispute dispute = disputeRepository.findById(disputeId)
                // 명세는 COMMON_NOT_FOUND 다 — DISPUTE_NOT_FOUND 같은 코드를 만들지 않는다.
                .orElseThrow(ErrorCode.COMMON_NOT_FOUND::toException);
        if (!dispute.isOpen()) {
            throw ErrorCode.COMMON_CONFLICT.toException("이미 처리된 이의제기입니다.");
        }
        Settlement settlement = dispute.getSettlement();
        if (settlement.getStatus() == Settlement.Status.RELEASED) {
            throw ErrorCode.SETTLEMENT_ALREADY_RELEASED.toException();
        }
        Member handler = memberRepository.findById(me.memberId())
                .orElseThrow(ErrorCode.COMMON_NOT_FOUND::toException);

        Dispute.Status resolution = Dispute.Status.valueOf(request.status());
        if (resolution == Dispute.Status.RESOLVED) {
            dispute.resolve(handler, request.adminComment());
        } else {
            dispute.reject(handler, request.adminComment());
        }
        disputeRepository.save(dispute);

        auditLogRepository.save(AuditLog.builder()
                .actor(handler)
                .actorRole("ADMIN")
                .actionType(AuditLog.ActionType.ADMIN_ACTION)
                .resourceType("dispute")
                .resourceId(disputeId)
                .requestSummary("DISPUTE_RESOLVE status=" + resolution
                        + " settlementId=" + settlement.getSettlementId()
                        + " adminComment=" + request.adminComment())
                .result(AuditLog.Result.SUCCESS)
                .build());
        log.info("이의제기 처리 — disputeId={} status={} handlerMemberId={}",
                disputeId, resolution, me.memberId());

        return new ResolveDisputeResponse(disputeId,
                settlement.getPerformance().getPerformanceId(),
                dispute.getTeam().getTeamId(),
                resolution.name(),
                // 처리한 이의는 더 이상 열려 있지 않다. 남은 이의가 있으면 보류는 계속된다.
                remainingHold(settlement),
                SettlementTime.toOffset(dispute.getResolvedAt()));
    }

    // ------------------------------------------------------------ 조립

    private void requireAdmin(MemberPrincipal me) {
        // SecurityConfig·@PreAuthorize가 이미 막지만, 서비스가 직접 불릴 때(스케줄·테스트)도
        // 같은 결론이 나오게 둔다.
        if (me == null) {
            throw ErrorCode.COMMON_UNAUTHORIZED.toException();
        }
        if (!me.admin()) {
            throw ErrorCode.COMMON_FORBIDDEN.toException();
        }
    }

    /** 허용 밖 값은 400 — 명세의 {@code OPEN|RESOLVED|REJECTED}만 받는다. 미지정은 전체. */
    private static Dispute.Status parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return Dispute.Status.valueOf(status.trim());
        } catch (IllegalArgumentException e) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "status는 OPEN·RESOLVED·REJECTED 중 하나여야 합니다.");
        }
    }

    /**
     * {@code summary} — 필터의 {@code status}와 무관하게 <b>미처리 기준</b>으로 센다. 이 요약은
     * "얼마나 남았는가"를 말하는 값이라 {@code status=RESOLVED}로 좁혀 봐도 0이 되면 안 된다.
     * {@code performanceId}로 좁힌 화면에서는 그 공연 범위만 센다.
     *
     * <p>{@code releaseHeldCount}는 <b>정산 수</b>다(한 정산에 이의가 여럿일 수 있다).
     * 판정은 목록 item의 {@code releaseHeld}와 같은 식을 쓴다 — 별도 규칙을 만들지 않는다.
     */
    private DisputeListSummary summary(Long performanceId) {
        // ponytail: 열린 이의를 전부 메모리로 올린다. MVP 규모(공연당 팀 ≤ 10)에서 충분하고,
        // 큰 큐가 되면 count 쿼리 2개로 바꾼다.
        List<Dispute> open = disputeRepository
                .search(Dispute.Status.OPEN, performanceId, Pageable.unpaged()).getContent();
        Set<Long> heldSettlements = open.stream()
                .filter(AdminDisputeService::releaseHeld)
                .map(dispute -> dispute.getSettlement().getSettlementId())
                .collect(Collectors.toSet());
        return new DisputeListSummary(open.size(), heldSettlements.size());
    }

    /** 이 정산에 아직 release를 붙잡고 있는 이의가 남아 있는가. */
    private boolean remainingHold(Settlement settlement) {
        return disputeRepository.findBySettlement_SettlementId(settlement.getSettlementId())
                .stream().anyMatch(AdminDisputeService::releaseHeld);
    }

    /** {@code releaseHeld} — 정의는 {@link Settlement#isReleasePossible()} 하나다. */
    private static boolean releaseHeld(Dispute dispute) {
        return dispute.isOpen() && dispute.getSettlement().isReleasePossible();
    }

    private static DisputeItem toItem(Dispute dispute) {
        Settlement settlement = dispute.getSettlement();
        return new DisputeItem(
                dispute.getDisputeId(),
                settlement.getPerformance().getPerformanceId(),
                settlement.getPerformance().getTitle(),
                dispute.getTeam().getTeamId(),
                dispute.getTeam().getName(),
                dispute.getStatus().name(),
                dispute.getReason(),
                null, // expectedAmount — 저장 컬럼이 ERD 에 없다(D-15). openapi 는 nullable
                Money.BASE_CURRENCY,
                settlement.getStatus().name(),
                SettlementTime.toOffset(settlement.getDisputeDeadlineAt()),
                releaseHeld(dispute),
                SettlementTime.toOffset(dispute.getSubmittedAt()),
                SettlementTime.toOffset(dispute.getResolvedAt()));
    }
}
