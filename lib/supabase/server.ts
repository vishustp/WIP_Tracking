import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createMockClient } from './mock-client';
import { wrapWithResilience } from './client';

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const mockClient = createMockClient();

  if (url && key && url.startsWith('http')) {
    try {
      const cookieStore = await cookies();
      const real = createServerClient(url, key, {
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
      });
      return wrapWithResilience(real, mockClient) as any;
    } catch {
      return mockClient as any;
    }
  }

  return mockClient as any;
}
