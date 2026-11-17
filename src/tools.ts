import { getAddress, type Address, type Hex } from "viem";

import type { EscrowReader } from "./chain.js";
import { ESCROW_V2, USDC_ARBITRUM_ONE } from "./constants.js";
import { prepareDeal, requireChecksum, type PrepareInput } from "./deal.js";
import {
  arbitrationReserveUnits,
  protocolFeeUnits,
  quoteFee,
  type Mode,
  type Starter,
} from "./fee.js";
import { rejectKeyMaterial } from "./guard.js";
import { parseUsdc } from "./money.js";
import { presentDeal } from "./status.js";
import type { Settings } from "./settings.js";

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  url: string;
  json: () => Promise<unknown>;
}>;

export type Drift = { field: string; config: unknown; chain: unknown };

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The config URL did not return a JSON object.");
  }
  return value as Record<string, unknown>;
}

export async function fetchPublicConfig(url: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.url.startsWith("https://")) {
    throw new Error("The config URL did not stay on https.");
  }
  if (!response.ok) throw new Error(`Config request failed with status ${response.status}.`);
  return asRecord(await response.json());
}

function sameAddress(left: unknown, right: string): boolean {
  if (typeof left !== "string") return false;
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}

export async function getConfig(
  settings: Settings,
  reader: EscrowReader,
  fetchImpl?: FetchLike,
): Promise<{ config: Record<string, unknown>; chain: Record<string, unknown>; drift: Drift[] }> {
  await reader.assertChain();
  const config = await fetchPublicConfig(settings.configUrl, fetchImpl);
  if (!(await reader.hasCode(settings.escrow))) {
    throw new Error("No contract code at the configured escrow address.");
  }
  const block = await reader.getBlock();
  const paused = await reader.paused(settings.escrow, block.number);
  const publicAccess = await reader.publicAccess(settings.escrow, block.number);
  const feeBps = await reader.feeBps(settings.escrow, block.number);
  const feeCap = await reader.feeCap(settings.escrow, block.number);
  const chain = {
    chain_id: settings.chainId,
    escrow: settings.escrow,
    token: settings.token,
    paused,
    public_access: publicAccess,
    protocol_fee_bps: feeBps,
    protocol_fee_cap_units: feeCap.toString(),
    observed_block: block.number.toString(),
    chain_time: block.timestamp.toString(),
  };
  const drift: Drift[] = [];
  if (typeof config.paused !== "boolean" || config.paused !== paused) {
    drift.push({ field: "paused", config: config.paused ?? null, chain: paused });
  }
  if (typeof config.public_access !== "boolean" || config.public_access !== publicAccess) {
    drift.push({ field: "public_access", config: config.public_access ?? null, chain: publicAccess });
  }
  if (Number(config.protocol_fee_bps) !== feeBps) {
    drift.push({ field: "protocol_fee_bps", config: config.protocol_fee_bps ?? null, chain: feeBps });
  }
  const capRaw = config.protocol_fee_cap_units;
  const capComparable = typeof capRaw === "number" || typeof capRaw === "string" ? capRaw : "-1";
  if (BigInt(capComparable) !== feeCap) {
    drift.push({ field: "protocol_fee_cap_units", config: capRaw ?? null, chain: feeCap.toString() });
  }
  if (Number(config.chain_id) !== settings.chainId) {
    drift.push({ field: "chain_id", config: config.chain_id ?? null, chain: settings.chainId });
  }
  if (!sameAddress(config.escrow, settings.escrow)) {
    drift.push({ field: "escrow", config: config.escrow ?? null, chain: settings.escrow });
  }
  return { config, chain, drift };
}

export async function quoteFeeTool(
  input: { amount_usdc: string; mode: Mode; starter: Starter; buyer_address?: string },
  settings: Settings,
  reader: EscrowReader,
) {
  rejectKeyMaterial(input);
  const quote = quoteFee(input);
  if (!input.buyer_address) return quote;
  const buyer = requireChecksum(input.buyer_address, "buyer_address");
  await reader.assertChain();
  const block = await reader.getBlock();
  const amount = parseUsdc(input.amount_usdc);
  const chainFee = await reader.protocolFeeFor(settings.escrow, buyer, amount, block.number);
  const chainReserve = await reader.arbitrationReserveFor(settings.escrow, amount, block.number);
  const formulaFee = protocolFeeUnits(amount);
  const formulaReserve = arbitrationReserveUnits(amount);
  return {
    ...quote,
    on_chain: {
      buyer: buyer,
      protocol_fee_units: chainFee.toString(),
      arbitration_reserve_units: chainReserve.toString(),
      fee_matches_formula: chainFee === formulaFee,
      reserve_matches_formula: chainReserve === formulaReserve,
      note: "protocolFeeFor on the current contract follows the posted fee bps and cap. A per-wallet waiver is not applied by this view.",
    },
  };
}

function policyFor(config: Record<string, unknown>, mode: Mode): Hex {
  const raw = mode === "automatic" ? config.automatic_policy_hash : config.review_policy_hash;
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("The live policy hash for this mode is missing. No transaction was built.");
  }
  return raw as Hex;
}

export async function prepareDealTool(
  input: PrepareInput,
  settings: Settings,
  reader: EscrowReader,
  fetchImpl?: FetchLike,
) {
  rejectKeyMaterial(input);
  if (settings.chainId !== 42161) {
    throw new Error("prepare_deal in this version only builds Arbitrum One (chain 42161) transactions. Nothing was sent.");
  }
  await reader.assertChain();
  const config = await fetchPublicConfig(settings.configUrl, fetchImpl);
  if (config.contract_version !== undefined && Number(config.contract_version) !== 2) {
    throw new Error("The live config is not escrow version 2. No transaction was built.");
  }
  if (!sameAddress(config.escrow, ESCROW_V2) || !sameAddress(config.token ?? USDC_ARBITRUM_ONE, USDC_ARBITRUM_ONE)) {
    throw new Error("Config addresses do not match the published Arbitrum One escrow and USDC contracts. No transaction was built.");
  }
  const block = await reader.getBlock();
  const chainPaused = await reader.paused(settings.escrow, block.number);
  const chainPublic = await reader.publicAccess(settings.escrow, block.number);
  const amount = parseUsdc(input.amount_usdc);
  const buyer = requireChecksum(input.buyer, "buyer");
  const onChainFeeUnits = await reader.protocolFeeFor(settings.escrow, buyer, amount, block.number);
  const onChainReserveUnits = input.mode === "buyer_review"
    ? await reader.arbitrationReserveFor(settings.escrow, amount, block.number)
    : undefined;
  return prepareDeal(input, {
    chainId: settings.chainId,
    escrow: settings.escrow,
    token: settings.token,
    paused: config.paused === true || chainPaused,
    acceptingFunds: config.accepting_funds === true,
    publicAccess: config.public_access === true && chainPublic,
    policyHash: policyFor(config, input.mode),
    couponsEnabled: config.coupons_enabled === true,
    foundingVouchersEnabled: config.founding_vouchers_enabled === true,
    onChainFeeUnits,
    onChainReserveUnits,
  });
}

export async function getDealStatusTool(
  input: { deal_id: string; escrow?: "v2" | "v1-legacy"; chain?: "arbitrum-one" | "arbitrum-sepolia" },
  settings: Settings,
  reader: EscrowReader,
) {
  rejectKeyMaterial(input);
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.deal_id)) {
    throw new Error("deal_id must be a 0x-prefixed 32-byte hex value.");
  }
  if (input.chain && input.chain !== settings.chainName) {
    throw new Error(
      `This process is configured for ${settings.chainName}. Restart it with AGENTSOLIS_CHAIN and a matching AGENTSOLIS_RPC_URL.`,
    );
  }
  const version = input.escrow ?? "v2";
  if (version !== "v2" && version !== "v1-legacy") {
    throw new Error("escrow must be v2 or v1-legacy.");
  }
  if (version === "v1-legacy" && !settings.legacyEscrow) {
    throw new Error("The legacy v1 escrow is only available on Arbitrum One.");
  }
  await reader.assertChain();
  const escrow = (version === "v1-legacy" ? settings.legacyEscrow : settings.escrow) as Address;
  if (!(await reader.hasCode(escrow))) {
    throw new Error("No contract code at the escrow address.");
  }
  const block = await reader.getBlock();
  const deal = await reader.readDeal(escrow, input.deal_id as Hex, block.number, version === "v2" ? "v2" : "v1");
  const base = {
    deal_id: input.deal_id,
    escrow,
    escrow_version: version,
    chain_id: settings.chainId,
    observed_block: block.number.toString(),
    chain_time: { unix: block.timestamp.toString(), iso: new Date(Number(block.timestamp) * 1000).toISOString() },
  };
  if (!deal) return { ...base, found: false, status: "not_found" as const };
  return { ...base, found: true, status: "found" as const, deal: presentDeal(deal, block.timestamp) };
}
