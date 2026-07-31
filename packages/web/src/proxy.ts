import { NextResponse, type NextRequest } from 'next/server';

import { LOCALES, negotiateLocale } from './i18n/config.ts';

/**
 * Locale routing.
 *
 * Every page lives under `/{locale}`, so a request without one has to be sent
 * somewhere. This picks the best match from Accept-Language and redirects.
 *
 * Named `proxy` rather than `middleware`: Next 16 renamed the convention, and
 * the old name logs a deprecation warning on every build.
 *
 * WHY 307 AND NOT 308
 * -------------------
 * The redirect target depends on a request header, so it is not permanent —
 * the same URL legitimately sends two people to two different places. A 308
 * would be cached by the browser and by any intermediary, pinning the first
 * visitor's language for everyone behind that cache and for that user forever.
 * A 307 is the correct semantics and the `Vary` header below makes it safe to
 * cache correctly.
 *
 * WHY NO COOKIE
 * -------------
 * A stored language preference would need a consent banner in the EU for
 * anything beyond strict necessity, and the site is otherwise cookie-free.
 * The switcher writes the locale into the URL instead, which is shareable,
 * indexable and needs no consent — a better outcome on every axis.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Already localised. Nothing to do.
  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (hasLocale) return NextResponse.next();

  const locale = negotiateLocale(request.headers.get('accept-language'));

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;

  const response = NextResponse.redirect(url, 307);

  // The response varies by language, so a shared cache must not serve one
  // visitor's redirect to another. Without this, a CDN caches whichever
  // language arrived first and every subsequent visitor gets it.
  response.headers.set('Vary', 'Accept-Language');

  return response;
}

export const config = {
  /**
   * Everything except Next's internals, the API, and the metadata files that
   * must stay at the root.
   *
   * `sitemap.xml`, `robots.txt` and `manifest.webmanifest` are excluded
   * deliberately: a crawler requesting `/robots.txt` and being redirected to
   * `/en/robots.txt` finds nothing, and the site would look unindexable. The
   * file extension check at the end covers icons and other static assets.
   */
  matcher: [
    '/((?!_next/|api/|sitemap\\.xml|robots\\.txt|manifest\\.webmanifest|.*\\.[\\w]+$).*)',
  ],
};
