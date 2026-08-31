import { createBrowserClient } from '@supabase/ssr';
import { createMockClient } from './mock-client';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Local/demo mode is available only when Supabase is not configured.
  if (!url || !key) {
    return createMockClient() as any;
  }

  if (!url.startsWith('http')) {
    throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL');
  }

  // Never silently fall back to the mock client when Supabase is configured.
  // A silent fallback makes the UI look logged in while database requests are
  // actually unauthenticated (anon), which then fails RLS policies.
  return createBrowserClient(url, key) as any;
}
