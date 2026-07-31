/**
 * i18n configuration.
 *
 * WHY THREE LOCALES
 * -----------------
 * English is canonical: the technical long-tail queries this product can win
 * ("claude code garmin edge", "approve prompts remotely") are searched in
 * English almost exclusively, and the documentation stays English for the same
 * reason. Portuguese and Spanish exist because the audience for the Coach mode
 * — cyclists — is not the same audience as the developer tooling, and that one
 * is genuinely local.
 *
 * WHY NOT next-intl OR A LIBRARY
 * ------------------------------
 * The routing here is one dynamic segment and the dictionaries are three flat
 * objects. A library would add a dependency, a build step and a set of
 * conventions to learn, in exchange for pluralisation rules and message
 * formatting this site does not use. If interpolation beyond simple values is
 * ever needed, revisit — until then the type checker does the job a library
 * would, because a missing key is a compile error rather than a runtime
 * fallback to the key name.
 */

/** The locales this site serves. `en` first: it is the canonical one. */
export const LOCALES = ['en', 'pt', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * The canonical locale. Used for `x-default` hreflang and as the fallback when
 * an Accept-Language header matches nothing we serve.
 */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * BCP 47 tags for `<html lang>` and hreflang.
 *
 * Deliberately region-neutral. `pt` rather than `pt-PT` because a Brazilian
 * reader should get the Portuguese page rather than the English one, and the
 * copy avoids the handful of words where the two diverge enough to matter.
 */
export const HTML_LANG: Record<Locale, string> = {
  en: 'en',
  pt: 'pt',
  es: 'es',
};

/** Names shown in the language switcher, each written in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Builds a path for a locale.
 *
 * Every locale is prefixed, including the default. The alternative — serving
 * English at `/` and the others at `/pt` — means the canonical page has no
 * self-referencing hreflang and makes the middleware ambiguous about whether
 * `/pricing` is an English page or a missing locale. One rule, no exceptions,
 * is worth the slightly longer canonical URL.
 */
export function localePath(locale: Locale, path = '/'): string {
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${clean}`;
}

/**
 * Picks the best locale from an Accept-Language header.
 *
 * Parses quality values properly rather than taking the first tag: a browser
 * sending `pt;q=0.9, en;q=1.0` prefers English, and naive parsers get that
 * backwards. Matching is on the primary subtag, so `es-419` and `es-AR` both
 * resolve to `es`.
 */
export function negotiateLocale(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2);

      const quality = q === undefined ? 1 : Number.parseFloat(q);

      return {
        // Primary subtag only: `pt-BR` → `pt`.
        tag: (tag ?? '').trim().toLowerCase().split('-')[0] ?? '',
        // A malformed q value is treated as lowest priority rather than NaN,
        // which would make the sort non-deterministic.
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    if (isLocale(tag)) return tag;
  }

  return DEFAULT_LOCALE;
}
