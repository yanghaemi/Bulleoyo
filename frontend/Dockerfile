# syntax=docker/dockerfile:1
# 멀티스테이지 — pnpm build → nginx:alpine 정적 서빙
# Vite 환경변수는 빌드 시점에 인라인된다. 런타임 주입이 불가능하므로 ARG로 받는다.
#
# BuildKit 전용이다(첫 줄 syntax + --mount). Jenkins Build 스테이지가 DOCKER_BUILDKIT=1 을 켠다.
# corepack이 받는 pnpm 바이너리는 /root/.cache/node/corepack,
# 패키지 tarball은 pnpm 기본 store(/root/.local/share/pnpm/store/vNN)에 남는다.
# pnpm 은 store 를 쓰므로 install 레이어가 무효화돼도 네트워크로 다시 받지 않는다.
# store 가 캐시 마운트(다른 파일시스템)라 하드링크 대신 복사로 떨어진다 — 대신 다운로드가 없다.
FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.cache/node/corepack \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_BASE_URL=/api
ARG VITE_WEB3AUTH_CLIENT_ID
ARG VITE_KAIA_RPC_URL=https://public-en-kairos.node.kaia.io
ARG VITE_KAIA_CHAIN_ID=1001
ARG VITE_CONTRACT_YOYO_ADDRESS
ARG VITE_CONTRACT_SPLITTER_ADDRESS
# pnpm 바이너리가 캐시 마운트에만 있으므로 이 RUN 도 corepack 캐시를 마운트해야 한다.
RUN --mount=type=cache,target=/root/.cache/node/corepack \
    pnpm build

FROM nginx:alpine
COPY --from=build /src/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
