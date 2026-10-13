#!/usr/bin/env bash
#
# 리허설 2(S15P21B204-89) 호출 도우미 — 시드 준비 + 1층 예외 경로 진행.
#
# 담는 것: 서명이 필요 없는 호출(운영자 서명 tx 접수 · 관리자 판정 · 조회).
# 담지 않는 것: 사용자 지갑 서명이 필요한 단계(보증금 납부 · 티켓 구매 · 지갑 등록).
#   그 단계는 브라우저로 한다. 대본 _workspace/rehearsal2_runbook_2026-09-17.md 참조.
#
# ⚠️ 이 스크립트는 개인키를 다루지 않는다. 앞으로도 넣지 않는다.
#    2026-09-13 22:59 로컬 컨테이너가 운영 MINTER 키를 물려받아 운영 Kairos 에 10만을
#    발행한 사고가 있었다(docker-compose.local.yml 주석). 서명 키는 서버 워커에만 있다.
#
# 사용법
#   export BASE_URL=https://j15b204.p.ssafy.io
#   export TOKEN=<행위 주체의 accessToken>          # 호출마다 주체가 다르다. 대본의 "주체" 열을 본다
#   export ENTRY_TOKEN=<검표 링크 토큰>             # scan / entrystat 만 사용
#   ./rehearse.sh <subcommand> [args...]
#
#   ./rehearse.sh help                        # 서브커맨드 목록
#
# 실패하면 즉시 멈춘다(set -e + 2xx 아닌 응답은 exit 1). 다음 단계로 넘어가지 않는다.
# 202 를 성공으로 취급하지 않는다 — jobId 가 나오는 호출은 CONFIRMED 까지 폴링한다.
#
set -euo pipefail

# ---------------------------------------------------------------- 공통

die() { printf '\n[중단] %s\n' "$*" >&2; exit 1; }
note() { printf '  확인 → %s\n' "$*"; }

need_base() { [ -n "${BASE_URL:-}" ] || die "BASE_URL 이 없다. export BASE_URL=https://..."; }
need_token() { [ -n "${TOKEN:-}" ] || die "TOKEN 이 없다. 이 단계의 주체 accessToken 을 export 한다"; }
need_entry_token() { [ -n "${ENTRY_TOKEN:-}" ] || die "ENTRY_TOKEN 이 없다. entrylink 로 먼저 받는다"; }

# JSON 평문 필드 추출 — 첫 번째 "key":"value" / "key":number 하나.
# jq 를 쓰지 않는다: Git Bash 에 없고, 여기서 읽는 필드(code·jobId·status·txHash·
# refundAmount…)는 전부 평문이며 응답 레코드의 선언 순서가 그대로 직렬화돼
# 중첩 객체(verification.status 등)보다 항상 앞에 온다. 판단은 사람이 원문을 보고 한다 —
# 이 함수는 폴링 분기와 안내 문구에만 쓴다.
field() {
  printf '%s' "$1" \
    | grep -o "\"$2\"[[:space:]]*:[[:space:]]*\(\"[^\"]*\"\|-\?[0-9]\+\|true\|false\)" \
    | head -1 | sed 's/^[^:]*:[[:space:]]*//; s/^"//; s/"$//'
}

# req METHOD PATH [BODY] [EXTRA_HEADER...]
# 응답 본문 전체를 그대로 찍는다. HTTP 코드가 2xx 가 아니면 멈춘다.
# 결과 본문은 전역 RESP 에 남는다.
req() {
  local method="$1" path="$2" body="${3:-}"; shift 3 2>/dev/null || shift $#
  local -a args=(-sS -X "$method" "${BASE_URL%/}$path" -H 'Accept: application/json')
  [ -n "${TOKEN:-}" ] && args+=(-H "Authorization: Bearer $TOKEN")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data "$body")
  local h
  for h in "$@"; do args+=(-H "$h"); done

  printf '\n>>> %s %s\n' "$method" "$path"
  [ -n "$body" ] && printf '    body: %s\n' "$body"

  local raw status
  raw="$(curl "${args[@]}" -w $'\n%{http_code}')" || die "curl 실패: $method $path"
  status="${raw##*$'\n'}"
  RESP="${raw%$'\n'*}"
  printf '<<< HTTP %s\n%s\n' "$status" "$RESP"

  case "$status" in
    2*) ;;
    *) die "HTTP $status — code=$(field "$RESP" code) msg=$(field "$RESP" msg)" ;;
  esac
  local code; code="$(field "$RESP" code)"
  [ "$code" = "SUCCESS" ] || die "code=$code (성공은 SUCCESS 뿐이다) msg=$(field "$RESP" msg)"
}

# poll JOB_ID — CONFIRMED 까지 기다린다. FAILED 면 멈춘다.
# jobId 를 내는 호출(202)은 전부 이걸 거쳐야 끝난 것이다.
poll() {
  local job="$1" tries="${POLL_TRIES:-60}" gap="${POLL_INTERVAL:-3}" i st
  [ -n "$job" ] || die "폴링할 jobId 가 비었다 — 위 응답에서 jobId 를 찾지 못했다"
  printf '\n... chain job %s 폴링 (최대 %s회 × %ss)\n' "$job" "$tries" "$gap"
  for i in $(seq 1 "$tries"); do
    req GET "/api/v1/chain/jobs/$job"
    st="$(field "$RESP" status)"
    case "$st" in
      CONFIRMED)
        note "status=CONFIRMED · txHash=$(field "$RESP" txHash)"
        note "explorerUrl 을 열어 Kairos 에서 실제 tx 를 확인한다"
        return 0 ;;
      FAILED)
        die "job $job FAILED — failureReason=$(field "$RESP" failureReason) retryable=$(field "$RESP" retryable)" ;;
      PENDING|SUBMITTED)
        printf '    (%s/%s) status=%s — 대기\n' "$i" "$tries" "$st"; sleep "$gap" ;;
      *)
        die "알 수 없는 job status=$st" ;;
    esac
  done
  die "job $job 이 시간 안에 확정되지 않았다. 워커·RPC 를 확인한다(이강륜)"
}

# 응답에서 jobId 를 꺼내 폴링까지.
poll_resp() { poll "$(field "$RESP" jobId)"; }

require_arg() { [ -n "${1:-}" ] || die "인자가 부족하다: $2"; }

# ---------------------------------------------------------------- 서브커맨드

cmd_help() {
  cat <<'USAGE'
시드 확인 (TOKEN = 그 공연 생성자·참여팀 리더)
  ⚠️ 공개로 보이는 상태는 ON_SALE·SALE_CLOSED 뿐이다. ENDED(공연 B)·CANCELLED(취소 후 공연 A)는
     리더 토큰 없이는 404 다. A·B 의 리더가 다르면 show 로 나눠 부른다.
  seed <perfA> <perfB>              두 공연 상태 확인 — 번호는 A-0 에서 만든 실제 id 다
  show <performanceId>              공연 단건 조회

계정 확인 (TOKEN = 해당 계정)
  me                                memberId · 권한 · 지갑 주소 · 잔액
  tickets                           내 티켓 목록 — 검표용/환불용 티켓 id 를 여기서 고른다

관리자 (TOKEN = 관리자)
  grant <memberId> <amount> <idemKey>   코인 지급(API-coin-07) + 폴링
  disputes [performanceId]              이의 목록(API-admin-09)
  resolve <disputeId> <RESOLVED|REJECTED> <comment>   이의 처리(API-admin-06)

시나리오 6 — QR 검표
  entrylink <performanceId>         검표 링크 토큰 발급 (TOKEN = 생성자/참여팀)
  qr <ticketId>                     동적 QR 토큰 발급 (TOKEN = 티켓 소유자)
  scan <performanceId> <qrToken>    검표 (ENTRY_TOKEN 필요)
  entrystat <performanceId>         입장 현황 (ENTRY_TOKEN 필요)

시나리오 1 — 개별 환불 (TOKEN = 티켓 소유자)
  quote <ticketId>                  환불 미리보기
  refund <ticketId> <idemKey> [expectedRefundAmount]   취소·환불 + 폴링

시나리오 2 — 공연 취소 halt (TOKEN = 생성자 팀 리더. 관리자는 대신 못 한다)
  cancelshow <performanceId> <idemKey> <reason>        공연 취소 + halt job 폴링

시나리오 3 — 정산
  settlement <performanceId>        정산 상세 + actions.blockedReason (막힌 이유를 여기서 본다)
  aggregate <performanceId>         집계 확정 + 폴링 (TOKEN = 생성자 또는 관리자)
  lock <performanceId>              잠금 + 폴링 — ⚠️ SETTLEMENT_DISPUTE_PERIOD 주입·재배포 후에
  dispute <performanceId> <teamId> <reason>   이의 제기 (TOKEN = 참여팀 리더)
  release <performanceId>           정산 실행 + 폴링

기타
  job <jobId>                       임의 job 폴링
USAGE
}

# ⚠️ 토큰을 지우지 않는다. 공개로 보이는 상태는 ON_SALE·SALE_CLOSED 둘뿐이고
#    (PerformanceService:195 PUBLIC_STATUSES), ENDED·CANCELLED 는 그 공연의
#    생성자·참여팀 **리더**만 본다(:1447 isInsider — 관리자 우회 없음).
#    토큰 없이 부르면 공연 B 가 목표 상태 ENDED 가 되는 순간 404 로 죽는다.
cmd_seed() {
  need_base; need_token
  require_arg "${1:-}" "공연 A 의 performanceId (A-0 에서 만든 것)"
  require_arg "${2:-}" "공연 B 의 performanceId (A-0 에서 만든 것)"
  req GET "/api/v1/performances/$1"
  note "공연 A($1) status=$(field "$RESP" status) — ON_SALE 이어야 한다"
  note "saleCloseAt 가 미래여야 ON_SALE 이 유지된다(60초 주기 스윕이 지나면 SALE_CLOSED)"
  note "cancelDeadlineAt 가 미래여야 시나리오 1 개별 환불이 통과한다(D-3 00:00)"
  req GET "/api/v1/performances/$2"
  note "공연 B($2) status=$(field "$RESP" status) — ENDED 이어야 한다"
  note "ENDED 가 아니면 시나리오 3 집계가 PERFORMANCE_INVALID_STATUS 로 막힌다"
  note "여기서 404(PERFORMANCE_NOT_FOUND) 면 공연이 없는 게 아니라 TOKEN 주체가 그 공연의"
  note "리더가 아닌 것이다. A 와 B 의 리더가 다르면 show <A> · show <B> 를 각자 토큰으로 나눠 부른다"
}

# TOKEN 이 있으면 그대로 붙인다 — ENDED·CANCELLED 공연은 리더 토큰이 있어야 보인다.
cmd_show() { need_base; require_arg "${1:-}" "performanceId"; req GET "/api/v1/performances/$1"; }

cmd_me() {
  need_base; need_token
  req GET "/api/v1/members/me"
  note "memberId=$(field "$RESP" memberId) — grant 대상 지정에 쓴다"
  req GET "/api/v1/wallets/me"
  note "address=$(field "$RESP" address) balance=$(field "$RESP" balance)"
  note "지갑이 없으면 WALLET_NOT_FOUND — 코인 지급도 티켓 구매도 못 한다. 브라우저에서 먼저 연결"
}

cmd_tickets() {
  need_base; need_token
  req GET "/api/v1/tickets/me"
  note "ISSUED 티켓이 2매 이상인지 확인한다"
  note "한 매는 시나리오 6 검표용(USED 가 된다), 다른 한 매가 시나리오 1 환불용이다"
  note "섞으면 환불이 TICKET_ALREADY_USED(409) 로 막힌다 — 대본에 적어 둔 id 를 그대로 쓴다"
}

cmd_grant() {
  need_base; need_token
  require_arg "${1:-}" "memberId"; require_arg "${2:-}" "amount"; require_arg "${3:-}" "idemKey"
  req PUT "/api/v1/admin/coin/grants" "{\"memberId\":$1,\"amount\":$2,\"memo\":\"rehearsal2 seed\"}" \
      "Idempotency-Key: $3"
  note "grantRef=$(field "$RESP" grantRef) — 온체인 중복 발행 방지 키다. 재실행은 같은 idemKey 로"
  note "balanceBefore=$(field "$RESP" balanceBefore) expectedBalanceAfter=$(field "$RESP" expectedBalanceAfter)"
  poll_resp
  note "확정 뒤 ./rehearse.sh me 로 실제 잔액이 올랐는지 다시 본다"
}

cmd_disputes() {
  need_base; need_token
  local q=""; [ -n "${1:-}" ] && q="?performanceId=$1"
  req GET "/api/v1/admin/disputes$q"
  note "처리할 disputeId 와 status=OPEN 인지 확인한다"
}

cmd_resolve() {
  need_base; need_token
  require_arg "${1:-}" "disputeId"; require_arg "${2:-}" "RESOLVED|REJECTED"; require_arg "${3:-}" "comment(10자 이상)"
  req PATCH "/api/v1/admin/disputes/$1" "{\"status\":\"$2\",\"adminComment\":\"$3\"}"
  note "releaseHeld=$(field "$RESP" releaseHeld) — false 가 되어야 release 가 풀린다"
  note "true 면 같은 정산에 열린 이의가 더 있다. disputes 로 남은 건을 찾는다"
}

cmd_entrylink() {
  need_base; need_token; require_arg "${1:-}" "performanceId"
  req GET "/api/v1/performances/$1/entry-link"
  note "entryWindow 가 지금을 포함해야 검표가 통과한다. 아니면 ENTRY_NOT_IN_TIME_WINDOW(409)"
  note "출력된 token 을 export ENTRY_TOKEN=... 로 넣는다"
}

cmd_qr() {
  need_base; need_token; require_arg "${1:-}" "ticketId"
  req GET "/api/v1/tickets/$1/qr"
  note "qrToken 은 최대 60초 유효하다. 발급 즉시 scan 으로 넘긴다"
}

cmd_scan() {
  need_base; need_entry_token
  require_arg "${1:-}" "performanceId"; require_arg "${2:-}" "qrToken"
  local saved="${TOKEN:-}"; TOKEN=""   # 검표는 Bearer 가 아니라 X-Entry-Token 으로 인증한다
  req POST "/api/v1/entries/verify" "{\"performanceId\":$1,\"qrToken\":\"$2\"}" \
      "X-Entry-Token: $ENTRY_TOKEN"
  TOKEN="$saved"
  note "result 가 ADMITTED 여야 한다. 같은 QR 로 한 번 더 부르면 ENTRY_ALREADY_ENTERED(409)"
  note "이 티켓은 이제 USED 다. 환불하면 TICKET_ALREADY_USED(409) — 환불은 다른 티켓으로"
}

cmd_entrystat() {
  need_base; need_entry_token; require_arg "${1:-}" "performanceId"
  local saved="${TOKEN:-}"; TOKEN=""
  req GET "/api/v1/performances/$1/entries" "" "X-Entry-Token: $ENTRY_TOKEN"
  TOKEN="$saved"
  note "enteredCount 가 방금 스캔만큼 올랐는지 본다(S-03 반영)"
}

cmd_quote() {
  need_base; need_token; require_arg "${1:-}" "ticketId"
  req GET "/api/v1/tickets/$1/refund-quote"
  note "refundAmount=$(field "$RESP" refundAmount) — cancel 의 expectedRefundAmount 로 그대로 보낸다"
  note "feeStage=$(field "$RESP" feeStage) (D-7_BEFORE=수수료 0% · D-3_BEFORE=50%)"
}

cmd_refund() {
  need_base; need_token
  require_arg "${1:-}" "ticketId"; require_arg "${2:-}" "idemKey"
  local amount="${3:-}"
  if [ -z "$amount" ]; then
    req GET "/api/v1/tickets/$1/refund-quote"
    amount="$(field "$RESP" refundAmount)"
    [ -n "$amount" ] || die "미리보기에서 refundAmount 를 읽지 못했다. 세 번째 인자로 직접 넣는다"
  fi
  req POST "/api/v1/tickets/$1/cancel" \
      "{\"expectedRefundAmount\":$amount,\"reason\":\"리허설 2 개별 환불\"}" \
      "Idempotency-Key: $2"
  note "refundId=$(field "$RESP" refundId) refundAmount=$(field "$RESP" refundAmount)"
  poll_resp
  note "확정 뒤 tickets 로 그 티켓이 CANCELLED 인지, me 로 잔액이 돌아왔는지 본다"
}

cmd_cancelshow() {
  need_base; need_token
  require_arg "${1:-}" "performanceId"; require_arg "${2:-}" "idemKey"; require_arg "${3:-}" "reason"
  req POST "/api/v1/performances/$1/cancel" "{\"reason\":\"$3\"}" "Idempotency-Key: $2"
  note "jobId 는 halt job 이다. 주문별 refund job 은 그 뒤에 붙는다(응답에 없다)"
  note "targetTicketCount·totalRefundAmount 가 예상과 맞는지 본다"
  poll_resp
  note "halt 확정 후 refund N건이 순서대로 나간다. show 로 status=CANCELLED 를 확인하고"
  note "티켓 전건이 CANCELLED 가 될 때까지 관객 계정의 tickets 로 따라간다"
}

cmd_settlement() {
  need_base; need_token; require_arg "${1:-}" "performanceId"
  req GET "/api/v1/performances/$1/settlement"
  note "status 와 actions.*.blockedReason 이 이 화면의 핵심이다 — 막히면 여기 이유가 적혀 있다"
  note "counterMatch 가 true 가 아니면 lock·release 가 SETTLEMENT_AGGREGATE_MISMATCH 로 막힌다"
  note "disputeDeadlineAt 을 적어 둔다. release 는 그 시각 이후에만 통과한다"
}

cmd_aggregate() {
  need_base; need_token; require_arg "${1:-}" "performanceId"
  req POST "/api/v1/performances/$1/settlement/aggregate" ""
  note "공연이 ENDED 가 아니면 PERFORMANCE_INVALID_STATUS 다 — 시드를 다시 본다"
  poll_resp
  note "확정 후 settlement 로 status=AGGREGATED · counterMatch=true 를 확인한다"
}

cmd_lock() {
  need_base; need_token; require_arg "${1:-}" "performanceId"
  printf '\n⚠️ SETTLEMENT_DISPUTE_PERIOD 를 짧게 쓸 계획이면 주입·재배포가 끝난 뒤에 이 명령을 부른다.\n'
  printf '   이의제기 마감은 LOCK 이 온체인에서 확정되는 순간의 설정값으로 굳는다. 잠근 뒤 값을 바꿔도 소용없다.\n'
  req POST "/api/v1/performances/$1/settlement/lock" ""
  note "disputeClosesAt=$(field "$RESP" disputeClosesAt) — 48h 면 값이 안 들어간 것이다. 여기서 판단한다"
  poll_resp
  note "확정 후 settlement 로 disputeDeadlineAt 실제값을 다시 확인한다(확정 시각 기준으로 굳는다)"
}

cmd_dispute() {
  need_base; need_token
  require_arg "${1:-}" "performanceId"; require_arg "${2:-}" "teamId"; require_arg "${3:-}" "reason"
  req POST "/api/v1/performances/$1/settlement/disputes" \
      "{\"teamId\":$2,\"reason\":\"$3\"}"
  note "disputeId=$(field "$RESP" disputeId) releaseHeld=$(field "$RESP" releaseHeld)"
  note "이의제기 기간이 지났으면 COMMON_CONFLICT 다 — lock 직후 바로 부른다"
}

cmd_release() {
  need_base; need_token; require_arg "${1:-}" "performanceId"
  req POST "/api/v1/performances/$1/settlement/release" "{\"note\":\"리허설 2\"}"
  note "targetTeamCount·totalAmount 가 정산 상세의 분배 내역과 맞는지 본다"
  poll_resp
  note "SETTLEMENT_ALREADY_RELEASED 나 '정산 실행 작업이 진행 중입니다' 가 나오면 60초 주기"
  note "자동 release 스케줄러가 먼저 접수한 것이다. 실패가 아니다 — settlement 로 결과를 본다"
}

cmd_job() { need_base; need_token; require_arg "${1:-}" "jobId"; poll "$1"; }

# ---------------------------------------------------------------- 진입

sub="${1:-help}"; shift || true
case "$sub" in
  help|-h|--help) cmd_help ;;
  seed)        cmd_seed "$@" ;;
  show)        cmd_show "$@" ;;
  me)          cmd_me "$@" ;;
  tickets)     cmd_tickets "$@" ;;
  grant)       cmd_grant "$@" ;;
  disputes)    cmd_disputes "$@" ;;
  resolve)     cmd_resolve "$@" ;;
  entrylink)   cmd_entrylink "$@" ;;
  qr)          cmd_qr "$@" ;;
  scan)        cmd_scan "$@" ;;
  entrystat)   cmd_entrystat "$@" ;;
  quote)       cmd_quote "$@" ;;
  refund)      cmd_refund "$@" ;;
  cancelshow)  cmd_cancelshow "$@" ;;
  settlement)  cmd_settlement "$@" ;;
  aggregate)   cmd_aggregate "$@" ;;
  lock)        cmd_lock "$@" ;;
  dispute)     cmd_dispute "$@" ;;
  release)     cmd_release "$@" ;;
  job)         cmd_job "$@" ;;
  *) die "알 수 없는 서브커맨드: $sub (./rehearse.sh help)" ;;
esac
