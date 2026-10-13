package com.ssafy.b204.settlement.service;

import com.ssafy.b204.chain.service.ChainJobConfirmationService;
import com.ssafy.b204.chain.worker.ChainOwnership;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.settlement.entity.Dispute;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.DisputeRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 정산의 두 자동 동작 — 확정 반영과 자동 release.
 *
 * <p><b>{@code @Profile("!test")}</b>: 테스트에서는 스케줄러가 돌면 테스트끼리 간섭한다(체인 워커도
 * 같은 이유로 꺼 둔다). 동작 자체는 {@link SettlementConfirmationService}·
 * {@link SettlementService#releaseAutomatically}를 직접 불러 검증한다 — 스케줄러는 <b>부르는 시점만</b>
 * 정하고 로직을 갖지 않는다.
 */
@Slf4j
@Component
@Profile("!test")
@RequiredArgsConstructor
public class SettlementScheduler {

    private static final List<Settlement.Status> RELEASABLE =
            List.of(Settlement.Status.LOCKED, Settlement.Status.DISPUTE_OPEN);

    private final ChainOwnership ownership;
    private final SettlementConfirmationService confirmationService;
    /** 보증금 반환 판정은 확정 서비스가 갖고 있다 — 스케줄러는 시점만 정한다. */
    private final ChainJobConfirmationService chainConfirmations;
    private final SettlementService settlementService;
    private final SettlementRepository settlementRepository;
    private final DisputeRepository disputeRepository;

    /**
     * 확정된 {@code chain_job}을 정산 상태에 반영한다.
     *
     * <p>{@code ChainJobConfirmedEvent}가 생기면 이 주기 실행은 사라지고 리스너가 대신한다
     * (open-questions D-5). 그때까지의 다리다.
     */
    @Scheduled(fixedDelayString = "PT2S")
    public void applyConfirmedJobs() {
        // 소유자만 반영한다. 두 인스턴스가 같은 확정 job 을 보면 도메인 전이가 두 번 돈다
        // (S15P21B204-95). 단일 인스턴스면 ownership 이 늘 true 라 지금과 같다.
        if (!ownership.isOwner()) {
            return;
        }
        try {
            confirmationService.applyConfirmedJobs();
        } catch (RuntimeException e) {
            log.error("확정 job 반영 주기 실행 실패: {}", e.toString());
        }
    }

    /**
     * 취소된 공연의 보증금 반환을 다시 판정한다(S15P21B204-140).
     *
     * <p>확정 경로에 붙이지 않는 이유는 {@code ChainJobConfirmationService.sweepCancelledDepositReturns}
     * javadoc에 적었다 — 조건이 갖춰지는 순간이 확정 한 번과 일치하지 않고, 체인 조회를 확정
     * 트랜잭션 안에 두면 티켓·주문 행 잠금을 그만큼 붙잡는다.
     *
     * <p>주기는 60초다. 반환은 사람이 기다리는 화면 동작이 아니라 뒤따라오는 정산 절차이고,
     * 온체인 확정 자체가 그보다 오래 걸린다.
     */
    @Scheduled(fixedDelayString = "PT60S")
    public void sweepCancelledDepositReturns() {
        if (!ownership.isOwner()) {
            return;
        }
        try {
            int enqueued = chainConfirmations.sweepCancelledDepositReturns();
            if (enqueued > 0) {
                log.info("취소 공연 보증금 반환 {}건을 걸었다", enqueued);
            }
        } catch (RuntimeException e) {
            log.error("보증금 반환 주기 실행 실패: {}", e.toString());
        }
    }

    /**
     * 실행할 수 있게 된 정산을 자동 실행한다 — API-settlement-05의 기본 경로다.
     *
     * <p>수동 API와 <b>같은 서비스 메서드</b>를 부른다. 게이트를 다시 적지 않는 것이 핵심이다 —
     * 두 경로가 갈라지면 한쪽만 이의제기·대사·에스크로 검사를 빠뜨린다.
     *
     * <p><b>후보는 게이트의 타이밍 조건까지만 반영한다</b>
     * ({@link SettlementRepository#findReleaseCandidates}). 상태만으로 뽑으면 이의제기 기간 중인
     * 정산이 매 분 {@code releaseInternal}까지 내려가 공연 행 락을 잡았다 롤백하고 보류 로그가
     * 48시간 × 1분 = 2,880줄 쌓여, 아래 "열린 이의" 줄이 그 안에 묻힌다. 마감만 보던 예전 쿼리로
     * 되돌리지도 않는다 — 조기 동의(API-settlement-08)로 "마감 전인데 release 가능" 인 정산이
     * 생겨 그때는 전원이 동의해도 자동 release 가 영영 안 나갔다. 나머지 판정(대사·에스크로·
     * 열린 이의·취소)의 유일한 정의는 그대로 {@link SettlementGates#release} 다.
     *
     * <p>열린 이의가 하나라도 있으면 건너뛴다. 서비스도 같은 검사를 하지만, 여기서 먼저 거르면
     * 예외를 던지고 잡는 왕복이 사라진다.
     *
     * <p><b>건너뛴 사실은 남긴다</b>(D-68, 리허설 2). 조용히 {@code continue}하던 동안은 "자동
     * release 가 이의 때문에 멈췄다"를 로그로 확인할 방법이 없었고, 리허설 대본이 그 줄을 확인
     * 지점으로 삼고 있었다. 게이트에 막힌 경우와 같은 {@code info} 한 줄이다 — 이의가 열려 있는
     * 동안 정산 하나당 1분 1줄이 쌓이는 것은 <b>의도한 것</b>이다. 48시간 창이 이 로그의 상한이고,
     * 그 창 안에 무슨 일이 있었는지 못 읽는 것보다 줄이 쌓이는 쪽이 낫다.
     *
     * <p><b>이 메서드에 {@code @Transactional}을 붙이지 않는다.</b> 2026-09-10 리허설에서
     * {@code @Transactional(readOnly = true)}가 붙어 있었고, 안에서 부르는
     * {@link SettlementService#releaseAutomatically}({@code @Transactional}, REQUIRED)가 바깥의
     * 읽기 전용 트랜잭션에 <b>합류</b>해 {@code chain_job} INSERT 가
     * {@code Connection is read-only}로 거부됐다 — 60초마다 같은 예외를 반복하며 자동 release 가
     * 한 번도 나가지 않았다. 조회는 리포지토리가 자기 짧은 트랜잭션으로 충분하고, 쓰기는
     * 서비스가 자기 트랜잭션을 연다. 스케줄러는 트랜잭션 경계를 갖지 않는다.
     * {@code SettlementApiIntegrationTest}가 이 메서드를 <b>직접</b> 불러 회귀를 막는다
     * (수동 API 경로만 테스트하면 이 결함은 보이지 않는다 — 스케줄러 빈은 test 프로파일에 없다).
     */
    @Scheduled(fixedDelayString = "PT60S")
    public void releaseDueSettlements() {
        // 자동 release 는 온체인 tx 를 만든다 — 두 번 돌면 RELEASE job 이 둘 생긴다.
        if (!ownership.isOwner()) {
            return;
        }
        for (Settlement settlement : settlementRepository.findReleaseCandidates(
                RELEASABLE, TimeSupport.nowStored())) {
            boolean hasOpenDispute = disputeRepository
                    .findBySettlement_SettlementId(settlement.getSettlementId()).stream()
                    .anyMatch(Dispute::isOpen);
            if (hasOpenDispute) {
                log.info("자동 release 보류 — settlementId={} 열린 이의 있음",
                        settlement.getSettlementId());
                continue;
            }
            try {
                settlementService.releaseAutomatically(settlement.getSettlementId());
                log.info("자동 release 접수 — settlementId={}", settlement.getSettlementId());
            } catch (BusinessException e) {
                // 게이트에 막힌 것은 정상이다(대사 불일치·에스크로 부족 등). 상태를 바꾸지 않는다.
                log.info("자동 release 보류 — settlementId={} code={}",
                        settlement.getSettlementId(), e.getErrorCode().getCode());
            } catch (PessimisticLockingFailureException e) {
                // 공연 취소가 같은 공연 행을 잡고 있는 동안의 락 대기다. 다음 tick 에 다시 온다 —
                // 여기서 튀어나가면 그 tick 의 나머지 정산이 통째로 안 돈다.
                log.info("자동 release 보류 — settlementId={} 공연 취소와 락 경합",
                        settlement.getSettlementId());
            } catch (RuntimeException e) {
                log.error("자동 release 실패 — settlementId={}: {}",
                        settlement.getSettlementId(), e.toString());
            }
        }
    }
}
