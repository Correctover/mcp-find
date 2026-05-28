"use client";
/**
 * StaleServerBadge — renders an informative badge when a server's
 * quality_status is "STALE" (last commit > 12 months ago).
 *
 * Hard rules:
 * - All text via React children — NEVER dangerouslySetInnerHTML
 * - Accessible: icon + text (not color-only); aria-label on tooltip trigger
 * - Matches mcpfind dark brand palette (neutral/amber tones)
 * - prefers-reduced-motion: tooltip does not animate when motion is reduced
 */

import { useState, useCallback, useId } from "react";
import { IconClock } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { QualityStatus } from "@mcpfind/shared";

interface StaleServerBadgeProps {
  /** The server's quality_status from the audit manifest. */
  qualityStatus: QualityStatus | undefined;
  /** Optional extra className on the wrapper. */
  className?: string;
}

const TOOLTIP_TEXT =
  "Last commit > 12 months ago. Verify this server is still maintained before adopting.";

export function StaleServerBadge({ qualityStatus, className }: StaleServerBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  // F2: unique id per instance (React 18 useId) — fixes duplicate DOM id WCAG violation
  const tooltipId = useId();

  const showTooltip = useCallback(() => setTooltipVisible(true), []);
  const hideTooltip = useCallback(() => setTooltipVisible(false), []);

  // Only render for STALE entries
  if (qualityStatus !== "STALE") return null;

  return (
    // F1: add `relative` so tooltip top/left positions against this wrapper, not a distant ancestor
    <div className={cn("relative inline-flex items-center", className)}>
      {/* Badge trigger — accessible button so keyboard users can access tooltip */}
      <button
        type="button"
        className={cn(
          "relative inline-flex items-center gap-1.5 text-xs font-medium",
          "px-2.5 py-1 rounded-full",
          "bg-amber-500/10 text-amber-400 border border-amber-500/20",
          "hover:bg-amber-500/20 hover:border-amber-500/30 transition-colors duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          "cursor-default"
        )}
        aria-label={`May be outdated: ${TOOLTIP_TEXT}`}
        aria-describedby={tooltipId}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        <IconClock size={12} aria-hidden="true" />
        <span>May be outdated</span>
      </button>

      {/* Tooltip — text-only, no dangerouslySetInnerHTML */}
      {tooltipVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={cn(
            "absolute z-50 mt-1 max-w-xs",
            "px-3 py-2 rounded-lg text-xs leading-relaxed",
            "bg-neutral-800 text-neutral-200 border border-neutral-700 shadow-lg shadow-black/40",
            // Respect reduced-motion preference via Tailwind (no transform animation)
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-100"
          )}
          style={{ top: "100%", left: 0, position: "absolute" }}
        >
          {/* Plain text content — never dangerouslySetInnerHTML */}
          {TOOLTIP_TEXT}
        </div>
      )}
    </div>
  );
}
