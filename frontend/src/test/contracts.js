import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository's top-level `contracts/` directory. Resolved with
 * `node:path` rather than `new URL(..., import.meta.url)`, which Vite would
 * try to bundle as an asset (and deny, being outside the frontend root). */
const CONTRACTS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../contracts'
);

/**
 * Reads one of the shared frontend/backend contracts in the repository's
 * top-level `contracts/` directory (see `contracts/README.md`). Tests only:
 * application code must never import the contracts.
 *
 * @param {string} name - File name inside `contracts/`.
 * @returns {any} The parsed JSON document.
 */
export const readContract = (name) =>
  JSON.parse(readFileSync(resolve(CONTRACTS_DIR, name), 'utf8'));
