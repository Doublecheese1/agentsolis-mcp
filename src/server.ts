import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { createEscrowReader, type EscrowReader } from "./chain.js";
import { addressesResource, rulesResource } from "./resources.js";
import { loadSettings, type Settings } from "./settings.js";
import {
  getConfig,
  getDealStatusTool,
  prepareDealTool,
  quoteFeeTool,
  type FetchLike,
} from "./tools.js";

const INSTRUCTIONS = [
  "AgentSolis MCP prepares unsigned USDC escrow transactions and reads public deal status on Arbitrum One.",
  "It never holds a private key or seed phrase, never signs, and never broadcasts.",
  "The wallet owner signs. Funds are locked, then paid out, refunded or split by the agreed rules.",
  "Contract source was not verified on Sourcify as of 14 Nov 2026. There is no independent review and no recorded deals yet.",
].join(" ");

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "The tool failed.";
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

export type ServerDeps = {
  settings?: Settings;
  reader?: EscrowReader;
  fetchImpl?: FetchLike;
};

export function createAgentServer(deps: ServerDeps = {}): McpServer {
  const settings = deps.settings ?? loadSettings();
  const reader = deps.reader ?? createEscrowReader(settings);
  const fetchImpl = deps.fetchImpl;
  const server = new McpServer({ name: "agentsolis", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "get_config",
    {
      title: "Get AgentSolis config",
      description:
        "Read the public AgentSolis config and cross-check paused, public access, fee bps and fee cap with eth_call. Returns both results and a drift list when they differ. Does not sign, send, or change a deal.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      try {
        return textResult(await getConfig(settings, reader, fetchImpl));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "quote_fee",
    {
      title: "Quote protocol fee",
      description:
        "Calculate the protocol fee, buyer deposit, seller receipt and Buyer Review bond with the integer formula: 1.5% of the job amount, capped at 50 USDC. Does not move funds. If buyer_address is set, also read protocolFeeFor and arbitrationReserveFor and flag any difference. Does not sign or send.",
      inputSchema: {
        amount_usdc: z.string().describe("Job amount in USDC as a decimal string with at most 6 fraction digits."),
        mode: z.enum(["automatic", "buyer_review"]),
        starter: z.enum(["buyer", "seller"]),
        buyer_address: z.string().optional().describe("Optional checksummed buyer address for an on-chain fee cross-check."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        return textResult(await quoteFeeTool(args, settings, reader));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "prepare_deal",
    {
      title: "Prepare an unsigned buyer-started deal",
      description:
        "Build two unsigned transactions for a buyer-started deal: a USDC approve and proposeDeal. Returns calldata only. Does not store the manifest, does not hold a key, does not sign, and does not broadcast. Refuses when funding is paused or closed.",
      inputSchema: {
        buyer: z.string().describe("Checksummed buyer address. This wallet would sign. The tool does not sign."),
        seller: z.string().describe("Checksummed seller address, different from the buyer."),
        amount_usdc: z.string(),
        mode: z.enum(["automatic", "buyer_review"]),
        fallback_seller_bps: z.number().int().min(0).max(10_000),
        acceptance_window: z.number().int(),
        delivery_window: z.number().int(),
        decision_window: z.number().int(),
        arbitration_window: z.number().int(),
        manifest: z.string().min(1).max(20_000).describe("Agreed deal text. It is hashed locally and is not stored by this tool."),
        salt: z.string().optional().describe("Optional 0x-prefixed 32-byte salt. A random salt is used when omitted."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        return textResult(await prepareDealTool(args, settings, reader, fetchImpl));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_deal_status",
    {
      title: "Read deal status",
      description:
        "Read deals(bytes32) with eth_call and decode the public deal fields, deadlines and a read-only hint about who can act next. An unknown id returns not_found. Does not sign or send.",
      inputSchema: {
        deal_id: z.string().describe("0x-prefixed 32-byte deal id."),
        escrow: z.enum(["v2", "v1-legacy"]).optional().describe("Defaults to v2. v1-legacy is read-only and only on Arbitrum One."),
        chain: z.enum(["arbitrum-one", "arbitrum-sepolia"]).optional().describe("Must match this process. Defaults to the configured chain."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        return textResult(await getDealStatusTool(args, settings, reader));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerResource(
    "addresses",
    addressesResource.uri,
    {
      title: "AgentSolis addresses",
      description: "Public escrow and USDC addresses for Arbitrum One and the paused Sepolia deployment.",
      mimeType: addressesResource.mimeType,
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: addressesResource.mimeType, text: addressesResource.text }],
    }),
  );

  server.registerResource(
    "rules",
    rulesResource.uri,
    {
      title: "AgentSolis rules",
      description: "Fee, bond, window and limit notes, including what is not done yet.",
      mimeType: rulesResource.mimeType,
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: rulesResource.mimeType, text: rulesResource.text }],
    }),
  );

  return server;
}
