package com.ssafy.b204.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.support.EntityLocks;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link EntityLocks#lockForUpdate}가 "락을 기다리는 사이 지워진 행"을 404 로 바꾸는지 실제
 * Hibernate·MySQL 로 고정한다. 공연 취소·삭제·규칙 저장·정산이 모두 이 헬퍼를 거친다 — refresh 의
 * 예외 타입이 바뀌면 catch 가 조용히 빗나가 500 이 된다(!202 리뷰).
 */
class RefreshDeletedRowTest extends IntegrationTestBase {

    @Autowired
    private MemberRepository memberRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private TransactionTemplate transactionTemplate;
    @PersistenceContext
    private EntityManager em;

    @Test
    @DisplayName("다른 트랜잭션이 지운 행을 잠그려 하면 COMMON_NOT_FOUND 다")
    void lockingDeletedRowIsNotFound() {
        Long id = memberRepository.save(Member.builder()
                .email("refresh-deleted@b204.test")
                .name("지워질 회원")
                .authProvider(Member.AuthProvider.GOOGLE)
                .countryCode("KR")
                .build()).getMemberId();

        // 단언이 어느 쪽으로 실패하든 공유 컨테이너에 회원 행을 남기지 않는다(!202 후속).
        // 이미 지워졌으면 0행이라 무해하다.
        try {
            assertThatThrownBy(() -> transactionTemplate.executeWithoutResult(status -> {
                Member loaded = em.find(Member.class, id);
                // 다른 스레드라 다른 커넥션·자동 커밋이다 — 락 대기 중에 끝난 동시 삭제를 흉내 낸다.
                Thread deleter = new Thread(
                        () -> jdbcTemplate.update("DELETE FROM member WHERE member_id = ?", id));
                deleter.start();
                try {
                    deleter.join();
                } catch (InterruptedException e) {
                    throw new IllegalStateException(e);
                }
                EntityLocks.lockForUpdate(em, loaded);
            })).isInstanceOfSatisfying(BusinessException.class,
                    e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.COMMON_NOT_FOUND));
        } finally {
            jdbcTemplate.update("DELETE FROM member WHERE member_id = ?", id);
        }
    }
}
