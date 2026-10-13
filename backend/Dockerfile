# syntax=docker/dockerfile:1
# 멀티스테이지 — gradle wrapper로 bootJar 빌드 → JRE 런타임
# 테스트는 CI test 스테이지에서 따로 돈다(Testcontainers가 호스트 도커를 씀).
#
# BuildKit 전용이다(첫 줄 syntax + --mount). Jenkins Build 스테이지가 DOCKER_BUILDKIT=1 을 켠다.
# gradle 배포판(gradle-8.x-bin.zip)과 의존성 jar는 /root/.gradle 캐시 마운트에 남는다.
# 캐시 마운트는 이미지 레이어가 아니라 데몬의 BuildKit 캐시에 있어서
# 소스가 바뀌어 레이어가 무효화돼도 다시 받지 않는다.
FROM eclipse-temurin:17-jdk AS build
WORKDIR /src

# 빌드 스크립트만 먼저 — 소스만 고친 커밋에서는 이 레이어가 CACHED 로 넘어간다.
COPY gradlew ./
COPY gradle gradle
COPY build.gradle settings.gradle ./
RUN --mount=type=cache,target=/root/.gradle \
    chmod +x ./gradlew && ./gradlew dependencies --no-daemon

COPY src src
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew bootJar -x test --no-daemon

FROM eclipse-temurin:17-jre
# compose healthcheck(/actuator/health)용. temurin 이미지에 curl이 보장되지 않는다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 10001 -m app
ENV TZ=Asia/Seoul
WORKDIR /app
COPY --from=build /src/build/libs/*.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/app.jar"]
