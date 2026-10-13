package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.support.IntegrationTestBase;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * {@code b204_chain_job_count} 의 group-by 쿼리 — 별칭이 projection getter 로, 문자열 컬럼이 enum 으로
 * <b>실제 MySQL 위에서</b> 매핑되는가(S15P21B204-186). 빈 테이블에서는 매핑이 한 번도 불리지 않는다.
 *
 * <p>DB 는 테스트 클래스가 공유하므로 절대값이 아니라 저장 전후 <b>증가분</b>을 본다.
 */
class ChainJobCountQueryTest extends IntegrationTestBase {

    @Autowired
    private ChainJobRepository chainJobRepository;

    private final List<Long> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        chainJobRepository.deleteAllById(created);
        created.clear();
    }

    @Test
    @DisplayName("상태·서명 주체별 건수가 조합마다 한 행으로 나온다")
    void countsByStatusAndSignerType() {
        long operatorPending = count(ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR);
        long userFailed = count(ChainJob.Status.FAILED, ChainJob.SignerType.USER);

        save(ChainJob.SignerType.OPERATOR, false);
        save(ChainJob.SignerType.USER, true);

        assertThat(count(ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR)).isEqualTo(operatorPending + 1);
        assertThat(count(ChainJob.Status.FAILED, ChainJob.SignerType.USER)).isEqualTo(userFailed + 1);
    }

    private void save(ChainJob.SignerType signerType, boolean failed) {
        ChainJob job = ChainJob.builder()
                .txType(ChainJob.TxType.MINT)
                .signerType(signerType)
                .idempotencyKey("count-test-" + UUID.randomUUID())
                .build();
        if (failed) {
            job.markFailed("TEST");
        }
        created.add(chainJobRepository.save(job).getChainJobId());
    }

    private long count(ChainJob.Status status, ChainJob.SignerType signerType) {
        return chainJobRepository.countGroupByStatusAndSignerType().stream()
                .filter(row -> row.getStatus() == status && row.getSignerType() == signerType)
                .mapToLong(ChainJobRepository.JobCount::getCount)
                .sum();
    }
}
