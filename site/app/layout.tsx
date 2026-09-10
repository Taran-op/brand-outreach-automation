import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Brand Outreach Console',
  description: 'Private operator console for AsaiVerse brand outreach.',
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#07111f'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
