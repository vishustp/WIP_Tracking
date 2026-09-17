import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import AppShell from '@/components/AppShell';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Seamless WIP Planning',
  description: 'Production and Work Order WIP Tracking with route-aware stages, rolling plans, diversion management, user profiles, and admin control panel.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://dzhvbftmuwfyuaarsxtk.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://dzhvbftmuwfyuaarsxtk.supabase.co" />
      </head>
      <body className={`${inter.className} antialiased bg-slate-50 text-slate-900`}>
        <AppShell>{children}</AppShell>
        <Toaster richColors position="top-right" closeButton duration={4500} />
      </body>
    </html>
  );
}

