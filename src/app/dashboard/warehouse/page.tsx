/**
 * @fileoverview The main dashboard page for the warehouse section.
 * It displays a grid of available warehouse management tools.
 */
'use client';

import { ToolCard } from "@/components/dashboard/tool-card";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { warehouseTools } from "@/modules/core/lib/data";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/modules/core/hooks/useAuth";

export default function WarehouseDashboardPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized, hasPermission } = useAuthorization();
    const { isReady } = useAuth();

    useEffect(() => {
        setTitle("Almacén");
    }, [setTitle]);

    const visibleTools = useMemo(() => {
        if (!isAuthorized) return [];
        // Filter tools based on specific sub-permissions for warehouse
        return warehouseTools.filter(tool => {
            switch (tool.id) {
                case 'warehouse-search':
                    return hasPermission('warehouse:search:full');
                case 'warehouse-search-simple':
                    return hasPermission('warehouse:search:simple');
                case 'receiving-wizard':
                    return hasPermission('warehouse:receiving:create');
                case 'population-wizard':
                    return hasPermission('warehouse:receiving:create'); // Re-using the same permission
                case 'assign-item':
                    return hasPermission('warehouse:inventory:assign');
                case 'inventory-count':
                     return hasPermission('warehouse:inventory:assign');
                case 'warehouse-units':
                    return hasPermission('warehouse:units:manage');
                case 'warehouse-locations':
                    return hasPermission('warehouse:locations:manage');
                case 'lock-management':
                    return hasPermission('warehouse:locks:manage');
                default:
                    // Fallback for general access if specific permission is not defined for a new tool
                    return hasPermission('warehouse:access');
            }
        });
    }, [isAuthorized, hasPermission]);

    if (!isReady) {
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
    
    if (isAuthorized === false) {
        return null;
    }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="grid gap-8">
          <div>
            <h2 className="mb-4 text-2xl font-bold tracking-tight">
              Herramientas de Almacén
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </div>
        </div>
      </main>
  );
}
