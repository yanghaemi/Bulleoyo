package com.ssafy.b204.entry.service;

import com.ssafy.b204.common.config.EntryProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.PageInfo;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.Paging;
import com.ssafy.b204.common.support.RateLimiter;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.entry.dto.EntryDtos.EntryLogItem;
import com.ssafy.b204.entry.dto.EntryDtos.EntryStatusResponse;
import com.ssafy.b204.entry.dto.EntryDtos.EntrySummary;
import com.ssafy.b204.entry.dto.EntryDtos.VerifyEntryRequest;
import com.ssafy.b204.entry.dto.EntryDtos.VerifyEntryResponse;
import com.ssafy.b204.entry.support.EntryWindows;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.ticket.entity.Ticket;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.ticket.support.QrTokens;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * entry 도메인 서비스 — API v6 §10 (API-entry-01·02).
 *
 * <p><b>QR 재사용 차단이 이 서비스의 존재 이유다.</b> 입장은 온체인·코인과 무관하다([v4] §10) —
 * 티켓의 유효성은 DB 소유권과 <b>서버 서명 QR</b>이 정한다.
 *
 * <h2>검증 순서(§10 시스템 처리 1의 순서를 그대로 따른다)</h2>
 * <ol>
 *   <li>한도(SEC-10) — IP·검표 토큰당 60회/분 → {@code COMMON_TOO_MANY_REQUESTS}(429)
 *   <li>권한 — 검표 링크 토큰 <b>또는</b> 참여팀 회원. 둘 다 없으면
 *       {@code COMMON_UNAUTHORIZED}(401), 있으나 이 공연 것이 아니면
 *       {@code ENTRY_SCANNER_NOT_AUTHORIZED}(403)
 *   <li>{@code qrToken} 형식 → {@code COMMON_VALIDATION_FAILED}(400)
 *   <li>티켓 조회 → {@code COMMON_NOT_FOUND}(404)
 *   <li><b>서명</b> 대조 → {@code ENTRY_QR_SIGNATURE_INVALID}(401)
 *   <li><b>윈도우</b>(현재·직전 30초) → {@code ENTRY_QR_EXPIRED}(401)
 *   <li>티켓의 공연 일치 → {@code COMMON_NOT_FOUND}(404)
 *   <li>티켓 상태 → {@code TICKET_CANCELED}(409) / {@code ENTRY_ALREADY_ENTERED}(409)
 *   <li>입장 시간대 → {@code ENTRY_NOT_IN_TIME_WINDOW}(409)
 *   <li>Redis {@code SETNX} 원타임 → {@code ENTRY_ALREADY_ENTERED}(409)
 *   <li>{@code ISSUED → USED} + {@code entry_result}·{@code entered_at} 기록
 * </ol>
 *
 * <p>서명을 만료보다 먼저 보는 이유 — 위조(캡처·복제) QR과 시간이 지난 QR은 현장 대응이 다르다.
 * 상태를 시간대보다 먼저 보는 이유 — 이미 들어온 사람에게 "입장 시간이 아니다"라고 답하면
 * 검표 담당자가 원인을 잘못 짚는다.
 *
 * <p><b>실패도 이력에 남는다</b>(§10 시스템 처리 4). 티켓을 특정한 뒤의 모든 실패를
 * {@link EntryLogStore}에 기록한다 — 조용히 4xx만 주면 캡처 QR 시도를 현장에서 볼 수 없다.
 * 이력 기록은 Redis라 예외를 던져도(=DB 롤백) 그대로 남는다.
 *
 * <p><b>응답은 최소 필드다</b>(PERF-03 p95 ≤ 1초). 외부 호출이 없고, 쿼리는 티켓 1건 +
 * 카운트 2건이다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EntryService {

    /** {@code ticket.entry_result}에 남기는 성공 값. ERD가 VARCHAR로 남긴 열린 값 집합이다. */
    public static final String ENTRY_RESULT_ADMITTED = "ADMITTED";

    /** SEC-10 — IP당·검표 토큰당 60회/분. */
    private static final int RATE_LIMIT_PER_MINUTE = 60;
    private static final Duration RATE_WINDOW = Duration.ofMinutes(1);

    /** {@code scannerSource} — 명세가 값 집합을 정하지 않았다(예시에 {@code ENTRY_LINK}만 있다). */
    private static final String SOURCE_ENTRY_LINK = "ENTRY_LINK";
    private static final String SOURCE_MEMBER = "MEMBER";

    /** 중복 입장 안내의 최초 입장 시각 표기 — 명세 예시 {@code (최초 입장 19:12)}. */
    private static final DateTimeFormatter FIRST_ENTRY_TIME = DateTimeFormatter.ofPattern("HH:mm");

    /** 유효 티켓 = 발급 + 사용(취소 제외). {@code totalIssuedCount}의 모집단이다. */
    private static final List<Ticket.Status> VALID_STATUSES =
            List.of(Ticket.Status.ISSUED, Ticket.Status.USED);

    private final TicketRepository ticketRepository;
    private final PerformanceRepository performanceRepository;
    private final MemberRepository memberRepository;
    private final PerformanceService performanceService;
    private final EntryLinkTokens entryLinkTokens;
    private final EntryOneTimeMarker oneTimeMarker;
    private final EntryLogStore entryLogStore;
    private final EntryProperties entryProperties;
    private final RateLimiter rateLimiter;

    // ================================================================ API-entry-01

    /**
     * API-entry-01 QR 검증·입장 처리. <b>검증과 처리가 한 번에</b> 일어난다 — 조회 후 처리로
     * 나누면 그 사이에 같은 QR로 두 번 들어올 수 있다.
     */
    @Transactional
    public VerifyEntryResponse verify(MemberPrincipal me, String entryToken, String clientIp,
                                      VerifyEntryRequest request) {
        limit("entry:verify", clientIp, entryToken);

        Performance performance = performanceRepository.findById(request.performanceId())
                .orElse(null);
        Scanner scanner = authorize(me, entryToken, request.performanceId(), performance);
        if (performance == null) {
            // 검표 토큰이 가리키는 공연이 사라진 경우. 이 절에 PERFORMANCE_NOT_FOUND 가 없다.
            throw BusinessException.of(ErrorCode.ENTRY_SCANNER_NOT_AUTHORIZED);
        }

        long scannedAt = System.currentTimeMillis();
        QrTokens.Scanned scanned = QrTokens.parse(request.qrToken())
                // 형식이 깨진 값은 티켓을 특정할 수 없어 이력에 남길 대상이 없다.
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED));

        Ticket ticket = ticketRepository.findById(scanned.ticketId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));
        String holder = maskName(ticket.getMember().getName());

        QrTokens.Verdict verdict = QrTokens.verify(scanned, ticket.getQrSecret(), Instant.now());
        switch (verdict) {
            case SIGNATURE_INVALID -> throw reject(performance, ticket, holder, scanner, scannedAt,
                    ErrorCode.ENTRY_QR_SIGNATURE_INVALID, null);
            case EXPIRED -> throw reject(performance, ticket, holder, scanner, scannedAt,
                    ErrorCode.ENTRY_QR_EXPIRED, null);
            case MALFORMED -> throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
            default -> { }
        }

        if (!ticket.getPerformance().getPerformanceId().equals(performance.getPerformanceId())) {
            // 다른 공연의 티켓이다. 이 절의 404는 "토큰이 가리키는 티켓 없음"이며 검표 중인
            // 공연 기준으로는 없는 티켓과 같다.
            throw reject(performance, ticket, holder, scanner, scannedAt,
                    ErrorCode.COMMON_NOT_FOUND, null);
        }

        switch (ticket.getStatus()) {
            case CANCELLED -> throw reject(performance, ticket, holder, scanner, scannedAt,
                    ErrorCode.TICKET_CANCELED, null);
            case USED -> throw reject(performance, ticket, holder, scanner, scannedAt,
                    ErrorCode.ENTRY_ALREADY_ENTERED, alreadyEnteredMessage(ticket.getEnteredAt()));
            default -> { }
        }

        // now()의 시각대를 저장 기준(KST)으로 고정한다 — DB DATETIME 은 오프셋을 갖지 않는다.
        if (!EntryWindows.isOpen(performance, entryProperties,
                LocalDateTime.now(TimeSupport.STORAGE_ZONE))) {
            throw reject(performance, ticket, holder, scanner, scannedAt,
                    ErrorCode.ENTRY_NOT_IN_TIME_WINDOW, null);
        }

        // ── 동시 스캔은 여기서 한 건으로 줄어든다(§0.12 entry:{ticketId} SETNX · SEC-06).
        if (!oneTimeMarker.acquire(ticket.getTicketId())) {
            throw reject(performance, ticket, holder, scanner, scannedAt,
                    ErrorCode.ENTRY_ALREADY_ENTERED, alreadyEnteredMessage(ticket.getEnteredAt()));
        }

        ticket.markUsed(ENTRY_RESULT_ADMITTED);
        ticketRepository.save(ticket);

        long entered = ticketRepository.countByPerformance_PerformanceIdAndStatus(
                performance.getPerformanceId(), Ticket.Status.USED);
        long total = ticketRepository.countByPerformance_PerformanceIdAndStatusIn(
                performance.getPerformanceId(), VALID_STATUSES);
        entryLogStore.append(performance.getPerformanceId(), ticket.getTicketId(), holder, null,
                scanner.source(), scannedAt);

        return new VerifyEntryResponse(
                ticket.getTicketId(),
                ticket.getStatus().name(),
                ticket.getTicketType().getName(),
                holder,
                TimeSupport.toOffset(ticket.getEnteredAt(), scanner.timezone()),
                (int) entered,
                (int) total);
    }

    // ================================================================ API-entry-02

    /**
     * API-entry-02 입장 현황·이력. 상태 전이가 없다.
     *
     * <p>요약값은 5초 캐시하고(§10 [권] · PERF-01) <b>입장 성공 시 즉시 무효화</b>한다.
     * 실패 카운터({@code duplicateAttemptCount}·{@code expiredQrCount})는 Redis 카운터라 캐시가
     * 필요 없다.
     *
     * <p><b>이력의 저장 위치가 ERD와 다르다</b> — {@link EntryLogStore} 참고. 성공 입장의 정본은
     * {@code ticket}이고 실패 시도는 Redis에만 있다.
     */
    public EntryStatusResponse entryStatus(MemberPrincipal me, Long performanceId,
                                           String entryToken, String clientIp, String result,
                                           org.springframework.data.domain.Pageable pageable) {
        limit("entry:status", clientIp, entryToken);

        // 이 절의 4xx 표에는 PERFORMANCE_NOT_FOUND 가 있다(시스템 처리 1 — 공연 존재 확인이 먼저다).
        Performance performance = performanceRepository.findById(performanceId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.PERFORMANCE_NOT_FOUND));
        Scanner scanner = authorize(me, entryToken, performanceId, performance);

        String resultFilter = parseResultFilter(result);
        PageRequest page = Paging.of(pageable, Map.of(), Sort.unsorted());

        List<EntryLogStore.Item> all = entryLogStore.recent(performanceId).stream()
                .filter(item -> resultFilter == null || resultFilter.equals(item.result()))
                .toList();
        int from = Math.min((int) page.getOffset(), all.size());
        int to = Math.min(from + page.getPageSize(), all.size());
        List<EntryLogItem> items = all.subList(from, to).stream()
                .map(item -> new EntryLogItem(
                        item.entryLogId(),
                        item.ticketId(),
                        item.holderNameMasked(),
                        item.result(),
                        item.failureCode(),
                        TimeSupport.fromEpochMilli(item.scannedAtEpochMilli(), scanner.timezone()),
                        item.scannerSource()))
                .toList();

        long[] counts = ticketCounts(performanceId);
        Map<String, Integer> counters = entryLogStore.counters(performanceId);
        EntrySummary summary = new EntrySummary(
                (int) counts[0],
                (int) counts[1],
                counters.getOrDefault(ErrorCode.ENTRY_ALREADY_ENTERED.getCode(), 0),
                counters.getOrDefault(ErrorCode.ENTRY_QR_EXPIRED.getCode(), 0));

        return new EntryStatusResponse(performance.getPerformanceId(), summary, items,
                new PageInfo(page.getPageNumber(), page.getPageSize(), all.size(), to < all.size()));
    }

    // ================================================================ 내부

    /** 입장 수·발급 수. 5초 캐시(§10 [권])를 먼저 본다. */
    private long[] ticketCounts(Long performanceId) {
        Optional<long[]> cached = entryLogStore.cachedTicketCounts(performanceId);
        if (cached.isPresent()) {
            return cached.get();
        }
        long entered = ticketRepository.countByPerformance_PerformanceIdAndStatus(performanceId,
                Ticket.Status.USED);
        long total = ticketRepository.countByPerformance_PerformanceIdAndStatusIn(performanceId,
                VALID_STATUSES);
        entryLogStore.cacheTicketCounts(performanceId, entered, total);
        return new long[]{entered, total};
    }

    /**
     * 권한은 <b>둘 중 하나</b>면 통과다(§10 요구사항 3).
     *
     * <p>검표 토큰이 무효여도 곧바로 403으로 끊지 않고 회원 경로를 한 번 더 본다 — 참여팀 리더가
     * 낡은 링크를 열어 둔 브라우저에서 로그인한 채 호출하는 경우를 살린다.
     *
     * <p>만료·다른 공연·권한 없음을 하나의 403으로 합친 것은 §16.1이
     * {@code ENTRY_LINK_EXPIRED}를 신설 제안 상태로 두었기 때문이다(본문 미사용).
     */
    private Scanner authorize(MemberPrincipal me, String entryToken, Long performanceId,
                              Performance performance) {
        boolean hasToken = entryToken != null && !entryToken.isBlank();
        if (!hasToken && me == null) {
            throw BusinessException.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        if (hasToken && entryLinkTokens.isValidFor(entryToken, performanceId)) {
            return new Scanner(SOURCE_ENTRY_LINK, null);
        }
        if (me != null && performance != null && performanceService.isInsider(performance, me)) {
            return new Scanner(SOURCE_MEMBER,
                    memberRepository.findById(me.memberId()).orElse(null));
        }
        throw BusinessException.of(ErrorCode.ENTRY_SCANNER_NOT_AUTHORIZED);
    }

    /** SEC-10 — IP와 검표 토큰 각각에 같은 한도를 적용한다. */
    private void limit(String scope, String clientIp, String entryToken) {
        rateLimiter.check(scope + ":ip", clientIp, RATE_LIMIT_PER_MINUTE, RATE_WINDOW);
        if (entryToken != null && !entryToken.isBlank()) {
            rateLimiter.check(scope + ":token", entryLinkTokens.fingerprint(entryToken),
                    RATE_LIMIT_PER_MINUTE, RATE_WINDOW);
        }
    }

    /** 실패를 이력에 남기고 던질 예외를 만든다. Redis 기록은 롤백되지 않는다. */
    private BusinessException reject(Performance performance, Ticket ticket, String holder,
                                    Scanner scanner, long scannedAt, ErrorCode code, String msg) {
        entryLogStore.append(performance.getPerformanceId(), ticket.getTicketId(), holder,
                code.getCode(), scanner.source(), scannedAt);
        return msg == null ? BusinessException.of(code) : BusinessException.of(code, msg);
    }

    /** 명세 4xx 예시 그대로 — {@code 이미 입장 처리된 티켓입니다. (최초 입장 19:12)} */
    private static String alreadyEnteredMessage(LocalDateTime enteredAt) {
        if (enteredAt == null) {
            // 동시 스캔에서 먼저 들어온 트랜잭션이 아직 커밋되지 않은 순간. 시각을 지어내지 않는다.
            return ErrorCode.ENTRY_ALREADY_ENTERED.getDefaultMsg();
        }
        return ErrorCode.ENTRY_ALREADY_ENTERED.getDefaultMsg() + " (최초 입장 "
                + enteredAt.format(FIRST_ENTRY_TIME) + ")";
    }

    /** {@code result} 쿼리 — {@code SUCCESS}/{@code FAILED} 외는 400이다. */
    private static String parseResultFilter(String result) {
        if (result == null || result.isBlank()) {
            return null;
        }
        String upper = result.trim().toUpperCase(Locale.ROOT);
        if (!EntryLogStore.RESULT_SUCCESS.equals(upper)
                && !EntryLogStore.RESULT_FAILED.equals(upper)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        return upper;
    }

    /**
     * 관객 이름 마스킹({@code 김*객}) — 검표 담당자는 동일인 확인만 하면 되고 명단을 수집할 이유가
     * 없다(§10 "관객 개인정보는 담지 않는다").
     */
    static String maskName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        String trimmed = name.trim();
        int length = trimmed.codePointCount(0, trimmed.length());
        if (length == 1) {
            return "*";
        }
        if (length == 2) {
            return trimmed.substring(0, trimmed.offsetByCodePoints(0, 1)) + "*";
        }
        int lastStart = trimmed.offsetByCodePoints(0, length - 1);
        return trimmed.substring(0, trimmed.offsetByCodePoints(0, 1))
                + "*".repeat(length - 2)
                + trimmed.substring(lastStart);
    }

    /**
     * 검표 주체. 회원이면 {@code member}가 있고 링크 토큰이면 없다 — 시각 표기 오프셋(§0.1)이
     * 갈리는 유일한 지점이다(비회원 검표기는 {@code +09:00}).
     */
    private record Scanner(String source, Member member) {
        String timezone() {
            return member == null ? null : member.getTimezone();
        }
    }
}
