package com.ssafy.b204.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.file.entity.UploadedFile;
import com.ssafy.b204.file.repository.UploadedFileRepository;
import com.ssafy.b204.file.service.FileStorageService;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.dto.PerformanceDtos.CreatePerformanceRequest;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.support.Bearer;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 이미지 업로드 — {@code POST /api/v1/files}와 공연 생성·수정의 {@code uploadId} 바인딩.
 *
 * <p>저장 루트는 <b>임시 디렉토리</b>다 — {@code IntegrationTestBase#UPLOAD_ROOT}가 전 테스트 공용으로
 * 주입한다(클래스별 {@code @DynamicPropertySource}는 컨텍스트를 가른다 — S15P21B204-182).
 *
 * <p>업로드 검증은 HTTP 경계 너머에서 본다(코드·status가 프론트 계약이다). 바인딩 4xx는 서비스를
 * 직접 부른다 — 공연 생성은 지갑·팀 선행 조건이 있어 HTTP로 왕복할 이유가 없다.
 */
@AutoConfigureMockMvc
class FileUploadApiTest extends IntegrationTestBase {

    /** 저장 루트의 부모 — "루트 밖"을 안전하게 만들 자리다. */
    private static final Path TEMP_PARENT = UPLOAD_ROOT.getParent();

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired JwtTokenProvider tokens;
    @Autowired MemberRepository memberRepository;
    @Autowired TeamRepository teamRepository;
    @Autowired WalletRepository walletRepository;
    @Autowired PerformanceRepository performanceRepository;
    @Autowired PerformanceService performanceService;
    @Autowired FileStorageService fileStorageService;
    @Autowired UploadedFileRepository fileRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    // ================================================================ 업로드 검증

    @Test
    @DisplayName("5MB 를 넘으면 413 FILE_TOO_LARGE — 디스크에 쓰지 않는다")
    void rejectsOversizedUpload() throws Exception {
        Member me = member();
        byte[] sixMegabytes = new byte[6 * 1024 * 1024];
        // 앞머리를 정상 PNG 시그니처로 채워도 크기 검사가 먼저다.
        System.arraycopy(png(600, 800), 0, sixMegabytes, 0, 8);
        // 루트는 같은 클래스의 다른 테스트가 쓴 파일을 이미 갖고 있다 — 절대 개수가 아니라
        // "이 요청이 파일을 늘리지 않았다"를 본다.
        long before = storedFileCount();

        mockMvc.perform(multipart("/api/v1/files")
                        .file(new MockMultipartFile("file", "big.png",
                                MediaType.IMAGE_PNG_VALUE, sixMegabytes))
                        .param("purpose", "POSTER")
                        .with(Bearer.of(tokens, me)))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("FILE_TOO_LARGE"));

        assertThat(storedFileCount()).isEqualTo(before);
    }

    @Test
    @DisplayName("GIF 내용을 .png 이름·image/png 로 위장해도 400 FILE_TYPE_NOT_ALLOWED — 시그니처로 판정한다")
    void rejectsDisguisedContentType() throws Exception {
        Member me = member();

        mockMvc.perform(multipart("/api/v1/files")
                        .file(new MockMultipartFile("file", "poster.png",
                                MediaType.IMAGE_PNG_VALUE, image(600, 800, "gif")))
                        .param("purpose", "POSTER")
                        .with(Bearer.of(tokens, me)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FILE_TYPE_NOT_ALLOWED"));
    }

    @Test
    @DisplayName("해상도가 최소치 미만이면 400 FILE_RESOLUTION_TOO_SMALL")
    void rejectsSmallImage() throws Exception {
        Member me = member();

        mockMvc.perform(multipart("/api/v1/files")
                        .file(new MockMultipartFile("file", "poster.png",
                                MediaType.IMAGE_PNG_VALUE, png(300, 400)))
                        .param("purpose", "POSTER")
                        .with(Bearer.of(tokens, me)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FILE_RESOLUTION_TOO_SMALL"));

        // 같은 파일이라도 티켓 아트워크 최소치(1000×400)는 다른 답을 준다.
        mockMvc.perform(multipart("/api/v1/files")
                        .file(new MockMultipartFile("file", "ticket.png",
                                MediaType.IMAGE_PNG_VALUE, png(1200, 480)))
                        .param("purpose", "TICKET_ARTWORK")
                        .with(Bearer.of(tokens, me)))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("정상 png 는 201 — url 이 {APP_BASE_URL}/uploads/p/ 로 시작하고 저장 파일명이 uuid 다")
    void storesValidPngUnderUuidName() throws Exception {
        Member me = member();

        String body = mockMvc.perform(multipart("/api/v1/files")
                        .file(new MockMultipartFile("file", "내 포스터.PNG",
                                MediaType.IMAGE_JPEG_VALUE, png(600, 800)))
                        .param("purpose", "POSTER")
                        .with(Bearer.of(tokens, me)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.width").value(600))
                .andExpect(jsonPath("$.data.height").value(800))
                .andExpect(jsonPath("$.data.purpose").value("POSTER"))
                // 클라이언트가 image/jpeg 라고 보냈지만 시그니처가 정본이다.
                .andExpect(jsonPath("$.data.contentType").value("image/png"))
                .andReturn().getResponse().getContentAsString();

        JsonNode data = objectMapper.readTree(body).get("data");
        assertThat(data.get("url").asText()).startsWith("https://b204.ssafy.io/uploads/p/");
        assertThat(data.get("expiresAt").asText()).isNotBlank();

        UploadedFile saved = fileRepository.findByUploadId(data.get("uploadId").asText())
                .orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(UploadedFile.Status.TEMP);
        assertThat(saved.getStoragePath()).matches("p/\\d{6}/[0-9a-f\\-]{36}\\.png");
        // 업로드한 이름·확장자는 저장에 쓰이지 않는다(영구 캐시라 이름이 겹치면 안 된다).
        assertThat(saved.getStoragePath()).doesNotContain("내 포스터");
        assertThat(Files.exists(UPLOAD_ROOT.resolve(saved.getStoragePath()))).isTrue();
        // uploadId 는 PK 가 아니다 — 훑을 수 없어야 한다.
        assertThat(data.get("uploadId").asText()).isNotEqualTo(String.valueOf(saved.getFileId()));
    }

    // ================================================================ 바인딩

    @Test
    @DisplayName("남의 uploadId 로 공연을 만들면 404 FILE_NOT_FOUND — 403 이 아니다(존재를 숨긴다)")
    void rejectsOthersUploadId() {
        Member owner = member();
        Member other = member();
        String uploadId = upload(owner, UploadedFile.Purpose.POSTER, 600, 800);

        assertThatThrownBy(() -> performanceService.create(principal(other),
                createRequest(team(other).getTeamId(), uploadId, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FILE_NOT_FOUND);
    }

    @Test
    @DisplayName("용도가 뒤바뀌면 400 FILE_PURPOSE_MISMATCH")
    void rejectsPurposeMismatch() {
        Member me = member();
        String ticketArtwork = upload(me, UploadedFile.Purpose.TICKET_ARTWORK, 1200, 480);

        assertThatThrownBy(() -> performanceService.create(principal(me),
                createRequest(team(me).getTeamId(), ticketArtwork, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FILE_PURPOSE_MISMATCH);
    }

    @Test
    @DisplayName("다른 공연에 이미 묶인 uploadId 는 409 FILE_ALREADY_BOUND — 같은 공연 재저장은 허용")
    void rejectsReuseAcrossPerformances() {
        Member me = member();
        Long teamId = team(me).getTeamId();
        String uploadId = upload(me, UploadedFile.Purpose.POSTER, 600, 800);

        Long performanceId = performanceService
                .create(principal(me), createRequest(teamId, uploadId, null)).performanceId();
        Performance bound = performanceRepository.findById(performanceId).orElseThrow();
        assertThat(bound.getPosterImagePath()).startsWith("p/");
        assertThat(fileRepository.findByUploadId(uploadId).orElseThrow().getStatus())
                .isEqualTo(UploadedFile.Status.BOUND);

        assertThatThrownBy(() -> performanceService.create(principal(me),
                createRequest(teamId, uploadId, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FILE_ALREADY_BOUND);

        // 같은 공연에 같은 이미지를 다시 저장하는 것(수정 저장 재시도)은 통과해야 한다.
        assertThat(fileStorageService.bind(me.getMemberId(), uploadId,
                UploadedFile.Purpose.POSTER, bound.getPosterImagePath()))
                .isEqualTo(bound.getPosterImagePath());
    }

    // ================================================================ 정리·경로 탈출

    @Test
    @DisplayName("만료된 TEMP 는 DB 행과 디스크 파일이 둘 다 사라진다 — BOUND 는 남는다")
    void sweepDeletesExpiredTempRowAndFile() {
        Member me = member();
        String expiring = upload(me, UploadedFile.Purpose.POSTER, 600, 800);
        String keeping = upload(me, UploadedFile.Purpose.POSTER, 600, 800);
        Path expiringFile = UPLOAD_ROOT.resolve(
                fileRepository.findByUploadId(expiring).orElseThrow().getStoragePath());
        Path keepingFile = UPLOAD_ROOT.resolve(
                fileRepository.findByUploadId(keeping).orElseThrow().getStoragePath());
        // keeping 은 공연에 매였다고 치고 함께 늙힌다 — BOUND 는 만료 대상이 아니어야 한다.
        fileStorageService.bind(me.getMemberId(), keeping, UploadedFile.Purpose.POSTER, null);
        backdate(expiring);
        backdate(keeping);

        fileStorageService.sweepExpiredTemp();

        assertThat(fileRepository.findByUploadId(expiring)).isEmpty();
        assertThat(Files.exists(expiringFile)).isFalse();
        assertThat(fileRepository.findByUploadId(keeping)).isPresent();
        assertThat(Files.exists(keepingFile)).isTrue();
    }

    @Test
    @DisplayName("storage_path 에 .. 이 있어도 루트 밖 파일을 지우지 않는다")
    void sweepDoesNotEscapeRoot() throws Exception {
        Member me = member();
        Path outside = TEMP_PARENT.resolve("escape-" + UUID.randomUUID() + ".png");
        Files.write(outside, png(600, 800));
        String uploadId = UUID.randomUUID().toString();
        jdbcTemplate.update("INSERT INTO file (upload_id, owner_member_id, purpose, status, "
                        + "storage_path, created_at) VALUES (?, ?, 'POSTER', 'TEMP', ?, ?)",
                uploadId, me.getMemberId(), "../" + outside.getFileName(),
                LocalDateTime.now().minusDays(2));

        fileStorageService.sweepExpiredTemp();

        assertThat(Files.exists(outside))
                .as("루트 밖 파일이 지워졌다 — 경로 정규화 검사가 새고 있다")
                .isTrue();
        // 행은 지운다. 가리키는 곳이 루트 밖이면 그 파일은 우리 것이 아니다.
        assertThat(fileRepository.findByUploadId(uploadId)).isEmpty();
        Files.deleteIfExists(outside);
    }

    // ================================================================ 하위호환

    @Test
    @DisplayName("옛 행의 절대 URL poster_image_path 는 조회 응답에 그대로 나온다")
    void keepsLegacyAbsoluteUrl() {
        Member me = member();
        Performance performance = performanceRepository.save(Performance.builder()
                .title("옛 공연 " + UUID.randomUUID())
                .posterImagePath("https://cdn.example.com/legacy/12.png")
                .performanceAt(LocalDateTime.now().plusDays(10))
                .creatorTeam(team(me))
                .joint(false)
                .depositAmount(50_000L)
                .build());
        jdbcTemplate.update("UPDATE performance SET status = 'ON_SALE' WHERE performance_id = ?",
                performance.getPerformanceId());

        assertThat(performanceService.detail(performance.getPerformanceId(), null).posterImageUrl())
                .isEqualTo("https://cdn.example.com/legacy/12.png");
    }

    // ================================================================ helpers

    private long storedFileCount() throws IOException {
        if (!Files.exists(UPLOAD_ROOT)) {
            return 0;
        }
        try (var walk = Files.walk(UPLOAD_ROOT)) {
            return walk.filter(Files::isRegularFile).count();
        }
    }

    /** 서비스를 직접 불러 업로드하고 {@code uploadId}를 돌려준다. */
    private String upload(Member owner, UploadedFile.Purpose purpose, int width, int height) {
        return fileStorageService.upload(principal(owner),
                new MockMultipartFile("file", "x.png", MediaType.IMAGE_PNG_VALUE,
                        png(width, height)),
                purpose.name()).uploadId();
    }

    private void backdate(String uploadId) {
        jdbcTemplate.update("UPDATE file SET created_at = ? WHERE upload_id = ?",
                LocalDateTime.now().minusDays(2), uploadId);
    }

    private CreatePerformanceRequest createRequest(Long teamId, String posterUploadId,
                                                   String ticketUploadId) {
        OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(30).withNano(0);
        return new CreatePerformanceRequest(teamId, "업로드 테스트 공연", null, posterUploadId,
                ticketUploadId, "합정 언플러그드", "서울 마포구 양화로 000", startAt,
                startAt.plusHours(3), false);
    }

    private Member member() {
        Member member = memberRepository.save(Member.builder()
                .email("upload-" + UUID.randomUUID() + "@b204.test")
                .name("업로더")
                .authProvider(Member.AuthProvider.GOOGLE)
                .countryCode("KR")
                .build());
        walletRepository.save(Wallet.builder()
                .member(member)
                .provider(Wallet.Provider.WEB3AUTH)
                .address("0x" + UUID.randomUUID().toString().replace("-", "")
                        + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                .status(Wallet.Status.LINKED)
                .build());
        return member;
    }

    private Team team(Member leader) {
        return teamRepository.save(Team.builder()
                .name("팀-" + UUID.randomUUID())
                .leader(leader)
                .build());
    }

    private com.ssafy.b204.common.security.MemberPrincipal principal(Member member) {
        return com.ssafy.b204.common.security.MemberPrincipal.of(member.getMemberId(),
                member.getEmail(), member.isAdmin());
    }

    /** {@code w × h} 단색 PNG. 실제 디코더가 읽을 수 있는 진짜 이미지여야 한다. */
    private static byte[] png(int width, int height) {
        return image(width, height, "png");
    }

    private static byte[] image(int width, int height, String format) {
        try {
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, format, out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
