import { getServersSitemapBatch } from '@/lib/sitemap-servers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return getServersSitemapBatch(1);
}
