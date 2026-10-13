import { createContext } from 'react'

import type { Web3AuthWalletAdapter } from './WalletAdapter'
import type { WalletError } from './WalletAdapter'

export interface Web3AuthContextValue {
  /** client id가 없으면 `null`이다. SDK와 RPC 연결은 첫 동작에서 어댑터가 초기화한다. */
  adapter: Web3AuthWalletAdapter | null
  /** `adapter`가 없는 이유. 지금은 client id 누락(`NOT_CONFIGURED`) 하나뿐이다. */
  error: WalletError | null
}

export const Web3AuthContext = createContext<Web3AuthContextValue | null>(null)
