# API v6 계약 정정 추록 v1

작성일: 2026-09-18. 적용 대상: API-member-01, API-payment-03 및 공통 응답 규격의 인증 오류 목록.

[API 명세서 v6](./06_API_명세서_v6.md) 원문은 보존한다. 아래 항목에 한해 이 추록이 원문의 요구사항·시스템 처리·4xx 표보다 우선한다. [OpenAPI 안내](./api/README.md)와 `parts/*.yaml`은 이 추록을 함께 반영한다. 이 문서는 현재 구현을 기록하며 백엔드 동작을 변경하지 않는다.

**[2026-09-23 되돌림]** 2026-09-21에 여기 API-ticket-01·03 절로 "주문의 팀 선택(`chosenTeamId`) → 팀별 수량 배분(`teamAllocations`)"을 지시했었다. 그 구현은 만들어지지 않은 채 브랜치가 develop에 합쳐지며 버려졌다 — 백엔드 `ErrorCode`는 지금도 `TICKET_TEAM_CHOICE_REQUIRED`·`TICKET_TEAM_CHOICE_INVALID`이고(`TICKET_TEAM_ALLOCATION_*` 없음), 온체인에는 `purchaseV2`가 없다(`purchase` 하나뿐). 주문의 팀 선택은 여전히 단일 값(`chosenTeamId` 요청 / `chosenTeamName` 응답)이다. 절 전체를 삭제했다 — 남겨 두면 이 명세를 보고 구현한 코드가 결제 revert로 이어진다.

## v6 대비 바뀐 것

| 대상 | 기존 서술 | 정정 |
| --- | --- | --- |
| API-member-01 | C-01에서 모든 사용자에게 국가·약관 동의를 먼저 받음 | 소셜 인증 후 기존 회원은 가입 입력 없이 로그인. 신규 회원의 세 값이 모두 생략되면 409로 가입 입력 안내 |
| API-member-01 4xx / 인증 오류 목록 | 신규 가입 정보 누락은 모두 400 | 세 값이 모두 null인 신규 요청은 `AUTH_SIGNUP_REQUIRED`(409). 일부만 입력한 요청의 누락·미동의·잘못된 형식은 400 유지 |
| API-payment-03 | 같은 RLP는 항상 최초 job 재생 | 진행 중·확정 job은 재생. 종단 `FAILED` job은 실패 이력을 보존하고 새 job으로 제출 |

## API-member-01: 소셜 인증 후 가입 여부 판정

`POST /api/v1/auth/web3auth`는 요청 형식과 idToken·지갑 클레임을 검증한 뒤 `(auth_provider, provider_user_id)`로 회원을 조회한다.

| 조건 | HTTP / code | 처리 |
| --- | --- | --- |
| 기존 회원이며 인증·지갑 주소 검증 통과 | 200 / `SUCCESS` | 국가·약관 동의를 다시 요구하지 않고 로그인. 이 세 값으로 기존 프로필을 변경하지 않음 |
| 신규 회원이며 `countryCode == null && termsAgreed == null && privacyAgreed == null` | 409 / `AUTH_SIGNUP_REQUIRED` | 가입 입력 안내. 회원 저장·세션 발급 전에 종료하며 계정을 생성하지 않음 |
| 신규 회원이 세 값 중 하나 이상 입력했으나 국가 또는 동의가 빠짐, 동의가 `false`임 | 400 / `COMMON_VALIDATION_FAILED` | 가입 거부, 계정 생성 없음 |
| 주소·국가 코드·통화 코드 형식 위반, 허용되지 않은 provider, 알 수 없는 필드 등 | 400 / `COMMON_VALIDATION_FAILED` | 기존 요청 검증 유지. 409로 치환하지 않음 |
| 신규 회원이며 유효한 국가·두 동의 `true`와 나머지 가입 검증 통과 | 200 / `SUCCESS` | 회원 생성 및 로그인, `isNewMember: true` |

409 조건에서 생략한 필드는 역직렬화 후 null이며, 일부 필드만 없는 모든 요청을 포괄하는 조건이 아니다. 클라이언트는 `code`로 분기하여 `AUTH_SIGNUP_REQUIRED`인 경우에만 신규 가입 정보를 받는다. 기존 회원에게 가입 폼을 다시 요구하지 않는다.

신규 가입의 필수 조건은 바뀌지 않는다. 국가 자기 선언과 이용약관·개인정보 처리방침 동의가 모두 있어야 하며, 국가 없이 임의의 기본값으로 회원을 생성하지 않는다. `profileCompletionRequired`는 계속 `false`이고 지갑 등록·기본 지급은 별도 지갑 등록 API가 담당한다.

### 인증 오류 목록 보충

[공통 응답 규격](./01_API_공통_응답_규격.md)의 인증 오류 목록에 다음 코드를 추가하여 읽는다.

| code | HTTP | 발생 조건 | 클라이언트 처리 |
| --- | --- | --- | --- |
| `AUTH_SIGNUP_REQUIRED` | 409 | 위 신규 회원·세 필드 모두 null 조건 | 국가와 두 약관 동의를 받은 뒤 동일 소셜 인증 정보로 API-member-01을 다시 호출 |

기본 메시지는 `가입 정보를 입력해 주세요.`다. 오류 응답은 기존 공통 `Envelope`를 따른다. 인증 실패·주소 불일치 등의 기존 오류는 유지한다.

근거: `MemberService.web3authLogin`의 회원 조회 직후 분기, `MemberService.newMember`, `MemberDtos.Web3AuthLoginRequest`, `ErrorCode.AUTH_SIGNUP_REQUIRED`.

## API-payment-03: 실패 job 재제출 서술 일치

`POST /api/v1/orders/{orderId}/payment/signed-tx`에서 같은 `senderSignedRlp`에 대응하는 진행 중·확정 job은 최초 `jobId`를 재생한다. 종단 `FAILED` job은 실패 이력을 보존한 채 새 job으로 다시 제출한다. 이 규칙은 주문 소유자·결제 상태·만료 검사와 RLP 발신자·대상·calldata 검증을 통과한 요청에 적용된다. 이미 결제된 주문은 기존 `PAYMENT_ALREADY_PAID` 오류가 우선한다.

`parts/07_payment.yaml`의 설명을 기존 생성물 `openapi.yaml`과 현재 `PaymentService.signedTx`·`UserSignedTxService.accept` 구현에 맞춘다. 신규 job이 곧 온체인 결제 성공을 뜻하지 않으며 결제 확정은 기존 receipt 검증을 따른다.

이 정정은 `txHash`가 이미 있는 실패 job을 별도로 제외하거나 nonce 재사용 정책을 새로 결정하지 않는다. 실패 원인별 재서명·재전송 및 nonce 재사용의 안전성 정책은 이 추록의 확정 범위 밖이며 별도 검토가 필요하다.
