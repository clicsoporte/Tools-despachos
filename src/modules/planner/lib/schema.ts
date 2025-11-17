
/**
 * @fileoverview Defines the expected database schema for the Planner module.
 * This is used by the central database audit system to verify integrity.
 */

import type { ExpectedSchema } from '@/modules/core/types';

export const plannerSchema: ExpectedSchema = {
    'planner_settings': ['key', 'value'],
    'production_orders': [
        'id', 'consecutive', 'purchaseOrder', 'requestDate', 'deliveryDate', 'scheduledStartDate',
        'scheduledEndDate', 'customerId', 'customerName', 'customerTaxId', 'productId', 'productDescription',
        'quantity', 'inventory', 'inventoryErp', 'priority', 'status', 'pendingAction', 'notes',
        'requestedBy', 'approvedBy', 'lastStatusUpdateBy', 'lastStatusUpdateNotes', 'lastModifiedBy',
        'lastModifiedAt', 'hasBeenModified', 'deliveredQuantity', 'defectiveQuantity', 'erpPackageNumber',
        'erpTicketNumber', 'reopened', 'machineId', 'shiftId', 'previousStatus', 'erpOrderNumber'
    ],
    'production_order_history': ['id', 'orderId', 'timestamp', 'status', 'notes', 'updatedBy'],
};
