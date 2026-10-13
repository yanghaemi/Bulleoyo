package com.ssafy.b204.file.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 만료된 임시 업로드 정리 — 포스터 업로드 계획 v1 §6의 "고아 파일 방치" 한계를 메운다.
 *
 * <p>{@code PerformanceStatusScheduler}와 같은 모양이다 — <b>로직을 갖지 않고</b>
 * {@link FileStorageService#sweepExpiredTemp()}를 부르는 시점만 정한다. 새 스케줄링 인프라를
 * 만들지 않는다(공용 스레드 풀은 {@code spring.task.scheduling.pool.size}).
 *
 * <p>{@code @Profile("!test")} — 테스트에서 이 배치가 돌면 다른 테스트가 만든 행을 지워 간섭한다.
 * 동작은 서비스 메서드를 직접 불러 검증한다.
 */
@Slf4j
@Component
@Profile("!test")
@RequiredArgsConstructor
public class FileUploadCleanupScheduler {

    private final FileStorageService fileStorageService;

    /**
     * 주기 1시간 — TTL이 24시간이라 분 단위 정밀도가 필요 없다. 지연의 대가는 "지워질 파일이
     * 최대 1시간 더 디스크에 있는 것"뿐이고, 그 사이 그 {@code uploadId}로 바인딩이 성공해도
     * 무해하다(만료는 정리 시점에만 판정한다).
     *
     * <p>한 번에 최대 {@code CLEANUP_BATCH}건이라 밀려 있으면 여러 주기에 걸쳐 줄어든다.
     */
    @Scheduled(fixedDelayString = "PT1H")
    public void sweepExpiredTemp() {
        try {
            fileStorageService.sweepExpiredTemp();
        } catch (RuntimeException e) {
            log.error("임시 업로드 정리 주기 실행 실패: {}", e.toString());
        }
    }
}
