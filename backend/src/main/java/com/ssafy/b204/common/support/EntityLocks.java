package com.ssafy.b204.common.support;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import jakarta.persistence.LockModeType;

/**
 * 이미 로드한 엔티티를 쓰기 잠금으로 다시 읽는다.
 *
 * <p><b>락 파인더로는 부족하다</b> — 영속성 컨텍스트에 있는 인스턴스는 Hibernate 가 락 모드만
 * 올리고 필드를 덮어쓰지 않아, 락 뒤 재검사가 기다리기 전의 값을 본다. {@code refresh}는 같은
 * 락을 잡으면서 DB 상태로 덮어쓴다(미저장 변경이 없을 때만 부른다).
 *
 * <p>락을 기다리는 사이 행이 지워졌으면 500 이 아니라 {@code COMMON_NOT_FOUND}(404)다. 이 예외
 * 타입은 {@code RefreshDeletedRowTest}가 실제 MySQL 로 고정한다.
 *
 * <p>호출자는 {@code READ_COMMITTED}여야 락 뒤의 다른 조회도 최신 커밋을 본다 — MySQL 기본
 * {@code REPEATABLE READ}에서는 잠근 행만 최신이고 나머지 SELECT 는 첫 조회 때의 스냅숏이다.
 */
public final class EntityLocks {

    private EntityLocks() {
    }

    public static void lockForUpdate(EntityManager em, Object entity) {
        try {
            em.refresh(entity, LockModeType.PESSIMISTIC_WRITE);
        } catch (EntityNotFoundException e) {
            throw BusinessException.of(ErrorCode.COMMON_NOT_FOUND);
        }
    }
}
