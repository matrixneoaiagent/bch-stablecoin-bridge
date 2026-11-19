/**
 * orchestration/chipnet-live.ts
 *
 * Real on-chain broadcast on BCH Chipnet for BridgeHTLC.cash:
 *   1. Reads funded testnet wallet from /tmp/opencode/foldingcash_chipnet/wallet.json
 *      (mnemonic/key is never logged or exposed).
 *   2. Derives initiator (index 0) and responder (index 1).
 *   3. Generates secret S and sha256 hashlock H.
 *   4. Instantiates BridgeHTLC contract with real Chipnet timelock.
 *   5. Funds BridgeHTLC on Chipnet with 5,000 test BCH satoshis.
 *   6. Redeems BridgeHTLC on Chipnet by revealing secret S on-chain.
 *   7. Outputs live txids and explorer URLs on https://chipnet.imaginary.cash/
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  sha256,
  utf8ToBin,
  binToHex,
  hash160,
  secp256k1,
  assertSuccess,
  encodeCashAddress,
  deriveHdPrivateNodeFromBip39Mnemonic,
  deriveHdPath,
  type CashAddressNetworkPrefix,
} from '@bitauth/libauth';
import {
  ElectrumNetworkProvider,
  Contract,
  TransactionBuilder,
  SignatureTemplate,
  type Artifact,
} from 'cashscript';

const ROOT = new URL('../', import.meta.url).pathname;
const WALLET_PATH = process.env.FC_WALLET ?? '/tmp/opencode/foldingcash_chipnet/wallet.json';

const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function step(n: number, msg: string) {
  console.log(`\n${c.bold(c.cyan(`[Step ${n}]`))} ${msg}`);
}

function ok(msg: string) {
  console.log(`  ${c.green('✓')} ${msg}`);
}

function info(label: string, value: string) {
  console.log(`  ${c.dim(label.padEnd(22))} ${c.yellow(value)}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(c.bold('\n╔══════════════════════════════════════════════════╗'));
  console.log(c.bold('║   BCH Stablecoin Bridge — LIVE Chipnet Leg       ║'));
  console.log(c.bold('║   On-Chain BridgeHTLC Fund & Secret Redeem       ║'));
  console.log(c.bold('╚══════════════════════════════════════════════════╝\n'));

  if (!existsSync(WALLET_PATH)) {
    console.error(`Error: Funded Chipnet wallet not found at ${WALLET_PATH}`);
    process.exit(1);
  }

  const walletFile = JSON.parse(readFileSync(WALLET_PATH, 'utf8'));
  const root = deriveHdPrivateNodeFromBip39Mnemonic(walletFile.mnemonic);
  if (typeof root === 'string') throw new Error(root);

  function derive(index: number) {
    const path = `m/44'/145'/0'/0/${index}`;
    const node = deriveHdPath(root, path);
    if (typeof node === 'string') throw new Error(node);
    const privKey = node.privateKey;
    const pubKey = assertSuccess(secp256k1.derivePublicKeyCompressed(privKey));
    const pkh = hash160(pubKey);
    const addr = assertSuccess(encodeCashAddress({ prefix: 'bchtest' as CashAddressNetworkPrefix, type: 'p2pkh', payload: pkh }));
    const signer = new SignatureTemplate(privKey);
    return { privKey, pubKey, h160: pkh, address: addr.address, signer };
  }

  const initiator = derive(0);
  const responder = derive(1);

  const provider = new ElectrumNetworkProvider('chipnet');

  // Step 1: Secret and Hashlock
  step(1, 'Generate atomic swap secret + sha256 hashlock');
  const secretBytes = new Uint8Array(randomBytes(32));
  const hashlock = sha256.hash(secretBytes);
  const secretHex = binToHex(secretBytes);
  const hashlockHex = binToHex(hashlock);

  info('Secret (hex):', secretHex.slice(0, 16) + '... [revealed on redeem]');
  info('Hashlock (sha256):', hashlockHex);
  ok('Hashlock generated');

  // Step 2: Check wallet balances
  step(2, 'Connect to Chipnet & verify initiator balance');
  const currentHeight = await provider.getBlockHeight();
  info('Current block height:', String(currentHeight));
  info('Initiator address:', initiator.address);
  info('Responder address:', responder.address);

  const utxos = await provider.getUtxos(initiator.address);
  const bchOnly = utxos.filter((u) => !u.token).sort((a, b) => (a.satoshis > b.satoshis ? -1 : 1));
  if (bchOnly.length === 0) {
    console.error('Error: No available BCH-only UTXOs for initiator on Chipnet');
    process.exit(1);
  }
  const fundingUtxo = bchOnly[0];
  info('Available UTXOs:', `${bchOnly.length} (spending ${fundingUtxo.satoshis} sats from ${fundingUtxo.txid.slice(0, 10)}...)`);
  ok('Initiator has sufficient Chipnet test BCH');

  // Step 3: Instantiate contract
  step(3, 'Instantiate BridgeHTLC contract on Chipnet');
  const artifactPath = resolve(ROOT, 'artifacts/BridgeHTLC.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Artifact;

  const timelock = BigInt(currentHeight + 20); // 20 blocks in the future
  const contract = new Contract(
    artifact,
    [hashlock, responder.h160, initiator.h160, timelock],
    { provider, contractType: 'p2sh32' },
  );

  info('BridgeHTLC address:', contract.address);
  info('Timelock block height:', String(timelock));
  ok('Contract instantiated on Chipnet');

  // Step 4: Fund BridgeHTLC on Chipnet
  step(4, 'Broadcast funding transaction to Chipnet');
  const fundAmount = 5000n; // 5,000 sats test BCH
  const fundBuilder = new TransactionBuilder({ provider })
    .addInput(fundingUtxo, initiator.signer.unlockP2PKH())
    .addOutput({ to: contract.address, amount: fundAmount })
    .addBchChangeOutputIfNeeded({ to: initiator.address, feeRate: 1.2 });

  console.log('  Broadcasting funding tx to Chipnet...');
  const fundDetails = await fundBuilder.send();
  const fundTxid = fundDetails.txid;

  info('Fund TXID:', fundTxid);
  info('Fund Explorer:', `https://chipnet.imaginary.cash/tx/${fundTxid}`);
  ok(`Locked ${fundAmount} satoshis test BCH into BridgeHTLC contract on Chipnet!`);

  // Step 5: Wait for UTXO indexing
  step(5, 'Waiting for Chipnet Electrum indexing...');
  let contractUtxo = null;
  for (let attempt = 1; attempt <= 15; attempt++) {
    await sleep(2000);
    const contractUtxos = await contract.getUtxos();
    const found = contractUtxos.find((u) => u.txid === fundTxid);
    if (found) {
      contractUtxo = found;
      console.log(`  Indexed after ${attempt * 2}s (${contractUtxo.satoshis} sats found)`);
      break;
    }
  }

  if (!contractUtxo) {
    console.error('Error: Funded UTXO was not indexed by Chipnet electrum server within 30s');
    process.exit(1);
  }
  ok('Contract UTXO confirmed ready to spend');

  // Step 6: Redeem BridgeHTLC on Chipnet (reveals secret)
  step(6, 'Broadcast redeem transaction revealing secret S on Chipnet');
  const redeemAmount = 4000n; // 1,000 sats network fee
  const redeemBuilder = new TransactionBuilder({ provider })
    .addInput(contractUtxo, contract.unlock.redeem(secretBytes, responder.pubKey, responder.signer))
    .addOutput({ to: responder.address, amount: redeemAmount });

  console.log('  Broadcasting redeem tx to Chipnet...');
  const redeemDetails = await redeemBuilder.send();
  const redeemTxid = redeemDetails.txid;

  info('Revealed Secret:', secretHex);
  info('Redeem TXID:', redeemTxid);
  info('Redeem Explorer:', `https://chipnet.imaginary.cash/tx/${redeemTxid}`);
  ok(`BridgeHTLC successfully redeemed on Chipnet! Secret published on-chain.`);

  // Summary
  console.log(c.bold('\n╔══════════════════════════════════════════════════╗'));
  console.log(c.bold('║   LIVE CHIPNET PROOF SUMMARY                     ║'));
  console.log(c.bold('╠══════════════════════════════════════════════════╣'));
  console.log(`║  ${c.green('✓')} Leg: Real BCH Chipnet                         ║`);
  console.log(`║  ${c.green('✓')} Contract: ${contract.address.slice(0, 24)}...  ║`);
  console.log(`║  ${c.green('✓')} Fund TXID:   ${fundTxid.slice(0, 24)}...  ║`);
  console.log(`║  ${c.green('✓')} Redeem TXID: ${redeemTxid.slice(0, 24)}...  ║`);
  console.log(`║  ${c.yellow('!')} EVM leg: Local Hardhat / Anvil (honest)      ║`);
  console.log(c.bold('╚══════════════════════════════════════════════════╝\n'));

  // Save live proof details for documentation
  const proof = {
    network: 'chipnet',
    contractAddress: contract.address,
    timelock: Number(timelock),
    hashlock: hashlockHex,
    secret: secretHex,
    fundTxid,
    fundUrl: `https://chipnet.imaginary.cash/tx/${fundTxid}`,
    redeemTxid,
    redeemUrl: `https://chipnet.imaginary.cash/tx/${redeemTxid}`,
    evmLegStatus: 'Local Hardhat / Anvil (Base Sepolia simulated)',
    timestamp: new Date().toISOString(),
  };

  const proofPath = resolve(ROOT, 'demo-chipnet-live.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(proofPath, JSON.stringify(proof, null, 2));
  console.log(`Saved proof to ${proofPath}`);

  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error in chipnet-live:', e);
  process.exit(1);
});
