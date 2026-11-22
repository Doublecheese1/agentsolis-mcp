# agentsolis-mcp

A local [Model Context Protocol](https://modelcontextprotocol.io) server for [AgentSolis](https://agentsolis.solists.com.tr), a USDC escrow flow on Arbitrum One.

An agent can try a full escrow deal in a **wallet-free sandbox**, read the public config, quote the protocol fee, build an **unsigned** transaction for a buyer-started deal, and read a deal from the chain. The server does not hold a wallet, does not sign, and does not broadcast. The wallet owner signs on the AgentSolis site or in their own wallet.

AgentSolis never asks for a private key or seed phrase.

The package is on npm as [`agentsolis-mcp`](https://www.npmjs.com/package/agentsolis-mcp) and uses the MIT license.

## Try it with no wallet (2 minutes)

You need Node.js 20 or newer. No wallet, no USDC, no API key, no environment variables.

**1. Add the server to your client.**

Claude Code:

```bash
claude mcp add agentsolis -- npx -y agentsolis-mcp
```

Claude Desktop (`claude_desktop_config.json`) or Cursor (`~/.cursor/mcp.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "agentsolis": {
      "command": "npx",
      "args": ["-y", "agentsolis-mcp"]
    }
  }
}
```

Restart the client after editing the file.

**2. Ask your agent:**

> Use the AgentSolis sandbox tools to create a 25 USDC deal for "Write a 500-word blog post", deliver it, release it, and explain who got paid.

Or pick the `try_sandbox` prompt if your client shows MCP prompts.

**3. What happens.** The agent calls `sandbox_create_deal`, then `sandbox_advance_deal` with `deliver` and `release`. Every reply is labeled `SANDBOX - simulated, no real funds`. Sandbox deals live only in the memory of the running server. Nothing touches a blockchain.

When you want a real deal, `prepare_deal` builds the unsigned transactions and your own wallet signs them.

## What it is not

- It does not store the agreed deal text. The manifest is hashed in this process and returned to you. Keep the text yourself. It is not written on-chain.
- It does not send the deal to the AgentSolis website.
- It does not apply a coupon or a Founding waiver. The unsigned `approve` amount uses the base fee.
- It prepares buyer-started deals only. Seller-started offers are quoted, not built.
- It does not move funds. Funds are locked, then paid out, refunded or split by the agreed rules, only after a wallet signs and the network accepts the transaction.
- It is not a hosted service. This package speaks stdio.
- The sandbox is a simplified simulation. Real deals also have deadlines, fallback splits and Buyer Review arbitration.

## Honest limits (23 Nov 2026)

- Escrow contract: source verified on Arbiscan and Sourcify (14 Nov 2026); no independent review yet.
- There is no production x402 integration.
- No deals have been recorded yet.
- The contract is not upgradeable. Pause stops new deals only. Fee changes wait 48 hours and stay at or below 3% and a 100 USDC cap. The team holds the owner keys. This server does not.

## Install from source

Node.js 20 or newer. Only needed if you want to change the code; otherwise use `npx -y agentsolis-mcp` as above.

```bash
git clone https://github.com/Doublecheese1/agentsolis-mcp.git
cd agentsolis-mcp
npm ci
npm run build
npm test
node dist/index.js
```

No environment variables are required. With nothing set, the server uses Arbitrum One (`https://arb1.arbitrum.io/rpc`) and `https://agentsolis.solists.com.tr/mainnet/config`. It answers `initialize` and `tools/list` before it talks to the network.

Optional public settings, also listed in `.env.example`:

| Variable | Default |
| --- | --- |
| `AGENTSOLIS_RPC_URL` | `https://arb1.arbitrum.io/rpc` |
| `AGENTSOLIS_CHAIN` | `arbitrum-one` (`arbitrum-sepolia` is read-only here) |
| `AGENTSOLIS_CONFIG_URL` | `https://agentsolis.solists.com.tr/mainnet/config` |

The RPC chain id must be 42161 or 421614 and must match `AGENTSOLIS_CHAIN`. Any other chain is refused. `prepare_deal` only builds chain 42161 transactions.

## Claude Desktop or Cursor with a local build

```json
{
  "mcpServers": {
    "agentsolis": {
      "command": "node",
      "args": ["/absolute/path/to/agentsolis-mcp/dist/index.js"]
    }
  }
}
```

## Tools

### Sandbox tools (no wallet, simulated)

All three work offline, keep state only in memory, and label every reply `SANDBOX - simulated, no real funds`.

- `sandbox_create_deal` — inputs: `amount_usdc`, `job_description`, optional `mode` (`automatic` default, or `buyer_review`). Returns a `sandbox-…` deal id in state `funded`, with the job amount, fee and simulated locked deposit, using the same fee math as `quote_fee`.
- `sandbox_advance_deal` — inputs: `deal_id`, `action`. `deliver` (funded → delivered), `release` (delivered → released: seller paid, fee charged), `refund` (funded → refunded: buyer gets everything back, no fee). Each reply lists the allowed next actions.
- `sandbox_get_deal` — input: `deal_id`. Returns state, amounts, payout and history.

Prompt: `try_sandbox` walks through a release and a refund using only the sandbox tools.

### `get_config`

Reads the public config URL and cross-checks `paused`, `publicAccess`, fee bps and the fee cap with `eth_call`. Returns both payloads and a `drift` list when they differ. Does not sign or send.

### `quote_fee`

Input: `amount_usdc` (decimal string), `mode` (`automatic` or `buyer_review`), `starter` (`buyer` or `seller`), optional `buyer_address`.

The fee is 1.5% of the job amount, capped at 50 USDC, using integer division (`amount * 150 / 10000`). The side that starts the deal pays it, and only when the seller is paid. A buyer-started deposit is job + fee (+ Buyer Review reserve). A seller-started payout is job − fee. Buyer Review adds a 5% reserve and an equal seller bond, minimum 5 USDC, maximum 100 USDC. That bond is included in `buyer_deposit` for a buyer-started review deal and is also returned as `review_bond_each_side`.

Published examples, with the fee, the buyer-started deposit **before** any review bond, and the seller-started payout:

| Job | Fee | Buyer deposit (no bond) | Seller receives if seller starts | Review bond |
| --- | --- | --- | --- | --- |
| 10 | 0.15 | 10.15 | 9.85 | — |
| 100 | 1.50 | 101.50 | 98.50 | 5 |
| 1,000 | 15.00 | 1,015.00 | 985.00 | 50 |
| 5,000 | 50.00 (cap) | 5,050.00 | 4,950.00 | 100 |

The tool returns ungrouped decimals (`1015.00`, not `1,015.00`). A 100 USDC buyer-started Buyer Review deposit is 106.50: 100 + 1.50 fee + 5 reserve. Automatic minimum is 10 USDC. Buyer Review minimum is 100 USDC.

Every quote includes: `plus Arbitrum gas in ETH; no fee on refund/cancel/expiry/buyer win/fallback split`.

If `buyer_address` is set, the tool also calls `protocolFeeFor(buyer, amount)` and `arbitrationReserveFor(amount)`. On the current contract those views follow the posted fee and the reserve formula. They do not apply a per-wallet waiver. A difference is flagged and, for `prepare_deal`, blocks the unsigned transaction.

### `prepare_deal`

Buyer-started deals only. Inputs are checksummed `buyer` and `seller` (different addresses), `amount_usdc`, `mode`, `fallback_seller_bps`, four windows in seconds, the `manifest` text, and an optional `salt` (`0x` plus 32 bytes; otherwise random).

Windows follow the contract: 10 minutes through 30 days. Automatic deals need a decision window of at least 1 day and a seller fallback of at least 50%. Buyer Review needs a decision window of at least 2 days and an arbitration window of at least 7 days.

Output includes `deal_id`, `manifest_hash` (keccak256 of the manifest text), `policy_hash` from the live config, unit amounts, and two unsigned transactions `{chainId, to, data, value: "0"}`:

1. USDC `approve(escrow, buyer_total)`
2. `proposeDeal(tuple)`

The deal id is `keccak256(abi.encode(escrow, chainId, buyer, seller, salt))`.

The tool refuses when the live config is paused, not accepting funds, or closed to public access, and when the config addresses do not match the published Arbitrum One escrow `0xFc68976229c3dc839346731275Eebe05bE9911c0` and native USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`.

A 64-character hex string, or a 12-word or 24-word phrase, is rejected. Do not paste a key or a seed. Nothing is sent.

Warning returned with every prepared deal: `Nothing was sent. Your wallet signs. Check chain 42161 and the escrow address. Keep the manifest text; it is not stored on-chain.`

### `get_deal_status`

Input: `deal_id` (`0x` plus 32 bytes). Optional `escrow`: `v2` (default) or `v1-legacy` (Arbitrum One read-only, `0x32C650445354f458e8F8B420C27Bb8113AdE5e22`). Optional `chain`, which must match the running process.

Reads `deals(bytes32)` with `eth_call`. Returns the mode, state, parties, amounts, deadlines (Unix and ISO UTC), the observed block, chain time, and a read-only hint such as `after delivery_deadline anyone may call expireUndelivered`. An unknown id returns `not_found`. It does not sign or send.

## Resources

- `agentsolis://addresses` — escrow and USDC addresses, with mainnet and the paused Sepolia deployment labeled separately.
- `agentsolis://rules` — modes, fee, bond, limits, and the honest "not done" list.

## Prompts

- `try_sandbox` — a guided, wallet-free walkthrough of the sandbox tools.

## Links

- Wallet-free demo: https://agentsolis.solists.com.tr/play
- Live config: https://agentsolis.solists.com.tr/mainnet/config

## Tests

```bash
npm ci && npm run build && npm test
```

`LIVE_READONLY=1 npm test` also performs a read-only `eth_call` against Arbitrum One: config cross-check, and `get_deal_status` on a random id (expected `not_found`). It does not send a transaction.
