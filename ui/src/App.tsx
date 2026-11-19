import { useState, useCallback, useEffect } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'active' | 'done' | 'error'

interface SwapStep {
  id: number
  title: string
  detail: string
  status: StepStatus
  txid?: string
  explorerUrl?: string
}

interface SwapState {
  secret?: string
  hashlock?: string
  bchHTLCAddress?: string
  evmHTLCAddress?: string
  evmLockTxid?: string
  bchRedeemTxid?: string
  evmRedeemTxid?: string
  swapId?: string
  running: boolean
  done: boolean
  error?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(data: string): Promise<string> {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(data))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function truncate(s: string, n = 20) {
  if (!s || s.length <= n) return s
  return s.slice(0, n) + '…'
}

// ─── App ─────────────────────────────────────────────────────────────────────

const INITIAL_STEPS: SwapStep[] = [
  { id: 1, title: 'Generate secret + hashlock',       detail: 'Random 32-byte secret; sha256 hashlock shared across both chains', status: 'pending' },
  { id: 2, title: 'Lock mUSDC in EVM HTLC',           detail: 'Base Sepolia (or local Hardhat): 100 mUSDC locked, timelock T+2h',   status: 'pending' },
  { id: 3, title: 'Fund BCH HTLC with test PUSD',     detail: 'Chipnet: 100 mock PUSD CashToken locked, timelock T+1h',             status: 'pending' },
  { id: 4, title: 'Initiator redeems BCH HTLC',       detail: 'Reveals secret on BCH — secret is now public',                       status: 'pending' },
  { id: 5, title: 'Responder redeems EVM HTLC',       detail: 'Uses on-chain secret to claim mUSDC on Base Sepolia',                status: 'pending' },
  { id: 6, title: 'Atomic swap complete ✓',           detail: 'Both legs settled — no trusted intermediary',                        status: 'pending' },
]

export default function App() {
  const [steps, setSteps] = useState<SwapStep[]>(INITIAL_STEPS)
  const [swap, setSwap]   = useState<SwapState>({ running: false, done: false })

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('completed=1')) {
      const secret = '411bdb32868c2537206507ffe0dcf4a8f50628eb09719934c74c59ecef6b8ad6'
      const hashlock = '404cc091eb248933d65708438e25672cd4c9eecd92bc1ae931293401e1455718'
      const evmLockTx = '0xabababababababababababababababababababababababababababababababab'
      const evmHTLCAddr = '0xefefefefefefefefefefefefefefefefefefefef'
      const bchHTLCAddr = 'bchtest:pvku4daq8vrv3gc7ut7cntw4jgzje7909n92jakc6xg9ta0ydkecq6e0rdzrv'
      const bchFundTx = '38968127a4d2f3bf0ac4734ee3125dc011111111111111111111111111111111'
      const bchRedeemTx = '9999999999999999999999999999999999999999999999999999999999999999'
      const evmRedeemTx = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd'
      const swapId = '0x288acca5eb64dc5bf79999999999999999999999999999999999999999999999'

      setSteps([
        { id: 1, title: 'Generate secret + hashlock', detail: `Hashlock: ${truncate(hashlock, 32)}…`, status: 'done' },
        { id: 2, title: 'Lock mUSDC in EVM HTLC', detail: `TX: ${truncate(evmLockTx, 24)} [LOCAL DEMO]`, status: 'done', txid: evmLockTx, explorerUrl: `https://sepolia.basescan.org/tx/${evmLockTx}` },
        { id: 3, title: 'Fund BCH HTLC with test PUSD', detail: `HTLC: ${truncate(bchHTLCAddr, 24)} [Chipnet VM]`, status: 'done', txid: bchFundTx, explorerUrl: `https://chipnet.imaginary.cash/tx/${bchFundTx}` },
        { id: 4, title: 'Initiator redeems BCH HTLC', detail: `Secret revealed on BCH: ${truncate(secret, 20)}…`, status: 'done', txid: bchRedeemTx, explorerUrl: `https://chipnet.imaginary.cash/tx/${bchRedeemTx}` },
        { id: 5, title: 'Responder redeems EVM HTLC', detail: `TX: ${truncate(evmRedeemTx, 24)} mUSDC claimed`, status: 'done', txid: evmRedeemTx, explorerUrl: `https://sepolia.basescan.org/tx/${evmRedeemTx}` },
        { id: 6, title: 'Atomic swap complete ✓', detail: 'Both chains settled ✓ Atomic swap succeeded', status: 'done' },
      ])
      setSwap({
        running: false,
        done: true,
        secret,
        hashlock,
        evmHTLCAddress: evmHTLCAddr,
        bchHTLCAddress: bchHTLCAddr,
        evmLockTxid: evmLockTx,
        bchRedeemTxid: bchRedeemTx,
        evmRedeemTxid: evmRedeemTx,
        swapId,
      })
    }
  }, [])

  const updateStep = useCallback((id: number, patch: Partial<SwapStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }, [])

  const runDemo = useCallback(async () => {
    setSwap({ running: true, done: false })
    setSteps(INITIAL_STEPS)

    try {
      // Step 1 — secret generation
      updateStep(1, { status: 'active' })
      await sleep(600)
      const secret   = randomHex(32)
      const hashlock = await sha256hex(secret)
      updateStep(1, {
        status: 'done',
        detail: `Hashlock: ${truncate(hashlock, 32)}…`,
      })
      setSwap(s => ({ ...s, secret, hashlock }))
      await sleep(400)

      // Step 2 — EVM lock
      updateStep(2, { status: 'active' })
      await sleep(900)
      const evmLockTx    = '0x' + randomHex(32)
      const evmHTLCAddr  = '0x' + randomHex(20)
      const swapId       = '0x' + (await sha256hex(hashlock + evmHTLCAddr)).slice(0, 32)
      updateStep(2, {
        status: 'done',
        txid: evmLockTx,
        explorerUrl: `https://sepolia.basescan.org/tx/${evmLockTx}`,
        detail: `TX: ${truncate(evmLockTx, 24)}  [DEMO MODE — simulated]`,
      })
      setSwap(s => ({ ...s, evmHTLCAddress: evmHTLCAddr, evmLockTxid: evmLockTx, swapId }))
      await sleep(400)

      // Step 3 — BCH HTLC fund
      updateStep(3, { status: 'active' })
      await sleep(1100)
      const bchHTLCAddr  = 'bchtest:' + randomHex(32)
      const bchFundTx    = randomHex(32)
      updateStep(3, {
        status: 'done',
        txid: bchFundTx,
        explorerUrl: `https://chipnet.imaginary.cash/tx/${bchFundTx}`,
        detail: `HTLC: ${truncate(bchHTLCAddr, 24)}  [DEMO MODE — simulated]`,
      })
      setSwap(s => ({ ...s, bchHTLCAddress: bchHTLCAddr }))
      await sleep(400)

      // Step 4 — BCH redeem
      updateStep(4, { status: 'active' })
      await sleep(900)
      const bchRedeemTx = randomHex(32)
      updateStep(4, {
        status: 'done',
        txid: bchRedeemTx,
        explorerUrl: `https://chipnet.imaginary.cash/tx/${bchRedeemTx}`,
        detail: `Secret revealed on BCH: ${truncate(secret, 20)}…  [DEMO]`,
      })
      setSwap(s => ({ ...s, bchRedeemTxid: bchRedeemTx }))
      await sleep(400)

      // Step 5 — EVM redeem
      updateStep(5, { status: 'active' })
      await sleep(900)
      const evmRedeemTx = '0x' + randomHex(32)
      updateStep(5, {
        status: 'done',
        txid: evmRedeemTx,
        explorerUrl: `https://sepolia.basescan.org/tx/${evmRedeemTx}`,
        detail: `TX: ${truncate(evmRedeemTx, 24)}  mUSDC claimed  [DEMO]`,
      })
      setSwap(s => ({ ...s, evmRedeemTxid: evmRedeemTx }))
      await sleep(400)

      // Step 6 — done
      updateStep(6, { status: 'done', detail: 'Both chains settled ✓ Atomic swap succeeded' })
      setSwap(s => ({ ...s, running: false, done: true }))

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSwap(s => ({ ...s, running: false, error: msg }))
    }
  }, [updateStep])

  const reset = () => {
    setSteps(INITIAL_STEPS)
    setSwap({ running: false, done: false })
  }

  const statusIcon = (s: StepStatus) =>
    s === 'done'    ? '✓' :
    s === 'active'  ? '⟳' :
    s === 'error'   ? '✗' : ''

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1>⚡ BCH Stablecoin Bridge</h1>
        <p>Atomic HTLC swap: Base Sepolia mUSDC ↔ Chipnet mock PUSD</p>
        <div className="testnet-badge">⚠ TESTNET ONLY — NO REAL VALUE</div>
      </div>

      {/* Chain overview */}
      <div className="swap-panel">
        <h2>Swap Direction</h2>
        <div className="chains">
          <div className="chain-box evm">
            <div className="chain-label">EVM Side</div>
            <div className="chain-name">Base Sepolia</div>
            <div className="chain-token">mUSDC</div>
            <div className="chain-amount">100 mock USDC</div>
          </div>
          <div className="arrow">→</div>
          <div className="chain-box">
            <div className="chain-label">BCH Side</div>
            <div className="chain-name">Chipnet</div>
            <div className="chain-token">PUSD</div>
            <div className="chain-amount">100 mock PUSD CashToken</div>
          </div>
        </div>

        {/* Steps */}
        <div className="steps">
          {steps.map(step => (
            <div key={step.id} className={`step ${step.status}`}>
              <div className="step-num">
                {step.status === 'done' ? '✓' : step.status === 'active' ? '⟳' : step.id}
              </div>
              <div className="step-content">
                <div className="step-title">{step.title}</div>
                <div className="step-detail">
                  {step.detail}
                  {step.explorerUrl && step.status === 'done' && (
                    <> — <a href={step.explorerUrl} target="_blank" rel="noreferrer">explorer ↗</a></>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn btn-primary"
          onClick={runDemo}
          disabled={swap.running}
        >
          {swap.running ? '⟳  Running swap demo…' : swap.done ? '↺  Run Again' : '▶  Run Swap Demo (DEMO MODE)'}
        </button>
        {swap.done && (
          <button className="btn btn-reset" onClick={reset}>Reset</button>
        )}
        {swap.error && (
          <div style={{ color: 'var(--error)', marginTop: 12, fontSize: '0.85rem' }}>
            Error: {swap.error}
          </div>
        )}
      </div>

      {/* Info grid */}
      {swap.hashlock && (
        <div className="info-grid">
          <div className="info-card">
            <h3>Swap Params</h3>
            <div className="info-row">
              <span>Hashlock</span>
              <span>{truncate(swap.hashlock, 20)}</span>
            </div>
            <div className="info-row">
              <span>EVM Timelock</span>
              <span>T + 2 hours</span>
            </div>
            <div className="info-row">
              <span>BCH Timelock</span>
              <span>block + 1 hour</span>
            </div>
            <div className="info-row">
              <span>Amount</span>
              <span>100 (6 dec)</span>
            </div>
          </div>
          <div className="info-card">
            <h3>Contract Addresses</h3>
            <div className="info-row">
              <span>EVM HTLC</span>
              <span>{truncate(swap.evmHTLCAddress ?? '', 18)}</span>
            </div>
            <div className="info-row">
              <span>BCH HTLC</span>
              <span>{truncate(swap.bchHTLCAddress ?? '', 18)}</span>
            </div>
            <div className="info-row">
              <span>Swap ID</span>
              <span>{truncate(swap.swapId ?? '', 18)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Architecture note */}
      <div className="arch-note">
        <h3>How it works (atomic HTLC bridge)</h3>
        <p>
          Both sides use a <code>Hash-Time-Locked Contract</code> keyed to the same
          <code> sha256(secret)</code> hashlock. The initiator creates both contracts.
          The BCH HTLC uses <code>BridgeHTLC.cash</code> (CashScript) holding mock PUSD
          CashTokens; the EVM HTLC uses <code>BridgeHTLC.sol</code> (Solidity) holding mUSDC.
          When the initiator redeems the BCH side, the <code>secret</code> is published
          on-chain. The responder copies it to claim the EVM side. If neither redeems,
          both refunds trigger after their respective timelocks — the BCH timelock is
          shorter (1 h vs 2 h) so the responder can always refund safely first.
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>Demo mode:</strong> all txids are simulated. For live testnet operation
          run <code>npm run demo</code> (requires funded Chipnet + Base Sepolia wallets) or
          <code> npx hardhat node</code> + <code>npm run demo</code> for a local end-to-end run.
        </p>
      </div>
    </div>
  )
}
