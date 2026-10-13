package com.ssafy.b204.common.alert;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 운영자 알림 — Mattermost incoming webhook 에 직접 POST 한다(S15P21B204-78).
 *
 * <p><b>알림이 사고가 되면 안 된다.</b> {@link #send}는 호출 스레드를 막지 않고(비동기), 어떤 경우에도
 * 예외를 올리지 않는다. 전송 실패는 warn 로그 한 줄이다 — 워커·발행량 대사를 멈추는 것보다 알림 한 건을
 * 잃는 편이 낫다.
 *
 * <p>{@code b204.alert.webhook-url}(env {@code ALERT_WEBHOOK_URL})이 비면 비활성이고 본문을 로그로만 남긴다
 * (로컬·테스트 기본). 웹훅 URL 은 그 자체가 쓰기 권한이라 로그에 찍지 않는다 — 실패 로그도 예외
 * 클래스 이름만 남긴다(메시지에 호스트가 섞일 수 있다).
 *
 * <p>JDK {@link HttpClient}를 쓴다. 저장소의 OkHttp 는 web3j RPC 전용 클라이언트가 빈이 아닌 지역 객체로
 * 만들어지고, {@code sendAsync} 가 별도 executor 없이 비동기라 이쪽이 짧다.
 */
@Component
@Slf4j
public class OpsAlert {

    static final Duration TIMEOUT = Duration.ofSeconds(5);
    static final String USERNAME = "B204 Server";
    private static final ObjectMapper JSON = new ObjectMapper();

    /** {@code null} = 비활성. */
    private final URI webhook;
    /** 환경 머리 — {@code [prod] }. 프로파일이 없으면 빈 문자열. */
    private final String prefix;
    private final Duration timeout;
    private final HttpClient http;

    @Autowired
    public OpsAlert(@Value("${b204.alert.webhook-url:}") String webhookUrl,
                    @Value("${spring.profiles.active:}") String profile) {
        this(webhookUrl, profile, TIMEOUT);
    }

    OpsAlert(String webhookUrl, String profile, Duration timeout) {
        this.webhook = parse(webhookUrl);
        this.prefix = profile == null || profile.isBlank() ? "" : "[" + profile.trim() + "] ";
        this.timeout = timeout;
        this.http = HttpClient.newBuilder().connectTimeout(timeout).build();
        if (webhook == null) {
            log.info("운영 알림 웹훅 미설정 — 알림은 로그로만 남는다(ALERT_WEBHOOK_URL)");
        }
    }

    /** 절대 던지지 않는다. 반환값은 전송이 끝나면(성공·실패 무관) 정상 완료된다 — 테스트가 기다린다. */
    public CompletableFuture<Void> send(String text) {
        if (text == null || text.isBlank()) {
            log.debug("운영 알림 본문이 비어 보내지 않는다");
            return CompletableFuture.completedFuture(null);
        }
        String message = prefix + text;
        if (webhook == null) {
            log.info("운영 알림(웹훅 비활성): {}", message);
            return CompletableFuture.completedFuture(null);
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(webhook)
                    .timeout(timeout)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            JSON.writeValueAsString(Map.of("text", message, "username", USERNAME))))
                    .build();
            return http.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                    .handle((response, error) -> {
                        if (error != null) {
                            log.warn("운영 알림 전송 실패({}): {}", rootName(error), message);
                        } else if (response.statusCode() >= 300) {
                            log.warn("운영 알림 전송 실패(HTTP {}): {}", response.statusCode(), message);
                        }
                        return null;
                    });
        } catch (Exception e) {
            log.warn("운영 알림 전송 실패({}): {}", e.getClass().getSimpleName(), message);
            return CompletableFuture.completedFuture(null);
        }
    }

    private static URI parse(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        try {
            URI uri = URI.create(url.trim());
            if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) {
                throw new IllegalArgumentException("scheme");
            }
            return uri;
        } catch (IllegalArgumentException e) {
            log.warn("운영 알림 웹훅 URL 형식이 잘못돼 비활성으로 둔다(값은 찍지 않는다)");
            return null;
        }
    }

    private static String rootName(Throwable error) {
        Throwable t = error;
        while (t.getCause() != null && t != t.getCause()) {
            t = t.getCause();
        }
        return t.getClass().getSimpleName();
    }
}
