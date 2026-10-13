# exec

SSAFY 최종 산출물 폴더 — 포팅 매뉴얼, 외부 서비스 연동 정보, 시연 시나리오, DB 덤프.

## 산출물 목차

| 문서 | 내용 |
|---|---|
| [`01_포팅_매뉴얼.md`](./01_포팅_매뉴얼.md) | 버전 표·아키텍처·환경변수·로컬 빌드·서버 배포 절차 |
| [`02_외부_서비스.md`](./02_외부_서비스.md) | Web3Auth·Kaia·Mattermost 등 외부 서비스 연동 정보 |
| `03_DB_덤프.sql` | DB 덤프 — 팀원 개인정보 처리 방식이 정해지면 추가한다(아직 없음). 생성·복원 명령은 `01_포팅_매뉴얼.md` §9 |
| [`04_시연_시나리오.md`](./04_시연_시나리오.md) | 화면 ID 기준 시연 단계별 시나리오 |
| 아래 "인프라 파일 위치" ~ "블루/그린 배포" 절 | 운영 런북 — 배포 흐름·업로드 저장소·MINTER 로테이션·알림·블루/그린 세부 |

## 인프라 파일 위치

저장소에서 코드로 관리하는 인프라 파일. 앱 배포에 손으로 만드는 파일은 없다(`~/app/.env`도 Jenkins가 생성한다). 서버에서 사람이 하는 건 Jenkins 컨트롤러 최초 기동과 Nginx 반영 두 가지다(런북 v2).

| 파일 | 역할 | 서버에서의 위치 |
|------|------|-----------------|
| `Jenkinsfile` | 테스트·빌드·배포·컨트랙트 배포 파이프라인 (Multibranch Pipeline) | (Jenkins 컨트롤러가 실행) |
| `exec/jenkins/Dockerfile` | Jenkins 컨트롤러 이미지 — LTS + docker CLI · compose · Node 22 · jq | 이미지 `b204-jenkins:lts` |
| `exec/jenkins/docker-compose.jenkins.yml` | 컨트롤러 기동 — `127.0.0.1:9090`, 호스트 도커 소켓 마운트 | `~/jenkins/` (사람이 1회 복사) |
| `docker-compose.yml` | 컨테이너 — router·backend-blue/green·frontend·mysql·redis | `~/app/docker-compose.yml` (Jenkins가 복사) |
| `.env.example` | 환경변수 이름 계약. 공개 값만 채워져 있고 비밀 값은 비어 있다 | `~/app/.env` (Jenkins가 Credentials로 생성) |
| `backend/Dockerfile` | gradle bootJar → `eclipse-temurin:17-jre`, 8080 | 이미지 `b204-backend:{commit-sha}` |
| `frontend/Dockerfile` | pnpm build → `nginx:alpine`, 80 | 이미지 `b204-frontend:{commit-sha}` |
| `frontend/nginx.conf` | 컨테이너 내부 nginx — 정적 서빙 + SPA fallback | 이미지 안 `/etc/nginx/conf.d/default.conf` |
| `exec/deploy/blue-green.sh` | 배포 스크립트 — 쉬는 색 기동 → healthy 확인 → router 전환 → 체인 소유권 인계 | `~/app/deploy/blue-green.sh` |
| `exec/deploy/rollback.sh` | 롤백 스크립트 — 직전 색으로 되돌림(이미 떠 있어 트래픽 전환만 1초) | `~/app/deploy/rollback.sh` |
| `exec/nginx/router.conf` | router 컨테이너 nginx — 블루/그린 전환점(`active_color.conf` 한 줄로 색 결정) | 이미지 `nginx:1.27-alpine` 안 `/etc/nginx/conf.d/default.conf` |
| `exec/monitoring/docker-compose.monitoring.yml` | Prometheus·Grafana·node-exporter·cadvisor. **앱 네트워크 `app_default`에서 컨테이너 이름으로 스크랩**(호스트 Nginx를 거치지 않음, `exec/monitoring/prometheus.yml`) | `~/monitoring/` (사람이 1회 복사, `exec/monitoring/README.md`) |
| `exec/monitoring/prometheus.yml` · `grafana/provisioning/` | 스크랩 대상(router·backend-blue·backend-green·node·alertmanager·cadvisor) · Prometheus 데이터소스 자동 등록 | `~/monitoring/` |
| `exec/nginx/j15b204.p.ssafy.io.conf` | 호스트 Nginx 사이트 — 80→443 리다이렉트, `/api/`→8080(router), `/jenkins/`→9090, `/docs/`→`~/app/docs/`(basic auth), `/grafana/`→3001, 그 외→3000, `/actuator/` 차단 | `~/app/nginx/` (사람이 복사) → `/etc/nginx/sites-enabled/` 심링크 1회 |

- 사이트 파일에 443 블록 포함. 인증서 경로는 certbot 발급 경로(`/etc/letsencrypt/live/j15b204.p.ssafy.io/`)를 참조한다. 갱신은 systemd 타이머가 하고 사이트 파일은 건드리지 않는다.
- 사이트 파일 반영만은 사람 손이다. Jenkins가 컨테이너 안이라 호스트 `systemctl`을 못 부른다. `exec/nginx/**`가 바뀐 커밋이면 파이프라인이 경고를 남기고, 서버에서 `cp exec/nginx/*.conf ~/app/nginx/` → `sudo nginx -t` → `sudo systemctl reload nginx` 한다(런북 v2 §4).
- 롤백: `~/app/deploy/rollback.sh`(이전 색이 떠 있어 트래픽 1초 + 체인 소유권 인계 30초. 자세한 것은 아래 "블루/그린 배포" 절)
- 업로드 파일은 `~/app/uploads` 를 backend 컨테이너(`/app/uploads`)에 바인드하고 호스트 Nginx 가 같은 경로를 `/uploads/` 로 읽는다 → 아래 "업로드 파일(포스터) 저장소"(서버 1회 작업·백업 대상)

## 배포 흐름

`develop` 머지 → Jenkins(Multibranch Pipeline `b204`)가 GitLab 웹훅으로 깨어남 → 테스트 → 백엔드·프론트 이미지 빌드(태그 = 커밋 SHA 8자리) → 서버 `~/app/.env` 생성 → **`exec/deploy/blue-green.sh` 실행**(쉬는 색을 새 태그로 띄우고 healthy 확인 후 router 전환, 세부는 아래 "블루/그린 배포" 절). `master`는 같은 절차에 배포 승인(input) 한 단계가 더 붙는다. 컨트랙트 배포는 `DEPLOY_CONTRACT` 파라미터를 켠 수동 빌드다.

API 문서 `/docs/`는 `develop` 머지마다 `docs/design/api/`(`index.html`·`openapi.yaml`)가 서버 `~/app/docs/`로 복사되고, 호스트 Nginx가 basic auth를 걸어 `https://j15b204.p.ssafy.io/docs/`로 서빙한다. 이미지 존재 확인보다 앞이라 백엔드·프론트가 없어도 문서는 갱신된다. 계정 생성은 런북 v2 §4-1.

Jenkins 컨트롤러는 같은 EC2의 컨테이너이고, 호스트 도커 소켓으로 빌드·배포한다. 레지스트리가 없어서 빌드한 이미지가 곧 배포 이미지다. 접속은 `https://j15b204.p.ssafy.io/jenkins/`.

### 이미지 빌드 캐시

`Build` 스테이지는 `DOCKER_BUILDKIT=1` 로 돌고, 두 Dockerfile 이 `RUN --mount=type=cache` 로 느린 다운로드를 캐시에 남긴다 — 백엔드는 `/root/.gradle`(gradle 배포판 + 의존성 jar), 프론트는 `/root/.cache/node/corepack`(pnpm 바이너리)과 `/root/.local/share/pnpm/store`(패키지 tarball). 두 이미지 모두 의존성 설치를 소스 `COPY` 앞에 둬서, 소스만 바뀐 커밋에서는 그 레이어가 `CACHED` 로 넘어간다.

배포 스크립트 끝의 `docker image prune -f` 와는 겹치지 않는다. BuildKit 캐시는 이미지가 아니라 빌더 캐시라서 `image prune` 이 지우지 못한다. legacy 빌더는 반대로 캐시를 태그 없는 중간 이미지로 들고 있어서 같은 `prune` 에 매번 날아갔고, 그래서 배포마다 gradle 배포판과 `pnpm install` 을 처음부터 다시 받았다. 위생은 호스트 데몬의 기본 BuildKit GC 정책이 맡는다(아래).

캐시는 호스트 도커 데몬에 쌓인다(Jenkins 컨테이너가 호스트 소켓을 쓰므로). 정리는 데몬의 기본 GC 정책이 한다 — `docker buildx inspect` 의 GC Policy 기준 캐시 마운트는 48시간·4GiB, 전체는 231GiB 상한·여유 공간 57GiB 유지다. 수동 `docker builder prune --max-used-space` 는 develop #169 에서 13GB 캐시에 0B 를 지웠다(정책의 Reserved Space 28.87GiB 아래로는 지우지 않는 것으로 보인다). 효과가 없어 파이프라인에 두지 않는다. 사용량은 `docker builder du`, 통째로 비우려면 `docker builder prune -a --reserved-space 0`. 비운 다음 빌드 한 번은 캐시 도입 전과 같은 시간이 걸린다.

**Jenkins 컨테이너에 buildx 가 있어야 한다.** 빌드는 Jenkins 컨테이너 안의 docker CLI 로 돌고, BuildKit 은 buildx 플러그인이 있어야 켜진다(호스트에 있어도 소용없다). `exec/jenkins/Dockerfile` 이 `docker-buildx-plugin` 을 설치한다. 그 전 이미지로 뜬 Jenkins 에는 없으니, 재빌드하거나 호스트 플러그인을 복사한다(2026-09-23 운영 서버는 복사로 넣었다 — 컨테이너를 다시 만들면 사라지므로 재빌드 때 이 Dockerfile 을 써야 한다):

```bash
docker cp /usr/libexec/docker/cli-plugins/docker-buildx jenkins:/usr/libexec/docker/cli-plugins/
docker exec jenkins docker buildx version
```

`Build` 스테이지가 시작할 때 buildx 를 먼저 확인하고, 없으면 위 조치를 찍고 멈춘다.

## 업로드 파일(포스터) 저장소

포스터·티켓 아트워크는 서버 디스크에 둔다(MinIO·S3 없음). 백엔드 컨테이너가 `/app/uploads` 에 쓰고, **같은 파일을 호스트 Nginx 가 `/uploads/` 로 읽어서** 서빙한다 — 그래서 named volume 이 아니라 호스트 경로 바인드다.

| | 경로 |
|---|---|
| 호스트 | `/home/ubuntu/app/uploads` |
| 컨테이너 | `/app/uploads` (`UPLOAD_DIR`, 기본값 같음) |
| 공개 URL | `${APP_BASE_URL}/uploads/p/{yyyyMM}/{uuid}.{ext}` |

**서버 1회 작업** — 컨테이너가 뜨기 전에 해야 한다. 디렉토리가 없으면 도커가 `root:root` 로 만들어 버려서 백엔드(`backend/Dockerfile` 의 `app`, **uid 10001**)가 쓰지 못한다.

```bash
sudo install -d -o 10001 -m 755 /home/ubuntu/app/uploads
ls -ld /home/ubuntu/app/uploads     # drwxr-xr-x 10001 root
```

소유자만 쓰고 나머지는 읽기(`755`)다 — Nginx(`www-data`)는 읽기만 하면 된다. 그룹은 지정하지 않는다(이미지가 만드는 gid 가 uid 와 다를 수 있다).

Nginx `/uploads/` location 반영은 다른 사이트 변경과 같은 절차다(위 "인프라 파일 위치" 주석·런북 v2 §4): `cp exec/nginx/*.conf ~/app/nginx/` → `sudo nginx -t` → `sudo systemctl reload nginx`.

점검:

```bash
du -sh ~/app/uploads                # 디스크 사용량(상한 없음, 15G 서버 기준 수 GB까지 무해)
ls ~/app/uploads/p/$(date +%Y%m) | tail
curl -sI https://j15b204.p.ssafy.io/uploads/p/…/….jpg | head -3   # 200 + Cache-Control: immutable
```

**백업 대상.** 재배포·롤백으로 사라지면 안 되는 상태는 둘뿐이다 — DB(`mysql_data` 볼륨)와 **`~/app/uploads`**. 컨테이너·이미지는 언제든 다시 만들지만 이 디렉토리는 원본이 없다(업로드한 사람 폰에만 있다). 서버를 재구축하거나 EC2 를 옮기면 둘 다 먼저 받아 둔다.

```bash
tar czf ~/uploads-$(date +%F).tgz -C ~/app uploads
```

**임시 업로드(`TEMP`)는 자동으로 지워진다.** `FileUploadCleanupScheduler`가 1시간마다 돌며, 업로드된 지 24시간이 지나도록 공연에 매이지 않은(`TEMP`) 행과 그 디스크 파일을 함께 지운다(1회 최대 500건). **공연에 매인(`BOUND`) 파일은 지우지 않는다** — 공연 수정으로 이미지가 교체돼 참조가 끊긴 뒤에도 롤백·감사 흔적으로 남는다. 그래서 백업·점검은 "24시간 이내 TEMP는 곧 사라질 수 있다"를 전제하고, 디스크 사용량 증가는 사실상 `BOUND` 누적분이다 — 정말 모자라면 사람이 판단해서 지운다(위 `du`로 확인). 디스크 상한 자체는 없다.

## MINTER 로테이션

운영 MINTER 키를 바꾸는 절차. `YoYo.rotateMinter` 는 ADMIN 콜드 키만 부를 수 있어서, 키를 사람이 꺼내지 않고 Jenkins `Rotate minter` 스테이지(`ROTATE_MINTER` 파라미터 + 승인)가 실행한다. 스크립트는 `blockchain/scripts/rotate-minter.ts` — 없으면 스테이지가 실패로 끝난다.

교체 중에는 워커를 꺼 둔다. 옛 키로 나간 MINT job 이 FAILED 되면 되살릴 수 없다 — MINT 는 `retireIdempotencyKey` 가 **금지**(멱등키가 `grantRef` 재료)라 키가 바뀌지 않고, 같은 멱등키 요청이 그 FAILED job 을 그대로 돌려준다. `Rotate minter` 스테이지는 `B204_ENV` 와 **떠 있는 백엔드 전부**(`b204-backend-blue`·`-green`, 이관 전이면 `b204-backend`) 둘 다 `CHAIN_WORKER_ENABLED=false` 가 아니면 멈춘다. 떠 있는 백엔드를 하나도 못 찾으면 확인이 안 된 것이라 역시 멈춘다.

**블루/그린에서는 재배포 1회로 이 게이트가 풀리지 않는다.** 배포는 쉬는 색만 새 태그·새 env 로 다시 만들고 직전 활성 색은 **옛 env 로 계속 떠 있다** — 그 색에서 게이트가 멈춘다. 둘 중 하나로 한다.

- 배포를 **2회** 돌린다(두 색이 차례로 새 env 를 받는다). 롤백 대상이 남는 쪽이라 이 방법을 권한다
- 또는 쉬는 색을 내린다: `cd ~/app && docker compose stop backend-<쉬는 색>` — 롤백 1초를 그 동안 포기한다

**워커를 끄면 멈추는 것은 MINT 만이 아니다.** `ChainJobWorker` 는 OPERATOR job 전송과 `SUBMITTED` receipt 확정을 **전부** 맡는다. 1~5단계 내내 사용자의 결제·보증금 tx 가 `SUBMITTED` 에서 확정되지 않고(화면은 계속 "처리 중"), 환불·집계·정산 job 도 나가지 않는다. 그래서 이 절차는 **무통행 시간대에만** 한다 — 판매 중인 공연이 있으면 판매 마감 뒤로 미루고, 시작 전에 팀에 공지한다.

1. **워커 끄기** — 진행 중인 tx 가 없는 시간대인지 먼저 본다: `SELECT tx_type, status, COUNT(*) FROM chain_job WHERE status IN ('PENDING','SUBMITTED') GROUP BY tx_type, status;` 가 **비어 있어야** 한다(tx_type 을 MINT 로 좁히지 않는다 — 워커가 꺼지면 다른 유형도 그 자리에서 멈춘다). 그 뒤 Jenkins Credentials `B204_ENV` 에 `CHAIN_WORKER_ENABLED=false` 한 줄을 넣고 재배포(develop 빌드 다시 실행). 기동 로그에 워커가 돌지 않는지 확인한다.
2. **새 주소 충전** — 새 MINTER 주소에 Kairos KAIA 를 넣는다.
3. **로테이션** — Build with Parameters → `ROTATE_MINTER` 체크, `NEW_MINTER_ADDRESS` 에 새 공개 주소 → 승인. `ROTATE_MINTER` 가 켜진 빌드는 `Verify`(테스트)·`Build`·`Deploy dev`·`Deploy prod` 를 건너뛰고 교체만 한다 — 워커가 꺼져 있는 동안 전체 테스트를 기다리지 않는다. **`DEPLOY_CONTRACT` 와 같이 켜면 빌드가 즉시 중단된다**(새 컨트랙트를 배포하면 그 주소가 운영 `.env` 와 달라 교체가 반영되지 않는다). 새 주소가 `OPERATOR_ADDRESS` 와 같으면 스테이지가 끊는다 — 그대로 교체하면 백엔드가 기동하지 못한다.
4. **즉시 키 교체** — `B204_ENV` 의 `MINTER_PRIVATE_KEY` 를 새 키로 바꾸고 `CHAIN_WORKER_ENABLED` 줄을 지운다.
5. **재배포** — develop 빌드를 파라미터 없이 다시 실행한다.
6. **공개 주소 커밋** — `blockchain/deployments/kairos.json` 의 `roles.minter` 와 `.env.example` 의 `MINTER_ADDRESS` 를 새 주소로 바꿔 커밋한다(`Deploy contract` 가 `.env.example` 에서 minter 주소를 읽는다). 노트북 `.env` 에 남은 옛 MINTER 키는 지운다.

**3~5 사이에 develop 빌드가 돌면 안 된다 — 머지를 참는 것만으로는 부족하다.** `disableConcurrentBuilds()` 때문에 승인을 기다리는 동안 트리거된 develop 빌드가 **큐에 쌓였다가 로테이션 직후 자동으로** 돈다. 그 빌드는 아직 옛 `MINTER_PRIVATE_KEY` 인 `B204_ENV` 로 `Deploy dev` 를 해서 백엔드가 기동 실패한다. 그래서 3단계 전에 **Jenkins 에서 `develop` 브랜치를 일시 중지하고 대기열을 비운다**:

- `b204` → `develop` → **Disable Branch**(또는 좌측 `빌드 대기열`의 develop 항목 X 로 제거)
- 5단계 재배포 직전에 다시 **Enable Branch**

**3~5 사이에 develop 머지 금지.** 백엔드 `ChainRoleGuard` 는 기동 시 서버 MINTER 키 주소가 온체인 `YoYo.minter()` 와 다르면 기동을 실패시킨다 — 3 이후 옛 키로 재배포되면 백엔드가 뜨지 않는다.

확인:
- 기동 로그 `체인 역할 검증 OK — minter=<새 주소>, ...` (`docker logs b204-backend-$(cat ~/app/active_color) 2>&1 | grep '체인 역할 검증'`). "건너뜀" 이면 노드·주소 문제라 검증이 안 된 것이다.
- 워커가 켜진 뒤 멈춰 있던 job 이 소진된다 — `SELECT tx_type, status, COUNT(*) FROM chain_job WHERE status IN ('PENDING','SUBMITTED') GROUP BY tx_type, status;` 가 비고, `FAILED` 가 늘지 않는다(MINT 뿐 아니라 그 사이 쌓인 결제·정산 job 까지 본다).

## GitLab → Mattermost 알림 (`jenkins/notify/`)

MR 생성·머지·닫힘과 MR 코멘트를 Mattermost 채널에 올린다. 코멘트는 **MR 작성자를 @태그**한다(본인 코멘트는 태그 없음). 자동 리뷰 봇 코멘트는 "🤖 자동 리뷰"로 표시.

- 흐름: GitLab 프로젝트 웹훅(Merge request events · Comments) → `https://j15b204.p.ssafy.io/hooks/gitlab` → Nginx → `b204-notify`(:9092) → Mattermost incoming webhook
- 서버 설정: `~/jenkins/.env.notify` (미커밋) — `MM_WEBHOOK`, `GITLAB_HOOK_TOKEN`(웹훅 Secret token 과 동일), `MM_USERS`(GitLab user id → Mattermost 아이디, `30574=…,30549=…`)
- 기동: `cd ~/jenkins && cp -r ~/S15P21B204/exec/jenkins/. . && DOCKER_GID=$(stat -c %g /var/run/docker.sock) docker compose -f docker-compose.jenkins.yml up -d --build notify`
- 로그: `docker logs b204-notify --tail 50`
- GitLab 웹훅 등록은 API 로(이강륜). 웹훅 테스트 버튼 → 채널에 📬 메시지가 오면 끝.

백엔드 운영 알림(서버 결함 revert·발행량 halt 전환)도 같은 채널로 온다. 배포 스테이지가 Jenkins Secret text `MATTERMOST_WEBHOOK`(빌드 성공·실패 알림과 같은 크리덴셜)을 서버 `.env` 의 `ALERT_WEBHOOK_URL` 로 넣고, compose 가 backend 컨테이너에 넘긴다. 크리덴셜이 없으면 배포는 그대로 되고 콘솔에 "알림 웹훅 없음" 경고만 남으며, 백엔드 알림은 로그로만 남는다. 로컬 compose 에는 넣지 않는다(비활성이 기본).


## 블루/그린 배포 (백엔드)

호스트 Nginx → `127.0.0.1:8080` → **router 컨테이너** → `b204-backend-blue` 또는 `-green`.

색 전환이 router 안에서 끝나므로 **호스트 Nginx 설정은 바뀌지 않는다.** Jenkins 는
컨테이너 안이라 호스트 `systemctl` 을 못 부르는데, 그 제약이 여기서 사라진다.

| | 명령 | 걸리는 시간 |
|---|---|---|
| 배포 | 파이프라인이 `deploy/blue-green.sh` 실행 | 새 색 기동(~60초) + 전환(~1초) |
| 롤백 | `cd ~/app && deploy/rollback.sh` | **트래픽 1초** + 체인 소유권 인계 30초(합 30초+) |
| 지금 색 | `cat ~/app/active_color` | — |

**깨진 빌드는 서비스를 내리지 못한다.** 새 색이 healthcheck 를 통과해야만 전환하고,
통과하지 못하면 그 색을 내리고 이전 색이 계속 받는다.

롤백이 1초인 이유는 **이전 색이 계속 떠 있기 때문**이다. 이미지 태그를 되감는 롤백
(`IMAGE_TAG=<옛 sha> docker compose up -d`)은 컨테이너를 다시 만들어 JVM 기동을
기다린다 — 그쪽은 1~2분이다.

### 체인 작업 소유권 인계

두 색이 같이 떠 있어도 **체인 tx 는 Redis `chain:owner` 를 가진 한 색만** 보낸다
(`B204_CHAIN_INSTANCE_ID` = 색 이름, `ChainOwnership`). 소유자는 매초 임대를 갱신하므로
저절로 넘어가지 않고, 스크립트가 넘긴다.

- `blue-green.sh`: router 전환 **확인이 통과한 뒤**, `rollback.sh`: 되돌린 확인 뒤.
- 절차: `SET chain:owner handover` 로 두 색 모두 멈춤 → `HANDOVER_DRAIN_SECONDS`(기본 30초)
  대기 → `SET chain:owner <새 색> EX 60`. 대기는 옛 색의 지갑 큐에 이미 들어간 전송과
  receipt 폴링 한 주기가 끝날 시간이다. **휴리스틱이다** — 그보다 길면 nonce 겹침·확정
  이중 실행 경쟁이 남는다(스크립트 주석).
- SET 실패는 `⚠` 와 수동 명령만 남기고 배포를 되감지 않는다. 두 색이 같은 Redis 를 봐서
  트래픽을 되돌려도 소유권은 그대로이고, 남는 상태는 "한 색만 일한다" 라 이중 전송은 없다.
- 키는 둘이다. `chain:owner` 는 **임대**(TTL 60초, 살아 있는 소유자가 매초 갱신)이고,
  `chain:active` 는 **TTL 없는 "어느 색이 일해야 하는가"** 다. 백엔드는 빈 `chain:owner` 를
  `chain:active` 가 자기 색일 때만 가져간다 — 호스트 재부팅이면 두 색과 Redis 가 함께 서고
  임대는 JVM 기동(60~90초) 중에 만료되므로, 이 검사가 없으면 **먼저 깨어난 쉬는 옛 색이
  체인 작업을 맡는다**(트래픽은 새 색, tx 는 옛 이미지 — 조용하다).
- 확인: `docker exec b204-redis redis-cli MGET chain:active chain:owner`
- Redis 는 AOF 영속이다(`redis_data` 볼륨). 무영속이면 재기동에서 이 키가 사라져 **쉬는 옛 색이 소유권을 먼저 가져갈 수 있다** — 그 색이 체인 tx 를 맡으면 새 빌드의 job 이 조용히 `PENDING` 으로 남는다. 로그인 세션(`auth:refresh:{jti}`)도 같은 볼륨에 산다.
- 이 설정을 처음 적용하는 배포에서는 redis 컨테이너가 **한 번 재생성**된다(볼륨이 붙는다).
  그 순간 Redis 안의 것이 **전부** 사라진다. 그래서 **첫 배포는 예매 트래픽이 없는 시각에 한다**
  — 표의 셋째 줄(`idem:order:*`)이 그 이유다.

  | 사라지는 것 | TTL | 결과 |
  |---|---|---|
  | `chain:active` · `chain:owner` | 없음 · 60초 | 아무도 체인 작업을 안 하거나 쉬는 색이 가져간다 → 배포 직후 아래 명령으로 넣는다 |
  | `auth:refresh:{jti}` · `auth:refresh:member:{id}` | 14일 | **전원 로그아웃.** 다시 로그인하면 된다 |
  | `idem:order:*` | 24시간 | **§0.8 멱등키가 사라져 주문이 하나 더 생길 수 있다.** 재생성 직전 24시간 안에 결제를 시작한 사용자가 같은 `Idempotency-Key` 로 재시도하면 `SET NX` 가 새로 성공한다(`IdempotencyGuard`) — 중복 주문은 되돌리기가 비싸다 |
  | `wallet:balance` | 없음 | 캐시다. 다음 조회에서 체인 재조회로 재구축된다(무해) |
  | `entry:{ticketId}` · `wallet:challenge:{id}` | 60초 · 300초 | 입장 마커는 `ticket.status = USED` 가 영구 방어이고, 챌린지는 다시 발급받으면 된다(무해) |

  배포 직후:
  ```bash
  # 배포의 chain_handover 가 둘 다 쓰므로 **두 값이 보여야 정상**이다(active=활성 색, owner=같은 색).
  docker exec b204-redis redis-cli MGET chain:active chain:owner
  # 비어 있거나 색이 다르면 인계가 실패한 것이다. 이 순서로 둘 다 쓴다.
  docker exec b204-redis redis-cli SET chain:active <색>            # TTL 없음
  docker exec b204-redis redis-cli SET chain:owner  <색> EX 60
  ```
- **색 이름이 고유한 근거는 `container_name` 고정이다.** `--scale`·`container_name` 제거 금지 —
  같은 색이 둘 뜨면 둘 다 소유자이고 DB claim 도 둘 다 통과한다.
- `SupplyReconcileScheduler` 의 halt 판정(발행량 대사 스냅샷)은 인스턴스 메모리라 두 색이
  최대 30초 갈릴 수 있다. 각 색이 같은 체인·DB 를 따로 대사하므로 곧 수렴하고 실해는 없다.

### 두 색이 겹치는 동안의 마이그레이션

**additive 만**(컬럼·테이블·인덱스 추가). 컬럼 삭제·이름 변경, ENUM 값 제거, NOT NULL 추가
금지 — 새 색이 Flyway 를 올린 순간 옛 색(롤백 대상)이 그 스키마 위에서 돌고 있다.
지워야 하면 "안 쓰게 배포 → 다음 배포에서 삭제" 두 번에 나눈다.

### 최초 이관 (1회)

옛 단일 컨테이너 `b204-backend` 가 `127.0.0.1:8080` 을 쥐고 있다. `blue-green.sh` 가
**새 색이 healthy 가 된 뒤에** 그것을 치우고 router 를 띄우므로, 비는 시간은 수 초다.
호스트 Nginx 는 계속 `127.0.0.1:8080` 만 보므로 건드릴 것이 없다.

**예매 트래픽이 없는 시각에, 사람이 지켜보는 채로 한다.** 이 배포에서만 Redis 가 재생성돼
위 표의 것이 전부 사라진다 — 특히 `idem:order:*` 가 없어지는 24시간 창이 중복 주문을 만든다.
끝나고 확인할 것: `cat ~/app/active_color` · `MGET chain:active chain:owner` · 로그인 1회.

### 주의

- `docker compose up -d --remove-orphans` 를 쓰지 않는다. 두 색이 profile 뒤에 있어서
  프로필 없이 올리면 쉬는 색이 고아로 지워질 수 있다 — 그러면 롤백 대상이 사라진다.
- `~/app/nginx/active_color.conf` 는 **상태 파일**이다. 배포가 덮어쓰지 않는다
  (덮으면 돌던 색이 blue 로 되돌아간다).
