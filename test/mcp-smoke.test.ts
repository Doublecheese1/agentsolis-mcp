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
    ]);
    const resources = await client.listResources();
    expect(resources.resources.map((item) => item.uri).sort()).toEqual([
      "agentsolis://addresses",
      "agentsolis://rules",
    ]);
    await client.close();
  });
});
