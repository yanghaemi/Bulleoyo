package com.ssafy.b204.common.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.ssafy.b204.common.error.ErrorCode;

/**
 * 모든 REST 응답의 유일한 래퍼 — {@code { code, data, msg }} 3필드 고정.
 *
 * <p>API 공통 응답 규격 v3 §1 · API 명세서 v6 §0.1.
 *
 * <ul>
 *   <li>{@code code} — 성공은 항상 {@code "SUCCESS"}, 실패는 {@code 도메인_사유} 대문자 스네이크.
 *       클라이언트 분기의 유일한 키이며 <b>배포된 코드 문자열은 변경 금지</b>다.
 *   <li>{@code data} — 성공 시 payload. <b>실패 시 예외 없이 항상 {@code null}</b>.
 *   <li>{@code msg} — 사용자에게 그대로 노출 가능한 문장. 성공 시 빈 문자열이 기본.
 *       클라이언트가 {@code msg}로 분기하면 안 된다.
 * </ul>
 *
 * <p><b>래퍼에 필드를 추가하지 않는다</b>(규격 §2). 재시도 가능 여부·검증 상세 같은 부가 정보가
 * 필요하면 {@code msg} 문장에 담거나 규격 문서에서 먼저 합의한다.
 *
 * <p>실패 응답은 컨트롤러에서 직접 만들지 않는다 — 예외를 던지고
 * {@link com.ssafy.b204.common.error.GlobalExceptionHandler}가 래핑한다(규격 §2).
 */
@JsonInclude(JsonInclude.Include.ALWAYS) // data=null 을 필드째 지우지 않는다. 규격이 null 을 요구한다.
public record ApiResponse<T>(String code, T data, String msg) {

    public static final String SUCCESS_CODE = "SUCCESS";

    /** 성공 + payload. {@code msg}는 빈 문자열. */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(SUCCESS_CODE, data, "");
    }

    /** 성공 + payload + 토스트로 띄울 문구. */
    public static <T> ApiResponse<T> success(T data, String msg) {
        return new ApiResponse<>(SUCCESS_CODE, data, msg);
    }

    /** payload 없는 성공(204 대신 200 + data=null 로 내리는 경우). */
    public static ApiResponse<Void> success() {
        return new ApiResponse<>(SUCCESS_CODE, null, "");
    }

    /** 실패. {@code data}는 항상 {@code null}이다. */
    public static <T> ApiResponse<T> error(ErrorCode errorCode) {
        return new ApiResponse<>(errorCode.getCode(), null, errorCode.getDefaultMsg());
    }

    /** 실패 + 값이 들어간 문구(금액·시각 등)로 기본 문구를 덮는 경우. */
    public static <T> ApiResponse<T> error(ErrorCode errorCode, String msg) {
        return new ApiResponse<>(errorCode.getCode(), null, msg);
    }
}
