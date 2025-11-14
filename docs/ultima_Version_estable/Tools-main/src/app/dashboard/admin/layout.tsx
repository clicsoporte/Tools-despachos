/**
 * @fileoverview Main layout for the administration section.
 * This component establishes a context provider for the page title, allowing
 * any child page within the admin section to dynamically set the header title.
 */
'use client';

import type { ReactNode } from "react";
import { PageTitleProvider } from "@/modules/core/hooks/usePageTitle";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
    // This provider is essential for all child pages within the /admin route
    // that use the usePageTitle hook to set the header title.
    return (
        <PageTitleProvider initialTitle="Configuración">
            {children}
        </PageTitleProvider>
    );
}
