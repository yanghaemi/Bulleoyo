package com.ssafy.b204.common.support;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * 목록 파라미터 검증·변환 — API v6 §0.2.
 *
 * <blockquote>{@code page} 0-base 기본 0 · {@code size} 기본 20 <b>최대 100</b>(초과 시
 * {@code COMMON_VALIDATION_FAILED}) · {@code sort}는 각 API 절이 허용 필드를 정한다.</blockquote>
 *
 * <p><b>클라이언트가 보내는 정렬 필드 이름과 엔티티 속성 이름이 다르다.</b> 명세는
 * {@code startAt}인데 ERD/엔티티는 {@code performanceAt}이다. Spring Data가 받은 문자열을 그대로
 * 속성으로 쓰면 {@code PropertyReferenceException}이 500으로 새어 나가므로, 여기서 <b>허용 목록에
 * 있는 이름만</b> 엔티티 속성으로 번역하고 나머지는 400으로 막는다.
 */
public final class Paging {

    /** §0.2 — 초과 시 {@code COMMON_VALIDATION_FAILED}. */
    public static final int MAX_SIZE = 100;

    private Paging() {
    }

    /**
     * @param allowed 명세의 정렬 필드 이름 → 엔티티 속성 이름
     * @param defaultSort 미지정 시 적용할 정렬(엔티티 속성 이름 기준)
     */
    public static PageRequest of(Pageable pageable, Map<String, String> allowed, Sort defaultSort) {
        if (pageable == null) {
            return PageRequest.of(0, 20, defaultSort);
        }
        if (pageable.getPageSize() > MAX_SIZE || pageable.getPageNumber() < 0) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        Sort sort = pageable.getSort().isSorted() ? translate(pageable.getSort(), allowed)
                : defaultSort;
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), sort);
    }

    private static Sort translate(Sort requested, Map<String, String> allowed) {
        Sort translated = Sort.unsorted();
        for (Sort.Order order : requested) {
            String property = allowed.get(order.getProperty());
            if (property == null) {
                throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
            }
            translated = translated.and(Sort.by(order.getDirection(), property));
        }
        return translated;
    }
}
