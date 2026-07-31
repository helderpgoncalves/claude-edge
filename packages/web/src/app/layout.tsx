import type { Metadata, Viewport } from 'next';
import { BRAND, origin, url } from '@claude-edge/shared';

import './globals.css';

/**
 * Root layout.
 *
 * WHY THIS RENDERS NO <html> TAG
 * -----------------------------
 * `<html lang>` has to be the page's actual language, and the language lives in
 * the `[locale]` segment below this one — which a root layout cannot read from
 * params. The obvious workaround is `headers()`, but calling it here opts the
 * entire route tree into dynamic rendering, and that silently un-statics every
 * marketing page. The build output says so plainly: `ƒ` rather than `○`.
 *
 * So `[locale]/layout.tsx` renders `<html>` and `<body>` itself, and this file
 * is a pass-through that exists only to hold the shared metadata and to import
 * the stylesheet once. Next permits exactly one layout in the chain to emit
 * those tags, and pushing it down one level is what keeps the pages static.
 *
 * The metadata below is what does not vary by language. Per-locale titles,
 * descriptions and hreflang alternates are set in `[locale]/layout.tsx`.
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
    'voice control',
    'cycling coach',
  ],

  authors: [{ name: 'Hélder Gonçalves', url: BRAND.REPO }],
  creator: 'Hélder Gonçalves',

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },

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
  return children;
}

export { url };
