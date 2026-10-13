package com.ssafy.b204.verify.service;

import java.util.List;
import java.util.Optional;

/**
 * 검증 데이터가 읽어야 하는 온체인 값 — <b>verify 소유의 임시 포트</b>.
 *
 * <p>{@code settlement.service.SettlementChainReader}와 같은 이유·같은 모양으로 도메인 안에 둔다
 * (chain-integration §6의 {@code chain.port.ChainReader}가 열리면 두 인터페이스를 함께 지우고
 * 주입 지점만 바꾼다). settlement 쪽 인터페이스를 그대로 쓰지 않는 이유는 <b>검증이 더 많이 읽기
 * 때문</b>이다 — {@code rulesHashOf}·{@code agreedOf}·{@code teamWalletsOf}·
 * {@code hostTeamIndexOf}는 정산 게이트에 필요 없어 그쪽에 없고,
 * 남의 도메인 인터페이스에 메서드를 더하지 않는다(오민근 소유 파일).
 *
 * <p>전부 무료 {@code eth_call}이다. 실패·미설정은 예외가 아니라 {@link Optional#empty()}다.
 *
 * <p><b>API-verify-01에서 empty가 뜻하는 것은 "대사 불가"이지 "통과"가 아니다.</b> 검증 응답은
 * 온체인 값을 DB 사본으로 대체하지 않는다 — 대조할 두 값이 같은 출처가 되면 그 순간 이 API는
 * 거짓말을 하게 된다. 그래서 호출부는 empty를 만나면 <b>마지막 캐시 + {@code stale:true}</b>로
 * 물러서고, 캐시도 없으면 502({@code COMMON_EXTERNAL_SERVICE_ERROR})로 끝낸다.
 */
public interface VerifyChainReader {

    /** 체인 설정(RPC·컨트랙트 주소)이 있어 조회를 시도할 수 있는가. */
    boolean isAvailable();

    /** R = 분배 대상 총액. 보증금은 포함되지 않는다(별도 계정). */
    Optional<Long> escrowOf(long showId);

    /** 납부된 보증금 잔액. {@link #escrowOf}와 분리된 계정이다. */
    Optional<Long> depositOf(long showId);

    /** 팀별 관객 선택 카운터. 배열 인덱스 = {@code teamIndex}. */
    Optional<long[]> choiceCountsOf(long showId);

    /** {@code aggregate}가 온체인에서 확정한 팀별 몫. release 전에는 "확정 예정 금액"이다. */
    Optional<long[]> payoutsOf(long showId);

    /** 잠긴 규칙 해시({@code bytes32}) — {@code 0x} + 64 hex. 서버 {@code rules_hash}의 대조 상대다. */
    Optional<String> rulesHashOf(long showId);

    /** 팀 리더 지갑이 온체인에서 동의했는가. 서버 {@code rule_agreement.status}의 대조 상대다. */
    Optional<Boolean> agreedOf(long showId, String wallet);

    /**
     * {@code createShow}가 잠근 팀 지갑 배열. <b>순서가 곧 {@code teamIndex}이고, 이것이 팀 순서의
     * 정본이다</b> — 서버가 매긴 순서가 맞는지 이 배열로 대조한다.
     */
    Optional<List<String>> teamWalletsOf(long showId);

    /** dust 귀속 팀의 인덱스. 서버 {@code SettlementTeams.hostIndex}의 대조 상대다. */
    Optional<Integer> hostTeamIndexOf(long showId);
}
