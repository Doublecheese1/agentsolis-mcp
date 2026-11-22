import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { createEscrowReader, type EscrowReader } from "./chain.js";
import { addressesResource, rulesResource } from "./resources.js";
import { SANDBOX_LABEL, SandboxStore } from "./sandbox.js";
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
  "To try the flow with no wallet and no USDC, start with the sandbox_* tools; they are simulated in memory and never touch a blockchain.",
  "It never holds a private key or seed phrase, never signs, and never broadcasts.",
  "The wallet owner signs. Funds are locked, then paid out, refunded or split by the agreed rules.",
  "Escrow contract: source verified on Arbiscan and Sourcify (14 Nov 2026); no independent review yet. No deals recorded yet.",
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
  sandbox?: SandboxStore;
};

export function createAgentServer(deps: ServerDeps = {}): McpServer {
  const settings = deps.settings ?? loadSettings();
  const reader = deps.reader ?? createEscrowReader(settings);
  const fetchImpl = deps.fetchImpl;
  const sandbox = deps.sandbox ?? new SandboxStore();
  const server = new McpServer({ name: "agentsolis", version: "0.2.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "get_config",
    {
      title: "Get AgentSolis config",
      description:
        "Check whether AgentSolis is open for real deals. Use before prepare_deal. Reads the public config and the contract (paused, public access, fee) and lists any drift between them. No inputs. Read-only.",
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
        "Work out what a deal costs. Use when someone asks about fees or deposits. Returns the fee (1.5% of the job, max 50 USDC), buyer deposit, seller payout and Buyer Review bond. Example: amount_usdc '100', mode 'automatic', starter 'buyer' gives fee 1.50 and deposit 101.50. Read-only.",
      inputSchema: {
        amount_usdc: z.string().describe("Job amount in USDC, e.g. '100' or '12.5'. Automatic min 10, Buyer Review min 100."),
        mode: z.enum(["automatic", "buyer_review"]).describe("automatic: seller is paid unless the buyer objects in time. buyer_review: buyer approves, with a bond each side."),
        starter: z.enum(["buyer", "seller"]).describe("Who starts the deal. The starter pays the fee."),
        buyer_address: z.string().optional().describe("Optional buyer address. If set, the fee is also checked against the contract."),
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
        "Build a real, unsigned buyer-started deal on Arbitrum One: a USDC approve and a proposeDeal transaction for the buyer's wallet to sign. Use only when the user wants a real deal; to just try the flow, use sandbox_create_deal. Nothing is signed or sent. Refuses when funding is paused or closed.",
      inputSchema: {
        buyer: z.string().describe("Checksummed buyer address. This wallet would sign. The tool does not sign."),
        seller: z.string().describe("Checksummed seller address, different from the buyer."),
        amount_usdc: z.string().describe("Job amount in USDC, e.g. '100'."),
        mode: z.enum(["automatic", "buyer_review"]),
        fallback_seller_bps: z.number().int().min(0).max(10_000).describe("Seller share if the deal falls back, in basis points. 5000 = 50%. Automatic needs at least 5000."),
        acceptance_window: z.number().int().describe("Seconds the seller has to accept. 600 to 2592000."),
        delivery_window: z.number().int().describe("Seconds the seller has to deliver. 600 to 2592000."),
        decision_window: z.number().int().describe("Seconds the buyer has to decide. Automatic at least 86400, Buyer Review at least 172800."),
        arbitration_window: z.number().int().describe("Seconds for arbitration. Buyer Review at least 604800."),
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
        "Look up a real on-chain deal by its 0x deal id. Returns state, parties, amounts, deadlines and who can act next. An unknown id returns not_found. Not for sandbox ids; use sandbox_get_deal for those. Read-only.",
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

  server.registerTool(
    "sandbox_create_deal",
    {
      title: "Sandbox: create a simulated deal (no wallet)",
      description:
        "Try AgentSolis with no wallet and no USDC. Creates a simulated, already-funded deal in memory and returns a sandbox deal id. Use this first when someone wants to see how the escrow flow works. Example: amount_usdc '25', job_description 'Write a 500-word blog post'. SANDBOX - simulated, no real funds.",
      inputSchema: {
        amount_usdc: z.string().describe("Pretend job amount in USDC, e.g. '25'. Automatic min 10, Buyer Review min 100."),
        job_description: z.string().min(1).max(2000).describe("Short description of the pretend job."),
        mode: z.enum(["automatic", "buyer_review"]).optional().describe("Defaults to automatic."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return textResult(sandbox.create(args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "sandbox_advance_deal",
    {
      title: "Sandbox: move a simulated deal forward",
      description:
        "Move a sandbox deal to its next step. Actions: 'deliver' (seller delivers), 'release' (buyer pays the seller, fee charged), 'refund' (before delivery; buyer gets everything back, no fee). The reply lists the allowed next actions. SANDBOX - simulated, no real funds.",
      inputSchema: {
        deal_id: z.string().describe("Sandbox deal id from sandbox_create_deal, e.g. 'sandbox-1a2b3c4d5e6f'."),
        action: z.enum(["deliver", "release", "refund"]),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return textResult(sandbox.advance(args.deal_id, args.action));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "sandbox_get_deal",
    {
      title: "Sandbox: read a simulated deal",
      description:
        "Read a sandbox deal: state, amounts, payout, history and allowed next actions. Sandbox deals live only while this server runs. SANDBOX - simulated, no real funds.",
      inputSchema: {
        deal_id: z.string().describe("Sandbox deal id from sandbox_create_deal."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return textResult(sandbox.get(args.deal_id));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerPrompt(
    "try_sandbox",
    {
      title: "Try AgentSolis with no wallet",
      description: `Walk through a full simulated escrow deal in two minutes. ${SANDBOX_LABEL}.`,
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Show me how AgentSolis escrow works using only the sandbox tools. Nothing real should happen.",
              "1. Call sandbox_create_deal with amount_usdc '25' and job_description 'Write a 500-word blog post'.",
              "2. Call sandbox_advance_deal with action 'deliver', then with action 'release'.",
              "3. Explain in plain words what was locked, who got paid, and what the fee was.",
              "4. Then create a second sandbox deal and use action 'refund' to show the refund path.",
              "Finish by noting that a real deal uses prepare_deal and the user's own wallet signs.",
            ].join("\n"),
          },
        },
      ],
    }),
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
