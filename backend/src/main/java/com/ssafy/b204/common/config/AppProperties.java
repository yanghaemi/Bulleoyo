package com.ssafy.b204.common.config;

/**
 * 서비스 자신의 공개 주소 — 응답에 <b>완성된 절대 URL</b>을 담기 위해 필요하다.
 *
 * <p>API v6 §0.7은 익스플로러 링크를 두고 "서버가 {@code explorerUrl}을 완성된 절대 URL로
 * 내려주고 프론트가 조립하지 않는다"고 정했다. 같은 이유로 검증 페이지 링크
 * ({@code verificationUrl} · API-performance-03)와 검표 링크(API-performance-10)도 서버가
 * 완성해서 내려준다 — 프론트가 조립하면 배포 도메인이 바뀔 때 두 곳을 고쳐야 한다.
 *
 * <p>로컬 기본값은 명세 예시와 같은 {@code https://b204.ssafy.io}다.
 */
@org.springframework.boot.context.properties.ConfigurationProperties(prefix = "b204.app")
public record AppProperties(String baseUrl) {

    private static final String DEFAULT_BASE_URL = "https://b204.ssafy.io";

    public String baseUrl() {
        return baseUrl == null || baseUrl.isBlank() ? DEFAULT_BASE_URL : baseUrl;
    }

    /** 공개 검증 페이지(V-01) — 관객 상세 화면이 유일하게 노출하는 체인 접점이다. */
    public String verificationUrl(Long performanceId) {
        return baseUrl() + "/verify/" + performanceId;
    }

    /** 검표 페이지(API-performance-10). 토큰은 쿼리가 아니라 헤더로 쓰는 것이 기본이다. */
    public String entryUrl(Long performanceId) {
        return baseUrl() + "/entry/" + performanceId;
    }

    /**
     * 업로드 이미지의 공개 URL — <b>상대 경로를 절대 URL로 바꾸는 유일한 지점</b>이다.
     *
     * <p>DB({@code performance.poster_image_path}·{@code ticket_image_path},
     * {@code file.storage_path})에는 저장 루트 기준 <b>상대 경로</b>만 넣는다. 절대 URL을 넣으면
     * 도메인이 바뀔 때 저장된 행이 전부 깨진다. 조립 규칙은 인프라 계약대로
     * {@code {APP_BASE_URL}/uploads/{상대경로}}다.
     *
     * <p><b>하위호환 분기</b> — 업로드 기능 이전에 만들어진 행의 {@code poster_image_path}에는
     * 공연자가 직접 입력한 외부 절대 URL({@code http://}·{@code https://})이 들어 있을 수 있다
     * (0층은 URL 입력이었다 · 포스터 업로드 계획 v1 §1). 그런 값은 그대로 내보낸다 — 앞에
     * 베이스를 덧붙이면 {@code https://b204.../uploads/https://cdn...}이 되어 이미지가 깨진다.
     *
     * <p><b>{@code /api/}로 시작하는 값도 그대로 내보낸다.</b>
     * {@link com.ssafy.b204.performance.service.PerformanceMediaService}는 업로드 루트가 아니라
     * API({@code GET /api/v1/performances/{id}/media/poster})가 바이트를 서빙하므로
     * {@code poster_image_path}에 그 API 경로를 넣는다. 저장 루트 상대 경로로 보고 앞에
     * {@code /uploads/}를 끼우면 {@code {base}/uploads/api/v1/...}이 되어 전부 404다.
     */
    public String uploadUrl(String storagePath) {
        if (storagePath == null || storagePath.isBlank()) {
            return null;
        }
        if (storagePath.startsWith("http://") || storagePath.startsWith("https://")
                || storagePath.startsWith("/api/")) {
            return storagePath;
        }
        String relative = storagePath.replace('\\', '/');
        while (relative.startsWith("/")) {
            relative = relative.substring(1);
        }
        return baseUrl() + "/uploads/" + relative;
    }
}
