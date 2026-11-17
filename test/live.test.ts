import { describe, expect, it } from "vitest";

import { createEscrowReader } from "../src/chain.js";
import { loadSettings } from "../src/settings.js";
import { getConfig, getDealStatusTool } from "../src/tools.js";

const live = process.env.LIVE_READONLY === "1";

describe.skipIf(!live)("live read-only smoke", () => {
  it("reads Arbitrum One config and an unknown deal", async () => {
    const settings = loadSettings({
      AGENTSOLIS_CHAIN: "arbitrum-one",
      AGENTSOLIS_RPC_URL: process.env.AGENTSOLIS_RPC_URL ?? "https://arb1.arbitrum.io/rpc",
      AGENTSOLIS_CONFIG_URL: process.env.AGENTSOLIS_CONFIG_URL ?? "https://agentsolis.solists.com.tr/mainnet/config",
    });
    const reader = createEscrowReader(settings);
    const config = await getConfig(settings, reader);
    expect(config.chain.chain_id).toBe(42161);
    expect(config.chain.paused).toBe(false);
    expect(config.drift).toEqual([]);
    const status = await getDealStatusTool(
      { deal_id: `0x${"ab".repeat(32)}` },
      settings,
      reader,
    );
    expect(status.status).toBe("not_found");
  });
});
