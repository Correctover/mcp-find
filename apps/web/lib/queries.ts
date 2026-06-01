// Two-layer caching:
// - React cache(): deduplicates within a single request/render
// - unstable_cache(): persists across requests with tag-based on-demand revalidation
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import type { Server, ServerListItem, ServerWithTools, ServerListParams, ServerListResponse } from '@mcpfind/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@mcpfind/shared';

// Excludes readme_content and search_vector to avoid pulling large blobs in list queries.
// canonical_slug is included so route generation (sitemap, links) can use the stable URL column.
const SERVER_LIST_COLUMNS = 'id,slug,canonical_slug,name,description,version,category,source,package_name,package_type,package_url,has_tools,has_resources,has_prompts,tool_count,github_url,github_stars,github_forks,github_open_issues,github_last_push,github_license,github_language,github_contributors,github_archived,npm_weekly_downloads,registry_status,registry_published_at,registry_updated_at,registry_tags,is_official,featured,created_at,updated_at,last_synced_at';

async function _listServers(params: ServerListParams): Promise<ServerListResponse> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, params.limit || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;
  const sort = params.sort || 'stars';
  const status = params.status || 'active';

  let query = supabase
    .from('servers')
    .select(SERVER_LIST_COLUMNS, { count: 'exact' })
    .eq('registry_status', status);

  // Full-text search
  if (params.q) {
    query = query.textSearch('search_vector', params.q, { type: 'websearch' });
  }

  // Category filter
  if (params.category) {
    query = query.eq('category', params.category);
  }

  // Package type filter (OR within group)
  if (params.packageTypes?.length) {
    query = query.in('package_type', params.packageTypes);
  }

  // Language filter (OR within group)
  if (params.languages?.length) {
    query = query.in('github_language', params.languages);
  }

  // Capability filters
  if (params.hasTools) query = query.eq('has_tools', true);
  if (params.hasResources) query = query.eq('has_resources', true);
  if (params.hasPrompts) query = query.eq('has_prompts', true);

  // Badge filters
  if (params.isOfficial) query = query.eq('is_official', true);
  if (params.featured) query = query.eq('featured', true);

  // Sort
  switch (sort) {
    case 'stars': query = query.order('github_stars', { ascending: false }); break;
    case 'updated': query = query.order('github_last_push', { ascending: false, nullsFirst: false }); break;
    case 'name': query = query.order('name', { ascending: true }); break;
    case 'downloads': query = query.order('npm_weekly_downloads', { ascending: false }); break;
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(`Query failed: ${error.message}`);

  return {
    servers: (data || []) as ServerListItem[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

export const listServers = cache(
  (params: ServerListParams): Promise<ServerListResponse> => {
    const cacheKey = [
      params.category ?? '',
      params.q ?? '',
      String(params.page ?? 1),
      String(params.limit ?? DEFAULT_PAGE_SIZE),
      params.sort ?? '',
      (params.packageTypes ?? []).join(','),
      (params.languages ?? []).join(','),
      params.hasTools ? '1' : '',
      params.hasResources ? '1' : '',
      params.hasPrompts ? '1' : '',
      params.isOfficial ? '1' : '',
      params.featured ? '1' : '',
    ].join('\x00');
    return unstable_cache(
      () => _listServers(params),
      ['list-servers', cacheKey],
      { tags: ['servers'], revalidate: 3600 }
    )();
  }
);

// Inner function — does the actual Supabase fetch.
// Resolves by canonical_slug first (stable URL column), then falls back to slug
// so this is safe to deploy before migration 005_canonical_slug.sql is applied.
async function _getServerBySlug(slug: string): Promise<ServerWithTools | null> {
  // Try canonical_slug first (populated after migration 005 runs).
  // If no match, fall back to the mutable slug column (pre-migration or community servers).
  let { data: server, error } = await supabase
    .from('servers')
    .select('*')
    .eq('canonical_slug', slug)
    .maybeSingle();

  if (!server) {
    // Defensive fallback: resolve by the mutable slug column.
    // This path is hit before migration 005 is applied, or for rows where
    // canonical_slug has not yet been backfilled.
    const result = await supabase
      .from('servers')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    server = result.data;
    error = result.error;
  }

  if (error || !server) return null;

  const { data: tools } = await supabase
    .from('server_tools')
    .select('*')
    .eq('server_id', server.id);

  return { ...server, tools: tools || [] } as ServerWithTools;
}

// React cache() deduplicates within a single request; unstable_cache persists
// across requests and supports tag-based on-demand revalidation.
export const getServerBySlug = cache(
  (slug: string): Promise<ServerWithTools | null> =>
    unstable_cache(
      () => _getServerBySlug(slug),
      ['server-by-slug', slug],
      { tags: ['servers', `server-${slug}`], revalidate: 86400 }
    )()
);

export const getServerCount = cache(
  (): Promise<number> =>
    unstable_cache(
      async () => {
        const { count } = await supabase
          .from('servers')
          .select('*', { count: 'exact', head: true })
          .eq('registry_status', 'active');
        return count || 0;
      },
      ['server-count'],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

export const getTopServers = cache(
  (limit: number): Promise<ServerListItem[]> =>
    unstable_cache(
      async () => {
        const { data } = await supabase
          .from('servers')
          .select(SERVER_LIST_COLUMNS)
          .eq('registry_status', 'active')
          .order('github_stars', { ascending: false })
          .limit(limit);
        return (data || []) as ServerListItem[];
      },
      ['top-servers', String(limit)],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

// Fetch a page of servers for sitemap generation (offset-based, no total count needed).
// Supabase caps each query at 1,000 rows, so we paginate internally in 1,000-row chunks
// to return up to pageSize rows per sitemap batch.
export const getServersSitemapPage = cache(
  (offset: number, pageSize: number): Promise<Pick<ServerListItem, 'slug' | 'canonical_slug' | 'updated_at'>[]> =>
    unstable_cache(
      async () => {
        const SUPABASE_MAX = 1000;
        const allRows: Pick<ServerListItem, 'slug' | 'canonical_slug' | 'updated_at'>[] = [];
        for (let i = 0; i < pageSize; i += SUPABASE_MAX) {
          const chunkSize = Math.min(SUPABASE_MAX, pageSize - i);
          const { data } = await supabase
            .from('servers')
            // Include canonical_slug so the sitemap emits stable URLs after migration 005.
            .select('slug,canonical_slug,updated_at')
            .eq('registry_status', 'active')
            .order('github_stars', { ascending: false })
            .range(offset + i, offset + i + chunkSize - 1);
          if (!data || data.length === 0) break;
          allRows.push(...(data as Pick<ServerListItem, 'slug' | 'canonical_slug' | 'updated_at'>[]));
          if (data.length < chunkSize) break;
        }
        return allRows;
      },
      ['servers-sitemap-page', String(offset), String(pageSize)],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

// React cache() for request-level dedup; unstable_cache for cross-request persistence with tags.
export const getServersByCategory = cache(
  (category: string): Promise<ServerListItem[]> =>
    unstable_cache(
      async () => {
        const { data } = await supabase
          .from('servers')
          .select(SERVER_LIST_COLUMNS)
          .eq('category', category)
          .eq('registry_status', 'active')
          .order('github_stars', { ascending: false })
          .limit(200);
        return (data || []) as ServerListItem[];
      },
      ['servers-by-category', category],
      { tags: ['servers', `category-${category}`], revalidate: 3600 }
    )()
);

export const getCategoryLastUpdated = cache(
  (): Promise<Record<string, string>> =>
    unstable_cache(
      async () => {
        const { data } = await supabase
          .from('servers')
          .select('category, updated_at')
          .eq('registry_status', 'active')
          .order('updated_at', { ascending: false });

        const result: Record<string, string> = {};
        for (const row of data || []) {
          if (row.category && !result[row.category]) {
            result[row.category] = row.updated_at;
          }
        }
        return result;
      },
      ['category-last-updated'],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

export const getLastSyncTime = cache(
  (): Promise<string | null> =>
    unstable_cache(
      async () => {
        const { data } = await supabase
          .from('sync_log')
          .select('completed_at')
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();
        return data?.completed_at || null;
      },
      ['last-sync-time'],
      { tags: ['servers'], revalidate: 3600 }
    )()
);
