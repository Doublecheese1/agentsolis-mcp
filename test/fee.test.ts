import { describe, expect, it } from "vitest";

import { protocolFeeUnits, quoteFee } from "../src/fee.js";
import { parseUsdc } from "../src/money.js";

const USDC = 1_000_000n;

describe("published fee table", () => {
  // Site columns, from clarity_sections.fee_rows:
  // fee, buyer-opened deposit with a zero reserve, seller-opened payout with a zero reserve, review bond.
  const rows = [
    { amount: "10", fee: "0.15", buyerDeposit: "10.15", sellerReceives: "9.85", bond: null },
    { amount: "100", fee: "1.50", buyerDeposit: "101.50", sellerReceives: "98.50", bond: "5.00" },
    { amount: "1000", fee: "15.00", buyerDeposit: "1015.00", sellerReceives: "985.00", bond: "50.00" },
    { amount: "5000", fee: "50.00", buyerDeposit: "5050.00", sellerReceives: "4950.00", bond: "100.00" },
  ] as const;

  it.each(rows)("$amount USDC matches the site row", (row) => {
    const buyer = quoteFee({ amount_usdc: row.amount, mode: "automatic", starter: "buyer" });
    const seller = quoteFee({ amount_usdc: row.amount, mode: "automatic", starter: "seller" });
    expect(buyer.fee).toBe(row.fee);
    expect(seller.fee).toBe(row.fee);
    expect(buyer.buyer_deposit).toBe(row.buyerDeposit);
    expect(buyer.seller_receives).toBe(row.amount === "10" ? "10.00" : `${row.amount}.00`);
    expect(seller.seller_receives).toBe(row.sellerReceives);
    expect(seller.buyer_deposit).toBe(row.amount === "10" ? "10.00" : `${row.amount}.00`);
    expect(buyer.note).toBe("plus Arbitrum gas in ETH; no fee on refund/cancel/expiry/buyer win/fallback split");
    if (row.bond) {
      const review = quoteFee({ amount_usdc: row.amount, mode: "buyer_review", starter: "buyer" });
      expect(review.review_bond_each_side).toBe(row.bond);
      const deposit = parseUsdc(row.buyerDeposit) + parseUsdc(row.bond);
      expect(review.buyer_deposit_units).toBe(deposit.toString());
      expect(review.seller_receives_units).toBe(parseUsdc(row.amount).toString());
    } else {
      expect(buyer.review_bond_each_side).toBeUndefined();
    }
  });

  it("rejects amounts under the mode minimum", () => {
    expect(() => quoteFee({ amount_usdc: "9.99", mode: "automatic", starter: "buyer" })).toThrow(/10 USDC minimum/);
    expect(() => quoteFee({ amount_usdc: "99.99", mode: "buyer_review", starter: "seller" })).toThrow(/100 USDC minimum/);
    expect(quoteFee({ amount_usdc: "99.99", mode: "automatic", starter: "buyer" }).minimum_ok).toBe(true);
  });

  it("caps between 3333.33 and 3333.34 and at the exact unit boundary", () => {
    const under = quoteFee({ amount_usdc: "3333.33", mode: "automatic", starter: "buyer" });
    const over = quoteFee({ amount_usdc: "3333.34", mode: "automatic", starter: "buyer" });
    expect(under.fee_units).toBe("49999950");
    expect(under.fee_capped).toBe(false);
    expect(over.fee_units).toBe("50000000");
    expect(over.fee).toBe("50.00");
    expect(over.fee_capped).toBe(true);

    const justUnder = protocolFeeUnits(3_333_333_333n);
    const justOver = protocolFeeUnits(3_333_333_334n);
    expect(justUnder).toBe(49_999_999n);
    expect(justOver).toBe(50n * USDC);
  });
});
