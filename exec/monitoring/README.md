# monitoring — Prometheus · Grafana

서버 자원(node-exporter), 컨테이너별 자원(cadvisor), 백엔드 JVM·HTTP·chain_job(Actuator)을 15초 간격으로 수집한다. 보존 7일. 접속은 `https://j15b204.p.ssafy.io/grafana/`(admin).

## 서버 최초 기동 (사람이 1회)

**선행 조건: 앱 스택(`~/app`)이 먼저 떠 있어야 한다.** prometheus 가 앱 네트워크 `app_default` 에
external 로 붙어 백엔드를 컨테이너 이름으로 긁기 때문에, 그 네트워크가 없으면 아래 `up -d` 가
`network app_default not found` 로 즉시 실패한다. 네트워크를 손으로 만들지 말고 앱을 먼저 올린다.

```bash
ssh ubuntu@j15b204.p.ssafy.io
cd ~/S15P21B204 && git pull
mkdir -p ~/monitoring && cp -r exec/monitoring/. ~/monitoring/
cd ~/monitoring && cp .env.example .env && vi .env      # GRAFANA_ADMIN_PASSWORD
docker compose -f docker-compose.monitoring.yml up -d
curl -s localhost:9091/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health}'
```

Nginx `/grafana/` 블록은 `exec/nginx/` 사이트 파일에 있다. 반영은 다른 Nginx 변경과 같다: `cp exec/nginx/*.conf ~/app/nginx/ && sudo nginx -t && sudo systemctl reload nginx`.

## 대시보드 임포트 (Grafana UI → Dashboards → New → Import → ID)

| ID | 이름 | 보는 것 |
|---|---|---|
| 1860 | Node Exporter Full | CPU·메모리·디스크·네트워크 |
| 14282 | Cadvisor exporter | 컨테이너별 CPU·메모리 |
| 4701 | JVM (Micrometer) | 힙·GC·스레드·HikariCP |

chain_job 패널은 4701 복제 후 `b204_chain_job_*` 지표로 직접 추가한다(백엔드 지표 이름은 `.claude/skills/b204-stack/references/backend.md`).

## 백엔드 쪽 요건

`micrometer-registry-prometheus` 의존성 + `management.endpoints.web.exposure.include=health,prometheus` + Security에서 `/actuator/**` permitAll. 백엔드가 없으면 `backend` 잡만 DOWN 이고 나머지는 정상이다.

백엔드 잡은 둘이다. **`backend`** 는 router(`:8080`) 경유라 **활성 색**의 지표이고 색이 바뀌어도
시계열이 끊기지 않는다 — 대시보드는 이쪽을 본다. **`backend_color`** 는 색별 포트
(`b204-backend-blue:8080`·`b204-backend-green:8080`)를 따로 긁어 `color` 라벨을 붙인다.
둘 다 **앱 네트워크(`app_default`)에서 컨테이너 이름으로** 간다 — 호스트 포트는 열지 않는다.
쉬는 색이 체인 작업을 맡는 사고는 `backend` 잡에는 **아무 것도 안 보이기** 때문이다.
뜨지 않은 색의 타깃은 DOWN 으로 남는 것이 정상이다(최초 배포는 한 색만 뜬다).

## 갱신·정리

- 규칙을 고치면 **의미 검사**까지 돌린다 — `promtool check rules` 는 문법만 본다. `cd exec/monitoring && docker run --rm -v "$PWD:/etc/prometheus:ro" --entrypoint promtool prom/prometheus:v3.5.0 test rules /etc/prometheus/alerts_test.yml`
- 설정 변경: `~/monitoring` 에 파일 다시 복사 → `docker compose -f docker-compose.monitoring.yml up -d` (prometheus.yml 은 재기동 필요)
- 데이터 삭제: 볼륨 `prometheus_data`·`grafana_data`. 대시보드도 grafana_data 에 있으니 지우면 다시 임포트한다.

## 메모리 알림 (2026-09-11 · 블루/그린과 함께 들어옴)

**알리기만 한다. 죽이지 않는다.** 죽이는 일은 커널 OOM killer 가 이미 하고, 그 위에
사용자 공간 킬러를 얹으면 "무엇이 필요없는 프로그램인가" 를 코드가 추측하게 된다 —
배포 중인 Jenkins 나 MySQL 을 죽이면 살리려던 것보다 잃는 것이 크다. 대신 **누가 먼저
죽어야 하는지**는 배포 스크립트가 `oom_score_adj` 로 커널에 알려 둔다
(`exec/deploy/blue-green.sh` — 쉬는 색이 1순위다).

이 설정은 `docker exec <색> sh -c 'echo 800 > /proc/1/oom_score_adj'` 로 **컨테이너 안에서**
한다. 호스트 PID 에 `sudo` 로 쓰는 방법은 안 된다 — Jenkins 컨테이너에 `sudo` 가 없고
`docker inspect` 가 주는 PID 는 그 컨테이너의 `/proc` 에 없다. **실패하면 배포 로그에 `⚠` 가
찍힌다. 그 줄이 보이면 이 안전망은 없는 것이다.**

판정 기준은 `used` 가 아니라 **`available`** 이다. 리눅스에서 `buff/cache` 는 회수
가능해서 "used 95%" 는 대개 정상이다(실측 2026-09-11: used 26% · buff/cache 까지 81% ·
available 74%). 기준을 잘못 잡으면 평상시에 계속 울린다.

| 규칙 | 조건 | 뜻 |
|---|---|---|
| `HostMemoryAvailableLow` | available < 15%, 5분 | 배포가 거절될 수 있다 |
| `HostMemoryAvailableCritical` | available < 8%, 2분 | OOM 임박 |
| `ContainerNearMemoryLimit` | 컨테이너가 자기 상한의 90%, 5분 | 블루/그린에서 가장 먼저 보이는 신호 |
| `HostOOMKill` | 10분 내 OOM kill 발생 | 실제로 누가 죽었다 |
| `AlertDeliveryFailing` | 알림 전송 실패 | **알림 경로 자체가 고장** |

### 설치 (서버 1회)

```bash
# 배포 위치는 ~/monitoring 이다(이 문서 위쪽 설치 절차와 같은 곳). 새 파일부터 복사한다 —
# alerts.yml·alertmanager.yml 이 없으면 prometheus 가 rule_files 를 못 읽고 기동에 실패한다.
cd ~/S15P21B204 && git pull && cp -r exec/monitoring/. ~/monitoring/
cd ~/monitoring

# secrets/ 를 **먼저** 만든다. 저장소에는 없다(.gitignore 의 **/secrets/ — 시크릿 자리라
# 그게 맞다). 없는 채로 compose 를 올리면 **도커가 root 소유로 만들어** 그 뒤에 파일을
# 못 쓴다.
mkdir -p secrets && chmod 700 secrets
umask 077 && echo '<Mattermost incoming webhook URL>' > secrets/mattermost_url

# prometheus 도 **다시 만들어야** 한다. alerts.yml 이 새 볼륨 마운트라, 돌고 있는 컨테이너에
# SIGHUP 만 보내면 그 파일이 아예 없어 rule_files 를 못 읽는다(설정 reload 는 되지만 파일이
# 없다). up -d 는 compose 정의가 바뀐 서비스를 알아서 재생성한다.
docker compose -f docker-compose.monitoring.yml up -d prometheus alertmanager

# 규칙·알림 경로가 실제로 붙었는지 확인한다. 둘 다 안 보이면 위 재생성이 안 된 것이다.
curl -s localhost:9091/api/v1/rules  | jq '[.data.groups[].rules[].name]'
curl -s localhost:9091/api/v1/alertmanagers | jq '.data.activeAlertmanagers'
```

이미 root 소유로 생겼으면: `sudo chown -R ubuntu:ubuntu secrets && chmod 700 secrets`

### 전달 확인 — **반드시 한 번 실제로 받아 본다**

`secrets/mattermost_url` 이 없어도 **Alertmanager 는 정상 기동한다**(실측). 알림이
발생할 때에야 전송이 실패하고, 그대로 두면 조용히 사라진다. 그래서 설치 직후 한 번은
실제 메시지를 받아 확인해야 한다.

```bash
# 가짜 알림 하나를 직접 밀어 넣는다. Mattermost 에 뜨면 경로가 살아 있는 것이다.
curl -s -XPOST http://127.0.0.1:9093/api/v2/alerts -H 'Content-Type: application/json' -d '[{
  "labels": {"alertname":"DeliveryCheck","severity":"warning"},
  "annotations": {"summary":"알림 경로 확인","description":"이 메시지가 보이면 정상이다."}
}]'
```

확인 사항 — `secrets/mattermost_url` 이 **파일**인지 본다. 파일 하나를 bind mount 하면
없을 때 도커가 같은 자리에 **디렉토리**를 만든다. 그래서 여기서는 디렉토리째 마운트한다.

```bash
ls -l ~/monitoring/secrets/    # mattermost_url 이 -rw------- 여야 한다
```
