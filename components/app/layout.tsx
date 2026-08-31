import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Seamless WIP Planning',
  description: 'Production and Work Order WIP Tracking with route-aware stages, rolling plans, diversion management, user profiles, and admin control panel.',
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body><AppShell>{children}</AppShell><Toaster richColors position="top-right" /></body></html>;
}
