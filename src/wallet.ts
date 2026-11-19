/**
 * src/wallet.ts — BCH wallet helpers for Chipnet
 *
 * Reuses pattern from foldingcash-merkle-claims/src/wallet.ts (MIT).
 * Key change: stripped to HTLC-specific needs.
 */
import {
  secp256k1,
  encodeCashAddress,
  assertSuccess,
  utf8ToBin,
  binToHex,
  hexToBin,
  hash160,
  sha256,
  type CashAddressNetworkPrefix,
} from '@bitauth/libauth';

export type Wallet = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
  hash160: Uint8Array;
};

/**
 * Derive a BCH wallet from a seed string (deterministic, testnet only).
 * sha256 is a module-like object in libauth v3 — call sha256.hash(data).
 */
export function walletFromSeed(seed: string): Wallet {
  const privKey = sha256.hash(utf8ToBin(seed));
  const pubKey = assertSuccess(secp256k1.derivePublicKeyCompressed(privKey));
  const h160 = hash160(pubKey);

  const addr = encodeCashAddress({
    prefix: 'bchtest' as CashAddressNetworkPrefix,
    type: 'p2pkh',
    payload: h160,
  });

  return {
    privateKey: privKey,
    publicKey: pubKey,
    address: assertSuccess(addr).address,
    hash160: h160,
  };
}

/** Convert a 32-byte hex category string to a Uint8Array with reversed bytes */
export function toContractCategory(categoryHex: string): Uint8Array {
  const bytes = hexToBin(categoryHex);
  return bytes.slice().reverse();
}

/** Encode a secret (string or bytes) as sha256 hashlock */
export function secretToHashlock(secret: string): { secretBytes: Uint8Array; hashlock: Uint8Array } {
  const secretBytes = utf8ToBin(secret);
  const hashlock = sha256.hash(secretBytes);
  return { secretBytes, hashlock };
}

export { binToHex, hexToBin, hash160, sha256, utf8ToBin };
