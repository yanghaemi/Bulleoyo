package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.worker.ChainOwnership;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.support.IntegrationTestBase;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * job claim — <b>진짜 DB 에서, 운영과 같은 트랜잭션 경계로</b> 하나만 통과하는가(S15P21B204-96).
 *
 * <p><b>클래스에 {@code @Transactional} 을 두지 않는다.</b> 9/11 판은 테스트 트랜잭션이 claim 경로에
 * 쓰기 트랜잭션이 없다는 운영 결함을 가렸다. 워커 디스패치에는 트랜잭션이 없으므로 여기서도
 * 트랜잭션 밖에서 {@link ChainOwnership#claim} 을 부른다 — 실제 리포지토리 빈(트랜잭션 프록시)을
 * 받으므로 수동 생성해도 실제 경계를 탄다. 커밋되므로 만든 job 은 {@link #cleanUp()} 이 지운다.
 *
 * <p>{@code @TestPropertySource} 로 instance-id 를 켜지 않는다 — 컨텍스트가 새로 떠 워커·스케줄러까지
 * 소유권이 켜지고 다른 테스트와 엉킨다.
 */
class ChainJobClaimTest extends IntegrationTestBase {

    @Autowired
    private ChainJobRepository chainJobRepository;

    @Autowired
    private StringRedisTemplate redis;

    private final List<Long> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        chainJobRepository.deleteAllById(created);
        created.clear();
    }

    private ChainOwnership instance(String id) {
        return new ChainOwnership(redis, chainJobRepository, id);
    }

    private ChainJob pendingJob() {
        ChainJob job = chainJobRepository.save(ChainJob.builder()
                .txType(ChainJob.TxType.MINT)
                .signerType(ChainJob.SignerType.OPERATOR)
                .idempotencyKey("claim-test-" + UUID.randomUUID())
                .build());
        created.add(job.getChainJobId());
        return job;
    }

    private String claimedBy(ChainJob job) {
        return chainJobRepository.findById(job.getChainJobId()).orElseThrow().getClaimedBy();
    }

    @Test
    @DisplayName("두 인스턴스가 같은 job 을 집으려 하면 하나만 통과한다")
    void onlyOneInstanceClaims() {
        ChainJob job = pendingJob();

        assertThat(instance("blue").claim(job.getChainJobId())).isTrue();
        assertThat(instance("green").claim(job.getChainJobId())).isFalse();
        assertThat(claimedBy(job)).isEqualTo("blue");
    }

    /**
     * 전송 실패 시 {@code retryOrFail} 은 PENDING 으로 둔다. 자기 claim 에 자기가 막히면 REL-09
     * "1초 뒤 재시도" 가 5분 간격이 된다. 다른 인스턴스는 여전히 못 뺏어야 한다.
     */
    @Test
    @DisplayName("같은 인스턴스는 자기 job 을 즉시 다시 집는다 — 다른 인스턴스는 여전히 못 뺏는다")
    void sameInstanceReclaimsImmediately() {
        ChainJob job = pendingJob();
        ChainOwnership blue = instance("blue");

        assertThat(blue.claim(job.getChainJobId())).isTrue();
        assertThat(blue.claim(job.getChainJobId())).isTrue();
        assertThat(instance("green").claim(job.getChainJobId())).isFalse();
        assertThat(claimedBy(job)).isEqualTo("blue");
    }

    /**
     * 집어 놓고 죽은 인스턴스의 job 이 영영 안 돌아가는 것은 <b>반대 방향의 같은 사고</b>다
     * (S15P21B204-76 과 같은 함정). 그래서 회수 경로를 따로 만들지 않고 조건에 넣었다.
     */
    @Test
    @DisplayName("낡은 claim 은 다른 인스턴스가 가져간다 — 집어 놓고 죽은 job 이 굳지 않는다")
    void staleClaimIsReclaimed() {
        ChainJob job = pendingJob();
        LocalDateTime now = TimeSupport.nowStored();

        // blue 가 10분 전에 집고 죽었다.
        assertThat(chainJobRepository.claim(job.getChainJobId(), "blue", now.minusMinutes(10),
                now.minusMinutes(15))).isEqualTo(1);

        assertThat(instance("green").claim(job.getChainJobId())).isTrue();
        assertThat(claimedBy(job)).isEqualTo("green");
    }

    @Test
    @DisplayName("PENDING 이 아니면 집지 않는다 — 이미 보낸 tx 를 다시 보내지 않는다")
    void doesNotClaimNonPending() {
        ChainJob job = pendingJob();
        job.markSubmitted("0x" + "1".repeat(64));
        chainJobRepository.save(job);

        assertThat(instance("blue").claim(job.getChainJobId())).isFalse();
    }
}
