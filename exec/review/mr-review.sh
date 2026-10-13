#!/bin/bash
# MR 자동 코드 리뷰 — Jenkins `Review` 스테이지(MR 빌드에만)에서 실행한다.
#
# 하는 일: GitLab API로 MR diff를 받아 Claude Code를 헤드리스(-p)로 돌리고, 결과를 MR 노트 하나로
# 남긴다. 같은 MR에 다시 푸시되면 새 노트를 달지 않고 첫 노트를 갱신한다(마커 문자열로 찾음).
# Claude는 저장소(현재 디렉토리)를 읽기 도구(Read·Grep·Glob)로만 본다 — 쓰기·셸 없음.
#
# 입력(환경변수):
#   CHANGE_ID               MR iid (GitLab Branch Source 가 MR 잡에 넣어 준다)
#   GITLAB_REVIEW_TOKEN     프로젝트 액세스 토큰(Developer, scope api) — 노트 작성자가 봇으로 찍힌다
#   CLAUDE_CODE_OAUTH_TOKEN `claude setup-token` 으로 만든 장기 토큰 (또는 ANTHROPIC_API_KEY)
#   REVIEW_MODEL            기본 opus
#   GITLAB_PROJECT          URL 인코딩된 프로젝트 경로. 기본 s15-fintech-finance-sub1%2FS15P21B204
#   DRY_RUN=1               diff 수집·프롬프트 조립까지만(Claude·노트 없음). 로컬 점검용
#   GITLAB_CURL_OPTS        로컬 WSL 처럼 lab.ssafy.com 체인을 못 검증하면 "-k". 서버는 비움
#
# 로컬 실행: CHANGE_ID=55 GITLAB_REVIEW_TOKEN=... bash exec/review/mr-review.sh  (토큰은 셸에 export)
set -euo pipefail

: "${CHANGE_ID:?CHANGE_ID(MR iid) 없음 — MR 빌드가 아니다}"
: "${GITLAB_REVIEW_TOKEN:?GITLAB_REVIEW_TOKEN 없음}"
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "CLAUDE_CODE_OAUTH_TOKEN/ANTHROPIC_API_KEY 없음"; exit 2
fi

API="https://lab.ssafy.com/api/v4/projects/${GITLAB_PROJECT:-s15-fintech-finance-sub1%2FS15P21B204}"
MR="$API/merge_requests/$CHANGE_ID"
MARK='<!-- b204-auto-review -->'
MAX_DIFF_BYTES=300000
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# 바이트 상한 안에서 마지막 온전한 줄까지만 남긴다(`sed '$d'` 가 잘린 마지막 줄을 버린다).
# 깨진 멀티바이트는 그 버려지는 줄 안에 있으므로 iconv 가 필요 없고, 문장·마크다운이
# 한가운데서 끊기지도 않는다. iconv 는 환경에 따라 없거나 -c 의 종료 코드가 흔들려
# `set -euo pipefail` 아래에서 스크립트를 통째로 죽일 수 있다(컨설턴트 지적, 2026-09-09).
cut_to_lines() {  # cut_to_lines <파일> <바이트상한>
  head -c "$2" "$1" | sed '$d'
}

# GITLAB_CURL_OPTS: 인증서 체인이 없는 로컬(WSL)에서만 -k. 서버(Jenkins)는 비워 둔다.
gl() { curl -sS --fail --max-time 30 ${GITLAB_CURL_OPTS:-} -H "PRIVATE-TOKEN: $GITLAB_REVIEW_TOKEN" "$@"; }

# 1) MR 메타 + diff. git fetch 가 필요 없도록 API 에서 받는다.
gl "$MR" > "$WORK/mr.json"
TITLE=$(jq -r '.title' "$WORK/mr.json")
SRC=$(jq -r '.source_branch' "$WORK/mr.json")
TGT=$(jq -r '.target_branch' "$WORK/mr.json")
DESC=$(jq -r '.description // ""' "$WORK/mr.json")

: > "$WORK/diff.txt"
page=1
while :; do
  gl "$MR/diffs?per_page=100&page=$page" > "$WORK/page.json"
  n=$(jq 'length' "$WORK/page.json")
  [ "$n" -eq 0 ] && break
  # 생성물·락파일·바이너리는 빼고 사람이 쓴 diff 만 넘긴다.
  jq -r '.[]
    | select((.new_path // .old_path // "") | test("(^|/)(pnpm-lock\\.yaml|package-lock\\.json|yarn\\.lock)$|/generated/|\\.(png|jpe?g|webp|gif|svg|ico|woff2?|pdf)$") | not)
    | "=== \(.new_path)\(if .new_file then " (new)" elif .deleted_file then " (deleted)" elif .renamed_file then " (from \(.old_path))" else "" end)\n\(.diff)"' \
    "$WORK/page.json" >> "$WORK/diff.txt"
  [ "$n" -lt 100 ] && break
  page=$((page + 1))
done

BYTES=$(wc -c < "$WORK/diff.txt")
if [ "$BYTES" -eq 0 ]; then echo "리뷰할 diff 없음(생성물·바이너리만 변경)"; exit 0; fi
TRUNC=""
if [ "$BYTES" -gt "$MAX_DIFF_BYTES" ]; then
  cut_to_lines "$WORK/diff.txt" "$MAX_DIFF_BYTES" > "$WORK/diff.cut" && mv "$WORK/diff.cut" "$WORK/diff.txt"
  TRUNC="(diff 가 ${BYTES}B 라 ${MAX_DIFF_BYTES}B 에서 잘랐다 — 뒷부분은 Read 로 직접 확인)"
fi

# 2) 프롬프트 = 고정 지침 + MR 메타 + diff
{
  cat "$HERE/prompt.md"
  printf '\n\n## 대상 MR !%s — %s\n브랜치: `%s` → `%s` %s\n\n### MR 설명(작성자)\n%s\n\n### diff\n````diff\n' \
    "$CHANGE_ID" "$TITLE" "$SRC" "$TGT" "$TRUNC" "$DESC"
  cat "$WORK/diff.txt"
  printf '\n````\n'
} > "$WORK/input.md"

if [ -n "${DRY_RUN:-}" ]; then
  echo "DRY_RUN: diff ${BYTES}B, 프롬프트 $(wc -c < "$WORK/input.md")B — Claude 호출·노트 작성 생략"
  head -40 "$WORK/input.md" | tail -8; exit 0
fi

# 3) Claude Code 헤드리스. npx 캐시(~/.npm/_npx)가 남아 두 번째부터는 다운로드가 없다.
#    ponytail: 매 빌드 npx 해석 비용(수 초). 느리면 exec/jenkins/Dockerfile 에 npm i -g 로 올린다.
MODEL="${REVIEW_MODEL:-opus}"
echo "리뷰 시작: MR !$CHANGE_ID ($BYTES B, model=$MODEL)"
set +e
# GitLab 토큰은 노트 게시(Claude 종료 후)에만 필요하다. Claude 프로세스엔 넘기지 않는다(프롬프트 인젠션으로 노출될 경로 차단).
env -u GITLAB_REVIEW_TOKEN npx -y @anthropic-ai/claude-code@latest -p \
  --model "$MODEL" \
  --allowedTools "Read,Grep,Glob" \
  --max-turns 40 \
  --output-format text \
  < "$WORK/input.md" > "$WORK/review.md" 2> "$WORK/claude.err"
rc=$?
set -e
if [ $rc -ne 0 ] || [ ! -s "$WORK/review.md" ]; then
  echo "Claude 실행 실패(rc=$rc)"; tail -20 "$WORK/claude.err"; exit 1
fi

# 4) 노트 upsert — 마커로 기존 노트를 찾아 PUT, 없으면 POST.
SHA=$(jq -r '.sha[0:8]' "$WORK/mr.json")
{
  echo "$MARK"
  echo "### 🤖 자동 리뷰 · \`$SHA\` · $MODEL"
  echo
  # 프롬프트가 4,000자를 넘겨도 노트가 무한정 길어지지 않게 자른다(경계는 UTF-8 정리).
  if [ "$(wc -c < "$WORK/review.md")" -gt 12000 ]; then
    cut_to_lines "$WORK/review.md" 12000
    printf '\n\n_(리뷰가 길어 잘렸다 — 남은 지적은 다음 푸시에서 다시 나온다.)_\n'
  else
    cat "$WORK/review.md"
  fi
  echo
  echo "<sub>Jenkins #${BUILD_NUMBER:-?} 자동 생성 — 판단은 리뷰어가 한다. 이 MR 에 푸시하면 이 노트가 갱신된다. 스크립트: \`exec/review/mr-review.sh\`</sub>"
} > "$WORK/body.md"
jq -n --rawfile b "$WORK/body.md" '{body: $b}' > "$WORK/note.json"

NOTE_ID=$(gl "$MR/notes?per_page=100&sort=desc&order_by=created_at" | jq -r --arg m "$MARK" '[.[] | select(.body | startswith($m))] | first | .id // empty')
if [ -n "$NOTE_ID" ]; then
  gl -X PUT -H 'Content-Type: application/json' "$MR/notes/$NOTE_ID" --data @"$WORK/note.json" > /dev/null
  echo "리뷰 노트 갱신: note $NOTE_ID"
else
  NOTE_ID=$(gl -X POST -H 'Content-Type: application/json' "$MR/notes" --data @"$WORK/note.json" | jq -r '.id')
  echo "리뷰 노트 생성: note $NOTE_ID"
fi
