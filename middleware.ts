import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase credentials are not configured, allow access to all app routes seamlessly
  if (!url || !key || !url.startsWith('http')) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: { headers: request.headers } });
  try {
    const supabase = createServerClient(
      url,
      key,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response = NextResponse.next({ request: { headers: request.headers } });
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    const path = request.nextUrl.pathname;
    if (!user && path !== '/login') return NextResponse.redirect(new URL('/login', request.url));
    if (user && path === '/login') return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch {
    return NextResponse.next();
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

