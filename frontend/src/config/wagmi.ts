import {http, createConfig} from 'wagmi'
import {injected} from 'wagmi/connectors'

import {botChain, botTestnet} from './chains'

/**
 * Injected-only by design. WalletConnect would add a hosted relay and a project id to
 * the critical path of the demo; an injected wallet (MetaMask with BOT Chain added)
 * completes the whole business flow with nothing external to fail.
 */
export const wagmiConfig = createConfig({
  chains: [botChain, botTestnet],
  connectors: [injected()],
  transports: {
    [botChain.id]: http(),
    [botTestnet.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
