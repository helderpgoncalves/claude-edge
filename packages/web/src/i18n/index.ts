import { BRAND, origin } from '@claude-edge/shared';
import type { Metadata } from 'next';

import { DEFAULT_LOCALE, HTML_LANG, LOCALES, localePath, type Locale } from './config.ts';
import { en, type Dictionary } from './dictionaries/en.ts';
import { es } from './dictionaries/es.ts';
import { pt } from './dictionaries/pt.ts';

export * from './config.ts';
export type { Dictionary };

/**
 * All three dictionaries, statically imported.
 *
 * Deliberately not `await import()`. The usual App Router pattern lazy-loads
 * translations to keep them out of the bundle, which is worth doing when a
 * dictionary is large. These are a few kilobytes of text on a statically
 * generated page, so the dynamic import would buy nothing and cost the ability
 * to use these in `generateStaticParams` and `generateMetadata` without
 * awaiting.
 */
const DICTIONARIES: Record<Locale, Dictionary> = { en, pt, es };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/**
 * Static params for every locale, so all three are generated at build time
 * rather than rendered on demand.
 */
export function localeParams(): Array<{ locale: Locale }> {
  return LOCALES.map((locale) => ({ locale }));
}

/**
 * Builds the `alternates` block for a page.
 *
 * Three things have to agree or the hreflang is ignored:
 *
 *   - every locale lists every other, **including itself** — a self-referencing
 *     hreflang is required and its absence is the single most common reason a
 *     set of alternates is silently dropped;
 *   - `x-default` points at the canonical locale, which is what a search engine
 *     serves to a user whose language matches nothing;
 *   - the canonical is the locale's *own* URL, never the English one. Pointing
 *     every translation's canonical at English is the other common mistake and
 *     it deindexes the translations.
 */
export function alternatesFor(locale: Locale, path = '/'): Metadata['alternates'] {
  const languages: Record<string, string> = {};

  for (const other of LOCALES) {
    languages[HTML_LANG[other]] = `${origin()}${localePath(other, path)}`;
  }

  languages['x-default'] = `${origin()}${localePath(DEFAULT_LOCALE, path)}`;

  return {
    canonical: `${origin()}${localePath(locale, path)}`,
    languages,
  };
}

/**
 * Page metadata for a locale.
 *
 * Title and description come from the dictionary, so a translated page has a
 * translated search result rather than an English one — which is most of the
 * point of translating it at all.
 */
export function metadataFor(locale: Locale, path = '/'): Metadata {
  const t = getDictionary(locale);
  const canonical = `${origin()}${localePath(locale, path)}`;

  return {
    // The brand is appended by the root layout's title template, so adding it
    // here too produces "Title · Claude Edge · Claude Edge". Verified in the
    // built HTML — it is not theoretical.
    title: t.meta.title,
    description: t.meta.description,
    alternates: alternatesFor(locale, path),
    openGraph: {
      type: 'website',
      locale: HTML_LANG[locale],
      url: canonical,
      siteName: BRAND.NAME,
      title: `${t.meta.title} · ${BRAND.NAME}`,
      description: t.meta.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${t.meta.title} · ${BRAND.NAME}`,
      description: t.meta.description,
    },
  };
}
