/** Public chain facts. No credentials and no signing keys. */

export const CHAIN_ARBITRUM_ONE = 42161;
export const CHAIN_ARBITRUM_SEPOLIA = 421614;

export const ESCROW_V2 = "0xFc68976229c3dc839346731275Eebe05bE9911c0" as const;
/** Legacy v1 escrow. Read-only support. New deals are not prepared against it. */
export const ESCROW_V1 = "0x32C650445354f458e8F8B420C27Bb8113AdE5e22" as const;
/** Paused Arbitrum Sepolia escrow. publicAccess is false. This server never sends transactions to it. */
export const ESCROW_SEPOLIA = "0xF702C7ca07B4d39220b20696BFB13373B136A3d4" as const;

export const USDC_ARBITRUM_ONE = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
export const USDC_ARBITRUM_SEPOLIA = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as const;

export const DEFAULT_RPC_URL = "https://arb1.arbitrum.io/rpc";
export const DEFAULT_CONFIG_URL = "https://agentsolis.solists.com.tr/mainnet/config";

export const FEE_NOTE =
  "plus Arbitrum gas in ETH; no fee on refund/cancel/expiry/buyer win/fallback split";

export const PREPARE_WARNING =
  "Nothing was sent. Your wallet signs. Check chain 42161 and the escrow address. Keep the manifest text; it is not stored on-chain.";
