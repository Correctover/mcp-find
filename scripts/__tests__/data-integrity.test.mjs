/**
 * Data-integrity contract test for quality-status-map.json.
 *
 * Catches data-contract violations independently of the build gate.
 * Runs as part of the standard `pnpm test` suite via the vitest config
 * include pattern: "../../scripts/__tests__/**\/*.test.mjs"
 *
 * Assertions:
 *   - No entries have status === "BROKEN"  (post-cleanup invariant)
 *   - No entries have status === "LOW-CREDIBILITY"  (post-cleanup invariant)
 *   - Total entry count matches broken-count.json total_entries
 *   - Every status value is in the closed enum
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QUALITY_STATUS_VALUES } from "../../packages/shared/dist/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = join(__dirname, "..", "..");
const qualityMapPath = join(repoRoot, "apps", "web", "data", "quality-status-map.json");
const snapshotPath = join(repoRoot, ".build-state", "broken-count.json");

const VALID_STATUSES = new Set(QUALITY_STATUS_VALUES);

let qualityMap;
let snapshot;

try {
  qualityMap = JSON.parse(readFileSync(qualityMapPath, "utf-8"));
} catch (err) {
  throw new Error(`Cannot read quality-status-map.json: ${err.message}`);
}

try {
  snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
} catch (err) {
  throw new Error(`Cannot read broken-count.json: ${err.message}`);
}

const entries = Object.entries(qualityMap);
const totalEntries = entries.length;
const expectedTotal = snapshot.total_entries;

describe("data-integrity: quality-status-map.json", () => {
  it("VALID_STATUSES matches QUALITY_STATUS_VALUES canonical enum", () => {
    expect(VALID_STATUSES.size).toBe(QUALITY_STATUS_VALUES.length);
    for (const v of QUALITY_STATUS_VALUES) {
      expect(VALID_STATUSES.has(v)).toBe(true);
    }
  });

  it("has no BROKEN entries (post-cleanup invariant)", () => {
    const broken = entries.filter(([, status]) => status === "BROKEN");
    if (broken.length > 0) {
      console.error(
        `Found ${broken.length} BROKEN entries:`,
        broken.slice(0, 5).map(([slug]) => slug)
      );
    }
    expect(broken.length).toBe(0);
  });

  it("has no LOW-CREDIBILITY entries (post-cleanup invariant)", () => {
    const lowCred = entries.filter(([, status]) => status === "LOW-CREDIBILITY");
    if (lowCred.length > 0) {
      console.error(
        `Found ${lowCred.length} LOW-CREDIBILITY entries:`,
        lowCred.slice(0, 5).map(([slug]) => slug)
      );
    }
    expect(lowCred.length).toBe(0);
  });

  it("total entry count matches broken-count.json total_entries", () => {
    expect(totalEntries).toBe(expectedTotal);
  });

  it("every status value is in the closed enum", () => {
    const invalid = entries.filter(([, status]) => !VALID_STATUSES.has(status));
    if (invalid.length > 0) {
      console.error(
        `Found ${invalid.length} entries with invalid status:`,
        invalid.slice(0, 5)
      );
    }
    expect(invalid.length).toBe(0);
  });

  it("VALID_STATUSES has no extras beyond QUALITY_STATUS_VALUES", () => {
    for (const v of VALID_STATUSES) {
      expect(QUALITY_STATUS_VALUES.includes(v)).toBe(true);
    }
  });
});
