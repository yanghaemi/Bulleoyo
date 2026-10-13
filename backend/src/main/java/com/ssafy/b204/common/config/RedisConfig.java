package com.ssafy.b204.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * Redis — 테이블 없이 Redis에만 두는 상태의 접근 지점(API v6 §0.12).
 *
 * <p>값이 전부 문자열·해시라 {@link StringRedisTemplate} 하나로 충분하다. JSON 직렬화가 필요한
 * {@code wallet:challenge}는 값이 작아 서비스에서 직접 직렬화한다 — 제네릭
 * {@code RedisTemplate<String,Object>}에 JDK 직렬화가 붙으면 키가 사람이 못 읽는 형태가 되고
 * {@code redis-cli}로 디버깅할 수 없다.
 *
 * <p>키 규약(§0.12) — <b>여기 있는 것은 ERD에 테이블·컬럼으로 존재하지 않는다.</b>
 *
 * <table border="1">
 *   <caption>Redis 키</caption>
 *   <tr><th>키<th>자료형<th>TTL<th>쓰는 곳
 *   <tr><td>{@code auth:refresh:{jti}}<td>string<td>14일<td>API-member-01·02·03·04
 *   <tr><td>{@code auth:refresh:member:{memberId}}<td>set<td>—<td>전체 로그아웃·재사용 감지
 *   <tr><td>{@code wallet:challenge:{memberId}}<td>string(JSON)<td>300초<td>API-wallet-03 → 04(1회용)
 *   <tr><td>{@code wallet:balance}<td>hash<td><b>없음</b><td>API-wallet-01, chain_job 확정, API-coin-01
 *   <tr><td>{@code entry:{ticketId}}<td>string(SETNX)<td>60초<td>API-entry-01 중복 입장 차단
 * </table>
 *
 * <p><b>§0.12에 없는 신설 키</b> — 규약 보강 제안 대상이다. 직전 두 카드가 만든
 * {@code stock:performance:{id}} · {@code idem:order:{memberId}:{key}}에 이 카드가 5개를 더했다.
 * 전부 <b>서버 내부 값</b>이고 클라이언트 계약이 아니다.
 *
 * <table border="1">
 *   <caption>신설 키(entry 카드)</caption>
 *   <tr><th>키<th>자료형<th>TTL<th>왜 필요한가
 *   <tr><td>{@code entry:link:{performanceId}}<td>string(정수)<td>없음
 *       <td>검표 링크 토큰 <b>버전</b>. API-performance-10 {@code rotate=true}가 이전 링크를 즉시
 *           무효화하는 유일한 수단이다(토큰을 저장하지 않으므로 블랙리스트가 없다)
 *   <tr><td>{@code entry:log:{performanceId}}<td>list(JSON)<td>7일
 *       <td>검표 이력. API-entry-02 응답의 {@code entryLogId}·{@code failureCode}·
 *           {@code scannerSource}를 담을 테이블이 ERD v5에 없다
 *   <tr><td>{@code entry:log:stat:{performanceId}}<td>hash<td>7일
 *       <td>{@code entryLogId} 시퀀스 + 판정별 카운터. 목록을 500건으로 잘라도
 *           {@code duplicateAttemptCount}·{@code expiredQrCount}가 남아야 한다
 *   <tr><td>{@code entry:summary:{performanceId}}<td>string<td><b>5초</b>
 *       <td>§10 "요약값은 5초 캐시한다"[권](PERF-01). 입장 성공 시 즉시 무효화한다
 *   <tr><td>{@code rate:{scope}:{subject}:{분}}<td>string(카운터)<td>창+10초
 *       <td>§0.9 호출 한도. 이 카드는 검표(SEC-10 60회/분)만 켰다 —
 *           API-entry-01·02의 4xx 표에 429가 실제로 있다
 *   <tr><td>{@code idem:payment:{memberId}:{key}}<td>string<td>24시간(선점 중 60초)
 *       <td>§0.8 필수 대상인 결제 시작(API-payment-01)의 자리 선점.
 *           {@code idem:order:*}와 같은 값 형식이다
 *           ({@link com.ssafy.b204.common.support.IdempotencyGuard})
 * </table>
 */
@Configuration
public class RedisConfig {

    /** {@code auth:refresh:{jti}} — 리프레시 토큰 해시. TTL 14일. */
    public static final String KEY_AUTH_REFRESH = "auth:refresh:";

    /** {@code auth:refresh:member:{memberId}} — 그 회원의 유효 jti 집합. */
    public static final String KEY_AUTH_REFRESH_MEMBER = "auth:refresh:member:";

    /** {@code wallet:challenge:{memberId}} — 외부 지갑 등록 챌린지. TTL 300초, 검증 후 즉시 삭제. */
    public static final String KEY_WALLET_CHALLENGE = "wallet:challenge:";

    /**
     * {@code wallet:balance} — field = {@code walletId}, value = {@code "{balance}|{checkedAtEpochMs}"}.
     *
     * <p><b>TTL이 없다.</b> 노드 장애 시에도 마지막 값을 보여줘야 한다(AVAIL-02). 대신 value의
     * {@code checkedAt}이 10초보다 낡으면 조회 시 노드를 다시 읽고 갱신한다.
     *
     * <p>갱신 시점은 둘이다 — ① API-wallet-01이 노드를 읽었을 때 ② <b>지갑이 관여한
     * {@code chain_job}이 {@code CONFIRMED}될 때</b>(발신·수신 지갑 모두). 결제 직후 에스크로만 늘고
     * 구매자 캐시가 그대로면 발행량 대사(불변식 4)가 정상 결제를 불일치로 읽는다.
     *
     * <p>원장은 언제나 체인이다. Redis가 비면 다음 조회에서 체인 재조회로 재구축되며 데이터 손실이
     * 아니다. DB에 잔액 사본 컬럼을 두지 않는다(ERD {@code wallet}에서 삭제됨).
     */
    public static final String KEY_WALLET_BALANCE = "wallet:balance";

    /**
     * {@code entry:{ticketId}} — 입장 원타임 SETNX 마커. TTL = QR 유효 구간(60초).
     *
     * <p>진입점은 {@link com.ssafy.b204.entry.service.EntryOneTimeMarker}다. <b>DB 상태 검사를
     * 대체하지 않는다</b> — 마커는 60초 동시성 창을, {@code ticket.status = USED}는 영구적인
     * "이미 입장"을 막는다.
     */
    public static final String KEY_ENTRY = "entry:";

    /**
     * 체인 작업 소유자 인스턴스 — 블루/그린에서 두 색이 같은 tx 를 두 번 보내지 않게 한다.
     * 값은 인스턴스 식별자(색 이름), TTL 은 소유자가 죽었을 때 넘어가기 위한 임대다.
     * 자세한 것은 {@code ChainOwnership}.
     */
    public static final String KEY_CHAIN_OWNER = "chain:owner";

    /**
     * {@code chain:active} — 배포가 정한 <b>지금 트래픽을 받는 색</b>. <b>TTL 이 없다.</b>
     *
     * <p>{@link #KEY_CHAIN_OWNER} 는 임대(60초)라 재기동·재부팅에서 만료되고, 그 순간 비어 있는
     * 키를 <b>쉬는 옛 색이 먼저 가져갈 수 있다.</b> 그래서 "누가 살아서 일하는가"(owner, 임대)와
     * "어느 색이 일해야 하는가"(active, 영속)를 나눈다. 값은 {@code blue}·{@code green} 이고
     * {@code exec/deploy/blue-green.sh}·{@code rollback.sh} 가 전환할 때마다 덮어쓴다.
     * 자세한 것은 {@code ChainOwnership}.
     */
    public static final String KEY_CHAIN_ACTIVE = "chain:active";

    /** {@code wallet:balance} value 구분자. */
    public static final String BALANCE_VALUE_DELIMITER = "|";

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }
}
