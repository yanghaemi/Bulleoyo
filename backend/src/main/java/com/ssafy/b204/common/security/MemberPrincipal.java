package com.ssafy.b204.common.security;

import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * 인증된 회원 — 컨트롤러가 {@code @AuthenticationPrincipal MemberPrincipal me}로 받는다.
 *
 * <p>자체 세션 JWT의 클레임에서 만든다. 비밀번호를 담지 않는다 — 토큰 기반이라 필요 없고,
 * Web3Auth 회원은 애초에 비밀번호가 없다.
 *
 * <p><b>권한(role)은 고정 목록이 아니라 상황에서 나온다.</b> 한 회원이 관객이면서 팀 리더일 수
 * 있어(API-member-05의 {@code roles: ["AUDIENCE","PERFORMER"]}) 컨트롤러의
 * {@code @PreAuthorize}로는 "그 공연의 참여팀인가" 같은 판정을 할 수 없다. 그런 검사는 서비스가
 * 하고 {@code PERFORMANCE_NOT_OWNER}·{@code SETTLEMENT_NOT_PARTICIPANT}·
 * {@code ENTRY_SCANNER_NOT_AUTHORIZED} 같은 도메인 코드를 던진다.
 *
 * <p>{@code walletClaimAddress}는 <b>Web3Auth idToken의 {@code wallets} 클레임이 주장한 주소</b>다
 * — 회원이 실제로 <b>등록한</b> 지갑 주소가 아니다. API-wallet-04의 {@code provider=WEB3AUTH}
 * 경로가 "로그인 세션에 보관한 그 클레임"과 요청 {@code address}를 대조해야 해서 세션이 들고
 * 다닌다(API v6 §3 API-wallet-04 요구사항). 등록된 주소가 필요하면 {@code wallet} 테이블을 읽는다.
 * P1 이메일 로그인 회원은 {@code null}이다.
 *
 * <p>이 principal은 {@code JwtAuthenticationFilter}가 채운다.
 */
public record MemberPrincipal(Long memberId, String email, boolean admin,
                              String walletClaimAddress) implements UserDetails {

    /** 지갑 클레임이 없는 경로(P1 이메일 로그인·테스트)용. */
    public static MemberPrincipal of(Long memberId, String email, boolean admin) {
        return new MemberPrincipal(memberId, email, admin, null);
    }

    public static final String ROLE_ADMIN = "ROLE_ADMIN";
    public static final String ROLE_MEMBER = "ROLE_MEMBER";

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return admin
                ? List.of(new SimpleGrantedAuthority(ROLE_MEMBER),
                          new SimpleGrantedAuthority(ROLE_ADMIN))
                : List.of(new SimpleGrantedAuthority(ROLE_MEMBER));
    }

    /** 토큰 기반이라 비밀번호를 들고 다니지 않는다. */
    @Override
    public String getPassword() {
        return null;
    }

    @Override
    public String getUsername() {
        return email;
    }
}
