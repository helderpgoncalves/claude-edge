import type { MetadataRoute } from 'next';
import { url } from '@claude-edge/shared';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The authenticated app has nothing worth indexing and everything worth
      // keeping out of a search result.
      disallow: ['/app/', '/api/'],
    },
    sitemap: url('/sitemap.xml'),
  };
}
