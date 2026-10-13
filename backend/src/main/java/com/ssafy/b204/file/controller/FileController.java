package com.ssafy.b204.file.controller;

import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.file.dto.FileDtos.FileUploadResponse;
import com.ssafy.b204.file.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * file — 이미지 업로드(API v7 신설 대상). 접두 {@code FILE_*}.
 *
 * <p>인증 필수다. {@code SecurityConfig}의 {@code anyRequest().authenticated()}가 처리하므로
 * 여기에 규칙을 더하지 않는다.
 *
 * <p>응답의 {@code url}은 <b>미리보기 전용</b>이다. 공연 생성·수정에 넣는 값은
 * {@code uploadId}다 — 클라이언트가 만든 임의 URL이 {@code poster_image_path}에 그대로 들어가는
 * 경로를 없애는 것이 이 엔드포인트의 목적이다.
 */
@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService fileStorageService;

    /** 권한 MEMBER. 실패 코드는 {@code FILE_TOO_LARGE}·{@code FILE_TYPE_NOT_ALLOWED}·{@code FILE_RESOLUTION_TOO_SMALL}. */
    @PostMapping
    public ResponseEntity<ApiResponse<FileUploadResponse>> upload(
            @AuthenticationPrincipal MemberPrincipal me,
            @RequestParam("file") MultipartFile file,
            @RequestParam("purpose") String purpose) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(fileStorageService.upload(me, file, purpose),
                        "이미지를 업로드했습니다."));
    }
}
