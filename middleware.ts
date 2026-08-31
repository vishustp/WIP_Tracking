import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // When Supabase is configured, ONLY a real Supabase Auth session may
  // authorize access to protected routes. Never let the demo_user cookie
  // bypass authentication, otherwise the browser reaches Supabase as `anon`
  // and RLS correctly rejects protected table access.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key && url.startsWith('http')) {
    try {
      let response = NextResponse.next({ request });
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      });

      const { data } = await supabase.auth.getUser();
      if (data?.user) return response;
    } catch {
      // Fall through to /login. Do not use demo authentication when Supabase
      // is configured.
    }
  } else {
    // Demo/local mode only.
    const demoUser = request.cookies.get('demo_user')?.value;
    if (demoUser) return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
