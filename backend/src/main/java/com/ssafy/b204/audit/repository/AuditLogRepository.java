package com.ssafy.b204.audit.repository;

import com.ssafy.b204.audit.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * append-only. 수정·삭제 메서드를 추가하지 않는다 — 감사 로그가 지워질 수 있으면 감사가 아니다.
 */
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    Page<AuditLog> findByActionType(AuditLog.ActionType actionType, Pageable pageable);

    Page<AuditLog> findByResourceTypeAndResourceId(String resourceType, Long resourceId,
                                                    Pageable pageable);
}
