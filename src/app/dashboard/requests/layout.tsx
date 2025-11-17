
/**
 * @fileoverview This layout component is essential for rendering child routes
 * within the /dashboard/requests path, such as the suggestions page. It ensures
 * that Next.js can correctly nest and display pages like /suggestions.
 */
'use client';

import type { ReactNode } from 'react';

// This layout component ensures that child routes can be rendered within this segment.
export default function RequestsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
