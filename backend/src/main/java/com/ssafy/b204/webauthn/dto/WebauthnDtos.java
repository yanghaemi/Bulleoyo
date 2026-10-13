package com.ssafy.b204.webauthn.dto;

import com.ssafy.b204.webauthn.service.StepUpAction;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * webauthn 도메인 DTO — API v7 §7.W (API-webauthn-01~04). 모든 바이너리는 base64url(패딩 없음).
 *
 * <p>필드 이름은 브라우저 {@code PublicKeyCredentialCreationOptions}/{@code RequestOptions}와
 * {@code AuthenticatorResponse}의 이름을 그대로 쓴다 — 프론트가 base64url ↔ ArrayBuffer 변환만
 * 하고 키 이름을 옮겨 적지 않게 하기 위해서다.
 */
public final class WebauthnDtos {

    private WebauthnDtos() {
    }

    /** base64url 문자 집합. 길이 상한은 요청 본문이 비정상적으로 커지는 것만 막는다. */
    private static final String B64URL = "^[A-Za-z0-9_-]+={0,2}$";

    public record CredentialDescriptor(String type, String id, List<String> transports) {}

    public record Rp(String id, String name) {}

    public record User(String id, String name, String displayName) {}

    public record PubKeyCredParam(String type, int alg) {}

    public record AuthenticatorSelection(String authenticatorAttachment, String residentKey,
                                         String userVerification) {}

    /** API-webauthn-01 응답. */
    public record RegistrationOptionsResponse(
            String challenge,
            Rp rp,
            User user,
            List<PubKeyCredParam> pubKeyCredParams,
            long timeout,
            String attestation,
            AuthenticatorSelection authenticatorSelection,
            List<CredentialDescriptor> excludeCredentials
    ) {}

    /** API-webauthn-02 요청. */
    public record RegistrationRequest(
            @NotBlank @Size(max = 2048) @jakarta.validation.constraints.Pattern(regexp = B64URL) String credentialId,
            @NotBlank @Size(max = 8192) @jakarta.validation.constraints.Pattern(regexp = B64URL) String clientDataJSON,
            @NotBlank @Size(max = 16384) @jakarta.validation.constraints.Pattern(regexp = B64URL) String attestationObject,
            @Size(max = 8) List<@Size(max = 16) String> transports
    ) {}

    /** API-webauthn-02 응답(201). */
    public record RegistrationResult(String credentialId, boolean registered, OffsetDateTime createdAt) {}

    /**
     * API-webauthn-03 요청 — <b>무엇을 확인하는가.</b> 챌린지에 이 범위를 붙여 두고, 그 챌린지로 서명된
     * 인증에만 이 범위의 토큰을 준다(API v7 §7.W). 대상 id는 동작마다 다르다({@link StepUpAction}).
     */
    public record AuthenticationOptionsRequest(
            @NotNull StepUpAction action,
            @NotNull @Positive Long targetId
    ) {}

    /**
     * API-webauthn-03 응답. 등록된 기기가 없으면 {@code registered=false}만 나간다 — 나머지는 null 이라
     * 전역 {@code non_null}이 키를 지운다. 에러가 아닌 이유는 프론트가 이 값으로 등록 화면으로
     * 분기해야 하기 때문이다(404 로 내리면 "등록 필요"와 "경로 없음"이 같은 신호가 된다).
     */
    public record AuthenticationOptionsResponse(
            boolean registered,
            String challenge,
            String rpId,
            List<CredentialDescriptor> allowCredentials,
            Long timeout,
            String userVerification
    ) {
        public static AuthenticationOptionsResponse notRegistered() {
            return new AuthenticationOptionsResponse(false, null, null, null, null, null);
        }
    }

    /** API-webauthn-04 요청. */
    public record AuthenticationRequest(
            @NotBlank @Size(max = 2048) @jakarta.validation.constraints.Pattern(regexp = B64URL) String credentialId,
            @NotBlank @Size(max = 8192) @jakarta.validation.constraints.Pattern(regexp = B64URL) String clientDataJSON,
            @NotBlank @Size(max = 4096) @jakarta.validation.constraints.Pattern(regexp = B64URL) String authenticatorData,
            @NotBlank @Size(max = 2048) @jakarta.validation.constraints.Pattern(regexp = B64URL) String signature,
            @Size(max = 1024) @jakarta.validation.constraints.Pattern(regexp = B64URL) String userHandle
    ) {}

    /** API-webauthn-04 응답. */
    public record StepUpTokenResponse(String stepUpToken, OffsetDateTime expiresAt) {}
}
