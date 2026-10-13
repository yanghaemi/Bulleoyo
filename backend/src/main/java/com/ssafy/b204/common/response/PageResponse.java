package com.ssafy.b204.common.response;

import java.util.List;
import java.util.function.Function;
import org.springframework.data.domain.Page;

/**
 * 목록 응답 payload — API v6 §0.2의 {@code { items, pageInfo }}.
 *
 * <p>사용법:
 *
 * <pre>{@code
 * Page<Performance> page = repository.findAll(pageable);
 * return ApiResponse.success(PageResponse.of(page, PerformanceSummaryResponse::from));
 * }</pre>
 */
public record PageResponse<T>(List<T> items, PageInfo pageInfo) {

    public static <E, T> PageResponse<T> of(Page<E> page, Function<E, T> mapper) {
        return new PageResponse<>(page.getContent().stream().map(mapper).toList(), PageInfo.from(page));
    }

    /** 이미 변환된 목록과 원본 페이지로 조립한다. */
    public static <T> PageResponse<T> of(List<T> items, Page<?> page) {
        return new PageResponse<>(items, PageInfo.from(page));
    }
}
