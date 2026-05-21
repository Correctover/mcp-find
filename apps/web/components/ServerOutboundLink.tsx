"use client";

/**
 * ServerOutboundLink — Client Component
 *
 * Wraps any outbound anchor on the server detail page.
 * Fires server_outbound_click with only server_slug and destination_host —
 * never the full URL with query strings.
 */

import { trackServerOutboundClick } from "@/lib/analytics";
import type { ReactNode } from "react";

interface ServerOutboundLinkProps {
  href: string;
  serverSlug: string;
  className?: string;
  rel?: string;
  target?: string;
  children: ReactNode;
}

export function ServerOutboundLink({
  href,
  serverSlug,
  className,
  rel = "noopener noreferrer",
  target = "_blank",
  children,
}: ServerOutboundLinkProps) {
  function handleClick() {
    try {
      // Extract only the hostname — never log full URL with query strings
      const destinationHost = new URL(href).hostname;
      trackServerOutboundClick({ server_slug: serverSlug, destination_host: destinationHost });
    } catch {
      // Malformed URL — skip tracking, don't block navigation
    }
  }

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
