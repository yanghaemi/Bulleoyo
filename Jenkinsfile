// B204 파이프라인 — Multibranch Pipeline (GitLab Branch Source)
//
// 컨트롤러 컨테이너가 곧 실행 노드다. 빌드·배포는 마운트된 호스트 도커 소켓으로 한다.
// 레지스트리 없음 — 여기서 만든 이미지를 같은 도커 데몬의 compose가 그대로 쓴다.
// 시크릿은 Secret file `B204_ENV` + Secret text `ADMIN_PRIVATE_KEY`(배포 전용) 둘이 핵심이고,
// 알림·자동 리뷰용 Secret text(MATTERMOST_WEBHOOK · CLAUDE_CODE_OAUTH_TOKEN · GITLAB_REVIEW_TOKEN)는 없으면 건너뛴다.
// MATTERMOST_WEBHOOK 은 배포 시 서버 .env 의 ALERT_WEBHOOK_URL 로도 들어간다(백엔드 운영 알림, 없으면 빈 값).
// B204_ENV 내용은 서버 .env 형식 그대로다. 파이프라인은 이 파일을 읽어 필요한 키만 꺼내 쓰고,
// 배포 시 IMAGE_TAG·CONTRACT_*·ALERT_WEBHOOK_URL 네 줄을 덧붙여 서버 .env 를 만든다. Secret file은 Secret text와
// 달리 로그 마스킹이 없다 — 어떤 스크립트에서도 파일 내용을 cat·echo 하지 않는다.
// ADMIN_PRIVATE_KEY(두 컨트랙트의 배포자·pause·rotate 전용 콜드 키)는 Deploy contract
// · Rotate minter 스테이지에서만 바인딩되고 서버 .env 에는 들어가지 않는다.
//
// sh 스크립트는 전부 '''작은따옴표'''다. Groovy 보간(${})을 쓰면 시크릿이 스크립트 본문에
// 박혀 로그·마스킹을 우회한다. $VAR 는 셸이 푼다.
// 각 스크립트 첫 줄의 #!/bin/bash 는 Jenkins 기본 `sh -xe`(명령을 그대로 에코)를 막는다.
// .env 를 만드는 잡에서 xtrace가 켜져 있으면 비밀 값이 그대로 로그에 찍힌다.

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    parameters {
        booleanParam(
            name: 'DEPLOY_CONTRACT',
            defaultValue: false,
            description: '체크하면 Kairos에 컨트랙트를 배포한다(수동 전용).'
        )
        booleanParam(
            name: 'ROTATE_MINTER',
            defaultValue: false,
            description: '체크하면 YoYo.rotateMinter 를 ADMIN 콜드 키로 실행한다(수동 전용). 순서는 exec/README.md "MINTER 로테이션".'
        )
        string(
            name: 'NEW_MINTER_ADDRESS',
            defaultValue: '',
            description: 'ROTATE_MINTER 용 새 MINTER 공개 주소(0x + 40 hex). 개인키가 아니다 — 개인키를 잘못 넣었다면 그 키는 빌드 파라미터 기록에 남으므로 즉시 폐기하고 새 키를 만든다.'
        )
    }

    environment {
        // 이미지 태그 = 커밋 SHA 앞 8자리. GitLab CI의 $CI_COMMIT_SHORT_SHA와 같은 값이다.
        IMAGE_TAG  = sh(returnStdout: true, script: 'git rev-parse --short=8 HEAD').trim()
        DEPLOY_DIR = '/home/ubuntu/app'
    }

    stages {

        // 파라미터 조합 검사 — 스테이지 when 만으로는 "켜 놓고 조용히 건너뜀"이 된다.
        // DEPLOY_CONTRACT + ROTATE_MINTER 를 같이 켜면 새 컨트랙트를 배포하고 그 컨트랙트의
        // minter 를 바꾸게 되는데 운영 .env 는 옛 주소라 교체가 반영되지 않는다. 눌린 의도를
        // 추측하지 않고 끊는다 — 어느 쪽을 원했는지는 사람만 안다(MR !112 자동 리뷰).
        stage('Preflight') {
            when {
                anyOf {
                    expression { params.DEPLOY_CONTRACT && params.ROTATE_MINTER }
                    expression { params.ROTATE_MINTER && !(env.BRANCH_NAME in ['develop', 'master']) }
                    expression { params.ROTATE_MINTER && !((params.NEW_MINTER_ADDRESS ?: '') ==~ /0x[0-9a-fA-F]{40}/) }
                }
            }
            steps {
                script {
                    if (params.DEPLOY_CONTRACT && params.ROTATE_MINTER) {
                        error('DEPLOY_CONTRACT 와 ROTATE_MINTER 를 같이 켤 수 없다 — 컨트랙트를 새로 배포하면 그 주소가 운영 .env 와 달라 로테이션이 반영되지 않는다. 하나만 켜고 다시 실행한다(순서는 exec/README.md).')
                    }
                    // 주소 형식은 Rotate minter 의 input 승인 **전에** 본다. 승인 뒤 sh 에서만 보면 틀린 값으로
                    // 승인 화면까지 가고, 사람이 승인해야 비로소 끊긴다(MR !112 자동 리뷰). 값은 출력하지
                    // 않는다 — 개인키를 잘못 붙여 넣었으면 로그에 남는다. 셸 검사는 두 번째 겹으로 남긴다.
                    if (params.ROTATE_MINTER && !((params.NEW_MINTER_ADDRESS ?: '') ==~ /0x[0-9a-fA-F]{40}/)) {
                        error('NEW_MINTER_ADDRESS 가 0x + 40 hex 주소가 아니다(입력 길이 ' + (params.NEW_MINTER_ADDRESS ?: '').length() + '자). 개인키가 아니라 공개 주소를 넣는다.')
                    }
                    // 배포 브랜치 밖에서 ROTATE_MINTER 를 켜면 Rotate minter 는 브랜치 가드로 건너뛰는데
                    // Verify 는 파라미터만 보고 사라져, **아무것도 안 한 빌드가 초록**이 되고 알림에는
                    // "MINTER 로테이션 성공" 이 올라간다(MR !112 자동 리뷰). 조합 자체를 끊는다.
                    error('ROTATE_MINTER 는 develop·master 에서만 켤 수 있다 — 다른 브랜치에서는 교체가 건너뛰어지고 검증만 사라져 빈 빌드가 성공으로 끝난다. 현재 브랜치: ' + env.BRANCH_NAME)
                }
            }
        }

        // --------------------------------------------------------- changes
        // MR 빌드에서 안 바뀐 파트의 테스트를 건너뛸지 한 번 정한다 → env.RUN_CONTRACT·RUN_BACKEND·RUN_FRONTEND.
        // changeset 이 아니라 대상 브랜치 diff(origin/$CHANGE_TARGET...HEAD)라 브랜치 첫 빌드에도 정확하다.
        // (MR 잡은 대상 브랜치를 origin/<target> 으로 fetch 하고, MR head 에 대상을 merge 한 커밋을 HEAD 로 쓴다.)
        // MR 이 아닌 빌드(develop·master)는 배포 전 전체 검증이라 항상 셋 다 돈다.
        // fail-open: ref 없음·git 실패·빈 목록·출력 이상이면 셋 다 돈다.
        //
        // 판정 = 아래 셸 함수 b204_decide. 경로 목록을 stdin 으로 받아 RUN_*=true|false 세 줄을 낸다.
        // 파일 하나라도 그 파트에 영향을 주는 경로면, 또는 "영향 없음" 목록에 없는(모르는) 경로면 실행한다.
        //   contract : blockchain/ · backend/(check-selectors 가 ChainFailure.java) · docs/design/13_*(컨트랙트 인터페이스)
        //              · .env.example · docker-compose.yml(Audit.1 C-01 테스트가 읽는다)
        //   backend  : backend/ · blockchain/(build.gradle 이 deployments/abi) · docs/design/api/(openapi.yaml)
        //   frontend : frontend/ · backend/(chainTimeout.test 가 application.yml) · scripts/(dev-login.test)
        //   영향 없음: .claude/ · CLAUDE.md · README.md · .gitlab/ · exec/ · docker-compose.local.yml
        //              · docs/(docs/design/api/·docs/design/13_* 제외 — 화면·ERD·mockup 문서는 어느 테스트도 안 읽는다)
        // Jenkinsfile 은 영향 없음 목록에 없다 → 바뀌면 전부 돈다(Audit.1 도 읽는다).
        // 파트 밖 경로를 읽는 곳(2026-09-17 전수 검색):
        //   blockchain/test/Audit.1.test.ts:354-356(.env.example·Jenkinsfile·docker-compose.yml) · Audit.1/2(docs/design/13_*)
        //   · blockchain/scripts/check-selectors.mjs:35-36(backend ChainFailure.java·docs/design/13_*, Selectors.test 가 부른다)
        //   · backend/build.gradle:129·148, ApiSpec202BodyTest(blockchain/deployments/abi·docs/design/api/openapi.yaml)
        //   · frontend/src/shared/queries/chainTimeout.test.ts:21(backend application.yml) · frontend/src/scripts/dev-login.test.ts:5(scripts/).
        // 새 테스트가 저장소의 다른 경로를 읽게 되면 위 목록과 case 문을 같이 고친다.
        // 로컬 점검: b204_decide 함수만 떼어 `printf 'backend/A.java\n' | b204_decide`.
        stage('Changes') {
            steps {
                script {
                    // 셸이 예상 밖으로 0 이 아니어도 빌드를 여기서 끝내지 않는다 — 판정 실패는 전체 테스트, Review 도 그대로 돈다.
                    def out = ''
                    try {
                    out = sh(returnStdout: true, script: '''#!/bin/bash
set -e
b204_decide() {
  local c=false b=false f=false n=0 path
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    n=$((n + 1))
    case "$path" in
      docs/design/api/*)                b=true ;;
      docs/design/13_*)                 c=true ;;
      blockchain/*)                     c=true; b=true ;;
      backend/*)                        c=true; b=true; f=true ;;
      frontend/*|scripts/*)             f=true ;;
      .env.example|docker-compose.yml)  c=true ;;
      .claude/*|CLAUDE.md|README.md|.gitlab/*|exec/*|docker-compose.local.yml|docs/*) ;;
      *)                                c=true; b=true; f=true ;;
    esac
  done
  if [ "$n" -eq 0 ]; then c=true; b=true; f=true; fi
  echo "RUN_CONTRACT=$c"
  echo "RUN_BACKEND=$b"
  echo "RUN_FRONTEND=$f"
}
# 근거는 stderr(콘솔 로그)로, stdout 은 RUN_* 세 줄만 낸다 — Groovy 가 stdout 만 읽는다.
all() { echo "$1 — 전체 테스트" >&2; printf '' | b204_decide; exit 0; }
[ -n "${CHANGE_ID:-}" ] || all "MR 빌드 아님($BRANCH_NAME)"
git rev-parse -q --verify "origin/$CHANGE_TARGET^{commit}" >/dev/null || all "origin/$CHANGE_TARGET ref 없음(fail-open)"
# quotePath=false: 한글 경로가 "docs/\354..." 처럼 따옴표·8진수로 나와 case 에 안 걸리는 것을 막는다.
# --no-renames: 이동은 새 경로만 찍혀 옛 파트(예: frontend → backend 이동의 frontend)가 빠진다 — 옛 경로도 남긴다.
FILES=$(git -c core.quotePath=false diff --no-renames --name-only "origin/$CHANGE_TARGET...HEAD") || all "git diff 실패(fail-open)"
[ -n "$FILES" ] || all "변경 파일 0개(fail-open)"
echo "변경 파일 $(printf '%s\n' "$FILES" | wc -l)개 (origin/$CHANGE_TARGET...HEAD):" >&2
printf '%s\n' "$FILES" | sed 's/^/  /' >&2
printf '%s\n' "$FILES" | b204_decide
''')
                    } catch (e) {
                        // UNSTABLE 로 남긴다 — echo 만 하면 판정이 영구히 깨져 늘 fail-open 이어도 빌드가 초록이라 아무도 모른다.
                        unstable(message: "변경 판정 실패 — 전체 테스트로 진행한다: ${e.message}")
                    }
                    def run = [:]
                    out.trim().split('\n').each { line ->
                        def kv = line.trim().split('=', 2)
                        if (kv.length == 2) { run[kv[0]] = kv[1] }
                    }
                    // 출력이 깨져 값이 없으면 fail-open — 'false' 로 명시된 파트만 건너뛴다.
                    env.RUN_CONTRACT = run['RUN_CONTRACT'] == 'false' ? 'false' : 'true'
                    env.RUN_BACKEND  = run['RUN_BACKEND']  == 'false' ? 'false' : 'true'
                    env.RUN_FRONTEND = run['RUN_FRONTEND'] == 'false' ? 'false' : 'true'
                    echo "테스트 판정: contract=${env.RUN_CONTRACT} backend=${env.RUN_BACKEND} frontend=${env.RUN_FRONTEND}" +
                         " (false = 변경 파일이 전부 그 파트 영향 경로 밖이고 '영향 없음' 목록 안이라 건너뜀)"
                }
            }
        }

        // -------------------------------------------------- review ∥ test
        // Review 와 Test 를 한 parallel 로 돈다. 리뷰(중앙 4.9분)가 테스트 앞에서 순차로 막던 시간을 없앤다.
        // failFast 없음 — 테스트가 깨져도 리뷰는 끝까지 남긴다.
        // 메모리: 리뷰는 Claude CLI(node) 프로세스 하나라 테스트 JVM·Hardhat(힙 3g)에 비해 작다고 보고
        // 컨테이너 4g 안에 같이 둔다. 테스트 세 파트끼리는 아래 Test 주석대로 여전히 순차다.
        // 운영 메모: 머지 후 Jenkins 컨테이너 cgroup memory.events 의 oom_kill 카운터(현재 3)가 늘었는지 확인한다.

        // 로테이션 빌드는 검증도 건너뛴다. 워커를 끈 뒤(README 1단계) 승인 화면이 뜰 때까지
        // contract(Hardhat) → backend(Testcontainers) → frontend 전체가 돌면 그 시간만큼 결제·보증금
        // 확정과 정산 job 이 더 멈춘다 — 교체는 저장소 코드를 바꾸지 않으므로 검증할 것도 없다
        // (MR !112 자동 리뷰).
        stage('Verify') {
            when { expression { !params.ROTATE_MINTER } }
            parallel {

                // ---------------------------------------------------- review
                // MR 빌드에만 돈다(changeRequest). Claude Code 를 헤드리스로 돌려 MR 노트 하나를 만들고,
                // 같은 MR 에 다시 푸시되면 그 노트를 갱신한다 — exec/review/mr-review.sh.
                // 저장소는 읽기 도구로만 본다. 실패·크리덴셜 부재는 빌드 결과에 영향 없다(UNSTABLE 표시만).
                // 크리덴셜: Secret text `CLAUDE_CODE_OAUTH_TOKEN`(claude setup-token) · `GITLAB_REVIEW_TOKEN`(프로젝트 액세스 토큰, api).
                // Test 와 병렬이다 — 테스트가 깨진 MR 도 리뷰는 받고, 테스트 완료를 기다리지 않고 리뷰가 달린다.
                stage('Review') {
                    when { changeRequest() }
                    steps {
                        script {
                            try {
                                withCredentials([string(credentialsId: 'CLAUDE_CODE_OAUTH_TOKEN', variable: 'CLAUDE_CODE_OAUTH_TOKEN'),
                                                 string(credentialsId: 'GITLAB_REVIEW_TOKEN', variable: 'GITLAB_REVIEW_TOKEN')]) {
                                    catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                                        sh '''#!/bin/bash
set -e
export REVIEW_MODEL=opus
# Test 와 같은 4g cgroup 에서 동시에 돈다. contract 의 Hardhat 힙(3072m)과 합산돼 OOM 이 나면 리뷰가 아니라
# 테스트 스테이지가 죽으므로 리뷰 node 힙에 상한을 둔다. npm 캐시도 contract 의 npm ci 와 경합하지 않게 따로 쓴다.
export NODE_OPTIONS=--max-old-space-size=512
export npm_config_cache="$HOME/.npm-review"
bash exec/review/mr-review.sh
'''
                                    }
                                }
                            } catch (e) {
                                echo "리뷰 크리덴셜 없음 — 자동 리뷰 건너뜀 (${e.message})"
                            }
                        }
                    }
                }

                // ------------------------------------------------------ test
                // 프로젝트가 존재하고 Changes 판정이 true 면 테스트한다. 판정은 changeset 이 아니라 대상 브랜치
                // diff 라 브랜치 첫 빌드에도 정확하다. MR 이 아닌 빌드(develop·master)는 항상 전부 돈다.
                // backend·contract는 JUnit XML을 수집한다(allowEmptyResults — 리포터가 아직 없어도 통과).
                // 이게 있어야 GitLab MR 위젯과 Jenkins 빌드 화면에 실패한 테스트 이름이 보인다.
                //
                // **순차 실행이다(parallel 아님).** 컨테이너 mem_limit 4g 를 세 파트가 나눠 쓴다.
                // parallel 로 돌리면 Hardhat(힙 3g) + Gradle 테스트 JVM + Testcontainers 헬퍼가 합산돼
                // develop #28(2026-09-08)처럼 cgroup OOM(exit 137, "Killed")으로 죽는다. 순차면 한 시점에
                // 한 파트만 4g 를 쓴다. 빌드는 3~4분 늘지만 메모리 상한이 확정된다.
                // 순서: contract(가장 무겁고 빠르게 실패) → backend → frontend.

                stage('Test') {
                    stages {

                        stage('contract') {
                            when {
                                allOf {
                                    environment name: 'RUN_CONTRACT', value: 'true'
                                    expression {
                                        fileExists('blockchain/hardhat.config.ts') ||
                                        fileExists('blockchain/hardhat.config.js')
                                    }
                                }
                            }
                            steps {
                                sh '''#!/bin/bash
set -e
cd blockchain
if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else npm ci; fi
# mocha-junit-reporter가 읽는 표준 변수. hardhat.config가 이 값이 있을 때만 JUnit 리포터를
# 켜므로 로컬은 spec 그대로다. node:test 러너를 쓰면 그냥 무시된다(런북 v2 §2-1).
mkdir -p test-results
export MOCHA_FILE=test-results/junit.xml
# 컨테이너 mem_limit(4g) 안에서 힙을 잡는다. 없으면 Node 가 호스트 메모리 기준으로 힙을 키워
# cgroup OOM kill(exit 137, 스택 없이 "Killed")로 죽는다 — 2026-09-08 #9.
export NODE_OPTIONS=--max-old-space-size=3072
npx hardhat test
'''
                            }
                            post {
                                always {
                                    junit allowEmptyResults: true,
                                          testResults: 'blockchain/test-results/**/*.xml'
                                }
                            }
                        }

                        stage('backend') {
                            when {
                                allOf {
                                    environment name: 'RUN_BACKEND', value: 'true'
                                    expression { fileExists('backend/gradlew') }
                                }
                            }
                            steps {
                                sh '''#!/bin/bash
set -e
cd backend
# Jenkins JVM은 21이다. 툴체인이 없으면 테스트가 21로 돌아 스택 정책(Java 17)과 어긋난다.
grep -q 'languageVersion.*17' build.gradle* || { echo 'build.gradle에 java.toolchain.languageVersion=17 이 없다'; exit 1; }
grep -q 'foojay-resolver' settings.gradle* || { echo 'settings.gradle에 foojay-resolver 플러그인이 없다(툴체인 자동 다운로드용)'; exit 1; }
chmod +x ./gradlew
# 테스트 JVM 힙 상한(컨테이너 4g 안). Testcontainers 컨테이너는 호스트 도커라 이 한도 밖이다.
./gradlew test --no-daemon -Dorg.gradle.jvmargs=-Xmx1536m
'''
                            }
                            post {
                                always {
                                    junit allowEmptyResults: true,
                                          testResults: 'backend/build/test-results/test/TEST-*.xml'
                                }
                            }
                        }

                        stage('frontend') {
                            when {
                                allOf {
                                    environment name: 'RUN_FRONTEND', value: 'true'
                                    expression { fileExists('frontend/package.json') }
                                }
                            }
                            steps {
                                sh '''#!/bin/bash
set -e
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm test
'''
                            }
                        }
                    }
                }
            }
        }

        // ----------------------------------------------------------- build
        // 이미지 태그가 커밋 SHA다. 한쪽만 빌드하면 그 SHA로 다른 쪽 이미지가 없어
        // compose up이 깨진다. 그래서 변경 여부로 거르지 않고 항상 둘 다 만든다.
        // (레이어 캐시가 있어 안 바뀐 쪽은 금방 끝난다)

        // MINTER 로테이션 빌드는 교체만 한다 — 빌드·배포가 먼저 돌면 느리고, 그 사이 머지된 코드가 교체 직전에 나간다.
        stage('Build') {
            when { allOf { anyOf { branch 'develop'; branch 'master' }; expression { !params.ROTATE_MINTER } } }
            steps {
                withCredentials([file(credentialsId: 'B204_ENV', variable: 'ENV_FILE')]) {
                    sh '''#!/bin/bash
set -e

# 두 Dockerfile 은 BuildKit 전용이다(# syntax + RUN --mount=type=cache).
# legacy 빌더는 캐시를 태그 없는 중간 이미지로 들고 있어서 배포 스크립트의
# docker image prune -f 가 매 배포마다 통째로 지운다. BuildKit 캐시는 이미지가 아니라
# 빌더 캐시라 image prune 이 건드리지 못한다 — gradle 배포판·pnpm store 가 살아남는다.
export DOCKER_BUILDKIT=1
# buildx 가 없으면 BuildKit 빌드가 "buildx component is missing" 로 멈춘다. 그 메시지만으로는 무엇을
# 할지 모르니 여기서 먼저 확인하고 조치를 적는다(Jenkins 이미지 재빌드 또는 플러그인 복사).
if ! docker buildx version >/dev/null 2>&1; then
  echo "Jenkins 컨테이너에 docker buildx 가 없다 — 이미지 Dockerfile 이 BuildKit 전용(RUN --mount)이라 빌드할 수 없다."
  echo "  영구: exec/jenkins/Dockerfile(docker-buildx-plugin 포함)로 Jenkins 컨테이너를 다시 빌드한다(exec/README.md)."
  echo "  임시: 호스트에서 docker cp /usr/libexec/docker/cli-plugins/docker-buildx jenkins:/usr/libexec/docker/cli-plugins/"
  exit 1
fi

# B204_ENV(.env 형식)에서 필요한 키만 꺼낸다. `. "$ENV_FILE"` 로 통째로 source 하면
# DB_URL 의 &(앰퍼샌드)를 셸이 제어 연산자로 읽어 줄이 쪼개진다. 그래서 grep 로만 읽는다.
envget() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- ; }
WEB3AUTH_CLIENT_ID=$(envget WEB3AUTH_CLIENT_ID)
KAIA_RPC_URL=$(envget KAIA_RPC_URL)

if [ -z "$IMAGE_TAG" ]; then
  echo "IMAGE_TAG가 비었다 — 체크아웃이 제대로 안 됐다. 중단한다."
  exit 1
fi

# 컨트랙트 주소는 커밋된 배포 산출물에서 읽는다. 없으면 빈 값 + 경고.
TOKEN=""; SPLITTER=""
if [ -f blockchain/deployments/kairos.json ]; then
  TOKEN=$(jq -r '.contracts.YoYo.address // ""' blockchain/deployments/kairos.json)
  SPLITTER=$(jq -r '.contracts.RevenueSplitter.address // ""' blockchain/deployments/kairos.json)
  echo "컨트랙트 주소 로드: TOKEN(YoYo)=$TOKEN SPLITTER=$SPLITTER"
  # 파일은 있는데 키가 다르면(산출물 형식 변경 등) 빈 주소가 번들에 인라인된다 — 조용히 넘어가지 않게 경고.
  [ -n "$TOKEN" ] && [ -n "$SPLITTER" ] || echo "경고: kairos.json 에 contracts.YoYo/RevenueSplitter 주소가 비어 있다 — 빈 주소로 빌드한다."
else
  echo "경고: blockchain/deployments/kairos.json 없음 — 컨트랙트 주소를 빈 값으로 빌드한다."
fi

if [ -f backend/gradlew ]; then
  docker build -t "b204-backend:$IMAGE_TAG" backend
  docker image inspect "b204-backend:$IMAGE_TAG" --format 'built backend {{.Id}}'
else
  echo "backend/gradlew 없음 — 백엔드 빌드를 건너뛴다(초기화 전)."
fi

if [ -f frontend/package.json ]; then
  docker build \
    --build-arg VITE_API_BASE_URL="/api" \
    --build-arg VITE_WEB3AUTH_CLIENT_ID="$WEB3AUTH_CLIENT_ID" \
    --build-arg VITE_KAIA_RPC_URL="$KAIA_RPC_URL" \
    --build-arg VITE_KAIA_CHAIN_ID="1001" \
    --build-arg VITE_CONTRACT_YOYO_ADDRESS="$TOKEN" \
    --build-arg VITE_CONTRACT_SPLITTER_ADDRESS="$SPLITTER" \
    -t "b204-frontend:$IMAGE_TAG" frontend
  docker image inspect "b204-frontend:$IMAGE_TAG" --format 'built frontend {{.Id}}'
else
  echo "frontend/package.json 없음 — 프론트 빌드를 건너뛴다(초기화 전)."
fi

# BuildKit 캐시 정리는 여기서 하지 않는다 — 호스트 데몬의 기본 GC 정책이 맡는다(docker buildx inspect 의
# GC Policy: 캐시 마운트 48h·4GiB, 전체 Max Used 231GiB·Min Free 57GiB). 두던 until=168h·max-used-space 10gb
# 두 줄은 캐시 13GB 에서 0B 를 지웠다(develop #169, 호스트에서 12gb 로 다시 쳐도 0B) — 정책의 Reserved
# Space(28.87GiB) 아래로는 수동 prune 도 지우지 않는 것으로 보인다. 효과 없는 줄이 "10GB 상한" 을 약속하지 않게 뺀다.
'''
                }
            }
        }

        // ---------------------------------------------------------- deploy

        stage('Deploy dev') {
            when { allOf { branch 'develop'; expression { !params.ROTATE_MINTER } } }
            steps {
                withCredentials([file(credentialsId: 'B204_ENV', variable: 'ENV_FILE')]) {
                    // 사용자 정의 함수에 클로저를 넘기므로 script 블록 안에서 부른다(declarative steps 검증).
                    script { withAlertWebhook { sh deployScript() } }
                }
            }
        }

        stage('Deploy prod') {
            // beforeInput: when 을 input 보다 먼저 평가한다. 없으면 모든 브랜치 빌드가 승인을 묻는다.
            // ROTATE_MINTER 는 Build 를 건너뛰므로(:174) 이 스테이지가 남아 있으면 교체 직전에
            // 같은 SHA 의 옛 이미지로 prod 를 재기동한다 — Deploy dev(:231)와 같은 조건을 건다.
            when { beforeInput true; allOf { branch 'master'; expression { !params.ROTATE_MINTER } } }
            input {
                message '발표 환경 배포 승인'
                ok '배포'
            }
            steps {
                withCredentials([file(credentialsId: 'B204_ENV', variable: 'ENV_FILE')]) {
                    // 사용자 정의 함수에 클로저를 넘기므로 script 블록 안에서 부른다(declarative steps 검증).
                    script { withAlertWebhook { sh deployScript() } }
                }
            }
        }

        // Jenkins는 컨테이너 안이라 호스트 systemctl을 못 부른다. Nginx 반영은 사람 손이다.
        stage('Nginx 수동 반영 필요') {
            when {
                allOf {
                    anyOf { branch 'develop'; branch 'master' }
                    changeset 'exec/nginx/**'
                }
            }
            steps {
                echo '''exec/nginx 변경됨 — 서버에서 수동 반영이 필요하다(런북 v2 §4).
  ssh ubuntu@j15b204.p.ssafy.io
  cd ~/S15P21B204 && git pull
  cp exec/nginx/*.conf ~/app/nginx/

호스트 Nginx 설정을 바꿨다면:
  sudo nginx -t && sudo systemctl reload nginx

router.conf 를 바꿨다면 **호스트 reload 로는 반영되지 않는다**(bind mount 라 파일만 바뀌고,
안 하면 다음 컨테이너 재기동 때 예고 없이 적용된다):
  docker exec b204-router nginx -t && docker exec b204-router nginx -s reload'''
            }
        }

        // -------------------------------------------------------- contract

        stage('Deploy contract') {
            // 콜드 키가 바인딩되는 유일한 스테이지다. 브랜치로 잠그면 feat/bc/* 에서 배포를 못 하니
            // Deploy prod 와 같은 input 승인으로 막는다. beforeInput 은 Deploy prod 주석과 같은 이유.
            // ROTATE_MINTER 와 같이 켜면 이 스테이지가 **먼저** 돌아 새 컨트랙트를 배포하고
            // 워크스페이스 kairos.json 을 덮는다. 뒤이은 Rotate minter 는 그 새 컨트랙트의 minter 를
            // 바꾸는데 운영 .env 는 옛 주소 그대로라 교체가 아무 데도 반영되지 않는다 — 둘은
            // 상호 배타다(MR !112 자동 리뷰). 아래 Preflight 가 조합 자체를 먼저 끊는다.
            when { beforeInput true; allOf { expression { params.DEPLOY_CONTRACT }; expression { !params.ROTATE_MINTER } } }
            input {
                message '컨트랙트 배포 승인 — ADMIN 콜드 키로 이 브랜치의 scripts/deploy.ts 를 실행한다'
                ok '배포'
            }
            steps {
                withCredentials([file(credentialsId: 'B204_ENV', variable: 'ENV_FILE'),
                                 string(credentialsId: 'ADMIN_PRIVATE_KEY', variable: 'ADMIN_PRIVATE_KEY')]) {
                    sh '''#!/bin/bash
set -e

# 통째로 source 하지 않는 이유는 Build 스테이지 주석과 같다.
envget() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- ; }
export KAIA_RPC_URL=$(envget KAIA_RPC_URL)

# 배포자는 ADMIN(DEFAULT_ADMIN_ROLE) 콜드 키다. B204_ENV·서버 .env 에는 없고 Secret text 로만
# 들어온다(로그 마스킹됨). hardhat.config.ts 의 configVariable("ADMIN_PRIVATE_KEY")가 이걸 읽는다.
# OPERATOR 키로 배포하면 RevenueSplitter 생성자가 RoleConflict() 로 revert 한다.
export ADMIN_PRIVATE_KEY
if [ -z "$ADMIN_PRIVATE_KEY" ]; then
  echo "Jenkins Credentials에 ADMIN_PRIVATE_KEY(Secret text)가 없다"
  exit 1
fi

# 생성자 인자용 운영 지갑 주소. 공개값이라 저장소 .env.example 이 정본이다(B204_ENV 아님).
# 개인키는 이 셸에 끌어오지 않는다 — 아래 npm ci 가 그 브랜치 package.json 의 스크립트를 실행한다.
export OPERATOR_ADDRESS=$(grep -m1 '^OPERATOR_ADDRESS=' .env.example | cut -d= -f2-)
export MINTER_ADDRESS=$(grep -m1 '^MINTER_ADDRESS=' .env.example | cut -d= -f2-)
if [ -z "$OPERATOR_ADDRESS" ] || [ -z "$MINTER_ADDRESS" ]; then
  echo ".env.example 에 OPERATOR_ADDRESS·MINTER_ADDRESS 가 없다"
  exit 1
fi
echo "OPERATOR_ADDRESS=$OPERATOR_ADDRESS MINTER_ADDRESS=$MINTER_ADDRESS"

cd blockchain
if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else npm ci; fi
npx hardhat run scripts/deploy.ts --network kairos
jq '.' deployments/kairos.json
echo "deployments/kairos.json 은 아티팩트로만 남았다. 사람이 내려받아 커밋해야 다음 배포에 주소가 주입된다."
'''
                    // 소스 검증. 위 sh 가 실패하면 여기까지 오지 않으니 **실제로 배포된 빌드에서만** 돈다.
                    // verify 실패로 배포를 되돌리지는 않는다 — 컨트랙트는 이미 체인에 올라갔고 주소도 유효하다.
                    // 그래서 빌드는 UNSTABLE, 스테이지만 FAILURE 로 남긴다(배포 자체는 성공).
                    // catchError 는 정식 step 이라 script{} 가 필요 없다. 이 파일에서 script{} 로 감싼 건
                    // withAlertWebhook 같은 **사용자 정의 함수 + 클로저**뿐이다(Deploy dev 주석 참고).
                    catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
                        sh '''#!/bin/bash
set -e

# ⚠ develop 에도 verify:kairos 키는 있지만 그건 인자 없는 `hardhat verify` 라 주소를 하나도
# 검증하지 못한다. 진짜 검증기는 MR !114(fix/bc/deploy-verify)가 들여오는 scripts/verify.ts 다.
# 그게 없는데 catchError 가 UNSTABLE 로 삼키면 "검증을 안 했는데 안 한 줄 모르는" 상태가 된다.
# 파일 존재를 먼저 보고, 없으면 이유를 로그에 남기고 UNSTABLE 로 끝낸다.
cd blockchain
if [ ! -f scripts/verify.ts ]; then
  echo "blockchain/scripts/verify.ts 가 없다 — MR !114 미머지 브랜치다."
  echo "컨트랙트 소스 검증을 하지 않았다. 배포된 주소는 KaiaScan 에서 미검증 상태로 남는다."
  exit 1
fi

# 환경변수는 sh 스텝 사이에 남지 않는다 — 위 스크립트에서 export 한 값을 다시 만든다.
# node_modules 는 같은 워크스페이스라 위 install 결과를 그대로 쓴다.
envget() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- ; }
export KAIA_RPC_URL=$(envget KAIA_RPC_URL)
# verify 는 서명하지 않지만 networks.kairos.accounts 가 configVariable("ADMIN_PRIVATE_KEY") 라
# 값이 없으면 연결을 열지 못한다(scripts/verify.ts 주석).
export ADMIN_PRIVATE_KEY

npm run verify:kairos
'''
                    }
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'blockchain/deployments/kairos.json',
                                     allowEmptyArchive: true
                }
            }
        }

        // MINTER 키 교체. Deploy contract 와 같은 틀 — 콜드 키를 사람이 꺼내지 않게 여기서만 쓴다.
        // 실행 순서 전제(exec/README.md "MINTER 로테이션"):
        //   ① B204_ENV 에 CHAIN_WORKER_ENABLED=false 넣고 재배포 — 워커가 꺼져 있을 것
        //      (옛 키로 나간 MINT 가 FAILED 되면 retireIdempotencyKey 가 막아 복구가 안 된다)
        //   ② 새 주소에 KAIA 충전  ③ 이 스테이지
        //   ④ 즉시 B204_ENV MINTER_PRIVATE_KEY 교체 + CHAIN_WORKER_ENABLED 줄 삭제  ⑤ 재배포
        // ③~⑤ 사이 develop 머지 금지 — ChainRoleGuard 가 서버 MINTER 키 주소 ≠ 온체인 YoYo.minter() 면
        // 기동을 실패시킨다. develop 에서 돌리면 Deploy dev 가 이 스테이지보다 먼저 같은 이미지로 재배포한다
        // (그 시점은 옛 키·옛 온체인 minter 라 기동은 통과).
        stage('Rotate minter') {
            // 배포 브랜치에서만. 이 빌드는 Verify 를 건너뛰므로(위) 콜드 키 경로를 지키는
            // Audit.1-B 가드 테스트도 같이 안 돈다 — 검증되지 않은 브랜치의 rotate-minter.ts 를
            // ADMIN 키로 실행하지 않는다(MR !112 자동 리뷰).
            when {
                beforeInput true
                allOf {
                    anyOf { branch 'develop'; branch 'master' }
                    expression { params.ROTATE_MINTER }
                }
            }
            input {
                // 입력값을 여기 보간하지 않는다 — 형식은 Preflight 가 승인 전에 걸렀지만 승인 화면에
                // 값을 띄울 이유가 없다. 주소는 아래 스테이지 로그에서 형식 검사를 통과한 뒤에만 찍는다.
                // 선언형 파이프라인의 section 은 리터럴만 받는다 — 여러 줄 `+` 연결은
                // "Not a valid section definition" 으로 파이프라인 자체가 컴파일되지 않는다(MR-112 #8).
                message 'MINTER 로테이션 승인 — ADMIN 콜드 키로 YoYo.rotateMinter 를 실행한다. 파라미터 화면의 NEW_MINTER_ADDRESS 가 공개 주소(0x + 40 hex)인지, 워커가 꺼져 있고 새 주소에 KAIA 가 있는지 확인했나'
                ok '로테이션'
            }
            steps {
                withCredentials([file(credentialsId: 'B204_ENV', variable: 'ENV_FILE'),
                                 string(credentialsId: 'ADMIN_PRIVATE_KEY', variable: 'ADMIN_PRIVATE_KEY')]) {
                    sh '''#!/bin/bash
set -e

# 파라미터는 사람이 입력한 값이다. 주소 형식이 아니면 키를 쓰기 전에 끊는다.
# 틀린 값은 출력하지 않는다 — 개인키(0x + 64 hex)를 잘못 붙여 넣었으면 로그에 그대로 남는다.
if ! [[ "$NEW_MINTER_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "NEW_MINTER_ADDRESS 가 0x + 40 hex 주소가 아니다(입력 길이 ${#NEW_MINTER_ADDRESS}자). 개인키가 아니라 공개 주소를 넣는다."
  exit 1
fi

# 통째로 source 하지 않는 이유는 Build 스테이지 주석과 같다.
envget() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- ; }
export KAIA_RPC_URL=$(envget KAIA_RPC_URL)
if [ -z "$KAIA_RPC_URL" ]; then
  echo "B204_ENV 에 KAIA_RPC_URL 이 없다"
  exit 1
fi

# OPERATOR 와 같은 주소로 교체하면 컨트랙트는 통과시킨다 — YoYo.rotateMinter 는 zero·admin·
# 현 minter 만 거른다(YoYo.sol:138-143). 그런데 백엔드 ChainRoleGuard 는 minter == operator 를
# 기동 실패로 규정하므로(감사 L-10), 교체는 성공하고 그 다음 재배포부터 백엔드가 아예 뜨지
# 않는다 — 복구 수단은 콜드 키로 한 번 더 로테이션하는 것뿐이다. 여기서 끊는다.
# 주소는 공개값이라 저장소 .env.example 이 정본이다(Deploy contract 와 같은 출처).
OPERATOR_ADDRESS=$(grep -m1 '^OPERATOR_ADDRESS=' .env.example | cut -d= -f2-)
if [ -z "$OPERATOR_ADDRESS" ]; then
  echo ".env.example 에 OPERATOR_ADDRESS 가 없다 — operator 충돌을 검사할 수 없어 중단한다"
  exit 1
fi
# EIP-55 체크섬 대소문자가 섞여 오므로 소문자로 맞춰 비교한다.
lower() { printf '%s' "$1" | tr 'A-F' 'a-f'; }
if [ "$(lower "$NEW_MINTER_ADDRESS")" = "$(lower "$OPERATOR_ADDRESS")" ]; then
  echo "새 MINTER 주소가 OPERATOR 주소와 같다 — 교체하면 ChainRoleGuard 가 백엔드 기동을 막는다."
  echo "OPERATOR_ADDRESS=$OPERATOR_ADDRESS (공개값)"
  exit 1
fi

# 새 주소에 가스가 없으면 교체는 성공하고 **그 뒤 MINT 가 전부 죽는다** — 워커가 재시도 3회를
# 소진해 FAILED 로 닫는데, MINT 는 retireIdempotencyKey 가 금지라(grantRef 재료) 그 지급을
# 되살릴 수 없다. 충전은 README 2단계의 사람 몫이라 빠뜨리기 쉽다 — 여기서 확인한다
# (워커 off 는 두 겹으로 검사하면서 이쪽만 비어 있었다. MR !112 자동 리뷰).
# 이 블록에 백슬래시를 쓰지 않는다 — Groovy 가 삼중 홑따옴표 문자열 안의 이스케이프를 먼저 먹어
# 파이프라인이 컴파일되지 않는다(MR-112 #11: "unexpected char: backslash"). 따옴표는 셸
# 인용 전환으로, 값 추출은 grep + cut 으로 해결한다.
RPC_BODY='{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["'"$NEW_MINTER_ADDRESS"'","latest"]}'
BALANCE_HEX=$(curl -s --max-time 15 -X POST "$KAIA_RPC_URL" -H 'Content-Type: application/json' --data "$RPC_BODY" | grep -o '"result":"0x[0-9a-fA-F]*"' | cut -d'"' -f4)
if [ -z "$BALANCE_HEX" ]; then
  echo "새 MINTER 주소의 KAIA 잔액을 읽지 못했다(RPC 응답 없음/형식 불일치) — 확인 전에는 교체하지 않는다."
  exit 1
fi
# 0 만 거르면 1 peb 도 통과한다 — 최소치(0.01 KAIA = 1e16 peb = 0x2386f26fc10000)를 둔다.
# bash 산술($((...)))을 쓰지 않는다: 64비트 부호 있는 정수라 9.2 KAIA 를 넘으면 음수가 된다
# (실측 0x8AC7230489E80000 -> -8446744073709551616). 16진 문자열 그대로 비교한다 —
# 소문자로 맞추고 선행 0 을 떼면 길이가 긴 쪽이 크고, 길이가 같으면 C 로케일 사전순이 곧 수 비교다.
MIN_BALANCE_HEX=0x2386f26fc10000
hexnorm() { local h; h=$(lower "${1#0x}"); printf '%s' "${h#"${h%%[!0]*}"}"; }
hex_ge() {  # hex_ge A B : A >= B
  local LC_ALL=C a b
  a=$(hexnorm "$1"); b=$(hexnorm "$2")
  if [ "${#a}" -ne "${#b}" ]; then [ "${#a}" -gt "${#b}" ]; return; fi
  [[ ! "$a" < "$b" ]]
}
if ! hex_ge "$BALANCE_HEX" "$MIN_BALANCE_HEX"; then
  echo "새 MINTER 주소의 KAIA 가 최소치보다 적다(잔액 peb hex=$BALANCE_HEX, 최소 $MIN_BALANCE_HEX = 0.01 KAIA)"
  echo "  교체 뒤 MINT 가 전부 FAILED 되고 되살릴 수 없다. README 2단계(새 주소 충전)를 먼저 한다: $NEW_MINTER_ADDRESS"
  exit 1
fi
echo "새 MINTER 주소 KAIA 잔액 확인 OK (peb hex=$BALANCE_HEX >= $MIN_BALANCE_HEX)"

# 워커가 꺼져 있어야 한다(README 1단계). 켜진 채 교체하면 옛 키로 나간 MINT 가 FAILED 되고,
# MINT 는 retireIdempotencyKey 가 금지라 같은 멱등키가 그 FAILED job 을 그대로 돌려줘 지급을 되살릴 수 없다.
# 설정(B204_ENV)과 실제로 떠 있는 백엔드 둘 다 본다 — false 를 넣고 재배포를 안 했으면 워커는 아직 돈다.
if [ "$(envget CHAIN_WORKER_ENABLED)" != "false" ]; then
  echo "B204_ENV 에 CHAIN_WORKER_ENABLED=false 가 없다 — README 1단계(워커 끄고 재배포)부터 한다"
  exit 1
fi
# 블루/그린이면 컨테이너 이름이 색별이다(b204-backend-blue·-green). 이관 전 단일 이름도 남아
# 있을 수 있다 — 이름을 하나로 박으면 docker exec 가 실패해 값이 비고, 이 게이트가 **영구히
# 막는다**. 떠 있는 백엔드 전부를 보고, 하나도 못 찾으면 확인할 수 없는 것이라 멈춘다.
FOUND=0
for c in $(docker ps --format '{{.Names}}' | grep -E '^b204-backend(-blue|-green)?$' || true); do
  FOUND=1
  RUNNING=$(docker exec "$c" printenv CHAIN_WORKER_ENABLED 2>/dev/null || true)
  if [ "$RUNNING" != "false" ]; then
    echo "떠 있는 $c 의 CHAIN_WORKER_ENABLED 가 false 가 아니다(값: ${RUNNING:-없음}) — false 를 넣은 뒤 재배포했는지 확인한다"
    exit 1
  fi
done
if [ "$FOUND" = 0 ]; then
  echo "떠 있는 백엔드 컨테이너가 없다 — 워커가 꺼졌는지 확인할 수 없어 멈춘다(배포 상태를 먼저 본다)"
  exit 1
fi

# 교체 대상은 워크스페이스 kairos.json 의 YoYo 인데, 살아 있는 백엔드는 배포 시점 .env 의
# CONTRACT_YOYO_ADDRESS 를 쓴다. 둘이 다르면(재배포 전 kairos.json 커밋 등) 서비스가 쓰지 않는
# 컨트랙트의 minter 를 바꾸게 된다 — 먼저 비교해 끊는다(S15P21B204-165).
# 트래픽을 받는 색은 blue-green.sh 가 쓰는 상태 파일 $DEPLOY_DIR/active_color 가 정본이다
# (rollback.sh 와 같은 출처). 파일이 없으면 블루/그린 이관 전이라 단일 b204-backend 다.
# 쉬는 색은 롤백 재료로 남아 옛 주소를 들고 있을 수 있어 비교하지 않는다.
REPO_YOYO=$(jq -r '.contracts.YoYo.address // ""' blockchain/deployments/kairos.json)
if [ -f "$DEPLOY_DIR/active_color" ]; then
  ACTIVE_COLOR=$(cat "$DEPLOY_DIR/active_color")
  case "$ACTIVE_COLOR" in
    blue|green) ACTIVE_BACKEND="b204-backend-$ACTIVE_COLOR" ;;
    *) echo "active_color 값이 이상하다: $ACTIVE_COLOR — 활성 백엔드를 모르므로 멈춘다"; exit 1 ;;
  esac
else
  ACTIVE_BACKEND=b204-backend
fi
# printenv 는 그 변수 하나만 — .env 의 다른 값은 찍지 않는다.
LIVE_YOYO=$(docker exec "$ACTIVE_BACKEND" printenv CONTRACT_YOYO_ADDRESS 2>/dev/null || true)
echo "YoYo 주소 비교: 저장소 kairos.json=${REPO_YOYO:-없음} / 활성 백엔드 $ACTIVE_BACKEND=${LIVE_YOYO:-없음}"
if [ -z "$REPO_YOYO" ] || [ -z "$LIVE_YOYO" ] || [ "$(lower "$REPO_YOYO")" != "$(lower "$LIVE_YOYO")" ]; then
  echo "저장소 kairos.json 의 YoYo 와 활성 백엔드가 쓰는 YoYo 가 다르거나 읽지 못했다 — 서비스가 쓰지 않는 컨트랙트를 교체하게 되므로 멈춘다."
  echo "  kairos.json 이 맞다면 그 주소로 먼저 재배포하고, 백엔드가 맞다면 kairos.json 을 되돌린 뒤 다시 실행한다."
  exit 1
fi

# rotateMinter 는 onlyRole(DEFAULT_ADMIN_ROLE) — Deploy contract 와 같은 콜드 키다.
export ADMIN_PRIVATE_KEY
if [ -z "$ADMIN_PRIVATE_KEY" ]; then
  echo "Jenkins Credentials에 ADMIN_PRIVATE_KEY(Secret text)가 없다"
  exit 1
fi

if [ ! -f blockchain/scripts/rotate-minter.ts ]; then
  echo "rotate-minter.ts 없음 — 양해미 스크립트 머지 후 실행"
  echo "  그 스크립트는 온체인 RevenueSplitter.operator() 를 직접 읽어 새 주소와 비교해야 한다 —"
  echo "  위 검사는 저장소 .env.example 기준이라 rotateOperator 가 커밋 없이 돌았으면 통과한다."
  exit 1
fi

cd blockchain
if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else npm ci; fi
export NEW_MINTER_ADDRESS
echo "NEW_MINTER_ADDRESS=$NEW_MINTER_ADDRESS"
npx hardhat run scripts/rotate-minter.ts --network kairos
echo "다음: 즉시 B204_ENV 의 MINTER_PRIVATE_KEY 교체 + CHAIN_WORKER_ENABLED 줄 삭제 → 재배포. 그 전에 develop 머지 금지."
echo "그 뒤 kairos.json roles.minter · .env.example MINTER_ADDRESS 를 새 주소로 커밋한다. 그 커밋 전에는 Deploy contract 금지(.env.example 의 옛 minter 에 권한을 준다)."
'''
                }
            }
        }
    }

    post {
        // Mattermost 알림. 성공은 배포 브랜치(develop·master)와 컨트랙트 배포·MINTER 로테이션만, 실패는 모든 브랜치.
        success {
            script {
                if (env.BRANCH_NAME in ['develop', 'master'] || params.DEPLOY_CONTRACT || params.ROTATE_MINTER) {
                    notifyMattermost('✅ 성공')
                }
            }
        }
        failure {
            script { notifyMattermost('❌ 실패') }
            echo """빌드 실패.

배포 스테이지에서 깨졌다면 **전환은 일어나지 않았다** — 새 색이 healthy 가 되어야만
트래픽을 넘기므로 이전 색이 그대로 서비스 중이다. 서비스는 할 일이 없다.
다만 **실패한 색은 롤백 대상이 아니다** — 쉬는 자리가 깨진 이미지로 채워져 있어 다음 성공
배포까지 1초 롤백이 없다(rollback.sh 가 "healthy 가 아니다" 로 거절한다). 그 사이 문제가
나면 이미지 되감기(IMAGE_TAG=<이전 sha> 로 재배포)뿐이다.

전환까지 간 뒤 문제가 보이면 이전 색으로 되돌린다(트래픽 1초 + 체인 소유권 인계 30초, 컨테이너는 이미 떠 있다):
  ssh ubuntu@j15b204.p.ssafy.io
  cd ${env.DEPLOY_DIR} && cat active_color   # 지금 색
  cd ${env.DEPLOY_DIR} && deploy/rollback.sh
이번 태그: ${env.IMAGE_TAG}"""
        }
        // 빌드를 UNSTABLE 로 만드는 자리는 둘이다 — 변경 판정 실패(Changes 의 unstable)와
        // 컨트랙트 검증 실패(Deploy contract 의 catchError buildResult:'UNSTABLE').
        // 자동 리뷰 실패는 buildResult:'SUCCESS' 라 여기 오지 않는다.
        // success 가 UNSTABLE 에서 발화하지 않으므로 따로 알린다 — 판정이 영구 fail-open 으로
        // 깨져도 아무 신호가 없던 것이 S15P21B204-150 의 지적이었다. 원인은 스테이지 이름으로 가른다.
        unstable {
            script { notifyMattermost('⚠️ 불안정 — 변경 판정 또는 컨트랙트 검증 실패(스테이지 확인)') }
        }
        aborted {
            script { notifyMattermost('⏹ 중단(승인 거절 또는 취소)') }
        }
    }
}

// Mattermost incoming webhook. URL은 Secret text `MATTERMOST_WEBHOOK` — Jenkinsfile에 박지 않는다.
// 크리덴셜이 없으면 알림만 건너뛴다(빌드 결과에 영향 없음). 본문은 jq로 만들어 따옴표·개행을 안전하게 이스케이프.
def notifyMattermost(String status) {
    def commitMsg = sh(returnStdout: true, script: 'git log -1 --pretty=%s').trim()
    def what = params.DEPLOY_CONTRACT ? '컨트랙트 배포' :
               params.ROTATE_MINTER ? 'MINTER 로테이션' :
               (env.BRANCH_NAME == 'master' ? '발표 환경 배포' :
               (env.BRANCH_NAME == 'develop' ? 'dev 배포' : '빌드'))
    withEnv(["MM_STATUS=${status}", "MM_WHAT=${what}", "MM_COMMIT=${commitMsg}"]) {
        try {
            withCredentials([string(credentialsId: 'MATTERMOST_WEBHOOK', variable: 'MATTERMOST_WEBHOOK')]) {
                sh '''#!/bin/bash
set -e
jq -n --arg text "$MM_STATUS **$MM_WHAT** · [$BRANCH_NAME] #$BUILD_NUMBER · $IMAGE_TAG
> $MM_COMMIT
[빌드 로그]($BUILD_URL)" '{text: $text, username: "Jenkins"}' \
  | curl -sS --max-time 10 -X POST -H 'Content-Type: application/json' -d @- "$MATTERMOST_WEBHOOK" >/dev/null \
  || echo "Mattermost 알림 전송 실패(무시)"
'''
            }
        } catch (e) {
            echo "MATTERMOST_WEBHOOK 크리덴셜 없음 — 알림 건너뜀"
        }
    }
}

// 배포 스크립트에 MATTERMOST_WEBHOOK 을 ALERT_WEBHOOK_URL 로 바인딩한다. 크리덴셜이 없으면 빈 값으로 배포한다.
// notifyMattermost 처럼 try/catch 로 부재를 잡되, 바인딩이 된 뒤(body 안)에서 난 예외는 배포 실패·중단이므로
// 그대로 던진다 — 삼키면 실패한 배포가 성공으로 끝나거나 크리덴셜 없이 한 번 더 돈다.
def withAlertWebhook(Closure body) {
    def bound = false
    try {
        withCredentials([string(credentialsId: 'MATTERMOST_WEBHOOK', variable: 'ALERT_WEBHOOK_URL')]) {
            bound = true
            body()
        }
    } catch (e) {
        if (bound) { throw e }
        echo "알림 웹훅 없음 — 백엔드 알림은 로그만 (MATTERMOST_WEBHOOK 크리덴셜 없음)"
        body()
    }
}

// GitLab CI의 .deploy_script 앵커와 같은 내용. dev·prod가 같은 절차를 쓴다.
// 이미지가 없으면 exit 0 으로 조용히 성공 종료해야 해서 스텝을 쪼개지 않고 한 덩어리로 둔다
// (sh 를 나누면 exit 0 이 그 셸만 끝내고 다음 스텝이 계속 돈다).
def deployScript() {
    return '''#!/bin/bash
set -e

# 설계 정본 Swagger UI 정적 파일. 이미지 존재 확인(exit 0)보다 앞이라 백엔드·프론트가
# 아직 없어도 develop 머지마다 문서는 갱신된다. Nginx가 /docs/ 로 서빙한다(basic auth).
mkdir -p "$DEPLOY_DIR/docs"
cp docs/design/api/index.html docs/design/api/openapi.yaml "$DEPLOY_DIR/docs/"
echo "API 문서 갱신: $DEPLOY_DIR/docs (https://j15b204.p.ssafy.io/docs/)"

for img in b204-backend b204-frontend; do
  if ! docker image inspect "$img:$IMAGE_TAG" >/dev/null 2>&1; then
    echo "이미지 $img:$IMAGE_TAG 가 없다 — 해당 프로젝트가 아직 초기화되지 않았으면 정상이다. 배포를 건너뛴다."
    exit 0
  fi
done

TOKEN=""; SPLITTER=""
if [ -f blockchain/deployments/kairos.json ]; then
  TOKEN=$(jq -r '.contracts.YoYo.address // ""' blockchain/deployments/kairos.json)
  SPLITTER=$(jq -r '.contracts.RevenueSplitter.address // ""' blockchain/deployments/kairos.json)
  # 주소는 공개값 — Build 와 같은 형식으로 남겨 사후 추적(어느 주소로 .env 를 썼나)이 되게 한다.
  echo "컨트랙트 주소 로드: TOKEN(YoYo)=$TOKEN SPLITTER=$SPLITTER"
else
  echo "경고: blockchain/deployments/kairos.json 없음 — 컨트랙트 주소를 빈 값으로 배포한다."
fi
# 빈 주소면 백엔드는 체인 빈 없이 정상 기동하고 프론트 번들엔 빈 값이 인라인돼 결제·정산만 런타임에 죽는다.
# develop 은 경고 통과(컨트랙트 미배포 상태에서도 앱 배포는 되어야 한다), master(발표 환경)는 끊는다.
if [ -z "$TOKEN" ] || [ -z "$SPLITTER" ]; then
  if [ "$BRANCH_NAME" = "master" ]; then
    echo "컨트랙트 주소가 비었다 — 발표 환경 배포를 중단한다. kairos.json 의 contracts.YoYo/RevenueSplitter 를 확인하라."
    exit 1
  fi
  echo "경고: 컨트랙트 주소가 비어 있다 — 빈 주소로 배포한다(develop)."
fi

mkdir -p "$DEPLOY_DIR" "$DEPLOY_DIR/nginx" "$DEPLOY_DIR/deploy"
cp docker-compose.yml "$DEPLOY_DIR/docker-compose.yml"
# router 설정과 배포 스크립트. active_color.conf 는 "지금 어느 색이 트래픽을 받는가" 라는
# 상태라서 덮어쓰지 않는다 - 덮으면 배포가 돌던 색을 blue 로 되돌려 버린다.
cp exec/nginx/router.conf "$DEPLOY_DIR/nginx/router.conf"
# active_color.conf 는 "지금 어느 색이 받고 있나" 라는 **상태**다. 없을 때만 만든다.
# 템플릿이 exec/deploy/ 에 있는 이유는 그 파일 머리말에 있다(런북 글롭이 덮지 않게).
[ -f "$DEPLOY_DIR/nginx/active_color.conf" ] || cp exec/deploy/active_color.conf "$DEPLOY_DIR/nginx/active_color.conf"
cp exec/deploy/blue-green.sh exec/deploy/rollback.sh "$DEPLOY_DIR/deploy/"
chmod +x "$DEPLOY_DIR/deploy/"*.sh

# B204_ENV(Secret file) 최소 검증. 값은 보지 않고 키만 본다.
MISSING=""
for k in MYSQL_ROOT_PASSWORD JWT_SECRET; do
  grep -q "^$k=" "$ENV_FILE" || MISSING="$MISSING $k"
done
if [ -n "$MISSING" ]; then
  echo "B204_ENV 파일에 필수 키가 없다:$MISSING"
  exit 1
fi

# 없으면 기동은 되지만 기능이 조용히 빠지는 키는 경고만 남긴다. 값은 출력하지 않는다(Secret file은 마스킹이 없다).
grep -qE '^OPERATOR_ADDRESS=.+' "$ENV_FILE" \
  || echo "경고: B204_ENV에 OPERATOR_ADDRESS 값이 없다 — prepare 응답의 feePayer 필드가 빠진다(API v6 §0.4)."

# .env 생성 = B204_ENV 내용 + 파이프라인이 채우는 네 줄.
# 같은 키가 두 번 있으면 compose가 어느 쪽을 쓸지 보장이 없어, 파일 쪽 네 줄은 먼저 걸러낸다.
# ALERT_WEBHOOK_URL 은 B204_ENV 에 있어도 버리고 크리덴셜로 덮는다 — 배포 알림과 같은 채널이라는 보장을 한 곳(MATTERMOST_WEBHOOK)에 둔다.
# ADMIN_PRIVATE_KEY도 같이 걸러낸다 — 누가 B204_ENV에 실수로 넣어도 서버 .env·런타임에는 안 간다.
# 값은 절대 출력하지 않는다(이 스크립트에 xtrace가 없는 이유). Secret file은 마스킹도 안 된다.
# 색 태그(BLUE_TAG·GREEN_TAG)는 blue-green.sh 가 남긴다. .env 를 다시 만들 때 살려 두지 않으면
# 다음 배포에서 사라져, 롤백 직후엔 **트래픽을 받는 색의 태그가 .env 에 없다.** 그 상태에서 누가
# `docker compose --profile <색> up -d` 를 치면 돌던 색이 b204-backend:missing 으로 재생성돼
# 서비스가 죽는다 — blue-green.sh 주석이 막았다고 적은 바로 그 사고다(리뷰 !93 🔴).
COLOR_TAGS=$(grep -E '^(BLUE|GREEN)_TAG=' "$DEPLOY_DIR/.env" 2>/dev/null || true)
umask 077
{
  grep -v -E '^[[:space:]]*(export[[:space:]]+)?(IMAGE_TAG|CONTRACT_YOYO_ADDRESS|CONTRACT_SPLITTER_ADDRESS|ALERT_WEBHOOK_URL|ADMIN_PRIVATE_KEY|BLUE_TAG|GREEN_TAG)[[:space:]]*=' "$ENV_FILE"
  echo
  echo "IMAGE_TAG=$IMAGE_TAG"
  echo "CONTRACT_YOYO_ADDRESS=$TOKEN"
  echo "CONTRACT_SPLITTER_ADDRESS=$SPLITTER"
  echo "ALERT_WEBHOOK_URL=${ALERT_WEBHOOK_URL:-}"
  if [ -n "$COLOR_TAGS" ]; then echo "$COLOR_TAGS"; fi
} > "$DEPLOY_DIR/.env"
echo "~/app/.env 생성 완료 ($(wc -l < "$DEPLOY_DIR/.env")줄)"

cd "$DEPLOY_DIR"
# mysql·redis 는 blue-green.sh 가 자기 게이트(이미지·메모리)를 지난 뒤에 올린다 — 여기서 먼저 올리면
# Redis 가 재생성되는 배포에서 게이트에 거절돼도 세션·멱등키가 먼저 날아간다(리뷰 !170 🟡).
# --remove-orphans 는 어디서도 쓰지 않는다. 백엔드 두 색은 profile 뒤에 있어서, 프로필 없이 up 하면
# 쉬고 있는 색이 "고아" 로 지워질 수 있다 - 그러면 롤백할 대상이 사라진다.

# 백엔드는 블루/그린이다. 쉬는 색을 새 태그로 띄우고 healthy 를 본 뒤에만 전환한다 —
# healthy 가 아니면 전환하지 않으므로 깨진 빌드가 서비스를 내리지 않는다.
IMAGE_TAG="$IMAGE_TAG" DEPLOY_DIR="$DEPLOY_DIR" bash "$DEPLOY_DIR/deploy/blue-green.sh"

# 프론트는 **백엔드 전환이 성공한 뒤에** 바꾼다. 게이트 앞에서 바꾸면 백엔드가 healthy 를 못
# 넘겨 배포가 멈춘 뒤에도 프론트만 새 빌드로 남아, 새 화면이 옛 백엔드에 없는 엔드포인트를
# 불러 사용자에게 404 가 난다(리뷰 !93 🔴). 전환 뒤 롤백은 rollback.sh 가 프론트까지 되돌린다.
docker compose up -d frontend

docker compose ps

# dangling(태그 없는) 이미지만 지운다. 이전 태그는 롤백용으로 남긴다.
docker image prune -f
echo "롤백(트래픽 1초 + 소유권 인계 30초, 이전 색이 이미 떠 있다) - cd $DEPLOY_DIR && deploy/rollback.sh"
'''
}
