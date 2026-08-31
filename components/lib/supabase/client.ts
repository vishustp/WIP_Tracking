import { createBrowserClient } from '@supabase/ssr';
import { createMockClient } from './mock-client';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key && url.startsWith('http')) {
    try {
      return createBrowserClient(url, key) as any;
    } catch {
      return createMockClient() as any;
    }
  }
  return createMockClient() as any;
}

