import type { MetadataRoute } from 'next';
import { BRAND } from '@claude-edge/shared';

/**
 * PWA manifest.
 *
 * The phone side is installed to the home screen: it is what a rider opens at
 * a junction to type something the Edge's seven buttons cannot.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.NAME,
    short_name: BRAND.NAME,
    description: BRAND.DESCRIPTION,
    start_url: '/app',
    display: 'standalone',
    background_color: '#0c0e13',
    theme_color: '#0c0e13',
    orientation: 'portrait',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
