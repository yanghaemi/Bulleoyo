package com.ssafy.b204.common.config;

import java.nio.file.Path;
import java.nio.file.Paths;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 업로드 저장 루트 — 인프라 계약({@code _workspace/infra_uploads_2026-09-22.md}).
 *
 * <p>운영은 환경변수 {@code UPLOAD_DIR}(기본 {@code /app/uploads})이고, 그 디렉토리가 호스트에
 * 바인드 마운트돼 Nginx가 같은 파일을 {@code /uploads/}로 서빙한다. 그래서 <b>저장 루트가 곧
 * {@code /uploads/} 의 루트</b>다 — 하위 구조({@code p/{yyyyMM}/})는 백엔드가 정한다.
 *
 * <p><b>여기서 디렉토리를 만들지 않는다.</b> {@link ChainProperties}와 같은 철학이다 — 설정이
 * 비었거나 경로를 만들 수 없어도 기동은 막지 않고, 업로드 경로만 실패시킨다. 윈도 노트북에서
 * {@code bootRun}으로 띄우면 {@code /app/uploads}가 없는데, 그것 때문에 나머지 API를 개발하지
 * 못하면 안 된다(local 프로파일 기본값은 저장소 상대 경로 {@code ./uploads}다).
 * 실제 생성은 첫 업로드 때 {@code FileStorageService}가 한다.
 */
@ConfigurationProperties(prefix = "b204.upload")
public record UploadProperties(String dir) {

    private static final String DEFAULT_DIR = "./uploads";

    /**
     * 저장 루트의 절대·정규화 경로. 존재 여부는 보장하지 않는다.
     *
     * <p>정규화해 두는 이유는 경로 탈출 검사({@code root.resolve(rel).startsWith(root)})의
     * 기준이 되기 때문이다 — {@code ./uploads}처럼 {@code .}이 섞인 채로 비교하면 검사가 샌다.
     */
    public Path root() {
        String value = dir == null || dir.isBlank() ? DEFAULT_DIR : dir;
        return Paths.get(value).toAbsolutePath().normalize();
    }
}
