#!/usr/bin/env python3
"""Generate the deal-id fixture with the same encoding as mainnet.py.

No network. Requires the repo's web3 and eth_abi packages:

    python packages/agentsolis-mcp/scripts/generate_deal_id_fixture.py

Deal id = keccak256(abi.encode(address escrow, uint256 chainId, address buyer,
address seller, bytes32 salt)), matching mainnet._prepare_proposal.
Manifest hash = keccak256(utf-8 text), matching Web3.keccak(text=...).
"""
from __future__ import annotations

import json
from pathlib import Path

from eth_abi import encode
from web3 import Web3

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "deal-id.json"

ESCROW = "0xFc68976229c3dc839346731275Eebe05bE9911c0"
USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
CHAIN_ID = 42161
BUYER = Web3.to_checksum_address("0x1111111111111111111111111111111111111111")
SELLER = Web3.to_checksum_address("0x2222222222222222222222222222222222222222")
SALT = bytes.fromhex("11" * 32)
MANIFEST = "Agreed job text for the fixture."
POLICY = bytes.fromhex("aa" * 32)
AMOUNT = 10_000_000
RESERVE = 0
FEE = AMOUNT * 150 // 10_000
TOTAL = AMOUNT + RESERVE + FEE
FALLBACK = 5000
WINDOWS = (3600, 86400, 86400, 86400)


def main() -> None:
    manifest_hash = Web3.keccak(text=MANIFEST)
    deal_id = Web3.keccak(
        encode(
            ["address", "uint256", "address", "address", "bytes32"],
            [ESCROW, CHAIN_ID, BUYER, SELLER, SALT],
        )
    )
    approve_selector = Web3.keccak(text="approve(address,uint256)")[:4]
    approve_data = approve_selector + encode(["address", "uint256"], [ESCROW, TOTAL])
    request_types = "(bytes32,address,uint8,uint256,uint256,uint16,bytes32,bytes32,uint256,uint256,uint256,uint256)"
    propose_selector = Web3.keccak(text=f"proposeDeal({request_types})")[:4]
    request = (
        SALT,
        SELLER,
        0,
        AMOUNT,
        RESERVE,
        FALLBACK,
        manifest_hash,
        POLICY,
        *WINDOWS,
    )
    propose_data = propose_selector + encode([request_types], [request])
    payload = {
        "escrow": ESCROW,
        "usdc": USDC_ADDRESS,
        "chain_id": CHAIN_ID,
        "buyer": BUYER,
        "seller": SELLER,
        "salt": "0x" + SALT.hex(),
        "manifest": MANIFEST,
        "policy_hash": "0x" + POLICY.hex(),
        "mode": "automatic",
        "amount_usdc": "10",
        "amount_units": AMOUNT,
        "reserve_units": RESERVE,
        "protocol_fee_units": FEE,
        "buyer_total_units": TOTAL,
        "fallback_seller_bps": FALLBACK,
        "acceptance_window": WINDOWS[0],
        "delivery_window": WINDOWS[1],
        "decision_window": WINDOWS[2],
        "arbitration_window": WINDOWS[3],
        "manifest_hash": Web3.to_hex(manifest_hash),
        "deal_id": Web3.to_hex(deal_id),
        "approve_selector": "0x" + approve_selector.hex(),
        "propose_selector": "0x" + propose_selector.hex(),
        "approve_data": "0x" + approve_data.hex(),
        "propose_data": "0x" + propose_data.hex(),
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
