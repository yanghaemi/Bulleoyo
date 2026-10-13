package com.ssafy.b204.chain.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * <b>회귀 방지</b> — {@link UserSignedTxService#accept}를 부르는 메서드는 그 호출 <b>앞</b>에서
 * {@code chain_job}의 FK 부모 행(member · wallet · performance · team · ticket)을 쓰지 않는다.
 *
 * <p>이유는 {@link UserSignedTxJobWriter} 클래스 주석 ⚠️ 절이다. {@code accept}는 {@code chain_job}을
 * {@code REQUIRES_NEW}(다른 커넥션)로 넣고, InnoDB는 자식 INSERT 때 FK 부모 행에 S 락을 잡는다.
 * 바깥 트랜잭션이 그 부모 행에 이미 X 락을 쥐고 있으면 50초 {@code Lock wait timeout}으로 죽는다.
 * 락을 실제로 걸어 재현하면 테스트 하나가 50초라, 소스 스캔으로 막는다
 * ({@code StorageTimeZoneTest}와 같은 방식 — 스프링 컨텍스트 없음).
 *
 * <h2>판단 규칙</h2>
 *
 * <ol>
 *   <li><b>호출부 찾기</b> — {@code src/main/java}에서 {@code UserSignedTxService} 타입 필드를 가진
 *       파일마다 {@code <필드명>.accept(} 줄을 찾는다. 목록을 하드코딩하지 않으므로 새 호출부도
 *       자동으로 검사된다. 호출부가 0곳이면 스캔이 깨진 것이라 실패한다.
 *   <li><b>검사 구간</b> — 그 줄에서 위로 올라가 가장 가까운 4칸 들여쓰기 메서드 선언
 *       ({@code public|protected|private ... (})부터 {@code accept} 줄 <b>직전</b>까지.
 *       주석 줄({@code *} · {@code //} · {@code /*}로 시작)은 건너뛴다.
 *   <li><b>쓰기로 보는 것</b>
 *       <ul>
 *         <li>구간에서 {@code Member|Wallet|Performance|Team|Ticket} 타입으로 선언된 변수(파라미터
 *             포함)나 {@code .getMember()} 같은 게터 체인에 대해 {@code set*} 또는 <b>그 엔티티의
 *             public void 메서드</b>를 부르는 것. 메서드 목록은 엔티티 소스에서 읽는다 — 엔티티에
 *             {@code markX()}가 새로 생기면 자동으로 쓰기로 본다.
 *         <li>{@code memberRepository|walletRepository|performanceRepository|teamRepository|
 *             ticketRepository}의 {@code save*} · {@code delete*} · {@code update*} ·
 *             {@code *ForUpdate*} · {@code *Lock*} 호출.
 *         <li>{@code EntityLocks.lockForUpdate} · {@code PESSIMISTIC_WRITE} · {@code @Lock} 이
 *             같은 줄에 부모 변수나 부모 타입 이름과 함께 나오는 것(부모가 아닌 행을 잠그는 것은
 *             안전하므로 오탐을 피한다).
 *         <li>JPQL·SQL 문자열 {@code update Member|Wallet|Performance|Team|Ticket}
 *             (대소문자 무시, 테이블 이름 포함).
 *       </ul>
 * </ol>
 *
 * <h2>알려진 한계</h2>
 *
 * <p>ponytail: 한 메서드 본문만 본다 — 다른 메서드·빈으로 위임한 쓰기({@code helper(performance)}
 * 안의 {@code markX()}), 호출부의 호출부가 먼저 연 트랜잭션의 쓰기, 변수 별칭({@code var p =
 * performance}), 같은 줄 끝 주석은 못 잡는다. 줄 단위 정규식이라 여러 줄에 걸친 호출의 앞부분만
 * 본다. 이런 경로가 생기면 파서(JavaParser 등)로 올리거나 여기 규칙을 늘린다.
 */
class UserSignedTxFkParentLockGuardTest {

    private static final Path MAIN = Path.of("src/main/java");
    private static final String PKG = "src/main/java/com/ssafy/b204/";
    private static final List<String> PARENTS =
            List.of("Member", "Wallet", "Performance", "Team", "Ticket");
    private static final String PARENT_ALT = String.join("|", PARENTS);

    private static final Pattern FIELD =
            Pattern.compile("\\bUserSignedTxService\\s+(\\w+)\\s*[;=]");
    private static final Pattern METHOD_HEADER =
            Pattern.compile("^ {4}(public|protected|private)\\b[^;=]*\\(");
    private static final Pattern PARENT_VAR =
            Pattern.compile("\\b(" + PARENT_ALT + ")\\s+(\\w+)\\s*[=,);]");
    private static final Pattern REPO_WRITE = Pattern.compile(
            "\\b(member|wallet|performance|team|ticket)Repository\\s*\\.\\s*"
                    + "(save\\w*|delete\\w*|update\\w*|\\w*ForUpdate\\w*|\\w*Lock\\w*)\\s*\\(");
    private static final Pattern LOCK = Pattern.compile("EntityLocks\\.lockForUpdate|PESSIMISTIC_WRITE|@Lock\\b");
    private static final Pattern JPQL_UPDATE =
            Pattern.compile("(?i)\\bupdate\\s+(" + PARENT_ALT + ")\\b");

    @Test
    @DisplayName("accept 를 부르는 메서드는 그 앞에서 chain_job FK 부모 행을 쓰지 않는다")
    void noFkParentWriteBeforeAccept() throws IOException {
        Set<String> mutators = entityMutators();
        List<String> sites = new ArrayList<>();
        List<String> offenders = new ArrayList<>();

        try (Stream<Path> files = Files.walk(MAIN)) {
            for (Path file : files.filter(f -> f.toString().endsWith(".java")).toList()) {
                List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
                for (String field : fieldNames(lines)) {
                    for (int i = 0; i < lines.size(); i++) {
                        if (!isComment(lines.get(i)) && lines.get(i).contains(field + ".accept(")) {
                            sites.add(file.getFileName() + ":" + (i + 1));
                            offenders.addAll(violations(file.toString(), lines, i, mutators));
                        }
                    }
                }
            }
        }

        // 스캔이 조용히 0곳을 보고 통과하지 않게 — 현재 호출부는 payment·performance·rule 세 곳이다.
        assertThat(sites).as("accept 호출부 스캔 결과").hasSizeGreaterThanOrEqualTo(3);
        assertThat(offenders)
                .withFailMessage("UserSignedTxService.accept 전에 chain_job FK 부모"
                        + "(member·wallet·performance·team·ticket) 행을 썼다 — REQUIRES_NEW INSERT 가"
                        + " 그 X 락을 50초 기다리다 Lock wait timeout 으로 죽는다."
                        + " 쓰기를 accept 뒤로 옮긴다. 근거: UserSignedTxJobWriter 클래스 주석 ⚠️ 절."
                        + "%n%s", String.join("\n", offenders))
                .isEmpty();
    }

    @Test
    @DisplayName("검사기 자체 — accept 앞 쓰기는 잡고, 뒤 쓰기와 부모 아닌 행 잠금은 통과시킨다")
    void detectorCatchesWritesBeforeAcceptOnly() {
        List<String> lines = List.of(
                "    @Transactional",
                "    public Response pay(MemberPrincipal me, Long id) {",
                "        Performance performance = requirePerformance(id);",
                "        // performance.markOnSale(null); 주석은 대상이 아니다",
                "        EntityLocks.lockForUpdate(em, payment);",
                "        performance.markDepositPaid(1L, \"0x\");",
                "        order.getMember().updateCountry(\"KR\");",
                "        walletRepository.saveAndFlush(wallet);",
                "        em.createQuery(\"update Ticket t set t.status = :s\");",
                "        var accepted = userSignedTxService.accept(rlp, expectation);",
                "        performance.markDepositPaid(2L, \"0x\");",
                "    }");

        List<String> found = violations("X.java", lines, 9,
                Set.of("markDepositPaid", "markOnSale", "updateCountry"));

        assertThat(found).hasSize(4);
        assertThat(found.get(0)).contains("X.java").contains("pay").contains(":6");
        assertThat(String.join("\n", found))
                .contains("performance.markDepositPaid")
                .contains("getMember().updateCountry")
                .contains("walletRepository.saveAndFlush")
                .contains("update Ticket")
                .doesNotContain("lockForUpdate(em, payment)");
    }

    /** 구간(메서드 선언 ~ accept 직전)의 쓰기 신호를 "파일 메서드():행  무엇" 으로 돌려준다. */
    static List<String> violations(String file, List<String> lines, int acceptLine,
                                   Set<String> mutators) {
        int start = acceptLine;
        while (start >= 0 && !METHOD_HEADER.matcher(lines.get(start)).find()) {
            start--;
        }
        if (start < 0) {
            return List.of(file + ":" + (acceptLine + 1) + "  accept 를 감싼 메서드 선언을 못 찾았다");
        }
        Matcher name = Pattern.compile("(\\w+)\\s*\\(").matcher(lines.get(start));
        String method = name.find() ? name.group(1) : "?";

        Set<String> vars = new HashSet<>();
        for (int i = start; i < acceptLine; i++) {
            Matcher m = PARENT_VAR.matcher(lines.get(i));
            while (m.find()) {
                vars.add(m.group(2));
            }
        }
        String mutatorAlt = String.join("|", mutators);
        List<String> receivers = new ArrayList<>();
        vars.forEach(v -> receivers.add("\\b" + v));
        receivers.add("\\.get(" + PARENT_ALT + ")\\s*\\(\\s*\\)");
        Pattern entityWrite = Pattern.compile("(" + String.join("|", receivers) + ")\\s*\\.\\s*"
                + "(set[A-Z]\\w*" + (mutatorAlt.isEmpty() ? "" : "|" + mutatorAlt) + ")\\s*\\(");
        List<String> mentions = new ArrayList<>(vars);
        mentions.addAll(PARENTS);
        Pattern parentMention = Pattern.compile("\\b(" + String.join("|", mentions) + ")\\b");

        List<String> out = new ArrayList<>();
        for (int i = start + 1; i < acceptLine; i++) {
            String line = lines.get(i);
            if (isComment(line)) {
                continue;
            }
            boolean hit = entityWrite.matcher(line).find()
                    || REPO_WRITE.matcher(line).find()
                    || JPQL_UPDATE.matcher(line).find()
                    || (LOCK.matcher(line).find() && parentMention.matcher(line).find());
            if (hit) {
                out.add(file + " " + method + "():" + (i + 1) + "  " + line.strip());
            }
        }
        return out;
    }

    private static Set<String> fieldNames(List<String> lines) {
        Set<String> names = new LinkedHashSet<>();
        for (String line : lines) {
            Matcher m = FIELD.matcher(line);
            if (!isComment(line) && m.find()) {
                names.add(m.group(1));
            }
        }
        return names;
    }

    /** 다섯 부모 엔티티의 public void 메서드 이름 — 엔티티 상태를 바꾸는 쪽으로 본다. */
    private static Set<String> entityMutators() throws IOException {
        Pattern voidMethod = Pattern.compile("\\bpublic\\s+void\\s+(\\w+)\\s*\\(");
        Set<String> names = new HashSet<>();
        for (String parent : PARENTS) {
            Path source = Path.of(PKG + parent.toLowerCase() + "/entity/" + parent + ".java");
            Matcher m = voidMethod.matcher(Files.readString(source, StandardCharsets.UTF_8));
            while (m.find()) {
                names.add(m.group(1));
            }
        }
        return names;
    }

    private static boolean isComment(String line) {
        String t = line.strip();
        return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
    }
}
