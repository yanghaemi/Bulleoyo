package com.ssafy.b204.chain.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.support.ChainJobIds;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code RevenueSplitter.createShow} 선행 job — S15P21B204-67.
 *
 * <p><b>왜 별도 서비스인가.</b> 명세가 세 곳에서 같은 선행 조건을 요구한다 —
 * API-performance-13(보증금 서명 준비) · API-rule-03(규칙 동의 서명 준비) · API-rule-04(판매
 * 시작). 컨트랙트 stage 가 {@code createShow → CREATED} 이후에만 {@code deposit}·
 * {@code agreeToRules}·{@code startSale}을 받으므로, 이 job 이 없으면 실체인에서 그 셋이 전부
 * {@code ShowNotFound}로 revert 한다. 판정이 세 곳에 흩어지면 서로 어긋나므로 하나로 모은다.
 *
 * <p><b>여기서 팀 인덱스가 확정된다.</b> {@code performance_participant.on_chain_index}는
 * {@code createShow}의 {@code teamWallets} 배열 위치이고, 우리가 그 배열을 만드는 순간이
 * 곧 온체인 순서가 정해지는 순간이다. 리더 지갑 주소 스냅샷({@code wallet_address})도 같이
 * 굳는다(미결 안건 20).
 *
 * <h2>순서는 job 이 {@code PENDING}인 동안 계속 다시 굳는다</h2>
 *
 * <p>job 을 건 뒤에도 참여팀은 늘거나 준다 — 보증금 준비에서 job 이 걸린 다음 게스트팀이
 * 수락하는 흐름이 정상 경로다. 그때 순서를 다시 굳히지 않으면 그 팀은 {@code on_chain_index}가
 * {@code null}로 남고, 규칙(API-rule-01)은 그 팀에도 {@code shareBp}를 배분하므로 우리가 보내는
 * {@code teamShareBp} 배열의 합이 10000 미만이 되어 <b>컨트랙트가 {@code InvalidBpSum}으로
 * revert 하고 재시도 3회를 소진한 뒤 {@code FAILED}</b>가 된다.
 *
 * <p>그래서 {@code PENDING}이면 다시 굳히고, {@code SUBMITTED}·{@code CONFIRMED}면 건드리지
 * 않는다 — 이미 보낸 배열과 DB 가 갈리기 때문이다. 확정 뒤의 참여팀 변경은
 * {@link #isCreated(Long)}로 아예 막는다({@code teamWallets}는 {@code updateRules}로도 고칠 수
 * 없다 · 문서 13 §4.8).
 *
 * <p>패키지는 {@code chain}이다 — 인자가 {@code performance}·{@code performance_participant}·
 * {@code settlement_rule} 세 도메인에 걸쳐 있고, {@code performance}에 두면
 * {@code performance → rule → performance} 순환이 된다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class ShowCreationService {

    /** §0.8 — 공연당 1회. 재요청은 같은 job 을 재생한다. */
    public static final String CREATE_SHOW_KEY_PREFIX = "createShow:";

    /** {@code updateRules} 멱등키 접두. 해시까지 포함해야 규칙마다 다른 job 이 된다. */
    private static final String UPDATE_RULES_KEY_PREFIX = "updateRules:";

    private final ChainJobRepository chainJobRepository;
    private final PerformanceRepository performanceRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final SettlementRuleRepository settlementRuleRepository;
    private final WalletRepository walletRepository;
    private final MemberRepository memberRepository;

    /** {@code createShow} 배열 한 칸. {@code teamIndex}가 곧 온체인 {@code teamIndex}다. */
    public record TeamSlot(Long teamId, Integer teamIndex, String walletAddress) {}

    /**
     * {@link #ensureShowCreated} 결과.
     *
     * <p><b>{@code teams}를 함께 돌려주는 이유.</b> 이 메서드는 {@code REQUIRES_NEW}라 호출부와
     * 다른 영속성 컨텍스트에서 돈다. 호출부가 같은 참여팀 행을 이미 읽어 뒀다면 그쪽 1차 캐시에는
     * <b>인덱스가 굳기 전 값</b>이 남아 있어, 호출부가 다시 조회해도 {@code on_chain_index}가
     * {@code null}로 보인다. 그래서 굳힌 값을 결과에 실어 보낸다.
     *
     * @param job {@code null}이면 아직 만들 수 없다(규칙 미설정)
     */
    public record ShowCreation(ChainJob job, List<TeamSlot> teams) {

        /** 온체인 공연이 등록됐는가. */
        public boolean confirmed() {
            return job != null && job.getStatus() == ChainJob.Status.CONFIRMED;
        }

        /**
         * 규칙이 없어 {@code createShow} 를 만들 수 없는가. {@link #prerequisiteJobId()}의
         * {@code null}은 "이미 확정"과 이 경우를 가르지 못하므로, 서명을 내려주는 호출부는
         * 이것부터 본다 — 놓치면 프론트가 선행 없음으로 읽고 서명해 {@code ShowNotFound}로
         * revert 한다(2026-09-17 dev 공연 6).
         */
        public boolean notCreatable() {
            return job == null;
        }

        /**
         * 프론트가 기다려야 하는 선행 job 의 {@code jobId}. 확정됐거나 아직 만들 수 없으면
         * {@code null}이다. <b>이 판정은 여기 하나뿐이어야 한다</b> — 세 진입점이 각자
         * {@code getStatus()}를 보면 어느 하나가 규칙을 놓친다.
         */
        public String prerequisiteJobId() {
            return confirmed() || notCreatable() ? null : ChainJobIds.toJobId(job.getChainJobId());
        }
    }

    /**
     * {@code createShow} job 을 보장한다. 이미 있으면 그대로 돌려준다(멱등).
     *
     * <p><b>{@code REQUIRES_NEW}다.</b> 세 진입점이 전부 {@code prepare} 계열이고, 그쪽
     * 트랜잭션이 뒤에서 롤백되면 job 행이 사라진 채 {@code prerequisiteJobId}만 프론트로
     * 나가 <b>DB 에 없는 jobId 를 영원히 폴링</b>한다({@link UserSignedTxJobWriter}가 같은
     * 이유로 쓰는 패턴). 새 트랜잭션은 다른 커넥션이므로 <b>호출부는 이 메서드를 부르기 전에
     * {@code chain_job}의 FK 부모({@code member}·{@code wallet}·{@code performance}·
     * {@code team}·{@code ticket})를 UPDATE 하지 않는다</b> — 잠그면 InnoDB 가
     * {@code Lock wait timeout}까지 기다린다. 현재 호출부 셋은 앞이 전부 SELECT 다.
     *
     * <p>엔티티 대신 id 를 받는 것도 그래서다. 바깥 컨텍스트의 엔티티를 새 트랜잭션에서 만지면
     * 지연 로딩이 <b>중단된 트랜잭션의 커넥션</b>을 건드린다.
     *
     * <p><b>규칙이 아직 없으면 job 이 {@code null}이다.</b> 컨트랙트가 {@code rulesHash == 0}을
     * {@code ZeroRulesHash}로 거절하고 bp 합 10000 도 요구하므로({@code RevenueSplitter._validate})
     * {@code settlement_rule} 없이는 이 tx 를 만들 자체가 없다.
     *
     * @throws BusinessException 참여팀 리더 지갑이 없을 때({@code WALLET_NOT_FOUND})
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ShowCreation ensureShowCreated(Long performanceId, Long requesterMemberId) {
        Performance performance = performanceRepository.findById(performanceId)
                .orElseThrow(() -> BusinessException.of(ErrorCode.PERFORMANCE_NOT_FOUND));
        String key = CREATE_SHOW_KEY_PREFIX + performanceId;
        ChainJob existing = chainJobRepository.findByIdempotencyKey(key).orElse(null);

        if (existing != null && existing.getStatus() != ChainJob.Status.FAILED) {
            // 아직 아무것도 보내지 않았다면 그 사이 바뀐 참여팀을 반영해 순서를 다시 굳힌다.
            // SUBMITTED·CONFIRMED 는 건드리지 않는다 - 보낸 배열과 DB 가 갈린다.
            if (existing.getStatus() == ChainJob.Status.PENDING) {
                assignOnChainOrder(performance);
            }
            return new ShowCreation(existing, slotsOf(performanceId));
        }
        if (!hasSettlementRule(performanceId)) {
            return new ShowCreation(null, slotsOf(performanceId));
        }
        if (existing != null) {
            // FAILED 를 그대로 돌려주면 프론트가 죽은 jobId 를 무한 폴링한다. 재시도가 정본 키를
            // 쓸 수 있도록 옛 행의 UNIQUE 키를 풀어 주고 실패 이력은 남긴다.
            existing.retireIdempotencyKey();
            chainJobRepository.saveAndFlush(existing);
            log.warn("createShow job {} 이 FAILED 라 새 job 을 만든다 (performanceId={}, reason={})",
                    existing.getChainJobId(), performanceId, existing.getFailureReason());
        }
        assignOnChainOrder(performance);
        Member requester = requesterMemberId == null ? null
                : memberRepository.findById(requesterMemberId).orElse(null);
        ChainJob job = chainJobRepository.save(ChainJob.builder()
                .txType(ChainJob.TxType.CREATE_SHOW)
                .signerType(ChainJob.SignerType.OPERATOR)
                .requester(requester)
                .targetPerformanceId(performanceId)
                .targetTeamId(performance.getCreatorTeam().getTeamId())
                .idempotencyKey(key)
                .build());
        return new ShowCreation(job, slotsOf(performanceId));
    }

    /**
     * {@code createShow} 를 <b>만들 수 있는가</b> — 정산 규칙이 저장돼 있는가.
     *
     * <p>{@link #ensureShowCreated} 가 job 을 {@code null} 로 돌려주는 조건과 같은 판정이되
     * <b>부작용이 없다</b>. 보증금 tx 보고(API-performance-14)처럼 읽고 막기만 하는 자리는
     * {@code REQUIRES_NEW} 로 job 을 만드는 {@code ensureShowCreated} 를 부를 수 없고, 그렇다고
     * {@link #isCreated} 만 보면 "규칙이 없어 job 이 생길 수조차 없다"(사용자가 규칙을 저장해야
     * 한다)와 "job 이 아직 확정 전"(다시 시작하면 된다)이 한 코드로 뭉친다.
     *
     * <p>판정을 호출부로 가져가지 않는 이유는 이 클래스가 존재하는 이유와 같다 — 같은 선행
     * 조건이 세 곳에서 갈리면 어느 하나가 규칙을 놓친다.
     */
    public boolean hasSettlementRule(Long performanceId) {
        return settlementRuleRepository.findByPerformance_PerformanceId(performanceId).isPresent();
    }

    /**
     * {@code createShow} 를 <b>발의한 적이 있는가</b> — 그 공연에 {@code CREATE_SHOW} job 이
     * 하나라도 걸렸는가.
     *
     * <p>명세가 말하는 "{@code prepare} 발의 기록"이 이것이다(API-performance-14 404). prepare
     * ({@link #ensureShowCreated})가 {@code REQUIRES_NEW} 로 커밋하는 이 job 행이 prepare 가
     * 남기는 유일한 흔적이라, prepare 를 건너뛴 직접 호출은 여기서 걸린다.
     *
     * <p><b>상태를 보지 않는다.</b> {@code FAILED} 도 발의 기록이고 그때는
     * {@link #isCreated} 가 거짓이라 다음 게이트(409)가 받는다 — 여기는 "순서를 지켰는가"만
     * 묻는다. 멱등키가 아니라 {@code target_performance_id} 로 찾는 이유는
     * {@link ChainJob#retireIdempotencyKey()} 가 재시도 때 키를 반납해도 행은 남기 때문이다.
     *
     * <p>{@link #hasSettlementRule} 이 <b>먼저</b>다. 규칙이 없으면 prepare 를 불러도 job 이
     * 생기지 않아 여기가 거짓인데, 그 경우를 "prepare 부터 다시"로 보내면 사용자는 규칙을
     * 저장해야 한다는 것을 영영 모른다.
     */
    public boolean hasCreateShowJob(Long performanceId) {
        return chainJobRepository.existsByTargetPerformanceIdAndTxType(
                performanceId, ChainJob.TxType.CREATE_SHOW);
    }

    /**
     * 온체인 공연이 등록됐는가 — {@code createShow} job 이 {@code CONFIRMED}인가.
     *
     * <p><b>참여팀 구성 변경을 막는 기준이다.</b> 확정 뒤에는 온체인 {@code teamWallets}를
     * 고칠 방법이 없다({@code updateRules}는 비율·해시만 바꾼다 · 문서 13 §4.8). 그 뒤에 팀을
     * 더하거나 빼면 DB 와 체인이 영구히 갈린다.
     */
    public boolean isCreated(Long performanceId) {
        return chainJobRepository.findByIdempotencyKey(CREATE_SHOW_KEY_PREFIX + performanceId)
                .map(job -> job.getStatus() == ChainJob.Status.CONFIRMED)
                .orElse(false);
    }

    /**
     * 규칙이 <b>사실상 잠겼는가</b> — {@code createShow} job 이 있고 {@code FAILED} 가 아닌가.
     *
     * <p>{@link #isCreated}({@code CONFIRMED} 만)로는 <b>전송 중 구간이 열린다.</b> 워커가 tx 를
     * 보낸 뒤 확정 전({@code SUBMITTED})에 규칙을 바꾸면 온체인엔 옛 해시가 박히고 DB 만 새 해시가
     * 된다 — 되돌릴 방법이 없다. {@code PENDING} 도 안전하지 않다. "빌더가 최신 규칙을 읽는다"는
     * 요청 스레드와 워커 스레드의 경쟁이라, 빌더가 읽은 직후 저장이 들어오면 결과가 같다.
     *
     * <p>그래서 <b>job 이 생긴 시점부터</b> 규칙을 잠근다. 확정된 순서가 규칙 → {@code createShow}
     * → 보증금이므로, 보증금 준비가 job 을 건 순간 규칙은 개념적으로 이미 굳었다.
     * {@code FAILED} 만 열어 둔다 — 재시도가 새 규칙을 읽어 가야 한다.
     *
     * <p>참여팀 변경은 이것을 쓰지 않는다. {@code PENDING} 이면 {@link #ensureShowCreated} 가
     * 인덱스를 다시 굳히므로 막을 이유가 없고, 그쪽 기준은 {@link #isCreated} 다.
     */
    public boolean isRulesFrozen(Long performanceId) {
        return chainJobRepository.findByIdempotencyKey(CREATE_SHOW_KEY_PREFIX + performanceId)
                .map(job -> job.getStatus() != ChainJob.Status.FAILED)
                .orElse(false);
    }

    /**
     * {@code updateRules} job 의 멱등키 —
     * {@code updateRules:{performanceId}:{rulesHash}:{회차}}.
     *
     * <p><b>해시만으로는 안 된다(리뷰 !80 🔴 1).</b> A → B → A → B 로 되돌리면 두 번째 B 가
     * 첫 B 의 키를 만나 "이미 보냈다"로 조기 return 하고, 온체인은 A · DB 는 B 인 채
     * <b>몇 번을 저장해도 같은 키라 복구가 영영 안 된다.</b> 그래서 키는 UNIQUE 충돌만 피하고,
     * "보낼 필요가 있는가"는 {@link #latestUpdateRules}가 겨냥한 해시로 판정한다.
     *
     * <p>해시를 <b>전부</b> 싣는다(앞 16자가 아니다). {@link #targetRulesHash}가 이 키에서
     * 되읽어 확정 대조에 쓰므로 자르면 안 된다 — 그때는 {@code chain_job} 에 컬럼이 필요해진다.
     */
    public static String updateRulesKey(Long performanceId, String rulesHash, int sequence) {
        return UPDATE_RULES_KEY_PREFIX + performanceId + ":" + rulesHash + ":" + sequence;
    }

    /**
     * 그 job 이 <b>겨냥한</b> {@code rulesHash} — 멱등키에서 되읽는다. 아니면 {@code null}.
     *
     * <p>확정 대조({@code ChainJobConfirmationService})와 동기화 판정({@link #isRulesOutOfSync})이
     * 이 하나를 쓴다. <b>현재 DB 해시로 대조하면 안 된다</b> — 전송 뒤 규칙이 또 바뀌면 성공한
     * tx 가 {@code FAILED} 로 기록된다(리뷰 !80 🔴 3).
     */
    public static String targetRulesHash(ChainJob job) {
        String key = job == null ? null : job.getIdempotencyKey();
        if (key == null || !key.startsWith(UPDATE_RULES_KEY_PREFIX)) {
            return null;
        }
        // updateRules:{performanceId}:{rulesHash}:{회차} - 해시에는 ':' 가 없다.
        String[] parts = key.split(":");
        return parts.length >= 3 ? parts[2] : null;
    }

    /** 그 공연의 마지막 {@code UPDATE_RULES} job. 없으면 {@code null}. */
    public ChainJob latestUpdateRules(Long performanceId) {
        return chainJobRepository.findFirstByTargetPerformanceIdAndTxTypeOrderByChainJobIdDesc(
                performanceId, ChainJob.TxType.UPDATE_RULES).orElse(null);
    }

    /** 다음 전송의 회차. 키가 겹치지 않게만 하면 된다. */
    public int nextUpdateRulesSequence(ChainJob latest) {
        if (latest == null) {
            return 1;
        }
        String key = latest.getIdempotencyKey();
        try {
            return Integer.parseInt(key.substring(key.lastIndexOf(':') + 1)) + 1;
        } catch (RuntimeException e) {
            // 우리가 쓴 키가 아니다. chain_job_id 는 단조 증가하므로 충돌하지 않는다.
            return Math.toIntExact(latest.getChainJobId()) + 1;
        }
    }

    /**
     * <b>DB 해시와 온체인 해시가 갈려 있는가</b>(리뷰 !80 🔴 2).
     *
     * <p>종전 판정({@code PENDING}·{@code SUBMITTED} 만)은 <b>{@code FAILED} 구간을 열어 뒀다</b> —
     * job 이 revert 로 실패하면 DB 는 새 해시, 온체인은 옛 해시인데 동의 준비와 판매 시작이
     * 통과했다. 참여팀의 {@code agreeToRules} 는 전부 {@code RulesHashMismatch} 로 revert 하며
     * 가스만 태운다. 그래서 "전송 중인가"가 아니라 <b>"맞춰져 있는가"</b>를 묻는다.
     *
     * <p>동기화된 유일한 경우는 둘이다 — {@code updateRules} 를 보낸 적이 없거나
     * ({@code createShow} 가 박은 해시 그대로다), 마지막 job 이 <b>지금 해시를 겨냥해
     * {@code CONFIRMED}</b> 된 경우. 진행 중·실패·다른 해시는 전부 차단이고, 규칙을 다시
     * 저장하면 새 job 이 걸려 자연히 풀린다.
     *
     * <p>규칙 동의 준비(API-rule-03)와 판매 시작(API-rule-04)이 <b>둘 다 이 하나</b>를 본다 —
     * 판정이 갈리면 한쪽이 규칙을 놓친다.
     *
     * @param rulesHash 현재 {@code settlement_rule.rules_hash}
     */
    public boolean isRulesOutOfSync(Long performanceId, String rulesHash) {
        ChainJob latest = latestUpdateRules(performanceId);
        if (latest == null) {
            return false;
        }
        return latest.getStatus() != ChainJob.Status.CONFIRMED
                || !rulesHash.equalsIgnoreCase(targetRulesHash(latest));
    }

    /**
     * {@code createShow} 배열에 들어가는 참여팀을 그 순서대로. <b>배열을 만드는 쪽
     * ({@code ContractOperatorTxBuilder})·확정 대조({@code ChainJobConfirmationService})·응답이
     * 전부 이 하나를 쓴다</b> — 조건이 갈리면 보낸 배열과 대조 대상이 달라진다.
     *
     * <p>조건이 둘인 이유: {@code isAccepted()}는 "배열에 들어갈 자격"(수락 + 지갑 스냅샷 존재)
     * 이고 {@code on_chain_index != null}은 "이미 자리를 받았는가"다. 제외된 팀이 옛 인덱스를
     * 달고 남아 있을 수 있어 둘 다 본다.
     *
     * @param registered {@code status = REGISTERED}인 참여팀
     */
    public static List<PerformanceParticipant> onChainOrder(
            List<PerformanceParticipant> registered) {
        return registered.stream()
                .filter(PerformanceParticipant::isAccepted)
                .filter(p -> p.getOnChainIndex() != null)
                .sorted(Comparator.comparing(PerformanceParticipant::getOnChainIndex))
                .toList();
    }

    // ------------------------------------------------------------------ 내부

    private List<TeamSlot> slotsOf(Long performanceId) {
        return onChainOrder(registered(performanceId)).stream()
                .map(p -> new TeamSlot(p.getTeam().getTeamId(), p.getOnChainIndex(),
                        p.getWalletAddress()))
                .toList();
    }

    private List<PerformanceParticipant> registered(Long performanceId) {
        return participantRepository.findByPerformance_PerformanceIdAndStatus(performanceId,
                PerformanceParticipant.Status.REGISTERED);
    }

    /**
     * 팀 순서 확정 — 생성팀이 0번({@code hostTeamIndex})이고 나머지는 PK 오름차순이다.
     *
     * <p>결정론이어야 한다. 워커가 재시도하거나 다른 요청이 같은 공연을 건드려도 같은 배열이
     * 나와야 <b>보낸 tx 와 DB 가 같은 팀을 가리킨다</b>. 생성팀을 0번에 두는 것은 계약 문서
     * §3.1의 dust 귀속 주체와 맞추기 위해서다.
     *
     * <p>대상 선정은 {@code isAccepted()}만 본다({@code on_chain_index}는 보지 않는다) —
     * 여기가 그 값을 <b>부여하는</b> 자리라 그것으로 거르면 새 팀이 영영 자리를 못 받는다.
     */
    private void assignOnChainOrder(Performance performance) {
        Long hostTeamId = performance.getCreatorTeam().getTeamId();
        List<PerformanceParticipant> accepted =
                registered(performance.getPerformanceId()).stream()
                        .filter(PerformanceParticipant::isAccepted)
                        .sorted(Comparator.comparing(
                                PerformanceParticipant::getPerformanceParticipantId))
                        .toList();

        List<PerformanceParticipant> ordered = new ArrayList<>();
        accepted.stream().filter(p -> hostTeamId.equals(p.getTeam().getTeamId()))
                .forEach(ordered::add);
        accepted.stream().filter(p -> !hostTeamId.equals(p.getTeam().getTeamId()))
                .forEach(ordered::add);
        if (ordered.isEmpty() || !hostTeamId.equals(ordered.get(0).getTeam().getTeamId())) {
            // 생성팀이 참여팀 목록에 없다 = 공연 생성이 잘못됐다. 배열에 host 가 없으면
            // 컨트랙트가 HostIndexOutOfRange 로 revert 한다.
            throw BusinessException.of(ErrorCode.COMMON_INTERNAL_ERROR);
        }

        for (int index = 0; index < ordered.size(); index++) {
            PerformanceParticipant participant = ordered.get(index);
            participant.assignOnChainIndex(index);
            participant.snapshotWallet(leaderWallet(participant));
        }
    }

    /** 스냅샷 시점의 리더 지갑. 없으면 배열에 넣을 주소가 없어 여기서 막는다. */
    private String leaderWallet(PerformanceParticipant participant) {
        Wallet wallet = walletRepository
                .findByMember_MemberId(participant.getTeam().getLeader().getMemberId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.WALLET_NOT_FOUND));
        if (wallet.getStatus() == Wallet.Status.SUSPENDED) {
            throw BusinessException.of(ErrorCode.COMMON_FORBIDDEN);
        }
        return wallet.getAddress();
    }
}
