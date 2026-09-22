import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id, m=19 MiB, t=2, p=1 (OWASP minimum, docs/07 §4). Parameters are embedded in the encoded
 * hash string, so a future parameter change only affects new hashes; `needsRehash` catches the rest.
 * `algorithm: 2` is `Algorithm.Argon2id` — the numeric literal is used directly because the package
 * exports it as a `const enum`, which isolatedModules (required by Next.js/SWC) can't import as a value.
 */
const PARAMS = { algorithm: 2 as const, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

export async function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

export async function verifyPassword(hashString: string, password: string): Promise<boolean> {
  try {
    return await verify(hashString, password, PARAMS);
  } catch {
    return false;
  }
}

/** True when a stored hash was made with weaker parameters than the current policy. */
export function needsRehash(hashString: string): boolean {
  const match = /\$m=(\d+),t=(\d+),p=(\d+)/.exec(hashString);
  if (!match) return true;
  const [, memoryCost, timeCost, parallelism] = match.map(Number);
  return (
    memoryCost !== PARAMS.memoryCost ||
    timeCost !== PARAMS.timeCost ||
    parallelism !== PARAMS.parallelism
  );
}

/**
 * A fixed dummy hash verified against on unknown-email sign-in attempts, so failure timing does not
 * reveal whether the account exists (docs/07 §3.2). Generated once; the password is never real.
 */
export const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$z2jqyQGSBPY+VK4Ew3Zzuw$YekeHUhZYrQPSjo7aHJPwMTwBgMIRa/w/ubh5bSbZMA";
