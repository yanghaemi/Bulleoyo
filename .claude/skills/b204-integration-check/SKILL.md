---
name: b204-integration-check
description: B204 파트 경계면 정합성 검증 절차. 백엔드 응답과 프론트 타입, ABI와 web3j 래퍼·프론트 RLP, ERD와 Flyway·엔티티를 교차 비교한다. "정합성 확인", "명세대로 됐는지", "프론트·백 맞는지", "통합 검증", "QA", "경계면 체크", 도메인 하나 구현 완료 직후, MR 올리기 전, W3 금요일 세로축 판정 전에 반드시 사용. 재검증·미해결 항목 재확인 요청에도 이 스킬.
---

# b204-integration-check

## 왜 이 검증인가
팀 5명이 API v6·ERD v5·ABI 문서만 계약으로 병렬 개발한다. 각자는 명세대로 만들었다고 믿지만 필드명 하나, ENUM 값 하나, 이벤트 인자 순서 하나가 어긋난다. 파일 존재 확인으로는 못 잡고, **양쪽을 동시에 읽어 shape를 비교**해야 잡힌다.

## 검증 쌍과 방법

### A. be ↔ fe (도메인 단위)
1. `_workspace/be_{domain}_endpoints.md`와 `_workspace/fe_{domain}_api-usage.md`를 읽는다. 없으면 코드에서 직접 뽑는다: 백엔드는 `@GetMapping` 등 + Response DTO 필드, 프론트는 `shared/api/{domain}.ts` 호출과 타입.
2. 엔드포인트별로 비교: 경로·메서드 · 응답 필드명·타입·null 가능성 · 에러 `code` 목록(백엔드가 던지는 것 vs 프론트가 처리하는 것).
3. 둘 다 `docs/design/06_API_명세서_v6.md`의 해당 절과 대조해 어느 쪽이 명세를 벗어났는지 판정한다.
4. 실행 검증: 백엔드 컨트롤러 테스트(있으면), 프론트 `pnpm tsc --noEmit`.

### B. bc ↔ be (체인 모듈)
1. `blockchain/deployments/kairos.json`의 ABI vs `backend/.../chain/` web3j 래퍼의 함수·이벤트.
2. 커스텀 에러(revert 코드) 목록 vs 서버의 `chain_job` 실패 사유 매핑.
3. `_workspace/bc_interface.md` 첫 줄에 `INTERFACE CHANGED`가 있는데 래퍼 재생성 커밋이 없으면 불일치.

### C. bc ↔ fe (대납 RLP)
1. 프론트가 만드는 FeeDelegatedSmartContractExecution의 `to`·`data` 인코딩 대상 함수가 ABI에 있는지.
2. 함수 인자 순서·타입이 ABI와 같은지.

### D. erd ↔ be
1. `docs/design/12_ERD_v5.md` DDL vs `backend/src/main/resources/db/migration/V*.sql` vs 엔티티 `@Column`.
2. ENUM 값 집합이 셋 다 같은지. PK 이름 `{table}_id` 규칙.
3. 실행 검증: Testcontainers 테스트 기동(Flyway 적용 성공 여부).

### E. infra ↔ all
1. compose 서비스 포트 vs 백엔드 `server.port` vs Nginx upstream.
2. CI가 주입하는 환경변수 이름 vs `application.yml`의 `${...}` vs 프론트 `import.meta.env.VITE_*`.
3. 실행 검증: `docker compose config`, `Jenkinsfile` 구조(괄호 짝, `sh '''` 작은따옴표, 시크릿 echo 없음).

## 보고 형식
`_workspace/qa_{domain}_{YYYYMMDD}.md`:

```
# QA {domain} {날짜}
검증 쌍: A, D
실행: tsc ✅ · 백엔드 테스트 ⏭(Docker 미기동)

| # | 위치 A | 위치 B | 차이 | 명세 판정 | 상태 |
|---|---|---|---|---|---|
| 1 | be TicketResponse.tokenId: Long | fe Ticket.tokenId: string | 타입 | API v6 §ticket-01: number | fe 수정 |
```

불일치가 0건이면 그것도 적는다. "확인함"만 쓰지 않고 비교한 항목 수를 적는다.

## 원칙
- 코드를 고치지 않는다. 판정과 근거만.
- 명세에 없으면 사용자 판정으로 넘긴다. 임의 결정 금지.
- 한 파트가 아직 없으면 있는 쪽과 명세만 비교하고 "상대 미구현" 표시.
