/**
 * @fileoverview The main dashboard page, which greets the user and displays available tools.
 */
'use client';

import { mainTools } from "@/modules/core/lib/data";
import { ToolCard } from "@/components/dashboard/tool-card";
import { useEffect, useMemo } from "react";
import type { Tool } from "@/modules/core/types";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { BarChartBig, Wrench } from "lucide-react";

/**
 * Renders the main dashboard page.
 * It fetches the current user's data to personalize the experience and filters tools
 * based on user permissions.
 */
export default function DashboardPage() {
  const { isReady } = useAuth();
  const { hasPermission } = useAuthorization();
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle("Panel Principal");
  }, [setTitle]);

  const visibleTools = useMemo(() => {
    if (!isReady) return [];
    
    // Filter the main tools based on user permissions first
    const permittedMainTools = mainTools.filter(tool => {
        switch (tool.id) {
            case 'quoter':
                return hasPermission('quotes:create');
            case 'purchase-request':
                return hasPermission('requests:read');
            case 'planner':
                return hasPermission('planner:read');
            case 'cost-assistant':
                return hasPermission('cost-assistant:access');
            case 'warehouse':
                return hasPermission('warehouse:access');
            case 'hacienda-query':
                return hasPermission('hacienda:query');
            case 'help':
                return true; // Help is always visible
            default:
                return hasPermission(tool.id); // Default case for other tools
        }
    });

    let tools: Tool[] = [...permittedMainTools];

    if (hasPermission('analytics:read')) {
      tools.push({
        id: "analytics",
        name: "Analíticas",
        description: "Inteligencia de negocio y reportes para la toma de decisiones.",
        href: "/dashboard/analytics",
        icon: BarChartBig,
        bgColor: "bg-indigo-500",
      });
    }
    
    if (hasPermission('admin:access')) {
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

  }, [isReady, hasPermission]);


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
