/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.ARCHIVER_URL || 'http://localhost:4000'}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
