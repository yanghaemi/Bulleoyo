package com.ssafy.b204.chain.config;

import java.io.IOException;
import java.util.Locale;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;

/**
 * 기동 직후 1회 — <b>MINTER와 OPERATOR가 서로 다른 키인지</b> 온체인에서 확인한다
 * (컨트랙트 감사 L-10, Jira S15P21B204-41).
 *
 * <p><b>왜 서버가 보는가.</b> {@code RevenueSplitter}는 생성자와 {@code rotateOperator}에서
 * {@code operator != YoYo.minter()}를 강제한다. 그러나 {@code YoYo}는 Splitter의 존재를 모르므로
 * 반대 방향 — admin이 {@code YoYo.rotateMinter(Splitter의 operator 주소)}를 부르는 경우 — 을
 * 막지 못한다. 그 순간 한 키가 <b>무한 발행 + 정산 실행</b>을 동시에 갖는다. 컨트랙트가 못 막는
 * 조합이므로 그 두 값을 모두 볼 수 있는 서버가 기동 때 본다.
 *
 * <p><b>판정.</b>
 *
 * <table>
 *   <tr><th>상황</th><th>처리</th><th>근거</th></tr>
 *   <tr><td>체인 변수 없음</td><td>빈 자체를 안 만든다</td>
 *       <td>키 없는 팀원 기동(개발 환경 안내 v1 §3.1)</td></tr>
 *   <tr><td>{@code minter == operator}</td><td><b>기동 실패</b></td>
 *       <td>감사 L-10. 시연 환경의 잘못된 키 구성을 조용히 넘기면 안 된다</td></tr>
 *   <tr><td>서버 키 2개가 온체인 역할 주소와 불일치</td><td><b>기동 실패</b></td>
 *       <td>B204_ENV에 다른 키를 넣은 경우. 워커가 계속 revert 나기 전에 잡는다</td></tr>
 *   <tr><td>노드 무응답·컨트랙트 미배포</td><td>WARN 1줄, 건너뜀</td>
 *       <td>AVAIL-02 degrade — 체인 장애가 서비스 기동을 막지 않는다</td></tr>
 * </table>
 *
 * <p><b>키 자체는 어디에도 남기지 않는다</b>(SEC — {@code ChainClientConfig} 주석과 같은 규칙).
 * 로그·예외 메시지에 들어가는 것은 유도된 주소뿐이며, 주소는 어차피 체인에 공개돼 있다.
 *
 * <p>빈 등록은 {@link ChainClientConfig#chainRoleGuard}가 한다. 스프링 의존을
 * {@link ApplicationRunner} 하나로 줄여 둔 이유는 <b>판정 규칙을 노드도 컨텍스트도 없이
 * 단위 테스트로 고정하기 위해서다</b>({@code ChainRoleGuardTest}).
 */
@Slf4j
public class ChainRoleGuard implements ApplicationRunner {

    /** 컨트랙트가 없는 주소로 {@code eth_call}하면 노드에 따라 이 값이 온다. 판정 근거가 못 된다. */
    private static final String ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    private final ChainRoleReader roleReader;

    /** 서버 MINTER 키에서 유도한 주소. 키가 없으면 {@code null} — 그때는 대조를 건너뛴다. */
    private final String serverMinterAddress;

    /** 서버 OPERATOR 키에서 유도한 주소. 키가 없으면 {@code null}. */
    private final String serverOperatorAddress;

    /**
     * @param serverMinterAddress   서버 MINTER 키에서 유도한 주소. {@code null}이면 그 키가 없다는 뜻
     * @param serverOperatorAddress 서버 OPERATOR 키에서 유도한 주소. {@code null} 허용
     */
    public ChainRoleGuard(ChainRoleReader roleReader,
                          String serverMinterAddress,
                          String serverOperatorAddress) {
        this.roleReader = roleReader;
        this.serverMinterAddress = serverMinterAddress;
        this.serverOperatorAddress = serverOperatorAddress;
    }

    /**
     * {@code ApplicationRunner}라서 <b>컨텍스트가 다 뜬 뒤</b> 한 번 돈다. 빈 생성 중에 RPC를 때리면
     * 노드가 느릴 때 초기화 전체가 그만큼 늘어지고, 실패 시점의 컨텍스트 상태도 읽기 어렵다.
     * 여기서 예외를 던지면 Spring Boot가 컨텍스트를 닫고 프로세스를 종료한다 = 기동 실패.
     */
    @Override
    public void run(ApplicationArguments args) {
        verify();
    }

    /** 판정 본체. 통과하면 조용히 끝나고, 위반이면 {@link IllegalStateException}이다. */
    public void verify() {
        String onChainMinter;
        String onChainOperator;
        try {
            onChainMinter = roleReader.minter();
            onChainOperator = roleReader.operator();
        } catch (IOException e) {
            // 노드가 안 뜬 로컬·공용 노드 순단. 서비스는 체인 없이도 떠야 한다(AVAIL-02).
            log.warn("체인 역할 검증 건너뜀 — 노드 응답 없음 ({})", e.getClass().getSimpleName());
            return;
        } catch (Exception e) {
            // 빈 응답(0x)·revert = 그 주소에 컨트랙트가 없다. 첫 배포 전 구성에서 정상적으로 난다.
            log.warn("체인 역할 검증 건너뜀 — 컨트랙트 응답 없음 ({}). 주소가 배포본과 맞는지 확인하라.",
                    e.getClass().getSimpleName());
            return;
        }

        if (isBlankOrZero(onChainMinter) || isBlankOrZero(onChainOperator)) {
            log.warn("체인 역할 검증 건너뜀 — 역할 주소가 비어 있다(minter={}, operator={}).",
                    onChainMinter, onChainOperator);
            return;
        }

        if (sameAddress(onChainMinter, onChainOperator)) {
            throw new IllegalStateException(
                    "감사 L-10: MINTER와 OPERATOR가 같은 키다. admin이 rotateMinter/rotateOperator로 분리하라"
                            + " (YoYo.minter=" + onChainMinter
                            + ", RevenueSplitter.operator=" + onChainOperator + ")");
        }

        // 서버가 두 키를 다 들고 있을 때만 대조한다. 한쪽만 있는 구성(예: 조회 전용 인스턴스)에서
        // 없는 키를 불일치로 볼 수는 없다.
        if (serverMinterAddress != null && serverOperatorAddress != null) {
            requireMatch("MINTER", serverMinterAddress, onChainMinter, "YoYo.minter()");
            requireMatch("OPERATOR", serverOperatorAddress, onChainOperator,
                    "RevenueSplitter.operator()");
        }

        log.info("체인 역할 검증 OK — minter={}, operator={}", onChainMinter, onChainOperator);
    }

    /** 서버 키 주소 ≠ 온체인 역할 주소면 기동 실패. 메시지에는 주소만 넣는다(키는 금지). */
    private void requireMatch(String wallet, String serverAddress, String onChainAddress, String view) {
        if (!sameAddress(serverAddress, onChainAddress)) {
            throw new IllegalStateException(
                    wallet + " 키가 온체인 역할과 다르다 — 서버 키 주소=" + serverAddress
                            + ", " + view + "=" + onChainAddress
                            + ". B204_ENV의 키를 배포된 컨트랙트의 역할 주소로 맞춰라(키 값은 로그에 남기지 않는다).");
        }
    }

    /** 주소 비교는 대소문자 무시 — 체크섬 표기(EIP-55)와 소문자 표기가 섞여 들어온다. */
    private static boolean sameAddress(String left, String right) {
        return left.trim().toLowerCase(Locale.ROOT).equals(right.trim().toLowerCase(Locale.ROOT));
    }

    private static boolean isBlankOrZero(String address) {
        return address == null || address.isBlank() || sameAddress(address, ZERO_ADDRESS);
    }
}
