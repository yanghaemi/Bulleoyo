package com.ssafy.b204.settlement.service;

import com.ssafy.b204.settlement.event.SettlementPayoutConfirmedEvent;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import com.ssafy.b204.wallet.service.WalletBalanceRefresher;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * {@code RELEASE}·{@code DEPOSIT_RETURN} 확정으로 코인을 받은 지갑들의 {@code wallet:balance}
 * 캐시를 다시 읽는다 — API v6 §0.12 갱신 시점 ②의 <b>수신 지갑 쪽</b>.
 *
 * <p>왜 필요한지는 {@link SettlementPayoutConfirmedEvent} javadoc(2026-09-10 리허설 실측).
 *
 * <h2>왜 확정 반영 안에서 직접 부르지 않고 커밋 뒤 이벤트인가</h2>
 *
 * <p>확정 반영은 <b>job 하나가 트랜잭션 하나</b>다 —
 * {@link SettlementConfirmationService#applyConfirmedJobs()}가 job 마다 {@code REQUIRES_NEW}로
 * 경계를 열고 {@code apply}는 그 트랜잭션에 얹힌다. 그 안에서
 * {@link WalletBalanceRefresher#refresh}를 부르면 팀 수만큼의 {@code eth_call}(네트워크 I/O)이
 * <b>열린 DB 트랜잭션 안에서</b> 일어난다. 트랜잭션이 job 하나로 좁아졌다고 괜찮아지지 않는다 —
 * MR !125 이후 그 트랜잭션은 정산 행에 <b>쓰기 잠금</b>({@code PESSIMISTIC_WRITE})을 쥐고 있어,
 * 노드가 느리면 커넥션과 그 행 잠금을 그 시간만큼 붙잡고 같은 정산을 건드리는 재집계 API를
 * 뒤에 줄 세운다. !125 가 확정 반영의 {@code eth_call} 3회를 잠금 <b>앞</b>으로 옮긴 것도,
 * D-39 리뷰가 {@code ReleasedSettlementLoader}를 대사 트랜잭션 밖으로 떼어낸 것도 같은 이유다.
 *
 * <p>그래서 확정 반영은 이벤트만 던지고 실제 조회는 {@code AFTER_COMMIT}에서 한다. <b>커밋 뒤라
 * 행 잠금이 이미 풀려 있어</b> 네트워크에 얼마가 걸리든 다른 트랜잭션을 밀지 않는다. 부수 효과가
 * 셋 따라온다.
 *
 * <ul>
 *   <li><b>확정을 되돌리지 않는다</b> — 커밋이 이미 끝났으므로 여기서 무슨 일이 나도 상태 전이는
 *       그대로다. 캐시는 원장이 아니다.
 *   <li><b>롤백된 반영은 갱신하지 않는다</b> — 트랜잭션이 깨지면 이벤트도 발행되지 않는다.
 *       직접 호출이었다면 롤백된 release에 대해 캐시만 갱신하는 일이 생긴다.
 *   <li>settlement → wallet 방향 의존이 하나 생긴다({@link WalletRepository} ·
 *       {@link WalletBalanceRefresher}). 둘 다 wallet 도메인(양해미) 소유지만 호출만 하고,
 *       {@code WalletBalanceRefresher}는 애초에 "부르는 곳"을 전제로 만들어진 클래스다
 *       (그 javadoc: "부르는 곳은 체인 워커다").
 * </ul>
 *
 * <h2>실패는 조용하다</h2>
 *
 * <p>노드를 못 읽으면 {@code refresh}가 {@link Optional#empty()}를 돌려주고 캐시를 건드리지
 * 않는다(그 클래스의 설계). 예외가 나더라도 여기서 삼킨다 — 이미 커밋된 상태 전이를 되돌릴
 * 방법이 없고, 되돌려서도 안 된다. 등록되지 않은 주소는 DEBUG 한 줄로 넘긴다(온체인 팀 지갑이
 * 반드시 우리 {@code wallet} 테이블에 있어야 할 이유는 없다).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SettlementBalanceRefreshListener {

    private final WalletRepository walletRepository;
    private final WalletBalanceRefresher balanceRefresher;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPayoutConfirmed(SettlementPayoutConfirmedEvent event) {
        // 같은 지갑이 두 번 들어오면(리더가 두 팀을 겸하는 경우) 한 번만 읽는다.
        Set<String> addresses = new LinkedHashSet<>(event.recipientAddresses());
        for (String address : addresses) {
            try {
                refreshOne(address);
            } catch (RuntimeException e) {
                log.warn("수령 지갑 잔액 캐시 갱신 실패 — performanceId={} type={}: {}",
                        event.performanceId(), event.txType(), e.toString());
            }
        }
    }

    private void refreshOne(String address) {
        if (address == null || address.isBlank()) {
            return;
        }
        Optional<Wallet> wallet = findByAddressIgnoreCase(address);
        if (wallet.isEmpty()) {
            log.debug("수령 지갑이 등록돼 있지 않아 캐시 갱신을 건너뛴다 — address={}", address);
            return;
        }
        balanceRefresher.refresh(wallet.get().getWalletId());
    }

    /**
     * 주소 대소문자를 무시하고 찾는다.
     *
     * <p>{@code settlement_share.wallet_address}는 컨트랙트에 잠긴 값의 스냅샷이라 EIP-55 체크섬
     * 표기(대소문자 섞임)로 들어올 수 있고, {@code wallet.address}는 등록 경로에 따라 소문자일 수
     * 있다. MySQL {@code utf8mb4_0900_ai_ci} 아래에서는 첫 조회가 이미 대소문자를 무시하지만,
     * <b>대조 규칙을 collation에만 맡기지 않는다</b> — 컬럼 collation이 바뀌거나 조회가 Java로
     * 옮겨지면 조용히 못 찾게 되고, 못 찾은 결과는 예외가 아니라 "미등록"으로 넘어가 버린다.
     */
    private Optional<Wallet> findByAddressIgnoreCase(String address) {
        Optional<Wallet> found = walletRepository.findByAddress(address);
        if (found.isPresent()) {
            return found;
        }
        String lower = address.toLowerCase(Locale.ROOT);
        return lower.equals(address) ? Optional.empty() : walletRepository.findByAddress(lower);
    }
}
