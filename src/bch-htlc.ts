/**
 * src/bch-htlc.ts — BCH BridgeHTLC contract helpers
 *
 * Builds and verifies transactions for the BCH leg of the stablecoin bridge.
 * Runs against CashScript MockNetworkProvider for unit tests (no network needed).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Contract,
  MockNetworkProvider,
  type Artifact,
  type SpendableUtxo,
} from 'cashscript';

const ROOT = new URL('../', import.meta.url).pathname;

export function loadArtifact(): Artifact {
  const p = resolve(ROOT, 'artifacts/BridgeHTLC.json');
  return JSON.parse(readFileSync(p, 'utf8')) as Artifact;
}

export type HTLCParams = {
  hashlock: Uint8Array;      // sha256(secret) — 32 bytes
  recipientHash: Uint8Array; // hash160 of recipient pubkey — 20 bytes
  senderHash: Uint8Array;    // hash160 of sender pubkey — 20 bytes
  timelock: bigint;          // BCH absolute block height
};

/**
 * Create a BridgeHTLC contract instance on a mock provider.
 * The provider is attached to the returned contract as contract.provider.
 */
export function createHTLC(params: HTLCParams, provider: MockNetworkProvider): Contract {
  const artifact = loadArtifact();
  return new Contract(
    artifact,
    [
      params.hashlock,
      params.recipientHash,
      params.senderHash,
      params.timelock,
    ],
    { provider, contractType: 'p2sh32' },
  );
}

/** Add a funded native-BCH UTXO to the mock HTLC contract */
export function fundHTLC(
  contract: Contract,
  provider: MockNetworkProvider,
  satoshis: bigint,
  txid = '01'.repeat(32),
): SpendableUtxo {
  return provider.addUtxo(contract.address, {
    txid,
    vout: 0,
    satoshis,
  });
}

/** Add a funded UTXO with a mock PUSD CashToken to the HTLC (uses tokenAddress) */
export function fundHTLCWithToken(
  contract: Contract,
  provider: MockNetworkProvider,
  tokenCategory: string, // hex
  tokenAmount: bigint,
  satoshis = 2000n,
  txid = '02'.repeat(32),
): SpendableUtxo {
  return provider.addUtxo(contract.tokenAddress, {
    txid,
    vout: 0,
    satoshis,
    token: { category: tokenCategory, amount: tokenAmount },
  });
}

export { MockNetworkProvider };
