package com.ssafy.b204.common.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import java.time.LocalDateTime;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * {@code created_at} · {@code updated_at}을 함께 가진 5개 테이블의 공통 상위 클래스 —
 * {@code member} · {@code team} · {@code performance} · {@code settlement_rule} ·
 * {@code ticket_order}.
 *
 * <p><b>여기에 {@code id}가 없는 것이 핵심이다.</b> 컨벤션 §4는 PK 이름을 테이블별로
 * {@code {테이블명}_id}로 두기로 정했고, 그 대가로 "{@code id} 하나로 통일하는 제네릭
 * {@code BaseEntity}를 쓸 수 없다 — 엔티티마다 {@code @Id} 필드를 따로 선언한다"고 못박았다.
 * 이 클래스는 PK를 다루지 않고 시각 컬럼만 모으므로 그 제약에 걸리지 않는다.
 *
 * <p>DB에도 {@code DEFAULT CURRENT_TIMESTAMP(6)} / {@code ON UPDATE CURRENT_TIMESTAMP(6)}가
 * 걸려 있다(V1). 둘 다 두는 이유는 JPA로 저장한 엔티티가 flush 직후에도 값을 갖고 있어야 하고
 * (DB 기본값만 쓰면 refresh 전까지 {@code null}이다), 마이그레이션·수기 SQL로 넣은 행도
 * 시각이 채워져야 하기 때문이다.
 *
 * <p>{@code deleted_at}은 여기 두지 않는다 — 소프트 삭제가 필요한 테이블({@code team})만
 * 자체 컬럼으로 갖는다(컨벤션 §4).
 */
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseTimeEntity {

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
