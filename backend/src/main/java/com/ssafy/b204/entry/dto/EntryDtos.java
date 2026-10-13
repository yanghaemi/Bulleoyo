package com.ssafy.b204.entry.dto;

import com.ssafy.b204.common.response.PageInfo;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * entry 도메인 DTO — API v6 §10 (API-entry-01·02). 접두 {@code ENTRY_*}.
 *
 * <p>인증이 특별하다 — {@code Authorization} 대신 <b>{@code X-Entry-Token}</b> 헤더(또는
 * {@code entryToken} 쿼리)로도 된다(§0.1). 검표 담당자가 로그인 없이 링크만으로 검표할 수
 * 있어야 하기 때문이다. 토큰은 API-performance-10이 발급하고 해당 공연에만 유효하다.
 *
 * <p>⚠️ <b>API-entry-02의 응답은 ERD v5로 저장할 수 없다</b> — 아래 note 참고.
 */
public final class EntryDtos {

    private EntryDtos() {
    }

    /**
     * {@code POST /api/v1/entries/verify} — QR 검증·입장 처리(API-entry-01).
     *
     * <p>{@code qrToken}은 {@code ticket.qr_secret}으로 서명된 60초 수명 토큰이다.
     * 만료는 {@code ENTRY_QR_EXPIRED}(401), 서명 불일치는
     * {@code ENTRY_QR_SIGNATURE_INVALID}(401) — 후자는 캡처·복제로 간주해 검표 이력에 기록한다.
     */
    public record VerifyEntryRequest(
            @NotNull Long performanceId,
            @NotBlank @Size(max = 1024) String qrToken,
            // 스캐너 단말 시각 — 로그용이고 판정 기준은 서버 시각이다(명세 Body 표).
            OffsetDateTime scannedAt
    ) {}

    /**
     * {@code holderNameMasked}는 {@code 김*객}처럼 가린다 — 검표 담당자가 동일인 확인은 해야
     * 하지만 명단을 수집할 이유는 없다.
     */
    public record VerifyEntryResponse(
            Long ticketId,
            String status,
            String ticketTypeName,
            String holderNameMasked,
            OffsetDateTime enteredAt,
            Integer enteredCount,
            Integer totalIssuedCount
    ) {}

    /**
     * {@code GET /api/v1/performances/{id}/entries} — 입장 현황·이력(API-entry-02).
     *
     * <p>⚠️ <b>ERD v5에 이 응답을 담을 테이블이 없다.</b> {@code ticket}에는
     * {@code entry_result}·{@code entered_at} 단일 값만 있어 <b>스캔 시도별 이력</b>을 저장할 수
     * 없다. {@code entryLogId}, 실패 시도({@code result: FAILED}, {@code failureCode}),
     * {@code duplicateAttemptCount}, {@code expiredQrCount}, {@code scannerSource}가 모두 저장
     * 근거가 없다.
     *
     * <p>그래서 이력을 <b>Redis에 둔다</b>({@link com.ssafy.b204.entry.service.EntryLogStore}) —
     * 성공 입장의 정본은 그대로 {@code ticket}이고, Redis에만 있는 것은 실패 시도의 현장 진단
     * 정보다. 최근 500건·TTL 7일이라 <b>사후 분석용 보관이 아니다.</b> 영구 이력이 필요하면
     * {@code entry_log} 테이블(V2 마이그레이션 후보) 또는 명세 수정이 필요하다.
     */
    public record EntryStatusResponse(
            Long performanceId,
            EntrySummary summary,
            List<EntryLogItem> items,
            PageInfo pageInfo
    ) {}

    /**
     * {@code enteredCount}·{@code totalIssuedCount}는 {@code ticket} 집계(5초 캐시)이고
     * {@code duplicateAttemptCount}·{@code expiredQrCount}는 Redis 카운터다 — 후자는 저장
     * 근거가 ERD에 없다.
     */
    public record EntrySummary(
            Integer enteredCount,
            Integer totalIssuedCount,
            Integer duplicateAttemptCount,
            Integer expiredQrCount
    ) {}

    /** {@code failureCode}는 규격 §3의 code 문자열({@code ENTRY_ALREADY_ENTERED} 등)이다. */
    public record EntryLogItem(
            Long entryLogId,
            Long ticketId,
            String holderNameMasked,
            String result,
            String failureCode,
            OffsetDateTime scannedAt,
            String scannerSource
    ) {}
}
