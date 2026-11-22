/**
 * Wallet-free sandbox. Everything here is simulated in this process's memory.
 * It never reads or writes a blockchain, never uses a wallet, key or USDC,
 * and never calls the network. Data is lost when the process stops.
 */

import { randomBytes } from "node:crypto";

import { quoteFee, type Mode } from "./fee.js";
import { rejectKeyMaterial } from "./guard.js";
import { formatUsdc } from "./money.js";

export const SANDBOX_LABEL = "SANDBOX - simulated, no real funds";

export const SANDBOX_NOTE =
  "Nothing touched a blockchain. No wallet, key or USDC was used. This is a simplified flow: real deals also have deadlines, fallback splits and Buyer Review arbitration (see agentsolis://rules). For a real deal, use prepare_deal; a wallet owner signs.";

export const SANDBOX_MAX_DEALS = 50;

export type SandboxState = "funded" | "delivered" | "released" | "refunded";
export type SandboxAction = "deliver" | "release" | "refund";

type HistoryItem = { step: string; at: string };

type SandboxDeal = {
  deal_id: string;
  mode: Mode;
  job_description: string;
  state: SandboxState;
  amount_usdc: string;
  fee: string;
  review_reserve: string;
  buyer_locked: string;
  history: HistoryItem[];
  payout?: Record<string, string>;
};

const NEXT: Record<SandboxState, SandboxAction[]> = {
  funded: ["deliver", "refund"],
  delivered: ["release"],
  released: [],
  refunded: [],
};

const HINT: Record<SandboxState, string> = {
  funded:
    "Simulated USDC is locked. Next: call sandbox_advance_deal with action 'deliver' (seller delivers) or 'refund' (buyer gets everything back, no fee).",
  delivered: "The seller marked the job delivered. Next: call sandbox_advance_deal with action 'release' to pay the seller.",
  released: "Done. The seller was paid and the protocol fee was charged, all simulated. Try prepare_deal to see a real unsigned transaction.",
  refunded: "Done. The buyer got the full deposit back and no fee was charged, all simulated.",
};

function addUnits(...values: string[]): string {
  return formatUsdc(values.reduce((sum, value) => sum + BigInt(value), 0n));
}

export class SandboxStore {
  private readonly deals = new Map<string, SandboxDeal & { units: Record<string, string> }>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  create(input: { amount_usdc: string; mode?: Mode; job_description: string }) {
    rejectKeyMaterial(input);
    const job = (input.job_description ?? "").trim();
    if (!job) throw new Error("job_description is required. Example: 'Translate a 300-word product page to Spanish.'");
    if (job.length > 2000) throw new Error("job_description must be 2000 characters or fewer.");
    const mode: Mode = input.mode ?? "automatic";
    const quote = quoteFee({ amount_usdc: input.amount_usdc, mode, starter: "buyer" });
    const reserveUnits = quote.review_bond_each_side_units ?? "0";

    if (this.deals.size >= SANDBOX_MAX_DEALS) {
      const oldest = this.deals.keys().next().value;
      if (oldest !== undefined) this.deals.delete(oldest);
    }

    const deal_id = `sandbox-${randomBytes(6).toString("hex")}`;
    const deal = {
      deal_id,
      mode,
      job_description: job,
      state: "funded" as SandboxState,
      amount_usdc: quote.amount_usdc,
      fee: quote.fee,
      review_reserve: addUnits(reserveUnits),
      buyer_locked: quote.buyer_deposit,
      history: [{ step: "created and funded (simulated)", at: this.now().toISOString() }],
      units: { amount: quote.amount_units, fee: quote.fee_units, reserve: reserveUnits },
    };
    this.deals.set(deal_id, deal);
    return this.view(deal);
  }

  get(dealId: string) {
    return this.view(this.find(dealId));
  }

  advance(dealId: string, action: SandboxAction) {
    const deal = this.find(dealId);
    const allowed = NEXT[deal.state];
    if (!allowed.includes(action)) {
      const options = allowed.length ? allowed.join(" or ") : "nothing, the deal is finished";
      throw new Error(`${SANDBOX_LABEL}: cannot '${action}' a ${deal.state} deal. Allowed now: ${options}.`);
    }
    const at = this.now().toISOString();
    if (action === "deliver") {
      deal.state = "delivered";
      deal.history.push({ step: "seller marked delivered (simulated)", at });
    } else if (action === "release") {
      deal.state = "released";
      deal.payout = {
        seller_received: addUnits(deal.units.amount),
        protocol_fee: addUnits(deal.units.fee),
        returned_to_buyer: addUnits(deal.units.reserve),
      };
      deal.history.push({ step: "buyer released payment to seller (simulated)", at });
    } else {
      deal.state = "refunded";
      deal.payout = {
        seller_received: "0.00",
        protocol_fee: "0.00",
        returned_to_buyer: addUnits(deal.units.amount, deal.units.fee, deal.units.reserve),
      };
      deal.history.push({ step: "refunded to buyer (simulated)", at });
    }
    return this.view(deal);
  }

  private find(dealId: string) {
    rejectKeyMaterial(dealId, "sandbox_deal_id");
    const deal = this.deals.get(String(dealId ?? "").trim());
    if (!deal) {
      throw new Error(
        `${SANDBOX_LABEL}: no sandbox deal with id '${dealId}'. Sandbox deals live only in this server process. Create one with sandbox_create_deal.`,
      );
    }
    return deal;
  }

  private view(deal: SandboxDeal & { units: Record<string, string> }) {
    return {
      sandbox: true,
      label: SANDBOX_LABEL,
      deal_id: deal.deal_id,
      state: deal.state,
      mode: deal.mode,
      job_description: deal.job_description,
      buyer: "demo-buyer (simulated)",
      seller: "demo-seller (simulated)",
      amounts_usdc: {
        job: deal.amount_usdc,
        protocol_fee_if_seller_paid: deal.fee,
        review_reserve: deal.review_reserve,
        buyer_locked: deal.buyer_locked,
      },
      ...(deal.payout ? { payout_usdc: deal.payout } : {}),
      allowed_actions: NEXT[deal.state],
      next: HINT[deal.state],
      history: deal.history,
      note: SANDBOX_NOTE,
    };
  }
}
