# backend 함정

정본: 기술 스택 v2 §2 · 컨벤션 §4·§5 · API 응답 규격(01_API_공통_응답_규격.md 현행 v3)

## 의존성 (build.gradle)
- Java 17 **툴체인 고정 필수**: `settings.gradle`에 `org.gradle.toolchains.foojay-resolver-convention` 0.9.0, `build.gradle`에 `java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }`. Jenkins 컨트롤러 JVM이 21이라 없으면 CI 테스트가 21로 돌고 Jenkinsfile 가드가 실패시킨다.
- Spring Boot 3.5.x. Boot 4 금지(Jackson 3 전환이 web3j 4.9.8과 충돌).
- `org.flywaydb:flyway-core` + **`org.flywaydb:flyway-mysql`** 둘 다. 후자 빠지면 기동 시 `Unsupported Database: MySQL 8.0`.
- 체인: `io.kaia:web3j-ext:2.0.7` 하나만. `org.web3j:core`를 직접 선언하지 않는다(4.9.8이 전이로 옴). 5.x 선언 시 Java 21 요구로 깨진다.
- okhttp 충돌 방지: `com.squareup.okhttp3:okhttp:4.12.0`, `com.squareup.okio:okio:3.x`를 명시 고정.
- 인증: `spring-boot-starter-oauth2-jose`로 Web3Auth idToken JWKS 검증 + 자체 세션 JWT. jjwt 추가 불필요. 리소스 서버 필터 전체는 쓰지 않는다.
- 테스트: Testcontainers(MySQL·Redis). H2 금지(ENUM·SETNX 동작 다름).
- 모니터링: `io.micrometer:micrometer-registry-prometheus` 추가. `management.endpoints.web.exposure.include=health,prometheus`. Security에서 `/actuator/**` permitAll(호스트 Nginx가 외부 접근을 404로 막고, Prometheus는 서버 안에서 127.0.0.1:8080으로 붙는다).

## JPA·DB
- `spring.jpa.hibernate.ddl-auto=none`. `validate`도 금지(Hibernate 6.3+ ENUM 매핑 충돌).
- 상태 컬럼은 MySQL ENUM + `@Enumerated(EnumType.STRING)`. 안 되면 `@JdbcTypeCode(SqlTypes.NAMED_ENUM)`.
- PK는 `{table}_id`. 제네릭 BaseEntity의 `id` 필드 불가. 엔티티마다 `@Id` 선언.
- 테이블명 `performance`(show 아님), `ticket_order`(order 아님). 예약어 회피.
- 금액 BIGINT, 주소 CHAR(42), tx 해시 CHAR(66), 시각 DATETIME(6).
- 마이그레이션 `V{n}__{설명}.sql`. ENUM 값 변경은 `ALTER TABLE … MODIFY … ENUM(...)` 마이그레이션 + 코드 배포 동시.

## 응답
- 모든 응답 `{ code, data, msg }`. 성공 `code="SUCCESS"`, 실패 `data=null`.
- 실패는 예외를 던지고 `@RestControllerAdvice`에서 래핑. 컨트롤러에서 직접 실패 응답 조립 금지.
- 에러 `code`는 `도메인_사유` 대문자 스네이크. 명세에 있는 값만. 한번 배포된 문자열은 변경 금지.
- 비동기 tx는 202 + `chain_job` id 반환(API v6 §0.3). 사용자 서명 tx는 prepare → signed-tx 규약(§0.4).

## 체인 모듈
- OPERATOR tx는 `chain_job` 테이블 + `@Scheduled` 단일 스레드 워커. nonce 직렬화가 목적. 큐·ShedLock 불필요(단일 인스턴스).
- fee payer 서명만 서버가 한다. 발신자 서명 RLP는 프론트에서 온다.
- 컨트랙트 래퍼는 ABI에서 `web3j generate` 1회 실행해 커밋. Gradle 플러그인 쓰지 않는다.
- receipt 수신 후 이벤트 파싱으로 성공 판정. status만 보지 않는다.

## Redis 키 (API v6 §0.12)
`auth:refresh:{jti}` TTL 14d · `wallet:balance:{address}` · `wallet:challenge:{memberId}` TTL 300s · 입장 `entry:{ticketId}` SETNX

## 로컬 프로파일
- 프로파일 `local` — DB `jdbc:mysql://localhost:3306/b204` (b204/b204), Redis `localhost:6379`. 인프라는 `docker-compose.local.yml`(MySQL·Redis만).
- 체인 변수(OPERATOR·MINTER 키, `CONTRACT_*_ADDRESS`)는 **빈 값 허용**. 빈 값이면 체인 빈을 비활성 또는 지연 초기화해 기동을 막지 않는다. `application-example.yml`은 `.env.example`의 변수 이름을 `${ENV:기본값}`으로 참조하고, `application-local.yml`은 gitignore 대상.

## 커스텀 지표 (chain 모듈, Micrometer)
| 이름 | 타입 | 태그 | 뜻 |
|---|---|---|---|
| `b204_chain_job_count` | Gauge | `status`(PENDING·SUBMITTED·CONFIRMED·FAILED)·`signer_type`(OPERATOR·USER) | 상태·서명 주체별 chain_job 건수. 모든 조합을 등록하고 없는 조합은 0. 워커 `@Scheduled` 주기마다 갱신 |
| `b204_chain_job_failed_total` | Counter | `type`(mint·release·refund…), `reason`(revert 코드·RPC·nonce) | 실패 누적 |
| `b204_chain_tx_seconds` | Timer | `type` | 전송→receipt 소요 시간 |
| `b204_operator_kaia_balance` | Gauge | `wallet`(OPERATOR·MINTER) | 운영 지갑 KAIA 잔액. 파우셋 시점 판단용 |

이름은 Grafana 패널이 참조하므로 바꾸지 않는다. 지표 추가는 자유, 삭제·개명은 인프라 담당과 합의.

## web3j-ext 좌표·의존성 (PoC 4 실측 2026-09-07, `_workspace/poc4/RESULT.md`)
- **버전 문자열에 `v` 접두가 붙는다.** `io.kaia:web3j-ext:v2.0.7`. `2.0.7`은 Maven Central에 없다(존재: `v1.0.0`, `v2.0.7`).
- **`org.web3j:core:4.9.8`은 반드시 명시 선언한다.** web3j-ext가 모든 의존성을 runtime 스코프로 발행해 명시하지 않으면 `org.web3j.protocol.*`이 compileClasspath에 없어 컴파일이 실패한다(PoC 4에서 확인). 전이로 오는 4.9.7이 4.9.8로 승격된다.
- `gradle-nexus-staging-plugin`이 런타임 의존으로 새어 있다 → `exclude group: 'io.codearte.gradle.nexus'` **필수**(빼면 플러그인 jar가 앱 클래스패스에 올라온다).
- okhttp는 `4.12.0`으로 수렴, okio 3.6.0·Jackson 2.19.2(Boot BOM)·SLF4J 2.0.17 단일 바인딩. 기동 경고 0건. okio 명시 고정은 불필요.
- Spring Boot 3.5.5 + Java 17 기동 1.2초, Kairos `eth_blockNumber`·`eth_chainId`(1001) 표준 web3j·Kaia 확장 둘 다 성공.

```groovy
java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }   // Jenkins JVM 21 방어
dependencies {
    implementation('io.kaia:web3j-ext:v2.0.7') { exclude group: 'io.codearte.gradle.nexus' }
    implementation 'org.web3j:core:4.9.8'                 // 컴파일 클래스패스용 명시 선언
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'   // 수렴 고정
}
```

### 대납(PoC 5)에서 쓸 클래스 (jar 실측)
- 인코더 핵심: `org.web3j.crypto.KaiaTransactionEncoder` — `signMessageAsFeePayer(byte[] rawTx, long chainId, KaiaCredentials feePayer)`
- fee payer 유틸 `org.web3j.crypto.transaction.fee.FeePayer`, 키 `org.web3j.crypto.KaiaCredentials`, 서명 데이터 `KaiaSignatureData`·`KaiaRawTransaction`
- tx 타입: `org.web3j.crypto.transaction.type.TxTypeFeeDelegatedSmartContractExecution`(+`WithRatio`), 공통 `TxTypeFeeDelegate`, 열거 `KaiaTransactionType`

### 프로젝트 스캐폴딩 함정
- **start.spring.io가 Boot 3.5.x 생성을 거부한다**(2026-09-07: `compatibility range is >=4.0.0`, 4.x 요청은 500). `backend/` 초기화는 수동 작성 또는 PoC 4 프로젝트(`_workspace/poc4`) 복사. Gradle 래퍼는 `https://raw.githubusercontent.com/gradle/gradle/v8.14.3/gradle/wrapper/gradle-wrapper.jar` + 같은 태그의 `gradlew`.
- 오민근 스파이크(`web3j-ext v1.0.0 + core 4.9.8`)와 core가 같아 대납 API 동일.
- **전송은 반드시 `org.web3j.protocol.kaia.Web3j`로.** 표준 `org.web3j.protocol.Web3j`의 `ethSendRawTransaction`은 `eth_sendRawTransaction`을 부르는데 Kaia 노드는 Kaia 타입 tx(0x31 대납 등)를 그 메서드로 받으면 `-32000 undefined tx type`으로 거절한다. Kaia 확장 클래스는 첫 바이트가 Kaia 타입(0x08~0x4a)이면 `kaia_sendRawTransaction`으로 자동 라우팅한다(jar 바이트코드 확인, 2026-09-07 E2E 실측). 두 클래스 이름이 같으니 빈 생성은 FQCN으로. 서명 인코딩(`signMessageAsFeePayer` byte[]·객체 오버로드)은 결과가 같아 문제 아님.
