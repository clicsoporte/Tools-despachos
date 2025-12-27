/**
 * @fileoverview Client-side functions for interacting with the warehouse module's server-side DB functions.
 * This abstraction layer ensures components only call client-safe functions.
 */
'use client';

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
    getAllItemLocations as getAllItemLocationsServer,
    assignItemToLocation as assignItemToLocationServer,
    unassignItemFromLocation as unassignItemFromLocationServer,
    getWarehouseData as getWarehouseDataServer,
    getMovements as getMovementsServer,
    addInventoryUnit as addInventoryUnitServer,
    getInventoryUnits as getInventoryUnitsServer,
    deleteInventoryUnit as deleteInventoryUnitServer,
    getInventoryUnitById as getInventoryUnitByIdServer,
    addBulkLocations as addBulkLocationsServer,
    getActiveLocks as getActiveLocksServer,
    lockEntity as lockEntityServer,
    releaseLock as releaseLockServer,
    forceReleaseLock as forceReleaseLockServer,
    getChildLocations as getChildLocationsServer,
} from './db';
import { getStockSettings as getStockSettingsDb, saveStockSettings as saveStockSettingsDb } from '@/modules/core/lib/db';
import type { WarehouseSettings, WarehouseLocation, WarehouseInventoryItem, MovementLog, ItemLocation, InventoryUnit, StockSettings, User } from '@/modules/core/types';
import { logInfo, logWarn } from '@/modules/core/lib/logger';

export const getWarehouseSettings = async (): Promise<WarehouseSettings> => getWarehouseSettingsServer();
export async function saveWarehouseSettings(settings: WarehouseSettings): Promise<void> {
    await logInfo("Warehouse settings updated.");
    return saveWarehouseSettingsServer(settings);
}
export const getStockSettings = async (): Promise<StockSettings> => getStockSettingsDb();
export async function saveStockSettings(settings: StockSettings): Promise<void> {
    await logInfo("Stock settings updated.");
    return saveStockSettingsDb(settings);
}
export const getLocations = async (): Promise<WarehouseLocation[]> => getLocationsServer();

/**
 * Filters a list of all locations to return only those that can be selected as final destinations
 * (i.e., they are not parents of other locations).
 * @param allLocations - An array of all warehouse locations.
 * @returns An array of selectable, "leaf" warehouse locations.
 */
export function getSelectableLocations(allLocations: WarehouseLocation[]): WarehouseLocation[] {
    const parentIds = new Set(allLocations.map(l => l.parentId).filter(Boolean));
    return allLocations.filter(l => !parentIds.has(l.id));
}

export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    const newLocation = await addLocationServer(location);
    await logInfo(`New warehouse location created: ${newLocation.name} (${newLocation.code})`);
    return newLocation;
}

export async function addBulkLocations(payload: { type: 'rack' | 'clone'; params: any; }): Promise<void> {
    await addBulkLocationsServer(payload);
    await logInfo(`Bulk locations created via wizard`, { payload });
}

export async function updateLocation(location: WarehouseLocation): Promise<WarehouseLocation> {
    const updatedLocation = await updateLocationServer(location);
    await logInfo(`Warehouse location updated: ${updatedLocation.name} (${updatedLocation.code})`);
    return updatedLocation;
}
export async function deleteLocation(id: number, userName: string): Promise<void> {
    await logWarn(`Warehouse location with ID ${id} deleted by user ${userName}.`);
    return deleteLocationServer(id);
}
export const getInventoryForItem = async (itemId: string): Promise<WarehouseInventoryItem[]> => getInventoryForItemServer(itemId);
export const logMovement = async (movement: Omit<MovementLog, 'id'|'timestamp'>): Promise<void> => logMovementServer(movement);

export const updateInventory = async(itemId: string, locationId: number, quantity: number, user: User): Promise<void> => {
    if (!user) throw new Error("User must be authenticated to update inventory.");
    return updateInventoryServer(itemId, locationId, quantity, user);
};

// --- Simple Mode Actions ---
export const getItemLocations = async (itemId: string): Promise<ItemLocation[]> => getItemLocationsServer(itemId);
export const getAllItemLocations = async (): Promise<ItemLocation[]> => getAllItemLocationsServer();
export const assignItemToLocation = async (itemId: string, locationId: number, clientId: string | null, updatedBy: string): Promise<ItemLocation> => assignItemToLocationServer(itemId, locationId, clientId, updatedBy);

export async function unassignItemFromLocation(itemLocationId: number): Promise<void> {
    await logInfo(`Item location mapping with ID ${itemLocationId} was removed.`);
    return unassignItemFromLocationServer(itemLocationId);
}

// --- Page-specific data loaders ---
export const getWarehouseData = async () => getWarehouseDataServer();
export const getMovements = async (itemId?: string): Promise<MovementLog[]> => getMovementsServer(itemId);

// --- Inventory Unit Actions ---
export const addInventoryUnit = async (unit: Omit<InventoryUnit, 'id' | 'createdAt' | 'unitCode'>): Promise<InventoryUnit> => addInventoryUnitServer(unit);
export const getInventoryUnits = async (): Promise<InventoryUnit[]> => getInventoryUnitsServer();
export const deleteInventoryUnit = async (id: number): Promise<void> => deleteInventoryUnitServer(id);
export const getInventoryUnitById = async (id: string | number): Promise<InventoryUnit | null> => getInventoryUnitByIdServer(id);

// --- Wizard Lock Actions ---
export const getActiveLocks = async (): Promise<WarehouseLocation[]> => getActiveLocksServer();
export const lockEntity = async (payload: { entityIds: number[]; userName: string; lockedEntityName: string; }): Promise<{ locked: boolean }> => lockEntityServer(payload);
export const releaseLock = async (entityIds: number[]): Promise<void> => releaseLockServer(entityIds);
export const forceReleaseLock = async (locationId: number): Promise<void> => forceReleaseLockServer(locationId);
export const getChildLocations = async (parentIds: number[]): Promise<WarehouseLocation[]> => getChildLocationsServer(parentIds);
