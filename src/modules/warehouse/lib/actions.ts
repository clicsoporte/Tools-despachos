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
    unassignAllFromContainer as unassignAllFromContainerServer,
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
    getContainers as getContainersServer,
    saveContainer as saveContainerServer,
    deleteContainer as deleteContainerServer,
    getUnassignedDocuments as getUnassignedDocumentsServer,
    assignDocumentsToContainer as assignDocumentsToContainerServer,
    updateAssignmentOrder as updateAssignmentOrderServer,
    getAssignmentsForContainer as getAssignmentsForContainerServer,
    getAssignmentsByIds as getAssignmentsByIdsServer,
    getNextDocumentInContainer as getNextDocumentInContainerServer,
    moveAssignmentToContainer as moveAssignmentToContainerServer,
    updateAssignmentStatus as updateAssignmentStatusServer,
    resetContainerAssignments as resetContainerAssignmentsServer,
    finalizeDispatch as finalizeDispatchServer,
    unassignDocumentFromContainer as unassignDocumentFromContainerServer,
    getVehicles as getVehiclesServer,
    getEmployees as getEmployeesServer,
    getInventory as getPhysicalInventoryServer,
    getSelectableLocations as getSelectableLocationsServer,
    correctInventoryUnit as correctInventoryUnitServer,
} from './db';
import { sendEmail as sendEmailServer } from '@/modules/core/lib/email-service';
import { getStockSettings as getStockSettingsDb, saveStockSettings as saveStockSettingsDb, getAllProducts, getAllStock, getAllErpPurchaseOrderHeaders, getAllErpPurchaseOrderLines, getAllItemLocations as getAllItemLocationsCore } from '@/modules/core/lib/db';
import type { WarehouseSettings, WarehouseLocation, WarehouseInventoryItem, MovementLog, ItemLocation, InventoryUnit, StockSettings, User, ErpInvoiceHeader, ErpInvoiceLine, DispatchLog, Company, VerificationItem, DateRange, DispatchContainer, DispatchAssignment, Vehiculo, Empleado, PhysicalInventoryComparisonItem, Product, StockInfo } from '@/modules/core/types';
import { logInfo, logWarn, logError } from '@/modules/core/lib/logger';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { format, parseISO } from 'date-fns';
import type { HAlignType, FontStyle, RowInput } from 'jspdf-autotable';
import { triggerNotificationEvent } from '@/modules/notifications/lib/notifications-engine';
import path from 'path';
import { renderLocationPathAsString } from './utils';

export const getWarehouseSettings = async (): Promise<WarehouseSettings> => getWarehouseSettingsServer();
export async function saveWarehouseSettings(settings: WarehouseSettings): Promise<void> {
    await logInfo('Warehouse settings updated.');
    return saveWarehouseSettingsServer(settings);
}
export const getStockSettings = async (): Promise<StockSettings> => getStockSettingsDb();
export async function saveStockSettings(settings: StockSettings): Promise<void> {
    await logInfo('Stock settings updated.');
    return saveStockSettingsDb(settings);
}
export const getLocations = async (): Promise<WarehouseLocation[]> => getLocationsServer();
export const getSelectableLocations = async (): Promise<WarehouseLocation[]> => getSelectableLocationsServer();
export const getPhysicalInventory = async (dateRange?: DateRange): Promise<WarehouseInventoryItem[]> => getPhysicalInventoryServer(dateRange);


export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    const newLocation = await addLocationServer(location);
    await logInfo(`New warehouse location created: ${newLocation.name} (${newLocation.code})`);
    return newLocation;
}

export async function addBulkLocations(payload: { type: 'rack' | 'clone'; params: any; }): Promise<void> {
    await addBulkLocationsServer(payload);
    await logInfo('Bulk locations created via wizard', { payload });
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

export const updateInventory = async(itemId: string, locationId: number, newQuantity: number, userId: number): Promise<void> => {
    return updateInventoryServer(itemId, locationId, newQuantity, userId);
};

// --- Simple Mode Actions ---
export const getItemLocations = async (itemId: string): Promise<ItemLocation[]> => getItemLocationsServer(itemId);
export const getAllItemLocations = async (): Promise<ItemLocation[]> => getAllItemLocationsCore();
export const assignItemToLocation = async (itemId: string, locationId: number, clientId: string | null, updatedBy: string): Promise<ItemLocation> => assignItemToLocationServer(itemId, locationId, clientId, updatedBy);
export async function unassignItemFromLocation(assignmentId: number): Promise<void> {
    return unassignItemFromLocationServer(assignmentId);
}

// --- Page-specific data loaders ---
export const getWarehouseData = async () => getWarehouseDataServer();
export const getMovements = async (itemId?: string): Promise<MovementLog[]> => getMovementsServer(itemId);

// --- Inventory Unit Actions ---
export const addInventoryUnit = async (unit: Omit<InventoryUnit, 'id' | 'createdAt' | 'unitCode'>): Promise<InventoryUnit> => addInventoryUnitServer(unit);
export const getInventoryUnits = async (dateRange?: DateRange): Promise<InventoryUnit[]> => getInventoryUnitsServer(dateRange);
export const deleteInventoryUnit = async (id: number): Promise<void> => deleteInventoryUnitServer(id);
export const getInventoryUnitById = async (id: string | number): Promise<InventoryUnit | null> => getInventoryUnitByIdServer(id);
export async function correctInventoryUnit(originalUnit: InventoryUnit, newProductId: string, correctedByUserId: number): Promise<void> {
    return correctInventoryUnitServer(originalUnit, newProductId, correctedByUserId);
}

// --- Wizard Lock Actions ---
export const getActiveLocks = async (): Promise<any[]> => getActiveLocksServer();
export const lockEntity = async (payload: { entityIds: number[]; entityType: 'location' | 'container', userName: string; userId: number; }): Promise<{ locked: boolean; error?: string }> => lockEntityServer(payload);
export const releaseLock = async (entityIds: number[], entityType: 'location' | 'container', userId: number): Promise<void> => releaseLockServer(entityIds, entityType, userId);
export const forceReleaseLock = async (entityId: number, entityType: 'location' | 'container'): Promise<void> => forceReleaseLockServer(entityId, entityType);
export const getChildLocations = async (parentIds: number[]): Promise<WarehouseLocation[]> => getChildLocationsServer(parentIds);

// --- Dispatch Check Actions ---
export const searchDocuments = async (searchTerm: string): Promise<{ id: string, type: string, clientId: string, clientName: string }[]> => searchDocumentsServer(searchTerm);
export const getInvoiceData = async (documentId: string): Promise<{ header: ErpInvoiceHeader, lines: ErpInvoiceLine[] } | null> => getInvoiceDataServer(documentId);
export const logDispatch = async (dispatchData: any): Promise<void> => logDispatchServer(dispatchData);
export const getDispatchLogs = async (dateRange?: DateRange): Promise<DispatchLog[]> => getDispatchLogsServer(dateRange);

export async function sendDispatchEmail(payload: { 
    to: string[]; 
    cc: string; 
    body: string; 
    document: any; // The full currentDocument object
    items: VerificationItem[],
    verifiedBy: string,
}): Promise<void> {
    const { to, cc, body, items, document, verifiedBy } = payload;
    
    const warehouseSettings = await getWarehouseSettingsServer();
    const autoEmails = warehouseSettings.dispatchNotificationEmails
        ? warehouseSettings.dispatchNotificationEmails.split(',').map(e => e.trim()).filter(Boolean)
        : [];
    
    const allRecipients = Array.from(new Set([...to, ...autoEmails]));

    if (allRecipients.length === 0) {
        logWarn('sendDispatchEmail called without recipients.', { documentId: document.id });
        return;
    }

    const tableRows = items.map(item => {
        const difference = item.verifiedQuantity - item.requiredQuantity;
        let statusColor = '#000000'; // Black
        let diffText = difference === 0 ? '0' : (difference > 0 ? `+${difference}` : String(difference));

        if (difference !== 0) {
            statusColor = '#dc2626'; // Red
        } else {
            statusColor = '#16a34a'; // Green
        }
        
        return `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${item.itemCode}</td>
                <td style="padding: 8px;">${item.barcode || 'N/A'}</td>
                <td style="padding: 8px;">${item.description}</td>
                <td style="padding: 8px; text-align: right;">${item.requiredQuantity}</td>
                <td style="padding: 8px; text-align: right; font-weight: bold;">${item.verifiedQuantity}</td>
                <td style="padding: 8px; text-align: right; color: ${statusColor}; font-weight: bold;">${diffText}</td>
            </tr>
        `;
    }).join('');

    const htmlBody = `
        <p>Se ha completado la verificación de despacho para el documento <strong>${document.id}</strong>.</p>
        <hr>
        <h3>Datos del Cliente:</h3>
        <p>
            <strong>Nombre:</strong> ${document.clientName}<br>
            <strong>Cédula:</strong> ${document.clientTaxId || 'No disponible'}<br>
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
                    <th style="padding: 8px; text-align: right;">Requerido</th>
                    <th style="padding: 8px; text-align: right;">Verificado</th>
                    <th style="padding: 8px; text-align: right;">Diferencia</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;

    try {
        await sendEmailServer({
            to: allRecipients,
            cc: cc,
            subject: `Comprobante de Despacho - ${document.id}`,
            html: htmlBody,
        });
        logInfo(`Dispatch email sent for document ${document.id}`, { to, cc });
    } catch (error: any) {
        logError('Failed to send dispatch email', { error: error.message, documentId: document.id });
        throw new Error('No se pudo enviar el correo de despacho. Verifica la configuración de SMTP.');
    }
}

// --- Dispatch Container Actions ---
export const getContainers = async (): Promise<DispatchContainer[]> => getContainersServer();
export const saveContainer = async (container: Omit<DispatchContainer, 'id' | 'createdAt'>, updatedBy: string): Promise<DispatchContainer> => saveContainerServer(container, updatedBy);
export const deleteContainer = async (id: number): Promise<void> => deleteContainerServer(id);
export const getUnassignedDocuments = async (dateRange: DateRange): Promise<ErpInvoiceHeader[]> => getUnassignedDocumentsServer(dateRange);
export const assignDocumentsToContainer = async (documentIds: string[], containerId: number, updatedBy: string): Promise<void> => assignDocumentsToContainerServer(documentIds, containerId, updatedBy);
export const updateAssignmentOrder = async (containerId: number, orderedDocumentIds: string[]): Promise<void> => updateAssignmentOrderServer(containerId, orderedDocumentIds);
export const getAssignmentsForContainer = async (containerId: number): Promise<DispatchAssignment[]> => getAssignmentsForContainerServer(containerId);
export const getAssignmentsByIds = async (documentIds: string[]): Promise<DispatchAssignment[]> => getAssignmentsByIdsServer(documentIds);
export const getNextDocumentInContainer = async (containerId: number, currentDocumentId: string): Promise<string | null> => getNextDocumentInContainerServer(containerId, currentDocumentId);
export const moveAssignmentToContainer = async (assignmentId: number, targetContainerId: number, documentId?: string): Promise<void> => moveAssignmentToContainerServer(assignmentId, targetContainerId, documentId);
export const updateAssignmentStatus = async (documentId: string, status: 'pending' | 'in-progress' | 'completed' | 'discrepancy' | 'partial'): Promise<void> => updateAssignmentStatusServer(documentId, status);
export const resetContainerAssignments = async (containerId: number): Promise<void> => resetContainerAssignmentsServer(containerId);
export const unassignAllFromContainer = async (containerId: number): Promise<void> => unassignAllFromContainerServer(containerId);
export const unassignDocumentFromContainer = async (assignmentId: number): Promise<void> => unassignDocumentFromContainerServer(assignmentId);
export const finalizeDispatch = async (containerId: number, vehiclePlate: string, driverName: string, helper1Name: string, helper2Name: string): Promise<void> => finalizeDispatchServer(containerId, vehiclePlate, driverName, helper1Name, helper2Name);
export const getVehicles = async (): Promise<Vehiculo[]> => getVehiclesServer();
export const getEmployees = async (): Promise<Empleado[]> => getEmployeesServer();

export async function getReceivingReportData({ dateRange }: { dateRange?: DateRange }): Promise<{ units: InventoryUnit[], locations: WarehouseLocation[] }> {
    const [units, locations] = await Promise.all([
        getInventoryUnitsServer(dateRange),
        getLocationsServer(),
    ]);
    return { units, locations };
}

export async function getPhysicalInventoryReportData({ dateRange }: { dateRange?: DateRange }): Promise<{ comparisonData: PhysicalInventoryComparisonItem[], allLocations: WarehouseLocation[] }> {
    try {
        const [physicalInventory, erpStock, allProducts, allLocations, allItemLocations, selectableLocations] = await Promise.all([
            getPhysicalInventoryServer(dateRange),
            getAllStock(),
            getAllProducts(),
            getLocationsServer(),
            getAllItemLocationsCore(),
            getSelectableLocationsServer(),
        ]);
        
        const erpStockMap = new Map(erpStock.map((item: StockInfo) => [item.itemId, item.totalStock]));
        const productMap = new Map(allProducts.map((item: Product) => [item.id, item.description]));
        const locationMap = new Map(allLocations.map((item: WarehouseLocation) => [item.id, item]));
        const itemLocationMap = new Map<string, string>();
        allItemLocations.forEach(itemLoc => {
            itemLocationMap.set(itemLoc.itemId, renderLocationPathAsString(itemLoc.locationId, allLocations));
        });

        const comparisonData: PhysicalInventoryComparisonItem[] = physicalInventory.map((item) => {
            const erpQuantity = erpStockMap.get(item.itemId) ?? 0;
            const location = locationMap.get(item.locationId);
            return {
                productId: item.itemId,
                productDescription: productMap.get(item.itemId) || 'Producto Desconocido',
                locationId: item.locationId,
                locationName: location?.name || 'Ubicación Desconocida',
                locationCode: location?.code || 'N/A',
                physicalCount: item.quantity,
                erpStock: erpQuantity,
                difference: item.quantity - erpQuantity,
                lastCountDate: item.lastUpdated,
                updatedBy: item.updatedBy || 'N/A',
                assignedLocationPath: itemLocationMap.get(item.itemId) || 'Sin Asignar',
            };
        });

        return JSON.parse(JSON.stringify({ comparisonData, allLocations: selectableLocations }));
    } catch (error) {
        logError('Failed to generate physical inventory comparison report', { error });
        throw new Error('No se pudo generar el reporte de inventario físico.');
    }
}
