package com.ssafy.b204.wallet.entity;

import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * 회원 1:1 <b>비수탁</b> 지갑 — ERD v5 {@code wallet}.
 *
 * <p><b>서버는 사용자 개인키·니모닉·MPC 샤드를 저장하지 않는다</b>(결정 v2 §2.3·P-2). 그래서 이
 * 테이블에 암호화 키 컬럼이 없다. 지갑은 사용자 소유(Web3Auth / Kaia Wallet)이고 서버가 가진 키는
 * OPERATOR·MINTER 2개뿐이다.
 *
 * <p><b>잔액 컬럼이 없다.</b> v4의 {@code cached_krws_balance}·{@code last_balance_check_at} 2컬럼은
 * v5에서 삭제되고 Redis 해시 {@code wallet:balance}로 옮겨졌다(§B′ · API v6 §0.12). 원장은 언제나
 * 체인이고 DB에 잔액 사본을 두지 않는다 — 두 곳에 두면 어느 쪽이 맞는지 판단할 근거가 없어진다.
 *
 * <p>등록은 회원당 1회이며 {@code POST /api/v1/wallets}(API-wallet-04, P0) 하나가 두 provider를
 * 받는다. 소유 증명은 {@code wallet:challenge:{memberId}}(TTL 300초) 자체 챌린지로 한다.
 */
@Entity
@Table(name = "wallet")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Wallet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "wallet_id")
    private Long walletId;

    /** 회원당 1개(UNIQUE). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false, unique = true)
    private Member member;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false)
    private Provider provider;

    /** {@code 0x} + 40 hex = 42자. 체크섬 표기 그대로 보관한다. */
    @Column(name = "address", nullable = false, length = 42, unique = true,
            columnDefinition = "CHAR(42)")
    private String address;

    /** 챌린지 서명 검증(또는 Web3Auth idToken 검증)을 통과한 시각. */
    @Column(name = "verified_at", nullable = false)
    private LocalDateTime verifiedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    // created_at 하나만 있는 테이블은 @CreationTimestamp 를 쓴다. DB에도 DEFAULT가 있지만
    // DB 기본값만 쓰면 flush 직후 엔티티 필드가 null 이라 응답 조립에서 다시 조회해야 한다.
    // (created_at + updated_at 둘 다 있는 5개 테이블은 BaseTimeEntity 의 Spring Data 감사를 쓴다)
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private Wallet(Member member, Provider provider, String address, LocalDateTime verifiedAt,
                   Status status) {
        this.member = member;
        this.provider = provider;
        this.address = address;
        this.verifiedAt = verifiedAt != null ? verifiedAt : TimeSupport.nowStored();
        this.status = status != null ? status : Status.LINKED;
    }

    /** 지갑 종류. {@code EXTERNAL} = Kaia Wallet(MVP). MetaMask는 P1. */
    public enum Provider {
        WEB3AUTH, EXTERNAL
    }

    public enum Status {
        LINKED, SUSPENDED
    }
}
