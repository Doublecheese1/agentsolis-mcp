import {
  ESCROW_SEPOLIA,
  ESCROW_V1,
  ESCROW_V2,
  USDC_ARBITRUM_ONE,
  USDC_ARBITRUM_SEPOLIA,
} from "./constants.js";

export const addressesResource = {
  uri: "agentsolis://addresses",
  mimeType: "application/json",
  text: JSON.stringify(
    {
      mainnet: {
        chain_id: 42161,
        network: "Arbitrum One",
        escrow_v2: ESCROW_V2,
        escrow_v1_legacy_read_only: ESCROW_V1,
        usdc: USDC_ARBITRUM_ONE,
        status: "working contract. This server only reads it and builds unsigned calldata.",
      },
      testnet: {
        chain_id: 421614,
        network: "Arbitrum Sepolia",
        escrow: ESCROW_SEPOLIA,
        usdc: USDC_ARBITRUM_SEPOLIA,
        status: "paused test deployment with public access closed. This server does not send transactions to it.",
      },
    },
    null,
    2,
  ),
};

export const rulesResource = {
  uri: "agentsolis://rules",
  mimeType: "text/plain",
  text: [
    "AgentSolis escrow rules used by this tool",
    "",
    "Network: Arbitrum One, chain 42161. Token: Circle native USDC, 6 decimals.",
    "Modes: Automatic from 10 USDC. Buyer Review from 100 USDC.",
    "Protocol fee: 1.5% of the job amount, capped at 50 USDC, paid by the side that starts the deal, and only when the seller is paid.",
    "No protocol fee on refund, cancel, expiry, buyer win, or fallback split.",
    "Buyer-started deal: the fee is added to the buyer deposit. Seller-started offer: the fee is taken from the seller payout. This tool prepares buyer-started deals only.",
    "Buyer Review reserve and seller bond: 5% each side, minimum 5 USDC, maximum 100 USDC.",
    "Windows: 10 minutes to 30 days. Automatic decision window at least 1 day and seller fallback at least 50%. Buyer Review decision window at least 2 days and arbitration window at least 7 days.",
    "Funds are locked, then paid out, refunded or split by the agreed rules.",
    "The contract is not upgradeable. Pause stops new deals only. Fee changes have a 48-hour delay and stay at or below 3% and a 100 USDC cap. The team holds the owner keys. This tool does not.",
    "",
    "Escrow contract: source verified on Arbiscan and Sourcify (14 Nov 2026); no independent review yet.",
    "",
    "Not done, as of 23 Nov 2026:",
    "- No independent review.",
    "- No production x402.",
    "- No deals recorded yet.",
    "- This package does not sign, hold keys, or broadcast.",
    "",
    "AgentSolis never asks for a private key or seed phrase.",
    "Live config: https://agentsolis.solists.com.tr/mainnet/config",
    "Wallet-free demo: https://agentsolis.solists.com.tr/play",
    "Wallet-free MCP tools: sandbox_create_deal, sandbox_advance_deal, sandbox_get_deal (simulated, no real funds).",
  ].join("\n"),
};
