package com.ssafy.b204.file.dto;

import java.time.OffsetDateTime;

/**
 * file 도메인 DTO — {@code POST /api/v1/files}. 접두 {@code FILE_*}.
 *
 * <p>API v6에는 이 절이 없다(포스터 업로드 계획 v1이 1층으로 미뤘다). API v7 신설 대상이다.
 *
 * <p>요청은 multipart라 record가 없다 — 필드는 {@code file}(필수)·{@code purpose}(필수)다.
 */
public final class FileDtos {

    private FileDtos() {
    }

    /**
     * 업로드 결과.
     *
     * <p>{@code uploadId}가 <b>공연 생성·수정에 넣는 값</b>이고 {@code url}은 미리보기 전용이다.
     * URL을 공연 요청에 넣을 수 없게 한 것이 이 설계의 목적이다 — 클라이언트가 임의로 만든
     * 문자열이 {@code poster_image_path}에 그대로 들어가면 서버가 "이 이미지는 이 회원이 올린
     * 것"을 증명할 수 없다.
     *
     * <p>{@code expiresAt}은 <b>바인딩하지 않았을 때</b> 이 업로드가 정리되는 시각이다(업로드 +
     * 24시간). 공연에 매이면 만료가 사라지므로 화면은 그 전에 저장을 끝내야 한다.
     */
    public record FileUploadResponse(
            String uploadId,
            String url,
            Integer width,
            Integer height,
            Long bytes,
            String contentType,
            String purpose,
            OffsetDateTime expiresAt
    ) {}
}
