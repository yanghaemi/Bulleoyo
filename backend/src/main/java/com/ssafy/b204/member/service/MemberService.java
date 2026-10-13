package com.ssafy.b204.member.service;

import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.security.RefreshTokenStore;
import com.ssafy.b204.common.security.SessionTokens;
import com.ssafy.b204.common.support.EthCrypto;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.dto.MemberDtos.EmailLoginRequest;
import com.ssafy.b204.member.dto.MemberDtos.EmailLoginResponse;
import com.ssafy.b204.member.dto.MemberDtos.EmailSignupRequest;
import com.ssafy.b204.member.dto.MemberDtos.EmailSignupResponse;
import com.ssafy.b204.member.dto.MemberDtos.LogoutRequest;
import com.ssafy.b204.member.dto.MemberDtos.LogoutResponse;
import com.ssafy.b204.member.dto.MemberDtos.MyProfileResponse;
import com.ssafy.b204.member.dto.MemberDtos.TeamSummary;
import com.ssafy.b204.member.dto.MemberDtos.TokenRefreshRequest;
import com.ssafy.b204.member.dto.MemberDtos.TokenRefreshResponse;
import com.ssafy.b204.member.dto.MemberDtos.UpdateProfileRequest;
import com.ssafy.b204.member.dto.MemberDtos.UpdateProfileResponse;
import com.ssafy.b204.member.dto.MemberDtos.WalletSummary;
import com.ssafy.b204.member.dto.MemberDtos.Web3AuthLoginRequest;
import com.ssafy.b204.member.dto.MemberDtos.Web3AuthLoginResponse;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.member.service.Web3AuthTokenVerifier.VerifiedIdToken;
import com.ssafy.b204.recommendation.entity.MemberPreferredGenre;
import com.ssafy.b204.recommendation.repository.MemberPreferredGenreRepository;
import com.ssafy.b204.team.entity.Genre;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import com.ssafy.b204.wallet.service.WalletBalanceCache;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * member 도메인 서비스 — API v6 §1 (API-member-01·03~06 구현, 02·08은 P1 미구현).
 *
 * <p><b>지켜야 할 것</b>
 *
 * <ul>
 *   <li>리프레시 토큰은 테이블이 아니라 <b>Redis</b>에 둔다({@code auth:refresh:{jti}} TTL 14일 ·
 *       {@code auth:refresh:member:{memberId}} 집합, §0.12).
 *   <li>개인키·니모닉·MPC 샤드는 어떤 컬럼·로그에도 남기지 않는다. 요청 DTO에 그런 필드가 없고
 *       Jackson의 알 수 없는 필드 거부가 전달 시도를 400으로 막는다.
 *   <li><b>[v6] 로그인은 신원만 만든다</b> — 지갑 등록도, 기본 지급 {@code chain_job}도 여기서
 *       하지 않는다(§14-35). 둘 다 {@code POST /api/v1/wallets}로 옮겨졌다.
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private static final Logger log = LoggerFactory.getLogger(MemberService.class);

    /** 명세 §1 회원 속성 — 표시 언어 화이트리스트. 그 밖의 값은 {@code en} 폴백이 아니라 400이다. */
    private static final Set<String> SUPPORTED_LOCALES = Set.of("en", "ko");

    /** API-member-05의 {@code roles}. 팀 리더면 {@code PERFORMER}가 붙는다. */
    private static final String ROLE_AUDIENCE = "AUDIENCE";
    private static final String ROLE_PERFORMER = "PERFORMER";

    private final MemberRepository memberRepository;
    private final WalletRepository walletRepository;
    private final TeamRepository teamRepository;
    private final Web3AuthTokenVerifier tokenVerifier;
    private final JwtTokenProvider tokenProvider;
    private final RefreshTokenStore refreshTokenStore;
    private final WalletBalanceCache balanceCache;
    private final DisplayRateService displayRateService;
    private final ChainProperties chainProperties;
    private final MemberPreferredGenreRepository preferredGenreRepository;

    // ================================================================ API-member-01

    /**
     * API-member-01 Web3Auth 로그인/가입. <b>최초 로그인 = 가입</b>이다.
     *
     * <ol>
     *   <li>JWKS로 {@code idToken} 검증 → 토큰의 지갑 클레임과 요청 {@code address} 대조.
     *       실패는 {@code AUTH_TOKEN_INVALID}(401).
     *   <li>{@code (auth_provider, provider_user_id)}로 회원 조회 → 없으면 생성. 신규는
     *       {@code countryCode}·약관 동의 2건이 필수다({@code COMMON_VALIDATION_FAILED}).
     *   <li>이미 지갑을 등록한 회원인데 요청 {@code address}가 다르면 {@code COMMON_CONFLICT}(409)
     *       — verifier 교체 의심이라 보안 로깅 대상이다.
     *   <li>세션 발급 + Redis 저장. <b>지갑 등록·{@code chain_job} 생성은 하지 않는다.</b>
     * </ol>
     */
    @Transactional
    public Web3AuthLoginResponse web3authLogin(Web3AuthLoginRequest request) {
        VerifiedIdToken verified = tokenVerifier.verify(request.idToken());

        // 토큰이 주장한 지갑과 요청 주소가 같아야 한다. 클레임이 없으면 대조할 대상이 없으므로
        // "통과"로 읽지 않는다 — 없는 검증을 있었던 것처럼 만들지 않는다.
        if (!verified.hasWalletClaim() || !verified.claimsAddress(request.address())) {
            log.debug("idToken 지갑 클레임과 요청 address 불일치");
            throw BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID);
        }

        Member.AuthProvider provider = Member.AuthProvider.valueOf(request.provider());
        Optional<Member> existing =
                memberRepository.findByAuthProviderAndProviderUserId(provider, verified.verifierId());

        boolean isNewMember = existing.isEmpty();
        if (isNewMember
                && request.countryCode() == null
                && request.termsAgreed() == null
                && request.privacyAgreed() == null) {
            throw BusinessException.of(ErrorCode.AUTH_SIGNUP_REQUIRED);
        }
        Member member = existing.orElseGet(() -> memberRepository.save(newMember(request, provider, verified)));

        // 이미 지갑을 등록한 회원이면 주소가 바뀌면 안 된다(v6 — MPC는 같은 소셜 계정에 같은 주소를 재현).
        Optional<Wallet> wallet = walletRepository.findByMember_MemberId(member.getMemberId());
        wallet.ifPresent(w -> {
            if (!EthCrypto.sameAddress(w.getAddress(), request.address())) {
                log.warn("등록된 지갑 주소와 다른 주소로 로그인 시도 — memberId={} (verifier 교체 의심)",
                        member.getMemberId());
                throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
            }
        });

        SessionTokens tokens = issueSession(member, EthCrypto.normalizeAddress(request.address()));

        return new Web3AuthLoginResponse(
                member.getMemberId(),
                isNewMember,
                member.getName(),
                member.getEmail(),
                roles(member),
                member.getAuthProvider().name(),
                member.getCountryCode(),
                member.getLocale(),
                member.getDisplayCurrency(),
                member.getTimezone(),
                // 항상 false 다. [2026-09-15 · S15P21B204-105] 명세 안에서 충돌하던 항목이
                // 4xx 표 쪽으로 정리됐다 — 요구사항의 "countryCode 가 없으면 회원을 만들되
                // profileCompletionRequired: true"[권] 경로는 쓰지 않는다. ERD member.country_code 가
                // NOT NULL 이라 임의의 기본 국가를 지어내야만 구현되기 때문이다. 국가·약관 동의는
                // C-01 이 소셜 인증 전에 받아 보낸다. 응답 required 필드라 예약값으로 남긴다.
                false,
                wallet.map(MemberService::linkSummary).orElse(null),
                tokens.accessToken(),
                tokens.accessTokenExpiresAt().atZone(TimeSupport.zoneOf(member.getTimezone()))
                        .toOffsetDateTime(),
                tokens.refreshToken(),
                tokens.refreshTokenExpiresAt().atZone(TimeSupport.zoneOf(member.getTimezone()))
                        .toOffsetDateTime());
    }

    private Member newMember(Web3AuthLoginRequest request, Member.AuthProvider provider,
                             VerifiedIdToken verified) {
        // 신규 회원 필수 항목(P-23 자기 선언 + 약관). 조건부 필수라 Bean Validation 으로 못 걸었다.
        if (request.countryCode() == null || request.countryCode().isBlank()) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED, "국가를 선택해 주세요.");
        }
        if (!Boolean.TRUE.equals(request.termsAgreed())) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED, "이용약관에 동의해 주세요.");
        }
        if (!Boolean.TRUE.equals(request.privacyAgreed())) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "개인정보 처리방침에 동의해 주세요.");
        }
        // API-member-01 Body 표: timezone 은 IANA 다. member-06 과 같은 검증을 쓴다 —
        // 여기서 거르지 않으면 TimeSupport.zoneOf 가 잘못된 값을 KST 로 조용히 폴백해
        // "저장은 됐는데 요청한 시각대가 아닌" 상태가 가입 시점에 굳는다.
        requireIanaTimezone(request.timezone());
        String locale = normalizeLocale(request.locale());

        // member.email 은 NOT NULL UNIQUE 다. 소셜 idToken 의 email 클레임이 유일한 출처이며,
        // 없으면 회원을 만들 수 없다 — 임의의 가짜 주소를 만들어 넣지 않는다.
        String email = verified.email();
        if (email == null || email.isBlank()) {
            email = verified.verifierId() != null && verified.verifierId().contains("@")
                    ? verified.verifierId() : null;
        }
        if (email == null) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "소셜 계정에서 이메일을 가져오지 못했습니다. 다른 방법으로 로그인해 주세요.");
        }
        if (memberRepository.existsByEmail(email)) {
            // 같은 이메일이 다른 소셜 제공자로 이미 가입돼 있다. MVP에 계정 병합이 없다.
            throw BusinessException.of(ErrorCode.AUTH_EMAIL_DUPLICATED);
        }

        String name = verified.name() != null && !verified.name().isBlank()
                ? verified.name() : email.substring(0, email.indexOf('@') < 0 ? email.length() : email.indexOf('@'));

        return Member.builder()
                .email(email)
                .name(name)
                .authProvider(provider)
                .providerUserId(verified.verifierId())
                .web3authVerifierId(verified.verifier())
                .countryCode(request.countryCode().toUpperCase(Locale.ROOT))
                .locale(locale)
                .displayCurrency(request.displayCurrency())
                .timezone(request.timezone())
                .status(Member.Status.ACTIVE)
                .build();
    }

    // ================================================================ API-member-02·08 (P1)

    /** API-member-02 자체 이메일 로그인 — <b>P1</b>. Web3Auth 단일 동결이라 MVP에서 켜지 않는다. */
    @Transactional
    public EmailLoginResponse emailLogin(EmailLoginRequest request) {
        throw ErrorCode.COMMON_INTERNAL_ERROR.toException("미구현: API-member-02 이메일 로그인(P1)");
    }

    /** API-member-08 자체 이메일 가입 — <b>P1</b>. */
    @Transactional
    public EmailSignupResponse emailSignup(EmailSignupRequest request) {
        throw ErrorCode.COMMON_INTERNAL_ERROR.toException("미구현: API-member-08 이메일 가입(P1)");
    }

    // ================================================================ API-member-03

    /**
     * API-member-03 토큰 재발급 — <b>회전</b>이다.
     *
     * <p>쓴 jti는 즉시 지우고 새 jti를 넣는다. 이미 지워진 jti가 다시 오면 <b>재사용 감지</b>이므로
     * 그 회원의 jti 집합을 통째로 폐기하고 {@code AUTH_TOKEN_INVALID}(401)로 즉시 로그아웃시킨다
     * (탈취 신호로 본다).
     */
    @Transactional
    public TokenRefreshResponse refresh(TokenRefreshRequest request) {
        JwtTokenProvider.Claims claims =
                tokenProvider.parse(request.refreshToken(), JwtTokenProvider.TYPE_REFRESH);

        if (!refreshTokenStore.matches(claims.jti(), request.refreshToken())) {
            int revoked = refreshTokenStore.revokeAll(claims.memberId());
            log.warn("폐기된 refresh token 재사용 감지 — memberId={}, 전량 폐기 {}건",
                    claims.memberId(), revoked);
            throw BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID);
        }

        Member member = memberRepository.findById(claims.memberId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID));

        refreshTokenStore.revoke(claims.memberId(), claims.jti());
        SessionTokens tokens = issueSession(member, claims.walletClaimAddress());

        return new TokenRefreshResponse(
                tokens.accessToken(),
                tokens.accessTokenExpiresAt().atZone(TimeSupport.zoneOf(member.getTimezone()))
                        .toOffsetDateTime(),
                tokens.refreshToken(),
                tokens.refreshTokenExpiresAt().atZone(TimeSupport.zoneOf(member.getTimezone()))
                        .toOffsetDateTime());
    }

    // ================================================================ API-member-04

    /**
     * API-member-04 로그아웃. <b>이미 폐기된 토큰으로 호출해도 200</b>이다(결과 상태가 같다).
     *
     * <p>서버 세션만 끊는다 — Web3Auth 세션 종료는 클라이언트 몫이고 {@code wallet} 레코드는
     * 로그아웃으로 사라지지 않는다.
     */
    @Transactional
    public LogoutResponse logout(MemberPrincipal me, LogoutRequest request) {
        if (request != null && Boolean.TRUE.equals(request.allDevices())) {
            return LogoutResponse.of(refreshTokenStore.revokeAll(me.memberId()));
        }
        if (request != null && request.refreshToken() != null && !request.refreshToken().isBlank()) {
            JwtTokenProvider.Claims claims = tokenProvider.parseIgnoringExpiry(
                    request.refreshToken(), JwtTokenProvider.TYPE_REFRESH);
            if (!claims.memberId().equals(me.memberId())) {
                // 남의 세션을 지우려는 시도. 권한 문제이지 인증 문제가 아니다.
                throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
            }
            return LogoutResponse.of(refreshTokenStore.revoke(me.memberId(), claims.jti()) ? 1 : 0);
        }
        // 본문 없이 온 경우: access token 하나로는 어느 refresh jti인지 알 수 없다. 명세가
        // "생략 시 현재 access token의 세션"이라 했으나 access 에는 refresh jti 가 없으므로
        // 그 디바이스만 특정할 수 없다 — 전량 폐기가 아니라 0건으로 두고 클라이언트가 토큰을
        // 버리게 한다. (산출물 "명세 확인 필요" 항목)
        return LogoutResponse.of(0);
    }

    // ================================================================ API-member-05

    /**
     * API-member-05 내 정보 조회. C-03 진입 1회 호출로 화면이 그려져야 한다.
     *
     * <p>지갑 잔액은 <b>Redis {@code wallet:balance} 캐시값</b>이며 <b>노드를 조회하지 않는다</b>
     * (§0.12 · PERF-01). 실시간 값이 필요하면 화면이 API-wallet-01을 호출한다.
     */
    public MyProfileResponse myProfile(MemberPrincipal me) {
        Member member = requireMember(me);
        Optional<Wallet> wallet = walletRepository.findByMember_MemberId(member.getMemberId());

        List<TeamSummary> teams = teamRepository
                .findByLeader_MemberIdAndStatus(member.getMemberId(), Team.Status.ACTIVE).stream()
                .map(team -> new TeamSummary(team.getTeamId(), team.getName(), true))
                .toList();

        return new MyProfileResponse(
                member.getMemberId(),
                member.getEmail(),
                member.getName(),
                roles(member),
                member.getAuthProvider().name(),
                member.getCountryCode(),
                member.getLocale(),
                member.getDisplayCurrency(),
                member.getTimezone(),
                wallet.map(w -> cachedSummary(w, member)).orElse(null),
                wallet.isEmpty(),
                teams,
                preferredGenres(member.getMemberId()),
                TimeSupport.toOffset(member.getCreatedAt(), member.getTimezone()));
    }

    // ================================================================ API-member-06

    /**
     * API-member-06 내 정보 수정. 전달된 필드만 바꾼다.
     *
     * <p>지원하지 않는 통화로 바꿔도 <b>저장은 허용</b>하고 {@code displaySupported: false}로
     * 내린다 — 환율 미등록은 오류가 아니다(§0.5).
     */
    @Transactional
    public UpdateProfileResponse updateProfile(MemberPrincipal me, UpdateProfileRequest request) {
        Member member = requireMember(me);

        if (request.newPassword() != null || request.currentPassword() != null) {
            // 비밀번호는 authProvider=LOCAL(P1) 회원만 가진다. 소셜 회원의 시도는 400이다.
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "소셜 로그인 회원은 비밀번호를 변경할 수 없습니다.");
        }
        String locale = request.locale() == null ? null : normalizeLocale(request.locale());
        requireIanaTimezone(request.timezone());
        if (request.countryCode() != null) {
            member.updateCountry(request.countryCode().toUpperCase(Locale.ROOT));
        }
        member.updateProfile(request.name(), request.phone(), locale, request.displayCurrency(),
                request.timezone());
        replacePreferredGenres(member.getMemberId(), request.preferredGenres());

        String currency = member.getDisplayCurrency();
        Money.Rate appliedRate = displayRateService.listRate(currency, member.getTimezone());

        return new UpdateProfileResponse(
                member.getMemberId(),
                member.getName(),
                member.getCountryCode(),
                member.getLocale(),
                currency,
                displayRateService.isSupported(currency),
                member.getTimezone(),
                appliedRate,
                preferredGenres(member.getMemberId()));
    }

    /** 선택하지 않은 회원은 행이 없다 — 빈 배열로 내린다(API-member-05 [v7]). */
    private List<String> preferredGenres(Long memberId) {
        return preferredGenreRepository.findByMemberId(memberId).stream()
                .map(preferred -> preferred.getGenre().name())
                .sorted()
                .toList();
    }

    /**
     * API-member-06 [v7] 선호 장르 <b>전체 교체</b>. 미전달({@code null})이면 손대지 않고, 빈
     * 배열이면 전부 삭제한다.
     *
     * <p>부분 갱신이 없어 delete + insert 다. 회원당 3행이라 차분을 계산할 이유가 없다.
     *
     * <p>중복은 400 으로 막는다 — {@code (member_id, genre)}가 PK 라 그냥 넣으면 DB 제약
     * 위반으로 500 이 되고, 사용자에게는 "무엇이 잘못됐는지"가 전달되지 않는다.
     */
    private void replacePreferredGenres(Long memberId, List<String> codes) {
        if (codes == null) {
            return;
        }
        List<Genre> genres = codes.stream().map(Genre::of).toList();
        if (Set.copyOf(genres).size() != genres.size()) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "선호 장르가 중복됐습니다.");
        }
        preferredGenreRepository.deleteByMemberId(memberId);
        // 같은 트랜잭션에서 DELETE 뒤에 INSERT 하므로 flush 순서를 명시한다 — JPA 는 기본적으로
        // INSERT 를 DELETE 보다 먼저 내보내 PK 충돌을 낸다.
        preferredGenreRepository.flush();
        preferredGenreRepository.saveAll(genres.stream()
                .map(genre -> new MemberPreferredGenre(memberId, genre))
                .toList());
    }

    // ================================================================ 공통

    private Member requireMember(MemberPrincipal me) {
        if (me == null) {
            throw BusinessException.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        return memberRepository.findById(me.memberId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID));
    }

    private SessionTokens issueSession(Member member, String walletClaimAddress) {
        SessionTokens tokens = tokenProvider.issue(member.getMemberId(), member.getEmail(),
                member.isAdmin(), walletClaimAddress);
        refreshTokenStore.save(member.getMemberId(), tokens.refreshJti(), tokens.refreshToken(),
                Duration.between(java.time.Instant.now(), tokens.refreshTokenExpiresAt()));
        return tokens;
    }

    /** 팀 리더면 {@code PERFORMER}가 붙는다(§1 회원 속성 · API-member-05 예시). */
    private List<String> roles(Member member) {
        List<String> roles = new ArrayList<>();
        roles.add(ROLE_AUDIENCE);
        if (!teamRepository.findByLeader_MemberIdAndStatus(member.getMemberId(),
                Team.Status.ACTIVE).isEmpty()) {
            roles.add(ROLE_PERFORMER);
        }
        return roles;
    }

    /** API-member-01의 {@code wallet} — {@code provider}·{@code address}·{@code status}·링크. */
    private static WalletSummary linkSummary(Wallet wallet) {
        return new WalletSummary(null, wallet.getProvider().name(), wallet.getAddress(),
                wallet.getStatus().name(), null, null,
                "https://kairos.kaiascan.io/address/" + wallet.getAddress());
    }

    /** API-member-05의 {@code wallet} — 잔액은 Redis 캐시값만. 캐시가 비면 {@code null}이다. */
    private WalletSummary cachedSummary(Wallet wallet, Member member) {
        Optional<WalletBalanceCache.CachedBalance> cached =
                balanceCache.get(wallet.getWalletId());
        Money balance = cached
                .map(c -> displayRateService.money(c.balance(), member.getDisplayCurrency(),
                        member.getTimezone()))
                .orElse(null);
        OffsetDateTime cachedAt = cached
                .map(c -> TimeSupport.fromEpochMilli(c.checkedAt().toEpochMilli(),
                        member.getTimezone()))
                .orElse(null);
        return new WalletSummary(null, wallet.getProvider().name(), wallet.getAddress(),
                wallet.getStatus().name(), balance, cachedAt, null);
    }

    private String addressExplorerUrl(String address) {
        return chainProperties.explorerBaseUrl() + "/address/" + address;
    }

    /**
     * IANA 시간대만 받는다(API-member-01·06 Body 표). {@code null}·빈 값은 "안 바꿈"이라 통과.
     *
     * <p>거르지 않으면 {@link TimeSupport#zoneOf}가 잘못된 값을 KST로 폴백해 <b>조용히</b>
     * 지나간다 — 이후 그 회원의 모든 응답 시각이 요청한 시간대와 다르다.
     */
    private static void requireIanaTimezone(String timezone) {
        if (timezone == null || timezone.isBlank()) {
            return;
        }
        try {
            java.time.ZoneId.of(timezone);
        } catch (RuntimeException e) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "지원하지 않는 시간대입니다.");
        }
    }

    private static String normalizeLocale(String locale) {
        if (locale == null || locale.isBlank()) {
            return "en"; // §0.6 기본
        }
        String normalized = locale.toLowerCase(Locale.ROOT);
        if (!SUPPORTED_LOCALES.contains(normalized)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "지원하지 않는 언어 코드입니다.");
        }
        return normalized;
    }
}
