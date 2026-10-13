package com.ssafy.b204.chain.config;

import com.ssafy.b204.common.config.ChainProperties;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.http.HttpService;

/**
 * 체인 클라이언트 빈 — Kaia Kairos 단일(기술 스택 v3 §3).
 *
 * <p><b>여기 있는 빈은 전부 조건부다.</b> 체인 변수가 하나도 없어도 애플리케이션은 기동돼야
 * 하고({@code ChainConfigurationTest}), 그때는 이 설정이 빈을 하나도 만들지 않는다. 주입받는 쪽은
 * {@code ObjectProvider}나 {@code @Nullable}로 부재를 견딘다 — 필수 주입을 걸면 키 없는 팀원의
 * 로컬 기동이 막힌다.
 *
 * <p><b>{@code Web3j}는 표준 {@code org.web3j.protocol.Web3j} 하나만 쓴다.</b> Kaia 확장에도
 * 이름이 똑같은 {@code org.web3j.protocol.kaia.Web3j}가 있어 한 파일에서 섞으면 FQCN 지옥이 되고,
 * 확장 쪽은 {@code JsonRpc2_0Web3j}를 상속하므로 우리가 쓰는 호출
 * ({@code eth_sendRawTransaction}·{@code eth_getTransactionReceipt}·{@code eth_call})은
 * 표준 인터페이스로 전부 커버된다(PoC 4 RESULT §3). {@code kaia_*} 네임스페이스 RPC가 실제로
 * 필요해지면 그때 별도 빈으로 추가한다.
 *
 * <p><b>개인키는 어디에도 찍지 않는다.</b> 로그·예외 메시지·toString 전부. 아래 로그가 주소만
 * 남기는 이유다(주소는 §0.7의 fee payer 노출 예외에 해당해 어차피 프론트에 내려간다).
 */
@Configuration
@RequiredArgsConstructor
@Slf4j
public class ChainClientConfig {

    /** 운영지갑(fee payer) 자격증명 빈 이름. 주입 지점이 두 키를 헷갈리지 않도록 상수로 고정한다. */
    public static final String OPERATOR_CREDENTIALS = "operatorCredentials";

    /** YoYo 발행 전용 키 빈 이름. */
    public static final String MINTER_CREDENTIALS = "minterCredentials";

    private final ChainProperties chainProperties;

    /**
     * Kairos JSON-RPC 클라이언트. RPC URL과 컨트랙트 주소 2개가 모두 있을 때만 만든다.
     *
     * <p>타임아웃을 명시하는 이유: 기본 OkHttp는 읽기 타임아웃이 10초인데 공용 노드가 늦을 때
     * 워커 스레드가 그대로 묶인다. 대납 전송은 즉시 응답(txHash)이라 20초면 충분하고, 그보다 오래
     * 걸리면 재시도가 낫다.
     */
    @Bean(destroyMethod = "shutdown")
    @Conditional(ChainConditions.ReadOnlyConfigured.class)
    public Web3j web3j() {
        OkHttpClient httpClient = new OkHttpClient.Builder()
                .connectTimeout(Duration.ofSeconds(5))
                .readTimeout(Duration.ofSeconds(20))
                .writeTimeout(Duration.ofSeconds(20))
                .build();
        log.info("체인 클라이언트 활성화 — network={} chainId={}",
                chainProperties.networkName(), chainProperties.chainId());
        // 표준 org.web3j.protocol.Web3j 가 아니라 Kaia 확장 클래스로 만든다(이름이 같아 FQCN).
        // 확장 클래스는 ethSendRawTransaction 에서 raw tx 첫 바이트가 Kaia 타입(0x08~0x4a)이면
        // eth_ 대신 kaia_sendRawTransaction 으로 보낸다. 표준 클래스로 0x31 대납 tx 를 보내면
        // 노드가 `-32000 undefined tx type` 으로 거절한다(2026-09-07 E2E 실측). 그 외 eth_* 호출은 같다.
        return org.web3j.protocol.kaia.Web3j.build(new HttpService(chainProperties.rpcUrl(), httpClient));
    }

    /**
     * 온체인 역할 주소 조회기. {@code Web3j}와 같은 조건이다 — 컨트랙트 주소 없이는 읽을 곳이 없다.
     */
    @Bean
    @Conditional(ChainConditions.ReadOnlyConfigured.class)
    public ChainRoleReader chainRoleReader(Web3j web3j) {
        return new ContractChainRoleReader(web3j, chainProperties);
    }

    /**
     * 기동 시 역할 키 분리 검증(감사 L-10). 서버 키가 없으면 주소가 {@code null}로 들어가고
     * 온체인 두 주소 비교만 한다 — 키 없는 팀원도 잘못된 컨트랙트 구성은 알게 된다.
     *
     * <p>{@code ObjectProvider}로 받는 이유: 키 빈은 키가 있을 때만 존재한다. 필수 주입을 걸면
     * 키 없는 로컬 기동이 막힌다({@code ChainConfigurationTest}).
     */
    @Bean
    @Conditional(ChainConditions.ReadOnlyConfigured.class)
    public ChainRoleGuard chainRoleGuard(
            ChainRoleReader chainRoleReader,
            @Qualifier(MINTER_CREDENTIALS) ObjectProvider<KaiaCredentials> minterCredentials,
            @Qualifier(OPERATOR_CREDENTIALS) ObjectProvider<KaiaCredentials> operatorCredentials) {
        return new ChainRoleGuard(chainRoleReader,
                addressOf(minterCredentials), addressOf(operatorCredentials));
    }

    /** 키 빈이 있으면 그 주소, 없으면 {@code null}. 개인키는 여기서도 밖으로 나가지 않는다. */
    private static String addressOf(ObjectProvider<KaiaCredentials> provider) {
        KaiaCredentials credentials = provider.getIfAvailable();
        return credentials == null ? null : credentials.getAddress();
    }

    /** OPERATOR = fee payer. 대납 서명과 일반 운영 tx 서명을 모두 이 키가 한다. */
    @Bean(OPERATOR_CREDENTIALS)
    @Conditional(ChainConditions.OperatorKeyPresent.class)
    public KaiaCredentials operatorCredentials() {
        return credentials(ChainWallet.OPERATOR, chainProperties.operatorPrivateKey());
    }

    /** MINTER = YoYo 발행 전용. {@code MINT} job만 이 키로 서명한다. */
    @Bean(MINTER_CREDENTIALS)
    @Conditional(ChainConditions.MinterKeyPresent.class)
    public KaiaCredentials minterCredentials() {
        return credentials(ChainWallet.MINTER, chainProperties.minterPrivateKey());
    }

    /**
     * 키 문자열 → 자격증명. {@code 0x} 접두는 있어도 없어도 된다({@code Numeric.toBigInt}가 정리).
     *
     * <p>키가 <b>있는데 형식이 틀리면</b> 기동을 세운다. 값이 비어 있는 것(= 키 없는 팀원)과
     * 잘못 넣은 것은 다른 사건이고, 후자를 조용히 넘기면 운영에서 "왜 체인이 안 도나"로 나타난다.
     * 예외 메시지에는 지갑 이름만 넣는다 — 키 값도, 그 일부도 넣지 않는다.
     */
    private KaiaCredentials credentials(ChainWallet wallet, String privateKey) {
        try {
            KaiaCredentials credentials = KaiaCredentials.create(privateKey.trim());
            log.info("{} 지갑 로드 — address={}", wallet, credentials.getAddress());
            return credentials;
        } catch (RuntimeException e) {
            // e를 cause로 달지 않는다. web3j 예외 메시지에 입력값이 들어가는 경우가 있다.
            throw new IllegalStateException(
                    wallet + " 개인키 형식이 올바르지 않다. 32바이트 hex인지 확인하라(값은 로그에 남기지 않는다).");
        }
    }
}
