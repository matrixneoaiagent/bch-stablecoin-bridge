/**
 * test/bch-htlc.test.ts — Local VM tests for BridgeHTLC.cash
 *
 * Uses CashScript MockNetworkProvider + libauth BCH VM (offline, no network).
 *
 * Pattern reused from foldingcash-merkle-claims/test/vm.test.ts (MIT).
 * Key differences:
 *   - sha256 hashlock instead of NFT receipt category
 *   - absolute blockheight timelock (tx.time) instead of audit-delay CSV
 *   - Two spending paths: redeem(secret,pk,sig) and refund(pk,sig)
 *   - Uses CashScript v0.14 TransactionBuilder + contract.unlock API
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MockNetworkProvider,
  TransactionBuilder,
  SignatureTemplate,
} from 'cashscript';
import {
  hash160,
  sha256,
  utf8ToBin,
  secp256k1,
  assertSuccess,
  encodeCashAddress,
  type CashAddressNetworkPrefix,
} from '@bitauth/libauth';
import { createHTLC, fundHTLC, fundHTLCWithToken } from '../src/bch-htlc.js';

// ─── Test wallets ────────────────────────────────────────────────────────────

function makeWallet(seed: string) {
  // sha256 is a module object in libauth v3: use sha256.hash(data)
  const privKey = sha256.hash(utf8ToBin(seed));
  const pubKey = assertSuccess(secp256k1.derivePublicKeyCompressed(privKey));
  const h160 = hash160(pubKey);
  const address = assertSuccess(encodeCashAddress({
    prefix: 'bchtest' as CashAddressNetworkPrefix,
    type: 'p2pkh',
    payload: h160,
  })).address;
  const signer = new SignatureTemplate(privKey);
  return { privKey, pubKey, h160, address, signer };
}

const initiator = makeWallet('initiator-seed');
const responder = makeWallet('responder-seed');

// ─── Shared secret/hashlock ───────────────────────────────────────────────────

const SECRET_STR = 'bridge-secret-2026-testnet';
const secretBytes = utf8ToBin(SECRET_STR);
const hashlock = sha256.hash(secretBytes);

// Mock PUSD CashToken category (testnet only, not a real token)
const PUSD_CATEGORY = 'aabbcc'.padEnd(64, '0');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildHTLC(timelock = 850_000n) {
  const provider = new MockNetworkProvider();
  const contract = createHTLC(
    {
      hashlock,
      recipientHash: responder.h160,
      senderHash: initiator.h160,
      timelock,
    },
    provider,
  );
  return { provider, contract };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('BridgeHTLC: redeem path with native BCH', async () => {
  const { provider, contract } = buildHTLC();
  const utxo = fundHTLC(contract, provider, 10_000n);

  const builder = new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.redeem(secretBytes, responder.pubKey, responder.signer))
    .addOutput({ to: responder.address, amount: 9000n });

  // Evaluate in libauth VM
  builder.debug();
  const tx = builder.build();

  assert.ok(tx, 'redeem tx should build without error');
  console.log('✓ redeem path: BCH HTLC redeemed with correct secret');
});

test('BridgeHTLC: redeem with wrong secret fails', async () => {
  const { provider, contract } = buildHTLC();
  const utxo = fundHTLC(contract, provider, 10_000n);

  const wrongSecret = utf8ToBin('wrong-secret');

  // .debug() runs the BCH VM and throws if the script fails
  assert.throws(
    () => {
      new TransactionBuilder({ provider })
        .addInput(utxo, contract.unlock.redeem(wrongSecret, responder.pubKey, responder.signer))
        .addOutput({ to: responder.address, amount: 9000n })
        .debug();
    },
    (err: Error) => /wrong secret/i.test(err.message),
    'wrong secret should cause VM failure',
  );
  console.log('✓ wrong secret correctly rejected');
});

test('BridgeHTLC: refund path after timelock', async () => {
  const timelock = 800_000n;
  const { provider, contract } = buildHTLC(timelock);
  provider.setBlockHeight(800_100);
  const utxo = fundHTLC(contract, provider, 10_000n);

  const builder = new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.refund(initiator.pubKey, initiator.signer))
    .addOutput({ to: initiator.address, amount: 9000n })
    .setLocktime(Number(timelock));

  builder.debug();
  const tx = builder.build();

  assert.ok(tx, 'refund tx should build when timelock is met');
  console.log('✓ refund path: BCH HTLC refunded after timelock');
});

test('BridgeHTLC: refund before timelock fails', async () => {
  const timelock = 900_000n;
  const { provider, contract } = buildHTLC(timelock);
  const utxo = fundHTLC(contract, provider, 10_000n);

  assert.throws(
    () => {
      new TransactionBuilder({ provider })
        .addInput(utxo, contract.unlock.refund(initiator.pubKey, initiator.signer))
        .addOutput({ to: initiator.address, amount: 9000n })
        .setLocktime(800_000) // below timelock
        .debug();
    },
    (err: Error) => /timelock not expired/i.test(err.message),
    'early refund should fail',
  );
  console.log('✓ early refund correctly rejected');
});

test('BridgeHTLC: redeem with mock PUSD CashToken', async () => {
  const { provider, contract } = buildHTLC();
  const utxo = fundHTLCWithToken(contract, provider, PUSD_CATEGORY, 1_000_000n);

  // For token outputs, the recipient must have a token-aware address (p2pkhWithTokens)
  const tokenAddress = assertSuccess(encodeCashAddress({
    prefix: 'bchtest' as CashAddressNetworkPrefix,
    type: 'p2pkhWithTokens',
    payload: responder.h160,
  })).address;

  const builder = new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.redeem(secretBytes, responder.pubKey, responder.signer))
    .addOutput({ to: tokenAddress, amount: 1000n, token: { category: PUSD_CATEGORY, amount: 1_000_000n } });

  builder.debug();
  const tx = builder.build();

  assert.ok(tx, 'token redeem tx should build');
  console.log('✓ PUSD CashToken HTLC redeemed successfully');
});

test('BridgeHTLC: wrong recipient cannot redeem', async () => {
  const { provider, contract } = buildHTLC();
  const utxo = fundHTLC(contract, provider, 10_000n);

  const attacker = makeWallet('attacker-seed');

  assert.throws(
    () => {
      new TransactionBuilder({ provider })
        .addInput(utxo, contract.unlock.redeem(secretBytes, attacker.pubKey, attacker.signer))
        .addOutput({ to: attacker.address, amount: 9000n })
        .debug();
    },
    (err: Error) => /not the recipient/i.test(err.message),
    'wrong recipient should fail',
  );
  console.log('✓ wrong recipient correctly rejected');
});
