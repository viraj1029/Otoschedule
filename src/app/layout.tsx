import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OTO Call Scheduler — UTSW',
  description: 'UTSW CUH/PMH Block call schedule management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: 'dark' }}>
      <body>{children}</body>
    </html>
  );
}
