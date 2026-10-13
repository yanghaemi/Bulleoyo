package com.ssafy.b204.common.error;

import com.ssafy.b204.common.response.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 모든 실패 응답을 {@code {code, data:null, msg}}로 래핑하는 단일 지점.
 *
 * <p>규격 §2 — 컨트롤러 안에서 실패 응답을 직접 조립하지 않는다.
 *
 * <p>보안(규격 §1 · API v6 SEC-09) — 스택트레이스·SQL·체인 revert 원문·외부 시스템 원본 오류
 * 문자열은 {@code msg}에 넣지 않는다. 서버 로그에만 남기고 사용자에게는 일반화한 문장을 준다.
 * 그래서 예상하지 못한 예외는 전부 {@link ErrorCode#COMMON_INTERNAL_ERROR}로 뭉갠다.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 업무 규칙 위반. 유일한 정상 실패 경로다. */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) {
        ErrorCode code = e.getErrorCode();
        // 5xx만 스택을 남긴다. 4xx는 정상적인 업무 흐름이라 스택이 로그를 덮는다.
        if (code.getStatus().is5xxServerError()) {
            log.error("[{}] {}", code.getCode(), e.getMessage(), e);
        } else {
            log.debug("[{}] {}", code.getCode(), e.getMessage());
        }
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(code.getStatus());
        if (e.getRetryAfterSeconds() != null) {
            // §0.9 - 429 에는 Retry-After(초)를 함께 내린다. 클라이언트가 언제 다시 시도할지
            // 추측하지 않게 하는 유일한 수단이다.
            builder.header(HttpHeaders.RETRY_AFTER, String.valueOf(e.getRetryAfterSeconds()));
        }
        return builder.body(ApiResponse.error(code, e.getMsg()));
    }

    // ---------------------------------------------------------------- 400

    /** {@code @Valid} 위반. 첫 필드 오류 문구를 그대로 내려 화면이 바로 띄울 수 있게 한다. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(GlobalExceptionHandler::fieldErrorMessage)
                .orElse(ErrorCode.COMMON_VALIDATION_FAILED.getDefaultMsg());
        log.debug("[COMMON_VALIDATION_FAILED] {}", e.getMessage());
        return respond(ErrorCode.COMMON_VALIDATION_FAILED, msg);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException e) {
        String msg = e.getConstraintViolations().stream()
                .findFirst()
                .map(v -> v.getMessage())
                .orElse(ErrorCode.COMMON_VALIDATION_FAILED.getDefaultMsg());
        log.debug("[COMMON_VALIDATION_FAILED] {}", e.getMessage());
        return respond(ErrorCode.COMMON_VALIDATION_FAILED, msg);
    }

    /** 본문 JSON 파싱 실패·타입 불일치·필수 파라미터 누락. 원문을 노출하지 않는다. */
    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class,
            // multipart 요청에서 파트가 빠지면 Spring 은 MissingServletRequestParameterException 이
            // 아니라 이 예외를 던진다(RequestParamMethodArgumentResolver 의 multipart 분기).
            // 빠뜨리면 "file 없이 업로드"가 400 이 아니라 맨 아래 catch-all 로 떨어져 500 이 된다.
            MissingServletRequestPartException.class
    })
    public ResponseEntity<ApiResponse<Void>> handleBadRequest(Exception e) {
        log.debug("[COMMON_VALIDATION_FAILED] {}", e.getMessage());
        return respond(ErrorCode.COMMON_VALIDATION_FAILED,
                ErrorCode.COMMON_VALIDATION_FAILED.getDefaultMsg());
    }

    // ---------------------------------------------------------------- 413

    /**
     * Spring 의 multipart 상한({@code spring.servlet.multipart.*}) 초과.
     *
     * <p>앱 안에도 5MB 검사가 있지만({@code FileStorageService}) 그쪽까지 못 간다 — 파트 파싱이
     * 먼저 터진다. 여기서 매핑하지 않으면 규격 밖 응답({@code COMMON_INTERNAL_ERROR} 500)이
     * 나가므로, 어느 상한에 걸리든 클라이언트가 보는 코드는 {@code FILE_TOO_LARGE} 하나다.
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> handleMaxUploadSize(MaxUploadSizeExceededException e) {
        log.debug("[FILE_TOO_LARGE] {}", e.getMessage());
        return respond(ErrorCode.FILE_TOO_LARGE, ErrorCode.FILE_TOO_LARGE.getDefaultMsg());
    }

    // ---------------------------------------------------------------- 401 / 403

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponse<Void>> handleAuthentication(AuthenticationException e) {
        log.debug("[COMMON_UNAUTHORIZED] {}", e.getMessage());
        return respond(ErrorCode.COMMON_UNAUTHORIZED,
                ErrorCode.COMMON_UNAUTHORIZED.getDefaultMsg());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException e) {
        log.debug("[COMMON_FORBIDDEN] {}", e.getMessage());
        return respond(ErrorCode.COMMON_FORBIDDEN, ErrorCode.COMMON_FORBIDDEN.getDefaultMsg());
    }

    // ---------------------------------------------------------------- 404 / 405

    /**
     * 매핑되지 않은 경로.
     *
     * <p>{@code NoResourceFoundException}을 함께 잡는 것이 중요하다 — Spring Boot 3은 정적
     * 리소스로도 처리되지 않은 요청에 {@code NoHandlerFoundException}이 아니라 이 예외를 던진다.
     * 빠뜨리면 맨 아래 catch-all로 떨어져 <b>404여야 할 요청이 500</b>이 된다
     * (인증이 열린 경로에서 드러난다 — 예: 노출하지 않은 {@code /actuator/env}).
     *
     * <p>인증이 필요한 경로의 오타는 Security 필터가 먼저 401로 막는다. 그쪽이 404보다 낫다 —
     * 어떤 경로가 존재하는지 알려주지 않는다.
     */
    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    public ResponseEntity<ApiResponse<Void>> handleNotFound(Exception e) {
        log.debug("[COMMON_NOT_FOUND] {}", e.getMessage());
        return respond(ErrorCode.COMMON_NOT_FOUND, ErrorCode.COMMON_NOT_FOUND.getDefaultMsg());
    }

    /**
     * 메서드 불일치. 규격에 405 행이 없어 {@code COMMON_NOT_FOUND}(404)로 내린다 —
     * 규격에 없는 status·code를 새로 만들지 않는다(§2).
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        return respond(ErrorCode.COMMON_NOT_FOUND, ErrorCode.COMMON_NOT_FOUND.getDefaultMsg());
    }

    // ---------------------------------------------------------------- 409

    /** UNIQUE·FK 위반. 어느 제약인지는 로그에만 남긴다(SQL 노출 금지). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleDataIntegrity(DataIntegrityViolationException e) {
        log.warn("[COMMON_CONFLICT] 제약 위반", e);
        return respond(ErrorCode.COMMON_CONFLICT, ErrorCode.COMMON_CONFLICT.getDefaultMsg());
    }

    /** 낙관적 락 충돌 — 동시 요청. 클라이언트는 재시도하면 된다. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Void>> handleOptimisticLock(OptimisticLockingFailureException e) {
        log.warn("[COMMON_CONFLICT] 낙관적 락 충돌", e);
        return respond(ErrorCode.COMMON_CONFLICT, ErrorCode.COMMON_CONFLICT.getDefaultMsg());
    }

    // ---------------------------------------------------------------- 500

    /** 마지막 그물. 원인은 로그에만, 사용자에게는 일반 문장만. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception e) {
        log.error("[COMMON_INTERNAL_ERROR] 처리되지 않은 예외", e);
        return respond(ErrorCode.COMMON_INTERNAL_ERROR,
                ErrorCode.COMMON_INTERNAL_ERROR.getDefaultMsg());
    }

    // ---------------------------------------------------------------- helpers

    private static ResponseEntity<ApiResponse<Void>> respond(ErrorCode code, String msg) {
        return ResponseEntity.status(code.getStatus()).body(ApiResponse.error(code, msg));
    }

    /**
     * Bean Validation 메시지를 사용자 문장으로 쓴다. DTO의 {@code message = "..."}를 한국어로
     * 적어두면 그대로 노출된다. 메시지를 비워 둔 제약은 기본 문구로 대체한다 —
     * "must not be blank" 같은 영문 기본값을 사용자에게 보이지 않기 위해서다.
     */
    private static String fieldErrorMessage(FieldError error) {
        String msg = error.getDefaultMessage();
        if (msg == null || msg.isBlank() || msg.startsWith("must") || msg.startsWith("size must")) {
            return ErrorCode.COMMON_VALIDATION_FAILED.getDefaultMsg();
        }
        return msg;
    }

    /** 핸들러가 다루지 않은 status를 쓰지 않았는지 확인하는 용도의 상수(테스트에서 참조). */
    static final HttpStatus[] SPEC_STATUSES = {
            HttpStatus.OK, HttpStatus.CREATED, HttpStatus.ACCEPTED,
            HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN,
            HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.GONE,
            HttpStatus.PAYLOAD_TOO_LARGE,
            HttpStatus.TOO_MANY_REQUESTS, HttpStatus.INTERNAL_SERVER_ERROR,
            HttpStatus.BAD_GATEWAY, HttpStatus.GATEWAY_TIMEOUT
    };
}
