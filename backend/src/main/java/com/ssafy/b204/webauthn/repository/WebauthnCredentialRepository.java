package com.ssafy.b204.webauthn.repository;

import com.ssafy.b204.webauthn.entity.WebauthnCredential;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WebauthnCredentialRepository extends JpaRepository<WebauthnCredential, Long> {

    List<WebauthnCredential> findByMemberIdOrderByWebauthnCredentialIdAsc(Long memberId);

    Optional<WebauthnCredential> findByCredentialId(byte[] credentialId);

    boolean existsByCredentialId(byte[] credentialId);
}
