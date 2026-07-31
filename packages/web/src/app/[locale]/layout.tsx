import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BRAND, origin } from '@claude-edge/shared';

import {
  HTML_LANG,
  getDictionary,
  isLocale,
  localeParams,
  localePath,
  metadataFor,
  type Locale,
} from '@/i18n/index.ts';

export function generateStaticParams() {
  return localeParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return metadataFor(locale, '/');
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // A path like /de reaches here because the middleware only redirects paths
  // with no locale at all. Anything unrecognised is a 404 rather than a silent
  // fallback to English, which would otherwise create infinite indexable URLs.
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale as Locale);

  /*
   * This layout renders <html> and <body>, not the root one.
   *
   * `lang` must be the page's real language — it is what a screen reader uses
   * to pick a pronunciation, and Portuguese read by an English synthesiser is
   * close to unintelligible. The locale is only knowable here, and reading it
   * in the root layout would require `headers()`, which forces the whole tree
   * to render dynamically. See the note in `app/layout.tsx`.
   */
  return (
    <html lang={HTML_LANG[locale as Locale]}>
      <body>
      {/*
        Structured data, per locale.

        `inLanguage` matters here: the same product described three times
        without it looks like duplicate content. FAQPage is the other half —
        it is what produces the expandable questions in a result, and the
        questions on this site are real ones people ask before buying.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: BRAND.NAME,
              description: t.meta.description,
              inLanguage: HTML_LANG[locale as Locale],
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Garmin Connect IQ, Linux, macOS',
              url: `${origin()}${localePath(locale as Locale, '/')}`,
              codeRepository: BRAND.REPO,
              license: 'https://www.gnu.org/licenses/agpl-3.0.html',
              offers: [
                {
                  '@type': 'Offer',
                  price: '0',
                  priceCurrency: 'EUR',
                  description: t.pricing.plans.free.description,
                },
                {
                  '@type': 'Offer',
                  price: '5',
                  priceCurrency: 'EUR',
                  description: t.pricing.plans.pro.description,
                },
              ],
              author: { '@type': 'Person', name: 'Hélder Gonçalves' },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              inLanguage: HTML_LANG[locale as Locale],
              mainEntity: t.faq.items.map((item) => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a },
              })),
            },
          ]),
        }}
      />

      {/* Keyboard users should not have to tab through the nav on every page. */}
      <a href="#main" className="sr-only">
        {t.nav.skipToContent}
      </a>

      {children}
      </body>
    </html>
  );
}
