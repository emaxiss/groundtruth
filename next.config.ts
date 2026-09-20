import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dev overlay floats over the composer and intercepts clicks from
  // browser automation.
  devIndicators: false,
};

export default nextConfig;
