import { randomBytes } from "node:crypto";

import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  toBytes,
  type Hex,
} from "viem";

import { approveAbi, proposeDealAbi } from "./abi.js";
import {
  CHAIN_ARBITRUM_ONE,
  ESCROW_V2,
  FEE_NOTE,
  PREPARE_WARNING,
  USDC_ARBITRUM_ONE,
} from "./constants.js";
import { arbitrationReserveUnits, protocolFeeUnits, type Mode } from "./fee.js";
import { assertMinimum } from "./fee.js";
import { rejectKeyMaterial } from "./guard.js";
import { formatUsdc, parseUsdc } from "./money.js";

export const MIN_WINDOW = 600;
export const MAX_WINDOW = 30 * 24 * 60 * 60;
export const MIN_AUTOMATIC_DECISION = 24 * 60 * 60;
export const MIN_AUTOMATIC_FALLBACK_BPS = 5_000;
export const MIN_REVIEW_DECISION = 2 * 24 * 60 * 60;
export const MIN_REVIEW_ARBITRATION = 7 * 24 * 60 * 60;

export type PrepareInput = {
  buyer: string;
  seller: string;
  amount_usdc: string;
  mode: Mode;
  fallback_seller_bps: number;
  acceptance_window: number;
  delivery_window: number;
  decision_window: number;
  arbitration_window: number;
  manifest: string;
  salt?: string;
};

export type PrepareContext = {
  chainId: number;
  escrow: `0x${string}`;
  token: `0x${string}`;
  paused: boolean;
  acceptingFunds: boolean;
  publicAccess: boolean;
  policyHash: Hex;
  couponsEnabled?: boolean;
  foundingVouchersEnabled?: boolean;
  onChainFeeUnits?: bigint;
  onChainReserveUnits?: bigint;
  randomSalt?: () => Hex;
};

export type UnsignedTransaction = {
  purpose: "usdc_approve" | "propose_deal";
  chainId: number;
  to: `0x${string}`;
  data: Hex;
  value: "0";
};

export function requireChecksum(value: string, label: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a checksummed 20-byte address.`);
  }
  let checksum: `0x${string}`;
  try {
    checksum = getAddress(value);
  } catch {
    throw new Error(`${label} must be a checksummed 20-byte address.`);
  }
  if (value !== checksum) {
    throw new Error(`${label} must be a checksummed address.`);
  }
  if (checksum === "0x0000000000000000000000000000000000000000") {
    throw new Error(`${label} cannot be the zero address.`);
  }
  return checksum;
}

export function manifestHashOf(manifest: string): Hex {
  return keccak256(toBytes(manifest));
}

export function computeDealId(
  escrow: `0x${string}`,
  chainId: number,
  buyer: `0x${string}`,
  seller: `0x${string}`,
  salt: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
      ],
      [escrow, BigInt(chainId), buyer, seller, salt],
    ),
  );
}

function requireWindow(name: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > MAX_WINDOW) {
    throw new Error(`${name} must be a whole number of seconds from ${minimum} to ${MAX_WINDOW}.`);
  }
}

function parseSalt(salt: string | undefined, randomSalt: (() => Hex) | undefined): Hex {
  if (salt === undefined || salt === "") {
    return randomSalt ? randomSalt() : (`0x${randomBytes(32).toString("hex")}` as Hex);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(salt)) {
    throw new Error("salt must be a 0x-prefixed 32-byte hex value.");
  }
  return salt as Hex;
}

export function prepareDeal(input: PrepareInput, context: PrepareContext) {
  rejectKeyMaterial(input);
  if (context.chainId !== CHAIN_ARBITRUM_ONE) {
    throw new Error("prepare_deal in this version only builds Arbitrum One (chain 42161) transactions. Nothing was sent.");
  }
  if (context.paused) {
    throw new Error("The live config says paused. No transaction was built.");
  }
  if (!context.acceptingFunds) {
    throw new Error("The live config is not accepting funds. No transaction was built.");
  }
  if (!context.publicAccess) {
    throw new Error("Public access is closed. No transaction was built.");
  }
  if (getAddress(context.escrow) !== ESCROW_V2 || getAddress(context.token) !== USDC_ARBITRUM_ONE) {
    throw new Error("Config addresses do not match the published Arbitrum One escrow and USDC contracts. No transaction was built.");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(context.policyHash)) {
    throw new Error("The live policy hash is missing. No transaction was built.");
  }

  const buyer = requireChecksum(input.buyer, "buyer");
  const seller = requireChecksum(input.seller, "seller");
  if (buyer === seller) throw new Error("Buyer and seller must be different wallets.");
  if (input.mode !== "automatic" && input.mode !== "buyer_review") {
    throw new Error("mode must be automatic or buyer_review.");
  }
  if (typeof input.manifest !== "string" || input.manifest.length < 1 || input.manifest.length > 20_000) {
    throw new Error("manifest must be the agreed text, from 1 to 20000 characters.");
  }

  requireWindow("acceptance_window", input.acceptance_window, MIN_WINDOW);
  requireWindow("delivery_window", input.delivery_window, MIN_WINDOW);
  if (input.mode === "automatic") {
    requireWindow("decision_window", input.decision_window, MIN_AUTOMATIC_DECISION);
    requireWindow("arbitration_window", input.arbitration_window, MIN_WINDOW);
  } else {
    requireWindow("decision_window", input.decision_window, MIN_REVIEW_DECISION);
    requireWindow("arbitration_window", input.arbitration_window, MIN_REVIEW_ARBITRATION);
  }
  if (!Number.isInteger(input.fallback_seller_bps) || input.fallback_seller_bps < 0 || input.fallback_seller_bps > 10_000) {
    throw new Error("fallback_seller_bps must be an integer from 0 to 10000.");
  }
  if (input.mode === "automatic" && input.fallback_seller_bps < MIN_AUTOMATIC_FALLBACK_BPS) {
    throw new Error("Automatic deals require fallback_seller_bps of at least 5000.");
  }

  const amount = parseUsdc(input.amount_usdc);
  assertMinimum(amount, input.mode);
  const fee = protocolFeeUnits(amount);
  const reserve = input.mode === "buyer_review" ? arbitrationReserveUnits(amount) : 0n;
  if (context.onChainFeeUnits !== undefined && context.onChainFeeUnits !== fee) {
    throw new Error(
      `On-chain protocol fee ${context.onChainFeeUnits.toString()} units does not match the formula ${fee.toString()} units. No transaction was built.`,
    );
  }
  if (
    input.mode === "buyer_review" &&
    context.onChainReserveUnits !== undefined &&
    context.onChainReserveUnits !== reserve
  ) {
    throw new Error("On-chain review reserve does not match the formula. No transaction was built.");
  }

  const buyerTotal = amount + reserve + fee;
  const salt = parseSalt(input.salt, context.randomSalt);
  const manifestHash = manifestHashOf(input.manifest);
  const policyHash = context.policyHash;
  const dealId = computeDealId(context.escrow, context.chainId, buyer, seller, salt);
  const modeIndex = input.mode === "automatic" ? 0 : 1;
  const approval = encodeFunctionData({
    abi: approveAbi,
    functionName: "approve",
    args: [context.escrow, buyerTotal],
  });
  const proposal = encodeFunctionData({
    abi: proposeDealAbi,
    functionName: "proposeDeal",
    args: [
      {
        salt,
        seller,
        mode: modeIndex,
        amount,
        arbitrationReserve: reserve,
        fallbackSellerBps: input.fallback_seller_bps,
        manifestHash,
        policyHash,
        acceptanceWindow: BigInt(input.acceptance_window),
        deliveryWindow: BigInt(input.delivery_window),
        decisionWindow: BigInt(input.decision_window),
        arbitrationWindow: BigInt(input.arbitration_window),
      },
    ],
  });

  const decodedApprove = decodeFunctionData({ abi: approveAbi, data: approval });
  const decodedProposal = decodeFunctionData({ abi: proposeDealAbi, data: proposal });
  if (decodedApprove.functionName !== "approve" || decodedProposal.functionName !== "proposeDeal") {
    throw new Error("Calldata could not be decoded. No transaction was returned.");
  }

  const warnings = [
    PREPARE_WARNING,
    FEE_NOTE,
    "Funds are locked, then paid out, refunded or split by the agreed rules.",
  ];
  if (context.couponsEnabled || context.foundingVouchersEnabled) {
    warnings.push(
      "This unsigned transaction uses the base protocol fee. It does not apply a coupon or Founding waiver.",
    );
  }

  const transactions: UnsignedTransaction[] = [
    { purpose: "usdc_approve", chainId: CHAIN_ARBITRUM_ONE, to: context.token, data: approval, value: "0" },
    { purpose: "propose_deal", chainId: CHAIN_ARBITRUM_ONE, to: context.escrow, data: proposal, value: "0" },
  ];

  return {
    deal_id: dealId,
    manifest_hash: manifestHash,
    policy_hash: policyHash,
    amount_units: amount.toString(),
    amount_usdc: formatUsdc(amount),
    buyer_total_units: buyerTotal.toString(),
    buyer_total_usdc: formatUsdc(buyerTotal),
    protocol_fee_units: fee.toString(),
    protocol_fee_usdc: formatUsdc(fee),
    reserve_units: reserve.toString(),
    buyer,
    seller,
    mode: input.mode,
    salt,
    unsigned_transactions: transactions,
    warnings,
  };
}
