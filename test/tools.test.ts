import { describe, expect, it } from "vitest";

import type { EscrowReader } from "../src/chain.js";
import { ESCROW_V2, USDC_ARBITRUM_ONE } from "../src/constants.js";
import { loadSettings } from "../src/settings.js";
import { getConfig, getDealStatusTool, prepareDealTool } from "../src/tools.js";

const settings = loadSettings({});

function reader(overrides: Partial<EscrowReader> = {}): EscrowReader {
  return {
    async assertChain() {},
    async getBlock() {
      return { number: 10n, timestamp: 1_700_000_000n };
    },
    async hasCode() {
      return true;
    },
    async paused() {
      return false;
    },
    async publicAccess() {
      return true;
    },
    async feeBps() {
      return 150;
    },
    async feeCap() {
      return 50_000_000n;
    },
    async protocolFeeFor() {
      return 150_000n;
    },
    async arbitrationReserveFor() {
      return 5_000_000n;
    },
    async readDeal() {
      return null;
    },
    ...overrides,
  };
}

const config = {
  paused: false,
  public_access: true,
  accepting_funds: true,
  chain_id: 42161,
  contract_version: 2,
  escrow: ESCROW_V2,
  token: USDC_ARBITRUM_ONE,
  protocol_fee_bps: 150,
  protocol_fee_cap_units: 50_000_000,
  automatic_policy_hash: `0x${"aa".repeat(32)}`,
  review_policy_hash: `0x${"bb".repeat(32)}`,
  coupons_enabled: false,
  founding_vouchers_enabled: false,
};

describe("chain guard and config drift", () => {
  it("refuses an RPC that reports a different chain id", async () => {
    await expect(
      getConfig(settings, reader({
        async assertChain() {
          throw new Error("RPC reported chain id 1. This server is configured for 42161 and will not continue.");
        },
      })),
    ).rejects.toThrow(/chain id 1/);
  });

  it("lists drift when the config and the chain disagree", async () => {
    const result = await getConfig(
      settings,
      reader({
        async paused() {
          return true;
        },
      }),
      async () => ({ ok: true, status: 200, url: settings.configUrl, json: async () => config }),
    );
    expect(result.drift.map((item) => item.field)).toContain("paused");
  });

  it("returns not_found for an empty deal and refuses a closed funding gate", async () => {
    const status = await getDealStatusTool({ deal_id: `0x${"ab".repeat(32)}` }, settings, reader());
    expect(status.status).toBe("not_found");
    expect(status.found).toBe(false);

    await expect(
      prepareDealTool(
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
          manifest: "A short agreed job description with punctuation.",
          salt: `0x${"11".repeat(32)}`,
        },
        settings,
        reader(),
        async () => ({
          ok: true,
          status: 200,
          url: settings.configUrl,
          json: async () => ({ ...config, accepting_funds: false }),
        }),
      ),
    ).rejects.toThrow(/not accepting funds/);
  });
});
