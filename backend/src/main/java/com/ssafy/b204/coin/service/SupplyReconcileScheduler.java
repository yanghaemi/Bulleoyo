package com.ssafy.b204.coin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 발행량 대사 스냅샷을 미리 채워 둔다 — <b>release 게이트가 요청 스레드에서 체인을 훑지 않도록.</b>
 *
 * <p>{@link SupplyReconciler#isReleaseHalted()}는 마지막 스냅샷을 읽기만 한다. 그 값을 누가
 * 최신으로 유지하느냐가 게이트 판정의 신선도이고, 그 답이 이 스케줄러다. 주기(30초)가 곧
 * <b>판정 지연의 상한</b>이다 — 다만 대사 입력이 실제로 바뀌는 순간(정산 확정 반영)에는
 * {@code SettlementStateChangedEvent}가 즉시 갱신하므로, 30초는 "체인 쪽에서 조용히 값이
 * 달라졌을 때"의 상한이다.
 *
 * <p>공시(API-coin-01)의 1분 TTL과 주기를 일부러 다르게 뒀다. 30초 워밍이 돌면 공시 요청은
 * 거의 항상 캐시 적중이고, 스케줄러가 죽어도 공시는 스스로 계산해 답한다.
 *
 * <p><b>{@code @Profile("!test")}</b>: 테스트에서 주기 실행이 돌면 스냅샷이 테스트 사이에 임의로
 * 바뀌어 단정이 흔들린다({@code SettlementScheduler}와 같은 이유). 테스트는
 * {@link SupplyReconciler#refresh()}·{@code snapshot()}을 직접 부르거나 확정 이벤트로 채운다.
 */
@Slf4j
@Component
@Profile("!test")
@RequiredArgsConstructor
public class SupplyReconcileScheduler {

    private final SupplyReconciler reconciler;

    /**
     * 30초마다 대사를 다시 돌린다. <b>첫 실행은 컨텍스트 refresh 시점</b>({@code ScheduledAnnotationBeanPostProcessor})
     * — 웹 서버가 열리는 것과 거의 같은 순간에 스케줄러 스레드에서 시작한다. 그 첫 대사가 끝날 때까지의
     * 수 초 동안 두 게이트({@code mintHalted}·{@code isReleaseHalted})는 "스냅샷 없음 → 막지 않음"이고
     * WARN 1회를 남긴다. {@code ApplicationReadyEvent}에서 한 번 더 도는 리스너는 창을 줄이지 않고
     * 기동 스레드만 {@code eth_call} 시간만큼 붙잡아서 두지 않았다(!101 리뷰 2차).
     */
    @Scheduled(fixedDelayString = "PT30S")
    public void warmSnapshot() {
        try {
            reconciler.refresh();
        } catch (RuntimeException e) {
            // 대사 실패는 게이트를 막지 않는다(fail-open이 의도다). 마지막 성공 스냅샷이 남는다.
            log.warn("발행량 대사 주기 실행 실패 — 마지막 스냅샷을 유지한다: {}", e.toString());
        }
    }
}
