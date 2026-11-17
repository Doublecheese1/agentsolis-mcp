import { createPublicClient, getAddress, http, type Address, type Hex, type PublicClient } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";

import { dealsAbiV1, dealsAbiV2, viewAbi } from "./abi.js";
import { CHAIN_ARBITRUM_ONE, CHAIN_ARBITRUM_SEPOLIA } from "./constants.js";
import type { DealView } from "./status.js";
import type { Settings } from "./settings.js";

export type ChainBlock = { number: bigint; timestamp: bigint };

export interface EscrowReader {
  assertChain(): Promise<void>;
  getBlock(): Promise<ChainBlock>;
  hasCode(escrow: Address): Promise<boolean>;
  paused(escrow: Address, blockNumber: bigint): Promise<boolean>;
  publicAccess(escrow: Address, blockNumber: bigint): Promise<boolean>;
  feeBps(escrow: Address, blockNumber: bigint): Promise<number>;
  feeCap(escrow: Address, blockNumber: bigint): Promise<bigint>;
  protocolFeeFor(escrow: Address, buyer: Address, amount: bigint, blockNumber: bigint): Promise<bigint>;
  arbitrationReserveFor(escrow: Address, amount: bigint, blockNumber: bigint): Promise<bigint>;
  readDeal(escrow: Address, dealId: Hex, blockNumber: bigint, version: "v2" | "v1"): Promise<DealView | null>;
}

function asBigint(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  throw new Error(`Unexpected ${label} from the chain read.`);
}

function asAddress(value: unknown): Address {
  if (typeof value !== "string") throw new Error("Unexpected address from the chain read.");
  return getAddress(value);
}

function asHex(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("Unexpected bytes32 from the chain read.");
  }
  return value as Hex;
}

const DEAL_FIELDS = [
  "buyer",
  "seller",
  "resolver",
  "mode",
  "state",
  "amount",
  "arbitrationReserve",
  "sellerBond",
  "protocolFee",
  "fallbackSellerBps",
  "manifestHash",
  "policyHash",
  "contentHash",
  "acceptanceDeadline",
  "deliveryWindow",
  "decisionWindow",
  "arbitrationWindow",
  "deliveryDeadline",
  "decisionDeadline",
  "arbitrationDeadline",
  "validationNonce",
  "feeRecipient",
] as const;

type DealTuple = Record<(typeof DEAL_FIELDS)[number], unknown>;

export function mapDeal(raw: unknown): DealTuple {
  if (!raw || typeof raw !== "object") throw new Error("Unexpected deal tuple from the chain read.");
  const source = raw as Record<string, unknown>;
  const tuple: Partial<DealTuple> = {};
  for (const [index, name] of DEAL_FIELDS.entries()) {
    tuple[name] = source[name] !== undefined ? source[name] : source[index];
  }
  return tuple as DealTuple;
}

function toDeal(raw: DealTuple, feePayer?: "buyer" | "seller"): DealView {
  const state = Number(raw.state);
  return {
    buyer: asAddress(raw.buyer),
    seller: asAddress(raw.seller),
    resolver: asAddress(raw.resolver),
    mode: Number(raw.mode),
    state,
    amount: asBigint(raw.amount, "amount"),
    arbitrationReserve: asBigint(raw.arbitrationReserve, "reserve"),
    sellerBond: asBigint(raw.sellerBond, "bond"),
    protocolFee: asBigint(raw.protocolFee, "fee"),
    fallbackSellerBps: Number(raw.fallbackSellerBps),
    manifestHash: asHex(raw.manifestHash),
    policyHash: asHex(raw.policyHash),
    contentHash: asHex(raw.contentHash),
    acceptanceDeadline: asBigint(raw.acceptanceDeadline, "deadline"),
    deliveryWindow: asBigint(raw.deliveryWindow, "window"),
    decisionWindow: asBigint(raw.decisionWindow, "window"),
    arbitrationWindow: asBigint(raw.arbitrationWindow, "window"),
    deliveryDeadline: asBigint(raw.deliveryDeadline, "deadline"),
    decisionDeadline: asBigint(raw.decisionDeadline, "deadline"),
    arbitrationDeadline: asBigint(raw.arbitrationDeadline, "deadline"),
    validationNonce: asBigint(raw.validationNonce, "nonce"),
    feeRecipient: raw.feeRecipient ? asAddress(raw.feeRecipient) : undefined,
    feePayer,
  };
}

export function createEscrowReader(settings: Pick<Settings, "rpcUrl" | "chainId">, client?: PublicClient): EscrowReader {
  const chain = settings.chainId === CHAIN_ARBITRUM_ONE ? arbitrum : arbitrumSepolia;
  if (settings.chainId !== CHAIN_ARBITRUM_ONE && settings.chainId !== CHAIN_ARBITRUM_SEPOLIA) {
    throw new Error(`Chain id ${settings.chainId} is not an allowed AgentSolis chain.`);
  }
  const publicClient = client ?? createPublicClient({ chain, transport: http(settings.rpcUrl) });
  return {
    async assertChain() {
      const reported = await publicClient.getChainId();
      if (reported !== settings.chainId) {
        throw new Error(
          `RPC reported chain id ${reported}. This server is configured for ${settings.chainId} and will not continue.`,
        );
      }
      if (reported !== CHAIN_ARBITRUM_ONE && reported !== CHAIN_ARBITRUM_SEPOLIA) {
        throw new Error(`Chain id ${reported} is not an allowed AgentSolis chain.`);
      }
    },
    async getBlock() {
      const block = await publicClient.getBlock();
      if (block.number === null) throw new Error("The RPC did not return a block number.");
      return { number: block.number, timestamp: block.timestamp };
    },
    async hasCode(escrow) {
      const code = await publicClient.getCode({ address: escrow });
      return Boolean(code && code !== "0x");
    },
    async paused(escrow, blockNumber) {
      return publicClient.readContract({
        address: escrow,
        abi: viewAbi,
        functionName: "paused",
        blockNumber,
      });
    },
    async publicAccess(escrow, blockNumber) {
      return publicClient.readContract({
        address: escrow,
        abi: viewAbi,
        functionName: "publicAccess",
        blockNumber,
      });
    },
    async feeBps(escrow, blockNumber) {
      const value = await publicClient.readContract({
        address: escrow,
        abi: viewAbi,
        functionName: "feeBps",
        blockNumber,
      });
      return Number(value);
    },
    async feeCap(escrow, blockNumber) {
      const value = await publicClient.readContract({
        address: escrow,
        abi: viewAbi,
        functionName: "feeCap",
        blockNumber,
      });
      return asBigint(value, "fee cap");
    },
    async protocolFeeFor(escrow, buyer, amount, blockNumber) {
      const value = await publicClient.readContract({
        address: escrow,
        abi: viewAbi,
        functionName: "protocolFeeFor",
        args: [buyer, amount],
        blockNumber,
      });
      return asBigint(value, "protocol fee");
    },
    async arbitrationReserveFor(escrow, amount, blockNumber) {
      const value = await publicClient.readContract({
        address: escrow,
        abi: viewAbi,
        functionName: "arbitrationReserveFor",
        args: [amount],
        blockNumber,
      });
      return asBigint(value, "reserve");
    },
    async readDeal(escrow, dealId, blockNumber, version) {
      const abi = version === "v2" ? dealsAbiV2 : dealsAbiV1;
      const raw = await publicClient.readContract({
        address: escrow,
        abi,
        functionName: "deals",
        args: [dealId],
        blockNumber,
      });
      const deal = mapDeal(raw);
      if (Number(deal.state) === 0) return null;
      let feePayer: "buyer" | "seller" | undefined;
      if (version === "v2") {
        const sellerPays = await publicClient.readContract({
          address: escrow,
          abi: viewAbi,
          functionName: "sellerPaysFee",
          args: [dealId],
          blockNumber,
        });
        feePayer = sellerPays ? "seller" : "buyer";
      }
      return toDeal(deal, feePayer);
    },
  };
}
