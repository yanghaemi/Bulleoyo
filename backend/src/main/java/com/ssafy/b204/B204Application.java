package com.ssafy.b204;

import com.ssafy.b204.common.config.StorageTimeZoneInitializer;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableJpaAuditing
@EnableScheduling
// 추천 노출 로그(RecommendationLogWriter)를 응답 경로 밖에서 적기 위한 @Async 활성화.
@EnableAsync
public class B204Application {

    public static void main(String[] args) {
        // 저장 기준 시각대(Asia/Seoul) 고정. EnvironmentPostProcessor 로도 걸어 두었지만
        // 여기서 한 번 더 못 박는다 — 배포 환경 TZ 에 의존하는 경로를 남기지 않는다.
        StorageTimeZoneInitializer.pin();
        SpringApplication.run(B204Application.class, args);
    }
}
