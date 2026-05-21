/**
 * Directory entry quality-status lookup.
 *
 * Source: v1 audit manifest (directory-quality-audit-2026-05-20.json),
 * embedded at build time as data/quality-status-map.json.
 * Will be superseded by v2 manifest after Phase 2 enrichment.
 *
 * The `quality_status` field is a closed TypeScript union type.
 * Unknown values (not in the union) trigger a build error via
 * assertValidQualityStatus().
 */

import type { QualityStatus } from '@mcpfind/shared';
import qualityStatusMapRaw from '../data/quality-status-map.json';

/** All valid quality_status values. Order mirrors severity (best → worst). */
export const QUALITY_STATUS_VALUES: readonly QualityStatus[] = [
  'HEALTHY',
  'STALE',
  'LOW-CREDIBILITY',
  'BROKEN',
] as const;

/**
 * Build-time assertion: throws if `value` is not a valid QualityStatus.
 * Called from the data-validation pipeline so unknown values fail the build.
 */
export function assertValidQualityStatus(value: unknown, context?: string): asserts value is QualityStatus {
  if (typeof value !== 'string' || !(QUALITY_STATUS_VALUES as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid quality_status "${String(value)}"${context ? ` (${context})` : ''}. ` +
      `Must be one of: ${QUALITY_STATUS_VALUES.join(', ')}.`
    );
  }
}

// Runtime validation: every entry in the map is a valid QualityStatus.
// This runs at module load time (i.e., build time in Next.js SSG) and will
// throw during `next build` if the manifest contains unknown values.
const qualityStatusMap: Record<string, QualityStatus> = (() => {
  const raw = qualityStatusMapRaw as Record<string, string>;
  const result: Record<string, QualityStatus> = {};
  for (const [slug, status] of Object.entries(raw)) {
    assertValidQualityStatus(status, `slug=${slug}`);
    result[slug] = status;
  }
  return result;
})();

/**
 * Look up the quality_status for a given server slug.
 * Returns undefined for slugs not in the manifest (e.g. newly added servers).
 */
export function getQualityStatus(slug: string): QualityStatus | undefined {
  return qualityStatusMap[slug];
}

/**
 * Returns the count of entries with the given quality_status in the manifest.
 * Used by the build-fail snapshot test.
 */
export function countByStatus(status: QualityStatus): number {
  return Object.values(qualityStatusMap).filter((s) => s === status).length;
}

export { qualityStatusMap };
