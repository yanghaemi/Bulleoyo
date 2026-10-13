package com.ssafy.b204.ticket.service;

import com.ssafy.b204.common.support.IdempotencyGuard;
import java.time.Duration;
import org.springframework.stereotype.Component;

/**
 * 주문 생성 멱등키 저장소 — API v6 §0.8.
 *
 * <blockquote>키 + 요청 해시를 <b>24시간</b> 저장. 같은 키·같은 요청 재호출 시 <b>최초 응답을
 * 그대로 재생</b>하며 부작용을 재실행하지 않는다(REL-04). 같은 키에 다른 요청 본문이 오면
 * {@code 409 COMMON_CONFLICT}.</blockquote>
 *
 * <p>결제(API-payment-01)는 {@code payment.idempotency_key}가 NOT NULL UNIQUE라 DB가 이 역할을
 * 하지만, <b>{@code ticket_order}에는 멱등키 컬럼이 없다</b>(ERD v5). 새 컬럼을 만들지 않고
 * Redis에 둔다 — 24시간 뒤 사라져야 하는 값이라 테이블보다 맞다.
 *
 * <p>⚠️ <b>이 키는 §0.12 규약 표에 없다.</b> §0.8이 저장을 명시적으로 요구하는데 §0.12가 키를
 * 정의하지 않아 이름을 새로 지었다(be_*_endpoints.md의 "명세 확인 필요"). 서버 내부 값이라
 * 클라이언트 계약은 아니지만 §0.12에 추가돼야 한다.
 *
 * <p><b>[2026-09-09] 조회 후 기록 → 처리 전 선점으로 바꿨다.</b> 이전 구현은
 * {@code findFirstOrderId}(조회) → 재고 차감 → 주문 저장 → {@code remember}(기록) 순서였고
 * 기록이 {@code SET}이라, 두 요청이 겹치면 <b>둘 다 조회에서 빈 값을 받아 주문 2건 + 재고 2배
 * 차감</b>이 났다. 원자성은 {@link IdempotencyGuard}가 {@code SET NX}로 만든다 — 자세한 값
 * 형식·TTL 근거는 그쪽 주석에 있다.
 */
@Component
public class OrderIdempotencyStore {

    /** {@code idem:order:{memberId}:{Idempotency-Key}} — 회원 범위로 가둬 교차 재생을 막는다. */
    public static final String KEY_PREFIX = "idem:order:";

    /** §0.8 — 보존 24시간. */
    public static final Duration TTL = IdempotencyGuard.COMPLETED_TTL;

    private final IdempotencyGuard guard;

    public OrderIdempotencyStore(IdempotencyGuard guard) {
        this.guard = guard;
    }

    /**
     * 주문을 만들기 <b>전에</b> 자리를 잡는다.
     *
     * @return 최초 요청이면 {@code firstAttempt()}가 참인 예약, 이미 끝난 같은 요청이면
     *         {@code replayed()}에 최초 {@code orderId}
     * @throws com.ssafy.b204.common.error.BusinessException 같은 키·다른 본문이거나 같은 키가
     *         처리 중이면 {@code COMMON_CONFLICT}(409)
     */
    public IdempotencyGuard.Reservation begin(Long memberId, String idempotencyKey,
                                              String requestBody) {
        return guard.begin(IdempotencyGuard.key(KEY_PREFIX, memberId, idempotencyKey), requestBody);
    }

    /** 커밋 이후에 부른다 — 아직 보이지 않는 {@code orderId}를 재생시키지 않기 위해서다. */
    public void complete(IdempotencyGuard.Reservation reservation, Long orderId) {
        guard.complete(reservation, orderId);
    }

    /** 실패·롤백 — 잡아 둔 자리를 돌려준다. */
    public void release(IdempotencyGuard.Reservation reservation) {
        guard.release(reservation);
    }
}
