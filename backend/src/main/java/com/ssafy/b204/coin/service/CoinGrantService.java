package com.ssafy.b204.coin.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.ChainJobService;
import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinRequest;
import com.ssafy.b204.coin.dto.CoinDtos.GrantCoinResponse;
import com.ssafy.b204.coin.dto.CoinDtos.GrantHistoryResponse;
import com.ssafy.b204.coin.dto.CoinDtos.GrantItem;
import com.ssafy.b204.coin.dto.CoinDtos.GrantSummary;
import com.ssafy.b204.coin.repository.CoinChainJobRepository;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import jakarta.persistence.criteria.Predicate;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.web3j.crypto.Hash;
import org.web3j.utils.Numeric;

/**
 * 시연용 코인 지급 — API-coin-07(지급) · API-coin-08(이력).
 *
 * <p><b>플랫폼은 발행 기관이 아니다.</b> 이 API는 "가정 세계의 시연용 지급"의 유일한 수동 경로이고
 * 관객 화면에는 진입점이 없다. 지급은 {@code chain_job}에 {@code MINT} job을 넣는 것으로 끝나고,
 * 실제 {@code YoYo.mint} tx는 MINTER 키를 가진 워커(이강륜 모듈)가 지갑별 nonce 직렬 큐로 보낸다 —
 * <b>요청 스레드에서 체인에 직접 쓰지 않는다</b>(§0.3).
 *
 * <p><b>이중 지급을 막는 장치가 둘</b>이다.
 *
 * <ol>
 *   <li>서버 — {@code chain_job.idempotency_key}가 UNIQUE다. 같은 {@code Idempotency-Key}로 다시
 *       불러도 새 job이 생기지 않고 최초 {@code jobId}가 재생된다.
 *   <li>온체인 — 그 키의 keccak256이 {@code YoYo.mint(to, amount, grantRef)}의 {@code grantRef}이고
 *       컨트랙트가 {@code usedGrantRef}로 재사용을 revert한다({@code GrantRefUsed}).
 * </ol>
 *
 * 둘을 잇는 것이 {@link #grantRefOf(String)}이다 — <b>이 연결을 끊으면 워커 재전송 한 번에
 * 두 번 발행된다.</b>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class CoinGrantService {

    /** 1회 지급 한도(P-19). 전용 코드({@code COIN_GRANT_LIMIT_EXCEEDED})는 §16.1 제안이라 쓰지 않는다. */
    static final long MAX_GRANT_AMOUNT = 1_000_000L;

    static final long MIN_GRANT_AMOUNT = 1L;

    /** §0.3 폴링 간격 기본값. */
    private static final int POLL_AFTER_MS = 1500;

    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

    /** 가입 자동 지급의 memo는 서버가 채운다(openapi {@code CoinGrantHistoryItem.memo}). */
    private static final String SIGNUP_MEMO = "Welcome balance";

    private static final Pattern ADDRESS = Pattern.compile("^0x[0-9a-fA-F]{40}$");

    /** openapi가 허용한 정렬 필드({@code requestedAt,desc}·{@code requestedAt,asc}·{@code amount,desc}). */
    private static final Set<String> SORTABLE = Set.of("requestedAt", "amount");

    private final ChainJobRepository chainJobRepository;
    private final CoinChainJobRepository coinChainJobRepository;
    private final WalletRepository walletRepository;
    private final MemberRepository memberRepository;
    private final WalletBalanceReader walletBalanceReader;
    private final SupplyReconciler supplyReconciler;
    private final ExchangeRateService exchangeRateService;
    private final ChainJobService chainJobService;

    // ------------------------------------------------------------ API-coin-07

    /**
     * 컨트롤러 호환 진입점.
     *
     * <p>⚠️ {@code AdminCoinController.grantCoin}에 {@code @RequestHeader("Idempotency-Key")}
     * 파라미터가 없다(payment·refund·order 컨트롤러에는 있다). 그 컨트롤러는 admin 패키지라 이번
     * 브랜치 범위 밖이어서 고치지 않고, 현재 요청에서 헤더를 직접 읽는다. 파라미터가 추가되면
     * {@link #grantCoin(MemberPrincipal, GrantCoinRequest, String)}를 그대로 호출하면 된다.
     */
    @Transactional
    public GrantCoinResponse grantCoin(MemberPrincipal me, GrantCoinRequest request) {
        return grantCoin(me, request, currentIdempotencyKey());
    }

    /** 게이트 순서는 구현 규칙(settlement-api §5)의 grant 행 그대로다. */
    @Transactional
    public GrantCoinResponse grantCoin(MemberPrincipal me, GrantCoinRequest request,
                                       String idempotencyKey) {
        requireAdmin(me);
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "Idempotency-Key 헤더가 필요합니다.");
        }
        Wallet wallet = resolveTarget(request);
        long amount = requireAmountInRange(request.amount());

        if (supplyReconciler.mintHalted()) {
            // 대사가 깨진 상태에서 더 찍으면 원인 추적이 불가능해진다. 자동 복구하지 않는다.
            throw ErrorCode.COIN_RESERVE_MISMATCH.toException();
        }

        Optional<ChainJob> replay = coinChainJobRepository.findByIdempotencyKey(idempotencyKey);
        if (replay.isPresent()) {
            ChainJob existing = replay.get();
            if (!sameRequest(existing, wallet, amount)) {
                // 같은 키에 다른 본문 — 클라이언트 버그이거나 키 재사용이다. 새로 찍지 않는다.
                throw ErrorCode.COMMON_CONFLICT.toException(
                        "같은 Idempotency-Key로 다른 지급 요청이 이미 접수되었습니다.");
            }
            return toAcceptedResponse(existing, wallet, request.memo(), me);
        }

        Member requester = memberRepository.findById(me.memberId())
                .orElseThrow(ErrorCode.COMMON_NOT_FOUND::toException);
        ChainJob job = chainJobRepository.save(ChainJob.builder()
                .txType(ChainJob.TxType.MINT)
                .signerType(ChainJob.SignerType.OPERATOR)
                .feeDelegated(false)
                .issuerType(ChainJob.IssuerType.MOCK)
                .requester(requester)
                .walletId(wallet.getWalletId())
                .amount(amount)
                .idempotencyKey(idempotencyKey)
                .build());
        log.info("코인 지급 접수 — chainJobId={} walletId={} amount={}",
                job.getChainJobId(), wallet.getWalletId(), amount);
        return toAcceptedResponse(job, wallet, request.memo(), me);
    }

    // ------------------------------------------------------------ API-coin-08

    /**
     * 지급 이력. 원본은 {@code chain_job WHERE tx_type='MINT'}이며 전용 테이블이 없다.
     *
     * <p>{@code summary}는 필터와 무관하게 <b>확정된 전체</b>를 센다 — openapi가
     * "{@code grantedTotal}이 V-02의 {@code totalSupply}와 일치해야 한다(불변식 1)"고 못박았기
     * 때문이다. 필터를 태우면 그 대조가 성립하지 않는다.
     */
    public GrantHistoryResponse grantHistory(MemberPrincipal me, String source, String status,
                                             Long memberId, String address, Pageable pageable) {
        requireAdmin(me);
        Boolean signupOnly = parseSource(source);
        ChainJob.Status statusFilter = parseStatus(status);
        Long walletFilter = resolveWalletFilter(memberId, address);

        Page<ChainJob> page = walletFilter == null && (memberId != null || address != null)
                ? Page.empty(sanitize(pageable))   // 지목한 대상의 지갑이 없다 = 이력 0건
                : coinChainJobRepository.findAll(
                        grantSpec(statusFilter, walletFilter, signupOnly), sanitize(pageable));

        Map<Long, Wallet> wallets = walletsOf(page.getContent());
        List<GrantItem> items = page.getContent().stream()
                .map(job -> toItem(job, wallets.get(job.getWalletId())))
                .toList();
        return new GrantHistoryResponse(exchangeRateService.rateFor(me.memberId()), summary(),
                items, PageInfo.from(page));
    }

    // ------------------------------------------------------------ 게이트·조립

    private void requireAdmin(MemberPrincipal me) {
        if (me == null) {
            throw ErrorCode.COMMON_UNAUTHORIZED.toException();
        }
        if (!me.admin()) {
            throw ErrorCode.COMMON_FORBIDDEN.toException();
        }
    }

    /** {@code memberId}·{@code address}는 택일이다. 둘 다 또는 둘 다 없음은 400. */
    private Wallet resolveTarget(GrantCoinRequest request) {
        boolean byMember = request.memberId() != null;
        boolean byAddress = request.address() != null && !request.address().isBlank();
        if (byMember == byAddress) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "지급 대상은 memberId 또는 address 중 하나만 지정해야 합니다.");
        }
        Wallet wallet;
        if (byMember) {
            if (!memberRepository.existsById(request.memberId())) {
                throw ErrorCode.COMMON_NOT_FOUND.toException();
            }
            wallet = walletRepository.findByMember_MemberId(request.memberId())
                    .orElseThrow(ErrorCode.WALLET_NOT_FOUND::toException);
        } else {
            String address = request.address().trim();
            if (!ADDRESS.matcher(address).matches()) {
                throw ErrorCode.COMMON_VALIDATION_FAILED.toException("지갑 주소 형식이 올바르지 않습니다.");
            }
            wallet = walletRepository.findByAddress(address)
                    .orElseThrow(ErrorCode.WALLET_NOT_FOUND::toException);
        }
        if (wallet.getStatus() != Wallet.Status.LINKED) {
            throw ErrorCode.COMMON_CONFLICT.toException("정지된 지갑에는 지급할 수 없습니다.");
        }
        return wallet;
    }

    private long requireAmountInRange(Long amount) {
        if (amount == null || amount < MIN_GRANT_AMOUNT) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("지급 금액은 1 이상이어야 합니다.");
        }
        if (amount > MAX_GRANT_AMOUNT) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "1회 지급 한도(₩1,000,000)를 초과했습니다.");
        }
        return amount;
    }

    /**
     * 같은 멱등키의 재요청인지.
     *
     * <p>{@code chain_job}에 요청 본문 해시 컬럼이 없어 <b>지급의 정체성인 (대상 지갑, 금액)</b>으로
     * 대조한다. {@code memo}는 온체인에 남지 않는 표시 문구라 판정에서 제외한다.
     */
    private boolean sameRequest(ChainJob existing, Wallet wallet, long amount) {
        return existing.getTxType() == ChainJob.TxType.MINT
                && wallet.getWalletId().equals(existing.getWalletId())
                && existing.getAmount() != null && existing.getAmount() == amount;
    }

    private GrantCoinResponse toAcceptedResponse(ChainJob job, Wallet wallet, String memo,
                                                 MemberPrincipal me) {
        Long balanceBefore = walletBalanceReader.cachedBalance(wallet.getWalletId());
        Long expectedAfter = balanceBefore == null ? null : balanceBefore + job.getAmount();
        return new GrantCoinResponse(
                jobIdOf(job),
                job.getStatus().name(),
                job.getSignerType().name(),
                POLL_AFTER_MS,
                wallet.getMember().getMemberId(),
                wallet.getAddress(),
                job.getAmount(),
                Money.BASE_CURRENCY,
                exchangeRateService.displayFor(me.memberId(), job.getAmount()),
                memo,
                grantRefOf(job.getIdempotencyKey()),
                balanceBefore,
                expectedAfter,
                CoinTime.of(job.getRequestedAt()));
    }

    private GrantItem toItem(ChainJob job, Wallet wallet) {
        boolean signup = job.getRequester() == null;
        Member owner = wallet == null ? null : wallet.getMember();
        return new GrantItem(
                jobIdOf(job),
                signup ? "SIGNUP" : "ADMIN",
                job.getStatus().name(),
                owner == null ? null : owner.getMemberId(),
                owner == null ? null : owner.getName(),
                wallet == null ? null : wallet.getAddress(),
                job.getAmount(),
                // memo 컬럼이 ERD에 없다. SIGNUP만 서버 고정 문구를 채우고 ADMIN은 비운다.
                signup ? SIGNUP_MEMO : null,
                signup ? null : job.getRequester().getMemberId(),
                signup ? null : job.getRequester().getName(),
                grantRefOf(job.getIdempotencyKey()),
                job.getTxHash(),
                chainJobService.txExplorerUrl(job.getTxHash()),
                CoinTime.of(job.getRequestedAt()),
                CoinTime.of(job.getConfirmedAt()));
    }

    private GrantSummary summary() {
        long signupCount = coinChainJobRepository.countByTxTypeAndStatusAndRequesterIsNull(
                ChainJob.TxType.MINT, ChainJob.Status.CONFIRMED);
        long adminCount = coinChainJobRepository.countByTxTypeAndStatusAndRequesterIsNotNull(
                ChainJob.TxType.MINT, ChainJob.Status.CONFIRMED);
        long signupTotal = coinChainJobRepository.sumAmountBySignup(
                ChainJob.TxType.MINT, ChainJob.Status.CONFIRMED);
        long adminTotal = coinChainJobRepository.sumAmountByAdmin(
                ChainJob.TxType.MINT, ChainJob.Status.CONFIRMED);
        return new GrantSummary((int) (signupCount + adminCount), signupTotal + adminTotal,
                (int) signupCount, signupTotal, (int) adminCount, adminTotal, Money.BASE_CURRENCY);
    }

    // ------------------------------------------------------------ 보조

    /**
     * {@code chain_job.idempotency_key} → 온체인 {@code grantRef}.
     *
     * <p>{@code keccak256(키 UTF-8)}이다. 원문은 DB에만, 체인에는 해시만 올라간다 — 관리자 UUID나
     * {@code grant:signup:{memberId}} 문자열이 공개 원장에 그대로 남을 이유가 없다.
     */
    static String grantRefOf(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return null;
        }
        return Numeric.toHexString(Hash.sha3(idempotencyKey.getBytes(StandardCharsets.UTF_8)));
    }

    /** {@code chain_*} 접두 문자열(§0.3). chain 모듈이 파서를 갖게 되면 그쪽 헬퍼로 옮긴다. */
    static String jobIdOf(ChainJob job) {
        return "chain_" + job.getChainJobId();
    }

    private static String currentIdempotencyKey() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes servlet) {
            return servlet.getRequest().getHeader(IDEMPOTENCY_HEADER);
        }
        return null;
    }

    /** {@code null} = 전체, {@code true} = SIGNUP만, {@code false} = ADMIN만. */
    private static Boolean parseSource(String source) {
        if (source == null || source.isBlank()) {
            return null;
        }
        return switch (source.trim().toUpperCase(Locale.ROOT)) {
            case "SIGNUP" -> Boolean.TRUE;
            case "ADMIN" -> Boolean.FALSE;
            default -> throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "source는 SIGNUP 또는 ADMIN이어야 합니다.");
        };
    }

    private static ChainJob.Status parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return ChainJob.Status.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "status는 PENDING·SUBMITTED·CONFIRMED·FAILED 중 하나여야 합니다.");
        }
    }

    /** {@code memberId}와 {@code address}가 함께 오면 AND — 서로 다른 지갑이면 결과 0건이다. */
    private Long resolveWalletFilter(Long memberId, String address) {
        Long byMember = memberId == null ? null
                : walletRepository.findByMember_MemberId(memberId)
                        .map(Wallet::getWalletId).orElse(null);
        Long byAddress = null;
        if (address != null && !address.isBlank()) {
            if (!ADDRESS.matcher(address.trim()).matches()) {
                throw ErrorCode.COMMON_VALIDATION_FAILED.toException("지갑 주소 형식이 올바르지 않습니다.");
            }
            byAddress = walletRepository.findByAddress(address.trim())
                    .map(Wallet::getWalletId).orElse(null);
        }
        if (byMember != null && byAddress != null) {
            return byMember.equals(byAddress) ? byMember : null;
        }
        return byMember != null ? byMember : byAddress;
    }

    private static Specification<ChainJob> grantSpec(ChainJob.Status status, Long walletId,
                                                     Boolean signupOnly) {
        return (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(builder.equal(root.get("txType"), ChainJob.TxType.MINT));
            if (status != null) {
                predicates.add(builder.equal(root.get("status"), status));
            }
            if (walletId != null) {
                predicates.add(builder.equal(root.get("walletId"), walletId));
            }
            if (signupOnly != null) {
                predicates.add(signupOnly
                        ? builder.isNull(root.get("requester"))
                        : builder.isNotNull(root.get("requester")));
            }
            return builder.and(predicates.toArray(new Predicate[0]));
        };
    }

    /** size 상한 100, 정렬 필드 화이트리스트, 기본 {@code requestedAt,desc}(openapi). */
    private static Pageable sanitize(Pageable pageable) {
        if (pageable == null || pageable.isUnpaged()) {
            return PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "requestedAt"));
        }
        if (pageable.getPageSize() > 100) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("size는 100 이하여야 합니다.");
        }
        Sort sort = pageable.getSort();
        if (sort.isUnsorted()) {
            return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                    Sort.by(Sort.Direction.DESC, "requestedAt"));
        }
        sort.forEach(order -> {
            if (!SORTABLE.contains(order.getProperty())) {
                throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                        "정렬은 requestedAt 또는 amount로만 할 수 있습니다.");
            }
        });
        return pageable;
    }

    private Map<Long, Wallet> walletsOf(List<ChainJob> jobs) {
        List<Long> ids = jobs.stream().map(ChainJob::getWalletId).filter(java.util.Objects::nonNull)
                .distinct().toList();
        Map<Long, Wallet> wallets = new HashMap<>();
        for (Wallet wallet : walletRepository.findAllById(ids)) {
            wallets.put(wallet.getWalletId(), wallet);
        }
        return wallets;
    }
}
