package com.ssafy.b204.chain.worker;

import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.common.config.RedisConfig;
import com.ssafy.b204.common.support.TimeSupport;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * 체인 작업을 <b>이 인스턴스가 맡는가</b> — 같은 tx 를 두 번 보내지 않기 위한 단일 소유권.
 *
 * <p><b>왜 필요한가.</b> {@link ChainWalletQueue} 가 "지갑당 스레드 1개" 로 nonce 를 직렬화하는데,
 * 그 직렬화는 <b>프로세스 안에서만</b> 성립한다. 블루/그린은 1초 롤백을 위해 이전 색을 끄지
 * 않으므로 두 인스턴스가 상시 같이 뜬다. 그러면 둘이 같은 {@code PENDING} job 을 집어
 * <b>같은 tx 를 두 번 체인에 보내고</b>, 같은 OPERATOR 지갑이라 nonce 도 충돌한다.
 *
 * <p><b>조건부 claim 으로는 부족하다.</b> job 을 나눠 집어도 전송자가 같은 지갑이면 nonce 경쟁은
 * 그대로다. 그래서 "누가 job 을 가져가는가" 가 아니라 <b>"누가 일하는가"</b> 를 하나로 묶는다.
 *
 * <p><b>비어 있으면 지금과 똑같이 동작한다.</b> {@code b204.chain.instance-id} 가 비면 항상
 * {@code true} 다 — 단일 인스턴스 배포(현재 운영)는 이 클래스가 있어도 달라지지 않는다.
 * 블루/그린 compose 만 색 이름을 넣는다.
 *
 * <p><b>Redis 를 못 읽으면 일하지 않는다.</b> 대납 tx 를 두 번 보내면 실제 가스가 나가고 nonce 가
 * 깨진다 — 되돌릴 방법이 없다. 멈춘 큐는 Redis 가 돌아오면 그대로 이어진다. 둘을 저울에 올리면
 * 멈추는 쪽이 싸다.
 *
 * <p>키가 비어 있으면 <b>활성 색만 가져간다.</b> {@code chain:active}(TTL 없음, 배포가 씀)가
 * 자기 색일 때만 {@code SET NX} 를 시도한다 — 그 키가 아예 없으면(블루/그린 이전 배포·Redis
 * 재생성 직후) 먼저 본 인스턴스가 가져간다. 아무도 일하지 않는 상태로 남지 않게 하려는 것이다.
 *
 * <h2>인계와 펜싱</h2>
 *
 * <p><b>① 소유권은 저절로 넘어가지 않는다 — 배포 스크립트가 넘긴다.</b> 옛 색이 살아 있으면 1초마다
 * 임대를 갱신해 영구 소유자가 되고, 새 빌드가 만든 {@code TxType} 을 옛 빌더가 모르면 그 job 은 조용히
 * {@code PENDING} 으로 남는다. 그래서 {@code exec/deploy/blue-green.sh} 의 {@code chain_handover} 가
 * 전환 직후 이 키를 {@code handover}(어느 색 이름도 아닌 값)로 바꿔 두 색을 쉬게 하고, 대기 뒤 새 색
 * 이름으로 {@code SET} 한다. 대기는 창을 줄일 뿐 안전의 근거가 아니다 — 인계 도중 두 색이 같은 job 을
 * 봐도 전송은 {@link #claim}, 확정은 확정 서비스의 행 잠금(S15P21B204-119)이 막는다. 스크립트가
 * Redis 쓰기에 실패하면 "옛 색이 계속 일한다" 로 남고, 스크립트가 수동 명령을 출력한다.
 *
 * <p><b>② 재기동·재부팅은 인계가 닫지 못한다 — {@code chain:active} 가 닫는다.</b> 호스트가
 * 재부팅되면 두 색과 Redis 가 함께 선다. AOF 가 {@code chain:owner} 를 남은 TTL(≤60초)까지
 * 복원하지만 JVM 기동이 60~90초라 그 사이에 만료되고, 그러면 <b>먼저 깨어난 쉬는 옛 색이
 * {@code SET NX} 로 가져간다</b> — 트래픽은 새 색, 체인 작업은 옛 이미지가 하는 상태가 조용히
 * 남는다(리뷰 !93 🔴). 그래서 배포가 전환할 때 <b>TTL 없는 {@code chain:active}</b> 에 색을
 * 적고, 빈 {@code chain:owner} 는 그 색만 가져간다.
 *
 * <p><b>남는 틈</b> — {@code chain:active} 가 없으면(Redis 를 비우고 다시 만든 직후) 먼저 본
 * 색이 가져간다. 그쪽을 fail-closed 로 막으면 이관 배포에서 아무도 일하지 않게 되고, 그 상태는
 * 조용해서 더 나쁘다. 대신 배포·롤백 스크립트가 매번 이 키를 쓰고, 런북이 Redis 재생성 뒤
 * 확인 명령을 시킨다({@code exec/README.md}).
 *
 * <p>단일 인스턴스(식별자 비어 있음)에서는 이 클래스가 꺼져 있다.
 *
 * <p><b>(닫힘) 임대 만료 인계의 펜싱</b> — 소유자가 {@code LEASE} 보다 오래 멈췄다 깨어나 자신을
 * 소유자로 믿는 창은 {@link #claim} 의 조건부 UPDATE 가 DB 에서 막는다(S15P21B204-96).
 *
 * <p><b>(닫힘) job 단위 확정 전이와 그 밖의 상태 쓰기</b> — {@code ChainJobConfirmationService} 의
 * 확정과 실패·재시도·동의 초기화의 {@code FAILED} 쓰기가 {@code chain_job} 행을 잠금 읽기로 잡아,
 * 확정은 한 번만 돌고 커밋된 {@code CONFIRMED} 를 덮지 않는다(S15P21B204-119).
 *
 * <p><b>(닫힘) 정산 확정 반영</b> — {@code SettlementConfirmationService} 는 {@code settlement} 행
 * 잠금({@code em.refresh(PESSIMISTIC_WRITE)}) + 최신 커밋 재판정으로 펜싱한다(S15P21B204-119,
 * MR !125). {@code DEPOSIT_RETURN} 은 잠그는 행({@code settlement})과 바꾸는 행
 * ({@code performance})이 달라 그 잠금이 덮지 못하므로, {@code performance.deposit_status} 조건부
 * UPDATE 가 펜싱이다.
 *
 * <p><b>(닫힘) HALT 확정</b> — {@code ChainJobConfirmationService.confirmHalt} 도 있던 정산 행을
 * {@code em.refresh(PESSIMISTIC_WRITE)} 로 잠그고 최신 커밋으로 판정한다(S15P21B204-148).
 * <b>다른 컬럼을 덮는 문제는 {@code Settlement} 의 {@code @DynamicUpdate} 가 닫았다</b> — 바뀐
 * 컬럼만 UPDATE 한다. 남는 것은 <b>같은 컬럼을 동시에 쓰는 경우</b>다: 공유 링크 발급
 * ({@code SettlementService.issueShareToken})은 잠금 없이 읽고 {@code share_token} 을 쓰므로 두
 * 발급이 겹치면 나중 것이 이기고 먼저 받아 간 링크는 404 가 된다(재발급하면 된다, -148 범위 밖).
 */
@Slf4j
@Component
public class ChainOwnership {

    /** 소유자 인스턴스 식별자. 배포가 전환 직후 덮어쓴다. */
    public static final String KEY_OWNER = RedisConfig.KEY_CHAIN_OWNER;

    /**
     * 배포가 정한 활성 색. <b>TTL 이 없다</b> — 임대가 만료된 순간의 판정 기준이라 만료되면 안 된다.
     * 값이 비어 있으면(이 키 도입 전·Redis 재생성 직후) 옛 동작대로 먼저 본 색이 가져간다.
     */
    public static final String KEY_ACTIVE = RedisConfig.KEY_CHAIN_ACTIVE;

    /**
     * 소유권 임대 기간. 소유자가 살아 있는 한 매 확인마다 갱신된다.
     *
     * <p>TTL 을 두는 이유 — 소유자가 죽은 채로 키만 남으면 <b>아무도 체인 작업을 하지 않는다.</b>
     * 그 상태는 조용해서 더 나쁘다. 이 시간이 지나면 남은 인스턴스가 가져간다.
     *
     * <p>짧게 두면 배포 중 순간적인 지연에도 소유권이 튄다. 60초는 워커 주기(1초)보다 충분히
     * 길고, 사람이 눈치채기 전에 회복될 만큼 짧다.
     */
    private static final Duration LEASE = Duration.ofSeconds(60);

    /**
     * 이보다 오래된 claim 은 없는 것으로 본다.
     *
     * <p>{@link #LEASE}(60초)보다 길어야 한다 — 임대가 살아 있는 소유자의 job 을 다른 인스턴스가
     * 뺏으면 그것이 곧 두 번 보내는 길이다. 전송 자체는 초 단위로 끝나므로 5분이면 "정말 죽었다"
     * 를 뜻한다.
     */
    private static final Duration CLAIM_STALE_AFTER = Duration.ofMinutes(5);

    private final StringRedisTemplate redis;
    private final ChainJobRepository chainJobRepository;
    private final String instanceId;
    private boolean lastAnswer = true;

    public ChainOwnership(StringRedisTemplate redis,
                          ChainJobRepository chainJobRepository,
                          @Value("${b204.chain.instance-id:}") String instanceId) {
        this.redis = redis;
        this.chainJobRepository = chainJobRepository;
        this.instanceId = instanceId == null ? "" : instanceId.trim();
        if (!this.instanceId.isEmpty()) {
            log.info("체인 작업 소유권 판정 켜짐 — 이 인스턴스 = {}", this.instanceId);
        }
    }

    /** 식별자를 설정하지 않았는가 = 단일 인스턴스 배포인가. */
    public boolean disabled() {
        return instanceId.isEmpty();
    }

    /**
     * 지금 이 인스턴스가 체인 작업을 맡는가.
     *
     * <p>주기마다 불린다(워커 1초). Redis 왕복 한 번이라 비용은 무시할 만하다.
     */
    public boolean isOwner() {
        if (disabled()) {
            return true;
        }
        try {
            // 빈 키를 가져갈 자격은 활성 색에만 있다. 이 검사가 없으면 재부팅 뒤 먼저 깨어난
            // 쉬는 옛 색이 소유권을 집어, 트래픽과 체인 작업이 다른 이미지로 갈린다.
            String active = redis.opsForValue().get(KEY_ACTIVE);
            if (active != null && !active.isBlank() && !instanceId.equals(active)) {
                return answer(false, "활성 색은 " + active + " 다 — 비어 있는 소유권도 가져가지 않는다");
            }
            Boolean claimed = redis.opsForValue().setIfAbsent(KEY_OWNER, instanceId, LEASE);
            if (Boolean.TRUE.equals(claimed)) {
                return answer(true, "소유권을 가져왔다(비어 있었다)");
            }
            String owner = redis.opsForValue().get(KEY_OWNER);
            if (instanceId.equals(owner)) {
                // 내가 소유자다. 살아 있는 동안 임대를 연장한다.
                redis.expire(KEY_OWNER, LEASE);
                return answer(true, null);
            }
            return answer(false, "소유자는 " + owner + " 다 — 이 인스턴스는 체인 작업을 쉰다");
        } catch (RuntimeException e) {
            // 모르면 하지 않는다. 두 번 보낸 tx 는 되돌릴 수 없고, 멈춘 큐는 이어진다.
            return answer(false, "Redis 를 읽지 못해 체인 작업을 멈춘다: " + e);
        }
    }

    /**
     * 이 job 을 <b>내가 집는다</b> — 소유권 판정의 빈틈을 닫는 마지막 방어선.
     *
     * <p>{@link #isOwner()} 는 Redis 임대라 <b>펜싱이 없다.</b> 소유자가 {@code LEASE} 보다 오래
     * 멈췄다(GC·DB 대기) 깨어나면 다른 인스턴스가 이미 키를 가져간 뒤에도 다음 확인 주기까지
     * 자신을 소유자로 믿는다. 그 창에서 둘이 같은 job 을 집으면 같은 tx 가 두 번 나간다.
     * 여기서 <b>DB 한 번의 원자적 UPDATE</b> 로 다시 판정하면 그 창이 없다.
     *
     * <p>낡은 claim({@link #CLAIM_STALE_AFTER} 초과)은 다시 집는다 — 집어 놓고 죽은 인스턴스의
     * job 이 영영 안 돌아가는 것은 반대 방향의 같은 사고다.
     *
     * <p>비활성(단일 인스턴스)이면 <b>DB 도 건드리지 않고</b> 언제나 참이다. {@code inFlight} 가
     * 이미 프로세스 안에서 같은 일을 하고 있어서, 한 인스턴스뿐이면 이 UPDATE 는 비용만이다.
     *
     * <p><b>이 메서드에 {@code @Transactional} 을 달지 않는다.</b> 달면 {@code disabled()} 판정 전에
     * 트랜잭션이 열려 비활성 경로에도 매 주기 빈 트랜잭션이 생긴다. 트랜잭션({@code REQUIRES_NEW})은
     * {@link ChainJobRepository#claim} 에 있다.
     */
    public boolean claim(Long chainJobId) {
        if (disabled()) {
            return true;
        }
        LocalDateTime now = TimeSupport.nowStored();
        return chainJobRepository.claim(chainJobId, instanceId, now,
                now.minus(CLAIM_STALE_AFTER)) == 1;
    }

    /** 답이 바뀔 때만 로그를 남긴다 — 1초마다 같은 줄을 찍으면 아무도 안 읽는다. */
    private boolean answer(boolean owner, String message) {
        if (owner != lastAnswer) {
            lastAnswer = owner;
            log.warn("체인 작업 소유권 변경 — {} ({})", owner ? "맡는다" : "쉰다",
                    message == null ? "소유자 확인" : message);
        }
        return owner;
    }
}
