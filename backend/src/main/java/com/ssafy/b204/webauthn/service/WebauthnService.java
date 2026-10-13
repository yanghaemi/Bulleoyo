package com.ssafy.b204.webauthn.service;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.webauthn.config.WebAuthnProperties;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.AuthenticationOptionsRequest;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.AuthenticationOptionsResponse;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.AuthenticationRequest;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.AuthenticatorSelection;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.CredentialDescriptor;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.PubKeyCredParam;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.RegistrationOptionsResponse;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.RegistrationRequest;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.RegistrationResult;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.Rp;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.StepUpTokenResponse;
import com.ssafy.b204.webauthn.dto.WebauthnDtos.User;
import com.ssafy.b204.webauthn.entity.WebauthnCredential;
import com.ssafy.b204.webauthn.repository.WebauthnCredentialRepository;
import com.webauthn4j.WebAuthnManager;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.credential.CredentialRecordImpl;
import com.webauthn4j.data.AuthenticationData;
import com.webauthn4j.data.AuthenticationParameters;
import com.webauthn4j.data.PublicKeyCredentialParameters;
import com.webauthn4j.data.PublicKeyCredentialType;
import com.webauthn4j.data.RegistrationData;
import com.webauthn4j.data.RegistrationParameters;
import com.webauthn4j.data.attestation.authenticator.AAGUID;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.attestation.authenticator.COSEKey;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.attestation.statement.NoneAttestationStatement;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.data.client.challenge.DefaultChallenge;
import com.webauthn4j.server.ServerProperty;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 결제 전 패스키 본인 확인 — API-webauthn-01~04 (API v7 §7.W).
 *
 * <p><b>검증은 전부 webauthn4j 에 맡긴다.</b> clientDataJSON(type·challenge·origin), authenticatorData
 * (rpIdHash·UP·UV 플래그·signCount), attestation 형식, 서명을 손으로 파싱하지 않는다 — CBOR·COSE
 * 파싱과 서명 형식(ES256 DER·RS256 PKCS#1)을 직접 구현하면 한 곳만 틀려도 위조가 통과한다.
 *
 * <p><b>챌린지는 검증 직전 {@code GETDEL}</b>로 꺼낸다. 검증이 실패해도 같은 챌린지를 다시 쓸 수 없다
 * — 가로챈 응답의 재전송(replay)을 막는 것이 챌린지의 존재 이유다.
 *
 * <p>검증 실패 원인은 <b>로그에만</b> 남기고 응답은 {@code WEBAUTHN_VERIFICATION_FAILED} 하나로 뭉친다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WebauthnService {

    public static final String CHALLENGE_PREFIX = "webauthn:challenge:";
    static final String PURPOSE_REGISTRATION = "registration";
    static final String PURPOSE_AUTHENTICATION = "authentication";

    /** 브라우저 인증 창 대기 시간(ms). 챌린지 TTL(300초)보다 짧아야 창을 띄운 뒤 만료되지 않는다. */
    private static final long TIMEOUT_MS = 60_000L;

    /** ES256(-7)이 플랫폼 인증기 대부분, RS256(-257)은 Windows Hello 일부 구형 기기. */
    private static final List<PublicKeyCredentialParameters> ALGORITHMS = List.of(
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.ES256),
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.RS256));

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private final MemberRepository memberRepository;
    private final WebauthnCredentialRepository credentialRepository;
    private final StringRedisTemplate redis;
    private final WebAuthnProperties properties;
    private final WebAuthnManager webAuthnManager;
    private final ObjectConverter webAuthnObjectConverter;
    private final StepUpTokenService stepUpTokens;

    // ================================================================ API-webauthn-01

    public RegistrationOptionsResponse registrationOptions(MemberPrincipal me) {
        Member member = requireMember(me);
        String challenge = newChallenge(member.getMemberId(), PURPOSE_REGISTRATION);
        String userName = member.getEmail() != null ? member.getEmail() : "member-" + member.getMemberId();
        String displayName = member.getName() != null && !member.getName().isBlank()
                ? member.getName() : userName;
        return new RegistrationOptionsResponse(
                challenge,
                new Rp(properties.rpId(), properties.rpName()),
                new User(userHandle(member.getMemberId()), userName, displayName),
                ALGORITHMS.stream().map(p -> new PubKeyCredParam("public-key", (int) p.getAlg().getValue())).toList(),
                TIMEOUT_MS,
                "none",
                new AuthenticatorSelection("platform", "preferred", "required"),
                descriptors(member.getMemberId()));
    }

    // ================================================================ API-webauthn-02

    @Transactional
    public RegistrationResult register(MemberPrincipal me, RegistrationRequest request) {
        Member member = requireMember(me);
        byte[] credentialId = decode(request.credentialId());
        byte[] clientDataJson = decode(request.clientDataJSON());
        byte[] attestationObject = decode(request.attestationObject());
        byte[] challenge = consumeChallenge(member.getMemberId(), PURPOSE_REGISTRATION);

        Set<String> transports = request.transports() == null ? null
                : new LinkedHashSet<>(request.transports());
        RegistrationData data;
        try {
            data = webAuthnManager.verify(
                    new com.webauthn4j.data.RegistrationRequest(attestationObject, clientDataJson, transports),
                    new RegistrationParameters(serverProperty(challenge), ALGORITHMS, true, true));
        } catch (RuntimeException e) {
            log.info("WebAuthn 등록 검증 실패 memberId={} reason={}", member.getMemberId(), e.toString());
            throw BusinessException.of(ErrorCode.WEBAUTHN_VERIFICATION_FAILED, e);
        }

        AttestedCredentialData attested = data.getAttestationObject().getAuthenticatorData()
                .getAttestedCredentialData();
        if (attested == null || !Arrays.equals(attested.getCredentialId(), credentialId)) {
            // 본문의 rawId 와 인증기가 서명한 ID 가 다르다 — 다른 credential 을 끼워 넣으려는 시도다.
            log.warn("WebAuthn 등록 credentialId 불일치 memberId={}", member.getMemberId());
            throw BusinessException.of(ErrorCode.WEBAUTHN_VERIFICATION_FAILED);
        }
        if (credentialRepository.existsByCredentialId(credentialId)) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        WebauthnCredential saved = credentialRepository.save(WebauthnCredential.builder()
                .memberId(member.getMemberId())
                .credentialId(credentialId)
                .publicKey(webAuthnObjectConverter.getCborConverter().writeValueAsBytes(attested.getCOSEKey()))
                .signCount(data.getAttestationObject().getAuthenticatorData().getSignCount())
                .transports(transports == null || transports.isEmpty() ? null : String.join(",", transports))
                .build());
        return new RegistrationResult(B64.encodeToString(credentialId), true,
                TimeSupport.toOffset(saved.getCreatedAt(), member.getTimezone()));
    }

    // ================================================================ API-webauthn-03

    /**
     * 챌린지에 동작·대상을 붙여 저장한다({@code challenge|ACTION|targetId}). 여기서는 대상의 소유를
     * 검사하지 않는다 — 소유·권한은 토큰을 쓰는 API가 먼저 검사하고, 토큰 범위가 그 요청과 같은지만
     * 비교한다. 여기서 검사하면 도메인 규칙이 두 벌이 된다.
     */
    public AuthenticationOptionsResponse authenticationOptions(MemberPrincipal me,
                                                               AuthenticationOptionsRequest request) {
        Member member = requireMember(me);
        List<CredentialDescriptor> credentials = descriptors(member.getMemberId());
        if (credentials.isEmpty()) {
            return AuthenticationOptionsResponse.notRegistered();
        }
        String challenge = newChallenge(member.getMemberId(), PURPOSE_AUTHENTICATION,
                "|" + request.action().name() + "|" + request.targetId());
        return new AuthenticationOptionsResponse(true, challenge,
                properties.rpId(), credentials, TIMEOUT_MS, "required");
    }

    // ================================================================ API-webauthn-04

    @Transactional
    public StepUpTokenResponse authenticate(MemberPrincipal me, AuthenticationRequest request) {
        Member member = requireMember(me);
        byte[] credentialId = decode(request.credentialId());
        byte[] clientDataJson = decode(request.clientDataJSON());
        byte[] authenticatorData = decode(request.authenticatorData());
        byte[] signature = decode(request.signature());
        byte[] userHandle = request.userHandle() == null ? null : decode(request.userHandle());
        String stored = consumeStoredChallenge(member.getMemberId(), PURPOSE_AUTHENTICATION);
        String[] parts = stored.split("\\|");
        if (parts.length != 3) {
            throw BusinessException.of(ErrorCode.WEBAUTHN_VERIFICATION_FAILED);
        }
        byte[] challenge = Base64.getUrlDecoder().decode(parts[0]);
        StepUpAction action = StepUpAction.valueOf(parts[1]);
        long targetId = Long.parseLong(parts[2]);

        WebauthnCredential credential = credentialRepository.findByCredentialId(credentialId)
                .filter(c -> c.getMemberId().equals(member.getMemberId()))
                .orElseThrow(() -> {
                    log.info("WebAuthn 인증 — 등록되지 않았거나 남의 credential memberId={}",
                            member.getMemberId());
                    return BusinessException.of(ErrorCode.WEBAUTHN_VERIFICATION_FAILED);
                });

        AuthenticationData data;
        try {
            COSEKey coseKey = webAuthnObjectConverter.getCborConverter()
                    .readValue(credential.getPublicKey(), COSEKey.class);
            CredentialRecordImpl record = new CredentialRecordImpl(
                    new NoneAttestationStatement(), null, null, null,
                    credential.getSignCount(),
                    new AttestedCredentialData(AAGUID.ZERO, credential.getCredentialId(), coseKey),
                    null, null, null, null);
            data = webAuthnManager.verify(
                    new com.webauthn4j.data.AuthenticationRequest(credentialId, userHandle,
                            authenticatorData, clientDataJson, null, signature),
                    // allowCredentials 를 넘기면 webauthn4j 가 "옵션에서 허용한 credential 인가"도 본다.
                    // signCount 는 저장값·제시값 중 하나라도 0 이 아니면 증가해야 한다(기본 핸들러가 예외).
                    new AuthenticationParameters(serverProperty(challenge), record,
                            List.of(credential.getCredentialId()), true, true));
        } catch (RuntimeException e) {
            log.info("WebAuthn 인증 검증 실패 memberId={} reason={}", member.getMemberId(), e.toString());
            throw BusinessException.of(ErrorCode.WEBAUTHN_VERIFICATION_FAILED, e);
        }

        credential.markUsed(data.getAuthenticatorData().getSignCount(), TimeSupport.nowStored());
        StepUpTokenService.Issued issued = stepUpTokens.issue(member.getMemberId(), action, targetId);
        return new StepUpTokenResponse(issued.token(),
                OffsetDateTime.ofInstant(issued.expiresAt(), zoneOf(member.getTimezone())));
    }

    // ================================================================ 내부

    /**
     * RequireMemberContractTest 계약 — 세션 없음은 {@code COMMON_UNAUTHORIZED}, 회원 행 없음은
     * {@code AUTH_TOKEN_INVALID}.
     */
    private Member requireMember(MemberPrincipal me) {
        if (me == null) {
            throw BusinessException.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        return memberRepository.findById(me.memberId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID));
    }

    private String newChallenge(Long memberId, String purpose) {
        return newChallenge(memberId, purpose, "");
    }

    /** {@code suffix}는 인증 챌린지에 붙는 {@code |ACTION|targetId}(등록은 빈 문자열). */
    private String newChallenge(Long memberId, String purpose, String suffix) {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String challenge = B64.encodeToString(raw);
        redis.opsForValue().set(challengeKey(memberId, purpose), challenge + suffix,
                properties.challengeTtl());
        return challenge;
    }

    private byte[] consumeChallenge(Long memberId, String purpose) {
        return Base64.getUrlDecoder().decode(consumeStoredChallenge(memberId, purpose));
    }

    private String consumeStoredChallenge(Long memberId, String purpose) {
        String stored = redis.opsForValue().getAndDelete(challengeKey(memberId, purpose));
        if (stored == null) {
            log.info("WebAuthn 챌린지 없음·만료·재사용 memberId={} purpose={}", memberId, purpose);
            throw BusinessException.of(ErrorCode.WEBAUTHN_VERIFICATION_FAILED);
        }
        return stored;
    }

    public static String challengeKey(Long memberId, String purpose) {
        return CHALLENGE_PREFIX + memberId + ":" + purpose;
    }

    private ServerProperty serverProperty(byte[] challenge) {
        Set<Origin> origins = properties.origins().stream().map(Origin::new)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        return new ServerProperty(origins, properties.rpId(), new DefaultChallenge(challenge));
    }

    private List<CredentialDescriptor> descriptors(Long memberId) {
        return credentialRepository.findByMemberIdOrderByWebauthnCredentialIdAsc(memberId).stream()
                .map(c -> new CredentialDescriptor("public-key", B64.encodeToString(c.getCredentialId()),
                        c.getTransports() == null ? null : List.of(c.getTransports().split(","))))
                .toList();
    }

    /** user handle = memberId 8바이트 big-endian. 개인정보가 아니고 회원마다 고정이다. */
    private static String userHandle(Long memberId) {
        return B64.encodeToString(ByteBuffer.allocate(Long.BYTES).putLong(memberId).array());
    }

    /** 형식은 DTO 의 @Pattern 이 먼저 거른다. 여기까지 온 디코드 실패는 패딩 위치 같은 드문 경우다. */
    private static byte[] decode(String value) {
        try {
            return Base64.getUrlDecoder().decode(value);
        } catch (IllegalArgumentException e) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
    }

    private static ZoneId zoneOf(String timezone) {
        try {
            return timezone == null ? ZoneId.of("Asia/Seoul") : ZoneId.of(timezone);
        } catch (RuntimeException e) {
            return ZoneId.of("Asia/Seoul");
        }
    }
}
