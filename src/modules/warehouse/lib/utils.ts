/**
 * @fileoverview Utility functions specific to the warehouse module.
 */
'use server';

import type { WarehouseLocation } from '@/modules/core/types';

/**
 * Renders a location's full hierarchical path as a single string.
 * e.g., "Bodega Principal > Pasillo A > Rack 01"
 * @param locationId - The ID of the location to render.
 * @param locations - An array of all available warehouse locations.
 * @returns The formatted path string.
 */
export const renderLocationPathAsString = (locationId: number, locations: WarehouseLocation[]): string => {
    if (!locationId) return "N/A";
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
    while (current) {
        path.unshift(current);
        if (!current.parentId) break; // Break if there is no parent
        // Safely find the next parent
        const parentId = current.parentId;
        current = locations.find(l => l.id === parentId);
    }
    return path.map(l => l.name).join(' > ');
};