/**
 * Public function ABI fragments needed to encode and decode read-only calls.
 * No bytecode and no Solidity source.
 */

export const approveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const proposeDealAbi = [
  {
    type: "function",
    name: "proposeDeal",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "salt", type: "bytes32" },
          { name: "seller", type: "address" },
          { name: "mode", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "arbitrationReserve", type: "uint256" },
          { name: "fallbackSellerBps", type: "uint16" },
          { name: "manifestHash", type: "bytes32" },
          { name: "policyHash", type: "bytes32" },
          { name: "acceptanceWindow", type: "uint256" },
          { name: "deliveryWindow", type: "uint256" },
          { name: "decisionWindow", type: "uint256" },
          { name: "arbitrationWindow", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "id", type: "bytes32" }],
  },
] as const;

const dealFields = [
  { name: "buyer", type: "address" },
  { name: "seller", type: "address" },
  { name: "resolver", type: "address" },
  { name: "mode", type: "uint8" },
  { name: "state", type: "uint8" },
  { name: "amount", type: "uint256" },
  { name: "arbitrationReserve", type: "uint256" },
  { name: "sellerBond", type: "uint256" },
  { name: "protocolFee", type: "uint256" },
  { name: "fallbackSellerBps", type: "uint16" },
  { name: "manifestHash", type: "bytes32" },
  { name: "policyHash", type: "bytes32" },
  { name: "contentHash", type: "bytes32" },
  { name: "acceptanceDeadline", type: "uint256" },
  { name: "deliveryWindow", type: "uint256" },
  { name: "decisionWindow", type: "uint256" },
  { name: "arbitrationWindow", type: "uint256" },
  { name: "deliveryDeadline", type: "uint256" },
  { name: "decisionDeadline", type: "uint256" },
  { name: "arbitrationDeadline", type: "uint256" },
  { name: "validationNonce", type: "uint256" },
] as const;

export const dealsAbiV1 = [
  {
    type: "function",
    name: "deals",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [...dealFields],
  },
] as const;

export const dealsAbiV2 = [
  {
    type: "function",
    name: "deals",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [...dealFields, { name: "feeRecipient", type: "address" }],
  },
] as const;

export const viewAbi = [
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "publicAccess",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "feeCap",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "protocolFeeFor",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "arbitrationReserveFor",
    stateMutability: "pure",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "sellerPaysFee",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
