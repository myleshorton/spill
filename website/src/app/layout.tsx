import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spill — The Censorship-Resistant Publishing Platform',
  description:
    'An open protocol for distributing content that cannot be taken down. Publish anything. Preserve everything. No single point of failure.',
  metadataBase: new URL('https://spill.network'),
  openGraph: {
    title: 'Spill — The Censorship-Resistant Publishing Platform',
    description:
      'An open protocol for distributing content that cannot be taken down.',
    type: 'website',
    url: 'https://spill.network',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Outfit:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body bg-spill-bg text-spill-text">
        {children}
      </body>
    </html>
  );
}
