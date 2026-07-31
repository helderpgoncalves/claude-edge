import type { Metadata, Viewport } from 'next';
import { BRAND, origin, url } from '@claude-edge/shared';

import './globals.css';

/**
 * Root metadata.
 *
 * The realistic search traffic for this is long-tail and technical — "claude
 * code garmin edge", "approve claude code prompts remotely", "monitor tmux
 * from phone". Nobody searches for the product by name, because nobody knows
 * it exists. So the metadata is written to answer a question rather than to
 * announce a brand.
 *
 * Everything user-visible comes from BRAND, so a rename does not mean editing
 * the head of every page.
 */
export const metadata: Metadata = {
  metadataBase: new URL(origin()),

  title: {
    default: `${BRAND.NAME} — ${BRAND.TAGLINE}`,
    // Page titles read "Thing · Product", which puts the distinguishing word
    // first where a search result truncates.
    template: `%s · ${BRAND.NAME}`,
  },

  description: BRAND.DESCRIPTION,

  keywords: [
    'garmin edge',
    'claude code',
    'connect iq',
    'tmux',
    'cycling computer',
    'remote terminal',
    'monkey c',
  ],

  authors: [{ name: 'Helder Gonçalves', url: BRAND.REPO }],
  creator: 'Helder Gonçalves',

  openGraph: {
    type: 'website',
    locale: 'en',
    url: origin(),
    siteName: BRAND.NAME,
    title: `${BRAND.NAME} — ${BRAND.TAGLINE}`,
    description: BRAND.DESCRIPTION,
  },

  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.NAME} — ${BRAND.TAGLINE}`,
    description: BRAND.DESCRIPTION,
  },

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },

  alternates: { canonical: origin() },

  // A PWA manifest, because the phone side is installed to the home screen and
  // has to be usable one-handed while stopped at a junction.
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is left enabled deliberately. Locking it is an accessibility failure,
  // and this is read outdoors by people who may not have their glasses.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e13' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Structured data. SoftwareApplication is what produces a rich result
          for a tool like this, and it is one of the few schema types Google
          reliably acts on.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: BRAND.NAME,
              description: BRAND.DESCRIPTION,
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Garmin Connect IQ, Linux, macOS',
              url: origin(),
              codeRepository: BRAND.REPO,
              license: 'https://opensource.org/licenses/MIT',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'EUR',
                description: 'Free and open source. Self-host it yourself.',
              },
              author: { '@type': 'Person', name: 'Helder Gonçalves' },
            }),
          }}
        />
      </head>
      <body>
        {/* Keyboard users should not have to tab through the nav on every page. */}
        <a href="#main" className="sr-only">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

export { url };
