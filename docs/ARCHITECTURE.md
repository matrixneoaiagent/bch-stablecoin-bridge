# Architecture — BCH Stablecoin Bridge

## Overview

The bridge implements a cross-chain **Hash-Time-Locked Contract (HTLC)** atomic swap between:

- **BCH Chipnet** (testnet) holding mock PUSD as a CashToken fungible token
- **Base Sepolia** (EVM testnet) holding mock USDC as an ERC-20

Both contracts share a single `sha256(secret)` hashlock, ensuring neither party can steal funds.

---

## Protocol Sequence

```
Initiator (EVM)                          Responder (BCH)
     │                                        │
     │  secret = random_bytes(32)             │
     │  H = sha256(secret)                   │
     │                                        │
     │  EVM.lock(H, responder, T+2h, mUSDC) │
     │────────────────────────────────────→  │
     │                                        │  sees H on-chain
     │                                        │  BCH.fund(H, initiator, T+1h, PUSD)
     │  ←────────────────────────────────────│
     │                                        │
     │  BCH.redeem(secret)                   │
     │  → reveals secret on BCH chain        │
     │                                        │  sees secret in BCH tx
     │                                        │  EVM.redeem(swapId, secret)
     │                                        │  → claims mUSDC
     │                                        │
     ▼ swap complete ▼                        ▼
```

### Timelock safety

| Event | BCH timelock | EVM timelock |
|---|---|---|
| Normal path | ≤ T+1h | ≤ T+2h |
| BCH refund | > T+1h | — |
| EVM refund | — | > T+2h |

Invariant: `BCH_timelock < EVM_timelock` so the responder can always refund the BCH HTLC before the initiator's EVM timelock expires.

---

## BCH Contract: BridgeHTLC.cash

```
contract BridgeHTLC(
    bytes32 hashlock,       // sha256(secret)
    bytes20 recipientHash,  // hash160 of recipient's locking bytecode
    bytes20 senderHash,     // hash160 of sender's locking bytecode
    int     timelock        // absolute BCH block height
)
```

**Spending paths:**

1. `redeem(secret, pk, sig)` — requires `sha256(secret) == hashlock` and recipient signature
2. `refund(pk, sig)` — requires `tx.time >= timelock` and sender signature

The contract address is a P2SH32 derived from the script parameters. Any CashToken (including mock PUSD) or native tBCH can be locked in it.

**Mock PUSD CashToken:** genesis a fungible token on Chipnet. The category is recorded in `artifacts/`. Label it clearly as test-only.

---

## EVM Contract: BridgeHTLC.sol

```solidity
function lock(bytes32 hashlock, address payable recipient,
              uint256 timelock, address token, uint256 amount) → swapId

function redeem(bytes32 swapId, bytes32 secret)

function refund(bytes32 swapId)
```

The `swapId` is `keccak256(hashlock, initiator, recipient, token, amount, timelock)` — unique per swap.

The secret is stored on-chain after `redeem()` and readable via `getSecret(swapId)` — the BCH responder polls this to learn the secret.

---

## MockUSDC

A simple ERC-20 with 6 decimals and a public `faucet(address, amount)` (max 10k per call). Used when Circle's testnet USDC requires KYC.

---

## WalletConnect / WizardConnect (stretch)

The UI is structured to plug in wallet providers:
- **WalletConnect v2** for the EVM side (Base Sepolia) — `wagmi` integration prepared
- **WizardConnect** for BCH — hook into the UI's `BchProvider` interface

For the demo, a "DEMO MODE" button simulates both wallets with pre-funded test keys.

---

## Routing Extensions (stretch)

The architecture supports future routing through:
- **ThorChain testnet** — replace the EVM leg with a THORSwap call
- **ShapeShift** — wrap the EVM HTLC call through ShapeShift's DEX aggregator
- **Multiple BCH stables** — parameterise the CashToken category to support flexUSD, any PUSD variant, etc.

---

## Security Considerations

1. **Atomicity**: the sha256 preimage link ensures either both legs complete or both refund.
2. **Griefing**: a malicious initiator who never reveals the secret loses their BCH funds (refund goes back to them) but responder is safe after BCH timelock.
3. **Race conditions**: the timelock gap (1h minimum) gives both parties ample time to react.
4. **No oracle**: timelocks are enforced by the chain nodes, not any trusted party.

**This code is unaudited. Testnet only.**
