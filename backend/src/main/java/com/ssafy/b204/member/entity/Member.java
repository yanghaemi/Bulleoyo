package com.ssafy.b204.member.entity;

import com.ssafy.b204.common.entity.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회원 — ERD v5 {@code member}.
 *
 * <p>지갑은 {@code wallet} 테이블에 1:1로 분리돼 있고 <b>회원 생성 시점에는 없다</b> —
 * API-member-01은 신원만 만들고 등록은 {@code POST /api/v1/wallets}(API-wallet-04)가 한다
 * (v6 변경, 결정 v2 §14-35). 그래서 지갑 없는 회원이 정상 상태다.
 *
 * <p>서버는 사용자 개인키·니모닉·MPC 샤드를 저장하지 않는다 — 이 엔티티와 {@code wallet}
 * 어디에도 키 컬럼이 없다(API v6 §0 전제).
 */
@Entity
@Table(name = "member")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "email", nullable = false, length = 255, unique = true)
    private String email;

    /** 자체 이메일 가입(API-member-08, P1)에서만 채워진다. Web3Auth 회원은 {@code null}. */
    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "phone", length = 20)
    private String phone;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_provider", nullable = false)
    private AuthProvider authProvider;

    /** 소셜 제공자의 사용자 ID. {@code (auth_provider, provider_user_id)}가 UNIQUE. */
    @Column(name = "provider_user_id", length = 255)
    private String providerUserId;

    @Column(name = "country_code", nullable = false, length = 2, columnDefinition = "CHAR(2)")
    private String countryCode;

    /** 표시 언어. {@code Accept-Language}보다 우선한다(API v6 §0.6). 기본 {@code en}. */
    @Column(name = "locale", nullable = false, length = 10)
    private String locale;

    /** 표시 통화. {@code KRW}면 응답에서 {@code display}를 생략한다(§0.5). 기본 {@code USD}. */
    @Column(name = "display_currency", nullable = false, length = 3, columnDefinition = "CHAR(3)")
    private String displayCurrency;

    /** 응답 시각의 오프셋 기준(P-22). 기본 {@code UTC}. */
    @Column(name = "timezone", nullable = false, length = 50)
    private String timezone;

    @Column(name = "is_admin", nullable = false)
    private boolean admin;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    @Column(name = "web3auth_verifier_id", length = 255)
    private String web3authVerifierId;

    @Builder
    private Member(String email, String passwordHash, String name, String phone,
                   AuthProvider authProvider, String providerUserId, String countryCode,
                   String locale, String displayCurrency, String timezone, boolean admin,
                   Status status, String web3authVerifierId) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.name = name;
        this.phone = phone;
        this.authProvider = authProvider;
        this.providerUserId = providerUserId;
        this.countryCode = countryCode;
        // DB DEFAULT는 INSERT 문에 컬럼이 빠질 때만 적용된다. JPA는 항상 전 컬럼을 쓰므로
        // 여기서 기본값을 채워야 en/USD/UTC/ACTIVE 가 실제로 들어간다.
        this.locale = locale != null ? locale : "en";
        this.displayCurrency = displayCurrency != null ? displayCurrency : "USD";
        this.timezone = timezone != null ? timezone : "UTC";
        this.admin = admin;
        this.status = status != null ? status : Status.ACTIVE;
        this.web3authVerifierId = web3authVerifierId;
    }

    /** API-member-06 내 정보 수정 — 화면(C-03·C-04)이 바꿀 수 있는 필드만. */
    public void updateProfile(String name, String phone, String locale, String displayCurrency,
                              String timezone) {
        if (name != null) this.name = name;
        if (phone != null) this.phone = phone;
        if (locale != null) this.locale = locale;
        if (displayCurrency != null) this.displayCurrency = displayCurrency;
        if (timezone != null) this.timezone = timezone;
    }

    /**
     * API-member-06 — 국가 자기 선언(P-23). {@code country_code}가 NOT NULL 이라 값이 있을 때만
     * 바꾼다. 국내 본인인증·휴대폰을 요구하지 않으므로 검증은 형식(ISO 3166-1 alpha-2)뿐이다.
     */
    public void updateCountry(String countryCode) {
        if (countryCode != null && !countryCode.isBlank()) {
            this.countryCode = countryCode;
        }
    }

    /** 인증 방식. {@code LOCAL}은 이메일 가입(P1) 예약값이며 DB 기본값이 없다. */
    public enum AuthProvider {
        GOOGLE, FACEBOOK, KAKAO, LOCAL
    }

    /** 회원 상태. {@code WITHDRAWN} = 탈퇴. */
    public enum Status {
        ACTIVE, SUSPENDED, WITHDRAWN
    }
}
