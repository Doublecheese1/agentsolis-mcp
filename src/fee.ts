/**
 * Integer fee math matching fee_math.py and the v2 escrow.
 * Fee = amount * 150 / 10000, capped at 50 USDC.
 * Buyer Review reserve = amount * 500 / 10000, minimum 5 USDC, maximum 100 USDC.
 * Division truncates toward zero, the same way as Solidity and Python //.
 */

import { FEE_NOTE } from "./constants.js";
import { rejectKeyMaterial } from "./guard.js";
import { formatUsdc, parseUsdc } from "./money.js";

export const FEE_BPS = 150n;
export const BPS_DENOMINATOR = 10_000n;
export const MAX_PROTOCOL_FEE_UNITS = 50_000_000n;
export const MIN_AUTOMATIC_UNITS = 10_000_000n;
export const MIN_REVIEW_UNITS = 100_000_000n;
export const MIN_RESERVE_UNITS = 5_000_000n;
export const MAX_RESERVE_UNITS = 100_000_000n;

export type Mode = "automatic" | "buyer_review";
export type Starter = "buyer" | "seller";

export function protocolFeeUnits(amountUnits: bigint): bigint {
  if (amountUnits < 0n) throw new Error("amount");
  const fee = (amountUnits * FEE_BPS) / BPS_DENOMINATOR;
  return fee > MAX_PROTOCOL_FEE_UNITS ? MAX_PROTOCOL_FEE_UNITS : fee;
}

export function arbitrationReserveUnits(amountUnits: bigint): bigint {
  let reserve = (amountUnits * 500n) / BPS_DENOMINATOR;
  if (reserve < MIN_RESERVE_UNITS) reserve = MIN_RESERVE_UNITS;
  if (reserve > MAX_RESERVE_UNITS) reserve = MAX_RESERVE_UNITS;
  return reserve;
}

export function assertMinimum(amountUnits: bigint, mode: Mode): void {
  if (mode === "automatic" && amountUnits < MIN_AUTOMATIC_UNITS) {
    throw new Error(`${formatUsdc(amountUnits)} USDC is below the 10 USDC minimum for an automatic deal.`);
  }
  if (mode === "buyer_review" && amountUnits < MIN_REVIEW_UNITS) {
    throw new Error(`${formatUsdc(amountUnits)} USDC is below the 100 USDC minimum for a buyer review deal.`);
  }
}

export type FeeQuote = {
  amount_usdc: string;
  amount_units: string;
  mode: Mode;
  starter: Starter;
  fee: string;
  fee_units: string;
  fee_capped: boolean;
  buyer_deposit: string;
  buyer_deposit_units: string;
  seller_receives: string;
  seller_receives_units: string;
  review_bond_each_side?: string;
  review_bond_each_side_units?: string;
  minimum_usdc: string;
  minimum_ok: true;
  note: string;
};

export function quoteFee(input: { amount_usdc: string; mode: Mode; starter: Starter }): FeeQuote {
  rejectKeyMaterial(input);
  if (input.mode !== "automatic" && input.mode !== "buyer_review") {
    throw new Error("mode must be automatic or buyer_review.");
  }
  if (input.starter !== "buyer" && input.starter !== "seller") {
    throw new Error("starter must be buyer or seller.");
  }
  const amount = parseUsdc(input.amount_usdc);
  assertMinimum(amount, input.mode);
  const fee = protocolFeeUnits(amount);
  const reserve = input.mode === "buyer_review" ? arbitrationReserveUnits(amount) : 0n;
  const buyerPays = input.starter === "buyer";
  const buyerDeposit = amount + reserve + (buyerPays ? fee : 0n);
  const sellerReceives = amount - (buyerPays ? 0n : fee);
  const quote: FeeQuote = {
    amount_usdc: formatUsdc(amount),
    amount_units: amount.toString(),
    mode: input.mode,
    starter: input.starter,
    fee: formatUsdc(fee),
    fee_units: fee.toString(),
    fee_capped: (amount * FEE_BPS) / BPS_DENOMINATOR > MAX_PROTOCOL_FEE_UNITS,
    buyer_deposit: formatUsdc(buyerDeposit),
    buyer_deposit_units: buyerDeposit.toString(),
    seller_receives: formatUsdc(sellerReceives),
    seller_receives_units: sellerReceives.toString(),
    minimum_usdc: input.mode === "automatic" ? "10.00" : "100.00",
    minimum_ok: true,
    note: FEE_NOTE,
  };
  if (input.mode === "buyer_review") {
    quote.review_bond_each_side = formatUsdc(reserve);
    quote.review_bond_each_side_units = reserve.toString();
  }
  return quote;
}
