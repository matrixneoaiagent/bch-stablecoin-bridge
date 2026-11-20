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
  const [recorded, setRecorded] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('completed=1')) {
      setRecorded(true)
      const secret = '7f0bc1a44548fd29174da2f8848789089dbeaab9b43ca46a295cdd19ae248b96'
      const hashlock = 'b6afacd2af7ddf02033cab81526c69b510ef5061ec6b68562c080a49d6e3f424'
      const bchHTLCAddr = 'bchtest:pw3npt2gsx3ygx0jtypgpn9qeqfng5z5jevw007aaes398jcg6js7ufdvkwfs'
      const bchFundTx = '97b806cec6280a6f51e2bcc0be4f65ea09f0d67c24bd9ce00e61253b87d97b2a'
      const bchRedeemTx = 'd9738b6df74024748e57f40773347cdee4bbd92ce0854429d37ac40ebba092bd'

      setSteps([
        { id: 1, title: 'Generate secret + hashlock', detail: `Hashlock: ${truncate(hashlock, 32)}…`, status: 'done' },
        { id: 2, title: 'Lock mUSDC in EVM HTLC (local Hardhat)', detail: '100 mUSDC locked on a local Hardhat node — no public explorer entry', status: 'done' },
        { id: 3, title: 'Fund BridgeHTLC on BCH Chipnet (LIVE ON-CHAIN)', detail: `TX: ${truncate(bchFundTx, 24)} [BCH leg: live Chipnet]`, status: 'done', txid: bchFundTx, explorerUrl: `https://chipnet.imaginary.cash/tx/${bchFundTx}` },
        { id: 4, title: 'Redeem BridgeHTLC on BCH Chipnet (LIVE ON-CHAIN)', detail: `TX: ${truncate(bchRedeemTx, 24)} Secret revealed on-chain`, status: 'done', txid: bchRedeemTx, explorerUrl: `https://chipnet.imaginary.cash/tx/${bchRedeemTx}` },
        { id: 5, title: 'Responder redeems EVM HTLC (local Hardhat)', detail: 'mUSDC claimed on the local Hardhat node — no public explorer entry', status: 'done' },
        { id: 6, title: 'Atomic swap complete ✓', detail: 'BCH leg: live Chipnet | EVM leg: local Hardhat mock', status: 'done' },
      ])
      setSwap({
        running: false,
        done: true,
        secret,
        hashlock,
        bchHTLCAddress: bchHTLCAddr,
        bchRedeemTxid: bchRedeemTx,
      })
    }
  }, [])

  const updateStep = useCallback((id: number, patch: Partial<SwapStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }, [])

  const runDemo = useCallback(async () => {
    setRecorded(false)
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
        detail: `TX: ${truncate(evmLockTx, 24)}  [simulated — no explorer link]`,
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
        detail: `HTLC: ${truncate(bchHTLCAddr, 24)}  [simulated — no explorer link]`,
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
        detail: `Secret revealed on BCH: ${truncate(secret, 20)}…  [simulated]`,
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
        detail: `TX: ${truncate(evmRedeemTx, 24)}  mUSDC claimed  [simulated]`,
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
    setRecorded(false)
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
        <p className="real-run-link">
          {recorded ? (
            <>
              <a href="./">← Back to the animated demo</a>
              <span> · this view shows the recorded Chipnet run from 19 Nov 2026</span>
            </>
          ) : (
            <>
              <a href="?completed=1">View the real Chipnet fund &amp; redeem run →</a>
              <span> · the Run button below replays the flow in demo mode</span>
            </>
          )}
        </p>
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
            {swap.evmHTLCAddress && (
              <div className="info-row">
                <span>EVM HTLC</span>
                <span>{truncate(swap.evmHTLCAddress, 18)}</span>
              </div>
            )}
            <div className="info-row">
              <span>BCH HTLC</span>
              <span>{truncate(swap.bchHTLCAddress ?? '', 18)}</span>
            </div>
            {swap.swapId && (
              <div className="info-row">
                <span>Swap ID</span>
                <span>{truncate(swap.swapId, 18)}</span>
              </div>
            )}
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
          {recorded ? (
            <>
              <strong>Recorded run:</strong> the two BCH txids above are real Chipnet
              transactions — the explorer links open them. The EVM leg ran on a local
              Hardhat node and has no public explorer entry. The Run button replays the
              flow with simulated txids.
            </>
          ) : (
            <>
              <strong>Demo mode:</strong> this animation generates simulated txids and
              broadcasts nothing; simulated steps carry no explorer link. For the real
              on-chain run open <a href="?completed=1">the recorded Chipnet run →</a>, or
              run <code>npm run demo</code> locally (requires funded testnet wallets).
            </>
          )}
        </p>
      </div>
    </div>
  )
}
