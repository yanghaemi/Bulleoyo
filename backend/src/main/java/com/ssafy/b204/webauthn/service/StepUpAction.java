package com.ssafy.b204.webauthn.service;

/**
 * 본인 확인(step-up)이 지키는 동작 — API v7 §7.W. 토큰은 <b>동작 + 대상</b> 하나에만 쓸 수 있다.
 *
 * <p>대상(targetId)은 동작마다 다르다. 프론트가 본인 확인 옵션(API-webauthn-03)을 받을 때 이 둘을
 * 보내고, 서버는 그 챌린지로 서명된 인증에만 이 범위의 토큰을 준다.
 *
 * <ul>
 *   <li>{@link #PAYMENT} — 주문 그룹 id(API-payment-01·02 {@code orderGroupId}). API-payment-03
 *   <li>{@link #RULE_AGREE} — 공연 id. API-rule-05 규칙 동의 서명 보고
 *   <li>{@link #DEPOSIT} — 공연 id. API-performance-14 보증금 APPROVE·DEPOSIT 서명 보고
 *   <li>{@link #SETTLEMENT_APPROVE} — 공연 id. API-settlement-08 정산 조기 동의
 *   <li>{@link #SETTLEMENT_RELEASE} — 공연 id. API-settlement-05 정산금 지급(release)
 * </ul>
 */
public enum StepUpAction {
    PAYMENT,
    RULE_AGREE,
    DEPOSIT,
    SETTLEMENT_APPROVE,
    SETTLEMENT_RELEASE
}
