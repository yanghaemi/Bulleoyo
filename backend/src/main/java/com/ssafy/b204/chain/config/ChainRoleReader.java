package com.ssafy.b204.chain.config;

/**
 * 온체인 역할 주소 조회 — <b>{@link ChainRoleGuard} 하나만 쓰는 최소 창구</b>다.
 *
 * <p>인터페이스를 따로 두는 이유: 판정 규칙(같은 키인가·서버 키가 맞는가)은 순수 비교인데
 * 구현이 web3j {@code Contract}에 직접 묶이면 <b>노드 없이는 그 규칙을 테스트할 수 없다.</b>
 * {@code Web3j}를 mock 하는 방법은 {@code RemoteFunctionCall} 체인까지 흉내 내야 해서
 * 테스트가 web3j 내부 구조에 의존하게 된다. 조회 두 개만 잘라내면 규칙 검증은 mock 두 줄로 끝난다.
 *
 * <p>두 메서드 모두 <b>실패를 예외로 올린다</b>. 노드 무응답(IOException)과 컨트랙트 미배포
 * (빈 응답 → {@code ContractCallException})는 판정 근거가 아니라 "판정 불가"이며,
 * 그 구분은 {@link ChainRoleGuard}가 한다.
 */
public interface ChainRoleReader {

    /**
     * {@code YoYo.minter()} — 발행 권한을 가진 단일 주소.
     *
     * @throws Exception 노드 무응답·컨트랙트 미배포·revert. 호출부가 "판정 건너뜀"으로 처리한다
     */
    String minter() throws Exception;

    /**
     * {@code RevenueSplitter.operator()} — 집계·정산 실행 권한을 가진 단일 주소.
     *
     * @throws Exception 위와 같다
     */
    String operator() throws Exception;
}
