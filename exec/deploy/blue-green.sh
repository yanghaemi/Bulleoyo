#!/bin/bash
# 백엔드 블루/그린 배포. 서버의 배포 루트($DEPLOY_DIR, 기본 ~/app)에서 돈다.
#
#   IMAGE_TAG=<sha> exec/deploy/blue-green.sh
#
# 절차: 쉬는 색을 새 태그로 띄운다 → healthy 를 기다린다 → router 전환 → 확인.
# **healthy 가 아니면 전환하지 않는다.** 깨진 빌드가 서비스를 내리는 길이 없다.
# 이전 색은 끄지 않고 남긴다 — 그것이 10초 롤백의 재료다.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/app}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG 가 필요하다}"
STATE="$DEPLOY_DIR/active_color"
COLOR_CONF="$DEPLOY_DIR/nginx/active_color.conf"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

cd "$DEPLOY_DIR"

# 확인은 언제나 컨테이너 안에서 한다 — 이 스크립트가 호스트에서 도는지 Jenkins 컨테이너
# 안에서 도는지에 따라 127.0.0.1 이 가리키는 곳이 달라지기 때문이다(리뷰 !93 🔴 1).
health_via_router() {
  docker exec b204-router wget -q -T 10 -O /dev/null http://127.0.0.1:8080/actuator/health
}
# 워커가 **실제로** 그 색을 보는가. 두 색이 다 healthy 면 200 만으로는 reload 가 안 먹어도 모른다 —
# router 의 내부 전용 /router/color 로 본다(리뷰 !170 🟡). **단발로 판정하지 않는다**: reload 직후엔
# 옛 워커가 listen 소켓을 아직 공유해 그 한 번을 받을 수 있고, 그러면 성공한 배포가 되감긴다.
switched_to() {  # switched_to <색>
  local i
  for i in 1 2 3 4 5; do
    docker exec b204-router wget -q -T 10 -O - http://127.0.0.1:8080/router/color 2>/dev/null \
      | grep -q "b204-backend-$1:8080" && return 0
    sleep 0.5
  done
  return 1
}

# --- 체인 작업 소유권 인계 (S15P21B204-95) ------------------------------------------
#
# 백엔드는 Redis chain:owner 값이 자기 색(B204_CHAIN_INSTANCE_ID)일 때만 tx 를 보내고
# receipt 를 확정한다(ChainOwnership). 옛 색은 살아 있는 한 매초 임대를 갱신하므로 **저절로
# 넘어가지 않는다** — 전환한 뒤 여기서 넘긴다. rollback.sh 에 같은 함수가 있다(맞춰 고칠 것).
#
# 바로 새 색으로 SET 하지 않고 **두 색 모두 멈춘 뒤 기다렸다가** 넘긴다:
#   ① SET chain:owner handover — 어느 색 이름도 아니라 다음 isOwner()(≤1초)부터 둘 다 쉰다.
#   ② HANDOVER_DRAIN_SECONDS 대기 — 옛 색이 이미 시작한 일이 끝날 시간.
#      · 지갑 큐에 들어간 전송: 전송 직전 claim 이 **자기 claim** 이라 통과해 더 나간다.
#        같은 OPERATOR 지갑이라 새 색의 첫 전송과 겹치면 pending nonce 가 같아진다.
#      · receipt 폴링 한 주기: 루프 시작 때 isOwner() 를 한 번만 보고 SUBMITTED 전부를 훑는다.
#        확정 경로에는 claim 펜싱이 없어 새 색과 겹치면 **도메인 전이가 두 번** 돈다.
#   ③ SET chain:owner <새 색> EX 60 — 새 색이 매초 갱신한다.
#
# ponytail: 대기는 휴리스틱이다. 큐 길이·RPC 지연이 대기보다 길면 ②의 두 경쟁이 그대로 남는다.
#   nonce 겹침은 CHAIN_NONCE_CONFLICT 재시도(REL-09, 3회)로 대개 회복되지만, 확정 이중 실행은
#   백엔드 confirm 경로 펜싱이 있어야 닫힌다 — 스크립트로는 못 닫는다.
#
# **SET 이 실패해도 배포를 되감지 않는다.** 두 색이 같은 Redis 를 보므로 트래픽을 되돌려도
# 소유권 문제는 그대로다. 실패 뒤 남는 상태는 "옛 색이 계속 일한다" 또는 "handover 값이
# 만료될 때까지 아무도 안 하다가 먼저 본 색이 가져간다" — 둘 다 한 색만 일하므로 이중 전송은
# 없고, 잃는 것은 "활성 색이 일한다" 뿐이다. 대신 ⚠ 와 수동 명령을 남긴다.
REDIS_CONTAINER="${REDIS_CONTAINER:-b204-redis}"
HANDOVER_DRAIN_SECONDS="${HANDOVER_DRAIN_SECONDS:-30}"

chain_owner_set() {  # chain_owner_set <값> <TTL초>  — 성공(OK)이면 0
  [ "$(docker exec "$REDIS_CONTAINER" redis-cli SET chain:owner "$1" EX "$2" 2>/dev/null)" = OK ]
}

# chain:active — "어느 색이 일해야 하는가". **TTL 을 주지 않는다.**
# chain:owner 는 60초 임대라 재부팅에서 만료되고, 그 순간 빈 키를 쉬는 옛 색이 SET NX 로
# 가져갈 수 있다(리뷰 !93 🔴). 백엔드는 이 키가 자기 색일 때만 빈 소유권을 집는다.
chain_active_set() {  # chain_active_set <색>
  [ "$(docker exec "$REDIS_CONTAINER" redis-cli SET chain:active "$1" 2>/dev/null)" = OK ]
}

chain_handover() {  # chain_handover <새 색>
  echo "체인 작업 소유권 인계 → $1 (두 색 멈춤 → ${HANDOVER_DRAIN_SECONDS}초 대기 → $1)"
  # 먼저 "일해야 하는 색" 을 못 박는다. **실패하면 소유권을 건드리지 않고 멈춘다.** active 를 못 쓴 채 owner 만 새 색으로 넘기면
  # 새 색은 active 검사에서 쉬어 임대를 갱신하지 않고, 60초 뒤 빈 키를 **active 자격이 있는
  # 옛 색**이 집는다 — 트래픽은 새 색·tx 는 옛 이미지가 되는 상태를 이 배포에서 바로 만든다
  # (리뷰 !170 🔴). 그냥 두면 옛 색이 active 이자 owner 로 남아 한 색만 일한다.
  if ! chain_active_set "$1"; then
    echo "  ⚠ chain:active 를 쓰지 못했다($REDIS_CONTAINER) — 소유권은 건드리지 않고 멈춘다."
    echo "    지금 상태: 트래픽만 $1 로 넘어갔고 체인 작업은 이전 색이 계속 한다."
    echo "    이어서 넘기려면 이 순서로 둘 다 쓴다:"
    echo "      docker exec $REDIS_CONTAINER redis-cli SET chain:active $1"
    echo "      docker exec $REDIS_CONTAINER redis-cli SET chain:owner  $1 EX 60"
    return 0
  fi
  # 여기서부터는 chain:active 가 이미 $1 이다. owner 쓰기가 실패해도 "이전 색이 계속 한다" 가
  # **아니다** — 이전 색은 다음 확인(≤1초)부터 active 검사에서 쉬어 임대를 갱신하지 않고,
  # 임대(≤60초)가 만료되면 $1 만 그것을 집는다. 저절로 맞는 상태로 수렴하므로 수동 SET 은
  # 필요 없다. 잃는 것은 드레인 대기뿐이라, 그 60초 안에 이전 색의 진행 중 전송과 겹칠 수 있다.
  if ! chain_owner_set handover $(( HANDOVER_DRAIN_SECONDS + 60 )); then
    echo "  ⚠ chain:owner 를 쓰지 못했다($REDIS_CONTAINER). chain:active 는 $1 이라 이전 색은 곧 쉬고,"
    echo "    임대(≤60초)가 만료되면 $1 이 소유권을 집는다 — 수동 개입 불필요. 드레인 대기만 건너뛴다."
    echo "    확인: docker exec $REDIS_CONTAINER redis-cli MGET chain:active chain:owner"
    return 0
  fi
  sleep "$HANDOVER_DRAIN_SECONDS"
  if chain_owner_set "$1" 60; then
    echo "  chain:owner = $1"
  else
    echo "  ⚠ 새 색으로 넘기지 못했다 — handover 값이 만료(≤$(( HANDOVER_DRAIN_SECONDS + 60 ))초)되면 chain:active 인 $1 이 집는다. 수동 개입 불필요."
    echo "    확인: docker exec $REDIS_CONTAINER redis-cli MGET chain:active chain:owner"
  fi
}

# 현재 색. 파일이 없으면 첫 배포다 - green 을 띄우고 blue 로 적힌 기본값에서 넘어온다.
active=$(cat "$STATE" 2>/dev/null || echo "")
case "$active" in
  blue)  target=green ;;
  green) target=blue  ;;
  *)     target=blue; active="" ;;
esac
echo "현재 색: ${active:-(없음)} → 올릴 색: $target ($IMAGE_TAG)"

if ! docker image inspect "b204-backend:$IMAGE_TAG" >/dev/null 2>&1; then
  echo "이미지 b204-backend:$IMAGE_TAG 가 없다. 중단한다."
  exit 1
fi

# --- 메모리 여유 확인. 두 번째 JVM 을 띄우기 **전에** 본다 -------------------------
#
# 블루/그린은 잠시 백엔드를 둘 띄운다. 여유가 없는데 시작하면 새 색이 OOM 으로 죽거나,
# 더 나쁘게는 커널이 **돌고 있는 색**을 골라 죽여 서비스가 멈춘다. 배포를 안 하는 것이
# 그것보다 낫다 — 못 하고 끝나면 이전 색이 그대로 서비스 중이다.
#
# used 가 아니라 available 을 본다. 리눅스에서 buff/cache 는 회수 가능해서 "used 95%" 는
# 대개 문제가 아니다(실측: used 26% 인데 buff/cache 까지 세면 81%). available 이 정본이다.
AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
NEED_MB=${BACKEND_NEED_MB:-3072}
echo "메모리 available=${AVAIL_MB}MB · 필요=${NEED_MB}MB"
if [ "${AVAIL_MB:-0}" -lt "$NEED_MB" ]; then
  echo "여유가 부족하다 — **배포를 시작하지 않는다.** ${active:-기존} 이 그대로 서비스 중이다."
  echo "  조치: 쓰지 않는 컨테이너를 내리거나(docker ps), BACKEND_NEED_MB 를 낮춰 다시 돌린다."
  free -m | sed 's/^/    /'
  exit 1
fi

# 인프라는 **게이트를 다 지난 뒤에** 올린다. Redis 가 재생성되는 배포(AOF 볼륨 첫 적용)에서 이 순서가
# 아니면, 메모리 부족으로 배포가 거절돼도 auth:refresh:*(전원 로그아웃)·idem:order:*(§0.8 멱등키)는 이미
# 날아간 뒤다(리뷰 !170 🟡). --wait: 바로 뒤 redis-cli SET 이 기동 중인 redis 를 만나지 않게.
docker compose up -d --wait mysql redis

# 같은 색을 다시 올리는 경우는 없다(항상 반대쪽). 옛 컨테이너가 남아 있으면 새 태그로 갈아끼운다.
TAG_VAR=$( [ "$target" = blue ] && echo BLUE_TAG || echo GREEN_TAG )

# .env 에도 남긴다. 여기서만 env 로 넘기면, 서버에서 누가 `docker compose --profile blue
# up -d backend-blue` 를 직접 치는 순간 그 색의 desired image 가 `b204-backend:missing`
# 이 되어 **돌던 색을 없는 이미지로 재생성한다**(리뷰 !93 🟡).
touch "$DEPLOY_DIR/.env"
sed -i "/^${TAG_VAR}=/d" "$DEPLOY_DIR/.env"
echo "${TAG_VAR}=$IMAGE_TAG" >> "$DEPLOY_DIR/.env"

# 이관(1회) 경로: 옛 단일 컨테이너 b204-backend 는 instance-id 가 없어 **소유권을 안 보고 항상
# 일한다.** 새 색은 기동하자마자 빈 chain:owner 를 NX 로 가져가므로, 옛 것을 치우기 전까지 둘이
# 같이 tx 를 보낸다. 새 색이 뜨기 전에 handover 값을 박아 새 색을 쉬게 한다 — 인계는 전환 뒤.
if [ -z "$active" ] && docker ps --format '{{.Names}}' | grep -qx b204-backend; then
  chain_owner_set handover $(( HEALTH_TIMEOUT + 120 )) \
    || echo "  ⚠ chain:owner 선점 실패 — 이관 중 옛 컨테이너와 새 색이 같이 tx 를 보낼 수 있다"
fi

env "$TAG_VAR=$IMAGE_TAG" docker compose --profile "$target" up -d "backend-$target"

echo "healthy 대기 (최대 ${HEALTH_TIMEOUT}초)..."
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while :; do
  state=$(docker inspect -f '{{.State.Health.Status}}' "b204-backend-$target" 2>/dev/null || echo missing)
  [ "$state" = healthy ] && { echo "  $target healthy"; break; }
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "  $target 이 healthy 가 되지 않았다(상태=$state). **전환하지 않는다.**"
    docker logs --tail 60 "b204-backend-$target" 2>&1 | sed 's/^/    /'
    docker compose --profile "$target" stop "backend-$target"
    echo "  ${active:-기존} 이 그대로 트래픽을 받고 있다."
    exit 1
  fi
  sleep 3
done

# --- 이관(1회) : 옛 단일 컨테이너가 127.0.0.1:8080 을 쥐고 있으면 router 가 못 뜬다 ---
# **지우지 않고 멈춘다.** router 가 뜨고 전환 확인이 통과한 뒤에야 지운다(맨 아래). 그 사이
# router 기동·nginx -t·확인이 실패하면 옛 컨테이너를 다시 올려 8080 을 되돌린다 — 이관 배포는
# active 가 비어 있어 rollback.sh 분기가 없고, 지운 뒤 실패하면 8080 에 아무도 없는 전면 장애가
# 수동 복구뿐으로 남는다(리뷰 !170 🔴). router 와 옛 컨테이너가 같은 8080 을 쓰므로 순서는
# 바꿀 수 없고, 되돌릴 때도 router 를 먼저 내린다. 이 블록은 이관 후엔 no-op.
LEGACY=0
if docker ps -a --format '{{.Names}}' | grep -qx b204-backend; then
  echo "옛 단일 컨테이너 b204-backend 를 멈춘다(8080 해제) — 확인이 통과하면 지운다. 이관 1회."
  docker stop b204-backend >/dev/null
  LEGACY=1
fi
restore_legacy() {
  [ "$LEGACY" = 1 ] || return 0
  # 상태 파일·color conf 도 이관 전으로 — 남겨 두면 옛 컨테이너가 트래픽을 받는데 active_color 는
  # 새 색이라 운영자가 런북의 확인 명령으로 틀린 색을 본다(리뷰 !170 🟡). 이관 전엔 파일이 없었다.
  rm -f "$STATE"
  restore_conf
  # 새 색부터 멈춘다. 놔두면 선점한 chain:owner=handover(TTL HEALTH_TIMEOUT+120)가 만료되는 순간
  # chain:active 가 없어(인계 전이라) 빈 키를 NX 로 집고, 다시 올린 옛 컨테이너는 instance-id 가
  # 없어 언제나 일하므로 **둘이 같은 OPERATOR 지갑으로 tx 를 보낸다**(리뷰 !170 🔴).
  docker compose --profile "$target" stop "backend-$target" >/dev/null 2>&1 || true
  docker compose stop router >/dev/null 2>&1 || true
  if docker start b204-backend >/dev/null; then
    echo "  옛 단일 컨테이너 b204-backend 를 다시 올렸다 — 8080 복구. 새 색은 떠 있지만 트래픽은 안 받는다."
  else
    echo "  ⚠ 옛 컨테이너를 못 올렸다 — 8080 에 아무도 없다. 수동: docker start b204-backend"
  fi
}

# 색 파일을 **router 기동보다 먼저** 만든다. 파이프라인 밖에서 처음 돌리면 이 파일이 없어,
# compose 가 마운트 지점에 디렉토리를 만들어 버리고 router 기동과 아래 printf 가 둘 다 깨진다
# (리뷰 !93 🟡).
mkdir -p "$(dirname "$COLOR_CONF")"
# 검사가 실패하면 **되돌린다.** 안 되돌리면 파일은 새 색인데 reload 를 못 해 트래픽은 옛 색이고,
# 다음 router 재기동에 예고 없이 넘어간다(리뷰 !170 🟡 · active_color.conf 머리말의 그 불일치).
PREV_CONF=$(cat "$COLOR_CONF" 2>/dev/null || true)
# 되돌릴 이전 conf 가 없으면(파이프라인 밖 첫 실행) 빈 파일 대신 템플릿과 같은 기본값을 쓴다 —
# 빈 파일은 include 가 set 을 못 읽어 다음 router 재기동이 unknown "b204_backend" variable 로 죽는다.
restore_conf() {
  if [ -n "$PREV_CONF" ]; then
    printf '%s' "$PREV_CONF" > "$COLOR_CONF"
  else
    printf '# 배포 실패 뒤 기본값. 현재 트래픽을 받는 색.\nset $b204_backend "b204-backend-blue:8080";\n' > "$COLOR_CONF"
  fi
}
printf '# 배포가 덮어쓴다. 현재 트래픽을 받는 색.\nset $b204_backend "b204-backend-%s:8080";\n' "$target" > "$COLOR_CONF"

# router 가 떠 있어야 전환할 자리가 있다. 이미 떠 있으면 no-op.
if ! docker compose up -d router; then
  echo "router 를 띄우지 못했다."
  restore_conf
  restore_legacy
  exit 1
fi
# 검사·reload 어느 쪽이 실패해도 conf 를 되돌린다. reload 만 무방비로 두면 conf 는 새 색인데
# 워커는 옛 색이고 상태 파일·인계는 안 된 채 남아, 다음 router 재기동에 예고 없이 넘어간다(리뷰 !170 🟡).
if ! docker exec b204-router nginx -t; then
  restore_conf
  echo "nginx -t 실패 — color conf 를 되돌렸다. 트래픽은 바뀌지 않았다."
  restore_legacy
  exit 1
fi
if ! docker exec b204-router nginx -s reload; then
  restore_conf
  echo "nginx -s reload 실패 — color conf 를 되돌렸다. 트래픽은 바뀌지 않았다."
  restore_legacy
  exit 1
fi
# 상태 파일은 **확인 전에** 쓴다. 뒤의 확인이 실패하면 rollback.sh 가 이 값을 읽어 반대 색으로
# 되돌리기 때문이다. 이관(active 없음)에서는 rollback.sh 대신 restore_legacy 가 이 파일을 지운다.
echo "$target" > "$STATE"
echo "전환 완료 → $target"
# 여기서부터 인계 완료 전에 중단되면(빌드 중단 등) 트래픽은 $target 인데 chain:active·owner 는 옛 색이라
# 옛 이미지가 계속 tx 를 보낸다 — 경보까지 10분 이상 걸린다. EXIT 에서 확인해 수동 명령을 남긴다(리뷰 !170 🟡).
HANDOVER_DONE=0
trap 'if [ "$HANDOVER_DONE" != 1 ]; then echo "⚠ 인계가 끝나지 않은 채 종료됐다 — 트래픽은 '"$target"' 인데 체인 소유권은 이전 색일 수 있다."; echo "  확인: docker exec $REDIS_CONTAINER redis-cli MGET chain:active chain:owner"; echo "  수동: docker exec $REDIS_CONTAINER redis-cli SET chain:active '"$target"' ; docker exec $REDIS_CONTAINER redis-cli SET chain:owner '"$target"' EX 60"; fi' EXIT

# --- 누가 먼저 죽어야 하는가를 커널에 알려 둔다 -----------------------------------
#
# 메모리가 진짜 모자라면 커널 OOM killer 가 누군가를 고른다. 기본 판정은 "메모리를 많이
# 쓰는 놈" 이라 **돌고 있는 백엔드가 뽑히기 쉽다.** 블루/그린에는 죽어도 되는 프로세스가
# 명확히 하나 있다 — **쉬는 색**이다. 그것이 죽으면 롤백 능력만 잃고 서비스는 안 멈춘다.
#
# 우리가 직접 죽이지 않는다. 고르는 일은 커널이 하던 대로 하고, 순서만 알려 준다.
#
# **컨테이너 안에서 자기 PID1 에 쓴다.** 종전에는 `docker inspect .State.Pid` 로 받은
# **호스트 PID** 에 `sudo tee` 를 했는데 둘 다 틀렸다 — Jenkins 컨테이너에는 sudo 가 없고
# (exec/jenkins/Dockerfile 설치 목록), 호스트 PID 는 그 컨테이너의 /proc 에 없다. 그래서
# 이 설정은 **언제나 no-op 이었는데 문서는 동작한다고 적고 있었다**(리뷰 !93 🔴 4).
# docker exec 경로는 서버에서 올리기·되돌리기 둘 다 실측했다(2026-09-11).
oom_prefer() {  # oom_prefer <색> <점수: -1000..1000, 높을수록 먼저 죽는다>
  if docker exec "b204-backend-$1" sh -c "echo $2 > /proc/1/oom_score_adj" 2>/dev/null; then
    echo "  OOM 우선순위: $1 = $2"
  else
    # 실패해도 배포를 세우지 않는다 — 보강이지 조건이 아니다. 다만 조용히 넘기지도 않는다:
    # 이것이 안 되면 "쉬는 색이 먼저 죽는다" 는 보장이 없는 것이다.
    echo "  ⚠ OOM 우선순위 설정 실패($1) — 쉬는 색 우선 희생 보장이 없다"
  fi
}
# AND-list 로 쓰면 안 된다 — 최초 배포는 active 가 비어 있어 목록 전체가 1 을 반환하고,
# set -e 가 거기서 스크립트를 끊는다. 전환은 성공했는데 **첫 배포가 실패로 보고되고**
# 뒤의 확인·정리가 통째로 건너뛰어진다(리뷰 !93 🔴 2).
oom_prefer "$target" 0
if [ -n "$active" ]; then
  oom_prefer "$active" 800
fi

# 전환이 실제로 먹었는지 router 를 통해 확인한다. 여기서 실패하면 되돌린다.
#
# **router 안에서 확인한다.** 이 스크립트는 Jenkins 컨테이너 안에서 돈다(Jenkinsfile 의
# deployScript · agent any). 거기서 127.0.0.1:8080 은 router 가 아니라 **Jenkins 자신의
# HTTP 포트**라 /actuator/health 가 404 고, curl -f 가 실패해 **모든 배포가 전환 직후
# 되감긴다**(실측: jenkins 컨테이너에서 404). docker exec 로 물으면 호스트든 컨테이너든
# 같은 곳을 본다 — 네트워크 위치를 가정하지 않는다.
if ! health_via_router || ! switched_to "$target"; then
  echo "전환 뒤 확인 실패(응답 없음 또는 /router/color 가 $target 이 아님) — 되돌린다."
  # 이 뒤로는 트래픽이 $target 이 아니다. trap 을 그대로 두면 exit 1 에서 "SET chain:active $target"
  # 을 찍어, 운영자가 따라 치면 **트래픽을 받지 않는 색**에 체인 작업을 넘긴다(리뷰 !170 🟡). 끈다.
  trap - EXIT
  if [ -n "$active" ]; then
    # 인계 전이다 — chain:active·owner 는 아직 $active, 프론트·IMAGE_TAG 도 그대로라 conf·상태만 되돌린다.
    SKIP_HANDOVER=1 "$(dirname "$0")/rollback.sh"
  else
    restore_legacy
  fi
  exit 1
fi

# 인계는 **확인이 통과한 뒤**다. 전에 하면 확인 실패 시 트래픽이 깨진 색에 대기 시간만큼 더
# 머물고, 되돌리며 다시 인계해야 한다. 최초 배포(active 없음)도 같은 길이다 — 선점한 handover
# 값이나 NX 로 가져간 값을 새 색으로 확정한다.
chain_handover "$target"
HANDOVER_DONE=1

# 이관이면 이제야 옛 컨테이너를 지운다 — 확인이 통과했으니 되돌릴 일이 없다.
if [ "$LEGACY" = 1 ]; then
  docker rm -f b204-backend >/dev/null && echo "옛 단일 컨테이너 b204-backend 를 지웠다 — 이관 완료."
fi

echo "확인 완료. 이전 색(${active:-없음})은 롤백용으로 남겨 둔다."
echo "롤백: exec/deploy/rollback.sh  (트래픽 1초 + 체인 소유권 인계 ${HANDOVER_DRAIN_SECONDS:-30}초)"
