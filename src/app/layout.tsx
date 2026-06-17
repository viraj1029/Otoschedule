import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DM_Sans } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AuriCall — ENT Residency Scheduling Platform',
  description: 'Automate call schedules, manage resident requests, and track equity for otolaryngology residency programs.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: 'dark' }}>
      <body className={dmSans.variable}>{children}</body>
    </html>
  );
}
