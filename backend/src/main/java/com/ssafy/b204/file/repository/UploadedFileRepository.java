package com.ssafy.b204.file.repository;

import com.ssafy.b204.file.entity.UploadedFile;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UploadedFileRepository extends JpaRepository<UploadedFile, Long> {

    /** 바인딩의 유일한 조회 경로. PK로는 찾지 않는다 — 클라이언트가 PK를 모른다. */
    Optional<UploadedFile> findByUploadId(String uploadId);

    /**
     * 만료된 {@code TEMP} 정리 대상. {@code idx_file_status_created}가 그대로 쓰인다.
     *
     * <p>{@link Pageable}로 한 번에 지우는 건수를 제한한다 — 오래 방치된 환경에서 수만 건이
     * 한 트랜잭션에 걸리면 배치가 락을 오래 쥔다.
     */
    List<UploadedFile> findByStatusAndCreatedAtBefore(UploadedFile.Status status,
                                                      LocalDateTime cutoff, Pageable pageable);
}
