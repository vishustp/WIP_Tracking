import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createMockClient } from './mock-client';

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Local/demo mode is available only when Supabase is not configured.
  if (!url || !key) {
    return createMockClient() as any;
  }

  if (!url.startsWith('http')) {
    throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL');
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components may not allow cookie mutation. Middleware handles
          // session refresh; reads still work here.
        }
      },
    },
  }) as any;
}
