package com.ssafy.b204.wallet.dto;

import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.time.OffsetDateTime;
import java.util.List;

/** wallet 도메인 DTO — API v6 §3 (API-wallet-01·02·03·04, 05는 삭제). 접두 {@code WALLET_*}. */
public final class WalletDtos {

    private WalletDtos() {
    }

    /**
     * {@code GET /api/v1/wallets/me} — 내 지갑 조회(API-wallet-01). v5에서 가스 블록이 삭제됐다.
     *
     * <p>{@code balance}는 Redis {@code wallet:balance} 해시에서 온다. {@code cachedAt}이 그
     * value의 {@code checkedAt}이고, 10초보다 낡으면 노드를 다시 읽고 갱신한다. {@code stale}은
     * 노드 조회가 실패해 낡은 값을 그대로 보여주는 상태를 뜻한다 — TTL을 두지 않는 이유가
     * 노드 장애 시에도 마지막 값을 보여주기 위해서다(AVAIL-02 · §0.12).
     */
    public record MyWalletResponse(
            Long walletId,
            String provider,
            String address,
            String status,
            OffsetDateTime verifiedAt,
            Money balance,
            /** 진행 중인 지급 job이 있으면 그 id. 없으면 {@code null}. */
            String pendingGrantJobId,
            String network,
            Long chainId,
            String tokenAddress,
            String explorerUrl,
            OffsetDateTime cachedAt,
            boolean stale
    ) {}

    /**
     * {@code GET /api/v1/wallets/me/transactions} 항목(API-wallet-02).
     *
     * <p>별도 {@code wallet_tx} 테이블이 없다 — {@code chain_job}을
     * {@code (wallet_id, tx_type, amount)}로 조회해 만든다(ERD v5 미생성 목록). 그래서
     * {@code walletTxId}는 DB PK가 아니라 {@code job_9901}·{@code pay_8801} 같은
     * <b>합성 식별자</b>이고 {@code refType}/{@code refId}가 실제 출처를 가리킨다.
     */
    public record WalletTxItem(
            String walletTxId,
            String type,
            String direction,
            Long amount,
            String currency,
            String status,
            String refType,
            Long refId,
            String title,
            String signerType,
            Boolean feeDelegated,
            String txHash,
            String explorerUrl,
            OffsetDateTime occurredAt
    ) {}

    /** 목록 축약형 — 항목에는 {@code amount}만, 환율은 루트 {@code rate} 하나(§0.5). */
    public record WalletTxListResponse(Money.Rate rate, List<WalletTxItem> items,
                                        PageInfo pageInfo) {}

    /**
     * {@code POST /api/v1/wallets/challenge} — 외부 지갑 등록 챌린지 발급(API-wallet-03, P0).
     *
     * <p>v6에서 P1 → P0로 승격됐다. 소유 증명을 Web3Auth 모달 어댑터가 아니라 <b>자체 챌린지</b>로
     * 하기로 정했기 때문이다(§14-35). 회원당 10회/분 제한(§0.9).
     */
    public record ChallengeRequest(
            @NotBlank @Pattern(regexp = "^0x[0-9a-fA-F]{40}$",
                    message = "지갑 주소 형식이 올바르지 않습니다.") String address
    ) {}

    /**
     * {@code message}를 그대로 {@code personal_sign}에 넘긴다.
     *
     * <p>문구 마지막 줄이 "This signature does not authorize any transfer."다 — 서명이 이체
     * 승인이 아님을 사용자가 확인할 수 있어야 한다. Redis {@code wallet:challenge:{memberId}}에
     * TTL 300초로 저장되고 검증 후 <b>즉시 삭제</b>된다(1회용).
     */
    public record ChallengeResponse(
            String nonce,
            String message,
            String signMethod,
            Long chainId,
            OffsetDateTime expiresAt
    ) {}

    /**
     * {@code POST /api/v1/wallets} — 지갑 등록(API-wallet-04, P0). <b>회원당 1회</b>.
     *
     * <p>v6에서 경로·역할이 확장돼 하나의 엔드포인트가 두 provider를 받는다.
     * {@code nonce}·{@code signature}는 {@code EXTERNAL}(Kaia Wallet)에서만 필수다 —
     * {@code WEB3AUTH}는 idToken 검증으로 소유가 증명된다.
     *
     * <p>등록 성공 <b>직후</b> 기본 지급({@code YoYo.mint} 100,000)이 트리거된다.
     */
    public record RegisterWalletRequest(
            @NotBlank @Pattern(regexp = "WEB3AUTH|EXTERNAL",
                    message = "지원하지 않는 지갑 종류입니다.") String provider,
            @NotBlank @Pattern(regexp = "^0x[0-9a-fA-F]{40}$",
                    message = "지갑 주소 형식이 올바르지 않습니다.") String address,
            String nonce,
            String signature,
            String walletLabel
    ) {}

    /** 등록된 지갑 + 기본 지급 job. 지급은 202 규약을 따라 {@code grantJobId}로 폴링한다(§0.3). */
    public record RegisterWalletResponse(
            RegisteredWallet wallet,
            String grantJobId,
            Money signupGrant,
            Integer pollAfterMs
    ) {}

    public record RegisteredWallet(
            Long walletId,
            String provider,
            String walletLabel,
            String address,
            String status,
            OffsetDateTime verifiedAt,
            String explorerUrl
    ) {}
}
