package com.ssafy.b204.member.repository;

import com.ssafy.b204.member.entity.Member;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByEmail(String email);

    boolean existsByEmail(String email);

    /** Web3Auth 로그인(API-member-01) — {@code (auth_provider, provider_user_id)} UNIQUE로 찾는다. */
    Optional<Member> findByAuthProviderAndProviderUserId(Member.AuthProvider authProvider,
                                                         String providerUserId);
}
