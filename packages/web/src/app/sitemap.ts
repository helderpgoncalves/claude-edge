import type { MetadataRoute } from 'next';
import { origin } from '@claude-edge/shared';

import { DEFAULT_LOCALE, HTML_LANG, LOCALES, localePath } from '@/i18n/config.ts';

/**
 * Sitemap, covering every locale.
 *
 * Each URL carries an `alternates.languages` block, which is the sitemap
 * equivalent of the hreflang tags in the page head. Declaring it in both places
 * is not redundant — a crawler that reaches a page from a link uses the tags,
 * one that arrives from the sitemap uses this, and disagreement between the two
 * is treated as a reason to trust neither.
 *
 * The paths live in one list below, so adding a page is one line rather than
 * three.
 */

const LOCALISED = [
  { path: '/', priority: 1, changeFrequency: 'weekly' as const },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
];

/**
 * Pages that exist once rather than per locale.
 *
 * The documentation is English-only: the technical long-tail queries it targets
 * are searched in English almost exclusively, and a half-translated set of docs
 * is worse than an honestly monolingual one.
 */
const UNLOCALISED = [
  { path: '/docs', priority: 0.8, changeFrequency: 'weekly' as const },
  { path: '/signup', priority: 0.6, changeFrequency: 'monthly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const localised = LOCALES.flatMap((locale) =>
    LOCALISED.map(({ path, priority, changeFrequency }) => ({
      url: `${origin()}${localePath(locale, path)}`,
      lastModified: now,
      changeFrequency,
      // Translations sit below the canonical English page rather than
      // competing with it for the same queries.
      priority: locale === DEFAULT_LOCALE ? priority : priority * 0.9,
      alternates: {
        languages: Object.fromEntries(
          LOCALES.map((other) => [
            HTML_LANG[other],
            `${origin()}${localePath(other, path)}`,
          ]),
        ),
      },
    })),
  );

  const plain = UNLOCALISED.map(({ path, priority, changeFrequency }) => ({
    url: `${origin()}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  return [...localised, ...plain];
}
