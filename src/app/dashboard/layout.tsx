/**
 * @fileoverview Main layout for the authenticated dashboard section of the application.
 * It handles session verification, ensuring only logged-in users can access this area.
 * It also provides the main structure including the sidebar, header, and content area,
 * and wraps the content in a PageTitleProvider for dynamic header titles.
 */
'use client';

import { AppSidebar } from "../../components/layout/sidebar";
import { Header } from "../../components/layout/header";
import { SidebarInset, SidebarProvider } from "../../components/ui/sidebar";
import { usePageTitle, PageTitleProvider } from "../../modules/core/hooks/usePageTitle";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { title } = usePageTitle();
  return (
    <>
      <Header title={title} />
      <div className="flex-1 overflow-auto">{children}</div>
    </>
  );
}

/**
 * Main layout component for the dashboard.
 * It wraps pages in providers, verifies user authentication, and sets up the
 * main UI structure.
 * @param {object} props - Component props.
 * @param {React.ReactNode} props.children - The page content to render inside the layout.
 * @returns {JSX.Element} The dashboard layout.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isReady, isLoading } = useAuth();
  const router = useRouter();

  // This effect is the single source of truth for session verification.
  // It waits until the auth state is fully resolved.
  useEffect(() => {
    // If loading is finished (`!isLoading`) but the context isn't ready and there's no user,
    // it implies an invalid session (e.g., deleted user, expired token). Redirect to login.
    if (!isLoading && !isReady && !user) {
      router.replace('/');
    }
  }, [isLoading, isReady, user, router]);

  // While waiting for the initial check and for all auth data to be ready,
  // show a global loading screen.
  if (isLoading || !isReady) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If after all loading, there is still no user, render nothing to avoid flashes
  // while the redirect effect takes place.
  if (!user) {
      return null;
  }

  // Once ready and user is confirmed, render the full dashboard layout.
  return (
      <PageTitleProvider initialTitle="Panel">
        <SidebarProvider>
          <div className="flex h-screen bg-muted/40">
            <AppSidebar />
            <SidebarInset className="flex flex-1 flex-col overflow-hidden">
                <DashboardContent>{children}</DashboardContent>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </PageTitleProvider>
  );
}
