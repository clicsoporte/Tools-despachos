/**
 * @fileoverview Defines the expected database schema for the Warehouse module.
 * This is used by the central database audit system to verify integrity.
 */

import type { ExpectedSchema } from '@/modules/core/types';

export const warehouseSchema: ExpectedSchema = {
    'locations': ['id', 'name', 'code', 'type', 'parentId', 'isLocked', 'lockedBy', 'lockedByUserId', 'lockedAt'],
    'inventory': ['id', 'itemId', 'locationId', 'quantity', 'lastUpdated', 'updatedBy'],
    'item_locations': ['id', 'itemId', 'locationId', 'clientId', 'updatedBy', 'updatedAt'],
    'inventory_units': ['id', 'unitCode', 'productId', 'humanReadableId', 'documentId', 'locationId', 'quantity', 'notes', 'createdAt', 'createdBy'],
    'movements': ['id', 'itemId', 'quantity', 'fromLocationId', 'toLocationId', 'timestamp', 'userId', 'notes'],
    'warehouse_config': ['key', 'value'],
    'dispatch_logs': ['id', 'documentId', 'documentType', 'verifiedAt', 'verifiedByUserId', 'verifiedByUserName', 'items', 'notes'],
    'dispatch_containers': ['id', 'name', 'createdBy', 'createdAt', 'isLocked', 'lockedBy', 'lockedByUserId', 'lockedAt'],
    'dispatch_assignments': ['id', 'containerId', 'documentId', 'documentType', 'documentDate', 'clientId', 'clientName', 'assignedBy', 'assignedAt', 'sortOrder', 'status'],
};
