import type { NextConfig } from 'next';

const config: NextConfig = {
  // A standalone build bundles only the files actually reached, which keeps the
  // container small and means the runtime image needs no node_modules copy.
  output: 'standalone',

  // The workspace root is two levels up; without this Next traces the wrong
  // directory and omits files from the standalone output.
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,

  // The bridge is the user's own server, not ours, so nothing here proxies to
  // it. The browser talks to it directly — see docs/saas/connectivity.md.
  reactStrictMode: true,

};

export default config;
