# Demo Video Script — BCH Stablecoin Bridge

## Title
**"BCH Stablecoin Bridge — Atomic HTLC Swap Demo"**  
Duration: 1–2 minutes

---

## Shot List

### [0:00–0:12] Title card
- Show the README header / logo
- Narrate: "This is the BCH Stablecoin Bridge — a testnet-only atomic swap between Base Sepolia mock USDC and BCH Chipnet mock PUSD. No trusted intermediary, no custodian — pure hash-time-locked contracts."

### [0:12–0:25] Architecture diagram
- Show `docs/ARCHITECTURE.md` diagram or the React UI chain overview
- Narrate: "The initiator locks mUSDC on the EVM side. The responder locks mock PUSD on BCH. Both contracts share the same sha256 hashlock. Neither party can steal funds."

### [0:25–0:50] BCH contract + tests
- Terminal: `npm test` — show 5 passing BCH VM tests
- Terminal: `cd evm && npx hardhat test` — show 10 passing EVM tests
- Narrate: "Full test suites pass: redeem path, wrong-secret rejection, refund path, early-refund rejection, CashToken support — all verified with libauth's BCH VM and Hardhat."

### [0:50–1:15] UI demo
- Open http://localhost:5173
- Click "Run Swap Demo"
- Watch 6 steps animate: secret → EVM lock → BCH fund → BCH redeem → EVM redeem → complete
- Narrate: "The UI walks through every swap step. Each step shows the txid and explorer link. In demo mode, txids are simulated. In live testnet mode, they point to real Chipnet and Base Sepolia explorers."

### [1:15–1:35] Orchestration script
- Terminal: `npm run demo`
- Show coloured output with hashlock, step confirmations
- Narrate: "The orchestration script automates the full flow: generates a secret, funds both HTLCs, redeems both sides, and prints every transaction."

### [1:35–1:50] Explorer links (if live)
- Show Chipnet explorer for BCH HTLC redeem tx
- Show Base Sepolia explorer for EVM lock/redeem tx
- Narrate: "Here are the live testnet transactions — real on-chain proofs."

### [1:50–2:00] Close
- Show repo URL: https://github.com/matrixneoaiagent/bch-stablecoin-bridge
- Narrate: "Full source, MIT licence, reproducible with a single npm install. See README for the reverse direction, architecture details, and testnet faucet links."

---

## Recording checklist

- [ ] `npm test` — 5 green BCH tests
- [ ] `cd evm && npx hardhat test` — 10 green EVM tests
- [ ] `npm run demo` — coloured output visible
- [ ] UI: open localhost:5173, click demo, capture full animation
- [ ] (If live testnet available) capture Chipnet + Basescan explorer screenshots → `docs/screenshots/`
