package com.ssafy.b204.performance.controller;

import com.ssafy.b204.chain.dto.ChainDtos.SignedTxRequest;
import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.performance.dto.PerformanceDtos.AcceptParticipationResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.CancelPerformanceRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.CancelPerformanceResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.CreatePerformanceRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.CreatePerformanceResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.DeletePerformanceResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.DepositPrepareResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.DepositSignedTxResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.EntryLinkResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.InviteParticipantRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.InviteParticipantResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.MyPerformancesResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.ParticipantRemovedResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.ParticipantsResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.PerformanceDetailResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.PerformanceListResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.SalesStatusResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.SetTicketTypesRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.SetTicketTypesResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.UpdatePerformanceRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.UpdatePerformanceResponse;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.performance.service.PerformanceMediaService;
import com.ssafy.b204.performance.service.PerformanceMediaService.MediaFile;
import com.ssafy.b204.performance.service.PerformanceMediaService.SavedMedia;
import jakarta.validation.Valid;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * performance — 공연 (API v6 §4, API-performance-01~14). 접두 {@code PERFORMANCE_*}.
 *
 * <p><b>공개 API 2개</b>({@code GET /performances}, {@code GET /performances/{id}})는
 * {@code Authorization} 헤더가 필요 없다(§0.1). 관객 화면이므로 주소·해시를 담지 않는다(P-22).
 *
 * <p>잠금({@code startSale}) 전에만 수정·티켓 옵션 설정·참여팀 제외가 가능하다.
 * 이후 시도는 {@code PERFORMANCE_ALREADY_ON_SALE}(409)다.
 *
 * <p>{@code /performances/me}가 {@code /performances/{performanceId}}보다 <b>먼저 선언돼야</b>
 * 한다고 걱정할 필요는 없다 — Spring은 리터럴 경로를 경로 변수보다 우선 매칭한다. 다만 읽는
 * 사람을 위해 선언 순서도 명세 순서(01~14)를 따랐다.
 */
@RestController
@RequestMapping("/api/v1/performances")
@RequiredArgsConstructor
public class PerformanceController {

    private final PerformanceService performanceService;
    private final PerformanceMediaService performanceMediaService;

    /** API-performance-01 · 권한 리더. 생성 직후 {@code nextAction = PAY_DEPOSIT}. */
    @PostMapping
    public ResponseEntity<ApiResponse<CreatePerformanceResponse>> create(
            @AuthenticationPrincipal MemberPrincipal me,
            @Valid @RequestBody CreatePerformanceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(performanceService.create(me, request),
                        "공연이 생성되었습니다. 보증금을 납부해 주세요."));
    }

    /** API-performance-02 · 권한 <b>GUEST</b>. 기본 정렬은 공연 일시 오름차순. */
    @GetMapping
    public ApiResponse<PerformanceListResponse> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate,
            @RequestParam(required = false) String status,
            Pageable pageable) {
        return ApiResponse.success(
                performanceService.list(keyword, fromDate, toDate, status, pageable));
    }

    /** API-performance-06 · 권한 PERFORMER. */
    @GetMapping("/me")
    public ApiResponse<MyPerformancesResponse> myPerformances(
            @AuthenticationPrincipal MemberPrincipal me,
            @RequestParam(required = false) String status,
            Pageable pageable) {
        return ApiResponse.success(performanceService.myPerformances(me, status, pageable));
    }

    /**
     * API-performance-03 · 권한 <b>GUEST</b>.
     *
     * <p>{@code Authorization}은 선택이다 — 있으면 {@code DRAFT}·{@code PENDING_AGREEMENT}
     * 공연을 관계자가 미리 볼 수 있고, 없으면 그 공연은 {@code PERFORMANCE_NOT_FOUND}로 숨는다.
     */
    @GetMapping("/{performanceId}")
    public ApiResponse<PerformanceDetailResponse> detail(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ApiResponse.success(performanceService.detail(performanceId, me));
    }

    /** API-performance-04 · 권한 생성자. 잠금 전만. 동의가 초기화될 수 있다. */
    @PatchMapping("/{performanceId}")
    public ApiResponse<UpdatePerformanceResponse> update(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @Valid @RequestBody UpdatePerformanceRequest request) {
        return ApiResponse.success(performanceService.update(me, performanceId, request));
    }

    /** API-performance-16 · 공연 포스터·티켓 아트워크 저장. 최종 5MB 이하 이미지만 받는다. */
    @PostMapping(value = "/{performanceId}/media/{kind}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<SavedMedia> uploadMedia(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @PathVariable String kind,
            @RequestParam("file") MultipartFile file) {
        return ApiResponse.success(performanceMediaService.upload(me, performanceId, kind, file));
    }

    /** API-performance-17 · 공개 공연·티켓 화면에서 직접 쓰는 이미지를 래퍼 없이 반환한다. */
    @GetMapping(value = "/{performanceId}/media/{kind}")
    public ResponseEntity<byte[]> media(
            @PathVariable Long performanceId,
            @PathVariable String kind) {
        MediaFile media = performanceMediaService.read(performanceId, kind);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noCache())
                .contentType(MediaType.parseMediaType(media.contentType()))
                .body(media.data());
    }

    /**
     * API-performance-18 공연 삭제(신설) · 권한 생성자. <b>규칙 동의 전</b>(DRAFT ·
     * PENDING_AGREEMENT)이고 보증금 미납인 공연만 지운다 — 판매가 열린 뒤는
     * {@code POST .../cancel}(API-performance-12)이 맡는다.
     *
     * <p>코드가 문서보다 먼저 나갔다(API-team-05 · API-performance-19와 같은 상황). API v7
     * 개정에서 §4에 이 번호로 합류한다.
     */
    @DeleteMapping("/{performanceId}")
    public ApiResponse<DeletePerformanceResponse> delete(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ApiResponse.success(performanceService.delete(me, performanceId),
                "공연을 삭제했습니다.");
    }

    /**
     * API-performance-15 · 권한 생성자. 티켓 옵션만 다시 읽는다.
     *
     * <p>응답은 {@link #setTicketTypes}(05)와 <b>같은 shape</b>다 — P-03 수정 화면이 저장 전후로
     * 같은 값을 쓴다. 옵션이 하나도 없으면 빈 배열이며 404가 아니다(공연 생성 직후가 그렇다).
     */
    @GetMapping("/{performanceId}/ticket-types")
    public ApiResponse<SetTicketTypesResponse> ticketTypes(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ApiResponse.success(performanceService.ticketTypes(me, performanceId));
    }

    /** API-performance-05 · 권한 생성자. {@code PUT}이라 통째로 교체한다. */
    @PutMapping("/{performanceId}/ticket-types")
    public ApiResponse<SetTicketTypesResponse> setTicketTypes(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @Valid @RequestBody SetTicketTypesRequest request) {
        return ApiResponse.success(performanceService.setTicketTypes(me, performanceId, request),
                "티켓 옵션이 저장되었습니다.");
    }

    /** API-performance-07 · 권한 생성자. */
    @PostMapping("/{performanceId}/participants")
    public ResponseEntity<ApiResponse<InviteParticipantResponse>> inviteParticipant(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @Valid @RequestBody InviteParticipantRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(
                        performanceService.inviteParticipant(me, performanceId, request),
                        "참여 초대를 보냈습니다."));
    }

    /**
     * API-performance-19 참여팀 조회(신설) · 권한 주최팀 리더 또는 참여팀 리더.
     * {@code INVITED} 팀까지 보여 주고 {@code REMOVED} 팀은 뺀다.
     */
    @GetMapping("/{performanceId}/participants")
    public ApiResponse<ParticipantsResponse> participants(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ApiResponse.success(performanceService.participants(me, performanceId));
    }

    /** API-performance-08 · 권한 초대팀 리더. 리더 지갑 주소를 스냅샷으로 굳힌다. */
    @PostMapping("/{performanceId}/participants/{teamId}/accept")
    public ApiResponse<AcceptParticipationResponse> acceptParticipation(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @PathVariable Long teamId) {
        return ApiResponse.success(
                performanceService.acceptParticipation(me, performanceId, teamId),
                "참여가 확정되었습니다. 정산 규칙 동의 서명을 진행해 주세요.");
    }

    /** API-performance-09 · 권한 생성자. 잠금 전만. */
    @DeleteMapping("/{performanceId}/participants/{teamId}")
    public ApiResponse<ParticipantRemovedResponse> removeParticipant(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @PathVariable Long teamId) {
        return ApiResponse.success(performanceService.removeParticipant(me, performanceId, teamId),
                "참여팀에서 제외했습니다.");
    }

    /** API-performance-10 · 권한 PERFORMER(참여팀). {@code rotate=true}면 재발급. */
    @GetMapping("/{performanceId}/entry-link")
    public ApiResponse<EntryLinkResponse> entryLink(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @RequestParam(required = false, defaultValue = "false") boolean rotate) {
        return ApiResponse.success(performanceService.entryLink(me, performanceId, rotate));
    }

    /** API-performance-11 · 권한 PERFORMER(참여팀). DB·온체인 카운터를 나란히 내려준다. */
    @GetMapping("/{performanceId}/sales")
    public ApiResponse<SalesStatusResponse> salesStatus(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ApiResponse.success(performanceService.salesStatus(me, performanceId));
    }

    /**
     * API-performance-12 · 권한 생성자. 202 + 폴링.
     *
     * <p>{@code Idempotency-Key}를 받는다(§0.8 필수) — 되돌릴 수 없는 일괄 환불이라 새로고침으로
     * 두 번 접수되면 안 된다. 없으면 400이고, 같은 키 재호출은 최초 {@code jobId}를 재생한다.
     */
    @PostMapping("/{performanceId}/cancel")
    public ResponseEntity<ApiResponse<CancelPerformanceResponse>> cancel(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CancelPerformanceRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.success(
                performanceService.cancel(me, performanceId, idempotencyKey, request)));
    }

    /** API-performance-13 · 권한 생성자(팀 리더). §0.4 {@code prepare} — 200. */
    @PostMapping("/{performanceId}/deposit/prepare")
    public ApiResponse<DepositPrepareResponse> depositPrepare(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId) {
        return ApiResponse.success(performanceService.depositPrepare(me, performanceId));
    }

    /** API-performance-14 · 권한 생성자(팀 리더). §0.4 {@code signed-tx} — 202 + 폴링. */
    @PostMapping("/{performanceId}/deposit/signed-tx")
    public ResponseEntity<ApiResponse<DepositSignedTxResponse>> depositSignedTx(
            @AuthenticationPrincipal MemberPrincipal me,
            @PathVariable Long performanceId,
            @Valid @RequestBody SignedTxRequest request,
            // [2026-09-24] 본인 확인 토큰(API v7 §7.W). 스위치가 꺼져 있으면 서비스가 읽지 않는다.
            @RequestHeader(value = "X-Step-Up-Token", required = false) String stepUpToken) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(
                        performanceService.depositSignedTx(me, performanceId, request, stepUpToken),
                        "보증금 트랜잭션을 확인하고 있습니다."));
    }
}
