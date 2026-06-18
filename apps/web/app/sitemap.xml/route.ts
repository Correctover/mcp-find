import { getServerCount } from '@/lib/queries';
import { SITE_URL } from '@mcpfind/shared';

export const dynamic = 'force-dynamic';

// BATCH_SIZE must match the value in sitemap-servers.ts
const BATCH_SIZE = 5000;

export async function GET() {
  const totalServerCount = await getServerCount();
  const totalServerBatches = Math.ceil(totalServerCount / BATCH_SIZE);

  const today = new Date().toISOString().split('T')[0];

  const sitemaps = [
    { loc: `${SITE_URL}/sitemap-static.xml`, lastmod: today },
    ...Array.from({ length: totalServerBatches }, (_, i) => ({
      loc: `${SITE_URL}/sitemap-servers-${i}.xml`,
      lastmod: today,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(s => `  <sitemap>\n    <loc>${s.loc}</loc>\n    <lastmod>${s.lastmod}</lastmod>\n  </sitemap>`).join('\n')}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
