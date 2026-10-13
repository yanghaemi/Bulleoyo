package com.ssafy.b204.coin.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.coin.dto.CoinDtos.Invariant;
import com.ssafy.b204.coin.dto.CoinDtos.PerformanceEscrow;
import com.ssafy.b204.coin.repository.CoinChainJobRepository;
import com.ssafy.b204.coin.repository.CoinPerformanceRepository;
import com.ssafy.b204.coin.repository.CoinWalletRepository;
import com.ssafy.b204.common.alert.OpsAlert;
import com.ssafy.b204.settlement.event.SettlementStateChangedEvent;
import com.ssafy.b204.settlement.service.ReleaseHaltGuard;
import com.ssafy.b204.wallet.entity.Wallet;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 발행량 대사 — API-coin-01의 {@code invariants} 4개와 mint·release 중단 플래그.
 *
 * <p><b>조회는 실패하지 않는다.</b> 공시가 502로 죽으면 "누구나 독립 검증"이 성립하지 않는다.
 * 체인이 없거나(키 미설정 — 팀원 로컬의 정상 상태) 노드 호출이 실패하면 DB 집계만으로 답하고
 * {@code stale = true}로 그 사실을 드러낸다. (구현 규칙 문서는 "캐시도 없으면 502"를 적어 두었지만
 * DB 집계는 언제나 있으므로 이 구현에서 502는 발생하지 않는다 — 스켈레톤 주석의 요구가 우선이다.)
 *
 * <p><b>1분 캐시</b>다. 체인 view 호출이 공연 수 + 등록 지갑 수만큼 나가므로 공시 화면을 새로 고칠 때마다 노드를
 * 때리면 공용 RPC가 먼저 지친다. 캐시는 프로세스 메모리다 — 인스턴스가 하나이고(기술 스택 v3)
 * 값이 파생 데이터라 유실돼도 다음 조회에서 재계산된다.
 *
 * <p><b>불변식이 깨지면 자동 복구하지 않는다.</b> {@code supplyMatched=false} → {@code mintHalted}·
 * {@code releaseHalted}가 켜지고 지급·정산이 {@code COIN_RESERVE_MISMATCH}(409)로 거부된다.
 * 관리자가 확인할 사건이지 서버가 눈감고 넘어갈 사건이 아니다.
 *
 * <h2>release 게이트의 판정 주체이기도 하다 ({@link ReleaseHaltGuard})</h2>
 *
 * <p>{@code settlement} 도메인은 {@link ReleaseHaltGuard} 인터페이스에만 의존하고, 그 구현이
 * 여기다(open-questions D-20). 두 도메인이 따로 살던 동안은 {@code AllowReleaseHaltGuard}(항상
 * 허용)가 {@code @ConditionalOnMissingBean}으로 들어가 있었다 — 이 클래스가 빈으로 존재하면
 * 그 기본 구현은 등록되지 않고, release 게이트가 <b>실제 대사 결과</b>로 막힌다.
 *
 * <p><b>{@code mintHalted}와 {@code releaseHalted}의 판정이 다르다.</b> mint는 불변식 1·4만 본다
 * (지급은 정산과 무관하다). release는 거기에 <b>불변식 3</b>을 더한다 — 분배 금액이 잠긴 규칙 ×
 * 카운터와 어긋난 채로 다음 공연의 정산을 실어 보내면, 그 tx는 되돌릴 수 없다.
 *
 * <p><b>노드 장애로는 막지 않는다.</b> 체인을 못 읽으면 불변식 1·2·4는 "미평가 = matched"로
 * 내려가고 불변식 3도 카운터를 구하지 못한 정산을 {@code checkedShows}에서 뺀다. 결과적으로
 * {@code releaseHalted = false}(막지 않음) + WARN 로그다. fail-closed로 뒤집으면 공용 RPC가
 * 한 번 깜빡일 때마다 시연 중 정산이 멈추는데, 그건 대사가 지키려는 것보다 나쁘다
 * (09-08 QA M-04·M-05 — 팀 안건 대기). <b>단</b> 체인이 없어도 저장 카운터로 평가할 수 있으면
 * 평가하고, 거기서 어긋나면 막는다 — 그건 노드 상태와 무관한 서버 기록 자체의 모순이다.
 *
 * <h2>게이트는 스캔을 부르지 않는다 — 누가 스냅샷을 채우나</h2>
 *
 * <p>{@link #isReleaseHalted()}와 {@link #mintHalted()}는 <b>마지막 스냅샷을 읽기만 한다.</b> 만료됐어도 다시 계산하지
 * 않는다. 계산하게 두면 캐시가 만료된 그 순간의 <b>요청 스레드</b>가 공연 수 × {@code eth_call} +
 * 정산 수 × {@code eth_call}을 돌게 되고, 그 요청은 정산 상세 조회(GET)일 수도 있다 — 게이트가
 * {@code actions}를 채우는 데도 쓰이기 때문이다(MR !73 리뷰, 정용기·자동 리뷰). 사용자 요청의
 * 응답 시간이 공용 RPC 상태에 묶이는 것은 대사가 지키려는 것과 무관한 손해다.
 *
 * <p>대신 스냅샷은 두 경로로 채워진다.
 *
 * <ul>
 *   <li><b>{@code SupplyReconcileScheduler}</b> — 30초 주기로 {@link #refresh()}. 게이트 판정의
 *       지연 상한이 곧 이 주기다.
 *   <li><b>{@link #onSettlementStateChanged}</b> — {@code AGGREGATE}·{@code RELEASE} 확정이
 *       반영되면(커밋 직후) 즉시 재대사. 대사 입력이 바뀌는 순간은 이 둘뿐이라 "방금 release한
 *       공연 때문에 다음 정산이 막혀야 하는데 30초 동안 안 막힌다"가 생기지 않는다. 이 리스너는
 *       확정 반영 스레드(스케줄러)에서 돌지 요청 스레드에서 돌지 않는다.
 * </ul>
 *
 * <p>공시({@code CoinService.supply()})는 종전대로 {@link #snapshot()}(1분 TTL)을 쓴다 — 저장소가
 * 같으므로 워밍의 이득을 같이 받고, TTL이 지났으면 공시 요청이 스스로 계산한다. 공시는 그 계산이
 * 목적인 화면이라 기다리는 것이 맞다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SupplyReconciler implements ReleaseHaltGuard {

    /** API v6 §8 "1분 캐시". */
    static final Duration CACHE_TTL = Duration.ofMinutes(1);

    /**
     * 에스크로를 움직이는 tx 유형. <b>보증금({@code DEPOSIT}·{@code DEPOSIT_RETURN})은 뺀다</b> —
     * 별도 계정이고 정산 재원 {@code R}에 들어가지 않는다(요구사항 v6 §7.5).
     */
    private static final List<ChainJob.TxType> ESCROW_FLOW = List.of(
            ChainJob.TxType.PURCHASE, ChainJob.TxType.REFUND, ChainJob.TxType.RELEASE);

    /**
     * 불변식 4 가 DB 에서 한 번에 가져올 등록 지갑 수. 청크는 <b>메모리만</b> 나눈다 — 노드 왕복은
     * 청크와 무관하게 <b>지갑 1개 = {@code balanceOf} {@code eth_call} 1회</b>다(multicall 없음).
     *
     * <p><b>지갑 수 상한</b>: 스캔 시간 ≈ 지갑 수 × RPC 왕복(공용 Kairos RPC 50~150ms). 30초 주기
     * 스케줄러({@code fixedDelay}라 겹치지 않는다) 안에 끝나려면 대략 <b>200~300개</b>가 상한이고,
     * TTL 이 지난 공시 조회는 그 시간을 요청 스레드에서 기다린다. MVP 등록 지갑은 수십 개다.
     *
     * <p><b>순차로 읽는다.</b> 스케줄러 풀(4)은 체인 워커·정산과 공유하고, 공용 RPC 는 병렬로 두드리면
     * 먼저 막힌다. 첫 실패에서 멈추므로 노드 장애 때 지갑 수만큼 타임아웃을 기다리지도 않는다.
     */
    // 지갑 수 × eth_call 순차. 수백 개를 넘으면 Multicall3 한 번(또는 JSON-RPC batch)으로 바꾼다
    public static final int WALLET_CHUNK = 100;

    private final CoinChainReader chainReader;
    private final CoinChainJobRepository chainJobRepository;
    private final CoinPerformanceRepository performanceRepository;
    private final CoinWalletRepository walletRepository;
    private final ReleasedSettlementAuditor releasedSettlementAuditor;
    private final OpsAlert opsAlert;

    private final AtomicReference<Snapshot> cache = new AtomicReference<>();

    /**
     * 마지막으로 알린 halt 상태({@link #alertOnHaltChange}). 시작값은 <b>정상</b>이다 — 스냅샷이 없을 때 두
     * 게이트는 막지 않으므로({@link #mintHalted()}·{@link #isReleaseHalted()}) 첫 스냅샷 전의 운영 상태가
     * 곧 정상이다. 그래서 기동 직후 첫 스냅샷이 halt 면 1회 알리고 정상이면 조용하다.
     * {@link #invalidate()}는 이 값을 건드리지 않는다 — 캐시를 비웠다고 같은 halt 를 다시 알리지 않는다.
     */
    private boolean alertedMintHalted = false;
    private boolean alertedReleaseHalted = false;

    /**
     * 미평가가 <b>연속</b>으로 이어진 주기 수와 그 사실을 이미 알렸는지 — {@link #alertedMintHalted}와 같은
     * 자리, 같은 {@code synchronized (this)} 아래서만 읽고 쓴다(!110 후속). 판정을 건너뛰는 동안 halt 가 나면
     * 아무도 모르는 창이 다시 생기므로, 깜빡임은 넘기되 지속은 {@link #unevaluatedAlertCycles}주기째 1회 알린다.
     */
    private int unevaluatedStreak = 0;
    private boolean alertedUnevaluated = false;

    /** {@link #unevaluatedAlertCycles} 기본값 — {@code @Value} 문자열이 상수를 못 읽어 숫자가 두 곳에 있다. */
    public static final int UNEVALUATED_ALERT_CYCLES = 20;

    /**
     * 이만큼 연속 미평가면 "판정 중단 중"을 1회 알린다. 기본 20 — 대사 주기 30초 기준 10분이다.
     * 시연에서 더 빨리 보고 싶으면 {@code b204.chain.supply-unevaluated-alert-cycles}로 줄인다.
     */
    @Value("${b204.chain.supply-unevaluated-alert-cycles:20}")
    private int unevaluatedAlertCycles = UNEVALUATED_ALERT_CYCLES;

    /**
     * "스냅샷이 아직 없다" 경고는 게이트별로 한 번 — 매 호출마다 찍으면 로그가 덮이고, 둘이 하나를
     * 공유하면 먼저 온 게이트만 남아 같은 창에 대사 없이 나간 다른 쪽(예: 관리자 지급)의 흔적이
     * 사라진다(!101 리뷰). 프로세스당 최대 2줄이다.
     */
    private final AtomicBoolean warnedNoSnapshotMint = new AtomicBoolean(false);
    private final AtomicBoolean warnedNoSnapshotRelease = new AtomicBoolean(false);

    /** 1분 캐시가 유효하면 그 값, 아니면 재계산. */
    public Snapshot snapshot() {
        Instant now = Instant.now();
        Snapshot cached = cache.get();
        if (cached != null && cached.computedAt().plus(CACHE_TTL).isAfter(now)) {
            return cached;
        }
        return refresh();
    }

    /**
     * TTL과 무관하게 다시 대사하고 스냅샷을 갈아 끼운다 — 스케줄러·확정 이벤트가 부른다.
     *
     * <p>{@link #invalidate()}로 비운 뒤 계산하지 않고 <b>계산이 끝난 값으로 한 번에 바꾼다.</b>
     * 비워 두는 사이에 게이트가 들어오면 "스냅샷 없음 = 막지 않음"으로 빠져나가기 때문이다.
     */
    public Snapshot refresh() {
        Snapshot fresh = compute(Instant.now());
        // 스케줄러 풀이 2 이상이면 30초 워밍과 확정 이벤트 재대사가 겹칠 수 있다. 먼저 시작해 늦게
        // 끝난 옛 스캔이 확정 직후 스냅샷을 덮으면 게이트가 최대 한 주기 동안 release 전 판정을 쓴다 —
        // 이 리스너가 있는 이유가 사라진다. 시작 시각(computedAt)이 더 새로운 쪽만 남긴다(!101 리뷰).
        Snapshot adopted = cache.accumulateAndGet(fresh,
                (current, candidate) -> current == null
                        || !candidate.computedAt().isBefore(current.computedAt()) ? candidate : current);
        alertOnHaltChange();
        return adopted;
    }

    /**
     * mint·release 중단 상태가 <b>바뀔 때만</b> 운영자에게 알린다(S15P21B204-78) — 30초 주기마다 반복하지 않는다.
     * 9/13 장부 밖 발행 때 halt 가 {@code log.error} 로만 남아 13시간 아무도 몰랐다.
     *
     * <p>비교 대상은 방금 계산한 값이 아니라 <b>캐시에 실제로 채택된 스냅샷</b>이다. {@code computedAt} 역전
     * 보호(!101)로 버려진 옛 스캔으로 알리면 알림과 게이트가 다른 말을 한다. 동시 refresh 가 겹쳐도 판정이
     * 섞이지 않게 {@code synchronized} 안에서 캐시를 다시 읽는다.
     *
     * <p><b>체인을 못 읽은 스냅샷은 판정하지 않는다</b>(!110 리뷰). {@code stale} 이거나 불변식 1·4 가
     * 미평가(expected/actual 비움)면 미평가 = matched 라 {@code supplyMatched=true} 가 된다 — halt 중에
     * RPC 가 한 번 깜빡이면 "복구"가, 돌아오면 다시 halt 가 나간다. 그래서 전환 판정도 마지막으로 알린
     * 값 갱신도 건너뛴다. 게이트는 이 메서드와 무관하다. 대가로 불변식 4 미평가 중 새로 난 불변식 1 halt 는
     * 지갑 스캔이 돌아온 뒤에 알린다 — <b>미평가가 지속돼도 침묵하지는 않는다</b>(!110 후속). LINKED 지갑
     * 하나의 {@code balanceOf}가 계속 실패하면({@code scanWallets}는 첫 실패에서 멈춘다) 불변식 4 가 매 주기
     * 미평가라 그 사이의 halt 가 영영 안 보이므로, {@link #unevaluatedAlertCycles}주기 연속이면 "판정 중단 중"을
     * 1회, 다시 평가되면 "재개"를 1회 보낸다.
     *
     * <p>블루/그린 두 인스턴스가 같이 떠 있으면 각자 대사해 같은 전환을 두 번 알릴 수 있다.
     */
    private synchronized void alertOnHaltChange() {
        Snapshot current = cache.get();
        if (current == null) {
            return;
        }
        if (current.stale()
                || unevaluated(current.invariants().get(0)) || unevaluated(current.invariants().get(3))) {
            if (++unevaluatedStreak >= unevaluatedAlertCycles && !alertedUnevaluated) {
                alertedUnevaluated = true;
                opsAlert.send("대사 미평가 지속 — halt 알림 판정 중단 중, 사유: " + unevaluatedNote(current));
            }
            return;
        }
        unevaluatedStreak = 0;
        if (alertedUnevaluated) {
            alertedUnevaluated = false;
            opsAlert.send("대사 미평가 해소 — halt 알림 판정을 재개한다");
        }
        boolean mintHalted = !current.supplyMatched();
        boolean releaseHalted = current.releaseHalted();
        if (mintHalted == alertedMintHalted && releaseHalted == alertedReleaseHalted) {
            return;
        }
        alertedMintHalted = mintHalted;
        alertedReleaseHalted = releaseHalted;
        if (!mintHalted && !releaseHalted) {
            opsAlert.send("발행량 대사 복구 — mint·release 게이트가 다시 열렸다 (supplyMatched=true, releaseHalted=false)");
            return;
        }
        StringBuilder text = new StringBuilder("발행량 대사 halt — mintHalted=").append(mintHalted)
                .append(" releaseHalted=").append(releaseHalted)
                .append(" · totalSupply=").append(current.totalSupply())
                .append(" wallet=").append(current.walletTotal())
                .append(" escrow=").append(current.escrowTotal());
        for (Invariant inv : current.invariants()) {
            if (!inv.matched()) {
                text.append("\n#").append(inv.no()).append(' ').append(inv.name());
                if (inv.expected() != null || inv.actual() != null) {
                    text.append(" (expected ").append(inv.expected()).append(", actual ").append(inv.actual()).append(')');
                }
                text.append(": ").append(inv.note());
            }
        }
        text.append("\n확인: GET /api/v1/coin/supply");
        opsAlert.send(text.toString());
    }

    private static boolean unevaluated(Invariant inv) {
        return inv.expected() == null || inv.actual() == null;
    }

    /** 왜 판정을 못 했는지 — 미평가인 불변식의 note 를 그대로 싣는다(체인 조회 불가·지갑 잔액 못 읽음 등). */
    private static String unevaluatedNote(Snapshot s) {
        Invariant inv = unevaluated(s.invariants().get(0)) ? s.invariants().get(0) : s.invariants().get(3);
        return unevaluated(inv) ? "#" + inv.no() + " " + inv.note() : "stale";
    }

    /**
     * 불변식 1·4가 깨지면 지급을 막는다(API-coin-07 게이트).
     *
     * <p>{@link #isReleaseHalted()}와 같은 규칙이다 — <b>마지막 스냅샷을 읽기만 한다</b>(D-38).
     * 이전엔 {@link #snapshot()}을 불러 캐시가 만료된 순간의 관리자 지급 요청 하나가 공연 수 ×
     * {@code eth_call}을 요청 스레드에서 돌렸다. 스냅샷이 없으면 막지 않는다 — 계산해 본 적 없는
     * 값으로 막으면 해제할 근거가 없는 영구 차단이 된다(release 게이트와 같은 판단).
     */
    public boolean mintHalted() {
        Snapshot last = cache.get();
        if (last == null) {
            warnNoSnapshot(warnedNoSnapshotMint, "mint 게이트");
            return false;
        }
        return !last.supplyMatched();
    }

    /**
     * release를 막을지 — {@link ReleaseHaltGuard} 구현이자 공시의 {@code releaseHalted}.
     *
     * <p>불변식 1·4(발행량이 새지 않았다) <b>또는</b> 불변식 3(분배가 규칙대로였다)이 깨지면
     * {@code true}다. 게이트는 이 값을 409 {@code COIN_RESERVE_MISMATCH}로 바꾼다
     * ({@code SettlementGates.release}).
     *
     * <p><b>여기서 대사를 돌리지 않는다.</b> 마지막 스냅샷이 만료됐어도 그 값을 쓴다 — 이 메서드는
     * 정산 상세 조회의 {@code actions} 조립과 release 실행 트랜잭션, 즉 <b>요청 스레드</b>에서
     * 불린다. 갱신은 30초 스케줄러와 확정 이벤트가 맡는다(클래스 주석 참고).
     *
     * <p>스냅샷이 아예 없으면(기동 직후 첫 주기 전) <b>막지 않는다.</b> 계산해 본 적 없는 값으로
     * 막으면 해제할 근거를 만들 수 없는 영구 차단이 되고, 그 판단은 {@code AllowReleaseHaltGuard}가
     * 이미 한 번 내린 것과 같다. 대신 WARN을 남겨 그 창이 있었다는 사실을 기록한다.
     *
     * <p>체인을 못 읽는 것은 불일치가 아니다 — 클래스 주석의 "노드 장애로는 막지 않는다"를 보라.
     */
    @Override
    public boolean isReleaseHalted() {
        Snapshot last = cache.get();
        if (last == null) {
            warnNoSnapshot(warnedNoSnapshotRelease, "release 게이트");
            return false;
        }
        return last.releaseHalted();
    }

    private void warnNoSnapshot(AtomicBoolean once, String gate) {
        if (once.compareAndSet(false, true)) {
            log.warn("{} — 발행량 대사 스냅샷이 아직 없어 막지 않는다(첫 주기 전이거나 대사가 계속 실패한다)",
                    gate);
        }
    }

    /**
     * 정산 확정이 반영되면 즉시 다시 대사한다 — 게이트가 30초짜리 옛 판정을 쓰지 않게.
     *
     * <p>{@code AFTER_COMMIT}이라 방금 바뀐 상태가 보인다. 실패해도 삼킨다 — 여기서 예외를 던지면
     * 확정 반영 루프가 다음 job으로 넘어가지 못하고, 스냅샷은 어차피 다음 주기에 다시 만들어진다.
     *
     * <p><b>비용</b>(리뷰 !106 🟡): 이 경로도 등록 지갑 수 × {@code eth_call}을 receipt 폴링 스레드에서
     * 돈다 — 그만큼 뒤따르는 {@code chain_job} 확정이 밀린다. 지갑 수가 -88 상한(약 200~300개/30초)에
     * 가까워지면 여기서는 {@link #refresh()}는 하되 지갑 스캔만 건너뛴다(불변식 1·2·3 만 재계산).
     * {@link #invalidate()}만 하는 것은 안 된다 — 스냅샷이 없는 사이 두 게이트가 열려(!101) 지급·정산이
     * 대사 없이 나간다.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSettlementStateChanged(SettlementStateChangedEvent event) {
        try {
            Snapshot fresh = refresh();
            log.debug("정산 확정({} {})으로 발행량 대사 재실행 — releaseHalted={}",
                    event.performanceId(), event.status(), fresh.releaseHalted());
        } catch (RuntimeException e) {
            log.warn("정산 확정 후 발행량 대사 재실행 실패 — 다음 주기에 다시 시도한다: {}", e.toString());
        }
    }

    /** 값이 바뀐 것이 확실한 시점에 캐시를 버린다. 테스트도 쓴다. */
    public void invalidate() {
        cache.set(null);
    }

    // ------------------------------------------------------------------ 계산

    private Snapshot compute(Instant now) {
        long signupCount = chainJobRepository.countByTxTypeAndStatusAndRequesterIsNull(
                ChainJob.TxType.MINT, ChainJob.Status.CONFIRMED);
        long adminCount = chainJobRepository.countByTxTypeAndStatusAndRequesterIsNotNull(
                ChainJob.TxType.MINT, ChainJob.Status.CONFIRMED);
        long mintedSum = sumMinted();

        boolean chainAvailable = chainReader.isAvailable();
        Long chainSupply = chainAvailable ? readTotalSupply() : null;

        EscrowScan escrow = chainSupply == null ? EscrowScan.notRead() : scanEscrow();
        WalletScan wallets = chainSupply == null ? WalletScan.notRead() : scanWallets();
        // 읽기 순서가 totalSupply → 에스크로 → 지갑이라, 그 사이에 확정된 mint(지갑 +, totalSupply 는
        // 이미 읽음)·환불·release(에스크로 → 지갑, 에스크로는 이미 읽음)가 지갑 쪽에서만 한 번 더
        // 세어져 차액 슬랙 0 인 정상 상태에서 음수가 난다. 음수는 mint·release 를 세우는 판정이라
        // 앞선 두 값을 지갑을 읽은 뒤에 한 번 더 읽고 재판정한다(리뷰 !106 🔴). 재읽기도 음수면
        // 그때 불일치다. totalSupply 재읽기가 실패하면 체인을 못 읽은 것으로 내린다(미평가·stale);
        // 에스크로 재스캔이 실패하면 첫 스캔을 유지한다 — 비우면 escrowTotal 0 이 공시에 실린다.
        // 블록 고정 eth_call 이 아니다 — 재읽기와 지갑 스캔 사이 purchase 는 여전히 겹칠 수 있다
        if (chainSupply != null && escrow.complete() && wallets.complete()
                && wallets.total() + escrow.total() > chainSupply) {
            log.info("불변식 4 음수(counted {} > totalSupply {}) — totalSupply·에스크로를 다시 읽는다",
                    wallets.total() + escrow.total(), chainSupply);
            chainSupply = readTotalSupply();
            if (chainSupply != null) {
                EscrowScan rescan = scanEscrow();
                if (rescan.complete()) {
                    escrow = rescan;
                }
                // 이 분기를 만든 것이 스캔 중 확정된 mint 라면 처음 집계한 mintedSum 도 그 mint 를 못 봤다.
                // totalSupply 만 새로 읽으면 불변식 4 대신 불변식 1 이 깨져 같은 halt 가 난다. 다시 집계해도
                // DB 확정(receipt 폴링)이 체인보다 늦어 아직이면 불변식 1 은 한 주기 깨진다 — 그 경로는 블록
                // 고정 eth_call 카드의 범위다.
                mintedSum = sumMinted();
            }
        }
        long totalSupply = chainSupply != null ? chainSupply : mintedSum;
        long walletTotal = wallets.total();
        // stale 은 종전 정의(totalSupply·에스크로) 그대로 둔다. 지갑 잔액을 못 읽은 것으로 여기를
        // 켜면 프론트가 그 하나로 불변식 1·2·3 행까지 '확인 중' 으로 덮어(invariants.ts:123·140)
        // 불변식 3 의 실제 불일치가 사라진다(리뷰 !87 4차 🔴). 그때 walletTotal 은 0 이지만 불변식 4 가
        // 미평가(값 null)라, 화면은 그것을 보고 지갑 타일·등식을 '—' 로 그린다(리뷰 !106 🔴).
        boolean stale = chainSupply == null || !escrow.complete();

        ReleasedSettlementAuditor.Scan releaseScan = releasedSettlementAuditor.scan();

        List<Invariant> invariants = new ArrayList<>(4);
        invariants.add(invariant1(mintedSum, chainSupply, totalSupply));
        invariants.add(invariant2(escrow));
        invariants.add(invariant3(releaseScan));
        invariants.add(invariant4(chainSupply, totalSupply, escrow, wallets));

        boolean supplyMatched = invariants.get(0).matched() && invariants.get(3).matched();
        if (!supplyMatched) {
            // 운영자 알림은 halt 전환 때만 refresh() 가 보낸다(alertOnHaltChange) — 이 로그는 매 주기 남는 기록이다.
            // 달려온 사람이 GET /coin/supply 를 따로
            // 치지 않아도 되게 **어느 불변식이 깨졌고 왜인지(note)** 를 여기 싣는다 — 1번(minted↔
            // totalSupply)과 4번(지갑+에스크로)은 원인도 대응도 다르다(리뷰 !88 🟡).
            StringBuilder broken = new StringBuilder();
            for (Invariant inv : List.of(invariants.get(0), invariants.get(3))) {
                if (!inv.matched()) {
                    broken.append(" [#").append(inv.no()).append(' ').append(inv.name()).append(": ")
                            .append(inv.note()).append(']');
                }
            }
            log.error("발행량 대사 불일치 — mint·release 중단. totalSupply={} minted={} wallet={} escrow={}{}",
                    totalSupply, mintedSum, walletTotal, escrow.total(), broken);
        }
        // 불변식 3은 supplyMatched(= mint 중단 판정)에 들어가지 않는다 — 지급은 정산과 무관하다.
        // release만 추가로 막는다.
        boolean releaseHalted = !supplyMatched || !releaseScan.matched();
        if (!releaseHalted && releaseScan.unevaluatedShows() > 0) {
            log.warn("release 게이트 — 불변식 3을 평가하지 못한 정산 {}건이 있다(막지 않는다)",
                    releaseScan.unevaluatedShows());
        }
        if (supplyMatched && !releaseScan.matched()) {
            log.error("정산 재계산 불일치 — release 중단. 검사 {}건 중 {}건 불일치, 최대 차이 {}",
                    releaseScan.checkedShows(), releaseScan.mismatchedShows(),
                    releaseScan.maxDiff());
        }
        return new Snapshot(totalSupply, escrow.total(), walletTotal,
                (int) (signupCount + adminCount), supplyMatched, releaseHalted, stale,
                List.copyOf(invariants), escrow.perPerformance(), now);
    }

    private long sumMinted() {
        return chainJobRepository.sumAmountBySignup(ChainJob.TxType.MINT, ChainJob.Status.CONFIRMED)
                + chainJobRepository.sumAmountByAdmin(ChainJob.TxType.MINT, ChainJob.Status.CONFIRMED);
    }

    private Long readTotalSupply() {
        try {
            return chainReader.totalSupply();
        } catch (RuntimeException e) {
            log.warn("totalSupply 조회 실패 — DB 집계로 대체한다(stale)", e);
            return null;
        }
    }

    /**
     * 공연별 {@code escrowOf}·{@code depositOf}를 읽고 불변식 2를 함께 계산한다.
     *
     * <p>한 공연이라도 읽지 못하면 {@code complete=false}로 표시하고 <b>중단한다</b> — 절반만 읽은
     * 합계를 {@code escrowTotal}로 내보내면 불변식 4가 정상 상태를 불일치로 읽는다.
     *
     * <p><b>공연 상태로 거르지 않는다</b>(D-71, 리허설 2). 보증금 {@code deposit(showId)}은
     * {@code createShow} 직후 — 공연이 아직 {@code DRAFT}·{@code PENDING_AGREEMENT}일 때 —
     * 컨트랙트 장부에 들어간다. 판매 중 이후 상태만 읽던 스캔은 그 보증금을 빠뜨려 불변식 4의
     * 차액을 보증금만큼 부풀렸다(공연 11, 기대 100,000 실측 150,000). 기준은 {@code on_chain_id}
     * 하나다 — 그 값이 있으면 {@code createShow}가 확정됐고 컨트랙트에 읽을 장부가 있다.
     *
     * <p>판매 전 공연이 불변식 2를 오탐하지 않는다. {@link #ESCROW_FLOW}에 보증금이 없어 기대값은
     * {@code purchase−refund−release = 0}이고, 비교 대상도 {@code escrowOf}(보증금 제외)라 0 = 0이다.
     * 보증금은 {@code depositOf}로 따로 읽어 불변식 4의 우변에만 더한다.
     */
    private EscrowScan scanEscrow() {
        Map<Long, Map<ChainJob.TxType, Long>> flows = escrowFlowsByPerformance();
        List<PerformanceEscrow> rows = new ArrayList<>();
        long total = 0;
        int checked = 0;
        int mismatched = 0;
        for (Object[] show : performanceRepository.findOnChainShows()) {
            Long performanceId = ((Number) show[0]).longValue();
            long showId = ((Number) show[1]).longValue();
            long onChainEscrow;
            long onChainDeposit;
            try {
                onChainEscrow = chainReader.escrowOf(showId);
                onChainDeposit = chainReader.depositOf(showId);
            } catch (RuntimeException e) {
                log.warn("공연 {}(showId={}) 에스크로 조회 실패 — 부분 합계를 내보내지 않는다",
                        performanceId, showId, e);
                return EscrowScan.notRead();
            }
            rows.add(new PerformanceEscrow(performanceId, onChainEscrow, onChainDeposit));
            total += onChainEscrow + onChainDeposit;

            Map<ChainJob.TxType, Long> flow = flows.getOrDefault(performanceId, Map.of());
            long expected = flow.getOrDefault(ChainJob.TxType.PURCHASE, 0L)
                    - flow.getOrDefault(ChainJob.TxType.REFUND, 0L)
                    - flow.getOrDefault(ChainJob.TxType.RELEASE, 0L);
            checked++;
            if (expected != onChainEscrow) {
                mismatched++;
            }
        }
        return new EscrowScan(true, total, List.copyOf(rows), checked, mismatched);
    }

    /**
     * 등록({@code LINKED}) 지갑 잔액을 <b>노드에서</b> 합산한다 — 화면용 {@code wallet:balance}
     * 캐시를 쓰지 않는다(D-49). 캐시는 조회된 지갑만 있어 합계가 작게 나왔다(D-44).
     *
     * <p>한 지갑이라도 읽지 못하면 {@code complete=false}로 <b>중단한다</b> — 부분 합계를
     * {@code walletTotal}로 내보내지 않는다({@link #scanEscrow()}와 같은 규칙). 청크·상한은
     * {@link #WALLET_CHUNK}.
     */
    private WalletScan scanWallets() {
        long total = 0;
        int read = 0;
        long afterId = 0;
        while (true) {
            List<Object[]> chunk = walletRepository.findChunkAfter(Wallet.Status.LINKED, afterId,
                    PageRequest.of(0, WALLET_CHUNK));
            for (Object[] row : chunk) {
                afterId = ((Number) row[0]).longValue();
                try {
                    total += chainReader.balanceOf((String) row[1]);
                } catch (RuntimeException e) {
                    log.warn("지갑 {} 잔액 조회 실패({}개 읽은 뒤) — 부분 합계를 내보내지 않는다",
                            afterId, read, e);
                    return WalletScan.notRead();
                }
                read++;
            }
            if (chunk.size() < WALLET_CHUNK) {
                return new WalletScan(true, total, read);
            }
        }
    }

    private Map<Long, Map<ChainJob.TxType, Long>> escrowFlowsByPerformance() {
        Map<Long, Map<ChainJob.TxType, Long>> flows = new HashMap<>();
        for (Object[] row : chainJobRepository.sumAmountByPerformanceAndTxType(
                ChainJob.Status.CONFIRMED, ESCROW_FLOW)) {
            Long performanceId = ((Number) row[0]).longValue();
            ChainJob.TxType txType = (ChainJob.TxType) row[1];
            long sum = ((Number) row[2]).longValue();
            flows.computeIfAbsent(performanceId, key -> new EnumMap<>(ChainJob.TxType.class))
                    .put(txType, sum);
        }
        return flows;
    }

    // ------------------------------------------------------------------ 불변식

    /**
     * 1. {@code totalSupply = Σ Minted} — mint만 있으므로 감소가 없다.
     *
     * <p>체인을 못 읽었으면 <b>두 값을 비운다</b>(D-46). 이전엔 {@code expected=actual=mintedSum}
     * 으로 채워 화면이 "100,000 = 100,000 일치"로 그렸다 — 실제로는 비교한 적이 없다. 4번이 !87
     * 에서 세운 규칙("못 보면 값을 비우고 {@code matched}는 유지")과 같은 모양으로 맞춘다. 확정된
     * MINT 합계는 {@code Snapshot.totalSupply}가 이미 들고 있어 여기 실을 이유가 없다.
     */
    private Invariant invariant1(long mintedSum, Long chainSupply, long totalSupply) {
        if (chainSupply == null) {
            return new Invariant(1, "SUPPLY_EQUALS_MINTED", null, null, null, null, null,
                    true, "체인 조회 불가 — totalSupply 를 읽지 못해 Σ Minted 와 대조하지 않았다(미평가)");
        }
        return new Invariant(1, "SUPPLY_EQUALS_MINTED", mintedSum, totalSupply, null, null, null,
                mintedSum == totalSupply,
                "totalSupply = Σ Minted — mint 만 있어 발행량은 줄지 않는다");
    }

    /** 2. 공연별 {@code escrowOf = Σpurchase − Σrefund − Σrelease}(보증금 별도). */
    private Invariant invariant2(EscrowScan escrow) {
        if (!escrow.complete()) {
            // 못 봤으면 값을 비운다 — 0 을 보내면 화면이 "일치 · 검사 0건"으로 그린다(1·3·4번과 같은 규칙).
            return new Invariant(2, "ESCROW_PER_SHOW", null, null, null, null, null, true,
                    "체인 조회 불가 — 공연별 에스크로 대사를 건너뛴다(미평가)");
        }
        return new Invariant(2, "ESCROW_PER_SHOW", null, null, escrow.checkedShows(),
                escrow.mismatchedShows(), null, escrow.mismatchedShows() == 0,
                "공연별 escrowOf = Σpurchase − Σrefund − Σrelease (보증금 별도)");
    }

    /**
     * 3. {@code Σ Released = 잠긴 규칙 × 카운터}(dust 포함, 0원 차).
     *
     * <p>{@link ReleasedSettlementAuditor}가 {@code RELEASED} 정산을 전부 재계산해 팀별로 비교한
     * 결과를 옮긴다. {@code maxDiff}는 <b>팀별</b> 차이의 최대 절대값이다 — 합계 비교만 하면 두
     * 팀의 금액이 서로 바뀐 사고가 상쇄로 통과한다.
     *
     * <p>평가하지 못한 정산은 {@code checkedShows}에 넣지 않고 note에 건수를 적는다.
     * "못 봤으니 통과"로 세지 않는 것이 이 불변식의 존재 이유다.
     *
     * <p><b>한 건도 평가하지 못했으면 {@code maxDiff}를 {@code null}로 내린다.</b> 0을 내리면
     * 검증 화면이 "일치 · 최대 차액 0"으로 그린다({@code frontend/src/features/verify/invariants.ts}
     * 는 {@code maxDiff != null}을 "값을 안다"로 읽는다) — 아무것도 검증하지 않은 상태가 공시에서
     * 통과로 보이는 것이 이 불변식이 막아야 할 바로 그 그림이다(MR !73 자동 리뷰). 불변식 1·2·4가
     * 미평가를 다루는 방식과 같다. {@code matched}는 <b>불일치 증거가 없으므로</b> {@code true}로
     * 두고, 실제 사정은 note가 말한다.
     *
     * <p>note는 한국어다 — 프론트가 이 문장을 공시 화면에 그대로 한 줄 출력한다.
     */
    private Invariant invariant3(ReleasedSettlementAuditor.Scan scan) {
        if (scan.nothingToCheck()) {
            return new Invariant(3, "RELEASED_EQUALS_RULE_RECALC", null, null, 0, 0, 0L, true,
                    "아직 실행된 정산이 없습니다 — 검사 대상 0건");
        }
        StringBuilder note = new StringBuilder();
        if (scan.checkedShows() == 0) {
            note.append("평가한 정산 없음(미평가 ").append(scan.unevaluatedShows()).append("건)");
        } else {
            note.append("Σ Released = 잠긴 규칙 × 카운터 재계산(dust 포함, 1원 오차 없음)");
        }
        if (scan.chainSourced() > 0) {
            note.append("; 온체인 choiceCountsOf 카운터로 평가 ").append(scan.chainSourced())
                    .append("건");
        }
        if (scan.storedSourced() > 0) {
            note.append("; 저장 카운터(settlement_share.choice_count)로 평가 ")
                    .append(scan.storedSourced()).append("건");
        }
        if (scan.inputMissingShows() > 0) {
            note.append("; 평가 불가 ").append(scan.inputMissingShows())
                    .append("건(규칙·매출·카운터 없음)");
        }
        if (scan.teamCountMismatchShows() > 0) {
            note.append("; 온체인 팀 수 불일치 ").append(scan.teamCountMismatchShows()).append("건");
        }
        // 한 건도 재계산하지 못했다면 "최대 차액 0"은 사실이 아니라 계산해 본 적 없다는 뜻이다.
        Long maxDiff = scan.checkedShows() == 0 ? null : scan.maxDiff();
        return new Invariant(3, "RELEASED_EQUALS_RULE_RECALC", null, null, scan.checkedShows(),
                scan.mismatchedShows(), maxDiff, scan.matched(), note.toString());
    }

    /**
     * 4. {@code totalSupply = Σ지갑 + Σ(에스크로+보증금)}.
     *
     * <p>좌변 − 우변 {@code > 0}은 <b>정상</b>이다 — 등록 지갑 잔액을 노드에서 전부 읽었으므로
     * 그 차액은 <b>등록 지갑 밖 주소가 들고 있는 코인</b>이다(D-49 이전엔 캐시 공백과 구분되지
     * 않았다). {@code < 0}만 불일치다(있을 수 없는 코인이 세어졌다는 뜻).
     *
     * <p><b>읽기는 한 블록에 고정돼 있지 않다.</b> 스캔 도중 지급·환불·release 가 확정되면 그
     * 금액이 두 번 세어져 음수가 날 수 있어, {@code compute} 가 음수일 때 totalSupply·에스크로를
     * 한 번 다시 읽고 재판정한다. 블록 고정 {@code eth_call}은 {@code CoinChainReader} 인터페이스
     * 변경이라 여기서 하지 않는다.
     *
     * <p><b>인자 순서는 화면 라벨을 따른다</b>(리뷰 !87 5차 🔴). 프론트는 불변식 1 을 뺀 모든
     * 행에서 {@code expected} 를 "Σ지갑 + Σ에스크로", {@code actual} 을 {@code totalSupply} 로
     * 찍고 {@code diff = actual − expected} 를 그린다(`invariants.ts:144·151`). 여기서 순서를
     * 뒤집어 넘기면 <b>정상 잔여분이 음수 차액으로 보인다</b> — D-44 때 사람이 읽던 그 행이다.
     *
     * <p><b>못 본 것이 있으면 두 값을 {@code null} 로 내린다.</b> 그러면 화면이 그 행만
     * '판정 불가'로 그린다({@code state: !known → unknown}). 값을 실어 보내면 {@code walletTotal}
     * 0 짜리 차액이 <b>'일치'로</b> 그려지고 못 읽었다는 사실은 보조 줄에만 남는다. 불변식 3 이
     * {@code checkedShows == 0} 일 때 {@code maxDiff} 를 {@code null} 로 내리는 것과 같은 규칙이다.
     *
     * <p>{@code matched} 는 그래도 {@code true} 다 — 못 읽은 것은 불일치가 아니다. 여기를
     * {@code false} 로 두면 {@code supplyMatched} 를 타고 <b>mint·release 가 멈춘다.</b> 노드가
     * 한 번 깜빡였다고 지급을 세울 수는 없다.
     */
    private Invariant invariant4(Long chainSupply, long totalSupply, EscrowScan escrow,
                                 WalletScan wallets) {
        if (chainSupply == null) {
            return unevaluated4("체인 조회 불가 — 지갑·에스크로 합계 대사를 건너뛴다(미평가)");
        }
        List<String> blind = new ArrayList<>();
        if (!escrow.complete()) {
            blind.add("에스크로·보증금 미조회");
        }
        if (!wallets.complete()) {
            blind.add("등록 지갑 잔액 노드 미조회");
        }
        if (!blind.isEmpty()) {
            return unevaluated4("체인 일부 조회 불가 — " + String.join("; ", blind) + "(미평가)");
        }

        long counted = wallets.total() + escrow.total();
        long unregistered = totalSupply - counted;
        String basis = " (등록 지갑 " + wallets.read() + "개 노드 조회)";
        if (unregistered == 0) {
            return new Invariant(4, "SUPPLY_EQUALS_WALLETS_PLUS_ESCROW", counted, totalSupply,
                    null, null, null, true,
                    "totalSupply = Σ등록 지갑 잔액 + Σ에스크로·보증금 — 정확히 일치" + basis);
        }
        if (unregistered < 0) {
            // 음수는 우리 장부가 과대계상된 쪽이다 — 미등록 보유분으로는 counted > totalSupply 를
            // 만들 수 없다(자동 리뷰 !87 6차 🔴). 여기가 supplyMatched=false 로 mint·release 가
            // 멈추는 자리라, 달려와 읽는 사람이 엉뚱한 곳을 뒤지지 않게 원인 후보를 맞게 적는다.
            // 그 사람이 먼저 알고 싶은 건 "기다리면 풀리나"다 — 스캔 경계의 레이스(다음 주기에
            // 사라진다)와 장부 버그(사라지지 않는다)를 note 가 구분해 준다(!113 리뷰).
            String note = "Σ지갑+Σ에스크로가 totalSupply 보다 " + (-unregistered)
                    + " 많다 — 있을 수 없는 코인이 세어졌다: 에스크로·보증금 이중 계산이거나,"
                    + " 스캔 중 확정된 purchase·refund·release 가 양쪽에 세어진 것"
                    + "(다음 주기에 풀리면 후자)" + basis;
            return new Invariant(4, "SUPPLY_EQUALS_WALLETS_PLUS_ESCROW", counted, totalSupply,
                    null, null, null, false, note);
        }
        return new Invariant(4, "SUPPLY_EQUALS_WALLETS_PLUS_ESCROW", counted, totalSupply,
                null, null, null, true,
                "totalSupply = Σ등록 지갑 잔액 + Σ에스크로·보증금; 차액 "
                        + unregistered + ": 등록(LINKED) 지갑 밖 주소"
                        + "(미등록·SUSPENDED) 보유분" + basis);
    }

    /** 판정하지 못한 4번 — 두 값을 비워 화면이 '판정 불가'로 그리게 한다. */
    private static Invariant unevaluated4(String note) {
        return new Invariant(4, "SUPPLY_EQUALS_WALLETS_PLUS_ESCROW", null, null, null, null, null,
                true, note);
    }

    // ------------------------------------------------------------------ 값 타입

    /**
     * 대사 결과 한 벌. 응답 조립은 {@code CoinService}가 한다 — 여기서 만들면 회원별 표시 통화까지
     * 캐시에 들어가 캐시 하나를 회원 수만큼 갖게 된다.
     */
    public record Snapshot(
            long totalSupply,
            long escrowTotal,
            long walletTotal,
            int grantCount,
            boolean supplyMatched,
            boolean releaseHalted,
            boolean stale,
            List<Invariant> invariants,
            List<PerformanceEscrow> perPerformanceEscrow,
            Instant computedAt
    ) {

        public Instant nextRefreshAt() {
            return computedAt.plus(CACHE_TTL);
        }
    }

    /** 공연별 온체인 잔액 스캔 결과. {@code complete=false}면 부분 합계를 쓰지 않는다. */
    private record EscrowScan(boolean complete, long total, List<PerformanceEscrow> perPerformance,
                              int checkedShows, int mismatchedShows) {

        static EscrowScan notRead() {
            return new EscrowScan(false, 0L, List.of(), 0, 0);
        }
    }

    /** 등록 지갑 노드 잔액 스캔 결과. {@code complete=false}면 부분 합계를 쓰지 않는다. */
    private record WalletScan(boolean complete, long total, int read) {

        static WalletScan notRead() {
            return new WalletScan(false, 0L, 0);
        }
    }
}
