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
    searchDocuments as searchDocumentsServer,
    getInvoiceData as getInvoiceDataServer,
    logDispatch as logDispatchServer,
    getDispatchLogs as getDispatchLogsServer,
} from './db';
import { sendEmail } from '@/modules/core/lib/email-service';
import { getStockSettings as getStockSettingsDb, saveStockSettings as saveStockSettingsDb } from '@/modules/core/lib/db';
import type { WarehouseSettings, WarehouseLocation, WarehouseInventoryItem, MovementLog, ItemLocation, InventoryUnit, StockSettings, User, ErpInvoiceHeader, ErpInvoiceLine, DispatchLog, Company } from '@/modules/core/types';
import { logInfo, logWarn, logError } from '@/modules/core/lib/logger';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { format } from 'date-fns';
import type { HAlignType, FontStyle } from 'jspdf-autotable';

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
    return deleteLocationServer(id, userName);
}
export const getInventoryForItem = async (itemId: string): Promise<WarehouseInventoryItem[]> => getInventoryForItemServer(itemId);
export const logMovement = async (movement: Omit<MovementLog, 'id'|'timestamp'>): Promise<void> => logMovementServer(movement);

export const updateInventory = async(itemId: string, locationId: number, quantity: number, userId: number): Promise<void> => {
    return updateInventoryServer(itemId, locationId, quantity, userId);
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
export const lockEntity = async (payload: { entityIds: number[]; userName: string; userId: number; }): Promise<{ locked: boolean }> => lockEntityServer(payload);
export const releaseLock = async (entityIds: number[], userId: number): Promise<void> => releaseLockServer(entityIds, userId);
export const forceReleaseLock = async (locationId: number): Promise<void> => forceReleaseLockServer(locationId);
export const getChildLocations = async (parentIds: number[]): Promise<WarehouseLocation[]> => getChildLocationsServer(parentIds);

// --- Dispatch Check Actions ---
export const searchDocuments = async (searchTerm: string): Promise<{ id: string, type: string, clientId: string, clientName: string }[]> => searchDocumentsServer(searchTerm);
export const getInvoiceData = async (documentId: string): Promise<{ header: ErpInvoiceHeader, lines: ErpInvoiceLine[] } | null> => getInvoiceDataServer(documentId);
export const logDispatch = async (dispatchData: any): Promise<void> => logDispatchServer(dispatchData);
export const getDispatchLogs = async (): Promise<DispatchLog[]> => getDispatchLogsServer();

export async function sendDispatchEmail(payload: { 
    to: string[]; 
    cc: string; 
    body: string; 
    document: any; // The full currentDocument object
    items: { itemCode: string; barcode: string; description: string; requiredQuantity: number; verifiedQuantity: number }[],
    verifiedBy: string,
}): Promise<void> {
    const { to, cc, body, items, document, verifiedBy } = payload;
    
    if (!to || to.length === 0) {
        logWarn('sendDispatchEmail called without recipients.', { documentId: document.id });
        return;
    }

    const tableRows = items.map(item => {
        const difference = item.verifiedQuantity - item.requiredQuantity;
        let statusColor = '#000000'; // Black
        let diffText = difference === 0 ? '' : (difference > 0 ? `+${difference}` : String(difference));

        if (difference > 0) { // Sobrante
            statusColor = '#dc2626'; // Red
        } else if (difference < 0) { // Faltante
            statusColor = '#f59e0b'; // Amber
        } else { // Completo
            statusColor = '#16a34a'; // Green
        }
        
        return `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${item.itemCode}</td>
                <td style="padding: 8px;">${item.barcode || 'N/A'}</td>
                <td style="padding: 8px;">${item.description}</td>
                <td style="padding: 8px; text-align: center;">${item.requiredQuantity}</td>
                <td style="padding: 8px; text-align: center; color: ${statusColor}; font-weight: bold;">${item.verifiedQuantity}</td>
                <td style="padding: 8px; text-align: center; color: ${statusColor}; font-weight: bold;">${diffText}</td>
            </tr>
        `;
    }).join('');

    const htmlBody = `
        <p>Se adjunta el comprobante de despacho para el documento ${document.id}.</p>
        <hr>
        <h3>Datos del Despacho:</h3>
        <p>
            <strong>Cliente:</strong> ${document.clientName}<br>
            <strong>Cédula:</strong> ${document.clientTaxId}<br>
            <strong>Dirección de Envío:</strong> ${document.shippingAddress}<br>
            <strong>Verificado por:</strong> ${verifiedBy}
        </p>
        <hr>
        ${body ? `<p><strong>Mensaje Adicional:</strong></p><p>${body.replace(/\n/g, '<br>')}</p><hr>` : ''}
        <h3>Resumen del Despacho:</h3>
        <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px;">
            <thead>
                <tr style="background-color: #f2f2f2; text-align: left;">
                    <th style="padding: 8px;">Código</th>
                    <th style="padding: 8px;">Cod. Barras</th>
                    <th style="padding: 8px;">Descripción</th>
                    <th style="padding: 8px; text-align: center;">Requerido</th>
                    <th style="padding: 8px; text-align: center;">Verificado</th>
                    <th style="padding: 8px; text-align: center;">Diferencia</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;

    try {
        await sendEmail({
            to: to,
            cc: cc,
            subject: `Comprobante de Despacho - ${document.id}`,
            html: htmlBody,
        });
        logInfo(`Dispatch email sent for document ${document.id}`, { to, cc });
    } catch (error: any) {
        logError("Failed to send dispatch email", { error: error.message, documentId: document.id });
        throw new Error("No se pudo enviar el correo de despacho. Verifica la configuración de SMTP.");
    }
}
