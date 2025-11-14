/**
 * @fileoverview Client-side functions for interacting with the warehouse module's server-side DB functions.
 * This abstraction layer ensures components only call client-safe functions.
 */
'use server';

import {
    getLocations as getLocationsServer,
    addLocation as addLocationServer,
    updateLocation as updateLocationServer,
    deleteLocation as deleteLocationServer,
    getWarehouseSettings as getWarehouseSettingsServer,
    saveWarehouseSettings as saveWarehouseSettingsServer,
    getInventoryForItem as getInventoryForItemServer,
    logMovement as logMovementServer,
    updateInventory as updateInventoryServer,
    getItemLocations as getItemLocationsServer,
    assignItemToLocation as assignItemToLocationServer,
    unassignItemFromLocation as unassignItemFromLocationServer,
    getWarehouseData as getWarehouseDataServer,
    getMovements as getMovementsServer,
} from './db';
import type { WarehouseSettings, WarehouseLocation, WarehouseInventoryItem, MovementLog, ItemLocation } from '../../core/types';
import { logInfo } from '@/modules/core/lib/logger';

export const getWarehouseSettings = async (): Promise<WarehouseSettings> => getWarehouseSettingsServer();
export async function saveWarehouseSettings(settings: WarehouseSettings): Promise<void> {
    await logInfo("Warehouse settings updated.");
    return saveWarehouseSettingsServer(settings);
}
export const getLocations = async (): Promise<WarehouseLocation[]> => getLocationsServer();

export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    const newLocation = await addLocationServer(location);
    await logInfo(`New warehouse location created: ${newLocation.name} (${newLocation.code})`);
    return newLocation;
}
export async function updateLocation(location: WarehouseLocation): Promise<WarehouseLocation> {
    const updatedLocation = await updateLocationServer(location);
    await logInfo(`Warehouse location updated: ${updatedLocation.name} (${updatedLocation.code})`);
    return updatedLocation;
}
export async function deleteLocation(id: number): Promise<void> {
    await logInfo(`Warehouse location with ID ${id} deleted.`);
    return deleteLocationServer(id);
}
export const getInventoryForItem = async (itemId: string): Promise<WarehouseInventoryItem[]> => getInventoryForItemServer(itemId);
export const logMovement = async (movement: Omit<MovementLog, 'id'|'timestamp'>): Promise<void> => logMovementServer(movement);
export const updateInventory = async(itemId: string, locationId: number, quantityChange: number): Promise<void> => updateInventoryServer(itemId, locationId, quantityChange);

// --- Simple Mode Actions ---
export const getItemLocations = async (itemId: string): Promise<ItemLocation[]> => getItemLocationsServer(itemId);
export async function assignItemToLocation(itemId: string, locationId: number): Promise<void> {
    await logInfo(`Item ${itemId} assigned to location ID ${locationId}.`);
    return assignItemToLocationServer(itemId, locationId);
}
export async function unassignItemFromLocation(itemLocationId: number): Promise<void> {
    await logInfo(`Item location mapping with ID ${itemLocationId} was removed.`);
    return unassignItemFromLocationServer(itemLocationId);
}

// --- Page-specific data loaders ---
export const getWarehouseData = async () => getWarehouseDataServer();
export const getMovements = async (itemId?: string): Promise<MovementLog[]> => getMovementsServer(itemId);
