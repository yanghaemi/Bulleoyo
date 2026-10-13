package com.ssafy.b204.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.performance.service.PerformanceMediaService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link AppProperties#uploadUrl(String)} — 이미지 URL이 세 갈래 중 하나로 나간다.
 *
 * <p>미디어 API 경로({@code /api/...})를 저장 루트 상대 경로로 잘못 보면
 * {@code {base}/uploads/api/v1/...}이 되어 목록·상세·내 공연의 포스터가 전부 404였다(MR !187).
 */
class AppPropertiesTest {

    private final AppProperties properties = new AppProperties("https://b204.ssafy.io");

    @Test
    @DisplayName("저장 루트 상대 경로는 {base}/uploads/ 아래로 조립한다")
    void relativePathGetsUploadsPrefix() {
        assertThat(properties.uploadUrl("p/202609/abc.png"))
                .isEqualTo("https://b204.ssafy.io/uploads/p/202609/abc.png");
        // 앞의 /·역슬래시는 정규화한다(윈도 저장 경로).
        assertThat(properties.uploadUrl("\\p\\202609\\abc.png"))
                .isEqualTo("https://b204.ssafy.io/uploads/p/202609/abc.png");
    }

    @Test
    @DisplayName("외부 절대 URL은 그대로 — 업로드 이전 행의 직접 입력값이다")
    void externalAbsoluteUrlPassesThrough() {
        assertThat(properties.uploadUrl("https://cdn.example.com/poster.jpg"))
                .isEqualTo("https://cdn.example.com/poster.jpg");
        assertThat(properties.uploadUrl("http://cdn.example.com/poster.jpg"))
                .isEqualTo("http://cdn.example.com/poster.jpg");
    }

    @Test
    @DisplayName("미디어 API 경로는 그대로 — 업로드 루트가 아니라 API가 서빙한다")
    void mediaApiPathPassesThrough() {
        String stored = PerformanceMediaService.mediaUrl(12L,
                PerformanceMediaService.Kind.POSTER);

        assertThat(stored).isEqualTo("/api/v1/performances/12/media/poster");
        assertThat(properties.uploadUrl(stored)).isEqualTo(stored);
    }
}
