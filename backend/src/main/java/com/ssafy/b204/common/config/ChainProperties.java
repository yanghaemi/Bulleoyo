package com.ssafy.b204.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 체인 설정 — Kaia Kairos 단일(기술 스택 v3 §3).
 *
 * <p><b>모든 값이 비어 있어도 애플리케이션은 기동돼야 한다</b>(개발 환경 안내 v1 §3.1).
 * 키가 없는 팀원이 나머지 API를 개발해야 하므로, {@link #isConfigured()}가 {@code false}면
 * 체인 빈을 만들지 않고 체인을 타는 경로만 실패시킨다. 기동은 절대 막지 않는다.
 *
 * <p>서버가 가진 키는 <b>OPERATOR(운영지갑 = fee payer)·MINTER 2개뿐</b>이다(API v6 §0 전제).
 * 사용자 개인키·니모닉·MPC 샤드는 받지도 저장하지도 않는다 — ERD {@code wallet}에 키 컬럼이 없다.
 * ADMIN 키(컨트랙트 배포·pause·rotate)는 서버에 넣지 않는다 — Jenkins Credentials 전용.
 */
@ConfigurationProperties(prefix = "b204.chain")
public record ChainProperties(
        String rpcUrl,
        long chainId,
        String operatorPrivateKey,
        String minterPrivateKey,
        /**
         * OPERATOR(운영지갑 = fee payer) <b>주소</b>. 개인키가 아니라 공개 정보이며
         * {@code blockchain/deployments/kairos.json}의 {@code roles.operator}와 같은 값이다.
         *
         * <p>API v6 §0.4의 {@code signRequests[].feePayer}로 <b>응답에 나가는 유일한 서버 주소</b>다
         * (§0.7 비노출 규칙의 예외 1개). 개인키에서 파생할 수도 있지만, 키가 없는 환경에서도
         * {@code prepare}가 동작해야 해서 주소를 따로 받는다.
         */
        String operatorAddress,
        Contract contract
) {

    public record Contract(String yoyoAddress, String splitterAddress) {

        public boolean isConfigured() {
            return hasText(yoyoAddress) && hasText(splitterAddress);
        }
    }

    /** 체인 호출이 가능한 상태인지. RPC와 운영 키 2개, 컨트랙트 주소 2개가 모두 있어야 한다. */
    public boolean isConfigured() {
        return hasText(rpcUrl)
                && hasText(operatorPrivateKey)
                && hasText(minterPrivateKey)
                && contract != null
                && contract.isConfigured();
    }

    /** 읽기 전용 조회(잔액·발행량)만 가능한 상태인지. 서명 키 없이 RPC + 주소만 있으면 된다. */
    public boolean isReadOnlyConfigured() {
        return hasText(rpcUrl) && contract != null && contract.isConfigured();
    }

    /** {@code prepare}가 {@code feePayer}를 채울 수 있는 상태인지. 주소만 있으면 된다. */
    public boolean hasFeePayerAddress() {
        return hasText(operatorAddress);
    }

    /** 익스플로러 링크 베이스 — API v6 §0.7. 서버가 완성된 절대 URL을 내려준다. */
    public String explorerBaseUrl() {
        return "https://kairos.kaiascan.io";
    }

    /** API v6 §0.7 — {@code network} 필드값. */
    public String networkName() {
        return "kaia-kairos";
    }

    /** API v6 §0.7 — {@code chainIdHex}. */
    public String chainIdHex() {
        return "0x" + Long.toHexString(chainId);
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
