import { readFileSync } from "node:fs";

import { decodeFunctionData, getAddress } from "viem";
import { describe, expect, it } from "vitest";

import { approveAbi, proposeDealAbi } from "../src/abi.js";
import { ESCROW_V2, USDC_ARBITRUM_ONE } from "../src/constants.js";
import { computeDealId, prepareDeal, type PrepareContext, type PrepareInput } from "../src/deal.js";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/deal-id.json", import.meta.url), "utf8"),
) as {
  escrow: `0x${string}`;
  usdc: `0x${string}`;
  chain_id: number;
  buyer: string;
  seller: string;
  salt: `0x${string}`;
  manifest: string;
  policy_hash: `0x${string}`;
  amount_usdc: string;
  amount_units: number;
  protocol_fee_units: number;
  buyer_total_units: number;
  fallback_seller_bps: number;
  acceptance_window: number;
  delivery_window: number;
  decision_window: number;
  arbitration_window: number;
  manifest_hash: `0x${string}`;
  deal_id: `0x${string}`;
  approve_data: `0x${string}`;
  propose_data: `0x${string}`;
};

const openContext: PrepareContext = {
  chainId: 42161,
  escrow: ESCROW_V2,
  token: USDC_ARBITRUM_ONE,
  paused: false,
  acceptingFunds: true,
  publicAccess: true,
  policyHash: fixture.policy_hash,
  onChainFeeUnits: BigInt(fixture.protocol_fee_units),
  couponsEnabled: true,
};

function input(overrides: Partial<PrepareInput> = {}): PrepareInput {
  return {
    buyer: fixture.buyer,
    seller: fixture.seller,
    amount_usdc: fixture.amount_usdc,
    mode: "automatic",
    fallback_seller_bps: fixture.fallback_seller_bps,
    acceptance_window: fixture.acceptance_window,
    delivery_window: fixture.delivery_window,
    decision_window: fixture.decision_window,
    arbitration_window: fixture.arbitration_window,
    manifest: fixture.manifest,
    salt: fixture.salt,
    ...overrides,
  };
}

describe("prepare_deal calldata", () => {
  it("matches the Python mainnet.py fixture for deal id and calldata", () => {
    const prepared = prepareDeal(input(), openContext);
    expect(prepared.deal_id).toBe(fixture.deal_id);
    expect(prepared.manifest_hash).toBe(fixture.manifest_hash);
    expect(prepared.policy_hash).toBe(fixture.policy_hash);
    expect(prepared.amount_units).toBe(String(fixture.amount_units));
    expect(prepared.protocol_fee_units).toBe(String(fixture.protocol_fee_units));
    expect(prepared.buyer_total_units).toBe(String(fixture.buyer_total_units));
    expect(prepared.unsigned_transactions[0]?.data).toBe(fixture.approve_data);
    expect(prepared.unsigned_transactions[1]?.data).toBe(fixture.propose_data);
    expect(prepared.unsigned_transactions.every((tx) => tx.value === "0" && tx.chainId === 42161)).toBe(true);
    expect(computeDealId(fixture.escrow, fixture.chain_id, getAddress(fixture.buyer), getAddress(fixture.seller), fixture.salt)).toBe(fixture.deal_id);
  });

  it("decodes approve and proposeDeal back to the same fields", () => {
    const prepared = prepareDeal(input(), openContext);
    const approval = decodeFunctionData({ abi: approveAbi, data: prepared.unsigned_transactions[0]!.data });
    const proposal = decodeFunctionData({ abi: proposeDealAbi, data: prepared.unsigned_transactions[1]!.data });
    expect(approval.functionName).toBe("approve");
    expect(approval.args[0]).toBe(ESCROW_V2);
    expect(approval.args[1]).toBe(BigInt(fixture.buyer_total_units));
    expect(proposal.functionName).toBe("proposeDeal");
    const request = proposal.args[0];
    expect(request.salt).toBe(fixture.salt);
    expect(request.seller).toBe(getAddress(fixture.seller));
    expect(request.mode).toBe(0);
    expect(request.amount).toBe(BigInt(fixture.amount_units));
    expect(request.arbitrationReserve).toBe(0n);
    expect(request.fallbackSellerBps).toBe(fixture.fallback_seller_bps);
    expect(request.manifestHash).toBe(fixture.manifest_hash);
    expect(request.policyHash).toBe(fixture.policy_hash);
    expect(request.acceptanceWindow).toBe(BigInt(fixture.acceptance_window));
    expect(request.deliveryWindow).toBe(BigInt(fixture.delivery_window));
    expect(request.decisionWindow).toBe(BigInt(fixture.decision_window));
    expect(request.arbitrationWindow).toBe(BigInt(fixture.arbitration_window));
  });

  it("refuses a paused config and a config that is not accepting funds", () => {
    expect(() => prepareDeal(input(), { ...openContext, paused: true })).toThrow(/paused/);
    expect(() => prepareDeal(input(), { ...openContext, acceptingFunds: false })).toThrow(/not accepting funds/);
    expect(() => prepareDeal(input(), { ...openContext, chainId: 421614 })).toThrow(/42161/);
  });

  it("enforces Buyer Review windows and the automatic fallback minimum", () => {
    expect(() =>
      prepareDeal(input({ mode: "buyer_review", amount_usdc: "100", decision_window: 86_400 }), {
        ...openContext,
        onChainFeeUnits: 1_500_000n,
        onChainReserveUnits: 5_000_000n,
      }),
    ).toThrow(/decision_window/);
    expect(() =>
      prepareDeal(input({ mode: "buyer_review", amount_usdc: "100", decision_window: 172_800, arbitration_window: 86_400 }), {
        ...openContext,
        onChainFeeUnits: 1_500_000n,
        onChainReserveUnits: 5_000_000n,
      }),
    ).toThrow(/arbitration_window/);
    expect(() => prepareDeal(input({ fallback_seller_bps: 4999 }), openContext)).toThrow(/5000/);
  });
});
