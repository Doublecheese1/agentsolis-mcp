import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SANDBOX_LABEL, SANDBOX_MAX_DEALS, SandboxStore } from "../src/sandbox.js";

const fixedNow = () => new Date("2026-11-23T00:00:00Z");

describe("sandbox store", () => {
  it("runs create -> deliver -> release with the real fee math", () => {
    const store = new SandboxStore(fixedNow);
    const created = store.create({ amount_usdc: "100", job_description: "Write a 500-word blog post" });
    expect(created.sandbox).toBe(true);
    expect(created.label).toBe(SANDBOX_LABEL);
    expect(created.deal_id).toMatch(/^sandbox-[0-9a-f]{12}$/);
    expect(created.state).toBe("funded");
    expect(created.mode).toBe("automatic");
    expect(created.amounts_usdc).toEqual({
      job: "100.00",
      protocol_fee_if_seller_paid: "1.50",
      review_reserve: "0.00",
      buyer_locked: "101.50",
    });
    expect(created.allowed_actions).toEqual(["deliver", "refund"]);

    const delivered = store.advance(created.deal_id, "deliver");
    expect(delivered.state).toBe("delivered");
    expect(delivered.allowed_actions).toEqual(["release"]);

    const released = store.advance(created.deal_id, "release");
    expect(released.state).toBe("released");
    expect(released.payout_usdc).toEqual({ seller_received: "100.00", protocol_fee: "1.50", returned_to_buyer: "0.00" });
    expect(released.allowed_actions).toEqual([]);
    expect(released.history).toHaveLength(3);
    expect(store.get(created.deal_id).state).toBe("released");
  });

  it("refunds before delivery with no fee", () => {
    const store = new SandboxStore(fixedNow);
    const created = store.create({ amount_usdc: "1000", mode: "buyer_review", job_description: "Pretend review job" });
    expect(created.amounts_usdc.buyer_locked).toBe("1065.00");
    expect(created.amounts_usdc.review_reserve).toBe("50.00");
    const refunded = store.advance(created.deal_id, "refund");
    expect(refunded.state).toBe("refunded");
    expect(refunded.payout_usdc).toEqual({ seller_received: "0.00", protocol_fee: "0.00", returned_to_buyer: "1065.00" });
  });

  it("caps the fee at 50 USDC", () => {
    const store = new SandboxStore(fixedNow);
    const created = store.create({ amount_usdc: "5000", job_description: "Big pretend job" });
    expect(created.amounts_usdc.protocol_fee_if_seller_paid).toBe("50.00");
    expect(created.amounts_usdc.buyer_locked).toBe("5050.00");
  });

  it("rejects wrong steps, unknown ids, small amounts and key material", () => {
    const store = new SandboxStore(fixedNow);
    const created = store.create({ amount_usdc: "10", job_description: "Small job" });
    expect(() => store.advance(created.deal_id, "release")).toThrow(/cannot 'release' a funded deal/);
    store.advance(created.deal_id, "deliver");
    expect(() => store.advance(created.deal_id, "refund")).toThrow(/Allowed now: release/);
    expect(() => store.get("sandbox-000000000000")).toThrow(/no sandbox deal/);
    expect(() => store.create({ amount_usdc: "5", job_description: "Too small" })).toThrow(/below the 10 USDC minimum/);
    expect(() => store.create({ amount_usdc: "10", job_description: "   " })).toThrow(/job_description is required/);
    expect(() => store.create({ amount_usdc: "10", job_description: "ab".repeat(32) })).toThrow(/private key or seed phrase/);
  });

  it("keeps at most SANDBOX_MAX_DEALS deals", () => {
    const store = new SandboxStore(fixedNow);
    const first = store.create({ amount_usdc: "10", job_description: "first" });
    for (let i = 0; i < SANDBOX_MAX_DEALS; i += 1) store.create({ amount_usdc: "10", job_description: `job ${i}` });
    expect(() => store.get(first.deal_id)).toThrow(/no sandbox deal/);
  });

  it("does not import chain, fetch or network code", () => {
    const source = readFileSync(fileURLToPath(new URL("../src/sandbox.ts", import.meta.url)), "utf8");
    for (const word of ["./chain", "viem", "fetch(", "http", "./tools"]) {
      expect(source.includes(word), word).toBe(false);
    }
  });
});
