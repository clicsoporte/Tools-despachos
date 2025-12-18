/**
 * @fileoverview The sub-dashboard page for the warehouse section.
 * It displays a grid of available warehouse tools like search and assignment.
 */
'use client';

import { ToolCard } from "@/components/dashboard/tool-card";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { warehouseTools } from "@/modules/core/lib/data.tsx";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/modules/core/hooks/useAuth";

export default function WarehouseDashboardPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized, hasPermission } = useAuthorization(['warehouse:access']);
    const { isReady } = useAuth();

    useEffect(() => {
        setTitle("Almacén");
    }, [setTitle]);

    const visibleTools = useMemo(() => {
        if (!isAuthorized) return [];
        return warehouseTools.filter(tool => {
            if (tool.id === 'warehouse-search' || tool.id === 'warehouse-search-simple') {
                return hasPermission('warehouse:access');
            }
            if (tool.id === 'assign-item') {
                return hasPermission('warehouse:inventory:assign');
            }
            if (tool.id === 'inventory-count') {
                return hasPermission('warehouse:inventory:assign');
            }
            if (tool.id === 'warehouse-units') {
                return hasPermission('warehouse:units:manage');
            }
             if (tool.id === 'warehouse-locations') {
                return hasPermission('warehouse:locations:manage');
            }
            return false;
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
