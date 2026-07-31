/**
 * vault.ts — bridge credentials, held in the browser and never sent to us.
 *
 * WHY THIS EXISTS
 * ---------------
 * A bridge token grants access to a terminal running an agent with shell
 * access. Storing those tokens server-side would mean a single database
 * compromise handed an attacker working credentials to every user's machine —
 * the difference between an embarrassing leak and a catastrophic one.
 *
 * So they never reach our servers. They live in this browser, encrypted with a
 * key derived from a passphrase the user knows and we do not, and are sent
 * directly to the user's own bridge.
 *
 * WHAT THIS DOES AND DOES NOT PROTECT AGAINST
 * -------------------------------------------
 * Protects: a database dump, a compromised server, a subpoena served on us.
 * None of those yield a usable token, because we never hold one.
 *
 * Does not protect: malware on the user's own machine, or an XSS bug in this
 * application. Once the vault is unlocked the plaintext token exists in memory,
 * and script running in this origin could read it. That is inherent to a
 * browser-based client and is why the CSP matters as much as the crypto.
 *
 * Everything here uses the Web Crypto API. No cryptography is implemented,
 * only assembled.
 */

/** localStorage key holding the encrypted blob. */
const VAULT_KEY = 'ce.vault.v1';

/**
 * PBKDF2 iterations.
 *
 * OWASP's 2023 guidance for PBKDF2-HMAC-SHA256 is 600,000. Argon2id would be a
 * better choice, but it is not in the Web Crypto API and shipping a WASM
 * implementation to derive one key is not a trade worth making — the passphrase
 * is one of several defences here, not the only one.
 *
 * At 600k this takes roughly a second on a phone, which is acceptable once per
 * unlock and unacceptable to an attacker doing it millions of times.
 */
const PBKDF2_ITERATIONS = 600_000;

/** A credential for one bridge. */
export interface BridgeCredential {
  /** Matches the bridge row id on the server, which holds the URL and label. */
  bridgeId: string;
  token: string;
}

interface VaultPayload {
  version: 1;
  credentials: BridgeCredential[];
}

interface EncryptedVault {
  version: 1;
  /** Base64url. Random per vault, stored alongside — salts are not secret. */
  salt: string;
  /** Base64url. Random per write; reuse with the same key would be fatal. */
  iv: string;
  /** Base64url AES-GCM ciphertext, including its authentication tag. */
  data: string;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    // Not extractable: the key cannot be read back out of the browser, even by
    // this code, which limits what an XSS bug can exfiltrate.
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// The vault
// ---------------------------------------------------------------------------

/**
 * An unlocked vault.
 *
 * Holds the derived key in memory for the tab's lifetime. Locking discards it,
 * and there is no way to serialise it — closing the tab is equivalent to
 * locking.
 */
export class Vault {
  #key: CryptoKey;
  #salt: Uint8Array;
  #credentials: Map<string, string>;

  private constructor(key: CryptoKey, salt: Uint8Array, credentials: BridgeCredential[]) {
    this.#key = key;
    this.#salt = salt;
    this.#credentials = new Map(credentials.map((c) => [c.bridgeId, c.token]));
  }

  /** Is there a vault on this device? */
  static exists(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(VAULT_KEY) !== null;
  }

  /** Create a new vault. Overwrites any existing one. */
  static async create(passphrase: string): Promise<Vault> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const vault = new Vault(key, salt, []);
    await vault.#persist();
    return vault;
  }

  /**
   * Unlock the vault on this device.
   *
   * @returns null when the passphrase is wrong. AES-GCM authenticates its
   *   ciphertext, so a wrong key fails to decrypt rather than producing
   *   plausible garbage — there is no separate check to get wrong.
   */
  static async unlock(passphrase: string): Promise<Vault | null> {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;

    let stored: EncryptedVault;
    try {
      stored = JSON.parse(raw) as EncryptedVault;
    } catch {
      return null;
    }

    // Storage can hold a half-written or hand-edited value — a browser killed
    // mid-write, a user experimenting in devtools. Parsing succeeds and the
    // fields are missing, so decoding them throws rather than returning null,
    // and the caller gets an exception where it expected "wrong passphrase".
    // The visible symptom is a blank page instead of a prompt to try again.
    if (
      typeof stored?.salt !== 'string' ||
      typeof stored?.iv !== 'string' ||
      typeof stored?.data !== 'string'
    ) {
      return null;
    }

    let salt: Uint8Array;
    let key: CryptoKey;
    try {
      salt = fromBase64Url(stored.salt);
      key = await deriveKey(passphrase, salt);
    } catch {
      // Malformed base64 in the salt.
      return null;
    }

    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64Url(stored.iv) as BufferSource },
        key,
        fromBase64Url(stored.data) as BufferSource,
      );
      const payload = JSON.parse(new TextDecoder().decode(plaintext)) as VaultPayload;
      return new Vault(key, salt, payload.credentials);
    } catch {
      return null;
    }
  }

  /** The token for a bridge, or null if this device does not hold it. */
  get(bridgeId: string): string | null {
    return this.#credentials.get(bridgeId) ?? null;
  }

  async set(bridgeId: string, token: string): Promise<void> {
    this.#credentials.set(bridgeId, token);
    await this.#persist();
  }

  async remove(bridgeId: string): Promise<void> {
    this.#credentials.delete(bridgeId);
    await this.#persist();
  }

  /** Which bridges this device holds credentials for. */
  bridgeIds(): string[] {
    return [...this.#credentials.keys()];
  }

  async #persist(): Promise<void> {
    const payload: VaultPayload = {
      version: 1,
      credentials: [...this.#credentials].map(([bridgeId, token]) => ({ bridgeId, token })),
    };

    // A fresh IV on every write. Reusing one with the same key breaks AES-GCM
    // completely, so this is generated here rather than stored and reused.
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      this.#key,
      new TextEncoder().encode(JSON.stringify(payload)),
    );

    const stored: EncryptedVault = {
      version: 1,
      salt: toBase64Url(this.#salt),
      iv: toBase64Url(iv),
      data: toBase64Url(new Uint8Array(ciphertext)),
    };

    localStorage.setItem(VAULT_KEY, JSON.stringify(stored));
  }
}

/**
 * Delete the vault from this device.
 *
 * Used on sign-out and on "forget this device". Irreversible: the tokens are
 * not recoverable from anywhere else, because nowhere else has them.
 */
export function destroyVault(): void {
  localStorage.removeItem(VAULT_KEY);
}
