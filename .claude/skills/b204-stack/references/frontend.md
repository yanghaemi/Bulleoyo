# frontend 함정

정본: 기술 스택 v2 §3 · 화면설계 v6 · API 응답 규격

## 의존성
- Node 22 · pnpm · `.nvmrc`. React 19 · TS strict · Vite 7 · React Router 7 · TanStack Query 5 · react-i18next · Tailwind v4(`@tailwindcss/vite`).
- 체인: `ethers@6` + `@kaiachain/ethers-ext`. **import는 반드시 `@kaiachain/ethers-ext/v6` 서브패스.** 루트로 import하면 ethers v5 API로 동작해 타입이 어긋난다.
- 지갑: `@web3auth/modal` v10(소셜 3종). Web3Auth의 외부 지갑 어댑터는 쓰지 않는다. Kaia Wallet은 주입 프로바이더 + 자체 챌린지.
- Web3Auth × React 19 충돌 시에만 React 18.3 폴백.

## 구조 (스택 v2 §3.2)
```
src/app(providers·router·error) → pages → features → shared(api·blockchain·ui·i18n·config)
```
- features 13개: member team wallet performance rule ticket payment coin refund entry settlement verify admin
- shared는 상위 import 금지. features끼리 import 금지. 조합은 pages.
- 지갑 SDK 호출은 `shared/blockchain/WalletAdapter`(connect·getAddress·signMessage·signTransaction·disconnect) 뒤에만.
- 컨트랙트 주소·chainId는 `shared/config` 한 곳.

## API 클라이언트
- 분기는 `code`만. `msg`는 토스트 표시용, 분기 금지.
- 401 `AUTH_TOKEN_EXPIRED` → refresh 후 재시도, `AUTH_TOKEN_INVALID` → 즉시 로그아웃. refresh는 `refreshPromise` 공유로 단일 실행.
- `chain_job` 폴링은 `PENDING`·`SUBMITTED`일 때만. 성공 후 관련 쿼리 invalidate.

## 스타일
- 토큰은 `@theme`(스택 v2 §3.1 블록 그대로). 역할 이름(`amber`, `crit`, `ink`)만 쓰고 팔레트 이름(`purple-500`) 금지.
- 브레이크포인트는 `md`(48rem) 하나.
- 프레스 `scale(.97)` 160ms, 호버는 `(hover:hover) and (pointer:fine)` 게이트, `prefers-reduced-motion` 존중.

## 보안
- `senderSignedRlp`·개인키·시드는 localStorage·로그·에러 리포트에 남기지 않는다.

## 로컬 개발
- `vite.config.ts`에 `server.proxy` `/api` → `http://localhost:8080`. `VITE_API_BASE_URL=/api`로 고정해 로컬·운영이 같은 값을 쓴다(운영은 Nginx가 같은 경로를 프록시).
- 환경변수는 `frontend/.env.local`(gitignore 대상)에 `VITE_*`로. 백엔드는 호스트에서 `bootRun`, 인프라만 `docker-compose.local.yml`.

## 디자인 토큰 이전 함정
- 목업(`docs/design/mockup/`)은 `--ink`·`--amber`·`--crit` 등 접두 없는 CSS 변수. Tailwind v4 `@theme`은 **`--color-*` 네임스페이스**여야 `text-ink`·`bg-amber` 유틸리티가 생긴다 → `--ink → --color-ink`로 리네임(스택 v3 §3.1 블록이 정본). 목업의 `support.js`는 저장소에 없고 이전 대상도 아니다.
- `packageManager` 필드 없으면 CI pnpm 버전 불확정(fe-dev 계약 참조).

## pnpm 12 빌드 스크립트 허용 (2026-09-08 실측)
- `packageManager: pnpm@12`는 의존성의 install/postinstall 을 기본 차단하고, 비대화형(CI·Docker)에서는 `ERR_PNPM_IGNORED_BUILDS`로 **install 자체가 실패**한다(esbuild·bufferutil·utf-8-validate·tiny-secp256k1).
- 해결은 `frontend/pnpm-workspace.yaml`의 `allowBuilds:` 맵(esbuild: true, 나머지 false). `package.json#pnpm.onlyBuiltDependencies`·`pnpm-workspace.yaml onlyBuiltDependencies`는 pnpm 12가 **읽지 않는다**(둘 다 실측 실패). Dockerfile `COPY`에 이 파일을 포함해야 한다.
- 새 네이티브 의존성이 들어와 다시 실패하면 그 이름을 `allowBuilds`에 추가(`pnpm approve-builds`가 같은 파일을 고친다).
