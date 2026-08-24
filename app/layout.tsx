import './globals.css';
import { Toaster } from 'sonner';
import AppShell from '@/components/AppShell';

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body><AppShell>{children}</AppShell><Toaster richColors position="top-right" /></body></html>;
}
