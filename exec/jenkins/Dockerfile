# Jenkins 컨트롤러 — B204
#
# 빌드·배포는 호스트 도커 소켓(/var/run/docker.sock)으로 한다. 컨테이너 안에 도커 데몬을
# 넣지 않는다(DinD 없음). 그래서 필요한 건 docker CLI + compose·buildx 플러그인뿐이다.
# buildx 가 없으면 DOCKER_BUILDKIT=1 인 Build 스테이지가 "BuildKit is enabled but the buildx component
# is missing" 로 즉시 멈춘다 — 이미지 Dockerfile 이 RUN --mount(BuildKit 전용)를 쓴다(S15P21B204-179).
# 컨트롤러 JVM은 21(Jenkins가 17 지원 종료). 백엔드 테스트의 JDK 17은 Gradle 툴체인이
# 스스로 받아 쓰므로(backend/build.gradle) 여기 JDK 버전과 무관하다.
FROM jenkins/jenkins:lts-jdk21

USER root

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg jq git; \
    install -m 0755 -d /etc/apt/keyrings; \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc; \
    chmod a+r /etc/apt/keyrings/docker.asc; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list; \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; \
    apt-get update; \
    apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin docker-buildx-plugin nodejs; \
    corepack enable; \
    rm -rf /var/lib/apt/lists/*; \
    docker --version; docker compose version; docker buildx version; node --version; jq --version

USER jenkins
