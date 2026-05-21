"use client";

/**
 * BlogConversionTracker — Client Component
 *
 * Attaches a single delegated click listener to its children wrapper.
 * When a click bubbles up, it walks the DOM to find the nearest
 * [data-conversion="blog_to_servers_click"] ancestor and fires the GA4 event.
 *
 * This avoids any modification to the Server Component (RelatedServersForCategory)
 * while respecting the existing data-conversion / data-source / data-target /
 * data-category attribute contract.
 */

import { useCallback, type ReactNode } from "react";
import { trackBlogToServersClick } from "@/lib/analytics";

interface BlogConversionTrackerProps {
  children: ReactNode;
}

export function BlogConversionTracker({ children }: BlogConversionTrackerProps) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Walk up to find the nearest [data-conversion] wrapper
    const conversionEl = target.closest<HTMLElement>(
      "[data-conversion='blog_to_servers_click']"
    );
    if (!conversionEl) return;

    const blogSlug = conversionEl.dataset["source"] ?? "";
    const serverSlug = conversionEl.dataset["target"] ?? "";
    const category = conversionEl.dataset["category"] ?? "";

    trackBlogToServersClick({ blog_slug: blogSlug, server_slug: serverSlug, category });
  }, []);

  return (
    <div onClick={handleClick}>
      {children}
    </div>
  );
}
