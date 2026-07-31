import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LOCALES, negotiateLocale, localePath, isLocale } from '../src/i18n/config.ts';
import { en } from '../src/i18n/dictionaries/en.ts';
import { pt } from '../src/i18n/dictionaries/pt.ts';
import { es } from '../src/i18n/dictionaries/es.ts';

/**
 * i18n tests.
 *
 * The type system already guarantees that every key exists in every
 * dictionary — `satisfies Dictionary` fails to compile otherwise. What it
 * cannot guarantee is array *length*, because these are arrays rather than
 * tuples: a translation with five FAQ entries where English has six compiles
 * cleanly and renders a short page.
 *
 * That gap is the main thing tested here.
 */

const DICTIONARIES = { en, pt, es };

/** Collects every array in a dictionary, keyed by its path. */
function arrayLengths(value: unknown, path = ''): Map<string, number> {
  const found = new Map<string, number>();

  if (Array.isArray(value)) {
    found.set(path, value.length);
    value.forEach((item, index) => {
      for (const [k, v] of arrayLengths(item, `${path}[${index}]`)) found.set(k, v);
    });
    return found;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      for (const [k, v] of arrayLengths(child, childPath)) found.set(k, v);
    }
  }

  return found;
}

describe('dictionaries', () => {
  const reference = arrayLengths(en);

  for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
    if (locale === 'en') continue;

    it(`${locale} has the same number of items in every list as en`, () => {
      const actual = arrayLengths(dictionary);

      for (const [path, expected] of reference) {
        assert.equal(
          actual.get(path),
          expected,
          `${locale}: ${path} has ${actual.get(path)} items, en has ${expected}`,
        );
      }
    });
  }

  for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
    it(`${locale} has no empty strings`, () => {
      const empties: string[] = [];

      (function walk(value: unknown, path: string) {
        if (typeof value === 'string') {
          if (value.trim() === '') empties.push(path);
          return;
        }
        if (value && typeof value === 'object') {
          for (const [key, child] of Object.entries(value)) {
            walk(child, path ? `${path}.${key}` : key);
          }
        }
      })(dictionary, '');

      assert.deepEqual(empties, [], `empty strings at: ${empties.join(', ')}`);
    });
  }

  it('translations are not copies of the English source', () => {
    // A dictionary created by copying en.ts and forgetting to translate would
    // satisfy every other check here. Comparing the headline catches it.
    assert.notEqual(pt.hero.title, en.hero.title);
    assert.notEqual(es.hero.title, en.hero.title);
    assert.notEqual(pt.hero.title, es.hero.title);
  });
});

describe('negotiateLocale', () => {
  it('picks the highest quality value rather than the first tag', () => {
    // The naive implementation takes the first tag and gets this backwards.
    assert.equal(negotiateLocale('pt;q=0.5, en;q=0.9'), 'en');
    assert.equal(negotiateLocale('en;q=0.4, es;q=0.8'), 'es');
  });

  it('matches on the primary subtag', () => {
    assert.equal(negotiateLocale('pt-BR'), 'pt');
    assert.equal(negotiateLocale('es-419,es;q=0.9'), 'es');
    assert.equal(negotiateLocale('en-GB'), 'en');
  });

  it('treats a missing q as 1', () => {
    assert.equal(negotiateLocale('es, en;q=0.9'), 'es');
  });

  it('falls back to English for anything unrecognised', () => {
    assert.equal(negotiateLocale('de-DE,de;q=0.9'), 'en');
    assert.equal(negotiateLocale(null), 'en');
    assert.equal(negotiateLocale(''), 'en');
  });

  it('ignores q=0, which means "not acceptable"', () => {
    assert.equal(negotiateLocale('pt;q=0'), 'en');
  });

  it('does not throw on a malformed header', () => {
    assert.equal(negotiateLocale(';;;'), 'en');
    assert.equal(negotiateLocale('pt;q=notanumber'), 'en');
  });
});

describe('localePath', () => {
  it('prefixes every locale, including the default', () => {
    assert.equal(localePath('en', '/'), '/en');
    assert.equal(localePath('pt', '/'), '/pt');
  });

  it('joins sub-paths without doubling the slash', () => {
    assert.equal(localePath('es', '/privacy'), '/es/privacy');
    assert.equal(localePath('es', 'privacy'), '/es/privacy');
  });
});

describe('isLocale', () => {
  it('accepts the three we serve and rejects everything else', () => {
    for (const locale of LOCALES) assert.equal(isLocale(locale), true);
    assert.equal(isLocale('de'), false);
    assert.equal(isLocale('EN'), false);
    assert.equal(isLocale(''), false);
  });
});
