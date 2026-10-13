package com.ssafy.b204.member.dto;

import com.ssafy.b204.common.response.Money;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * member 도메인 DTO — API v6 §1 (API-member-01·03~06, 02·08은 P1).
 *
 * <p>도메인당 한 파일에 중첩 레코드로 모았다. 이름은 컨벤션 §5대로 {@code XxxRequest} ·
 * {@code XxxResponse}이고, 한 도메인의 요청·응답 계약을 한눈에 보게 하려는 배치다
 * (integration-qa가 프론트 타입과 대조할 때 파일을 따라다니지 않아도 된다).
 *
 * <p><b>서버는 사용자 개인키·니모닉·MPC 샤드를 받지 않는다.</b> 그런 필드가 오면
 * {@code COMMON_VALIDATION_FAILED}로 거부해야 한다 — Jackson의 알 수 없는 필드 거부
 * (기본 설정)로 처리된다. 요청 레코드에 그런 필드를 <b>추가하지 말 것</b>.
 */
public final class MemberDtos {

    private MemberDtos() {
    }

    /**
     * 공통 — 응답에 실리는 지갑 요약. 등록 전이면 {@code null}로 내려간다(v6 nullable).
     *
     * <p>절마다 채우는 항목이 다르다. 전역 {@code non_null} 직렬화라 채우지 않은 필드는 응답에서
     * 빠지고, 각 절 예시와 글자 단위로 같은 모양이 나간다.
     *
     * <ul>
     *   <li><b>API-member-01</b> — {@code provider}·{@code address}·{@code status}·{@code explorerUrl}
     *   <li><b>API-member-05</b> — {@code provider}·{@code address}·{@code status}·{@code balance}·{@code cachedAt}
     * </ul>
     *
     * <p>{@code balance}·{@code cachedAt}의 출처는 Redis {@code wallet:balance}뿐이다 —
     * API-member-05는 <b>노드를 조회하지 않는다</b>(§0.12·PERF-01). 캐시가 비어 있으면 둘 다
     * {@code null}이고 화면은 실시간 값이 필요할 때 API-wallet-01을 호출한다.
     */
    public record WalletSummary(
            Long walletId,
            String provider,
            String address,
            String status,
            Money balance,
            OffsetDateTime cachedAt,
            String explorerUrl
    ) {}

    /** 공통 — 내가 속한 팀 요약(API-member-05). */
    public record TeamSummary(Long teamId, String teamName, boolean leader) {}

    // ------------------------------------------------------------ API-member-01

    /**
     * {@code POST /api/v1/auth/web3auth} — Web3Auth 로그인/가입. 최초 로그인 = 가입.
     *
     * <p>{@code address}는 <b>idToken의 지갑 클레임과 대조하는 검증용</b>이며 저장하지 않는다.
     * 지갑 등록은 별도 단계({@code POST /api/v1/wallets})다.
     */
    public record Web3AuthLoginRequest(
            @NotBlank @Size(max = 4096) String idToken,
            @NotBlank @Pattern(regexp = "^0x[0-9a-fA-F]{40}$",
                    message = "지갑 주소 형식이 올바르지 않습니다.") String address,
            @NotBlank @Pattern(regexp = "GOOGLE|FACEBOOK|KAKAO",
                    message = "지원하지 않는 로그인 제공자입니다.") String provider,
            // 신규 회원은 필수다(P-23 자기 선언). 기존 회원 로그인에는 없어도 된다 —
            // 조건부 필수라 Bean Validation 으로 못 걸고 서비스에서 판정한다.
            @Pattern(regexp = "^[A-Z]{2}$", message = "국가 코드는 ISO 3166-1 alpha-2 형식입니다.")
            String countryCode,
            String locale,
            @Pattern(regexp = "^[A-Z]{3}$", message = "통화 코드는 ISO 4217 형식입니다.")
            String displayCurrency,
            String timezone,
            Boolean termsAgreed,
            Boolean privacyAgreed
    ) {}

    /** {@code wallet}은 등록 전이면 {@code null} — 클라이언트는 C-05 지갑 등록으로 보낸다. */
    public record Web3AuthLoginResponse(
            Long memberId,
            boolean isNewMember,
            String name,
            String email,
            List<String> roles,
            String authProvider,
            String countryCode,
            String locale,
            String displayCurrency,
            String timezone,
            boolean profileCompletionRequired,
            WalletSummary wallet,
            String accessToken,
            OffsetDateTime accessTokenExpiresAt,
            String refreshToken,
            OffsetDateTime refreshTokenExpiresAt
    ) {}

    // ------------------------------------------------------------ API-member-02 (P1)

    /** {@code POST /api/v1/auth/login} — 자체 이메일 로그인. <b>P1</b>. */
    public record EmailLoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password
    ) {}

    public record EmailLoginResponse(
            Long memberId,
            String name,
            List<String> roles,
            String authProvider,
            String locale,
            String displayCurrency,
            String timezone,
            WalletSummary wallet,
            boolean walletLinkRequired,
            String accessToken,
            OffsetDateTime accessTokenExpiresAt,
            String refreshToken,
            OffsetDateTime refreshTokenExpiresAt
    ) {}

    // ------------------------------------------------------------ API-member-03

    /** {@code POST /api/v1/auth/refresh}. 리프레시 토큰은 Redis {@code auth:refresh:{jti}}에 있다. */
    public record TokenRefreshRequest(@NotBlank String refreshToken) {}

    public record TokenRefreshResponse(
            String accessToken,
            OffsetDateTime accessTokenExpiresAt,
            String refreshToken,
            OffsetDateTime refreshTokenExpiresAt
    ) {}

    // ------------------------------------------------------------ API-member-04

    /** {@code POST /api/v1/auth/logout}. {@code allDevices}면 그 회원의 jti 집합을 통째로 지운다. */
    public record LogoutRequest(String refreshToken, Boolean allDevices) {}

    /**
     * 서버 세션만 끊는다. {@code clientAction}은 <b>클라이언트가 해야 할 일</b>을 알리는 값이며
     * 서버가 Web3Auth 세션이나 지갑을 건드리지 않는다는 사실의 표현이다 — 프론트가
     * {@code Web3Auth.logout()}을 별도로 호출한다. 지갑 등록은 로그아웃으로 사라지지 않는다.
     */
    public record LogoutResponse(boolean loggedOut, int revokedCount, String clientAction) {

        /** 명세 200 예시의 고정 문자열. */
        public static final String CLEAR_WEB3AUTH_SESSION = "CLEAR_WEB3AUTH_SESSION";

        public static LogoutResponse of(int revokedCount) {
            return new LogoutResponse(true, revokedCount, CLEAR_WEB3AUTH_SESSION);
        }
    }

    // ------------------------------------------------------------ API-member-05

    /** {@code GET /api/v1/members/me}. */
    public record MyProfileResponse(
            Long memberId,
            String email,
            String name,
            List<String> roles,
            String authProvider,
            String countryCode,
            String locale,
            String displayCurrency,
            String timezone,
            WalletSummary wallet,
            boolean walletLinkRequired,
            List<TeamSummary> teams,
            /** [v7] 선호 장르 0~3개. 선택하지 않았으면 빈 배열이다(키가 빠지지 않는다). */
            List<String> preferredGenres,
            OffsetDateTime createdAt
    ) {}

    // ------------------------------------------------------------ API-member-06

    /**
     * {@code PATCH /api/v1/members/me}. 전부 선택 필드이고 온 것만 바꾼다.
     *
     * <p>{@code currentPassword}·{@code newPassword}는 자체 이메일 회원(P1)만 쓴다.
     */
    public record UpdateProfileRequest(
            // API-member-06 Body 표: 1~40자. DB 컬럼(VARCHAR 100)보다 좁은 쪽이 계약이다.
            @Size(min = 1, max = 40, message = "이름은 1자 이상 40자 이하로 입력해 주세요.")
            String name,
            @Size(max = 20) String phone,
            @Pattern(regexp = "^[A-Z]{2}$", message = "국가 코드는 ISO 3166-1 alpha-2 형식입니다.")
            String countryCode,
            String locale,
            @Pattern(regexp = "^[A-Z]{3}$", message = "통화 코드는 ISO 4217 형식입니다.")
            String displayCurrency,
            String timezone,
            /**
             * [v7] 선호 장르 <b>전체 교체</b>. 빈 배열이면 전부 삭제, {@code null}(미전달)이면
             * 기존 값 유지다 — 이 API 의 다른 필드와 같은 규칙이다.
             *
             * <p>개수 상한만 선언적으로 걸고 허용값·중복은 서비스에서 본다. 둘 다
             * {@code COMMON_VALIDATION_FAILED}(400)이고, 중복은 Bean Validation 으로 표현할
             * 애너테이션이 없다.
             */
            @Size(max = 3, message = "선호 장르는 3개까지 선택할 수 있습니다.")
            List<String> preferredGenres,
            String currentPassword,
            String newPassword
    ) {}

    /** {@code displaySupported}가 {@code false}면 환율 레코드가 없어 원 값만 표시된다. */
    public record UpdateProfileResponse(
            Long memberId,
            String name,
            String countryCode,
            String locale,
            String displayCurrency,
            boolean displaySupported,
            String timezone,
            Money.Rate appliedRate,
            List<String> preferredGenres
    ) {}

    // ------------------------------------------------------------ API-member-08 (P1)

    /** {@code POST /api/v1/auth/signup} — 자체 이메일 가입. <b>P1</b>. */
    public record EmailSignupRequest(
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 64,
                    message = "비밀번호는 8자 이상 64자 이하로 입력해 주세요.") String password,
            // API-member-08 Body 표: 1~40자(member-06 과 같다).
            @NotBlank @Size(min = 1, max = 40,
                    message = "이름은 1자 이상 40자 이하로 입력해 주세요.") String name,
            @NotBlank @Pattern(regexp = "^[A-Z]{2}$") String countryCode,
            String locale,
            @Pattern(regexp = "^[A-Z]{3}$") String displayCurrency,
            String timezone,
            @Size(max = 20) String phone,
            @AssertTrue(message = "이용약관에 동의해 주세요.") Boolean termsAgreed,
            @AssertTrue(message = "개인정보 처리방침에 동의해 주세요.") Boolean privacyAgreed
    ) {}

    public record EmailSignupResponse(
            Long memberId,
            String email,
            String name,
            String authProvider,
            String locale,
            boolean walletLinkRequired
    ) {}
}
