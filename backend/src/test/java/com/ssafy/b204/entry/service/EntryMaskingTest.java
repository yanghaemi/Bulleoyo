package com.ssafy.b204.entry.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@code holderNameMasked} — §10 "관객 개인정보는 담지 않는다. 티켓 식별 정보·시각·마스킹된
 * 이름만 준다."
 *
 * <p>검표 담당자는 동일인 확인만 하면 되고 명단을 수집할 이유가 없다. 그래서 첫 글자와 마지막
 * 글자만 남긴다(명세 예시 {@code 김*객}).
 */
class EntryMaskingTest {

    @Test
    @DisplayName("가운데를 가린다 — 명세 예시 김*객")
    void masksMiddle() {
        assertThat(EntryService.maskName("김관객")).isEqualTo("김*객");
        assertThat(EntryService.maskName("김철수영")).isEqualTo("김**영");
        assertThat(EntryService.maskName("Alice")).isEqualTo("A***e");
    }

    @Test
    @DisplayName("두 글자는 뒤를, 한 글자는 전부 가린다 — 길이에서 이름이 새지 않게")
    void masksShortNames() {
        assertThat(EntryService.maskName("김수")).isEqualTo("김*");
        assertThat(EntryService.maskName("김")).isEqualTo("*");
    }

    @Test
    @DisplayName("빈 값은 필드를 비운다(null → 전역 non_null 설정으로 JSON 에서 빠진다)")
    void blankBecomesNull() {
        assertThat(EntryService.maskName(null)).isNull();
        assertThat(EntryService.maskName("   ")).isNull();
    }

    @Test
    @DisplayName("이모지·서로게이트 페어를 반 글자로 자르지 않는다")
    void handlesSurrogatePairs() {
        // 코드포인트 3개(😀 A 😀) — 문자 단위로 세면 인덱스가 어긋나 깨진 문자가 응답에 나간다.
        assertThat(EntryService.maskName("😀A😀"))
                .isEqualTo("😀*😀");
    }
}
