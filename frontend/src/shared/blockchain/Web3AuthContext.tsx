import { useMemo, type PropsWithChildren } from 'react'

import { config } from '@/shared/config'

import type { Web3AuthWalletAdapter as Web3AuthWalletAdapterContract } from './WalletAdapter'
import { WalletError } from './WalletAdapter'
import {
  createWeb3AuthWalletAdapter,
  type CreateWeb3AuthAdapterOptions,
} from './Web3AuthWalletAdapter'
import { Web3AuthContext } from './web3authContextState'

type AdapterFactory = (options: CreateWeb3AuthAdapterOptions) => Web3AuthWalletAdapterContract

interface Web3AuthProviderProps extends PropsWithChildren {
  clientId?: string
  createAdapter?: AdapterFactory
}

export function Web3AuthProvider({
  children,
  clientId = config.web3authClientId,
  createAdapter = createWeb3AuthWalletAdapter,
}: Web3AuthProviderProps) {
  // 여기서는 네트워크를 쓰지 않는 어댑터만 만든다. SDK 초기화는 connectSocial()/connect()/서명 호출이
  // 처음 필요해진 시점에 어댑터가 수행한다. 전역 Provider mount에서 초기화하면 로그인하지 않은
  // 방문자에게도 Kaia RPC provider가 생성되어 로그인 화면을 열어 둔 동안 요청이 계속 발생한다.
  const normalizedClientId = clientId.trim()
  const adapter = useMemo(
    () =>
      normalizedClientId
        ? createAdapter({
            clientId: normalizedClientId,
            rpcUrl: config.chain.rpcUrl,
            chainId: config.chain.chainId,
            chainIdHex: config.chain.chainIdHex,
            explorerUrl: config.chain.explorerUrl,
          })
        : null,
    [createAdapter, normalizedClientId],
  )
  const error = useMemo<WalletError | null>(
    () =>
      adapter ? null : new WalletError('NOT_CONFIGURED', 'Web3Auth client ID is not configured.'),
    [adapter],
  )

  /*
   * `ready`·`retryInitialization`은 걷어냈다. 지연 초기화로 바뀐 뒤 둘 다 client id 하나로
   * 결정되는 값이었다 — `ready === (adapter !== null) === (error === null)`이고
   * `retryInitialization`은 명시적 no-op이었다. SDK 초기화 실패는 로그인·지갑 동작 자체가
   * 표시하고, 같은 동작을 다시 실행하면 `Web3AuthWalletAdapter.initialize()`가 새로 시도한다.
   */
  const value = useMemo(() => ({ adapter, error }), [adapter, error])
  return <Web3AuthContext.Provider value={value}>{children}</Web3AuthContext.Provider>
}
