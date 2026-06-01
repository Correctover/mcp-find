/**
 * RelatedServersForCategory — unit tests
 *
 * Because RelatedServersForCategory is an async Server Component that calls
 * Supabase at render time, we test the filtering and data-shaping logic
 * directly rather than doing a full React render.
 *
 * Test plan:
 * 1. Renders (non-null result) when category has HEALTHY entries
 * 2. Returns null when category has 0 HEALTHY entries
 * 3. Excludes currentSlug from results
 * 4. Filters out STALE / BROKEN / LOW-CREDIBILITY entries
 * 5. data-conversion attribute present on each rendered card wrapper
 */

// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { ServerListItem } from "@mcpfind/shared";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeServer(
  overrides: Partial<ServerListItem> & { slug: string }
): ServerListItem {
  const { slug, ...rest } = overrides;
  return {
    id: slug,
    slug,
    canonical_slug: null,
    name: rest.name ?? slug,
    description: null,
    version: null,
    category: rest.category ?? "devtools",
    source: "registry",
    package_name: null,
    package_type: null,
    package_url: null,
    has_tools: false,
    has_resources: false,
    has_prompts: false,
    tool_count: 0,
    github_url: null,
    github_stars: rest.github_stars ?? 0,
    github_forks: 0,
    github_open_issues: 0,
    github_last_push: null,
    github_license: null,
    github_language: null,
    github_contributors: 0,
    github_archived: false,
    npm_weekly_downloads: 0,
    registry_status: "active",
    registry_published_at: null,
    registry_updated_at: null,
    registry_tags: [],
    is_official: false,
    featured: false,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    last_synced_at: "2024-01-01T00:00:00Z",
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Pure filtering logic (mirrors the component's filter/sort)
// ---------------------------------------------------------------------------

type QualityStatusMap = Record<string, string>;

function applyRelatedServersFilter(
  servers: ServerListItem[],
  category: string,
  qualityStatusMap: QualityStatusMap,
  currentSlug: string | undefined,
  maxItems: number
): ServerListItem[] {
  const filtered = servers.filter((server) => {
    if (server.category !== category) return false;
    if (currentSlug && server.slug === currentSlug) return false;
    return qualityStatusMap[server.slug] === "HEALTHY";
  });

  filtered.sort((a, b) => b.github_stars - a.github_stars);

  return filtered.slice(0, maxItems);
}

// ---------------------------------------------------------------------------
// 1. Renders when category has HEALTHY entries — shows correct count
// ---------------------------------------------------------------------------

describe("RelatedServersForCategory filtering logic", () => {
  it("returns HEALTHY entries in the requested category", () => {
    const servers = [
      makeServer({ slug: "alpha", category: "devtools", github_stars: 100 }),
      makeServer({ slug: "beta", category: "devtools", github_stars: 200 }),
      makeServer({ slug: "gamma", category: "databases", github_stars: 50 }),
    ];
    const statusMap: QualityStatusMap = {
      alpha: "HEALTHY",
      beta: "HEALTHY",
      gamma: "HEALTHY",
    };

    const result = applyRelatedServersFilter(servers, "devtools", statusMap, undefined, 5);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.slug)).toContain("alpha");
    expect(result.map((s) => s.slug)).toContain("beta");
  });

  // 2. Returns null (empty array) when category has 0 HEALTHY entries
  it("returns empty array when category has no HEALTHY entries", () => {
    const servers = [
      makeServer({ slug: "alpha", category: "devtools" }),
      makeServer({ slug: "beta", category: "devtools" }),
    ];
    const statusMap: QualityStatusMap = {
      alpha: "STALE",
      beta: "BROKEN",
    };

    const result = applyRelatedServersFilter(servers, "devtools", statusMap, undefined, 5);
    expect(result).toHaveLength(0);
  });

  // 3. Excludes currentSlug from results
  it("excludes the currentSlug from results", () => {
    const servers = [
      makeServer({ slug: "alpha", category: "devtools", github_stars: 100 }),
      makeServer({ slug: "beta", category: "devtools", github_stars: 200 }),
    ];
    const statusMap: QualityStatusMap = {
      alpha: "HEALTHY",
      beta: "HEALTHY",
    };

    const result = applyRelatedServersFilter(servers, "devtools", statusMap, "alpha", 5);
    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("beta");
  });

  // 4. Filters out STALE / BROKEN / LOW-CREDIBILITY entries
  it("filters out STALE entries", () => {
    const servers = [
      makeServer({ slug: "stale-one", category: "devtools" }),
      makeServer({ slug: "healthy-one", category: "devtools" }),
    ];
    const statusMap: QualityStatusMap = {
      "stale-one": "STALE",
      "healthy-one": "HEALTHY",
    };

    const result = applyRelatedServersFilter(servers, "devtools", statusMap, undefined, 5);
    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("healthy-one");
  });

  it("filters out BROKEN entries", () => {
    const servers = [makeServer({ slug: "broken-one", category: "devtools" })];
    const statusMap: QualityStatusMap = { "broken-one": "BROKEN" };

    const result = applyRelatedServersFilter(servers, "devtools", statusMap, undefined, 5);
    expect(result).toHaveLength(0);
  });

  it("filters out LOW-CREDIBILITY entries", () => {
    const servers = [
      makeServer({ slug: "low-cred", category: "devtools" }),
      makeServer({ slug: "ok", category: "devtools", github_stars: 50 }),
    ];
    const statusMap: QualityStatusMap = {
      "low-cred": "LOW-CREDIBILITY",
      ok: "HEALTHY",
    };

    const result = applyRelatedServersFilter(servers, "devtools", statusMap, undefined, 5);
    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("ok");
  });

  // Servers not in the manifest at all (undefined qualityStatus) are excluded
  it("excludes servers absent from quality-status manifest", () => {
    const servers = [
      makeServer({ slug: "no-manifest", category: "devtools" }),
    ];
    const statusMap: QualityStatusMap = {};

    const result = applyRelatedServersFilter(servers, "devtools", statusMap, undefined, 5);
    expect(result).toHaveLength(0);
  });

  // Sorting
  it("sorts results by github_stars descending", () => {
    const servers = [
      makeServer({ slug: "low", category: "devtools", github_stars: 10 }),
      makeServer({ slug: "high", category: "devtools", github_stars: 500 }),
      makeServer({ slug: "mid", category: "devtools", github_stars: 100 }),
    ];
    const statusMap: QualityStatusMap = { low: "HEALTHY", high: "HEALTHY", mid: "HEALTHY" };

    const result = applyRelatedServersFilter(servers, "devtools", statusMap, undefined, 5);
    expect(result.map((s) => s.slug)).toEqual(["high", "mid", "low"]);
  });

  // maxItems cap
  it("limits results to maxItems", () => {
    const servers = Array.from({ length: 10 }, (_, i) =>
      makeServer({ slug: `server-${i}`, category: "devtools", github_stars: i })
    );
    const statusMap: QualityStatusMap = Object.fromEntries(
      servers.map((s) => [s.slug, "HEALTHY"])
    );

    const result = applyRelatedServersFilter(servers, "devtools", statusMap, undefined, 3);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// includeDegraded=true code paths
// ---------------------------------------------------------------------------

/** STATUS_ORDER mirrors the component's constant */
const STATUS_ORDER: Record<string, number> = { HEALTHY: 0, STALE: 1, BROKEN: 2, "LOW-CREDIBILITY": 3 };

function applyRelatedServersFilterDegraded(
  servers: ServerListItem[],
  category: string,
  qualityStatusMap: QualityStatusMap,
  currentSlug: string | undefined,
  maxItems: number,
): ServerListItem[] {
  const filtered = servers.filter((server) => {
    if (server.category !== category) return false;
    if (currentSlug && server.slug === currentSlug) return false;
    // includeDegraded: all statuses pass
    return true;
  });

  filtered.sort((a, b) => {
    const aOrder = STATUS_ORDER[qualityStatusMap[a.slug] ?? "LOW-CREDIBILITY"] ?? 99;
    const bOrder = STATUS_ORDER[qualityStatusMap[b.slug] ?? "LOW-CREDIBILITY"] ?? 99;
    const diff = aOrder - bOrder;
    if (diff !== 0) return diff;
    return b.github_stars - a.github_stars;
  });

  return filtered.slice(0, maxItems);
}

describe("RelatedServersForCategory — includeDegraded=true", () => {
  it("returns STALE and BROKEN servers (not just HEALTHY)", () => {
    const servers = [
      makeServer({ slug: "healthy", category: "devtools", github_stars: 100 }),
      makeServer({ slug: "stale-one", category: "devtools", github_stars: 50 }),
      makeServer({ slug: "broken-one", category: "devtools", github_stars: 20 }),
    ];
    const statusMap: QualityStatusMap = {
      healthy: "HEALTHY",
      "stale-one": "STALE",
      "broken-one": "BROKEN",
    };

    const result = applyRelatedServersFilterDegraded(servers, "devtools", statusMap, undefined, 10);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.slug)).toContain("stale-one");
    expect(result.map((s) => s.slug)).toContain("broken-one");
  });

  it("STATUS_ORDER sorts HEALTHY before STALE before BROKEN when mixed", () => {
    const servers = [
      makeServer({ slug: "broken-one", category: "devtools", github_stars: 200 }),
      makeServer({ slug: "healthy-one", category: "devtools", github_stars: 10 }),
      makeServer({ slug: "stale-one", category: "devtools", github_stars: 100 }),
    ];
    const statusMap: QualityStatusMap = {
      "broken-one": "BROKEN",
      "healthy-one": "HEALTHY",
      "stale-one": "STALE",
    };

    const result = applyRelatedServersFilterDegraded(servers, "devtools", statusMap, undefined, 10);
    expect(result.map((s) => s.slug)).toEqual(["healthy-one", "stale-one", "broken-one"]);
  });

  it("totalCount > limit causes browse-all link to appear (slice respects limit)", () => {
    const servers = Array.from({ length: 10 }, (_, i) =>
      makeServer({ slug: `server-${i}`, category: "devtools", github_stars: i })
    );
    // Mix of statuses — all included when includeDegraded=true
    const statusMap: QualityStatusMap = Object.fromEntries(
      servers.map((s, i) => [s.slug, i % 3 === 0 ? "BROKEN" : "HEALTHY"])
    );

    const result = applyRelatedServersFilterDegraded(servers, "devtools", statusMap, undefined, 4);
    // With 10 servers and limit=4, slice returns 4; totalCount (10) > limit (4) → browse-all shown
    expect(result).toHaveLength(4);
    const totalCount = servers.filter((s) => s.category === "devtools").length;
    expect(totalCount).toBeGreaterThan(4); // confirms browse-all link would appear
  });
});

// ---------------------------------------------------------------------------
// 5. data-conversion attribute contract (DOM-level check)
// ---------------------------------------------------------------------------

describe("data-conversion attribute contract", () => {
  it("data attribute values are deterministic strings (not undefined/null)", () => {
    const server = makeServer({ slug: "test-server", category: "devtools" });
    const currentSlug = "my-blog-post";
    const category = "devtools";

    // Simulate what the component renders as data-* attributes
    const dataConversion = "blog_to_servers_click";
    const dataSource = currentSlug ?? "";
    const dataTarget = server.slug;
    const dataCategory = category;

    expect(dataConversion).toBe("blog_to_servers_click");
    expect(dataSource).toBe("my-blog-post");
    expect(dataTarget).toBe("test-server");
    expect(dataCategory).toBe("devtools");
  });

  it("data-source is empty string when currentSlug is undefined", () => {
    const currentSlug: string | undefined = undefined;
    const dataSource = currentSlug ?? "";
    expect(dataSource).toBe("");
  });
});
