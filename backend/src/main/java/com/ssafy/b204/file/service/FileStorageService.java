package com.ssafy.b204.file.service;

import com.ssafy.b204.common.config.AppProperties;
import com.ssafy.b204.common.config.UploadProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.file.dto.FileDtos.FileUploadResponse;
import com.ssafy.b204.file.entity.UploadedFile;
import com.ssafy.b204.file.repository.UploadedFileRepository;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * 이미지 업로드·바인딩·정리 — {@code POST /api/v1/files} + 공연 생성·수정의 {@code uploadId} 해석.
 *
 * <p><b>클라이언트가 보낸 것을 믿지 않는다.</b> {@code Content-Type}도 확장자도 검사에 쓰지
 * 않고, 파일 <b>시그니처(매직 바이트)</b>로 타입을 판정한 뒤 저장 확장자를 거기서 파생한다.
 * GIF 내용을 {@code .png}·{@code image/png}로 위장해 올리면 400이다. Nginx는 업로드 디렉토리에서
 * {@code .html}·{@code .svg} 따위를 404로 끊지만(인프라 계약) 그것은 마지막 문이고, 실행 가능한
 * 콘텐츠가 같은 오리진에 저장되지 않게 하는 첫 문이 여기다.
 *
 * <p><b>디스크에 썼다가 지우지 않는다.</b> 크기·시그니처·해상도를 전부 메모리에서 끝낸 뒤
 * 마지막에 한 번 쓴다. 상한이 5MB라 바이트 배열로 들고 있어도 된다.
 *
 * <p>저장 경로는 {@code p/{yyyyMM}/{uuid}.{ext}}(루트 기준 상대)다. <b>파일명은 반드시 uuid</b> —
 * Nginx가 {@code Cache-Control: immutable}로 영구 캐시하므로 같은 이름으로 내용을 바꾸면 갱신되지
 * 않는다. 월 단위 디렉토리는 한 디렉토리에 파일이 무한히 쌓이는 것을 막는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileStorageService {

    /** 앱 상한 5MB. Nginx 본문 상한 10MB 안쪽이라 이 판정이 앱까지 도달한다(인프라 계약). */
    static final long MAX_BYTES = 5L * 1024 * 1024;

    /**
     * 최소 해상도. <b>가로세로 비율은 검사하지 않는다</b> — 프론트가 잘라서 올린다.
     *
     * <p>포스터 600×800은 프론트 포스터 카드의 3:4 비율에서 세로 800px을 기준으로 잡은 값이고,
     * 티켓 아트워크 1000×400은 티켓 편집기의 5:2 영역 기준이다. 이보다 작은 원본을 늘리면
     * 발급 티켓·공연 카드가 눈에 띄게 뭉갠다.
     */
    static final int POSTER_MIN_WIDTH = 600;
    static final int POSTER_MIN_HEIGHT = 800;
    static final int TICKET_MIN_WIDTH = 1000;
    static final int TICKET_MIN_HEIGHT = 400;

    /** TEMP 유효기간. 이 시간이 지나도록 공연에 매이지 않으면 행·파일을 함께 지운다. */
    static final Duration TEMP_TTL = Duration.ofHours(24);

    /** 한 번의 정리 배치 상한. 밀린 환경에서 한 트랜잭션이 테이블을 오래 쥐지 않게 한다. */
    private static final int CLEANUP_BATCH = 500;

    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyyMM");

    private final UploadedFileRepository fileRepository;
    private final MemberRepository memberRepository;
    private final UploadProperties uploadProperties;
    private final AppProperties appProperties;

    // ================================================================ 업로드

    /**
     * 업로드. 검증 순서는 <b>싼 것부터</b>다 — 크기 → 시그니처 → 해상도.
     *
     * <p>각 실패마다 전용 코드를 준다. 화면이 할 행동이 다르기 때문이다(줄여서 다시 · 다른
     * 파일로 · 더 큰 원본으로).
     */
    @Transactional
    public FileUploadResponse upload(MemberPrincipal me, MultipartFile file, String purposeValue) {
        Member owner = requireMember(me);
        UploadedFile.Purpose purpose = parsePurpose(purposeValue);

        if (file == null || file.isEmpty()) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("이미지를 선택해 주세요.");
        }
        // 1) 크기 — 디스크를 건드리기 전에 끝낸다.
        if (file.getSize() > MAX_BYTES) {
            throw ErrorCode.FILE_TOO_LARGE.toException();
        }

        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException e) {
            log.warn("업로드 본문을 읽지 못했다: {}", e.toString());
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        // getBytes() 이후 한 번 더 본다. getSize()는 헤더 기반이라 어긋날 수 있다.
        if (content.length > MAX_BYTES) {
            throw ErrorCode.FILE_TOO_LARGE.toException();
        }

        // 2) 시그니처 — Content-Type·확장자는 보지 않는다.
        ImageType type = ImageType.detect(content);
        if (type == null) {
            throw ErrorCode.FILE_TYPE_NOT_ALLOWED.toException();
        }

        // 3) 해상도 — 읽지 못하면(시그니처만 맞고 본문이 깨진 파일) 타입 거부와 같은 답이다.
        int[] size = ImageType.readSize(type, content);
        if (size == null) {
            throw ErrorCode.FILE_TYPE_NOT_ALLOWED.toException();
        }
        requireMinimumResolution(purpose, size[0], size[1]);

        String relativePath = "p/" + LocalDateTime.now(TimeSupport.STORAGE_ZONE).format(MONTH)
                + "/" + UUID.randomUUID() + "." + type.extension();
        write(relativePath, content);

        // 파일을 쓴 뒤 실패하면 직접 지운다. 트랜잭션이 롤백돼 행이 남지 않으면 sweep 도 이
        // 파일을 영영 못 찾는다(정리 기준이 file 행이다) — 고아가 디스크에 눌러앉는다.
        try {
            UploadedFile saved = fileRepository.save(UploadedFile.builder()
                    .uploadId(UUID.randomUUID().toString())
                    .ownerMember(owner)
                    .purpose(purpose)
                    .storagePath(relativePath)
                    .contentType(type.mimeType())
                    .bytes((long) content.length)
                    .width(size[0])
                    .height(size[1])
                    .build());

            return new FileUploadResponse(
                    saved.getUploadId(),
                    appProperties.uploadUrl(saved.getStoragePath()),
                    saved.getWidth(),
                    saved.getHeight(),
                    saved.getBytes(),
                    saved.getContentType(),
                    saved.getPurpose().name(),
                    TimeSupport.toOffset(saved.getCreatedAt().plus(TEMP_TTL), owner.getTimezone()));
        } catch (RuntimeException e) {
            // ponytail: 커밋 시점(플러시 지연) 실패까지는 못 잡는다. 필요해지면
            // TransactionSynchronization.afterCompletion(ROLLBACK) 으로 올린다.
            deleteQuietly(relativePath);
            throw e;
        }
    }

    // ================================================================ 바인딩

    /**
     * {@code uploadId} → 저장 경로. 공연 생성·수정이 부른다.
     *
     * <p>{@code uploadId}가 {@code null}이면 {@code null}을 돌려준다 — PATCH 규약상 "건드리지
     * 않음"이고, 생성에서는 이미지 없이 만드는 것이 정상이다.
     *
     * <p><b>없는 id와 남의 id를 가르지 않는다</b>({@code FILE_NOT_FOUND} 404). 403으로 답하면
     * "그 id는 존재한다"를 알려 주는 셈이다.
     *
     * @param currentPath 지금 그 자리에 들어 있는 경로. 같은 공연에 다시 저장하는 경우
     *                    ({@code BOUND}인데 경로가 그대로)를 허용하기 위한 값이다. 생성이면 {@code null}.
     */
    @Transactional
    public String bind(Long memberId, String uploadId, UploadedFile.Purpose purpose,
                       String currentPath) {
        if (uploadId == null || uploadId.isBlank()) {
            return null;
        }
        UploadedFile file = fileRepository.findByUploadId(uploadId)
                .orElseThrow(ErrorCode.FILE_NOT_FOUND::toException);
        if (!file.isOwnedBy(memberId)) {
            throw ErrorCode.FILE_NOT_FOUND.toException();
        }
        if (file.getPurpose() != purpose) {
            throw ErrorCode.FILE_PURPOSE_MISMATCH.toException();
        }
        // 이미 매인 파일은 "같은 자리에 그대로 다시 저장"만 허용한다. 공연 id를 따로 들고 있지
        // 않고 경로 일치로 판정하는데, 지금 이 자리에 이 파일이 있다는 것이 곧 같은 공연이라는
        // 뜻이다(경로는 uuid라 공연끼리 겹치지 않는다).
        if (file.isBound() && !file.getStoragePath().equals(currentPath)) {
            throw ErrorCode.FILE_ALREADY_BOUND.toException();
        }
        file.markBound();
        return file.getStoragePath();
    }

    // ================================================================ 정리

    /**
     * 만료된 {@code TEMP} 정리 — DB 행과 디스크 파일을 <b>둘 다</b> 지운다.
     *
     * <p>포스터 업로드 계획 v1 §6의 "고아 파일(업로드 후 공연 미저장) 방치" 한계를 이 메서드가
     * 해소한다.
     *
     * <p><b>{@code BOUND}는 건드리지 않는다.</b> 공연 수정으로 이미지가 교체돼 참조가 끊긴 행도
     * 마찬가지다 — 롤백·감사 흔적이라 디스크에서도 지우지 않는다. 디스크가 정말 모자라면 사람이
     * 판단해서 지우는 편이 낫다(런북 {@code du -sh ~/app/uploads}).
     *
     * <p>파일 삭제 실패는 로그만 남기고 다음 건으로 간다. 한 파일 때문에 배치 전체가 멈추면
     * 그 뒤의 모든 만료 파일이 영원히 남는다.
     *
     * @return 지운 행 수
     */
    @Transactional
    public int sweepExpiredTemp() {
        LocalDateTime cutoff = TimeSupport.nowStored().minus(TEMP_TTL);
        List<UploadedFile> expired = fileRepository.findByStatusAndCreatedAtBefore(
                UploadedFile.Status.TEMP, cutoff, PageRequest.of(0, CLEANUP_BATCH));
        for (UploadedFile file : expired) {
            deleteQuietly(file.getStoragePath());
        }
        fileRepository.deleteAll(expired);
        if (!expired.isEmpty()) {
            log.info("만료된 임시 업로드 {}건을 정리했다", expired.size());
        }
        return expired.size();
    }

    // ================================================================ 디스크

    /**
     * 저장 루트 안쪽으로 정규화한 절대 경로.
     *
     * <p><b>경로 탈출 방어</b> — {@code storage_path}에 {@code ..}이 섞여 있으면 루트 밖 파일을
     * 읽거나 지울 수 있다. 저장·삭제 모두 이 메서드를 거친다. 루트가 아직 없을 수 있어
     * {@code toRealPath()}(존재를 요구한다)가 아니라 {@code normalize()}로 비교한다 —
     * {@link UploadProperties#root()}가 이미 절대·정규화 경로를 준다.
     */
    private Path resolveInsideRoot(String relativePath) {
        Path root = uploadProperties.root();
        Path resolved = root.resolve(relativePath).normalize();
        if (!resolved.startsWith(root)) {
            log.warn("저장 루트를 벗어나는 경로를 거부했다: {}", relativePath);
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        return resolved;
    }

    private void write(String relativePath, byte[] content) {
        Path target = resolveInsideRoot(relativePath);
        try {
            // 루트 생성을 기동 시점이 아니라 여기서 한다 — UPLOAD_DIR 가 없다고 앱이 죽으면
            // 윈도 노트북에서 나머지 API 를 개발할 수 없다(ChainProperties 와 같은 철학).
            Files.createDirectories(target.getParent());
            Files.write(target, content);
        } catch (IOException e) {
            log.error("업로드 파일 저장 실패 ({}): {}", relativePath, e.toString());
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
    }

    private void deleteQuietly(String relativePath) {
        try {
            Files.deleteIfExists(resolveInsideRoot(relativePath));
        } catch (IOException | BusinessException e) {
            log.warn("업로드 파일 삭제 실패 ({}) — 행은 지우고 넘어간다: {}", relativePath, e.toString());
        }
    }

    // ================================================================ 검증 helpers

    private Member requireMember(MemberPrincipal me) {
        if (me == null) {
            throw ErrorCode.COMMON_UNAUTHORIZED.toException();
        }
        // 토큰은 유효한데 회원 행이 없다 = 재발급해도 같은 결과다. 즉시 재로그인으로 보내야 하므로
        // AUTH_TOKEN_INVALID 다 — me == null(미인증, 재발급 1회 시도)과 갈라야 한다.
        // 다른 다섯 서비스와 같은 규약이며 RequireMemberContractTest 가 소스를 읽어 지킨다.
        return memberRepository.findById(me.memberId())
                .orElseThrow(ErrorCode.AUTH_TOKEN_INVALID::toException);
    }

    private static UploadedFile.Purpose parsePurpose(String value) {
        if (value == null || value.isBlank()) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("이미지 용도를 지정해 주세요.");
        }
        try {
            return UploadedFile.Purpose.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ErrorCode.FILE_PURPOSE_MISMATCH.toException();
        }
    }

    private static void requireMinimumResolution(UploadedFile.Purpose purpose, int width, int height) {
        int minWidth = purpose == UploadedFile.Purpose.POSTER ? POSTER_MIN_WIDTH : TICKET_MIN_WIDTH;
        int minHeight = purpose == UploadedFile.Purpose.POSTER ? POSTER_MIN_HEIGHT : TICKET_MIN_HEIGHT;
        if (width < minWidth || height < minHeight) {
            throw ErrorCode.FILE_RESOLUTION_TOO_SMALL.toException(
                    "이미지 해상도는 최소 " + minWidth + "×" + minHeight + " 이어야 합니다.");
        }
    }

    // ================================================================ 시그니처·해상도

    /**
     * 허용 이미지 타입과 그 판정·크기 읽기.
     *
     * <p>{@code ImageIO.read()}를 쓰지 않는다. 두 가지 이유다.
     *
     * <ul>
     *   <li><b>메모리</b> — {@code read()}는 픽셀을 전부 디코딩한다. 5MB JPEG가 10000×10000이면
     *       힙에 400MB가 잡힌다. {@link ImageReader#getWidth(int)}는 헤더만 읽는다.
     *   <li><b>webp</b> — JDK 기본 {@code ImageIO}에는 webp 리더가 <b>없다</b>. {@code read()}는
     *       정상 webp에도 {@code null}을 돌려주므로 "null이면 거부" 규칙을 그대로 쓰면 허용하기로
     *       한 형식이 전부 400이 된다. 그래서 webp만 RIFF 컨테이너를 직접 읽는다.
     * </ul>
     */
    enum ImageType {
        JPEG("image/jpeg", "jpg"),
        PNG("image/png", "png"),
        WEBP("image/webp", "webp");

        private final String mimeType;
        private final String extension;

        ImageType(String mimeType, String extension) {
            this.mimeType = mimeType;
            this.extension = extension;
        }

        String mimeType() {
            return mimeType;
        }

        String extension() {
            return extension;
        }

        /** 매직 바이트 판정. 아니면 {@code null}. */
        static ImageType detect(byte[] b) {
            if (b.length >= 3 && u(b[0]) == 0xFF && u(b[1]) == 0xD8 && u(b[2]) == 0xFF) {
                return JPEG;
            }
            if (b.length >= 8 && u(b[0]) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                    && u(b[4]) == 0x0D && u(b[5]) == 0x0A && u(b[6]) == 0x1A && u(b[7]) == 0x0A) {
                return PNG;
            }
            // webp 는 RIFF 컨테이너다. "RIFF"만 보면 wav·avi 도 통과하므로 8~11의 "WEBP"까지 본다.
            if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                    && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
                return WEBP;
            }
            return null;
        }

        /** {@code [width, height]}. 본문이 깨져 읽을 수 없으면 {@code null}. */
        static int[] readSize(ImageType type, byte[] content) {
            return type == WEBP ? webpSize(content) : imageIoSize(content);
        }

        private static int[] imageIoSize(byte[] content) {
            try (ImageInputStream in = ImageIO.createImageInputStream(
                    new ByteArrayInputStream(content))) {
                if (in == null) {
                    return null;
                }
                Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
                if (!readers.hasNext()) {
                    return null;
                }
                ImageReader reader = readers.next();
                try {
                    reader.setInput(in);
                    return new int[]{reader.getWidth(0), reader.getHeight(0)};
                } finally {
                    reader.dispose();
                }
            } catch (IOException | RuntimeException e) {
                // 깨진 헤더는 IIOException 말고도 여러 런타임 예외로 나온다(배열 범위 등).
                return null;
            }
        }

        /**
         * webp 크기 — 세 가지 하위 형식을 모두 봐야 한다(오프셋 12의 FourCC).
         *
         * <ul>
         *   <li>{@code VP8X}(확장) — 24부터 3바이트 LE 씩 {@code canvasWidth-1}·{@code canvasHeight-1}
         *   <li>{@code VP8 }(손실) — 23~25가 sync code {@code 9D 01 2A}, 26부터 2바이트 LE 씩 14비트
         *   <li>{@code VP8L}(무손실) — 20이 {@code 0x2F}, 21부터 4바이트에 14비트씩 {@code -1} 값
         * </ul>
         */
        private static int[] webpSize(byte[] b) {
            if (b.length < 30) {
                return null;
            }
            String fourCc = new String(b, 12, 4, java.nio.charset.StandardCharsets.US_ASCII);
            switch (fourCc) {
                case "VP8X" -> {
                    int width = 1 + (u(b[24]) | u(b[25]) << 8 | u(b[26]) << 16);
                    int height = 1 + (u(b[27]) | u(b[28]) << 8 | u(b[29]) << 16);
                    return new int[]{width, height};
                }
                case "VP8 " -> {
                    if (u(b[23]) != 0x9D || u(b[24]) != 0x01 || u(b[25]) != 0x2A) {
                        return null;
                    }
                    int width = (u(b[26]) | u(b[27]) << 8) & 0x3FFF;
                    int height = (u(b[28]) | u(b[29]) << 8) & 0x3FFF;
                    return new int[]{width, height};
                }
                case "VP8L" -> {
                    if (u(b[20]) != 0x2F) {
                        return null;
                    }
                    int bits = u(b[21]) | u(b[22]) << 8 | u(b[23]) << 16 | u(b[24]) << 24;
                    return new int[]{(bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1};
                }
                default -> {
                    return null;
                }
            }
        }

        private static int u(byte value) {
            return value & 0xFF;
        }
    }
}
