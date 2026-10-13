# backend

Spring Boot API 서버 — 공연·예매·취소환불 등 도메인 API, 코인 결제, QR 검증, 정산,
`web3j-ext` 기반 체인 연동(대납 서명·정산 release·검증).

설계 정본은 [`docs/design/`](../docs/design/)이고 코드는 그 결과물이다. **명세(API v6 · ERD v5 ·
화면 v6)에 없는 것을 만들려면 명세를 먼저 고친다.**

| 계약 | 문서 |
|------|------|
| 응답 래퍼·에러 코드 | [`01_API_공통_응답_규격.md`](../docs/design/01_API_공통_응답_규격.md) (현행 **v3**) |
| 엔드포인트 | [`06_API_명세서_v6.md`](../docs/design/06_API_명세서_v6.md) — P0 61개 + P1 3개 |
| 스키마 | [`12_ERD_v5.md`](../docs/design/12_ERD_v5.md) · [`12_ERD_v5_import.sql`](../docs/design/12_ERD_v5_import.sql) |
| 컨벤션 | [`02_개발_컨벤션.md`](../docs/design/02_개발_컨벤션.md) §4·§5 |
| 스택 | [`09_기술_스택_v3.md`](../docs/design/09_기술_스택_v3.md) |
| 로컬 개발 전체 안내 | [`11_개발_환경_안내_v1.md`](../docs/planning/11_개발_환경_안내_v1.md) |

---

## 1. 스택

Java **17** · Spring Boot **3.5.6** · Gradle(wrapper 8.14.3) · JPA(Hibernate) ·
Flyway 11(+**flyway-mysql**) · MySQL 8.0 · Redis 7(Lettuce) · Micrometer/Prometheus ·
Security + oauth2-jose(Web3Auth idToken 검증)

패키지는 `com.ssafy.b204.<domain>` 아래 `controller`/`service`/`repository`/`entity`/`dto`.

- **Java 21을 쓰지 않는다.** `build.gradle`의 툴체인이 17로 고정돼 있고, `settings.gradle`의
  foojay-resolver가 없으면 JDK 17을 자동으로 못 받아온다. Jenkins 컨트롤러 JVM이 21이라
  파이프라인이 이 두 선언의 존재를 `grep`으로 검사한다.
- `flyway-mysql`이 빠지면 기동 시 `Unsupported Database: MySQL 8.0`으로 죽는다.
- **체인 의존성이 들어와 있다**(`feat/be/chain` 머지). 좌표는 실측으로 확정된 것을 쓴다 —
  `io.kaia:web3j-ext:v2.0.7`(**버전에 `v` 접두**. `2.0.7`은 없다) + `org.web3j:core:4.9.8` **명시 선언**
  (web3j-ext가 의존성을 runtime 스코프로 발행해 명시하지 않으면 컴파일이 깨진다),
  `io.codearte.gradle.nexus` 제외. 상세는 `b204-stack` 참조 문서의 "web3j-ext 좌표".
  **그래도 체인 변수가 전부 비면 기동돼야 한다**(§2) — 체인 빈은 전부 조건부이고
  (`chain/config/ChainConditions`) 워커는 매 주기 조용히 돌아 나간다. 테스트도 그 상태로 돈다.

## 2. 실행

```bash
# 1) 인프라 (저장소 루트에서)
docker compose -f docker-compose.local.yml up -d

# 2) 서버
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'

# 3) 확인
curl http://localhost:8080/actuator/health     # {"status":"UP"}
```

`application.yml`의 `local` 프로파일에 로컬 기본값(DB `b204/b204@localhost:3306`,
Redis `localhost:6379`)이 들어 있어 **아무것도 채우지 않고 기동된다.** 값을 바꿔야 하면
[`application-example.yml`](src/main/resources/application-example.yml)을
`application-local.yml`로 복사한다(gitignore 대상 — `application-example.yml`만 커밋한다).

변수 이름은 루트 `.env.example`과 같다 — `DB_URL` `DB_USERNAME` `DB_PASSWORD` `REDIS_HOST`
`REDIS_PORT` `JWT_SECRET` `OPERATOR_PRIVATE_KEY` `MINTER_PRIVATE_KEY` `KAIA_RPC_URL`
`KAIA_CHAIN_ID` `CONTRACT_YOYO_ADDRESS` `CONTRACT_SPLITTER_ADDRESS` `WEB3AUTH_CLIENT_ID`.
`${ENV:기본값}` 형태로만 참조한다.

기동하면 Flyway가 `V{n}__*.sql`을 적용한다(`ddl-auto=none`, 스키마 정본은 Flyway).
V1 = ERD v5(`docs/design/12_ERD_v5_import.sql`).

### 체인 키가 없어도 기동된다

개발 환경 안내 v1 §3.1의 요구사항이다 — "키 없는 팀원이 API 개발을 해야 한다".
`b204.chain.*`가 비면 체인 빈을 만들지 않고, 체인을 타는 경로만 실패한다.
[`ChainConfigurationTest`](src/test/java/com/ssafy/b204/ChainConfigurationTest.java)가 이 동작을
고정한다 — 누가 체인 빈을 필수로 만들면 CI에서 먼저 깨진다.

## 3. 테스트

```bash
./gradlew test
```

- **H2를 쓰지 않는다.** MySQL `ENUM`과 Redis `SETNX` 동작이 달라 테스트가 거짓 통과한다.
  통합 테스트는 Testcontainers로 `mysql:8.0` · `redis:7-alpine`을 띄운다
  (`docker-compose.local.yml`과 같은 태그).
- Docker가 필요하다. Testcontainers가 죽으면 §6을 볼 것.

| 테스트 | 지키는 것 |
|--------|-----------|
| `EndpointInventoryTest` | 등록된 경로가 **API v6 인벤토리 64개와 정확히 일치** (빠짐·초과 모두 실패) |
| `FlywayMigrationTest` | V1이 ERD v5 그대로 — 19테이블·FK 43·ENUM 23·`DATETIME(6)`·collation |
| `ErrorCodeTest` | 규격 v3 §3의 에러 코드 84개·status·문구 형식 |
| `ApiResponseTest` | `{code, data, msg}` 3필드 계약, 실패 시 `data=null` |
| `ChainConfigurationTest` | 체인 변수 없이 기동 |

## 4. 구조

```
com.ssafy.b204
├── B204Application
├── common
│   ├── response/   ApiResponse · PageInfo · PageResponse · Money(display 객체)
│   ├── error/      ErrorCode(84) · BusinessException · GlobalExceptionHandler
│   ├── config/     SecurityConfig · RedisConfig(키 규약) · WebConfig · *Properties
│   ├── entity/     BaseTimeEntity (created_at·updated_at 만 — id 없음)
│   └── security/   MemberPrincipal
└── {domain}/       controller · service · repository · entity · dto
```

도메인 13개 — `member` `team` `wallet` `performance` `rule` `ticket` `payment` `coin`
`refund` `entry` `settlement` `verify` `admin` (+ 공통 폴링 `chain`, 감사 `audit`).

- 패키지는 **레이어보다 도메인이 상위**다(컨벤션 §5).
- PK는 `{테이블명}_id`다. 제네릭 `BaseEntity`의 `id`를 쓸 수 없어 엔티티마다 `@Id`를 선언한다.
  `BaseTimeEntity`는 시각 컬럼만 모으므로 이 제약에 걸리지 않는다.
- DTO는 도메인당 `{Domain}Dtos` 한 파일에 중첩 레코드로 모았다 — 한 도메인의 요청·응답 계약을
  한눈에 보고 프론트 타입과 대조하기 위해서다. 이름은 컨벤션대로 `XxxRequest`·`XxxResponse`다.
- **서비스는 전부 미구현 스켈레톤**이다. 각 메서드에 명세 절 번호와 구현 시 주의점을 적어 두었고
  `COMMON_INTERNAL_ERROR`를 던진다(규격에 없는 코드를 새로 만들지 않는다 — API v6 §16.1).

## 5. 지켜야 할 것

- **응답은 `ApiResponse<T>` 하나만 반환한다.** 실패는 예외를 던지고
  `GlobalExceptionHandler`가 래핑한다. 컨트롤러에서 실패 응답을 조립하지 않는다.
- **에러 코드는 규격 v3 §3에 있는 것만 쓴다.** 필요해 보이는 코드는 대개 §16.1에 "신설 제안"으로
  이미 정리돼 있고 대체 코드가 지정돼 있다. 새 상수를 만들기 전에 §16.1을 볼 것.
- **`msg`에 스택트레이스·SQL·체인 revert 원문을 넣지 않는다**(SEC-09).
- **스키마는 Flyway가 정본**이다. `ddl-auto=none`이고 `validate`도 쓰지 않는다
  (Hibernate 6.3+ ENUM 매핑이 MySQL ENUM과 충돌해 정상 스키마에서도 기동이 실패한다).
  V1은 고치지 않고 V2 이후를 새로 만든다.
- **비밀 값은 `${ENV}` 참조만.** 개인키·JWT 시크릿을 코드·yml에 넣지 않는다.
- ERD에 없는 상태는 Redis에 있다 — 키 규약은 `RedisConfig` 상수와 API v6 §0.12.

## 6. 자주 나는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| `Unsupported Database: MySQL 8.0` | `flyway-mysql` 누락 | 의존성 추가 |
| `bind: address already in use` 3306 | 노트북에 MySQL이 켜져 있음 | 로컬 MySQL 서비스 중지, 또는 compose 포트 변경 |
| `Port 8080 was already in use` | 다른 프로젝트 서버가 떠 있음 | 그 프로세스 종료, 또는 `--server.port=18080` |
| Testcontainers `Could not find a valid Docker environment` (파이프는 붙는데 400) | Docker Engine 29+가 낮은 API 버전을 거부. docker-java는 이 값을 **시스템 프로퍼티**로만 읽는다 | `./gradlew test -PdockerApiVersion=1.44` (또는 `DOCKER_API_VERSION=1.44`). `docker version`의 Server MinAPIVersion 확인 |
| Testcontainers가 컨테이너는 뜨는데 **연결 실패**(CI) | Jenkins 컨트롤러가 컨테이너 안에서 호스트 도커 소켓을 쓴다. 기동된 MySQL·Redis는 **호스트의 형제 컨테이너**라 `localhost:매핑포트`로 닿지 않는다 | `TESTCONTAINERS_HOST_OVERRIDE`를 호스트 주소로 주거나 Jenkins를 호스트 네트워크로 띄운다. 인프라 담당과 조정 |
| `Using generated security password` 로그 | `UserDetailsService` 빈이 없어 Boot가 기본 사용자를 만든다 | `httpBasic`·`formLogin`을 껐으므로 로그인 경로가 없다. JWT 필터를 붙이면 사라진다 |
| web3j 관련 `NoSuchMethodError` | Java 21 또는 okhttp 충돌 | Java 17 확인, `b204-stack` 참조 문서 |
| `io.kaia:web3j-ext:2.0.7` 을 못 찾음 | 버전 문자열에 **`v` 접두**가 필요하다 | `io.kaia:web3j-ext:v2.0.7` |
