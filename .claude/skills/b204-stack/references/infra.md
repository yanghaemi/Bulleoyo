# infra 함정

정본: 기술 스택 v3 §4(9/5 Jenkins 전환) · 컨벤션 §3 · `_workspace/infra_runbook_v2.md`

## 서버 현황 (2026-09-05 기준)
- EC2 `j15b204.p.ssafy.io`, Ubuntu, 계정 `ubuntu`, 15G RAM, 스왑 4G, ufw 22/80/443.
- 설치됨: Docker 29 + compose v5, Node 22, Java 17, Nginx 1.24(호스트) + certbot(HTTPS 발급 완료), Jenkins 컨테이너(`/home/ubuntu/jenkins-data`). gitlab-runner는 9/5 등록했다가 Jenkins 전환으로 제거.
- 배포 디렉토리 `~/app`. compose 파일·`.env`·`nginx/`가 여기 놓인다.
- HTTPS 발급 완료(만료 2026-12-04, 타이머 갱신). 443 블록은 저장소 `exec/nginx/` conf에 완성형 — `certbot --nginx` 재실행 금지.

## CI (Jenkins, EC2 도커 컨테이너) — 2026-09-05 전환
- v2(9/4)의 GitLab CI 셀프 러너는 9/5 사용자 결정으로 **Jenkins**로 교체. 러너는 서버에서 unregister·disable, `.gitlab-ci.yml` 삭제.
- 컨트롤러는 `exec/jenkins/Dockerfile`(jenkins/jenkins:lts-jdk17 + docker CLI + compose + Node 22 + jq) 이미지, `exec/jenkins/docker-compose.jenkins.yml`로 기동. 호스트 포트 `127.0.0.1:9090`, 호스트 Nginx `/jenkins/`로 HTTPS 노출(`JENKINS_OPTS=--prefix=/jenkins`). 8080은 백엔드가 쓴다 — 매뉴얼의 `-p 8080:8080` 그대로 쓰면 충돌.
- 호스트 도커 소켓 마운트 + `group_add: [호스트 docker GID]`. 빌드한 이미지가 곧 배포 이미지(레지스트리 없음). `/home/ubuntu/app`을 같은 경로로 마운트해야 compose가 호스트 데몬에서 같은 프로젝트로 뜬다.
- 파이프라인은 루트 `Jenkinsfile`(Declarative, Multibranch). 모든 브랜치 테스트, `develop` 자동 배포, `master`는 `input` 승인, 컨트랙트 배포는 `DEPLOY_CONTRACT` 파라미터.
- 시크릿은 Jenkins Credentials(Secret text, **ID = 환경변수 이름**). 파이프라인이 서버 `~/app/.env`를 생성. 저장소·이미지·콘솔 로그에 값 금지.
- `blockchain/deployments/kairos.json`을 jq로 읽어 `CONTRACT_*_ADDRESS`·`VITE_CONTRACT_*` 주입. 파일 없으면 빈 값 + 경고.
- **Jenkins가 못 하는 것 하나**: 호스트 Nginx reload. `exec/nginx/` 변경은 서버에서 수동(`cp → sudo nginx -t → systemctl reload nginx`). 파이프라인은 변경 감지 시 경고만 남긴다.
- 플러그인 미러 불안정(SSAFY 가이드): Manage Jenkins → Plugins → Advanced → Update Site를 `https://updates.jenkins.io/update-center.json`으로.
- GitLab MR "Pipelines must succeed"는 GitLab Branch Source 플러그인이 보내는 외부 커밋 상태로 동작.

## compose
- 서비스 5개: `nginx`(또는 호스트 Nginx) · `frontend` · `backend` · `mysql` · `redis`.
- MySQL·Redis 포트는 호스트에 노출하지 않는다. 내부 네트워크만.
- 볼륨 이름 고정(`mysql_data`). 이름을 바꾸면 데이터가 사라진 것처럼 보인다.
- 헬스체크: backend는 Actuator `/actuator/health`, mysql은 `mysqladmin ping`. backend `depends_on`에 `condition: service_healthy`.
- Docker 로그 제한은 daemon.json에 이미 설정됨(10m×3).

## Nginx
- `/api/` → backend:8080, 그 외 → frontend. WebSocket 없음.
- 8080·3306·6379를 외부에 열지 않는다.

## 롤백
이전 이미지 태그로 compose 재기동. 태그는 커밋 SHA 앞 7자리. `latest`만 쓰면 롤백이 불가능하다.

## 모니터링 (exec/monitoring)
- 별도 compose 프로젝트 `monitoring`, 서버 `~/monitoring/`. 앱 네트워크에 끼지 않는다. 백엔드는 `host.docker.internal:8080`(host-gateway)로 스크랩.
- Grafana는 `127.0.0.1:3001` + Nginx `/grafana/`. `GF_SERVER_SERVE_FROM_SUB_PATH=true`라 proxy_pass에 경로를 붙이지 않는다(Jenkins와 같은 규칙).
- Prometheus `127.0.0.1:9091`은 타깃 확인용. 외부 노출 금지.
- 새 스크랩 대상은 `prometheus.yml`에 추가 후 prometheus 컨테이너 재기동. 대시보드는 UI 임포트(ID 1860·14282·4701), 프로비저닝 파일로 만들지 않는다.
- 비밀 값은 `~/monitoring/.env`의 `GRAFANA_ADMIN_PASSWORD` 하나.
