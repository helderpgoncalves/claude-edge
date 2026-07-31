import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the browser vault.
 *
 * These matter more than most: the vault is the reason bridge tokens are not in
 * our database, and that claim is only worth making if the encryption actually
 * works. "It looked encrypted" is not evidence.
 *
 * Node 22 provides Web Crypto globally, so the same code the browser runs is
 * exercised here. Only localStorage is stubbed.
 */

// Minimal localStorage, since Node has none.
class MemoryStorage {
  #data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.#data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.#data.set(k, v);
  }
  removeItem(k: string): void {
    this.#data.delete(k);
  }
  clear(): void {
    this.#data.clear();
  }
  /** Test-only: what is actually on disk, for asserting on the ciphertext. */
  raw(k: string): string | null {
    return this.#data.get(k) ?? null;
  }
}

const storage = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage;

// btoa/atob exist in Node 16+, but assert rather than assume.
assert.ok(typeof btoa === 'function', 'btoa is required');
assert.ok(typeof crypto?.subtle?.deriveKey === 'function', 'Web Crypto is required');

const { Vault, destroyVault } = await import('../src/lib/vault.ts');

const PASSPHRASE = 'correct horse battery staple';
const OTHER_PASSPHRASE = 'incorrect horse battery staple';
const TOKEN = 'dev-write-token-dev-write-token-dev-wr';
const BRIDGE_ID = '11111111-2222-3333-4444-555555555555';

describe('vault lifecycle', () => {
  beforeEach(() => storage.clear());

  it('reports whether a vault exists on this device', async () => {
    assert.equal(Vault.exists(), false);
    await Vault.create(PASSPHRASE);
    assert.equal(Vault.exists(), true);
  });

  it('stores and returns a credential', async () => {
    const vault = await Vault.create(PASSPHRASE);
    await vault.set(BRIDGE_ID, TOKEN);
    assert.equal(vault.get(BRIDGE_ID), TOKEN);
  });

  it('returns null for a bridge this device does not hold', async () => {
    const vault = await Vault.create(PASSPHRASE);
    assert.equal(vault.get('unknown-bridge'), null);
  });

  it('survives a lock and unlock cycle', async () => {
    const first = await Vault.create(PASSPHRASE);
    await first.set(BRIDGE_ID, TOKEN);

    // Unlocking is what happens after a page reload: nothing is kept in memory.
    const second = await Vault.unlock(PASSPHRASE);
    assert.ok(second, 'unlock failed with the correct passphrase');
    assert.equal(second.get(BRIDGE_ID), TOKEN);
  });

  it('removes a credential', async () => {
    const vault = await Vault.create(PASSPHRASE);
    await vault.set(BRIDGE_ID, TOKEN);
    await vault.remove(BRIDGE_ID);
    assert.equal(vault.get(BRIDGE_ID), null);

    const reopened = await Vault.unlock(PASSPHRASE);
    assert.equal(reopened?.get(BRIDGE_ID), null);
  });

  it('holds credentials for several bridges', async () => {
    const vault = await Vault.create(PASSPHRASE);
    await vault.set('bridge-a', 'token-a');
    await vault.set('bridge-b', 'token-b');
    assert.deepEqual(vault.bridgeIds().sort(), ['bridge-a', 'bridge-b']);
    assert.equal(vault.get('bridge-a'), 'token-a');
    assert.equal(vault.get('bridge-b'), 'token-b');
  });
});

describe('the token is genuinely encrypted at rest', () => {
  beforeEach(() => storage.clear());

  it('does not appear in what is written to disk', async () => {
    // The property the whole design rests on. If the token were recoverable
    // from storage, moving it out of the database would have achieved nothing.
    const vault = await Vault.create(PASSPHRASE);
    await vault.set(BRIDGE_ID, TOKEN);

    const stored = storage.raw('ce.vault.v1');
    assert.ok(stored, 'nothing was written');
    assert.ok(!stored.includes(TOKEN), 'the token is present in plaintext');

    // Nor in any obvious encoding of it.
    assert.ok(!stored.includes(btoa(TOKEN)), 'the token is present, base64-encoded');
  });

  it('writes only salt, IV and ciphertext', async () => {
    const vault = await Vault.create(PASSPHRASE);
    await vault.set(BRIDGE_ID, TOKEN);

    const parsed = JSON.parse(storage.raw('ce.vault.v1') as string);
    assert.deepEqual(Object.keys(parsed).sort(), ['data', 'iv', 'salt', 'version']);
  });

  it('uses a fresh IV on every write', async () => {
    // Reusing an IV with the same AES-GCM key is a total break, not a weakness.
    const vault = await Vault.create(PASSPHRASE);

    await vault.set('a', 'token-a');
    const first = JSON.parse(storage.raw('ce.vault.v1') as string).iv;

    await vault.set('b', 'token-b');
    const second = JSON.parse(storage.raw('ce.vault.v1') as string).iv;

    assert.notEqual(first, second, 'the IV was reused across writes');
  });

  it('uses a different salt for each vault', async () => {
    await Vault.create(PASSPHRASE);
    const first = JSON.parse(storage.raw('ce.vault.v1') as string).salt;

    storage.clear();
    await Vault.create(PASSPHRASE);
    const second = JSON.parse(storage.raw('ce.vault.v1') as string).salt;

    // A shared salt would let one rainbow table cover every user.
    assert.notEqual(first, second, 'the same salt was used for two vaults');
  });
});

describe('a wrong passphrase', () => {
  beforeEach(() => storage.clear());

  it('fails to unlock', async () => {
    const vault = await Vault.create(PASSPHRASE);
    await vault.set(BRIDGE_ID, TOKEN);

    const attempt = await Vault.unlock(OTHER_PASSPHRASE);
    assert.equal(attempt, null);
  });

  it('cannot produce a partially-decrypted vault', async () => {
    // AES-GCM authenticates its ciphertext, so a wrong key fails outright
    // rather than yielding plausible-looking garbage. Worth asserting, because
    // a mode without authentication would silently return nonsense.
    const vault = await Vault.create(PASSPHRASE);
    await vault.set(BRIDGE_ID, TOKEN);

    for (const wrong of ['', ' ', PASSPHRASE + ' ', PASSPHRASE.toUpperCase()]) {
      assert.equal(await Vault.unlock(wrong), null, `"${wrong}" unlocked the vault`);
    }
  });
});

describe('tampering', () => {
  beforeEach(() => storage.clear());

  it('is rejected when the ciphertext is modified', async () => {
    const vault = await Vault.create(PASSPHRASE);
    await vault.set(BRIDGE_ID, TOKEN);

    const stored = JSON.parse(storage.raw('ce.vault.v1') as string);
    // Flip one character of the ciphertext.
    stored.data = stored.data.slice(0, -1) + (stored.data.at(-1) === 'A' ? 'B' : 'A');
    storage.setItem('ce.vault.v1', JSON.stringify(stored));

    assert.equal(await Vault.unlock(PASSPHRASE), null);
  });

  it('is rejected when the IV is modified', async () => {
    const vault = await Vault.create(PASSPHRASE);
    await vault.set(BRIDGE_ID, TOKEN);

    const stored = JSON.parse(storage.raw('ce.vault.v1') as string);
    stored.iv = stored.iv.slice(0, -1) + (stored.iv.at(-1) === 'A' ? 'B' : 'A');
    storage.setItem('ce.vault.v1', JSON.stringify(stored));

    assert.equal(await Vault.unlock(PASSPHRASE), null);
  });

  it('does not throw on corrupted storage', async () => {
    // A half-written value should sign the user out, not crash the app.
    for (const junk of ['', 'not json', '{}', '{"version":1}']) {
      storage.setItem('ce.vault.v1', junk);
      assert.equal(await Vault.unlock(PASSPHRASE), null, `threw or unlocked on: ${junk}`);
    }
  });
});

describe('destroyVault', () => {
  it('removes everything from the device', async () => {
    storage.clear();
    const vault = await Vault.create(PASSPHRASE);
    await vault.set(BRIDGE_ID, TOKEN);

    destroyVault();

    assert.equal(Vault.exists(), false);
    assert.equal(storage.raw('ce.vault.v1'), null);
    assert.equal(await Vault.unlock(PASSPHRASE), null);
  });
});
