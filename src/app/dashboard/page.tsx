/**
 * @fileoverview The main dashboard page, which greets the user and displays available tools.
 */
'use client';

import { mainTools } from "@/modules/core/lib/data.tsx";
import { ToolCard } from "@/components/dashboard/tool-card";
import { useEffect, useMemo } from "react";
import type { Tool } from "@/modules/core/types";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { BarChartBig, Wrench } from "lucide-react";

/**
 * Renders the main dashboard page.
 * It fetches the current user's data to personalize the experience and filters tools
 * based on user permissions.
 */
export default function DashboardPage() {
  const { userRole, isReady } = useAuth();
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle("Panel Principal");
  }, [setTitle]);

  const visibleTools = useMemo(() => {
    if (!userRole) return [];
    
    // Start with the main tools that are always visible
    let tools: Tool[] = [...mainTools];

    const hasAdminAccess = userRole.id === 'admin';
    const hasAnalyticsAccess = hasAdminAccess || userRole.permissions.includes('analytics:read');

    // If user has analytics access, add the card to navigate to the analytics section
    if (hasAnalyticsAccess) {
      tools.push({
        id: "analytics",
        name: "Analíticas",
        description: "Inteligencia de negocio y reportes para la toma de decisiones.",
        href: "/dashboard/analytics",
        icon: BarChartBig,
        bgColor: "bg-indigo-500",
      });
    }
    
    // If user is admin, add the card to navigate to the admin section
    if (hasAdminAccess) {
      tools.push({
        id: "admin-dashboard",
        name: "Configuración",
        description: "Gestionar usuarios, roles, importaciones y ajustes del sistema.",
        href: "/dashboard/admin",
        icon: Wrench,
        bgColor: "bg-slate-600",
      });
    }
    
    return tools;

  }, [userRole]);


  if (!isReady) {
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Skeleton className="h-8 w-64 mb-4" />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
            </div>
        </main>
    )
  }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="grid gap-8">
          <div>
            <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
              <h2 className="text-2xl font-bold tracking-tight">
                Todas las Herramientas
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleTools.map((tool) => {
                return <ToolCard key={tool.id} tool={tool} />
              })}
            </div>
          </div>
        </div>
      </main>
  );
}
