package com.ssafy.b204.webauthn.entity;

import com.ssafy.b204.common.entity.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회원 기기 패스키 — {@code webauthn_credential}(V14 · ERD v6.1).
 *
 * <p><b>생체 정보·개인키가 없다.</b> 공개키(COSE)와 서명 카운터만 둔다.
 *
 * <p>{@code member_id}를 연관(@ManyToOne)이 아니라 id 로 들고 있는 이유 — 이 엔티티가 쓰이는 곳은
 * "이 회원의 credential 인가" 비교와 목록 조회뿐이라 {@code Member}를 로딩할 일이 없다.
 */
@Entity
@Table(name = "webauthn_credential")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WebauthnCredential extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "webauthn_credential_id")
    private Long webauthnCredentialId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    /** 원본 바이트. base64url 문자열로 두면 ai_ci 콜레이션이 대소문자를 뭉갠다(V14 헤더). */
    @Column(name = "credential_id", nullable = false, columnDefinition = "VARBINARY(1023)")
    private byte[] credentialId;

    /** COSE_Key CBOR 바이트. */
    @Column(name = "public_key", nullable = false, columnDefinition = "BLOB")
    private byte[] publicKey;

    @Column(name = "sign_count", nullable = false)
    private long signCount;

    /** {@code internal,hybrid}처럼 쉼표로 이은 힌트. 없으면 null. */
    @Column(name = "transports", length = 100)
    private String transports;

    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;

    @Builder
    private WebauthnCredential(Long memberId, byte[] credentialId, byte[] publicKey, long signCount,
                               String transports) {
        this.memberId = memberId;
        this.credentialId = credentialId;
        this.publicKey = publicKey;
        this.signCount = signCount;
        this.transports = transports;
    }

    /** 본인 확인 성공 — 카운터 증가 검사는 webauthn4j 가 이미 끝냈다. 여기서는 기록만 한다. */
    public void markUsed(long newSignCount, LocalDateTime usedAt) {
        this.signCount = newSignCount;
        this.lastUsedAt = usedAt;
    }
}
