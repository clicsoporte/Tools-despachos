/**
 * @fileoverview The main dashboard page for the admin section.
 * It dynamically displays a grid of available administration tools.
 */
'use client';

import { adminTools } from "@/modules/core/lib/data";
import { adminPermissions } from "@/modules/core/lib/permissions";
import { ToolCard } from "@/components/dashboard/tool-card";
import { useEffect, useMemo } from "react";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/core/hooks/useAuth";

export default function AdminDashboardPage() {
    const { setTitle } = usePageTitle();
    const { hasPermission, isAuthorized } = useAuthorization(adminPermissions);
    const { unreadSuggestionsCount } = useAuth();

    useEffect(() => {
        setTitle("Configuración");
    }, [setTitle]);
    
    const visibleTools = useMemo(() => {
        if (isAuthorized === false) return [];
        // The logic now checks if the user has *any* permission related to the tool group,
        // making it more flexible and correctly showing cards.
        return adminTools.filter(tool => {
            switch (tool.id) {
                case 'users:read':
                    return hasPermission('users:read') || hasPermission('users:create') || hasPermission('users:update') || hasPermission('users:delete');
                case 'roles:read':
                    return hasPermission('roles:read') || hasPermission('roles:create') || hasPermission('roles:update') || hasPermission('roles:delete');
                case 'admin:settings:general':
                    return hasPermission('admin:settings:general');
                case 'admin:settings:api':
                    return hasPermission('admin:settings:api');
                case 'admin:settings:email':
                    return hasPermission('admin:settings:email');
                case 'admin:notifications:read':
                    return hasPermission('admin:notifications:read');
                case 'admin:settings:planner':
                    return hasPermission('admin:settings:planner');
                case 'admin:settings:requests':
                    return hasPermission('admin:settings:requests');
                case 'admin:settings:warehouse':
                     return hasPermission('admin:settings:warehouse') || hasPermission('admin:settings:stock') || hasPermission('warehouse:dispatch-containers:manage');
                case 'admin:settings:cost-assistant':
                    return hasPermission('admin:settings:cost-assistant');
                case 'admin:settings:quoter':
                    return hasPermission('admin:settings:quoter');
                case 'admin:import:run':
                    return hasPermission('admin:import:run') || hasPermission('admin:import:files') || hasPermission('admin:import:sql') || hasPermission('admin:import:sql-config');
                case 'admin:logs:read':
                    return hasPermission('admin:logs:read') || hasPermission('admin:logs:clear');
                case 'admin:maintenance:backup':
                    return hasPermission('admin:maintenance:backup') || hasPermission('admin:maintenance:restore') || hasPermission('admin:maintenance:reset');
                // For other tools that have a single, clear permission:
                default:
                    return hasPermission(tool.id);
            }
        });
    }, [hasPermission, isAuthorized]);

    if (isAuthorized === false) {
        return null;
    }

    if (isAuthorized === null) {
        return (
             <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="grid gap-8">
                <div>
                    <h2 className="mb-4 text-2xl font-bold tracking-tight">
                        Herramientas de Administración
                    </h2>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                    </div>
                </div>
                </div>
            </main>
        );
    }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="grid gap-8">
          <div>
            <h2 className="mb-4 text-2xl font-bold tracking-tight">
              Herramientas de Administración
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleTools.map((tool) => {
                const isSuggestionsTool = tool.id === "admin:suggestions:read";
                const badgeCount = isSuggestionsTool ? unreadSuggestionsCount : 0;
                return <ToolCard key={tool.id} tool={tool} badgeCount={badgeCount}/>
              })}
            </div>
          </div>
        </div>
      </main>
  );
}
