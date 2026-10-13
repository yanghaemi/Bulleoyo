package com.ssafy.b204.common.error;

/**
 * 업무 규칙 위반을 나타내는 단일 예외.
 *
 * <p>규격 §2 — 컨트롤러는 실패 응답을 직접 만들지 않는다. 이 예외를 던지고
 * {@link GlobalExceptionHandler}가 {@code {code, data:null, msg}}로 래핑한다.
 *
 * <p>도메인별 예외 클래스를 새로 만들지 않는다. 구분은 {@link ErrorCode}가 한다 —
 * 코드 문자열이 클라이언트 분기의 유일한 키이므로 예외 타입을 늘려도 얻는 것이 없고,
 * 핸들러만 늘어난다.
 *
 * <p>{@code RuntimeException}을 상속하므로 {@code @Transactional}이 기본 설정에서 롤백한다.
 */
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    private BusinessException(ErrorCode errorCode, String msg, Throwable cause,
                             Integer retryAfterSeconds) {
        // getMessage()는 로그용이다. 사용자 노출 문구는 msg 필드가 아니라 errorCode/msg 조합으로 내려간다.
        super(errorCode.getCode() + ": " + msg, cause);
        this.errorCode = errorCode;
        this.msg = msg;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    /** 사용자에게 그대로 노출할 문장. 기본은 {@link ErrorCode#getDefaultMsg()}. */
    private final String msg;

    /** {@code Retry-After} 헤더(초). 429에만 채운다(§0.9). 없으면 헤더를 붙이지 않는다. */
    private final Integer retryAfterSeconds;

    public static BusinessException of(ErrorCode errorCode) {
        return new BusinessException(errorCode, errorCode.getDefaultMsg(), null, null);
    }

    /** 금액·시각·수량이 들어가야 하는 경우에만 기본 문구를 덮는다(규격 §2). */
    public static BusinessException of(ErrorCode errorCode, String msg) {
        return new BusinessException(errorCode, msg, null, null);
    }

    /**
     * 원인 예외를 함께 남긴다. 원인은 <b>로그에만</b> 남고 응답 {@code msg}에는 절대 들어가지 않는다
     * — 스택트레이스·SQL·체인 revert 원문 노출 금지(규격 §1 보안 · API v6 SEC-09).
     */
    public static BusinessException of(ErrorCode errorCode, Throwable cause) {
        return new BusinessException(errorCode, errorCode.getDefaultMsg(), cause, null);
    }

    /**
     * 호출 한도 초과(§0.9). {@code Retry-After} 헤더(초)를 함께 내리기 위해 남은 시간을 싣는다.
     *
     * @param retryAfterSeconds 다음 창이 열릴 때까지 남은 초. 최소 1
     */
    public static BusinessException tooManyRequests(int retryAfterSeconds) {
        return new BusinessException(ErrorCode.COMMON_TOO_MANY_REQUESTS,
                ErrorCode.COMMON_TOO_MANY_REQUESTS.getDefaultMsg(), null,
                Math.max(1, retryAfterSeconds));
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public String getMsg() {
        return msg;
    }

    /** {@code null}이면 {@code Retry-After}를 붙이지 않는다. */
    public Integer getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
