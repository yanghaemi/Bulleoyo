/**
 * 환경설정 단일 진입점.
 *
 * 컨트랙트 주소·chainId·RPC는 여기 한 곳에서만 읽는다(기술 스택 v3 §3.2).
 * `import.meta.env`를 features·pages에서 직접 읽지 않는다.
 *
 * VITE_*는 **빌드 시점에 번들로 인라인**된다. 런타임에 바꿀 수 없고, 값을 바꾸려면
 * 이미지를 다시 빌드해야 한다(frontend/Dockerfile의 ARG 6개).
 */

/** 빈 문자열·공백만 있는 값을 undefined 대신 ''로 정규화한다. */
function readEnv(value: string | undefined): string {
  return (value ?? '').trim()
}

const YOYO_ADDRESS = readEnv(import.meta.env.VITE_CONTRACT_YOYO_ADDRESS)
const SPLITTER_ADDRESS = readEnv(import.meta.env.VITE_CONTRACT_SPLITTER_ADDRESS)

/** 지갑 주소 = `0x` + 40 hex = 42자 (API v6 §0.1). */
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

function isAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value)
}

const chainIdRaw = Number.parseInt(readEnv(import.meta.env.VITE_KAIA_CHAIN_ID) || '1001', 10)
const chainId = Number.isFinite(chainIdRaw) ? chainIdRaw : 1001

export const config = {
  /**
   * `/api` 고정. 로컬은 vite `server.proxy`가, 운영은 호스트 Nginx가 같은 경로를 8080으로 넘긴다.
   * API v6의 base URL은 `/api/v1`이므로 클라이언트가 여기에 `/v1`을 덧붙인다.
   */
  apiBaseUrl: readEnv(import.meta.env.VITE_API_BASE_URL) || '/api',

  web3authClientId: readEnv(import.meta.env.VITE_WEB3AUTH_CLIENT_ID),

  chain: {
    /** Kaia Kairos 테스트넷. API v6 §0.7 노출 규칙과 같은 값이어야 한다. */
    network: 'kaia-kairos' as const,
    rpcUrl: readEnv(import.meta.env.VITE_KAIA_RPC_URL) || 'https://public-en-kairos.node.kaia.io',
    explorerUrl: 'https://kairos.kaiascan.io',
    /** 숫자 1001 — ethers provider·네트워크 전환 요청에 쓴다. */
    chainId,
    /**
     * hex `0x3e9` — API v6 §0.4 `signRequests[].chainId`가 hex 문자열로 내려오므로
     * 대조하려면 같은 표기가 필요하다. 프론트가 매번 변환하지 않게 둘 다 노출한다.
     */
    chainIdHex: `0x${chainId.toString(16)}`,
    yoyoAddress: YOYO_ADDRESS,
    splitterAddress: SPLITTER_ADDRESS,
  },
} as const

/**
 * 체인 기능 활성 플래그.
 *
 * 컨트랙트 주소는 `blockchain/deployments/kairos.json`이 커밋되고 CI가 주입하기 전까지 빈 문자열이다.
 * 빈 값이면 결제 서명·보증금·정산 실행 같은 체인 기능을 **비활성으로 표시**하고, 주소·해시를 노출하는
 * 화면(P-02·P-08·V-01·V-02·M-03·A-13·C-05)은 "체인 설정 대기" 안내를 띄운다.
 *
 * 주소 형식(42자)까지 확인한다 — 오타난 값이 들어가면 서명 대조가 조용히 실패하기 때문이다.
 */
export const isChainConfigured: boolean =
  isAddress(config.chain.yoyoAddress) && isAddress(config.chain.splitterAddress)

/** Web3Auth client id가 비면 소셜 로그인 버튼을 비활성으로 표시한다. */
export const isWalletAuthConfigured: boolean = config.web3authClientId.length > 0

export const isDev: boolean = import.meta.env.DEV

/** Executable fixtures and automatic state progression used only by `pnpm dev:demo`. */
export const isDemo: boolean = import.meta.env.MODE === 'demo'
