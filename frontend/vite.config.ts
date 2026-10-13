/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tailwind v4는 PostCSS 설정 파일이 아니라 `@tailwindcss/vite` 플러그인으로 붙인다.
// 토큰은 src/styles.css의 `@theme` 블록이 정본이다(기술 스택 v3 §3.1). tailwind.config.js는 만들지 않는다.
/*
 * `--mode demo`는 **팀에게 보여줄 때만** 쓴다(`pnpm dev:demo`).
 *
 * 왜 필요한가 — WebGPU(`navigator.gpu`)는 **보안 컨텍스트에서만 존재한다.** https이거나 localhost다.
 * 같은 서버라도 `http://192.168.x.x:5173`으로 열면 브라우저가 `navigator.gpu`를 아예 노출하지 않아
 * 히어로 셰이더(StageFlare·HeroBackdrop)가 조용히 꺼진다. 코드 문제가 아니라 브라우저 규칙이라
 * 프론트에서 우회할 방법이 없다(2026-09-09에 LAN 주소로 확인: isSecureContext=false, 'gpu' in navigator=false).
 * 조명 자체는 CSS 기본층(fx-hero.css)이 늘 켜지므로 화면이 맨바닥이 되지는 않는다 — 셰이더만 빠진다.
 *
 * basic-ssl은 **자체 서명** 인증서를 만든다. 팀원 기기에서 처음 열면 경고가 뜨고
 * "고급 → 계속 진행"을 한 번 눌러야 한다. 그 뒤로는 보안 컨텍스트라 WebGPU가 켜진다.
 *
 * 기본 `pnpm dev`는 그대로 http다 — localhost는 이미 보안 컨텍스트라 인증서 경고를 볼 이유가 없다.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'demo' ? [basicSsl()] : [])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 백엔드는 호스트에서 `./gradlew bootRun`으로 8080에 뜬다(docker-compose.local.yml은 MySQL·Redis만).
      // VITE_API_BASE_URL=/api 한 값이 로컬·운영에서 그대로 통하게 하는 장치다 —
      // 운영에서는 호스트 Nginx가 같은 `/api` 경로를 백엔드로 넘긴다.
      // `VITE_PROXY_TARGET=https://j15b204.p.ssafy.io pnpm dev`로 배포 백엔드에 붙일 수 있다 —
      // 로컬 DB에 없는 데이터(종료된 공연·정산)를 **눈으로 확인할 때만** 쓴다.
      //
      // ⚠ 붙은 동안 이 화면의 쓰기는 전부 진짜다. 예매·집계 확정·정산 실행을 누르면 운영 DB와
      //   체인에 그대로 들어간다. 조회 확인용이고, 버튼을 누를 거면 로컬 백엔드로 돌아온다.
      //
      // ⚠ `frontend/.env`에 적으면 먹지 않는다. vite.config 는 node 프로세스라 `.env` 를 읽는
      //   것은 `loadEnv` 이고 `process.env` 에는 셸 변수만 들어온다. 명령 앞에 붙여 쓴다.
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
      },
      // 업로드 이미지. 운영에서는 호스트 Nginx가 `/uploads/`를 디스크에서 바로 서빙하므로
      // 앱과 같은 오리진이다. 로컬도 같은 모양으로 맞춘다 — 그래야 `POST /api/v1/files`가
      // 돌려준 url(`{APP_BASE_URL}/uploads/...`)을 화면이 그대로 써도 미리보기가 뜬다.
      // 로컬 백엔드는 local 프로파일에서만 `/uploads/**`를 직접 서빙한다(운영은 Nginx 몫).
      '/uploads': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    /**
     * 기본값 5초는 이 CI에서 좁다. Jenkins·앱·MySQL 이 한 EC2 에 같이 있고 MR 빌드와
     * develop 빌드가 동시에 도는 순간(실측 load average 9.3) 같은 테스트가 **10배 느려진다** —
     * `DesignRefreshPage` 의 스튜디오 흐름 테스트는 로컬 480ms 인데 MR-170 #2 에서 5052ms 로
     * 5000ms 를 넘겨 빌드를 떨어뜨렸다(같은 커밋의 #1 은 통과).
     *
     * 한 테스트에만 인자를 주지 않는 이유 — 같은 부하에서는 그다음 무거운 테스트가 같은 자리에
     * 선다. 부하가 원인이라 한도는 공용 설정에 둔다. 진짜로 멈춘 테스트는 15초 뒤에 여전히
     * 실패하므로 행 탐지를 잃지 않는다.
     */
    testTimeout: 15000,
    // `beforeEach` 안에서 렌더·픽스처를 준비하는 파일은 같은 부하를 `testTimeout` 이 막아 주지
    // 못한다. 원인이 부하라 두 값을 같이 둔다.
    hookTimeout: 15000,
  },
}))
