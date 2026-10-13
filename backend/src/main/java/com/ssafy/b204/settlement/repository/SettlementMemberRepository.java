package com.ssafy.b204.settlement.repository;

import com.ssafy.b204.member.entity.Member;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code chain_job.requester_member_id}를 채우기 위한 회원 조회 — settlement 소유의 읽기 전용.
 *
 * <p>요청자를 남기지 않으면 API-chain-01(작업 상태 조회)의 "요청자 본인 또는 ADMIN" 권한 판정이
 * ADMIN만 남는다. 자동 스케줄이 만든 job은 요청자가 없으므로 {@code null}이다.
 */
public interface SettlementMemberRepository extends JpaRepository<Member, Long> {
}
