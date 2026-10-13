package com.ssafy.b204.rule.support;

import com.ssafy.b204.common.support.EthCrypto;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;

/**
 * {@code rulesHash} 산출 — 계약 문서 13_컨트랙트_인터페이스_v1 §4.1 "rulesHash 계산 규약".
 *
 * <blockquote>{@code rulesHash} = {@code keccak256(정규화된 규칙 JSON)}이고, 그 JSON은
 * <b>{@code fixedRatioBp} · {@code selectionRatioBp} · {@code teamShareBp[]}(팀 순서 포함)</b>
 * 세 값을 반드시 포함한다. 셋 중 하나라도 바뀌면 해시가 반드시 달라져야 한다.</blockquote>
 *
 * <p><b>왜 이 규약이 중요한가.</b> 컨트랙트는 {@code rulesHash}와 온체인 분배율이 서로 대응하는지
 * 검증하지 않는다. 서버가 해시를 규칙의 <b>일부</b>(설명문 등)로만 계산하면 bp를 바꿔도 해시가
 * 그대로여서, 팀 지갑 팝업에 뜨는 값이 직전과 한 글자도 다르지 않은 채 전혀 다른 경제가 잠긴다
 * (감사 라운드 4 M-08). 순수한 서버 버그로 신뢰 장치가 조용히 사라지는 경로다.
 *
 * <p><b>정규화 규칙</b> — 키 순서 고정, 공백 없음, 숫자는 10진 정수, {@code teamShares}는
 * {@code teamId} 오름차순. 프론트 검증 페이지(V-01)가 같은 문자열을 재현할 수 있어야 한다.
 *
 * <pre>{@code
 * {"performanceId":12,"fixedRatioBp":6000,"selectionRatioBp":4000,
 *  "teamShares":[{"teamId":7,"shareBp":5000},{"teamId":9,"shareBp":3000}]}
 * }</pre>
 * (실제 문자열에는 줄바꿈·공백이 없다.)
 *
 * <p>해시는 {@code keccak256}(EthCrypto 재사용)이고 표기는 {@code 0x} + 64 hex 소문자다 —
 * 컨트랙트의 {@code bytes32}로 그대로 들어간다.
 */
public final class RulesHash {

    private RulesHash() {
    }

    /** 정규화 JSON 안에 들어가는 팀별 몫. */
    public record TeamShare(Long teamId, Integer shareBp) {}

    /** 서명·검증 페이지가 함께 재현해야 하는 정규화 문자열. */
    public static String canonicalJson(Long performanceId, int fixedRatioBp, int selectionRatioBp,
                                       List<TeamShare> teamShares) {
        String shares = teamShares.stream()
                .sorted(Comparator.comparing(TeamShare::teamId))
                .map(s -> "{\"teamId\":" + s.teamId() + ",\"shareBp\":" + s.shareBp() + "}")
                .collect(Collectors.joining(","));
        return "{\"performanceId\":" + performanceId
                + ",\"fixedRatioBp\":" + fixedRatioBp
                + ",\"selectionRatioBp\":" + selectionRatioBp
                + ",\"teamShares\":[" + shares + "]}";
    }

    /** {@code 0x} + 64 hex 소문자. */
    public static String of(Long performanceId, int fixedRatioBp, int selectionRatioBp,
                            List<TeamShare> teamShares) {
        return keccakHex(canonicalJson(performanceId, fixedRatioBp, selectionRatioBp, teamShares));
    }

    /** {@code order_ref = keccak256(orderId)} — API v6 §6 도입부. */
    public static String orderRef(Long orderId) {
        // 인코딩이 명세에 없어 온체인 관례를 따른다 - uint256 빅엔디안 32바이트(abi.encode).
        byte[] word = new byte[32];
        long value = orderId;
        for (int i = 31; i >= 24; i--) {
            word[i] = (byte) (value & 0xFF);
            value >>>= 8;
        }
        return "0x" + HexFormat.of().formatHex(EthCrypto.keccak256(word));
    }

    private static String keccakHex(String canonical) {
        return "0x" + HexFormat.of()
                .formatHex(EthCrypto.keccak256(canonical.getBytes(StandardCharsets.UTF_8)));
    }
}
