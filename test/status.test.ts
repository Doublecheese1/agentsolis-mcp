import { describe, expect, it } from "vitest";

import { mapDeal } from "../src/chain.js";
import { nextAction, type DealView } from "../src/status.js";

function deal(overrides: Partial<DealView>): DealView {
  return {
    buyer: "0x1111111111111111111111111111111111111111",
    seller: "0x2222222222222222222222222222222222222222",
    resolver: "0x3333333333333333333333333333333333333333",
    mode: 0,
    state: 2,
    amount: 10_000_000n,
    arbitrationReserve: 0n,
    sellerBond: 0n,
    protocolFee: 150_000n,
    fallbackSellerBps: 5000,
    manifestHash: `0x${"11".repeat(32)}`,
    policyHash: `0x${"22".repeat(32)}`,
    contentHash: `0x${"00".repeat(32)}`,
    acceptanceDeadline: 1_000n,
    deliveryWindow: 100n,
    decisionWindow: 100n,
    arbitrationWindow: 100n,
    deliveryDeadline: 2_000n,
    decisionDeadline: 3_000n,
    arbitrationDeadline: 4_000n,
    validationNonce: 0n,
    ...overrides,
  };
}

describe("chain tuple decoding", () => {
  it("reads numeric viem keys and treats state 0 as empty", () => {
    const raw = Array.from({ length: 22 }, () => 0n);
    raw[0] = "0x0000000000000000000000000000000000000000";
    raw[4] = 0n;
    expect(Number(mapDeal(raw).state)).toBe(0);
    raw[4] = 2n;
    raw[0] = "0x1111111111111111111111111111111111111111";
    expect(mapDeal(raw).buyer).toBe("0x1111111111111111111111111111111111111111");
    expect(Number(mapDeal(raw).state)).toBe(2);
  });
});

describe("next action hints", () => {
  it("names expireUndelivered after the delivery deadline", () => {
    expect(nextAction(deal({ state: 2 }), 2_000n)).toBe("after delivery_deadline anyone may call expireUndelivered");
    expect(nextAction(deal({ state: 2 }), 1_999n)).toMatch(/deliver/);
  });

  it("distinguishes automatic and buyer review delivery", () => {
    expect(nextAction(deal({ state: 3, mode: 0 }), 2_999n)).toMatch(/submitValidation/);
    expect(nextAction(deal({ state: 3, mode: 1 }), 3_000n)).toMatch(/finalizeIfSilent/);
    expect(nextAction(deal({ state: 4, mode: 1 }), 3_999n)).toMatch(/resolveReview/);
    expect(nextAction(deal({ state: 5 }), 9_999n)).toMatch(/paid/);
  });
});
