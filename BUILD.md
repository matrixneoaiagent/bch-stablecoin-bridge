# BCH Stablecoin Bridge — Build Description (DoraHacks)

A trustless, testnet-only atomic swap bridge between Base Sepolia (mock USDC) and BCH Chipnet (test BCH / mock PUSD), implemented with Hash-Time-Locked Contracts on both chains.

## What we built

**BCH side (Chipnet):** `BridgeHTLC.cash` — a CashScript v0.14 contract with two spending paths: `redeem(secret, pk, sig)` which verifies `sha256(secret) == hashlock` and releases funds to the recipient, and `refund(pk, sig)` which enforces an absolute block-height timelock via `tx.time`. Test suite runs against libauth's BCH VM with 6 passing unit tests (native redeem, wrong secret, refund path, early refund rejection, mock PUSD CashToken redeem, and wrong recipient rejection).

**Live on-chain Chipnet execution:**
- Contract: `bchtest:pw3npt2gsx3ygx0jtypgpn9qeqfng5z5jevw007aaes398jcg6js7ufdvkwfs`
- Funding TX: `97b806cec6280a6f51e2bcc0be4f65ea09f0d67c24bd9ce00e61253b87d97b2a` (5,000 sats locked into HTLC)
- Redeem TX: `d9738b6df74024748e57f40773347cdee4bbd92ce0854429d37ac40ebba092bd` (preimage secret published on-chain)
- Explorer: https://chipnet.imaginary.cash/tx/d9738b6df74024748e57f40773347cdee4bbd92ce0854429d37ac40ebba092bd

**EVM side (Hardhat/Base Sepolia):** `BridgeHTLC.sol` (Solidity 0.8.24) with `lock`, `redeem(swapId, secret)`, and `refund`. `MockUSDC.sol` is an open-faucet ERC-20 (6 decimals). 12 passing unit tests in Hardhat covering all paths and guards. Note: EVM leg runs in local Hardhat node mode; we do not claim live Base Sepolia broadcast.

**Orchestration & UI:** `orchestration/chipnet-live.ts` broadcasts the real on-chain Chipnet leg; `swap-demo.ts` runs the full end-to-end local swap. React/Vite UI with interactive step progression, live txid display, and clear leg labelling.

**Repo:** https://github.com/matrixneoaiagent/bch-stablecoin-bridge — MIT license, full reproduction instructions. Testnet only.

## Verification and live demo

- **GitHub Actions CI is green** (`ci.yml`, run 44697688744): BCH contracts build + typecheck + 6 libauth VM tests, and EVM Hardhat compile + 12 tests, on Node 22.
- **Live demo:** https://matrixneoaiagent.github.io/bch-stablecoin-bridge/?completed=1 — opens on the six-step swap with the real Chipnet fund and redeem txids; the EVM leg is labelled local Hardhat, and the Run button replays the flow in demo mode.
- **Reproduce:** `npm ci && npm test` (BCH), `cd evm && npm ci && npm test` (EVM), `cd ui && npm ci && npm run build`.
