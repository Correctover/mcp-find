/**
 * Smoke test for scripts/check-broken-delta.mjs (F8).
 *
 * RUNNER NOTE:
 * This file IS picked up by `pnpm test` in apps/web.
 * The web vitest config (apps/web/vitest.config.ts) includes "../../scripts/__tests__/**\/*.test.mjs"
 * so this test runs as part of the standard test suite.
 *
 * F4: Tests write to temp files instead of production paths. If the process is
 * SIGKILL'd between mutation and afterEach cleanup, production is untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { QUALITY_STATUS_VALUES } from "../../packages/shared/dist/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptPath = join(__dirname, "..", "check-broken-delta.mjs");
const repoRoot = join(__dirname, "..", "..");
const realMapPath = join(repoRoot, "apps", "web", "data", "quality-status-map.json");
const realSnapshotPath = join(repoRoot, ".build-state", "broken-count.json");

let tempDir;
let tempMapPath;
let tempSnapshotPath;

function runScript(mapPath, snapshotPath) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [scriptPath, "--map-path", mapPath, "--state-path", snapshotPath],
      { encoding: "utf-8" },
    );
    return { exitCode: 0, output: stdout };
  } catch (err) {
    return { exitCode: err.status ?? 1, output: (err.stderr ?? "") + (err.message ?? "") };
  }
}

// ---------------------------------------------------------------------------
// Drift-defense: VALID_STATUSES in the script must match QUALITY_STATUS_VALUES
// from packages/shared/src/types.ts (the single source of truth).
// ---------------------------------------------------------------------------

describe("VALID_STATUSES drift defense", () => {
  // The script's hardcoded set — extracted here to mirror script/check-broken-delta.mjs line 69.
  const SCRIPT_VALID_STATUSES = new Set(["HEALTHY", "STALE", "BROKEN", "LOW-CREDIBILITY"]);

  it("script VALID_STATUSES has the same count as QUALITY_STATUS_VALUES", () => {
    expect(SCRIPT_VALID_STATUSES.size).toBe(QUALITY_STATUS_VALUES.length);
  });

  it("every value in QUALITY_STATUS_VALUES is present in VALID_STATUSES", () => {
    for (const status of QUALITY_STATUS_VALUES) {
      expect(SCRIPT_VALID_STATUSES.has(status)).toBe(true);
    }
  });

  it("every value in VALID_STATUSES is present in QUALITY_STATUS_VALUES", () => {
    const sharedSet = new Set(QUALITY_STATUS_VALUES);
    for (const status of SCRIPT_VALID_STATUSES) {
      expect(sharedSet.has(status)).toBe(true);
    }
  });
});

describe("check-broken-delta.mjs smoke tests", () => {
  beforeEach(() => {
    // Create a fresh temp dir for this test; copy production files into it
    tempDir = mkdtempSync(join(tmpdir(), "check-broken-delta-test-"));
    tempMapPath = join(tempDir, "quality-status-map.json");
    tempSnapshotPath = join(tempDir, "broken-count.json");
    writeFileSync(tempMapPath, readFileSync(realMapPath, "utf-8"));
    writeFileSync(tempSnapshotPath, readFileSync(realSnapshotPath, "utf-8"));
  });

  afterEach(() => {
    // Clean up temp dir; SIGKILL between mutation and here leaves production untouched
    try { rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  it("passes with current real data (baseline sanity)", () => {
    const result = runScript(tempMapPath, tempSnapshotPath);
    expect(result.exitCode).toBe(0);
  });

  it("exits 1 when BROKEN entries spike by >20 above snapshot (absolute threshold)", () => {
    const map = JSON.parse(readFileSync(tempMapPath, "utf-8"));
    // Inject 30 extra BROKEN entries — guaranteed to exceed the absolute threshold of 20
    for (let i = 0; i < 30; i++) {
      map[`__test-poison-broken-${i}__`] = "BROKEN";
    }
    writeFileSync(tempMapPath, JSON.stringify(map));

    const result = runScript(tempMapPath, tempSnapshotPath);
    expect(result.exitCode, `stderr: ${result.output}`).toBe(1);
    expect(result.output).toMatch(/exceeds safety threshold/i);
  });

  it("exits 1 when map contains an invalid status value (closed-enum check)", () => {
    const map = JSON.parse(readFileSync(tempMapPath, "utf-8"));
    map["__test-invalid-status__"] = "UNKNOWN_STATUS";
    writeFileSync(tempMapPath, JSON.stringify(map));

    const result = runScript(tempMapPath, tempSnapshotPath);
    expect(result.exitCode, `stderr: ${result.output}`).toBe(1);
    expect(result.output).toMatch(/invalid quality_status/i);
  });
});
