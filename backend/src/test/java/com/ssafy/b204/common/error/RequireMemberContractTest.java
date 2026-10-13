package com.ssafy.b204.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@code requireMember(MemberPrincipal)}가 <b>두 실패를 갈라 던지는지</b> 지킨다.
 *
 * <ul>
 *   <li>{@code me == null} → {@code COMMON_UNAUTHORIZED} : 이 요청이 인증되지 않았다.
 *       클라이언트는 재발급을 한 번 시도한다.
 *   <li>토큰은 유효한데 <b>그 회원 행이 없다</b> → {@code AUTH_TOKEN_INVALID} : 재발급해도
 *       같은 결과다. 클라이언트는 즉시 로그아웃시켜 재로그인으로 보낸다.
 * </ul>
 *
 * <p>둘째를 {@code COMMON_UNAUTHORIZED}로 내면 재발급이 성공한 뒤에도 같은 401이 돌아온다.
 * 프론트는 화면에 남은 채 모든 쿼리가 조용히 실패하고, 사용자에게는 "버튼을 눌러도 아무 일이
 * 없다"로 보인다(9/22 P-06 규칙 동의 재현).
 *
 * <p>같은 헬퍼가 서비스마다 하나씩 복사돼 있어 <b>드리프트가 실제로 났다</b> —
 * member·team·wallet은 {@code AUTH_TOKEN_INVALID}인데 performance·refund만
 * {@code COMMON_UNAUTHORIZED}였고, 같은 세션이 엔드포인트마다 다르게 행동했다. 소스를 직접
 * 읽어 못박는 이유가 그것이다. 새 서비스가 이 헬퍼를 복사해도 자동으로 걸린다.
 */
class RequireMemberContractTest {

    private static final Path SOURCE_ROOT = Path.of("src/main/java/com/ssafy/b204");
    private static final String SIGNATURE = "Member requireMember(MemberPrincipal";

    @Test
    @DisplayName("회원 행이 사라진 세션은 어느 서비스에서든 AUTH_TOKEN_INVALID 다")
    void missingMemberRowIsAlwaysTokenInvalid() throws IOException {
        List<Path> sources = sourcesDeclaringRequireMember();

        // 헬퍼를 못 찾으면 규칙이 아니라 이 테스트가 낡은 것이다 — 조용히 통과시키지 않는다.
        assertThat(sources).as("requireMember 를 선언한 서비스").isNotEmpty();

        for (Path source : sources) {
            String body = requireMemberBody(Files.readString(source, StandardCharsets.UTF_8));
            assertThat(body)
                    .as("%s — me == null 은 COMMON_UNAUTHORIZED", source.getFileName())
                    .contains("COMMON_UNAUTHORIZED");
            assertThat(orElseThrowPart(body))
                    .as("%s — 회원 행 없음은 AUTH_TOKEN_INVALID", source.getFileName())
                    .contains("AUTH_TOKEN_INVALID")
                    .doesNotContain("COMMON_UNAUTHORIZED");
        }
    }

    private static List<Path> sourcesDeclaringRequireMember() throws IOException {
        try (Stream<Path> tree = Files.walk(SOURCE_ROOT)) {
            return tree.filter(path -> path.toString().endsWith(".java"))
                    .filter(RequireMemberContractTest::declaresRequireMember)
                    .sorted()
                    .toList();
        }
    }

    private static boolean declaresRequireMember(Path path) {
        try {
            return Files.readString(path, StandardCharsets.UTF_8).contains(SIGNATURE);
        } catch (IOException e) {
            throw new IllegalStateException("소스를 읽지 못했다: " + path, e);
        }
    }

    /** 선언부부터 중괄호 균형이 맞는 곳까지 = 메서드 본문 하나. */
    private static String requireMemberBody(String source) {
        int start = source.indexOf(SIGNATURE);
        int open = source.indexOf('{', start);
        int depth = 0;
        for (int i = open; i < source.length(); i++) {
            char c = source.charAt(i);
            if (c == '{') {
                depth++;
            } else if (c == '}' && --depth == 0) {
                return source.substring(start, i + 1);
            }
        }
        throw new IllegalStateException("requireMember 본문의 끝을 찾지 못했다");
    }

    /** 회원 행 조회 실패 분기만 잘라 본다 — null 분기의 COMMON_UNAUTHORIZED 와 섞이지 않게. */
    private static String orElseThrowPart(String body) {
        int at = body.indexOf("orElseThrow");
        assertThat(at).as("requireMember 는 findById(...).orElseThrow 로 회원 행을 읽는다").isNotNegative();
        return body.substring(at);
    }
}
