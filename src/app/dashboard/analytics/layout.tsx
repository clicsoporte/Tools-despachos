/**
 * @fileoverview Layout for the new Analytics section.
 * This layout ensures that any child pages within the /analytics route
 * have access to the main dashboard context and structure.
 */
'use client';

import type { ReactNode } from "react";

export default function AnalyticsLayout({
  children,
}: {
  children: ReactNode;
}) {
    // This layout is no longer necessary as we are using route groups.
    // It will be removed in a future cleanup step.
    return <>{children}</>;
}
