package com.ssafy.b204.performance.service;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceMedia;
import com.ssafy.b204.performance.repository.PerformanceMediaRepository;
import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class PerformanceMediaService {

    private static final long MAX_FILE_BYTES = 5L * 1024 * 1024;
    private static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png", "image/webp");

    private final PerformanceService performanceService;
    private final PerformanceMediaRepository mediaRepository;

    public enum Kind {
        POSTER("poster"), TICKET_ARTWORK("ticket-artwork");

        private final String path;

        Kind(String path) {
            this.path = path;
        }

        public String path() {
            return path;
        }

        public static Kind parse(String value) {
            for (Kind kind : values()) if (kind.path.equals(value)) return kind;
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED, "지원하지 않는 이미지 종류입니다.");
        }
    }

    public record SavedMedia(String imageUrl) {
    }

    public record MediaFile(String contentType, byte[] data) {
    }

    @Transactional
    public SavedMedia upload(MemberPrincipal principal, Long performanceId, String rawKind,
                             MultipartFile file) {
        Member member = performanceService.requireMember(principal);
        Performance performance = performanceService.requireOwnedPerformance(performanceId, member);
        if (!performance.isModifiable()) {
            if (performance.isOnSaleOrLater()) {
                throw BusinessException.of(ErrorCode.PERFORMANCE_ALREADY_ON_SALE);
            }
            throw BusinessException.of(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }

        Kind kind = Kind.parse(rawKind);
        String contentType = file == null ? null : file.getContentType();
        if (file == null || file.isEmpty() || file.getSize() > MAX_FILE_BYTES
                || contentType == null
                || !ALLOWED_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "JPEG, PNG, WebP 형식의 5MB 이하 이미지를 선택해 주세요.");
        }

        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException exception) {
            throw BusinessException.of(ErrorCode.COMMON_INTERNAL_ERROR);
        }

        PerformanceMedia media = mediaRepository.findById(performanceId)
                .orElseGet(() -> new PerformanceMedia(performance));
        if (kind == Kind.POSTER) {
            media.replacePoster(contentType, data);
            // ticketImagePath 는 건드리지 않는다 — 티켓 아트워크는 performance_media 에서
            // 바로 서빙한다(GET .../media/ticket-artwork). 인자 하나가 늘어난 것은
            // V12 file 업로드가 performance.ticket_image_path 를 더했기 때문이다.
            performance.edit(null, null, mediaUrl(performanceId, kind), null, null, null);
        } else {
            media.replaceTicketArtwork(contentType, data);
        }
        mediaRepository.save(media);
        return new SavedMedia(mediaUrl(performanceId, kind));
    }

    @Transactional(readOnly = true)
    public MediaFile read(Long performanceId, String rawKind) {
        Kind kind = Kind.parse(rawKind);
        PerformanceMedia media = mediaRepository.findById(performanceId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.PERFORMANCE_NOT_FOUND));
        String contentType = kind == Kind.POSTER
                ? media.getPosterContentType() : media.getTicketArtworkContentType();
        byte[] data = kind == Kind.POSTER ? media.getPosterData() : media.getTicketArtworkData();
        if (contentType == null || data == null || data.length == 0) {
            throw BusinessException.of(ErrorCode.PERFORMANCE_NOT_FOUND);
        }
        return new MediaFile(contentType, data);
    }

    public static String mediaUrl(Long performanceId, Kind kind) {
        return "/api/v1/performances/" + performanceId + "/media/" + kind.path();
    }
}
