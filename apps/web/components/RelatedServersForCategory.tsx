/**
 * RelatedServersForCategory — Server Component
 *
 * Renders a "Related MCP servers in [category]" aside block inside blog posts.
 * Filters to HEALTHY entries only — never exposes stale/broken servers in
 * editorial context. Emits data-conversion attributes for future GA4 tracking.
 *
 * This is intentionally a Server Component so it is rendered at build/request
 * time with no client-side JS overhead.
 */

import Link from "next/link";
import { getServersByCategory } from "@/lib/queries";
import { getQualityStatus } from "@/lib/quality-status";
import { ServerCard } from "@/components/ui/server-card";
import { CATEGORY_LABELS } from "@mcpfind/shared";
import type { Category } from "@mcpfind/shared";

interface RelatedServersForCategoryProps {
  category: string;
  currentSlug?: string;
  maxItems?: number;
}

export async function RelatedServersForCategory({
  category,
  currentSlug,
  maxItems = 5,
}: RelatedServersForCategoryProps) {
  // Guard: if category is absent or not a known category, render nothing.
  if (!category) return null;

  // Guard: Supabase credentials may be absent in CI / local static builds.
  // Rather than crashing the blog post prerender, degrade gracefully.
  let allServers;
  try {
    allServers = await getServersByCategory(category);
  } catch {
    return null;
  }

  // Pre-build status map — one getQualityStatus call per server (not 2N).
  const statusMap = new Map(allServers.map((s) => [s.slug, getQualityStatus(s.slug)]));

  // Filter to HEALTHY entries only, excluding the current blog post's slug.
  // Explicit category guard ensures no cross-category bleed if the data layer ever returns extras.
  const filtered = allServers.filter((server) => {
    if (server.category !== category) return false;
    if (currentSlug && server.slug === currentSlug) return false;
    return statusMap.get(server.slug) === "HEALTHY";
  });

  // Sort by stars descending (getServersByCategory already does this, but we
  // re-sort here to be explicit after filtering).
  filtered.sort((a, b) => b.github_stars - a.github_stars);

  const servers = filtered.slice(0, maxItems);

  // Return null for empty state — don't render a hollow section.
  if (servers.length === 0) return null;

  const categoryLabel =
    CATEGORY_LABELS[category as Category] ?? category;

  const totalCount = filtered.length;

  return (
    <aside
      aria-labelledby="related-servers-heading"
      className="mt-12 border-t border-neutral-800 pt-10"
    >
      <h2
        id="related-servers-heading"
        className="text-xl font-bold text-white mb-6"
      >
        Related MCP servers in {categoryLabel}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {servers.map((server) => (
          <div
            key={server.slug}
            // Wrap the card in a div so we can attach data-conversion without
            // clashing with ServerCard's internal <Link>.
          >
            {/* The data-conversion anchor sits outside ServerCard so we don't
                alter the card component. We use a wrapper div with a data tag
                that the future GA4 script can read via closest('[data-conversion]'). */}
            <div
              data-conversion="blog_to_servers_click"
              data-source={currentSlug ?? ""}
              data-target={server.slug}
              data-category={category}
            >
              <ServerCard
                server={server}
                qualityStatus={statusMap.get(server.slug)}
              />
            </div>
          </div>
        ))}
      </div>

      {totalCount > maxItems && (
        <div className="mt-6">
          <Link
            href={`/categories/${category}`}
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Browse all {totalCount} {categoryLabel} servers
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </aside>
  );
}
