package com.ssafy.b204.common.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 운영 알림 발송기 — 로컬 {@link HttpServer}로 실제 HTTP 를 받는다(외부 호출 없음).
 *
 * <p>지키는 것: 비활성이면 호출 0, 본문 모양이 Mattermost incoming webhook 규격이다, 그리고
 * <b>웹훅이 죽어도(5xx·타임아웃·연결 거부) 예외가 밖으로 나가지 않는다.</b>
 */
class OpsAlertTest {

    private HttpServer server;
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile long delayMs = 0;
    private String url;

    @BeforeEach
    void startServer() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/hooks/abc", exchange -> {
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            if (delayMs > 0) {
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
        });
        server.start();
        url = "http://127.0.0.1:" + server.getAddress().getPort() + "/hooks/abc";
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    @DisplayName("웹훅 URL 이 비면 비활성 — HTTP 호출 0")
    void disabledWhenUrlBlank() {
        new OpsAlert("", "prod").send("x").join();
        new OpsAlert("   ", "prod").send("x").join();
        new OpsAlert(null, null).send("x").join();

        assertThat(bodies).isEmpty();
    }

    @Test
    @DisplayName("본문이 null·공백이면 보내지 않고 즉시 완료한다")
    void skipsBlankText() {
        OpsAlert alert = new OpsAlert(url, "prod");

        assertThat(alert.send(null)).isCompleted();
        assertThat(alert.send("  \n")).isCompleted();
        assertThat(bodies).isEmpty();
    }

    @Test
    @DisplayName("Mattermost 규격 {text, username} 로 POST 하고 환경 머리를 붙인다")
    void postsMattermostPayload() throws Exception {
        new OpsAlert(url, "prod").send("줄1\n\"따옴표\"").get(5, TimeUnit.SECONDS);

        assertThat(bodies).hasSize(1);
        JsonNode body = new ObjectMapper().readTree(bodies.get(0));
        assertThat(body.get("text").asText()).isEqualTo("[prod] 줄1\n\"따옴표\"");
        assertThat(body.get("username").asText()).isEqualTo("B204 Server");
    }

    @Test
    @DisplayName("웹훅이 5xx 여도 예외가 밖으로 나가지 않는다")
    void swallowsServerError() {
        status = 500;

        assertThatCode(() -> new OpsAlert(url, "").send("x").get(5, TimeUnit.SECONDS))
                .doesNotThrowAnyException();
        assertThat(bodies).hasSize(1);
    }

    @Test
    @DisplayName("웹훅이 타임아웃을 넘겨도 예외가 밖으로 나가지 않는다")
    void swallowsTimeout() {
        delayMs = 2_000;
        OpsAlert alert = new OpsAlert(url, "", Duration.ofMillis(200));

        assertThatCode(() -> alert.send("x").get(5, TimeUnit.SECONDS)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("연결 거부·잘못된 URL 이어도 예외가 밖으로 나가지 않는다")
    void swallowsConnectionRefusedAndBadUrl() throws Exception {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        OpsAlert refused = new OpsAlert("http://127.0.0.1:" + closedPort + "/x", "", Duration.ofSeconds(1));

        assertThatCode(() -> refused.send("x").get(5, TimeUnit.SECONDS)).doesNotThrowAnyException();
        assertThatCode(() -> new OpsAlert("::not a url::", "").send("x").get(5, TimeUnit.SECONDS))
                .doesNotThrowAnyException();
        assertThatCode(() -> new OpsAlert("ftp://example.invalid/x", "").send("x").join())
                .doesNotThrowAnyException();
    }
}
