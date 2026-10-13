/// <reference types="vite/client" />

/**
 * `.env.example`의 VITE_* 블록과 이름이 1:1로 대응한다. 이름을 바꾸면
 * backend·frontend·docker-compose.yml·Jenkinsfile 네 곳을 함께 고쳐야 한다.
 * 값 읽기는 shared/config 한 곳에서만 한다.
 *
 * **선택 속성인 이유** — 여기서 필수로 선언하면 Vite 내부의 `ModuleRunnerImportMeta`가
 * 전역 `ImportMetaEnv`를 더 이상 만족하지 못해 `tsc -b`가 TS2430으로 깨진다.
 * 실제로도 이 값들은 빌드 시점에 비어 있을 수 있다(컨트랙트 주소는 kairos.json 커밋 전까지 빈 문자열).
 * shared/config가 `readEnv()`로 빈 값을 정규화하고 `isChainConfigured`로 판정한다.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WEB3AUTH_CLIENT_ID?: string
  readonly VITE_KAIA_RPC_URL?: string
  readonly VITE_KAIA_CHAIN_ID?: string
  readonly VITE_CONTRACT_YOYO_ADDRESS?: string
  readonly VITE_CONTRACT_SPLITTER_ADDRESS?: string
}
