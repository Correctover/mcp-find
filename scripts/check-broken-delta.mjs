#!/usr/bin/env node
/**
 * Build-time safety gate: BROKEN-delta snapshot test.
 *
 * Counts BROKEN entries in the current quality-status-map.json and
 * compares to the last-known-good count in .build-state/broken-count.json.
 *
 * Fails the build (exit 1) when:
 *   - Absolute delta > 20 entries, OR
 *   - Delta > 5% of total entries (poisoning defense)
 *
 * On pass: prints "OK: BROKEN-delta check passed."
 * On fail: prints "Manifest BROKEN-delta exceeds safety threshold; review v2 audit before deploying."
 *
 * Usage: node scripts/check-broken-delta.mjs
 * Wired into package.json as "prebuild" in apps/web.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths relative to repo root (scripts/ is at repo root level)
const repoRoot = join(__dirname, '..');

// CLI flags: --map-path <path> and --state-path <path> override defaults.
// Defaults are left unchanged so production prebuild works without arguments.
const args = process.argv.slice(2);
function getFlagValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const mapPath = getFlagValue('--map-path') ?? join(repoRoot, 'apps', 'web', 'data', 'quality-status-map.json');
const snapshotPath = getFlagValue('--state-path') ?? join(repoRoot, '.build-state', 'broken-count.json');

// --- Load quality-status-map.json ---
let qualityMap;
try {
  qualityMap = JSON.parse(readFileSync(mapPath, 'utf-8'));
} catch (err) {
  console.error(`ERROR: Cannot read quality-status-map.json at ${mapPath}: ${err.message}`);
  process.exit(1);
}

// --- Load snapshot ---
let snapshot;
try {
  snapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'));
} catch (err) {
  console.error(`ERROR: Cannot read broken-count.json at ${snapshotPath}: ${err.message}`);
  process.exit(1);
}

// --- Validate snapshot shape ---
const expectedBroken = snapshot.broken_count;
const expectedTotal = snapshot.total_entries;
if (typeof expectedBroken !== 'number' || typeof expectedTotal !== 'number') {
  console.error('ERROR: .build-state/broken-count.json must have numeric broken_count and total_entries fields.');
  process.exit(1);
}

// --- Count current BROKEN entries ---
// MUST stay in sync with QUALITY_STATUS_VALUES in packages/shared/src/types.ts (F7 — drift defense).
// Cannot import the TS constant directly from this .mjs script; sync enforced by code review + comment.
export const VALID_STATUSES = new Set(['HEALTHY', 'STALE', 'BROKEN', 'LOW-CREDIBILITY']);
let currentBroken = 0;
let currentTotal = 0;
const invalidEntries = [];

for (const [slug, status] of Object.entries(qualityMap)) {
  currentTotal++;
  if (!VALID_STATUSES.has(status)) {
    invalidEntries.push({ slug, status });
  }
  if (status === 'BROKEN') {
    currentBroken++;
  }
}

// --- Closed-enum check ---
if (invalidEntries.length > 0) {
  console.error(`ERROR: quality-status-map.json contains ${invalidEntries.length} invalid quality_status value(s):`);
  for (const { slug, status } of invalidEntries.slice(0, 10)) {
    console.error(`  slug="${slug}" status="${status}"`);
  }
  if (invalidEntries.length > 10) {
    console.error(`  ... and ${invalidEntries.length - 10} more.`);
  }
  console.error(`Valid values: ${[...VALID_STATUSES].join(', ')}`);
  process.exit(1);
}

// --- Delta check ---
const delta = Math.abs(currentBroken - expectedBroken);
// Use currentTotal (live map size) as denominator so the percent gate reflects
// current reality. expectedTotal (snapshot) is used only for absolute delta comparison.
const deltaPercent = (delta / currentTotal) * 100;

const ABSOLUTE_THRESHOLD = 20;
const PERCENT_THRESHOLD = 5;

if (delta > ABSOLUTE_THRESHOLD || deltaPercent > PERCENT_THRESHOLD) {
  console.error(
    `Manifest BROKEN-delta exceeds safety threshold; review v2 audit before deploying.\n` +
    `  Expected BROKEN: ${expectedBroken}  |  Current BROKEN: ${currentBroken}\n` +
    `  Delta: ${delta} entries (${deltaPercent.toFixed(2)}% of ${currentTotal} current total)\n` +
    `  Thresholds: absolute >${ABSOLUTE_THRESHOLD} OR percent >${PERCENT_THRESHOLD}%\n` +
    `  To update the snapshot after a legitimate manifest refresh, edit .build-state/broken-count.json.`
  );
  process.exit(1);
}

// --- Total-entries shrinkage gate ---
// Catches accidental mass-deletes that would slip past the BROKEN-delta check.
const TOTAL_DELTA_THRESHOLD_PERCENT = 30;
const totalDelta = Math.abs(currentTotal - expectedTotal);
const totalDeltaPercent = (totalDelta / expectedTotal) * 100;

if (totalDeltaPercent > TOTAL_DELTA_THRESHOLD_PERCENT) {
  console.error(`[gate] FAIL: total entries delta ${totalDeltaPercent.toFixed(2)}% exceeds ${TOTAL_DELTA_THRESHOLD_PERCENT}% threshold`);
  console.error(`Expected ~${expectedTotal}, got ${currentTotal} (delta ${currentTotal > expectedTotal ? '+' : '-'}${totalDelta})`);
  console.error(`If this is intentional (e.g., deliberate cleanup), bump expected_total in broken-count.json baseline`);
  process.exit(1);
}

console.log(
  `OK: BROKEN-delta check passed. ` +
  `BROKEN: ${currentBroken} (expected ${expectedBroken}, delta ${delta}). ` +
  `Total entries: ${currentTotal} (expected ~${expectedTotal}, delta ${totalDelta}, ${totalDeltaPercent.toFixed(2)}%).`
);
