import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import AppShell from '@/components/AppShell';
import { UserSessionProvider } from '@/contexts/UserSessionContext';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'RASHMI GREEN HYDROGEN STEEL PVT. LTD. | Seamless WIP Tracking',
  description: 'Rashmi Green Hydrogen Steel Pvt. Ltd. (Seamless Division) — Production and Work Order WIP Tracking with route-aware stages, rolling plans, diversion management, user profiles, and admin control panel.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('app_theme');
                  if (saved === 'navy') saved = 'ocean';
                  var theme = saved || 'light';
                  document.documentElement.setAttribute('data-theme', theme);
                  if (theme !== 'light' && theme !== 'cobalt') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
        <link rel="preconnect" href="https://dzhvbftmuwfyuaarsxtk.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://dzhvbftmuwfyuaarsxtk.supabase.co" />
      </head>
      <body className={`${inter.className} antialiased bg-canvas-pattern min-h-screen text-slate-900 dark:text-slate-100 transition-colors duration-150`}>
        <UserSessionProvider>
          <AppShell>{children}</AppShell>
        </UserSessionProvider>
        <Toaster richColors position="top-right" closeButton duration={4500} />
      </body>
    </html>
  );
}

