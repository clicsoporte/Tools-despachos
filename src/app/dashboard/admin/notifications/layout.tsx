/**
 * @fileoverview Layout for the new Notifications section.
 * This ensures child pages have access to the main dashboard context.
 */
'use client';

import type { ReactNode } from "react";

export default function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
    return <>{children}</>;
}
