/**
 * scripts/build-contracts.ts — Compile BridgeHTLC.cash with cashc
 *
 * Reuses the build pattern from foldingcash-merkle-claims/scripts/build.ts (MIT).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const contractsDir = resolve(ROOT, 'contracts');
const artifactsDir = resolve(ROOT, 'artifacts');

mkdirSync(artifactsDir, { recursive: true });

const contract = 'BridgeHTLC';
const src = resolve(contractsDir, `${contract}.cash`);
const out = resolve(artifactsDir, `${contract}.json`);

console.log(`Compiling ${contract}.cash...`);
execSync(`npx cashc "${src}" --output "${out}"`, { stdio: 'inherit' });
console.log(`→ artifacts/${contract}.json`);
