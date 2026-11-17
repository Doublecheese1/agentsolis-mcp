import { formatUsdc } from "./money.js";

export const STATE_NAMES = [
  "NONE",
  "PROPOSED",
  "LOCKED",
  "DELIVERED",
  "DISPUTED",
  "PAID",
  "REFUNDED",
  "FINALIZED_SPLIT",
] as const;

export type DealView = {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  resolver: `0x${string}`;
  mode: number;
  state: number;
  amount: bigint;
  arbitrationReserve: bigint;
  sellerBond: bigint;
  protocolFee: bigint;
  fallbackSellerBps: number;
  manifestHash: `0x${string}`;
  policyHash: `0x${string}`;
  contentHash: `0x${string}`;
  acceptanceDeadline: bigint;
  deliveryWindow: bigint;
  decisionWindow: bigint;
  arbitrationWindow: bigint;
  deliveryDeadline: bigint;
  decisionDeadline: bigint;
  arbitrationDeadline: bigint;
  validationNonce: bigint;
  feeRecipient?: `0x${string}`;
  feePayer?: "buyer" | "seller";
};

export function nextAction(deal: Pick<DealView, "state" | "mode" | "acceptanceDeadline" | "deliveryDeadline" | "decisionDeadline" | "arbitrationDeadline">, chainTime: bigint): string {
  const state = deal.state;
  const review = deal.mode === 1;
  if (state === 1) {
    if (chainTime >= deal.acceptanceDeadline) return "after acceptance_deadline anyone may call expireProposal";
    return "seller may call sellerAccept before acceptance_deadline; buyer may call cancelProposal";
  }
  if (state === 2) {
    if (chainTime >= deal.deliveryDeadline) return "after delivery_deadline anyone may call expireUndelivered";
    return "seller may call deliver before delivery_deadline";
  }
  if (state === 3 && !review) {
    if (chainTime >= deal.decisionDeadline) return "after decision_deadline anyone may call finalizeUnresolvedAutomatic";
    return "before decision_deadline anyone may relay submitValidation";
  }
  if (state === 3 && review) {
    if (chainTime >= deal.decisionDeadline) return "after decision_deadline anyone may call finalizeIfSilent";
    return "buyer may call acceptDelivery or disputeDelivery before decision_deadline";
  }
  if (state === 4) {
    if (chainTime >= deal.arbitrationDeadline) return "after arbitration_deadline anyone may call finalizeUnresolvedReview";
    return "the assigned resolver may call resolveReview before arbitration_deadline";
  }
  if (state === 5) return "deal is paid; no further escrow call";
  if (state === 6) return "deal is refunded; no further escrow call";
  if (state === 7) return "deal is split by the fallback rule; no further escrow call";
  return "no further escrow call";
}

function stamp(unix: bigint): { unix: string; iso: string | null } {
  if (unix === 0n) return { unix: "0", iso: null };
  return { unix: unix.toString(), iso: new Date(Number(unix) * 1000).toISOString() };
}

export function presentDeal(deal: DealView, chainTime: bigint) {
  const stateName = STATE_NAMES[deal.state] ?? `STATE_${deal.state}`;
  return {
    mode: deal.mode === 0 ? "AUTOMATIC" : deal.mode === 1 ? "BUYER_REVIEW" : `MODE_${deal.mode}`,
    mode_index: deal.mode,
    state: stateName,
    state_index: deal.state,
    buyer: deal.buyer,
    seller: deal.seller,
    resolver: deal.resolver,
    amount_units: deal.amount.toString(),
    amount_usdc: formatUsdc(deal.amount),
    arbitration_reserve_units: deal.arbitrationReserve.toString(),
    seller_bond_units: deal.sellerBond.toString(),
    protocol_fee_units: deal.protocolFee.toString(),
    fallback_seller_bps: deal.fallbackSellerBps,
    manifest_hash: deal.manifestHash,
    policy_hash: deal.policyHash,
    content_hash: deal.contentHash,
    acceptance_deadline: stamp(deal.acceptanceDeadline),
    delivery_window_seconds: deal.deliveryWindow.toString(),
    decision_window_seconds: deal.decisionWindow.toString(),
    arbitration_window_seconds: deal.arbitrationWindow.toString(),
    delivery_deadline: stamp(deal.deliveryDeadline),
    decision_deadline: stamp(deal.decisionDeadline),
    arbitration_deadline: stamp(deal.arbitrationDeadline),
    validation_nonce: deal.validationNonce.toString(),
    fee_recipient: deal.feeRecipient ?? null,
    fee_payer: deal.feePayer ?? null,
    next_action: nextAction(deal, chainTime),
  };
}
