# BCH Stablecoin Bridge

**Testnet-only** atomic HTLC swap between Base Sepolia (mUSDC) and BCH Chipnet (mock PUSD CashToken).  
BCH BLAZE 2026 — Stablecoin Bridge bounty (DoraHacks #1382, 750 PUSD, deadline 2026-11-22).

> ⚠️ **TESTNET ONLY** — no real value. Chipnet + Base Sepolia + local Hardhat. Never deploy with real funds.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Atomic HTLC Swap Protocol                      │
│                                                                   │
│  User A (Initiator)              User B (Responder)              │
│  ─────────────────                ────────────────               │
│                                                                   │
│  1. Generate secret S             .                              │
│     hashlock H = sha256(S)        .                              │
│                                                                   │
│  2. Lock 100 mUSDC in EVM HTLC    .                              │
│     (Base Sepolia, timelock T+2h) .                              │
│                                   │                              │
│                                   3. See H on-chain              │
│                                   4. Lock 100 PUSD in BCH HTLC  │
│                                      (Chipnet, timelock T+1h)   │
│                                                                   │
│  5. Redeem BCH HTLC with S        .   ← reveals S on BCH chain  │
│     receive 100 test PUSD         .                              │
│                                   │                              │
│                                   6. See S in BCH tx            │
│                                   7. Redeem EVM HTLC with S     │
│                                      receive 100 mUSDC          │
│                                                                   │
│  Timelocks: BCH < EVM so responder can always refund first      │
└─────────────────────────────────────────────────────────────────┘

BCH Side (Chipnet)                EVM Side (Base Sepolia / Hardhat)
──────────────────                ─────────────────────────────────
BridgeHTLC.cash (CashScript)      BridgeHTLC.sol (Solidity 0.8.24)
  - sha256 hashlock               MockUSDC.sol (ERC-20, 6 dec)
  - absolute blockheight TL         - faucet() for free test tokens
  - p2sh32 on Chipnet             Hardhat local node (default)
  - holds native tBCH or          Base Sepolia (optional, with key)
    mock PUSD CashToken
```

### Contracts

| Contract | Chain | Purpose |
|---|---|---|
| `BridgeHTLC.cash` | BCH Chipnet | CashScript HTLC: `redeem(secret,pk,sig)` or `refund(pk,sig)` |
| `BridgeHTLC.sol` | Base Sepolia / Hardhat | Solidity HTLC: `lock`, `redeem(swapId,secret)`, `refund` |
| `MockUSDC.sol` | Base Sepolia / Hardhat | Test ERC-20 with public `faucet()` |

---

## Quick Start

### Prerequisites
```bash
node >= 20
npm >= 10
```

### Install
```bash
# Root package (BCH / TypeScript)
npm install

# EVM package (Hardhat)
cd evm && npm install && cd ..

# UI (optional)
cd ui && npm install && cd ..
```

### Compile BCH contract
```bash
npm run build:contracts
# → artifacts/BridgeHTLC.json
```

### Run BCH VM tests (no network)
```bash
npm test
# 6 passing tests using CashScript MockNetworkProvider + libauth VM
```

### Run EVM tests (Hardhat)
```bash
npm run test:evm
# 12 passing tests (lock, duplicate guards, redeem, refund, timelocks, MockUSDC faucet)
```

### Live On-Chain Chipnet Execution (Verified)
The BCH leg has been deployed and redeemed on-chain on BCH Chipnet:
- **Contract:** `bchtest:pw3npt2gsx3ygx0jtypgpn9qeqfng5z5jevw007aaes398jcg6js7ufdvkwfs`
- **Funding TX:** [`97b806cec6280a6f51e2bcc0be4f65ea09f0d67c24bd9ce00e61253b87d97b2a`](https://chipnet.imaginary.cash/tx/97b806cec6280a6f51e2bcc0be4f65ea09f0d67c24bd9ce00e61253b87d97b2a) (5,000 sats test BCH locked)
- **Redeem TX:** [`d9738b6df74024748e57f40773347cdee4bbd92ce0854429d37ac40ebba092bd`](https://chipnet.imaginary.cash/tx/d9738b6df74024748e57f40773347cdee4bbd92ce0854429d37ac40ebba092bd) (preimage secret published on-chain)
- **Run live script:** `npm run demo:chipnet` (requires Chipnet wallet at `FC_WALLET` or `/tmp/opencode/foldingcash_chipnet/wallet.json`)

*Note: EVM leg runs in local Hardhat node mode; we do not fabricate Base Sepolia transactions.*

### Run swap demo (local mode — no funded wallet needed)
```bash
npm run demo
# Shows all swap steps with simulated txids
```

### Run swap demo (with local Hardhat node)
```bash
# Terminal 1:
cd evm && npx hardhat node

# Terminal 2:
npm run demo
```

### Run swap demo (Base Sepolia — requires ETH)
```bash
# Copy and fill in:
cp .env.example .env
# Set EVM_PRIVATE_KEY and optionally BASE_SEPOLIA_RPC

npm run demo DEMO_MODE=testnet
```

### UI
```bash
cd ui && npm run dev
# Open http://localhost:5173
# Click "Run Swap Demo" — walks through all 6 steps with animated status
```

---

## Reverse Direction (PUSD → USDC)

Mirror the same flow with roles swapped:
1. BCH user (Initiator) generates secret, locks PUSD in BCH HTLC (timelock T+2h)
2. EVM user (Responder) sees hashlock, locks mUSDC in EVM HTLC (timelock T+1h)
3. BCH Initiator redeems EVM HTLC, revealing secret
4. EVM Responder sees secret, redeems BCH HTLC

The key invariant: Responder's timelock < Initiator's timelock, so Responder can always refund before Initiator's refund window.

---

## Testnet Faucets

| Chain | Faucet |
|---|---|
| BCH Chipnet | https://tbch.googol.cash/ or `bchtest:` prefix on imaginary.cash |
| Base Sepolia | https://www.alchemy.com/faucets/base-sepolia |
| MockUSDC | Call `faucet(address, amount)` on the deployed MockUSDC |

If faucets require KYC or card, the demo uses local Hardhat + mock tokens — documented honestly, no fabrication.

---

## Security Notes

- Atomic swaps are trust-minimised: neither party can steal funds if they follow the protocol.
- The BCH timelock < EVM timelock invariant ensures the responder can always refund safely.
- **This code has NOT been audited. Testnet only.**

---

## Reuse Disclosure

The CashScript contract pattern (MockNetworkProvider, wallet derivation, test structure) is adapted from:
- `foldingcash-merkle-claims` (MIT, by this team) — `ReceiptHold.cash` hashlock structure, VM test pattern

Key differences from that project:
- sha256 preimage hashlock instead of NFT receipt category check
- Absolute block-height timelock (`tx.time`) instead of CSV audit-delay
- Two-party atomic swap instead of pool/delegation pattern

---

## Files

```
bch-stablecoin-bridge/
├── contracts/
│   └── BridgeHTLC.cash        # CashScript HTLC (BCH Chipnet)
├── evm/
│   ├── contracts/
│   │   ├── BridgeHTLC.sol     # Solidity HTLC (EVM)
│   │   └── MockUSDC.sol       # Test ERC-20
│   ├── test/
│   │   └── BridgeHTLC.test.cjs
│   ├── scripts/
│   │   ├── deploy-local.cjs
│   │   └── deploy-sepolia.cjs
│   └── hardhat.config.cjs
├── src/
│   ├── wallet.ts              # BCH wallet helpers
│   └── bch-htlc.ts            # Contract factory + UTXO helpers
├── test/
│   └── bch-htlc.test.ts       # BCH VM tests (libauth)
├── orchestration/
│   └── swap-demo.ts           # End-to-end demo script
├── ui/
│   └── src/App.tsx            # React/Vite swap UI
├── docs/
│   ├── ARCHITECTURE.md        # Deep-dive architecture
│   ├── DEMO_VIDEO_SCRIPT.md   # 1-2 min video shot list
│   └── screenshots/
├── artifacts/                 # Compiled CashScript artifacts
├── BUILD.md                   # DoraHacks build description
├── LICENSE
└── README.md
```

---

## License

MIT © 2026
