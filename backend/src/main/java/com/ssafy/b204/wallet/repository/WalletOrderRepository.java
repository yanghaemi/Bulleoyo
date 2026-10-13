package com.ssafy.b204.wallet.repository;

import com.ssafy.b204.payment.entity.Payment;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 지갑 이력이 결제 테이블에서 읽는 <b>단 한 가지</b> — {@code PURCHASE} 행이 가리킬 주문.
 *
 * <p>명세 API-wallet-02의 {@code PURCHASE} 예시는 {@code walletTxId: "pay_8801"} ·
 * {@code refType: "ORDER"} · {@code refId}(주문) · {@code title: "합정 3밴드 합동공연 · 일반
 * 2매"}다. {@code chain_job}에는 주문 컬럼이 없어({@code PaymentService}가 "chain_job 에 주문
 * 컬럼이 없어 payment 쪽 링크로 되짚는다"고 적어 둔 그 사정) 이 역참조가 없으면 결제 행이
 * {@code job_}·{@code CHAIN_JOB}·제목 없음으로 나간다.
 *
 * <p>{@code WalletDepositReturnRepository}와 같은 이유로 wallet 패키지에 <b>좁은 조회 하나</b>만
 * 연다 — {@code Payment}는 payment 도메인 소유라 남의 리포지토리를 지갑 화면 사정으로 넓히지
 * 않는다.
 */
public interface WalletOrderRepository extends Repository<Payment, Long> {

    /**
     * 이 {@code PURCHASE} job들이 속한 결제 — 주문·공연·주문항목·등급까지 한 번에 읽는다.
     *
     * <p>목록 한 페이지의 job id를 모아 <b>한 번</b>만 부른다. 행마다 부르면 N+1이고, fetch join
     * 없이 주문만 읽으면 제목(공연)과 등급에서 다시 N+1이 난다.
     */
    @Query("""
            select distinct p from Payment p
              join fetch p.ticketOrder o
              join fetch o.performance
              join fetch o.items i
              join fetch i.ticketType
             where p.purchaseChainJobId in :jobIds
            """)
    List<Payment> findByPurchaseChainJobIds(@Param("jobIds") Collection<Long> jobIds);
}
