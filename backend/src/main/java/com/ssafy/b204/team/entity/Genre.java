package com.ssafy.b204.team.entity;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.util.Arrays;
import java.util.Locale;

/**
 * 장르 코드 10종 — 추천 설계 v1 §4.1 · ERD v6 {@code team.genre}.
 *
 * <p><b>DB 타입은 ENUM 이 아니라 VARCHAR 다</b>(D-R01). 값 집합이 늘 때 ALTER 마이그레이션과
 * 코드 배포를 같은 시점에 맞추지 않아도 되도록, 허용값 검증을 이 enum 한 곳으로 모았다.
 * {@code team.genre}·{@code member_preferred_genre.genre} 둘 다 같은 집합을 쓴다.
 *
 * <p>코드는 언어 중립이고 화면 라벨(en/ko)은 프론트가 매핑한다(API v6 §0.6).
 */
public enum Genre {
    ROCK, INDIE, POP, HIPHOP, RNB, JAZZ, ELECTRONIC, ACOUSTIC, CLASSICAL, ETC;

    /**
     * 저장 경로의 변환 — 허용값 밖이면 {@code COMMON_VALIDATION_FAILED}(400)다.
     *
     * <p>알 수 없는 값을 조용히 {@code ETC}로 바꾸지 않는다. 사용자가 고른 장르가 말없이 다른
     * 값으로 저장되면 추천 결과가 왜 그런지 아무도 설명할 수 없게 된다.
     */
    public static Genre of(String code) {
        if (code == null) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED, "장르를 선택해 주세요.");
        }
        String normalized = code.trim().toUpperCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(genre -> genre.name().equals(normalized))
                .findFirst()
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED,
                        "지원하지 않는 장르 코드입니다."));
    }

    /**
     * 조회 경로의 변환 — 예상 밖 값은 {@code ETC}로 읽는다.
     *
     * <p>컬럼이 VARCHAR 라 DB 가 값을 막아주지 않는다. V13 이 기존 자유 입력을 전부 {@code ETC}로
     * 밀었지만, 운영 중 직접 UPDATE 한 행이나 구버전 앱이 남긴 값이 하나라도 있으면 목록 조회가
     * 통째로 500 이 된다. <b>읽기는 관대하게, 쓰기는 엄격하게.</b>
     */
    public static Genre readOrEtc(String code) {
        if (code == null) {
            return ETC;
        }
        return Arrays.stream(values())
                .filter(genre -> genre.name().equals(code.trim().toUpperCase(Locale.ROOT)))
                .findFirst()
                .orElse(ETC);
    }
}
