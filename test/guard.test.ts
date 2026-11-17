import { describe, expect, it } from "vitest";

import { ESCROW_V2, USDC_ARBITRUM_ONE } from "../src/constants.js";
import { prepareDeal } from "../src/deal.js";
import { quoteFee } from "../src/fee.js";
import { InputRejected, rejectKeyMaterial } from "../src/guard.js";

const phrase12 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const phrase24 = `${phrase12} ${phrase12}`;

describe("key guard", () => {
  it("rejects a 64-hex string and a 12 or 24 word phrase", () => {
    expect(() => rejectKeyMaterial({ amount_usdc: "11".repeat(32) })).toThrow(InputRejected);
    expect(() => rejectKeyMaterial({ manifest: `notes ${"ab".repeat(32)} end` })).toThrow(InputRejected);
    expect(() => rejectKeyMaterial({ manifest: phrase12 })).toThrow(InputRejected);
    expect(() => rejectKeyMaterial({ manifest: phrase24 })).toThrow(InputRejected);
    expect(() => quoteFee({ amount_usdc: "aa".repeat(32), mode: "automatic", starter: "buyer" })).toThrow(InputRejected);
  });

  it("still accepts a 0x-prefixed salt and deal id", () => {
    expect(() => rejectKeyMaterial({ salt: `0x${"11".repeat(32)}`, deal_id: `0x${"22".repeat(32)}` })).not.toThrow();
    const prepared = prepareDeal(
      {
        buyer: "0x1111111111111111111111111111111111111111",
        seller: "0x2222222222222222222222222222222222222222",
        amount_usdc: "10",
        mode: "automatic",
        fallback_seller_bps: 5000,
        acceptance_window: 3600,
        delivery_window: 86400,
        decision_window: 86400,
        arbitration_window: 86400,
        manifest: "One agreed paragraph about the job, with a number 10 and a full stop.",
        salt: `0x${"11".repeat(32)}`,
      },
      {
        chainId: 42161,
        escrow: ESCROW_V2,
        token: USDC_ARBITRUM_ONE,
        paused: false,
        acceptingFunds: true,
        publicAccess: true,
        policyHash: `0x${"aa".repeat(32)}`,
      },
    );
    expect(prepared.unsigned_transactions).toHaveLength(2);
  });
});
