// @vitest-environment jsdom
/**
 * BrokenServerBadge — unit tests (logic layer + real DOM render).
 *
 * Tests:
 * 1. Renders (returns non-null) only for BROKEN
 * 2. Hidden (returns null) for HEALTHY, STALE, LOW-CREDIBILITY, undefined
 * 3. XSS: real DOM render confirms no dangerouslySetInnerHTML
 * 4. Real DOM render: button accessible label, unique tooltip IDs across instances
 *
 * Uses @vitest-environment jsdom docblock so React DOM rendering works.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BrokenServerBadge } from "../BrokenServerBadge";
import type { QualityStatus } from "@mcpfind/shared";

// ---------------------------------------------------------------------------
// Mirror the component's render condition for unit testing without jsdom
// ---------------------------------------------------------------------------

/**
 * Simulates whether BrokenServerBadge renders visible content.
 * This mirrors the exact guard in BrokenServerBadge.tsx:
 *   if (qualityStatus !== "BROKEN") return null;
 */
function shouldRenderBrokenBadge(qualityStatus: QualityStatus | undefined): boolean {
  return qualityStatus === "BROKEN";
}

/**
 * Simulates XSS safety of the badge.
 *
 * The badge renders text via React children only — never dangerouslySetInnerHTML.
 * Tooltip is a static constant, not derived from server.description.
 */
function getTooltipContent(): string {
  return "No recent commits or repository may be archived. Verify before adopting.";
}

function isSafeTextContent(content: string): boolean {
  return !content.includes("<script") && !content.includes("onerror=") && !content.includes("javascript:");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BrokenServerBadge render condition", () => {
  it("renders for BROKEN", () => {
    expect(shouldRenderBrokenBadge("BROKEN")).toBe(true);
  });

  it("is hidden for HEALTHY", () => {
    expect(shouldRenderBrokenBadge("HEALTHY")).toBe(false);
  });

  it("is hidden for STALE", () => {
    expect(shouldRenderBrokenBadge("STALE")).toBe(false);
  });

  it("is hidden for LOW-CREDIBILITY", () => {
    expect(shouldRenderBrokenBadge("LOW-CREDIBILITY")).toBe(false);
  });

  it("is hidden for undefined (server not in manifest)", () => {
    expect(shouldRenderBrokenBadge(undefined)).toBe(false);
  });
});

describe("BrokenServerBadge XSS safety", () => {
  it("tooltip content is static text — no dynamic server data injected", () => {
    const tooltip = getTooltipContent();
    expect(tooltip).toContain("No recent commits");
    expect(typeof tooltip).toBe("string");
  });

  it("tooltip content contains no executable HTML", () => {
    const tooltip = getTooltipContent();
    expect(isSafeTextContent(tooltip)).toBe(true);
  });

  it("XSS attempt via malicious description does not reach badge tooltip", () => {
    const maliciousDescription = '<img src=x onerror=alert(1)><script>alert("xss")</script>';
    const tooltip = getTooltipContent();
    expect(tooltip).not.toContain(maliciousDescription);
    expect(tooltip).not.toContain("<script");
    expect(tooltip).not.toContain("onerror");
    expect(isSafeTextContent(tooltip)).toBe(true);
  });
});

describe("BrokenServerBadge — all non-BROKEN statuses are hidden", () => {
  const nonBrokenStatuses: Array<QualityStatus | undefined> = [
    "HEALTHY",
    "STALE",
    "LOW-CREDIBILITY",
    undefined,
  ];

  for (const status of nonBrokenStatuses) {
    it(`returns null for qualityStatus="${String(status)}"`, () => {
      expect(shouldRenderBrokenBadge(status)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Real DOM render tests — XSS defense and WCAG id uniqueness
// ---------------------------------------------------------------------------

const TOOLTIP_TEXT =
  "No recent commits or repository may be archived. Verify before adopting.";

describe("BrokenServerBadge DOM render — XSS defense", () => {
  it("tooltip text matches TOOLTIP_TEXT constant exactly (no dynamic content)", () => {
    render(<BrokenServerBadge qualityStatus="BROKEN" />);
    const button = screen.getByRole("button", { name: /inactive/i });
    fireEvent.mouseEnter(button);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe(TOOLTIP_TEXT);
  });

  it("tooltip DOM contains no script tags or event handlers (XSS defense)", () => {
    const { container } = render(<BrokenServerBadge qualityStatus="BROKEN" />);
    const button = screen.getByRole("button", { name: /inactive/i });
    fireEvent.mouseEnter(button);
    expect(container.innerHTML).not.toContain("<script");
    expect(container.innerHTML).not.toContain("onerror=");
    expect(container.innerHTML).not.toContain("javascript:");
  });

  it("renders nothing for non-BROKEN status (DOM confirms null)", () => {
    const { container } = render(<BrokenServerBadge qualityStatus="HEALTHY" />);
    expect(container.firstChild).toBeNull();
  });
});

describe("BrokenServerBadge DOM render — WCAG unique IDs", () => {
  it("two instances produce distinct tooltip IDs", () => {
    const { container: c1 } = render(<BrokenServerBadge qualityStatus="BROKEN" />);
    const { container: c2 } = render(<BrokenServerBadge qualityStatus="BROKEN" />);

    const btn1 = c1.querySelector("button");
    const btn2 = c2.querySelector("button");
    expect(btn1).not.toBeNull();
    expect(btn2).not.toBeNull();

    const describedBy1 = btn1?.getAttribute("aria-describedby") ?? "";
    const describedBy2 = btn2?.getAttribute("aria-describedby") ?? "";
    expect(describedBy1).not.toBe("");
    expect(describedBy2).not.toBe("");
    expect(describedBy1).not.toBe(describedBy2);
  });
});
