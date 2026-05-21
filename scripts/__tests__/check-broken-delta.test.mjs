/**
 * Smoke test for scripts/check-broken-delta.mjs (F8).
 *
 * RUNNER NOTE:
 * This file IS picked up by `pnpm test` in apps/web.
 * The web vitest config (apps/web/vitest.config.ts) includes "../../scripts/__tests__/**\/*.test.mjs"
 * so this test runs as part of the standard test suite.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptPath = join(__dirname, "..", "check-broken-delta.mjs");
const repoRoot = join(__dirname, "..", "..");
const realMapPath = join(repoRoot, "apps", "web", "data", "quality-status-map.json");
const realSnapshotPath = join(repoRoot, ".build-state", "broken-count.json");

function runScript() {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath], { encoding: "utf-8" });
    return { exitCode: 0, output: stdout };
  } catch (err) {
    return { exitCode: err.status ?? 1, output: (err.stderr ?? "") + (err.message ?? "") };
  }
}

describe("check-broken-delta.mjs smoke tests", () => {
  let originalMap;
  let originalSnapshot;

  beforeEach(() => {
    originalMap = readFileSync(realMapPath, "utf-8");
    originalSnapshot = readFileSync(realSnapshotPath, "utf-8");
  });

  afterEach(() => {
    // Always restore originals so subsequent tests / builds are unaffected
    writeFileSync(realMapPath, originalMap);
    writeFileSync(realSnapshotPath, originalSnapshot);
  });

  it("passes with current real data (baseline sanity)", () => {
    const result = runScript();
    expect(result.exitCode).toBe(0);
  });

  it("exits 1 when BROKEN entries spike by >20 above snapshot (absolute threshold)", () => {
    const map = JSON.parse(originalMap);
    // Inject 30 extra BROKEN entries — guaranteed to exceed the absolute threshold of 20
    for (let i = 0; i < 30; i++) {
      map[`__test-poison-broken-${i}__`] = "BROKEN";
    }
    writeFileSync(realMapPath, JSON.stringify(map));

    const result = runScript();
    expect(result.exitCode, `stderr: ${result.output}`).toBe(1);
    expect(result.output).toMatch(/exceeds safety threshold/i);
  });

  it("exits 1 when map contains an invalid status value (closed-enum check)", () => {
    const map = JSON.parse(originalMap);
    map["__test-invalid-status__"] = "UNKNOWN_STATUS";
    writeFileSync(realMapPath, JSON.stringify(map));

    const result = runScript();
    expect(result.exitCode, `stderr: ${result.output}`).toBe(1);
    expect(result.output).toMatch(/invalid quality_status/i);
  });
});
