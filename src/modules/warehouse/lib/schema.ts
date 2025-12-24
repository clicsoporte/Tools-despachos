/**
 * @fileoverview Defines the expected database schema for the Warehouse module.
 * This is used by the central database audit system to verify integrity.
 */

import type { ExpectedSchema } from '@/modules/core/types';

export const warehouseSchema: ExpectedSchema = {
    'locations': ['id', 'name', 'code', 'type', 'parentId'],
    'inventory': ['id', 'itemId', 'locationId', 'quantity', 'lastUpdated', 'updatedBy'],
    'item_locations': ['id', 'itemId', 'locationId', 'clientId', 'updatedBy', 'updatedAt'],
    'inventory_units': ['id', 'unitCode', 'productId', 'humanReadableId', 'locationId', 'notes', 'createdAt', 'createdBy'],
    'movements': ['id', 'itemId', 'quantity', 'fromLocationId', 'toLocationId', 'timestamp', 'userId', 'notes'],
    'warehouse_config': ['key', 'value'],
    'active_wizard_sessions': ['id', 'userId', 'userName', 'lockedEntityId', 'lockedEntityType', 'lockedEntityName', 'expiresAt'],
};
