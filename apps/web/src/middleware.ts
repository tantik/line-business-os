import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js middleware: refresh the Supabase session on each request so the
 * authenticated cookie state stays valid for server components and route
 * handlers. Auth/authorization decisions live in the protected layout + tenant
 * helpers; this only keeps the session fresh.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on all routes except Next internals, common static assets, and the
  // public health endpoint. `/api/health` is unauthenticated by design, so it
  // must not trigger session refresh (keeps monitor pings cheap + auth-free).
  // Protected-page auth is unaffected: it lives in the protected layout + tenant
  // helpers, not in this matcher.
  matcher: [
    '/((?!api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
