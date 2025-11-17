
/**
 * @fileoverview Defines the expected database schema for the Requests module.
 * This is used by the central database audit system to verify integrity.
 */

import type { ExpectedSchema } from '@/modules/core/types';

export const requestSchema: ExpectedSchema = {
    'request_settings': ['key', 'value'],
    'purchase_requests': [
        'id', 'consecutive', 'purchaseOrder', 'requestDate', 'requiredDate', 'arrivalDate',
        'receivedDate', 'clientId', 'clientName', 'clientTaxId', 'itemId', 'itemDescription',
        'quantity', 'deliveredQuantity', 'inventory', 'inventoryErp', 'priority', 'purchaseType', 'unitSalePrice',
        'salePriceCurrency', 'requiresCurrency', 'erpOrderNumber', 'erpOrderLine', 'erpEntryNumber',
        'manualSupplier', 'route', 'shippingMethod', 'status', 'pendingAction', 'notes',
        'requestedBy', 'approvedBy', 'receivedInWarehouseBy', 'lastStatusUpdateBy',
        'lastStatusUpdateNotes', 'reopened', 'previousStatus', 'lastModifiedBy', 'lastModifiedAt',
        'hasBeenModified', 'sourceOrders', 'involvedClients', 'analysis'
    ],
    'purchase_request_history': ['id', 'requestId', 'timestamp', 'status', 'notes', 'updatedBy'],
};
