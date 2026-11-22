import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("stdio smoke", () => {
  it("answers initialize and tools/list with no AgentSolis env", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/index.js"],
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "/tmp",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "agentsolis-mcp-test", version: "0.0.0" });
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "get_config",
      "get_deal_status",
      "prepare_deal",
      "quote_fee",
      "sandbox_advance_deal",
      "sandbox_create_deal",
      "sandbox_get_deal",
    ]);
    for (const tool of listed.tools) {
      expect(tool.description?.length ?? 0, tool.name).toBeLessThanOrEqual(400);
    }
    const resources = await client.listResources();
    expect(resources.resources.map((item) => item.uri).sort()).toEqual([
      "agentsolis://addresses",
      "agentsolis://rules",
    ]);
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((item) => item.name)).toEqual(["try_sandbox"]);
    await client.close();
  });

  it("runs a sandbox deal over stdio with no network settings", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/index.js"],
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "/tmp",
        AGENTSOLIS_RPC_URL: "https://127.0.0.1:1/unreachable",
        AGENTSOLIS_CONFIG_URL: "https://127.0.0.1:1/unreachable",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "agentsolis-mcp-test", version: "0.0.0" });
    await client.connect(transport);
    const text = (result: Awaited<ReturnType<typeof client.callTool>>) =>
      (result.content as Array<{ type: string; text: string }>)[0].text;
    const created = await client.callTool({
      name: "sandbox_create_deal",
      arguments: { amount_usdc: "25", job_description: "Write a 500-word blog post" },
    });
    const deal = JSON.parse(text(created));
    expect(deal.label).toBe("SANDBOX - simulated, no real funds");
    expect(deal.amounts_usdc.buyer_locked).toBe("25.375");
    await client.callTool({ name: "sandbox_advance_deal", arguments: { deal_id: deal.deal_id, action: "deliver" } });
    const released = JSON.parse(
      text(await client.callTool({ name: "sandbox_advance_deal", arguments: { deal_id: deal.deal_id, action: "release" } })),
    );
    expect(released.state).toBe("released");
    expect(released.payout_usdc.seller_received).toBe("25.00");
    const bad = await client.callTool({ name: "sandbox_get_deal", arguments: { deal_id: "sandbox-ffffffffffff" } });
    expect(bad.isError).toBe(true);
    await client.close();
  });
});
