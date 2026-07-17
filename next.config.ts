import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dev overlay floats over the UI and intercepts clicks the Playwright
  // suite will target.
  devIndicators: false,
};

export default nextConfig;
