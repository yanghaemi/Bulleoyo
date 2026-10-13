package com.ssafy.b204.wallet.service;

import com.ssafy.b204.audit.entity.AuditLog;
import com.ssafy.b204.audit.repository.AuditLogRepository;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.support.ChainJobIds;
import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.response.PageInfo;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.EthCrypto;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.entity.SettlementShare;
import com.ssafy.b204.settlement.repository.SettlementShareRepository;
import com.ssafy.b204.ticket.entity.OrderItem;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.wallet.dto.WalletDtos.ChallengeRequest;
import com.ssafy.b204.wallet.dto.WalletDtos.ChallengeResponse;
import com.ssafy.b204.wallet.dto.WalletDtos.MyWalletResponse;
import com.ssafy.b204.wallet.dto.WalletDtos.RegisterWalletRequest;
import com.ssafy.b204.wallet.dto.WalletDtos.RegisterWalletResponse;
import com.ssafy.b204.wallet.dto.WalletDtos.RegisteredWallet;
import com.ssafy.b204.wallet.dto.WalletDtos.WalletTxItem;
import com.ssafy.b204.wallet.dto.WalletDtos.WalletTxListResponse;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletDepositReturnRepository;
import com.ssafy.b204.wallet.repository.WalletOrderRepository;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * wallet 도메인 서비스 — API v6 §3 (API-wallet-01·02·03·04).
 *
 * <p><b>비수탁이다.</b> 이 클래스는 개인키·니모닉·MPC 샤드를 받지도 저장하지도 않는다. 받는 것은
 * 주소와(외부 지갑이면) 서명 문자열뿐이고, 그 서명은 어떤 자금 이동 권한도 위임하지 않는다.
 * ERD {@code wallet}에 키 컬럼이 없는 것이 그 설계다.
 *
 * <ul>
 *   <li>잔액은 <b>Redis {@code wallet:balance} 해시</b>에만 둔다({@link WalletBalanceCache} —
 *       field={@code walletId}, value={@code "{balance}|{checkedAtEpochMs}"}, <b>TTL 없음</b>).
 *       {@code checkedAt}이 10초보다 낡으면 노드를 다시 읽고 갱신한다. DB에 잔액 사본 컬럼을
 *       만들지 않는다(§0.12 · §B′). 읽기가 쓰기를 만들지 않게 API-member-05·API-team-02는
 *       캐시만 보고 노드를 건드리지 않는다.
 *   <li>챌린지는 {@code wallet:challenge:{memberId}} TTL 300초 <b>1회용</b>이다
 *       ({@link WalletChallengeStore}). 검증 성공·실패 모두 읽는 즉시 삭제한다 — 남겨두면
 *       재사용 공격이 가능하다.
 *   <li>{@code EXTERNAL}은 {@code ecrecover}로 복구한 주소가 요청 {@code address}와 같아야 한다.
 *       불일치는 {@code COMMON_VALIDATION_FAILED}(400)
 *       (전용 코드 {@code WALLET_SIGNATURE_INVALID} 제안은 §16.1).
 *   <li>이미 지갑이 있으면 {@code COMMON_CONFLICT}(409). 그 주소가 <b>남의 것</b>이면 같은 코드로
 *       내리되 <b>보안 로깅</b> 대상이다 — 둘을 구분하는 전용 코드는 §16.1 제안 상태다.
 *   <li>등록 성공 <b>직후</b> 기본 지급({@code MINT} 100,000 YoYo) job을 건다. 지급이
 *       {@code FAILED}로 끝나면 회원은 잔액 0으로 들어오고, 운영자가 M-03에서 API-coin-07로
 *       지급한다 — 등록 자체를 롤백하지 않는다.
 *   <li>{@code WALLET_LINK}·{@code GRANT} 감사 로그를 남긴다(v6에서 로그인 절에서 옮겨왔다).
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WalletService {

    private static final Logger log = LoggerFactory.getLogger(WalletService.class);

    /** §1 · §3 — 회원 1회 기본 지급액. 플랫폼 고정값이라 요청 필드가 아니다(결정 v2 §3.0). */
    public static final long SIGNUP_GRANT_AMOUNT = 100_000L;

    /** §0.8 — 온체인 {@code grantRef}가 되는 멱등키. 회원 단위라 두 번 지급되지 않는다. */
    public static final String SIGNUP_GRANT_KEY_PREFIX = "grant:signup:";

    /** §0.3 — 첫 폴링까지 권장 대기(ms). */
    private static final int POLL_AFTER_MS = 1500;

    /** API-wallet-03 서명 메시지의 도메인 바인딩. 서비스 도메인·chainId·회원 ID를 함께 넣는다. */
    private static final String CHALLENGE_DOMAIN = "b204.ssafy.io";
    private static final String CHALLENGE_SERVICE_NAME = "B204 Stage";

    /**
     * §3 API-wallet-02 — {@code chain_job.wallet_id}로 <b>내 지갑에 걸리는</b> 4종.
     *
     * <p>6종 중 {@code RELEASE}·{@code DEPOSIT_RETURN}이 빠져 있다. 둘은 수령 지갑이
     * {@code chain_job}에 적히지 않는 운영자 tx라 여기서 찾을 수 없고, 도메인 테이블
     * ({@code settlement_share}·{@code performance})에서 따로 읽는다 — {@link #derivedItems}.
     * 여기에 남겨 두면 언제나 0건인 조건으로 조회해 놓고 "없다"고 답한다.
     */
    private static final Map<ChainJob.TxType, String> JOB_TX_TYPES = Map.of(
            ChainJob.TxType.MINT, "GRANT",
            ChainJob.TxType.PURCHASE, "PURCHASE",
            ChainJob.TxType.REFUND, "REFUND",
            ChainJob.TxType.DEPOSIT, "DEPOSIT");

    /** 정산 수령 — 원본은 {@code settlement_share}. */
    private static final String TYPE_RELEASE = "RELEASE";

    /** 보증금 반환 — 원본은 {@code performance.deposit_return_*}. */
    private static final String TYPE_DEPOSIT_RETURN = "DEPOSIT_RETURN";

    /** 결제 행의 {@code walletTxId} 접두 — 명세 §3 API-wallet-02 예시 {@code "pay_8801"}. */
    private static final String PAYMENT_TX_PREFIX = "pay_";

    /** {@code type} 쿼리 화이트리스트 — 결정 v2 §7 {@code WalletTx.type} 6종. */
    private static final Set<String> WALLET_TX_TYPES = Set.of("GRANT", "PURCHASE", "REFUND",
            TYPE_RELEASE, "DEPOSIT", TYPE_DEPOSIT_RETURN);

    /** 지갑으로 <b>들어오는</b> 종류. 나머지는 나가는 종류다. */
    private static final Set<String> INBOUND_TYPES =
            Set.of("GRANT", "REFUND", TYPE_RELEASE, TYPE_DEPOSIT_RETURN);

    private static final Set<String> TX_STATUSES =
            Set.of("PENDING", "SUBMITTED", "CONFIRMED", "FAILED");

    /**
     * 병합 정렬을 위해 한 번에 읽어 오는 {@code chain_job} 최대 행 수.
     *
     * <p>{@code page}가 아무리 커도 이 창을 넘겨 읽지 않는다. 지갑 하나의 이력이 1만 건을
     * 넘는 경우는 MVP에 없고(시연 지갑은 수십 건), 없다면 무한히 큰 {@code page}가 곧바로
     * 무한히 큰 {@code LIMIT}이 된다.
     */
    private static final int MAX_MERGE_WINDOW = 10_000;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final WalletRepository walletRepository;
    private final MemberRepository memberRepository;
    private final ChainJobRepository chainJobRepository;
    private final SettlementShareRepository settlementShareRepository;
    private final WalletDepositReturnRepository depositReturnRepository;
    private final WalletOrderRepository orderRepository;
    private final AuditLogRepository auditLogRepository;
    private final WalletBalanceCache balanceCache;
    private final WalletChallengeStore challengeStore;
    private final YoYoBalanceReader balanceReader;
    private final DisplayRateService displayRateService;
    private final ChainProperties chainProperties;

    // ================================================================ API-wallet-01

    /**
     * API-wallet-01 내 지갑 조회. A-13 화면 전체가 이 응답으로 그려진다.
     *
     * <p>잔액 경로(§0.12 · AVAIL-02)
     *
     * <ol>
     *   <li>캐시가 있고 {@code checkedAt}이 10초 이내 → 그대로 준다({@code stale: false}).
     *   <li>낡았거나 없으면 노드({@code YoYo.balanceOf})를 읽고 캐시를 갱신한다.
     *   <li>노드 조회가 실패했는데 캐시가 있으면 <b>낡은 값 + {@code stale: true}</b>를 준다.
     *   <li>캐시도 없으면 {@code COMMON_EXTERNAL_SERVICE_ERROR}(502).
     * </ol>
     *
     * <p>3·4가 TTL을 두지 않는 이유다 — 노드가 죽어도 마지막 값은 보여줘야 한다.
     */
    public MyWalletResponse myWallet(MemberPrincipal me) {
        Member member = requireMember(me);
        Wallet wallet = requireWallet(member.getMemberId());
        if (wallet.getStatus() == Wallet.Status.SUSPENDED) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }

        Optional<WalletBalanceCache.CachedBalance> cached = balanceCache.get(wallet.getWalletId());
        boolean stale = false;
        WalletBalanceCache.CachedBalance balance;
        if (cached.isPresent() && cached.get().isFresh()) {
            balance = cached.get();
        } else {
            Optional<Long> fromNode = balanceReader.balanceOf(wallet.getAddress());
            if (fromNode.isPresent()) {
                balance = balanceCache.put(wallet.getWalletId(), fromNode.get());
            } else if (cached.isPresent()) {
                balance = cached.get();
                stale = true;
            } else {
                // 원장을 읽을 방법이 없다. 0을 지어내면 화면이 "잔액 없음"으로 확정 표시한다.
                throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR);
            }
        }

        String pendingGrantJobId = chainJobRepository
                .findFirstByWalletIdAndTxTypeAndStatusInOrderByChainJobIdDesc(
                        wallet.getWalletId(), ChainJob.TxType.MINT,
                        List.of(ChainJob.Status.PENDING, ChainJob.Status.SUBMITTED))
                .map(job -> ChainJobIds.toJobId(job.getChainJobId()))
                .orElse(null);

        return new MyWalletResponse(
                wallet.getWalletId(),
                wallet.getProvider().name(),
                wallet.getAddress(),
                wallet.getStatus().name(),
                TimeSupport.toOffset(wallet.getVerifiedAt(), member.getTimezone()),
                displayRateService.money(balance.balance(), member.getDisplayCurrency(),
                        member.getTimezone()),
                pendingGrantJobId,
                chainProperties.networkName(),
                chainProperties.chainId(),
                emptyToNull(chainProperties.contract() == null ? null
                        : chainProperties.contract().yoyoAddress()),
                addressExplorerUrl(wallet.getAddress()),
                TimeSupport.fromEpochMilli(balance.checkedAt().toEpochMilli(), member.getTimezone()),
                stale);
    }

    // ================================================================ API-wallet-02

    /**
     * API-wallet-02 내 지갑 거래 이력.
     *
     * <p><b>원본이 둘이다</b>(명세 §3 API-wallet-02 "서버가 인덱싱한 {@code chain_job}·
     * {@code refund}·{@code settlement_share}를 원본으로 삼는다").
     *
     * <ul>
     *   <li>{@code chain_job} — {@code wallet_id}가 내 지갑인 job. {@code GRANT}·
     *       {@code PURCHASE}·{@code REFUND}·{@code DEPOSIT} 4종.
     *   <li>도메인 테이블 — {@code RELEASE}는 {@code settlement_share},
     *       {@code DEPOSIT_RETURN}은 {@code performance}. 둘은 <b>운영자 tx 하나가 여러(또는
     *       다른) 지갑으로 보내는</b> 유형이라 {@code chain_job.wallet_id}에 수령자가 없다.
     *       {@code wallet_id}만 보던 동안 정산 수령 탭이 영영 비어 있었다(A-13, 2026-09-22 dev).
     * </ul>
     *
     * <p><b>페이징을 메모리에서 합치는 이유.</b> 두 원본을 DB에서 각각 페이징하면
     * {@code occurredAt} 전역 순서가 깨진다(각 원본의 n번째를 섞는 것은 합집합의 n번째가
     * 아니다). SQL {@code UNION ALL} 뷰로 합칠 수도 있지만 두 테이블의 컬럼 모양이 너무 달라
     * 네이티브 쿼리 하나가 도메인 지식을 통째로 삼킨다. 지갑 하나의 행 수는 MVP에서 수십
     * 건이고 화면(A-13)은 {@code size=100} 한 페이지를 받아 클라이언트가 거르므로
     * ({@code WalletPage.tsx}), <b>{@code chain_job}의 앞 {@code (page+1)*size}행 + 도메인 행
     * 전부</b>를 읽어 합치고 정렬한 뒤 요청 구간만 잘라 준다. 앞 {@code (page+1)*size}행이면
     * 충분한 이유는, 합친 목록의 {@code page*size}번째까지에 들어갈 수 있는 {@code chain_job}
     * 행이 최대 그만큼이기 때문이다. 상한은 {@link #MAX_MERGE_WINDOW}.
     *
     * <p>정렬 필드 이름은 응답의 {@code occurredAt}이지만 {@code chain_job}의 DB 컬럼은
     * {@code requested_at}이다. {@code confirmed_at}은 확정 전에는 비어 있어 정렬 키로 쓸 수
     * 없다. 도메인 행의 {@code occurredAt}은 확정 시각({@code released_at}·
     * {@code deposit_returned_at})이다.
     */
    public WalletTxListResponse myTransactions(MemberPrincipal me, String type, String status,
                                                Pageable pageable) {
        Member member = requireMember(me);
        Wallet wallet = requireWallet(member.getMemberId());

        String walletTxType = resolveType(type);
        ChainJob.Status txStatus = resolveStatus(status);
        Sort.Direction direction = resolveDirection(pageable);
        int size = requirePageSize(pageable);
        int pageNumber = pageable.getPageNumber();

        // 도메인 원본(RELEASE·DEPOSIT_RETURN)은 확정된 사실만 적히므로 CONFIRMED 행뿐이다.
        List<WalletTxItem> derived =
                txStatus == null || txStatus == ChainJob.Status.CONFIRMED
                        ? derivedItems(wallet, member.getTimezone(), walletTxType)
                        : List.of();

        Set<ChainJob.TxType> txTypes = jobTxTypes(walletTxType);
        long jobTotal = 0;
        List<WalletTxItem> merged = new ArrayList<>(derived);
        if (!txTypes.isEmpty()) {
            Page<ChainJob> jobs = jobWindow(wallet.getWalletId(), txTypes, txStatus, direction,
                    pageNumber, size);
            jobTotal = jobs.getTotalElements();
            Map<Long, Payment> purchases = purchasesOf(jobs.getContent());
            jobs.getContent()
                    .forEach(job -> merged.add(toItem(job, member.getTimezone(), purchases)));
        }

        merged.sort(occurredAtComparator(direction));
        long total = jobTotal + derived.size();
        int from = Math.min((int) Math.min((long) pageNumber * size, Integer.MAX_VALUE),
                merged.size());
        int to = Math.min(from + size, merged.size());
        List<WalletTxItem> items = List.copyOf(merged.subList(from, to));
        boolean hasNext = (long) pageNumber * size + items.size() < total;

        return new WalletTxListResponse(
                displayRateService.listRate(member.getDisplayCurrency(), member.getTimezone()),
                items,
                new PageInfo(pageNumber, size, total, hasNext));
    }

    /** 요청 페이지까지 채우는 데 필요한 {@code chain_job} 앞부분. 총건수는 이 조회가 함께 준다. */
    private Page<ChainJob> jobWindow(Long walletId, Set<ChainJob.TxType> txTypes,
                                     ChainJob.Status txStatus, Sort.Direction direction,
                                     int pageNumber, int size) {
        int window = (int) Math.min((long) (pageNumber + 1) * size, MAX_MERGE_WINDOW);
        Pageable page = PageRequest.of(0, window, Sort.by(direction, "requestedAt"));
        return txStatus == null
                ? chainJobRepository.findByWalletIdAndTxTypeIn(walletId, txTypes, page)
                : chainJobRepository.findByWalletIdAndTxTypeInAndStatus(walletId, txTypes,
                        txStatus, page);
    }

    /**
     * {@code chain_job}으로 찾을 수 없는 행 — 정산 수령·보증금 반환.
     *
     * <p>둘 다 <b>주소</b>로 찾는다. 운영자 tx가 보낸 곳은 그 시점의 스냅숏 주소
     * ({@code settlement_share.wallet_address} · {@code performance_participant.wallet_address})
     * 이고, 그것이 지금 내 지갑 주소와 같으면 내가 받은 돈이다.
     */
    private List<WalletTxItem> derivedItems(Wallet wallet, String timezone, String walletTxType) {
        List<WalletTxItem> items = new ArrayList<>();
        if (walletTxType == null || TYPE_RELEASE.equals(walletTxType)) {
            settlementShareRepository.findReleasedByWalletAddress(wallet.getAddress()).stream()
                    .map(share -> toItem(share, timezone))
                    .forEach(items::add);
        }
        if (walletTxType == null || TYPE_DEPOSIT_RETURN.equals(walletTxType)) {
            depositReturnRepository
                    .findReturnedDepositsByHostWallet(wallet.getAddress(),
                            Performance.DepositStatus.RETURNED)
                    .stream()
                    .map(performance -> toItem(performance, timezone))
                    .forEach(items::add);
        }
        return items;
    }

    /**
     * 정산 수령 한 건. {@code refId}는 {@code settlement_share} PK라 그 팀의 분배 내역
     * (API-settlement-06)으로 이어진다 — {@code chain_job} PK가 아니므로 {@code refType}으로
     * 구분한다.
     */
    private WalletTxItem toItem(SettlementShare share, String timezone) {
        Settlement settlement = share.getSettlement();
        LocalDateTime occurredAt = share.getReleasedAt() != null
                ? share.getReleasedAt() : settlement.getReleasedAt();
        return new WalletTxItem(
                "share_" + share.getSettlementShareId(),
                TYPE_RELEASE,
                "IN",
                share.getTotalAmount(),
                Money.BASE_CURRENCY,
                ChainJob.Status.CONFIRMED.name(),
                "SETTLEMENT_SHARE",
                share.getSettlementShareId(),
                settlement.getPerformance().getTitle(),
                ChainJob.SignerType.OPERATOR.name(),
                false,
                settlement.getReleaseTxHash(),
                settlement.getReleaseTxHash() == null
                        ? null : txExplorerUrl(settlement.getReleaseTxHash()),
                TimeSupport.toOffset(occurredAt, timezone));
    }

    /** 보증금 반환 한 건. 공연당 최대 1건이라 {@code refId}는 {@code performance_id}다. */
    private WalletTxItem toItem(Performance performance, String timezone) {
        return new WalletTxItem(
                "deposit_return_" + performance.getPerformanceId(),
                TYPE_DEPOSIT_RETURN,
                "IN",
                performance.getDepositAmount(),
                Money.BASE_CURRENCY,
                ChainJob.Status.CONFIRMED.name(),
                "PERFORMANCE",
                performance.getPerformanceId(),
                performance.getTitle(),
                ChainJob.SignerType.OPERATOR.name(),
                false,
                performance.getDepositReturnTxHash(),
                txExplorerUrl(performance.getDepositReturnTxHash()),
                TimeSupport.toOffset(performance.getDepositReturnedAt(), timezone));
    }

    /**
     * 같은 시각이 둘이면 {@code walletTxId}로 갈라 <b>페이지 경계에서 행이 겹치거나 사라지지</b>
     * 않게 한다. 정렬이 불안정하면 1페이지 마지막 행이 2페이지 첫 행으로 다시 나온다.
     */
    private static Comparator<WalletTxItem> occurredAtComparator(Sort.Direction direction) {
        Comparator<WalletTxItem> byTime = Comparator.comparing(WalletTxItem::occurredAt,
                Comparator.nullsLast(Comparator.naturalOrder()));
        Comparator<WalletTxItem> ordered = direction.isAscending() ? byTime : byTime.reversed();
        return ordered.thenComparing(WalletTxItem::walletTxId);
    }

    /**
     * {@code chain_job} 한 건. {@code PURCHASE}는 <b>주문을 가리킨다</b> — 명세 예시가
     * {@code walletTxId: "pay_8801"} · {@code refType: "ORDER"} · {@code refId}(주문) ·
     * {@code title: "합정 3밴드 합동공연 · 일반 2매"}이기 때문이다. 나머지 종류는 가리킬 도메인
     * 행이 없어 job 자신({@code job_}·{@code CHAIN_JOB})을 가리킨다.
     *
     * <p>결제 링크가 없는 {@code PURCHASE}(옛 데이터·확정 전 유실)는 job 표기로 떨어진다 —
     * 제목을 못 붙인다고 이력에서 지우지 않는다.
     */
    private WalletTxItem toItem(ChainJob job, String timezone, Map<Long, Payment> purchases) {
        String walletTxType = JOB_TX_TYPES.get(job.getTxType());
        Payment purchase = purchases.get(job.getChainJobId());
        TicketOrder order = purchase == null ? null : purchase.getTicketOrder();
        LocalDateTime occurredAt = job.getConfirmedAt() != null
                ? job.getConfirmedAt() : job.getRequestedAt();
        return new WalletTxItem(
                order == null ? ChainJobIds.toWalletTxId(job.getChainJobId())
                        : PAYMENT_TX_PREFIX + purchase.getPaymentId(),
                walletTxType,
                INBOUND_TYPES.contains(walletTxType) ? "IN" : "OUT",
                job.getAmount(),
                Money.BASE_CURRENCY,
                job.getStatus().name(),
                order == null ? "CHAIN_JOB" : "ORDER",
                order == null ? job.getChainJobId() : order.getTicketOrderId(),
                order == null ? title(job, walletTxType) : orderTitle(order),
                job.getSignerType().name(),
                job.isFeeDelegated(),
                job.getTxHash(),
                job.getTxHash() == null ? null : txExplorerUrl(job.getTxHash()),
                TimeSupport.toOffset(occurredAt, timezone));
    }

    /** 이 페이지의 {@code PURCHASE} job → 결제. 한 번에 읽는다(행마다 읽으면 N+1). */
    private Map<Long, Payment> purchasesOf(List<ChainJob> jobs) {
        List<Long> jobIds = jobs.stream()
                .filter(job -> job.getTxType() == ChainJob.TxType.PURCHASE)
                .map(ChainJob::getChainJobId)
                .toList();
        if (jobIds.isEmpty()) {
            return Map.of();
        }
        return orderRepository.findByPurchaseChainJobIds(jobIds).stream()
                .collect(Collectors.toMap(Payment::getPurchaseChainJobId, payment -> payment,
                        (first, ignored) -> first));
    }

    /**
     * 결제 행의 제목 — 명세 예시 {@code "합정 3밴드 합동공연 · 일반 2매"}.
     *
     * <p>등급이 둘 이상이면 등급명을 적지 않고 총 매수만 적는다. 한 줄에 다 적으면 목록에서
     * 잘리고, 어느 등급을 대표로 고를지는 명세에 없다.
     */
    private static String orderTitle(TicketOrder order) {
        List<OrderItem> items = order.getItems();
        String tickets = items.size() == 1
                ? items.get(0).getTicketType().getName() + " " + items.get(0).getQuantity() + "매"
                : order.getTotalQuantity() + "매";
        return order.getPerformance().getTitle() + " · " + tickets;
    }

    /**
     * {@code GRANT} 행의 {@code title}은 지급 사유다 — 가입 자동 지급은 {@code "Welcome balance"}.
     * 관리자 지급(API-coin-07)의 {@code memo}는 ERD에 컬럼이 없어 담을 수 없다.
     */
    private static String title(ChainJob job, String walletTxType) {
        if (!"GRANT".equals(walletTxType)) {
            // 결제 행의 제목은 orderTitle 이 주문에서 만든다 — 여기로 오는 것은 결제
            // 링크가 끊긴 옛 PURCHASE 와 환불뿐이다. 환불의 주문 참조는 명세에 없다.
            // 정산 수령·보증금 반환의 제목(공연 이름)은 도메인 원본에서 오므로 여기로 오지 않는다.
            return null;
        }
        String key = job.getIdempotencyKey();
        return key != null && key.startsWith(SIGNUP_GRANT_KEY_PREFIX) ? "Welcome balance" : null;
    }

    // ================================================================ API-wallet-03

    /**
     * API-wallet-03 외부 지갑 등록 챌린지 발급 — <b>P0</b>(v6 승격).
     *
     * <p>서버 난수 {@code nonce} + <b>도메인 바인딩</b>(서비스 도메인·chainId·회원 ID)을 넣고
     * 5분 유효 · 1회용이다. 사용자가 <b>읽고 무엇에 서명하는지 알 수 있는 문장</b>이어야 하므로
     * 마지막 줄에 "이 서명은 어떤 이체도 승인하지 않는다"를 넣는다.
     *
     * <p>테이블을 만들지 않는다 — Redis {@code wallet:challenge:{memberId}} TTL 300초(§0.12).
     */
    @Transactional
    public ChallengeResponse issueChallenge(MemberPrincipal me, ChallengeRequest request) {
        Member member = requireMember(me);
        String address = EthCrypto.normalizeAddress(request.address());

        if (walletRepository.existsByMember_MemberId(member.getMemberId())) {
            // MVP에 교체 화면이 없다(미결 안건 14).
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT,
                    "이미 연결된 지갑이 있습니다. 관리자에게 문의해 주세요.");
        }
        walletRepository.findByAddress(address).ifPresent(other -> {
            log.warn("다른 회원에 등록된 주소로 챌린지 요청 — memberId={}", member.getMemberId());
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT,
                    "이미 다른 계정에 연결된 지갑 주소입니다.");
        });

        byte[] raw = new byte[8];
        RANDOM.nextBytes(raw);
        String nonce = HexFormat.of().formatHex(raw); // 16 hex
        Instant issuedAt = Instant.now();
        OffsetDateTime issuedAtOffset =
                TimeSupport.fromEpochMilli(issuedAt.toEpochMilli(), member.getTimezone());
        String message = challengeMessage(member.getMemberId(), address, nonce, issuedAtOffset);

        challengeStore.save(member.getMemberId(),
                new WalletChallengeStore.Challenge(nonce, address, message, issuedAt));
        auditLogRepository.save(AuditLog.builder()
                .actor(member)
                .actionType(AuditLog.ActionType.WALLET_LINK)
                .resourceType("wallet")
                .requestSummary("challenge issued for " + address)
                .result(AuditLog.Result.SUCCESS)
                .build());

        return new ChallengeResponse(nonce, message, "personal_sign", chainProperties.chainId(),
                issuedAtOffset.plus(WalletChallengeStore.TTL));
    }

    /** 명세 200 예시와 같은 문장 구조. 저장한 원문으로만 검증하므로 한 글자도 바꾸지 않는다. */
    private static String challengeMessage(Long memberId, String address, String nonce,
                                           OffsetDateTime issuedAt) {
        return CHALLENGE_SERVICE_NAME + " wants you to link this wallet.\n\n"
                + "Address: " + address + "\n"
                + "Member: " + memberId + "\n"
                + "Chain: Kaia Kairos (1001)\n"
                + "Domain: " + CHALLENGE_DOMAIN + "\n"
                + "Nonce: " + nonce + "\n"
                + "Issued At: " + issuedAt + "\n\n"
                + "This signature does not authorize any transfer.";
    }

    // ================================================================ API-wallet-04

    /**
     * API-wallet-04 지갑 등록(첫 1회) — <b>P0</b>. 두 갈래를 <b>한 엔드포인트</b>로 받는다.
     *
     * <ul>
     *   <li>{@code WEB3AUTH} — 로그인 세션에 보관한 idToken {@code wallets} 클레임 주소와 대조.
     *   <li>{@code EXTERNAL} — Redis 챌린지의 {@code nonce}·{@code address}·미만료 확인 →
     *       {@code ecrecover} 복원 주소 대조 → <b>키 삭제</b>(1회용).
     * </ul>
     *
     * <p>등록 성공 즉시 기본 지급 {@code MINT} job을 건다(멱등키 {@code grant:signup:{memberId}}).
     * 온체인 확정을 기다리지 않으므로 <b>202</b>다. <b>지급이 실패해도 등록은 성공으로 남긴다</b> —
     * 복구는 관리자 재지급(API-coin-07)이다.
     */
    @Transactional
    public RegisterWalletResponse registerWallet(MemberPrincipal me,
                                                  RegisterWalletRequest request) {
        Member member = requireMember(me);
        String address = EthCrypto.normalizeAddress(request.address());

        if (walletRepository.existsByMember_MemberId(member.getMemberId())) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT,
                    "이미 연결된 지갑이 있습니다. 관리자에게 문의해 주세요.");
        }
        walletRepository.findByAddress(address).ifPresent(other -> {
            log.warn("다른 회원에 등록된 주소로 지갑 등록 시도 — memberId={}", member.getMemberId());
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT,
                    "이미 다른 계정에 연결된 지갑 주소입니다.");
        });

        Wallet.Provider provider = Wallet.Provider.valueOf(request.provider());
        if (provider == Wallet.Provider.WEB3AUTH) {
            verifyWeb3AuthOwnership(me, address);
        } else {
            verifyExternalOwnership(member.getMemberId(), address, request);
        }

        Wallet wallet = walletRepository.save(Wallet.builder()
                .member(member)
                .provider(provider)
                .address(address)
                .verifiedAt(TimeSupport.nowStored())
                .status(Wallet.Status.LINKED)
                .build());

        ChainJob grant = grantJob(member, wallet);

        auditLogRepository.save(AuditLog.builder()
                .actor(member)
                .actionType(AuditLog.ActionType.WALLET_LINK)
                .resourceType("wallet")
                .resourceId(wallet.getWalletId())
                .requestSummary(provider.name() + " " + address + " verified at "
                        + wallet.getVerifiedAt())
                .result(AuditLog.Result.SUCCESS)
                .build());
        auditLogRepository.save(AuditLog.builder()
                .actor(member)
                .actionType(AuditLog.ActionType.GRANT)
                .resourceType("chain_job")
                .resourceId(grant.getChainJobId())
                .requestSummary("signup grant " + SIGNUP_GRANT_AMOUNT + " YoYo")
                .result(AuditLog.Result.SUCCESS)
                .build());

        return new RegisterWalletResponse(
                new RegisteredWallet(
                        wallet.getWalletId(),
                        wallet.getProvider().name(),
                        // ⚠️ ERD wallet 에 대응 컬럼이 없어 저장하지 않고 요청 값을 되돌려 준다.
                        request.walletLabel(),
                        wallet.getAddress(),
                        wallet.getStatus().name(),
                        TimeSupport.toOffset(wallet.getVerifiedAt(), member.getTimezone()),
                        addressExplorerUrl(wallet.getAddress())),
                ChainJobIds.toJobId(grant.getChainJobId()),
                displayRateService.money(SIGNUP_GRANT_AMOUNT, member.getDisplayCurrency(),
                        member.getTimezone()),
                POLL_AFTER_MS);
    }

    /**
     * 멱등키가 회원 단위이므로 재등록·재시도에서 <b>두 번 지급되지 않는다</b>(§0.8). 이미 있으면
     * 그 job을 그대로 재생한다 — 온체인 {@code grantRef}가 바뀌지 않아야 하기 때문이다.
     */
    private ChainJob grantJob(Member member, Wallet wallet) {
        String key = SIGNUP_GRANT_KEY_PREFIX + member.getMemberId();
        return chainJobRepository.findByIdempotencyKey(key)
                .orElseGet(() -> chainJobRepository.save(ChainJob.builder()
                        .txType(ChainJob.TxType.MINT)
                        .signerType(ChainJob.SignerType.OPERATOR)
                        .issuerType(ChainJob.IssuerType.MOCK)
                        .requester(member)
                        .walletId(wallet.getWalletId())
                        .amount(SIGNUP_GRANT_AMOUNT)
                        .idempotencyKey(key)
                        .build()));
    }

    /**
     * {@code WEB3AUTH} 경로 — 로그인 때 검증한 idToken의 {@code wallets} 클레임 주소와 같아야 한다.
     *
     * <p>세션이 그 클레임을 들고 있다(§3 API-wallet-04 요구사항 "로그인 세션에 그 클레임을
     * 보관한다"). 클레임이 없는 세션(P1 이메일 로그인)은 이 경로로 등록할 수 없다.
     */
    private static void verifyWeb3AuthOwnership(MemberPrincipal me, String address) {
        if (me.walletClaimAddress() == null
                || !EthCrypto.sameAddress(me.walletClaimAddress(), address)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "로그인에 쓰인 지갑 주소와 다릅니다. 다시 로그인해 주세요.");
        }
    }

    /**
     * {@code EXTERNAL} 경로 — 자체 챌린지 서명 검증.
     *
     * <p>코드가 두 갈래다(명세 4xx 표) — <b>형식·복원 실패는 400</b>, <b>챌린지 만료·재사용·발급
     * 이력 없음은 409</b>. 전자는 "선택한 계정을 확인하세요", 후자는 "다시 시작하세요"로 화면이
     * 갈리기 때문이다.
     */
    private void verifyExternalOwnership(Long memberId, String address,
                                         RegisterWalletRequest request) {
        if (request.nonce() == null || request.nonce().isBlank()
                || request.signature() == null || request.signature().isBlank()) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "서명 정보가 없습니다. 지갑 연결을 다시 시작해 주세요.");
        }
        if (!request.signature().matches("^0x[0-9a-fA-F]{130}$")) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "서명 형식이 올바르지 않습니다.");
        }

        WalletChallengeStore.Challenge challenge = challengeStore.consume(memberId)
                // 만료(5분)·재사용·발급 이력 없음을 구분하지 않는다 — 알려주면 정보를 준다.
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_CONFLICT,
                        "지갑 연결 요청이 만료되었습니다. 다시 시도해 주세요."));

        if (!challenge.nonce().equals(request.nonce())
                || !EthCrypto.sameAddress(challenge.address(), address)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "서명 확인에 실패했습니다. 다시 시도해 주세요.");
        }

        String recovered = EthCrypto.recoverPersonalSign(challenge.message(), request.signature())
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                        "서명 확인에 실패했습니다. 다시 시도해 주세요."));
        if (!EthCrypto.sameAddress(recovered, address)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "선택한 지갑 계정을 확인해 주세요. 다른 계정으로 서명했습니다.");
        }
    }

    // ================================================================ 공통

    private Member requireMember(MemberPrincipal me) {
        if (me == null) {
            throw BusinessException.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        return memberRepository.findById(me.memberId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID));
    }

    /** 지갑 미등록은 {@code WALLET_NOT_FOUND}(404) — 클라이언트는 C-05로 보낸다. */
    private Wallet requireWallet(Long memberId) {
        return walletRepository.findByMember_MemberId(memberId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.WALLET_NOT_FOUND,
                        "연결된 지갑이 없습니다."));
    }

    /** 쿼리 {@code type} → {@code WalletTx.type} 6종 중 하나. 미지정이면 {@code null}(전체). */
    private static String resolveType(String type) {
        if (type == null || type.isBlank()) {
            return null;
        }
        String upper = type.toUpperCase(Locale.ROOT);
        if (!WALLET_TX_TYPES.contains(upper)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "지원하지 않는 거래 종류입니다.");
        }
        return upper;
    }

    /** 그 필터로 {@code chain_job}을 읽어야 하는지 — 도메인 원본 2종만 요청하면 비어 있다. */
    private static Set<ChainJob.TxType> jobTxTypes(String walletTxType) {
        if (walletTxType == null) {
            return JOB_TX_TYPES.keySet();
        }
        return JOB_TX_TYPES.entrySet().stream()
                .filter(e -> e.getValue().equals(walletTxType))
                .map(Map.Entry::getKey)
                .findFirst()
                .map(Set::<ChainJob.TxType>of)
                .orElseGet(Set::of);
    }

    private static ChainJob.Status resolveStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        String upper = status.toUpperCase(Locale.ROOT);
        if (!TX_STATUSES.contains(upper)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "지원하지 않는 상태값입니다.");
        }
        return ChainJob.Status.valueOf(upper);
    }

    /** {@code size} 상한 100은 §0.2 공통 규약이다. */
    private static int requirePageSize(Pageable pageable) {
        if (pageable.getPageSize() > 100) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "한 번에 100건까지 조회할 수 있습니다.");
        }
        return pageable.getPageSize();
    }

    /** {@code sort=occurredAt,desc|asc} — 기본 desc. 다른 정렬 필드는 무시한다. */
    private static Sort.Direction resolveDirection(Pageable pageable) {
        return pageable.getSort().stream()
                .filter(order -> "occurredAt".equals(order.getProperty()))
                .findFirst()
                .map(Sort.Order::getDirection)
                .orElse(Sort.Direction.DESC);
    }

    private String addressExplorerUrl(String address) {
        return chainProperties.explorerBaseUrl() + "/address/" + address;
    }

    private String txExplorerUrl(String txHash) {
        return chainProperties.explorerBaseUrl() + "/tx/" + txHash;
    }

    private static String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
