import type { MetadataRoute } from 'next';
import { url } from '@claude-edge/shared';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: url('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: url('/docs'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: url('/signup'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
