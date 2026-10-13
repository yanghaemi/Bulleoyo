# frontend

React 모바일 웹 — 관객 예매·결제·QR 티켓, 공연자·검표 PC 화면, 공개 정산 검증 페이지. 화면 31개.

## 스택

React 19 · TypeScript(strict) · Vite 7 · React Router 7 · TanStack Query 5 · Tailwind CSS v4 · react-i18next(en 기본·ko) · ethers 6 + `@kaiachain/ethers-ext/v6` · Web3Auth Plug-and-Play Modal(`@web3auth/modal`) + Kaia Wallet.

구조는 `src/app`(providers·router·error) → `pages` → `features` → `shared`(api·blockchain·ui·i18n·config). 지갑 SDK는 화면에서 직접 호출하지 않고 `shared/blockchain/WalletAdapter`(connect · getAddress · signMessage · signTransaction · disconnect)를 거친다.

## 로컬 실행

```bash
cd frontend
corepack enable
pnpm install
pnpm dev            # http://localhost:5173
```

- **`package.json`에 `"packageManager": "pnpm@<버전>"` 필수** — CI(corepack)가 이 값으로 pnpm 버전을 결정한다.
- **`pnpm-lock.yaml` 커밋 필수** — Dockerfile이 lockfile 존재를 전제로 빌드한다.
- `vite.config.ts`에 `/api` → `http://localhost:8080` 프록시를 둔다. `VITE_API_BASE_URL=/api` 한 값이 로컬·운영에서 그대로 통한다(운영은 Nginx가 같은 경로를 백엔드로 넘긴다).
- 환경변수는 `frontend/.env.local`(gitignore 대상)에 `VITE_` 접두사로. 이름은 `.env.example`의 `VITE_*` 블록과 동일.
- Web3Auth 대시보드의 허용 도메인(Whitelist)에 `http://localhost:5173`이 등록돼 있어야 로컬 소셜 로그인이 된다.

## 참고

- 화면 정본: [`docs/design/07_화면설계_v6.md`](../docs/design/07_화면설계_v6.md)
- API 계약 정본: [`docs/design/06_API_명세서_v6.md`](../docs/design/06_API_명세서_v6.md)
- 로컬 개발 전체 안내: [`docs/planning/11_개발_환경_안내_v1.md`](../docs/planning/11_개발_환경_안내_v1.md)
