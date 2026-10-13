import { useContext } from 'react'

import { Web3AuthContext, type Web3AuthContextValue } from './web3authContextState'

export function useWeb3Auth(): Web3AuthContextValue {
  const value = useContext(Web3AuthContext)
  if (!value) {
    throw new Error('useWeb3Auth must be used inside Web3AuthProvider.')
  }
  return value
}
