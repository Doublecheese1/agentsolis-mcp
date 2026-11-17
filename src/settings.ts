import {
  CHAIN_ARBITRUM_ONE,
  CHAIN_ARBITRUM_SEPOLIA,
  DEFAULT_CONFIG_URL,
  DEFAULT_RPC_URL,
  ESCROW_SEPOLIA,
  ESCROW_V1,
  ESCROW_V2,
  USDC_ARBITRUM_ONE,
  USDC_ARBITRUM_SEPOLIA,
} from "./constants.js";

export type ChainName = "arbitrum-one" | "arbitrum-sepolia";

export type Settings = {
  chainName: ChainName;
  chainId: typeof CHAIN_ARBITRUM_ONE | typeof CHAIN_ARBITRUM_SEPOLIA;
  rpcUrl: string;
  configUrl: string;
  escrow: typeof ESCROW_V2 | typeof ESCROW_SEPOLIA;
  legacyEscrow: typeof ESCROW_V1 | null;
  token: typeof USDC_ARBITRUM_ONE | typeof USDC_ARBITRUM_SEPOLIA;
};

function httpsUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an https URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${name} must be an https URL.`);
  return url.toString();
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const chainName = (env.AGENTSOLIS_CHAIN ?? "arbitrum-one").trim();
  if (chainName !== "arbitrum-one" && chainName !== "arbitrum-sepolia") {
    throw new Error("AGENTSOLIS_CHAIN must be arbitrum-one or arbitrum-sepolia.");
  }
  const chainId = chainName === "arbitrum-one" ? CHAIN_ARBITRUM_ONE : CHAIN_ARBITRUM_SEPOLIA;
  const rpcUrl = httpsUrl((env.AGENTSOLIS_RPC_URL ?? DEFAULT_RPC_URL).trim(), "AGENTSOLIS_RPC_URL");
  const configUrl = httpsUrl((env.AGENTSOLIS_CONFIG_URL ?? DEFAULT_CONFIG_URL).trim(), "AGENTSOLIS_CONFIG_URL");
  return {
    chainName,
    chainId,
    rpcUrl,
    configUrl,
    escrow: chainId === CHAIN_ARBITRUM_ONE ? ESCROW_V2 : ESCROW_SEPOLIA,
    legacyEscrow: chainId === CHAIN_ARBITRUM_ONE ? ESCROW_V1 : null,
    token: chainId === CHAIN_ARBITRUM_ONE ? USDC_ARBITRUM_ONE : USDC_ARBITRUM_SEPOLIA,
  };
}
