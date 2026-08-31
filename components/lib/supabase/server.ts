import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createMockClient } from './mock-client';

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key && url.startsWith('http')) {
    try {
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
            } catch {}
          },
        },
      }) as any;
    } catch {
      return createMockClient() as any;
    }
  }

  return createMockClient() as any;
}

