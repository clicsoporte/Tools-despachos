/**
 * @fileoverview Client-side functions for interacting with the request module's server-side DB functions.
 * This abstraction layer ensures components only call client-safe functions.
 */
'use client';

import type { PurchaseRequest, UpdateRequestStatusPayload, PurchaseRequestHistoryEntry, RequestSettings, UpdatePurchaseRequestPayload, RejectCancellationPayload, DateRange, AdministrativeAction, AdministrativeActionPayload, StockInfo, ErpOrderHeader, ErpOrderLine, User, RequestNotePayload, UserPreferences, PurchaseSuggestion, PurchaseRequestPriority, ErpPurchaseOrderHeader as ErpPOHeader, ErpPurchaseOrderLine } from '../../core/types';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { createNotificationForPermission, createNotification } from '@/modules/core/lib/notifications-actions';
import { 
    getRequests, 
    addRequest,
    updateRequest,
    updateStatus, 
    getRequestHistory as getRequestHistoryServer,
    getSettings,
    saveSettings,
    updatePendingAction as updatePendingActionServer,
    getErpOrderData as getErpOrderDataServer,
    getUserByName,
    getRolesWithPermission,
    addNote as addNoteServer,
    updateRequestDetails as updateRequestDetailsServer,
    saveCostAnalysis as saveCostAnalysisServer,
} from './db';
import {
    saveUserPreferences as saveUserPreferencesServer,
    getUserPreferences as getUserPreferencesServer,
    getAllProducts, 
    getAllStock, 
    getAllCustomers,
    getAllErpPurchaseOrderHeaders as getAllErpPurchaseOrderHeadersDb,
    getAllErpPurchaseOrderLines as getAllErpPurchaseOrderLinesDb,
} from '@/modules/core/lib/db';
import { useRouter } from 'next/navigation';


/**
 * Fetches purchase requests from the server.
 * @param options - Pagination and filtering options.
 * @returns A promise that resolves to the requests and total counts.
 */
export async function getPurchaseRequests(options: { 
    page: number; 
    pageSize: number;
    isArchived: boolean;
    filters: {
        searchTerm?: string;
        status?: string[];
        classification?: string;
        showOnlyMy?: string;
        dateRange?: DateRange;
    };
}): Promise<{ requests: PurchaseRequest[], totalActive: number, totalArchived: number }> {
    return getRequests(options);
}


/**
 * Saves a new purchase request.
 * @param request - The request data to save.
 * @param requestedBy - The name of the user creating the request.
 * @returns The newly created purchase request.
 */
export async function savePurchaseRequest(request: Omit<PurchaseRequest, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'deliveredQuantity' | 'receivedInWarehouseBy' | 'receivedDate' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'>, requestedBy: string): Promise<PurchaseRequest> {
    const createdRequest = await addRequest(request, requestedBy);
    await logInfo(`Purchase request ${createdRequest.consecutive} created by ${requestedBy}`, { item: createdRequest.itemDescription, quantity: createdRequest.quantity });
    
    await createNotificationForPermission(
        'requests:status:review',
        `Nueva solicitud ${createdRequest.consecutive} para "${createdRequest.clientName}" requiere revisión.`,
        `/dashboard/requests?search=${createdRequest.consecutive}`,
        createdRequest.id,
        'purchase-request',
        'review'
    );
    
    return createdRequest;
}

/**
 * Updates the main details of an existing purchase request.
 * @param payload - The data to update.
 * @returns The updated purchase request.
 */
export async function updatePurchaseRequest(payload: UpdatePurchaseRequestPayload): Promise<PurchaseRequest> {
    const updatedRequest = await updateRequest(payload);
    await logInfo(`Purchase request ${updatedRequest.consecutive} edited by ${payload.updatedBy}`, { requestId: payload.requestId });
    return updatedRequest;
}

/**
 * Updates the status of a purchase request.
 * @param payload - The status update information.
 * @returns The updated purchase request.
 */
export async function updatePurchaseRequestStatus(payload: UpdateRequestStatusPayload): Promise<PurchaseRequest> {
    const updatedRequest = await updateStatus(payload);
    await logInfo(`Status of request ${updatedRequest.consecutive} updated to '${payload.status}' by ${payload.updatedBy}`, { notes: payload.notes, requestId: payload.requestId });
    
    if (updatedRequest.requestedBy !== payload.updatedBy) {
        const targetUser = await getUserByName(updatedRequest.requestedBy);
        if (targetUser) {
             const settings = await getSettings();
             const statusConfig = {
                'pending': 'Pendiente',
                'purchasing-review': 'Revisión Compras',
                'pending-approval': 'Pendiente Aprobación',
                'approved': 'Aprobada',
                'ordered': 'Ordenada',
                'received-in-warehouse': 'Recibido en Bodega',
                'entered-erp': 'Ingresado ERP',
                'canceled': 'Cancelada'
             };
             const statusLabel = (statusConfig as any)[payload.status] || payload.status;
            await createNotification({
                userId: targetUser.id,
                message: `La solicitud ${updatedRequest.consecutive} ha sido actualizada a: ${statusLabel}.`,
                href: `/dashboard/requests?search=${updatedRequest.consecutive}`,
                entityId: updatedRequest.id,
                entityType: 'purchase-request',
                entityStatus: payload.status,
            });
        }
    }
    
    return updatedRequest;
}

/**
 * Updates specific details of a purchase request like priority.
 * @param payload - The details to update.
 * @returns The updated purchase request.
 */
export async function updateRequestDetails(payload: { requestId: number; priority: PurchaseRequestPriority, updatedBy: string }): Promise<PurchaseRequest> {
    const updatedRequest = await updateRequestDetailsServer(payload);
    await logInfo(`Details for request ${updatedRequest.consecutive} updated by ${payload.updatedBy}`, { details: payload });
    return updatedRequest;
}


/**
 * Fetches the history for a specific request.
 * @param requestId - The ID of the request.
 * @returns A promise that resolves to an array of history entries.
 */
export async function getRequestHistory(requestId: number): Promise<PurchaseRequestHistoryEntry[]> {
    return getRequestHistoryServer(requestId);
}

/**
 * Fetches request settings from the server.
 * @returns The current request settings.
 */
export async function getRequestSettings(): Promise<RequestSettings> {
    return getSettings();
}

/**
 * Saves request settings.
 * @param settings - The settings object to save.
 */
export async function saveRequestSettings(settings: RequestSettings): Promise<void> {
    await logInfo('Purchase requests settings updated.');
    return saveSettings(settings);
}

/**
 * Updates the pending administrative action for a request.
 * @param payload - The action details.
 * @returns The updated purchase request.
 */
export async function updatePendingAction(payload: AdministrativeActionPayload): Promise<PurchaseRequest> {
    const updatedRequest = await updatePendingActionServer(payload);
    await logInfo(`Administrative action '${payload.action}' initiated for request ${updatedRequest.consecutive} by ${payload.updatedBy}.`);
    
    if (payload.action.includes('request')) {
        await createNotificationForPermission(
            'requests:status:approve', // A suitable admin-level permission
            `El usuario ${payload.updatedBy} solicita cancelar la solicitud ${updatedRequest.consecutive}.`,
            `/dashboard/requests?search=${updatedRequest.consecutive}`,
            updatedRequest.id,
            'purchase-request',
            'cancellation-request'
        );
    }
    
    return updatedRequest;
}

/**
 * Fetches the header and line items for a given ERP order number.
 * @param orderNumber The ERP order number to fetch.
 * @returns An object containing the order headers, an array of lines, and the real-time inventory for those lines.
 */
export async function getErpOrderData(identifier: string | DateRange): Promise<{headers: ErpOrderHeader[], lines: ErpOrderLine[], inventory: StockInfo[]}> {
    return getErpOrderDataServer(identifier);
}

/**
 * Analyzes ERP orders within a date range and suggests purchases for items with stock shortages.
 * @param dateRange - The date range for ERP orders to analyze.
 * @returns A promise that resolves to an array of purchase suggestions.
 */
export async function getRequestSuggestions(dateRange: DateRange): Promise<PurchaseSuggestion[]> {
    const { headers, lines } = await getErpOrderDataServer(dateRange);
    const [allStock, allProducts, allCustomers, erpPoHeaders, erpPoLines] = await Promise.all([
        getAllStock(),
        getAllProducts(),
        getAllCustomers(),
        getAllErpPurchaseOrderHeadersDb(),
        getAllErpPurchaseOrderLinesDb(),
    ]);
    const allActiveRequests = await getRequests({ page: 0, pageSize: 99999, isArchived: false, filters: {} }).then(res => res.requests.filter(r => ['pending', 'approved', 'ordered', 'purchasing-review', 'pending-approval'].includes(r.status)));

    const activePoNumbers = new Set(erpPoHeaders.filter((h: any) => h.ESTADO === 'A').map((h: any) => h.ORDEN_COMPRA));

    const requiredItems = new Map<string, { totalRequired: number; sourceOrders: Set<string>; clientIds: Set<string>; erpUsers: Set<string>; earliestCreationDate: Date | null, earliestDueDate: Date | null; }>();

    for (const line of lines) {
        const header = headers.find(h => h.PEDIDO === line.PEDIDO);
        if (!header) continue;

        if (!requiredItems.has(line.ARTICULO)) {
            requiredItems.set(line.ARTICULO, { totalRequired: 0, sourceOrders: new Set(), clientIds: new Set(), erpUsers: new Set(), earliestCreationDate: null, earliestDueDate: null });
        }
        
        const item = requiredItems.get(line.ARTICULO)!;
        item.totalRequired += line.CANTIDAD_PEDIDA;
        item.sourceOrders.add(header.PEDIDO);
        item.clientIds.add(header.CLIENTE);
        if (header.USUARIO) {
            item.erpUsers.add(header.USUARIO);
        }
        
        const creationDate = new Date(header.FECHA_PEDIDO);
        if (!item.earliestCreationDate || creationDate < item.earliestCreationDate) {
            item.earliestCreationDate = creationDate;
        }

        const dueDate = new Date(header.FECHA_PROMETIDA);
        if (!item.earliestDueDate || dueDate < item.earliestDueDate) {
            item.earliestDueDate = dueDate;
        }
    }

    const suggestions: PurchaseSuggestion[] = [];

    for (const [itemId, data] of requiredItems.entries()) {
        const stockInfo: StockInfo | undefined = allStock.find((s: StockInfo) => s.itemId === itemId);
        const currentStock = stockInfo?.totalStock ?? 0;
        
        const inTransitStock = erpPoLines
            .filter((line: any) => line.ARTICULO === itemId && activePoNumbers.has(line.ORDEN_COMPRA))
            .reduce((sum: any, line: any) => sum + line.CANTIDAD_ORDENADA, 0);

        const existingActiveRequests = allActiveRequests.filter(r => r.itemId === itemId);
        
        const shortage = data.totalRequired - currentStock - inTransitStock;

        if (shortage > 0) {
            const productInfo = allProducts.find((p: any) => p.id === itemId);
            const involvedClients = Array.from(data.clientIds).map(id => {
                const customer = allCustomers.find((c: any) => c.id === id);
                return { id, name: customer?.name || 'Desconocido' };
            });
            
            suggestions.push({
                itemId,
                itemDescription: productInfo?.description || 'Artículo no encontrado',
                itemClassification: productInfo?.classification || 'N/A',
                totalRequired: data.totalRequired,
                currentStock,
                inTransitStock,
                shortage,
                sourceOrders: Array.from(data.sourceOrders),
                involvedClients,
                erpUsers: Array.from(data.erpUsers),
                earliestCreationDate: data.earliestCreationDate ? data.earliestCreationDate.toISOString() : null,
                earliestDueDate: data.earliestDueDate ? data.earliestDueDate.toISOString() : null,
                existingActiveRequests: existingActiveRequests.map(r => ({
                    id: r.id,
                    consecutive: r.consecutive,
                    status: r.status,
                    quantity: r.quantity,
                    purchaseOrder: r.purchaseOrder,
                    erpOrderNumber: r.erpOrderNumber,
                    requestedBy: r.requestedBy,
                })),
            });
        }
    }

    return suggestions;
}


/**
 * Adds a note to a purchase request without changing its status.
 * @param payload - The note details including requestId and notes.
 * @returns The updated purchase request.
 */
export async function addNoteToRequest(payload: { requestId: number; notes: string; updatedBy: string; }): Promise<PurchaseRequest> {
    const updatedRequest = await addNoteServer(payload);
    await logInfo(`Note added to request ${updatedRequest.consecutive} by ${payload.updatedBy}.`);
    return updatedRequest;
}

/**
 * Gets the saved preferences for the purchase suggestions page for a specific user.
 * @param userId The ID of the user.
 * @returns A promise that resolves to the saved preferences or null.
 */
export async function getPurchaseSuggestionsPreferences(userId: number): Promise<Partial<UserPreferences> | null> {
    return getUserPreferencesServer(userId, 'purchaseSuggestionsPrefs');
}

/**
 * Saves the preferences for the purchase suggestions page for a specific user.
 * @param userId The ID of the user.
 * @param preferences The preferences object to save.
 */
export async function savePurchaseSuggestionsPreferences(userId: number, preferences: Partial<UserPreferences>): Promise<void> {
    return saveUserPreferencesServer(userId, 'purchaseSuggestionsPrefs', preferences);
}

export async function saveCostAnalysis(requestId: number, cost: number, salePrice: number): Promise<PurchaseRequest> {
    const updatedRequest = await saveCostAnalysisServer(requestId, cost, salePrice);
    await logInfo(`Cost analysis saved for request ${updatedRequest.consecutive}`, { requestId, cost, salePrice });
    return updatedRequest;
}
