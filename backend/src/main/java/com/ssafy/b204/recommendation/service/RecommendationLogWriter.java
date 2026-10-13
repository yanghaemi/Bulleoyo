package com.ssafy.b204.recommendation.service;

import com.ssafy.b204.recommendation.entity.RecommendationLog;
import com.ssafy.b204.recommendation.repository.RecommendationLogRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 추천 노출 로그를 <b>응답 경로 밖에서</b> 적는다 — API-recommendation-01 §시스템 처리 4.
 *
 * <p>별도 빈인 이유는 {@code @Async}가 프록시 경계에서만 동작하기 때문이다. 같은 클래스 안의
 * 메서드를 부르면 프록시를 타지 않아 조용히 동기로 돈다.
 *
 * <p>{@code REQUIRES_NEW}다. 호출한 조회 트랜잭션은 {@code readOnly}이고 이미 끝났을 수도 있다 —
 * 로그는 자기 트랜잭션에서 커밋하거나 자기만 롤백한다.
 *
 * <p>예외를 밖으로 던지지 않는다. 이 로그는 학습 데이터 적재이고, 실패가 홈 화면의 추천 섹션을
 * 깨뜨릴 이유가 없다. {@code @Async}가 예외를 삼키긴 하지만 그건 스레드 경계의 부작용이지
 * 의도가 아니라, 여기서 명시적으로 잡아 남긴다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RecommendationLogWriter {

    private final RecommendationLogRepository repository;

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void writeAsync(List<RecommendationLog> logs) {
        if (logs.isEmpty()) {
            return;
        }
        try {
            repository.saveAll(logs);
        } catch (RuntimeException e) {
            log.warn("추천 노출 로그 {}건 저장 실패 — sessionId={}", logs.size(),
                    logs.get(0).getSessionId(), e);
        }
    }
}
