import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(_request: NextRequest) {
  // In preview / demo mode, allow seamless access to all application views
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};


