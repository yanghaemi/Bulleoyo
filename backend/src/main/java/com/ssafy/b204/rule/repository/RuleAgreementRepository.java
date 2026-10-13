package com.ssafy.b204.rule.repository;

import com.ssafy.b204.rule.entity.RuleAgreement;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RuleAgreementRepository extends JpaRepository<RuleAgreement, Long> {

    /** API-rule-02 규칙·동의 현황 — 미동의 팀 목록을 화면에 노출한다. */
    List<RuleAgreement> findByPerformance_PerformanceId(Long performanceId);

    Optional<RuleAgreement> findByPerformance_PerformanceIdAndTeam_TeamId(Long performanceId,
                                                                          Long teamId);

    /** 공연 삭제(API-performance-18) — FK가 RESTRICT라 부모보다 먼저 지운다. */
    void deleteByPerformance_PerformanceId(Long performanceId);
    /**
     * 자가 치유 스윕 — {@code RuleService.failSigningsWithClosedJobs} 가 {@code SIGNING} 만 훑는다.
     *
     * <p>{@code rule_agreement.chain_job_id} 는 연관이 아니라 값 컬럼이라(순환 참조 회피, ERD v5)
     * JPQL 로 {@code chain_job} 과 조인할 수 없다 — 두 번에 나눠 읽는다. {@code SIGNING} 은 서명
     * 대기 중인 몇 건뿐이라 건수가 문제가 되지 않는다.
     */
    List<RuleAgreement> findByStatus(RuleAgreement.Status status);

    /** {@code RULE_NOT_AGREED_BY_ALL} 검사 — 참여팀 수와 이 값이 같아야 판매를 시작한다. */
    long countByPerformance_PerformanceIdAndStatus(Long performanceId, RuleAgreement.Status status);
}
