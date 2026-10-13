# API v7 — OpenAPI

- **정본은 `../06_API_명세서_v7.md`와 [v6 계약 정정 추록 v1](../15_API_v6_계약정정_추록_v1.md)**(추록은 v6 본문 대상이며 v7에서도 유효). 추록은 API-member-01 가입 안내·오류 코드와 API-payment-03 실패 job 재제출에 한해 우선하며, v6 원문은 보존한다. 여기는 그 기계 판독용 표현(설계 우선, design-first).
- 구조: `openapi.base.yaml`(info·보안·공통 컴포넌트) + `parts/NN_domain.yaml`(도메인별 paths·schemas) → `python3 build.py` → `openapi.yaml`(생성물, 편집 금지).
- 보기: `python3 -m http.server 8088` 후 http://localhost:8088/index.html (Swagger UI). 또는 https://editor.swagger.io 에 `openapi.yaml` 붙여넣기.
- 검사: `npx -y @redocly/cli lint openapi.yaml`
- 규칙: 응답은 전부 `Envelope`(`{code,data,msg}`) allOf. **202는 공용 스키마가 없다** — 오퍼레이션마다 백엔드 record 필드를 그대로 선언한다(2026-09-16 · S15P21B204-92에서 공용 `ChainJobAccepted` 삭제. 3필드 선언이 실제 9~14필드 응답을 가리고 있었다). 전역 `non_null` 직렬화라 **값이 null이면 키 자체가 없으므로** 그런 필드는 `required`에 넣지 않는다. 사용자 서명 tx는 `PrepareResponse`/`SignedTxRequest`. 확장 필드 `x-priority`·`x-role`·`x-screens`·`x-features`.
- 구현 단계: Spring 컨트롤러는 이 문서를 계약으로 삼는다. springdoc으로 코드에서 생성한 문서와 이 문서를 비교해 어긋나면 설계 문서를 먼저 고친다.

## 확인 위치
- GitLab(푸시 후): 저장소에서 `docs/design/api/openapi.yaml`을 열면 Swagger UI로 렌더링됨 — https://lab.ssafy.com/s15-fintech-finance-sub1/S15P21B204/-/blob/docs/design-specs-w1/docs/design/api/openapi.yaml (상단 "Display rendered file" 토글)
- 로컬: `python3 -m http.server 8088` → http://localhost:8088/index.html
- 서버: https://j15b204.p.ssafy.io/docs/ (basic auth, 계정은 인프라 담당)
- 현황(2026-09-24): 경로 65 · 오퍼레이션 76 · 스키마 178. **2026-09-24** 패스키 본인 확인(오후에 공연자 동작 4개로 확장 — performance_13·14 · rule_03·05 · settlement_01·05·08에 stepUpRequired·X-Step-Up-Token·403, webauthn_03 본문 {action, targetId}) `parts/15_webauthn.yaml`(webauthn_01~04, P1) 신설, payment_01·02 `stepUpRequired`·payment_03 `X-Step-Up-Token` 헤더·403 추가(API v7 §7.W). 이전 현황(2026-09-23 · v7): 경로 61 · 오퍼레이션 72 · 스키마 169. v7에서 `recommendation` 도메인(`parts/14_recommendation.yaml`)을 신설했고 회원 선호 장르·팀 장르는 `Genre` 공용 스키마(`openapi.base.yaml`)로 표현한다. 이 MR이 `POST /api/v1/files` 이미지 업로드(`parts/14_file.yaml`) · API-team-05 팀 해산 · 참여팀 조회(`GET .../participants`, API-performance-19)를 더했다. **API-performance-18 공연 삭제(`DELETE /performances/{performanceId}`)는 아직 openapi 에 없다** — 컨트롤러에만 있어 등록 엔드포인트가 하나 더 많다(`EndpointInventoryTest`). ⚠ `14_file.yaml`과 `14_recommendation.yaml`이 번호를 겹쳐 쓴다 — 빌드는 통하지만 다음 개정에서 정리한다.
