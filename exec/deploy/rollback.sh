#!/bin/bash
# 직전 색으로 되돌린다. 이전 색 컨테이너가 **이미 떠 있으므로** JVM 기동을 기다리지 않는다 —
# 트래픽 전환 자체는 파일 한 줄 + router reload(약 1초)다. 그 뒤 체인 작업 소유권 인계가
# HANDOVER_DRAIN_SECONDS(기본 30초) 동안 더 걸린다 — 전체는 30초를 넘는다. 중간에 Ctrl-C 하면
# chain:owner=handover 가 남아 90초 동안 어느 색도 체인 작업을 하지 않는다(리뷰 !93 🟡).
#
# 이미지를 되감는 롤백(IMAGE_TAG=<옛 sha> docker compose up -d)과 다르다. 그쪽은 컨테이너를
# 다시 만들어 기동 90초를 기다린다.
#
# SKIP_HANDOVER=1 — blue-green.sh 가 **인계 전** 전환 확인 실패에서만 넘긴다. 그때 chain:active·owner 는
# 아직 되돌릴 색이고 프론트·.env IMAGE_TAG 도 안 바뀌었다. conf·active_color·OOM 을 되돌리고 chain:active 만 쓴 뒤 끝낸다 —
# 인계를 돌면 정상적으로 일하던 색의 체인 작업이 드레인 동안 멈춘다(S15P21B204-188). 사람이 직접 부를 땐 넘기지 않는다.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/app}"
STATE="$DEPLOY_DIR/active_color"
COLOR_CONF="$DEPLOY_DIR/nginx/active_color.conf"

# 서브셸 안에서 echo·exit 하지 않는다. `$( )` 안의 echo 는 터미널이 아니라 **$active 로 들어가고**,
# exit 는 그 서브셸만 끝낸다. 남는 것은 상태 1인 대입이라 errexit 이 여기서 스크립트를 죽인다 —
# 운영자는 아무 메시지도 못 보고 종료 코드 1만 본다(리뷰 !170 🔴).
if [ ! -f "$STATE" ]; then
  echo "active_color 파일이 없다($STATE). 되돌릴 대상을 모른다."
  exit 1
fi
active=$(cat "$STATE")
case "$active" in
  blue)  target=green ;;
  green) target=blue  ;;
  *) echo "active_color 값이 이상하다: $active"; exit 1 ;;
esac

state=$(docker inspect -f '{{.State.Health.Status}}' "b204-backend-$target" 2>/dev/null || echo missing)
if [ "$state" != healthy ]; then
  echo "되돌릴 색 $target 이 healthy 가 아니다(상태=$state). 되돌리면 서비스가 죽는다. 중단한다."
  exit 1
fi

# conf 를 먼저 쓰고 검사한다. 검사가 실패하면 **되돌린다** — 안 되돌리면 파일은 새 색인데
# reload 를 못 해 지금 트래픽은 옛 색이고, 다음 router 재기동에 예고 없이 넘어간다(리뷰 !170 🟡).
PREV_CONF=$(cat "$COLOR_CONF" 2>/dev/null || true)
# 빈 파일을 남기면 다음 router 재기동이 unknown "b204_backend" variable 로 죽는다 — blue-green.sh 와 같은 기본값.
restore_conf() {
  if [ -n "$PREV_CONF" ]; then
    printf '%s' "$PREV_CONF" > "$COLOR_CONF"
  else
    printf '# 롤백 실패 뒤 기본값. 현재 트래픽을 받는 색.\nset $b204_backend "b204-backend-blue:8080";\n' > "$COLOR_CONF"
  fi
}
printf '# 롤백이 덮어썼다. 현재 트래픽을 받는 색.\nset $b204_backend "b204-backend-%s:8080";\n' "$target" > "$COLOR_CONF"
# 검사·reload 어느 쪽이 실패해도 되돌린다(리뷰 !170 🟡 — reload 만 무방비면 conf 는 새 색인데 워커는 옛 색).
if ! docker exec b204-router nginx -t; then
  restore_conf
  echo "nginx -t 실패 — color conf 를 되돌렸다. 트래픽은 $active 그대로다."
  exit 1
fi
if ! docker exec b204-router nginx -s reload; then
  restore_conf
  echo "nginx -s reload 실패 — color conf 를 되돌렸다. 트래픽은 $active 그대로다."
  exit 1
fi
echo "$target" > "$STATE"

# 확인은 router 안에서 한다 — 호출자가 호스트일 수도 Jenkins 컨테이너일 수도 있다.
# 200 만으로는 두 색이 다 healthy 라 reload 가 안 먹어도 모른다 — 내부 전용 /router/color 로 워커가
# 실제로 되돌린 색을 보는지 같이 본다. reload 직후 옛 워커가 한 번 받을 수 있어 5회 재시도(리뷰 !170 🟡).
if ! docker exec b204-router wget -q -T 10 -O /dev/null http://127.0.0.1:8080/actuator/health; then
  echo "롤백 뒤 확인 실패(응답 없음)"; exit 1
fi
switched=0
for i in 1 2 3 4 5; do
  docker exec b204-router wget -q -T 10 -O - http://127.0.0.1:8080/router/color 2>/dev/null \
    | grep -q "b204-backend-$target:8080" && { switched=1; break; }
  sleep 0.5
done
if [ "$switched" != 1 ]; then
  # 반영이 안 됐으면 트래픽은 아직 $active 다. conf·상태 파일을 그대로 두면 active_color 는 $target 인데
  # 실제는 $active 로 갈려, 다음 배포가 **지금 트래픽을 받는 색**을 재생성한다(리뷰 !170 🔴). 되돌린다.
  restore_conf
  docker exec b204-router nginx -s reload >/dev/null 2>&1 || true
  echo "$active" > "$STATE"
  echo "롤백 뒤 확인 실패 — 워커가 아직 $target 을 보지 않는다(/router/color 불일치). conf·active_color 를 $active 로 되돌렸다."
  exit 1
fi
echo "롤백 완료 → $target (트래픽)"

# OOM 우선순위는 **전환이 확인된 뒤에** 바꾼다. 앞에서 바꾸면 확인 실패로 $active 로 되돌아갔을 때
# 트래픽을 받는 $active 가 800 을 단 채 남아 커널의 1순위 희생자가 된다(리뷰 !170 🟡 · !93 🟡).
oom_prefer() {
  docker exec "b204-backend-$1" sh -c "echo $2 > /proc/1/oom_score_adj" 2>/dev/null \
    && echo "  OOM 우선순위: $1 = $2" || echo "  ⚠ OOM 우선순위 설정 실패($1)"
}
oom_prefer "$target" 0
oom_prefer "$active" 800

# 체인 작업 소유권을 **프론트보다 먼저** 되돌린 색으로 넘긴다. 뒤에 두면 프론트 재생성이 도는
# 수십 초 동안 트래픽은 되돌린 색인데 chain:active·owner 는 문제의 색이라 그 이미지가 계속 tx 를
# 보낸다(리뷰 !170 🟡). 트래픽은 이미 넘어갔고, 이 대기는 체인 작업만 멈춘다. 절차·경쟁·실패 정책은 blue-green.sh 의 같은 함수 주석이 정본이다(맞춰 고칠 것).
# ponytail: 대기는 휴리스틱 — 옛 색의 지갑 큐·receipt 폴링 한 주기가 대기보다 길면 경쟁이 남는다.
REDIS_CONTAINER="${REDIS_CONTAINER:-b204-redis}"
HANDOVER_DRAIN_SECONDS="${HANDOVER_DRAIN_SECONDS:-30}"
chain_owner_set() {
  [ "$(docker exec "$REDIS_CONTAINER" redis-cli SET chain:owner "$1" EX "$2" 2>/dev/null)" = OK ]
}
# chain:active — "어느 색이 일해야 하는가", TTL 없음. 임대(chain:owner)는 재부팅에서 만료돼
# 빈 키를 쉬는 색이 가져갈 수 있다(리뷰 !93 🔴). blue-green.sh 의 같은 함수가 정본이다.
chain_active_set() {
  [ "$(docker exec "$REDIS_CONTAINER" redis-cli SET chain:active "$1" 2>/dev/null)" = OK ]
}
chain_handover() {
  echo "체인 작업 소유권 인계 → $1 (두 색 멈춤 → ${HANDOVER_DRAIN_SECONDS}초 대기 → $1)"
  echo "  이 대기를 중단하면: docker exec $REDIS_CONTAINER redis-cli SET chain:owner $1 EX 60"
  # **실패하면 소유권을 건드리지 않고 멈춘다.** active 를 못 쓴 채 owner 만 새 색으로 넘기면
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
  # 여기서부터 chain:active 가 이미 $1 이다. owner 쓰기가 실패해도 이전 색은 다음 확인부터 쉬고,
  # 임대(≤60초)가 만료되면 $1 만 집는다 — 저절로 수렴하므로 수동 SET 은 필요 없다(드레인 대기만 건너뛴다).
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
# 인계 전 실패 경로(blue-green.sh 가 SKIP_HANDOVER=1 로 부른다): owner·프론트·.env IMAGE_TAG 는 이미
# $target 기준이라 인계(드레인 대기)를 돌지 않는다. chain:active 만 못 박는다 — Redis 재생성 직후처럼 키가
# 없으면 빈 chain:owner 를 쉬는 색이 NX 로 잡을 수 있다(!211 리뷰 🟡). 실패해도 롤백은 끝낸다.
if [ "${SKIP_HANDOVER:-0}" = 1 ]; then
  echo "  인계 전 실패 경로(SKIP_HANDOVER=1) — 체인 인계·프론트·.env IMAGE_TAG 는 건드리지 않는다."
  if chain_active_set "$target"; then
    echo "  chain:active = $target"
  else
    echo "  ⚠ chain:active 를 쓰지 못했다($REDIS_CONTAINER). 수동: docker exec $REDIS_CONTAINER redis-cli SET chain:active $target"
  fi
  exit 0
fi
# 전환 뒤 인계 전에 중단되면(Ctrl-C·빌드 중단) 트래픽은 $target 인데 chain:active·owner 는 옛 색이라
# 옛 이미지가 계속 tx 를 보낸다. 그 상태로 끝나는지 EXIT 에서 확인해 수동 명령을 남긴다(리뷰 !170 🟡).
HANDOVER_DONE=0
trap 'if [ "$HANDOVER_DONE" != 1 ]; then echo "⚠ 인계가 끝나지 않은 채 종료됐다 — 트래픽은 '"$target"' 인데 체인 소유권은 이전 색일 수 있다."; echo "  확인: docker exec $REDIS_CONTAINER redis-cli MGET chain:active chain:owner"; echo "  수동: docker exec $REDIS_CONTAINER redis-cli SET chain:active '"$target"' ; docker exec $REDIS_CONTAINER redis-cli SET chain:owner '"$target"' EX 60"; fi' EXIT
chain_handover "$target"
HANDOVER_DONE=1

# 프론트도 같이 되돌린다. 배포는 백엔드 전환이 성공한 뒤 프론트를 새 태그로 올리므로, 백엔드만
# 되돌리면 **새 화면 + 옛 백엔드** 조합이 남아 새 화면이 부르는 엔드포인트가 404 가 된다
# (리뷰 !93 🔴). 되돌릴 색의 태그가 곧 그 빌드의 IMAGE_TAG 다 — .env 에 blue-green.sh 가 남긴다.
TAG_VAR=$( [ "$target" = blue ] && echo BLUE_TAG || echo GREEN_TAG )
# `|| true` 가 없으면 그 색의 태그가 없을 때 grep 이 1 → pipefail 로 파이프라인이 1 → 대입이 1 →
# **errexit 이 여기서 죽는다.** 처음엔 인계가 이 뒤에 있어 chain:active·chain:owner 가 깨진 색을
# 가리킨 채 남았다(리뷰 !170 🔴) — 인계는 위로 옮겼고, 지금 여기서 죽으면 잃는 것은 프론트
# 되돌리기뿐이다. 그래도 아래 -z 분기가 도달 가능해야 하므로 감싼다.
FRONT_TAG=$(grep -m1 "^${TAG_VAR}=" "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
if [ -z "$FRONT_TAG" ]; then
  echo "  ⚠ .env 에 ${TAG_VAR} 가 없어 프론트를 되돌리지 못했다 — 새 화면이 옛 백엔드를 부르는 상태다."
  echo "    수동: cd $DEPLOY_DIR && IMAGE_TAG=<되돌릴 sha> docker compose up -d frontend"
elif (cd "$DEPLOY_DIR" && IMAGE_TAG="$FRONT_TAG" docker compose up -d frontend); then
  echo "  프론트 되돌림: b204-frontend:$FRONT_TAG"
  # .env 의 IMAGE_TAG 도 되돌린다. 안 고치면 깨진 태그가 남아, 이후 누가 docker compose up -d
  # frontend 를 치는 순간 되돌린 프론트가 **조용히 다시 깨진 빌드로** 올라간다(리뷰 !170 🟡).
  if grep -q '^IMAGE_TAG=' "$DEPLOY_DIR/.env" 2>/dev/null; then
    sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$FRONT_TAG|" "$DEPLOY_DIR/.env" \
      && echo "  .env IMAGE_TAG = $FRONT_TAG" \
      || echo "  ⚠ .env 의 IMAGE_TAG 를 못 고쳤다 — 직접 $FRONT_TAG 로 바꾼다."
  fi
else
  echo "  ⚠ 프론트 되돌리기 실패 — 위 수동 명령으로 맞춘다."
fi

