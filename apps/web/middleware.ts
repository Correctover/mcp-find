import { NextRequest, NextResponse } from 'next/server';
import deletedSlugsData from './data/deleted-server-slugs.json';

// Bake the deleted-slug set into a module-level constant so it is evaluated
// once at cold-start — no per-request file I/O in edge middleware.
const DELETED_SERVER_SLUGS = new Set<string>(deletedSlugsData.slugs);

// NOTE: This rate limiter is in-memory and only effective on a single process.
// On free-tier Vercel (serverless), each function invocation may run in a
// separate process, so this provides best-effort rate limiting only.
const rateMap = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 100;
const WINDOW_MS = 60_000;

function getClientIp(request: NextRequest): string {
  // Vercel provides request.ip; fallback to rightmost x-forwarded-for (proxy-appended)
  if (request.ip) return request.ip;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',');
    return parts[parts.length - 1]!.trim();
  }
  return 'unknown';
}

export function middleware(request: NextRequest) {
  // Return 410 Gone for permanently deleted server pages so Googlebot stops
  // retrying and drops them from the index faster than it would on a 404.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/servers/')) {
    const slug = pathname.slice('/servers/'.length).split('/')[0];
    if (slug && DELETED_SERVER_SLUGS.has(slug)) {
      return new Response(null, { status: 410 });
    }
  }

  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || entry.resetAt < now) {
    // Lazy eviction: stale entry is replaced
    rateMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return NextResponse.next();
  }

  entry.count++;
  if (entry.count > LIMIT) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: 'Rate limited. Please wait before making more requests.', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // Evict stale entries every 1000 requests
  if (rateMap.size > 1000) {
    for (const [key, entry] of rateMap) {
      if (entry.resetAt < now) rateMap.delete(key);
    }
  }

  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*', '/servers/:slug*'] };
