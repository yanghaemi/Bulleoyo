package com.ssafy.b204.common.response;

import org.springframework.data.domain.Page;

/**
 * 목록 응답의 페이지 정보 — API v6 §0.2.
 *
 * <p>{@code data} 안에서 {@code items} + {@code pageInfo}로 감싼다. Spring Data의
 * {@code Page}를 그대로 직렬화하지 않는다 — 필드 이름·구조가 규격과 다르고 버전에 따라 바뀐다.
 *
 * <p>{@code page}는 <b>0-base</b>다.
 */
public record PageInfo(int page, int size, long totalElements, boolean hasNext) {

    public static PageInfo from(Page<?> page) {
        return new PageInfo(page.getNumber(), page.getSize(), page.getTotalElements(), page.hasNext());
    }
}
