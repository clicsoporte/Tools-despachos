/**
 * @fileoverview The main dashboard page for the admin section.
 * It dynamically displays a grid of available administration tools.
 */
'use client';
import { adminTools, adminPermissions } from "@/modules/core/lib/data";
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
        return adminTools.filter(tool => {
            if (!isAuthorized) return false;
            // A bit of a hacky way, but let's map some IDs to their real permissions
            if (tool.id === 'user-management') return hasPermission('users:read');
            if (tool.id === 'role-management') return hasPermission('roles:read');
            if (tool.id === 'general-settings') return hasPermission('admin:settings:general');
            if (tool.id === 'email-settings') return hasPermission('admin:settings:general');
            if (tool.id === 'quoter-settings') return hasPermission('admin:settings:general');
            if (tool.id === 'api-settings') return hasPermission('admin:settings:api');
            if (tool.id === 'planner-settings') return hasPermission('admin:settings:planner');
            if (tool.id === 'requests-settings') return hasPermission('admin:settings:requests');
            if (tool.id === 'warehouse-settings') return hasPermission('admin:settings:warehouse') || hasPermission('admin:settings:stock');
            if (tool.id === 'cost-assistant-settings') return hasPermission('admin:settings:cost-assistant');
            if (tool.id === 'suggestions-viewer') return hasPermission('admin:suggestions:read');
            if (tool.id === 'import-data') return hasPermission('admin:import:run');
            if (tool.id === 'maintenance') return hasPermission('admin:maintenance:backup');
            if (tool.id === 'log-viewer') return hasPermission('admin:logs:read');
            return false; // Default to not showing if no permission matches
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
                    <Skeleton className="h-8 w-80 mb-4" />
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
                const isSuggestionsTool = tool.id === "suggestions-viewer";
                const badgeCount = isSuggestionsTool ? unreadSuggestionsCount : 0;
                return <ToolCard key={tool.id} tool={tool} badgeCount={badgeCount}/>
              })}
            </div>
          </div>
        </div>
      </main>
  );
}
