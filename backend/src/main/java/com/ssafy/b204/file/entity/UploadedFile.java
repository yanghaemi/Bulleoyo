package com.ssafy.b204.file.entity;

import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 업로드 파일 — V10 {@code file}.
 *
 * <p>클래스명이 {@code File}이 아닌 이유는 {@link java.io.File}과 겹치기 때문이다. 테이블명은
 * ERD 관례대로 단수 {@code file}이다.
 *
 * <p><b>응답에는 {@link #uploadId}만 나간다.</b> PK({@code file_id})를 노출하면 1씩 더해 가며
 * 남의 업로드 존재 여부를 훑을 수 있다. {@code uploadId}는 UUID라 추측할 수 없다.
 *
 * <p>상태는 {@code TEMP} → {@code BOUND} 한 방향뿐이다. 되돌리는 메서드를 두지 않았다 —
 * 공연 수정으로 이미지가 교체돼도 옛 행은 {@code BOUND}로 남는다(정리 대상 아님).
 */
@Entity
@Table(name = "file")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UploadedFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "file_id")
    private Long fileId;

    /** 응답·바인딩 요청이 쓰는 공개 식별자(UUID). */
    @Column(name = "upload_id", nullable = false, length = 36, columnDefinition = "CHAR(36)")
    private String uploadId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_member_id", nullable = false)
    private Member ownerMember;

    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", nullable = false)
    private Purpose purpose;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    /** 저장 루트 기준 <b>상대</b> 경로. 절대 URL을 넣지 않는다. */
    @Column(name = "storage_path", nullable = false, length = 500)
    private String storagePath;

    /** 파일 시그니처로 판정한 MIME. 클라이언트가 보낸 {@code Content-Type}이 아니다. */
    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "bytes")
    private Long bytes;

    @Column(name = "width")
    private Integer width;

    @Column(name = "height")
    private Integer height;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "bound_at")
    private LocalDateTime boundAt;

    @Builder
    private UploadedFile(String uploadId, Member ownerMember, Purpose purpose, String storagePath,
                         String contentType, Long bytes, Integer width, Integer height) {
        this.uploadId = uploadId;
        this.ownerMember = ownerMember;
        this.purpose = purpose;
        this.storagePath = storagePath;
        this.contentType = contentType;
        this.bytes = bytes;
        this.width = width;
        this.height = height;
        this.status = Status.TEMP;
        this.createdAt = TimeSupport.nowStored();
    }

    /** 공연에 매였다. 이미 {@code BOUND}면 시각을 덮지 않는다(같은 공연 재저장). */
    public void markBound() {
        if (status == Status.TEMP) {
            this.status = Status.BOUND;
            this.boundAt = TimeSupport.nowStored();
        }
    }

    public boolean isOwnedBy(Long memberId) {
        return memberId != null && ownerMember.getMemberId().equals(memberId);
    }

    public boolean isBound() {
        return status == Status.BOUND;
    }

    /** 이미지가 쓰일 자리. */
    public enum Purpose {
        POSTER, TICKET_ARTWORK
    }

    /** {@code TEMP}는 24시간 뒤 행·파일 모두 삭제된다. {@code BOUND}는 지우지 않는다. */
    public enum Status {
        TEMP, BOUND
    }
}
