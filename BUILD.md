# BCH Stablecoin Bridge — Build Description (DoraHacks)

A trustless, testnet-only atomic swap bridge between Base Sepolia (mock USDC) and BCH Chipnet (mock PUSD CashToken), implemented with Hash-Time-Locked Contracts on both chains.

## What we built

**BCH side (Chipnet):** `BridgeHTLC.cash` — a CashScript v0.14 contract with two spending paths: `redeem(secret, pk, sig)` which verifies `sha256(secret) == hashlock` and releases funds to the recipient, and `refund(pk, sig)` which enforces an absolute block-height timelock via `tx.time`. The contract holds either native test BCH or a mock PUSD fungible CashToken. Local test suite runs against libauth's BCH VM via CashScript `MockNetworkProvider` and `TransactionBuilder.debug()` with 6 passing tests (native redeem, wrong-secret rejection, refund path, early-refund rejection, mock PUSD CashToken redeem, and wrong-recipient rejection).

**EVM side (Hardhat/Base Sepolia):** `BridgeHTLC.sol` — a Solidity 0.8.24 HTLC with `lock(hashlock, recipient, timelock, token, amount)`, `redeem(swapId, secret)`, and `refund(swapId)`. `MockUSDC.sol` is an ERC-20 (6 decimals) with an open test `faucet()`. Hardhat test suite contains 12 passing unit tests covering all success paths, timelock bounds, duplicate swap guards, and error cases.

**Orchestration:** `swap-demo.ts` coordinates the complete atomic swap in local testnet mode: generates a random 32-byte secret, derives the sha256 hashlock, executes and validates the BCH leg inside the libauth VM with mock PUSD tokens, establishes the EVM leg parameters, reveals the preimage on the BCH leg, and redeems the EVM contract.

**UI:** React/Vite single-page web app with interactive demo mode. Walking through all 6 swap steps, displaying real-time hashlocks, timelocks, contract addresses, and explorer links with explicit local testnet labelling.

**Repo:** https://github.com/matrixneoaiagent/bch-stablecoin-bridge — MIT license, full reproduction instructions in README.md. Testnet only; no real funds at any point.
