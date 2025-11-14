/**
 * @fileoverview Utility functions for the planner module.
 */

import type { PlannerSettings, ProductionOrderStatus } from '../../core/types';

const baseStatusConfig: { [key in ProductionOrderStatus]?: { label: string; color: string } } = {
    pending: { label: "Pendiente", color: "bg-yellow-500" },
    approved: { label: "Aprobada", color: "bg-green-500" },
    'in-queue': { label: "En Cola", color: "bg-cyan-500"},
    'in-progress': { label: "En Progreso", color: "bg-blue-500" },
    'on-hold': { label: "En Espera", color: "bg-gray-500" },
    'in-maintenance': { label: "En Mantenimiento", color: "bg-slate-600" },
    completed: { label: "Completada", color: "bg-teal-500" },
    'received-in-warehouse': { label: "En Bodega", color: "bg-gray-700" },
    canceled: { label: "Cancelada", color: "bg-red-700" },
};

/**
 * Gets the full status configuration, merging base statuses with custom ones from settings.
 * @param settings - The planner settings containing custom statuses.
 * @returns A complete status configuration object.
 */
export function getStatusConfig(settings: PlannerSettings | null): typeof baseStatusConfig {
    if (!settings || !settings.customStatuses) {
        return baseStatusConfig;
    }

    const dynamicStatusConfig = { ...baseStatusConfig };
    settings.customStatuses.forEach(cs => {
        if (cs.isActive && cs.label) {
            dynamicStatusConfig[cs.id as ProductionOrderStatus] = { label: cs.label, color: cs.color };
        }
    });

    return dynamicStatusConfig;
}
