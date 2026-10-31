import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith('/api');
  const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || !url.startsWith('http')) {
    if (isApi) {
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  let response = NextResponse.next({ request });

  try {
    // 1. Check Bearer token in Authorization header
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    if (bearerToken) {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      });
      const { data, error } = await supabase.auth.getUser(bearerToken);
      if (!error && data?.user) return response;
    }

    // 2. Check session cookies
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) return response;
  } catch {
    // Fall through
  }

  // Handle unauthorized requests
  if (isApi) {
    if (isMutation || pathname.startsWith('/api/admin')) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid session or Bearer token required.' },
        { status: 401 }
      );
    }
    // Allow read-only GET on non-admin API routes
    return response;
  }

  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
