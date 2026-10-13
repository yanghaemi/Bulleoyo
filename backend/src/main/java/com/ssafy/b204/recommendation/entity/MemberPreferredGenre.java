package com.ssafy.b204.recommendation.entity;

import com.ssafy.b204.team.entity.Genre;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회원 선호 장르 — ERD v6 {@code member_preferred_genre}. 회원당 0~3행.
 *
 * <p>{@code member}에 컬럼 3개를 두지 않은 이유는 개수가 가변이기 때문이다(D-R03). 선택하지
 * 않은 회원은 <b>행이 없다</b> — 빈 배열과 미선택을 구분하지 않는다.
 *
 * <p>복합 PK {@code (member_id, genre)}는 {@code @IdClass}로 잡았다. 행에 자기 속성이라 할 것이
 * {@code created_at} 하나뿐이라 {@code @EmbeddedId} 래퍼 클래스를 두면 접근 경로만 한 단계
 * 길어진다. 연관을 {@code Member} 엔티티가 아니라 {@code Long memberId}로 든 것도 같은 이유다 —
 * 선호 장르를 읽는 쪽은 언제나 회원을 이미 들고 있다.
 */
@Entity
@Table(name = "member_preferred_genre")
@IdClass(MemberPreferredGenre.Key.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberPreferredGenre {

    @Id
    @Column(name = "member_id")
    private Long memberId;

    /**
     * {@code team.genre}와 달리 {@code GenreConverter}를 쓰지 않는다 — <b>JPA 는 식별자
     * 속성에 AttributeConverter 를 적용하지 않는다</b>(JPA 3.1 §11.2.2.1). {@code @Convert}를
     * 붙여도 조용히 무시되고 Hibernate 가 enum 을 ordinal/TinyInt 로 읽어
     * {@code ArrayIndexOutOfBoundsException}이 난다.
     *
     * <p>관대한 읽기를 포기해도 되는 이유는 이 테이블이 V13 에서 새로 생겼고 쓰기 경로가
     * {@link Genre#of}를 반드시 지나기 때문이다. 예상 밖 값이 생길 내력이 없다 —
     * 자유 입력 이력이 있는 쪽은 {@code team.genre} 뿐이다.
     */
    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "genre", length = 20)
    private Genre genre;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private LocalDateTime createdAt;

    public MemberPreferredGenre(Long memberId, Genre genre) {
        this.memberId = memberId;
        this.genre = genre;
    }

    /** {@code @IdClass} 규약 — 필드 이름·타입이 엔티티의 {@code @Id} 필드와 같아야 한다. */
    public record Key(Long memberId, Genre genre) implements Serializable {
        public Key() {
            this(null, null);
        }
    }
}
