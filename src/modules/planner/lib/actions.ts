/**
 * @fileoverview Client-side functions for interacting with the planner's server-side DB functions.
 * This abstraction layer ensures components only call client-safe functions.
 */
'use client';

import type { ProductionOrder, UpdateStatusPayload, UpdateOrderDetailsPayload, ProductionOrderHistoryEntry, PlannerSettings, UpdateProductionOrderPayload, DateRange, PlannerNotePayload, AdministrativeActionPayload, User, PlannerShift, ProductionReportData } from '../../core/types';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { createNotificationForPermission, createNotification } from '@/modules/core/lib/notifications-actions';
import { 
    getOrders as getOrdersServer, 
    addOrder, 
    updateOrder,
    updateStatus, 
    updateDetails,
    getOrderHistory as getOrderHistoryServer,
    getPlannerSettings as getSettingsServer,
    saveSettings as saveSettingsServer,
    addNote as addNoteServer,
    updatePendingAction as updatePendingActionServer,
    confirmModification as confirmModificationServer,
    getUserByName,
    getRolesWithPermission,
    getCompletedOrdersByDateRange as getCompletedOrdersByDateRangeServer,
} from './db';
import { getStatusConfig } from './utils';

/**
 * Fetches production orders from the server.
 * @param options - Pagination and filtering options.
 * @returns A promise that resolves to the orders and total counts.
 */
export async function getProductionOrders(options: { 
    page: number; 
    pageSize: number;
    isArchived: boolean;
    filters: {
        searchTerm?: string;
        status?: string[];
        classification?: string[];
        showOnlyMy?: string;
        dateRange?: DateRange;
    };
}): Promise<{ activeOrders: ProductionOrder[], archivedOrders: ProductionOrder[], totalActiveCount: number, totalArchivedCount: number }> {
    return getOrdersServer(options);
}


/**
 * Saves a new production order.
 * @param order - The order data to save.
 * @param requestedBy - The name of the user creating the order.
 * @returns The newly created production order.
 */
export async function saveProductionOrder(order: Omit<ProductionOrder, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'erpPackageNumber' | 'erpTicketNumber' | 'machineId' | 'previousStatus' | 'scheduledStartDate' | 'scheduledEndDate' | 'requestedBy' | 'hasBeenModified' | 'lastModifiedBy' | 'lastModifiedAt' | 'shiftId'>, requestedBy: string): Promise<ProductionOrder> {
    const createdOrder = await addOrder(order, requestedBy);
    await logInfo(`Production order ${createdOrder.consecutive} created by ${requestedBy}`, { customer: createdOrder.customerName, product: createdOrder.productDescription, quantity: createdOrder.quantity });

    await createNotificationForPermission(
        'planner:status:approve', // This is a good proxy for supervisors/approvers
        `Nueva orden ${createdOrder.consecutive} para "${createdOrder.customerName}" requiere aprobación.`,
        `/dashboard/planner?search=${createdOrder.consecutive}`,
        createdOrder.id,
        'production-order',
        'approve'
    );

    return createdOrder;
}

/**
 * Updates the main details of an existing production order.
 * @param payload - The data to update.
 * @returns The updated production order.
 */
export async function updateProductionOrder(payload: UpdateProductionOrderPayload): Promise<ProductionOrder> {
    const updatedOrder = await updateOrder(payload);
    await logInfo(`Production order ${updatedOrder.consecutive} edited by ${payload.updatedBy}`, { orderId: payload.orderId });
    return updatedOrder;
}

/**
 * Confirms that a modification to an approved order has been reviewed.
 * @param orderId - The ID of the order.
 * @param updatedBy - The name of the user confirming the modification.
 * @returns The updated production order.
 */
export async function confirmModification(orderId: number, updatedBy: string): Promise<ProductionOrder> {
    const updatedOrder = await confirmModificationServer(orderId, updatedBy);
    await logInfo(`Modification of order ${updatedOrder.consecutive} confirmed by ${updatedBy}`, { orderId });
    return updatedOrder;
}


/**
 * Updates the status of a production order.
 * @param payload - The status update information.
 * @returns The updated production order.
 */
export async function updateProductionOrderStatus(payload: UpdateStatusPayload): Promise<ProductionOrder> {
    const updatedOrder = await updateStatus(payload);
    await logInfo(`Status of order ${updatedOrder.consecutive} updated to '${payload.status}' by ${payload.updatedBy}`, { notes: payload.notes, orderId: payload.orderId });
    
    // --- Create Notification ---
    if (updatedOrder.requestedBy !== payload.updatedBy) {
        const targetUser = await getUserByName(updatedOrder.requestedBy);
        const settings = await getSettingsServer();
        const statusConfig = getStatusConfig(settings);

        if (targetUser) {
            const statusLabel = statusConfig[payload.status]?.label || payload.status;
            await createNotification({
                userId: targetUser.id,
                message: `La orden ${updatedOrder.consecutive} ha sido actualizada a: ${statusLabel}.`,
                href: `/dashboard/planner?search=${updatedOrder.consecutive}`,
                entityId: updatedOrder.id,
                entityType: 'production-order',
                entityStatus: payload.status,
            });
        }
    }
    
    return updatedOrder;
}

/**
 * Updates specific details of a production order like priority or machine assignment.
 * @param payload - The details to update.
 * @returns The updated production order.
 */
export async function updateProductionOrderDetails(payload: UpdateOrderDetailsPayload): Promise<ProductionOrder> {
    const updatedOrder = await updateDetails(payload);
    await logInfo(`Details for order ${updatedOrder.consecutive} updated by ${payload.updatedBy}`, { details: payload });
    return updatedOrder;
}

/**
 * Fetches planner settings from the server.
 * @returns The current planner settings.
 */
export async function getPlannerSettings(): Promise<PlannerSettings> {
    return getSettingsServer();
}

/**
 * Saves planner settings.
 * @param settings - The settings object to save.
 */
export async function savePlannerSettings(settings: PlannerSettings): Promise<void> {
    await logInfo('Planner settings updated.');
    return saveSettingsServer(settings);
}

/**
 * Fetches the history for a specific order.
 * @param orderId - The ID of the order.
 * @returns A promise that resolves to an array of history entries.
 */
export async function getOrderHistory(orderId: number): Promise<ProductionOrderHistoryEntry[]> {
    return getOrderHistoryServer(orderId);
}

/**
 * Adds a note to a production order without changing its status.
 * @param payload - The note details.
 * @returns The updated production order.
 */
export async function addNoteToOrder(payload: PlannerNotePayload): Promise<ProductionOrder> {
    const updatedOrder = await addNoteServer(payload);
    await logInfo(`Note added to order ${updatedOrder.consecutive} by ${payload.updatedBy}.`);
    return updatedOrder;
}

/**
 * Updates the pending administrative action for an order.
 * @param payload - The action details.
 * @returns The updated production order.
 */
export async function updatePendingAction(payload: AdministrativeActionPayload): Promise<ProductionOrder> {
    const updatedOrder = await updatePendingActionServer(payload);
    await logInfo(`Administrative action '${payload.action}' initiated for order ${updatedOrder.consecutive} by ${payload.updatedBy}.`);

    // --- Create Notification for Admin Action ---
    if (payload.action.includes('request')) {
         await createNotificationForPermission(
            'planner:status:unapprove-request:approve', // A suitable admin-level permission
            `El usuario ${payload.updatedBy} solicita cancelar/desaprobar la orden ${updatedOrder.consecutive}.`,
            `/dashboard/planner?search=${updatedOrder.consecutive}`,
            updatedOrder.id,
            'production-order',
            'cancellation-request'
        );
    }

    return updatedOrder;
}

export async function getCompletedOrdersByDateRange(dateRange: DateRange): Promise<(ProductionOrder & { history: ProductionOrderHistoryEntry[] })[]> {
    return getCompletedOrdersByDateRangeServer(dateRange);
}
