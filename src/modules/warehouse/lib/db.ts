/**
 * @fileoverview Server-side functions for the warehouse database.
 */
'use server';

import { connectDb, getAllRoles as getAllRolesFromMain } from '../../core/lib/db';
import { getAllUsers as getAllUsersFromMain } from '../../core/lib/auth';
import type { WarehouseLocation, WarehouseInventoryItem, MovementLog, WarehouseSettings, StockSettings, StockInfo, ItemLocation, InventoryUnit, DateRange, User, ErpInvoiceHeader, ErpInvoiceLine, DispatchLog, DispatchContainer, DispatchAssignment, Vehiculo, Empleado, PhysicalInventoryComparisonItem, Product } from '@/modules/core/types';
import { logError, logInfo, logWarn } from '../../core/lib/logger';
import { triggerNotificationEvent } from '@/modules/notifications/lib/notifications-engine';
import path from 'path';
import { renderLocationPathAsString } from './utils';

const WAREHOUSE_DB_FILE = 'warehouse.db';


export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const defaults: WarehouseSettings = {
        locationLevels: [
            { type: 'building', name: 'Edificio' },
            { type: 'zone', name: 'Zona' },
            { type: 'rack', name: 'Rack' },
            { type: 'shelf', name: 'Estante' },
            { type: 'bin', name: 'Casilla' }
        ],
        unitPrefix: 'U',
        nextUnitNumber: 1,
        dispatchNotificationEmails: '',
    };
    try {
        const row = db.prepare(`SELECT value FROM warehouse_config WHERE key = 'settings'`).get() as { value: string } | undefined;
        if (row) {
            const settings = JSON.parse(row.value);
            return { ...defaults, ...settings };
        }
    } catch (error) {
        console.error("Error fetching warehouse settings, returning default.", error);
    }
    return defaults;
}

export async function saveWarehouseSettings(settings: WarehouseSettings): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare(`
        INSERT OR REPLACE INTO warehouse_config (key, value) VALUES ('settings', ?)
    `).run(JSON.stringify(settings));
}

// Helper function to recursively find all final child nodes (bins) of a location.
function getAllFinalChildren(locationId: number, allLocations: WarehouseLocation[]): number[] {
    let finalChildren: number[] = [];
    const queue: number[] = [locationId];
    const visited = new Set<number>();

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const children = allLocations.filter(l => l.parentId === currentId);
        if (children.length === 0) {
            finalChildren.push(currentId);
        } else {
            queue.push(...children.map(c => c.id));
        }
    }
    return finalChildren;
}


/**
 * Gets all locations and enriches them with completion status for wizard.
 * @returns {Promise<WarehouseLocation[]>} A promise that resolves to an array of all locations.
 */
export async function getLocations(): Promise<(WarehouseLocation & { isCompleted?: boolean })[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const allLocations = db.prepare('SELECT * FROM locations ORDER BY parentId, name').all() as WarehouseLocation[];
    const allItemLocations = db.prepare('SELECT locationId FROM item_locations').all() as { locationId: number }[];
    const populatedLocationIds = new Set(allItemLocations.map(il => il.locationId));

    const enrichedLocations = allLocations.map(loc => {
        // Check if a location is a 'level' (has children)
        const children = allLocations.filter(l => l.parentId === loc.id);
        if (children.length > 0) {
            // It's a parent, let's see if all its final children are populated
            const finalChildren = getAllFinalChildren(loc.id, allLocations);
            const isCompleted = finalChildren.length > 0 && finalChildren.every(childId => populatedLocationIds.has(childId));
            return { ...loc, isCompleted };
        }
        return loc;
    });

    return JSON.parse(JSON.stringify(enrichedLocations));
}

export async function getSelectableLocations(): Promise<WarehouseLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const allLocations = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
    const parentIds = new Set(allLocations.map(l => l.parentId).filter(Boolean));
    const selectable = allLocations.filter(l => !parentIds.has(l.id));
    return JSON.parse(JSON.stringify(selectable));
}

export async function getInventoryUnits(dateRange?: DateRange): Promise<InventoryUnit[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    
    if (dateRange?.from) {
        const toDate = new Date(dateRange.to || dateRange.from);
        toDate.setHours(23, 59, 59, 999);
        const units = db.prepare(`
            SELECT * FROM inventory_units 
            WHERE createdAt BETWEEN ? AND ?
            ORDER BY createdAt DESC
        `).all(dateRange.from.toISOString(), toDate.toISOString()) as InventoryUnit[];
        return JSON.parse(JSON.stringify(units));
    }
    
    const units = db.prepare('SELECT * FROM inventory_units ORDER BY createdAt DESC LIMIT 200').all() as InventoryUnit[];
    return JSON.parse(JSON.stringify(units));
}


export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { name, code, type, parentId } = location;

    // Validate for duplicate code before trying to insert
    const existing = db.prepare('SELECT id FROM locations WHERE code = ?').get(code);
    if (existing) {
        throw new Error(`El código de ubicación '${code}' ya está en uso. Por favor, elige otro.`);
    }

    const info = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(name, code, type, parentId ?? null);
    const newLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(info.lastInsertRowid) as WarehouseLocation;
    return newLocation;
}

export async function addBulkLocations(payload: { type: 'rack' | 'clone'; params: any; }): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { type, params } = payload;
    const settings = await getWarehouseSettings();

    const transaction = db.transaction(() => {
        if (type === 'rack') {
            const { name, prefix, levels, positions, depth, parentId } = params;

            // Check for existing code before trying to insert
            const existing = db.prepare('SELECT id FROM locations WHERE code = ?').get(prefix);
            if (existing) {
                throw new Error(`El código de prefijo '${prefix}' ya está en uso. Por favor, elige otro.`);
            }

            const rackType = settings.locationLevels.find(l => l.name.toLowerCase().includes('rack'))?.type || 'rack';
            const info = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(name, prefix, rackType, parentId || null);
            const rackId = info.lastInsertRowid as number;

            // --- Trigger Notification ---
            const allLocs = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
            const parentPath = parentId ? renderLocationPathAsString(parentId, allLocs) : null;
            const createdRack = db.prepare('SELECT * FROM locations WHERE id = ?').get(rackId) as WarehouseLocation;

            triggerNotificationEvent('onRackCreated', { 
                rack: createdRack,
                parentPath,
                createdBy: 'Asistente de Creación'
            }).catch(e => console.error("Failed to trigger rack creation notification:", e));
            // --- End Notification ---

            for (let i = 0; i < levels; i++) {
                const levelName = String.fromCharCode(65 + i);
                const levelType = settings.locationLevels[3]?.type || 'shelf';
                const levelInfo = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(`Nivel ${levelName}`, `${prefix}-${levelName}`, levelType, rackId);
                const levelId = levelInfo.lastInsertRowid as number;

                for (let j = 1; j <= positions; j++) {
                    const posName = String(j).padStart(2, '0');
                    const posType = settings.locationLevels[4]?.type || 'bin';
                    const posCode = `${prefix}-${levelName}-${posName}`;
                    const posInfo = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(`Posición ${posName}`, posCode, posType, levelId);
                    
                    if (depth > 0) {
                        const posId = posInfo.lastInsertRowid as number;
                        if (depth === 1) {
                            db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run('Frente', `${posCode}-F`, posType, posId);
                        } else if (depth >= 2) {
                            db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run('Frente', `${posCode}-F`, posType, posId);
                            db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run('Fondo', `${posCode}-T`, posType, posId);
                        }
                    }
                }
            }
        } else if (type === 'clone') {
            const { sourceRackId, newName, newPrefix } = params;

            const existing = db.prepare('SELECT id FROM locations WHERE code = ?').get(newPrefix);
            if (existing) {
                throw new Error(`El nuevo código de prefijo '${newPrefix}' ya está en uso.`);
            }

            const allLocations = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
            const sourceRack = allLocations.find(l => l.id === Number(sourceRackId));
            if (!sourceRack) throw new Error('Rack de origen no encontrado.');

            const mapping = new Map<number, number>();
            
            const newRackInfo = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(newName, newPrefix, sourceRack.type, sourceRack.parentId);
            const newRackId = newRackInfo.lastInsertRowid as number;
            mapping.set(sourceRack.id, newRackId);

            // --- Trigger Notification ---
            const allLocs = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
            const parentPath = sourceRack.parentId ? renderLocationPathAsString(sourceRack.parentId, allLocs) : null;
            const createdRack = db.prepare('SELECT * FROM locations WHERE id = ?').get(newRackId) as WarehouseLocation;
            triggerNotificationEvent('onRackCreated', { 
                rack: createdRack,
                parentPath,
                createdBy: 'Asistente de Clonación'
            }).catch(e => console.error("Failed to trigger rack cloning notification:", e));
            // --- End Notification ---

            function cloneChildren(oldParentId: number, newParentId: number, originalRackCode: string) {
                const children = allLocations.filter(l => l.parentId === oldParentId);
                for (const child of children) {
                    const newCode = child.code.replace(originalRackCode, newPrefix);
                    const newChildInfo = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(child.name, newCode, child.type, newParentId);
                    const newChildId = newChildInfo.lastInsertRowid as number;
                    mapping.set(child.id, newChildId);
                    cloneChildren(child.id, newChildId, originalRackCode);
                }
            }

            cloneChildren(sourceRack.id, newRackId, sourceRack.code);
        }
    });

    transaction();
}


export async function updateLocation(location: WarehouseLocation): Promise<WarehouseLocation> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { id, name, code, type, parentId } = location;
    db.prepare('UPDATE locations SET name = ?, code = ?, type = ?, parentId = ? WHERE id = ?').run(name, code, type, parentId ?? null, id);
    const updatedLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as WarehouseLocation;
    return updatedLocation;
}

export async function deleteLocation(id: number, userName: string): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    
    // Check for dependencies before deleting
    const inventoryCount = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE locationId = ?').get(id) as { count: number };
    const itemLocationCount = db.prepare('SELECT COUNT(*) as count FROM item_locations WHERE locationId = ?').get(id) as { count: number };
    const childrenCount = db.prepare('SELECT COUNT(*) as count FROM locations WHERE parentId = ?').get(id) as { count: number };

    if (inventoryCount.count > 0 || itemLocationCount.count > 0) {
        throw new Error('No se puede eliminar la ubicación porque contiene inventario o asignaciones de productos. Por favor, mueva o elimine el contenido primero.');
    }
    
    if (childrenCount.count > 0) {
        throw new Error('No se puede eliminar la ubicación porque tiene ubicaciones hijas. Por favor, elimine las ubicaciones anidadas primero.');
    }

    db.prepare('DELETE FROM locations WHERE id = ?').run(id);
    await logWarn(`Warehouse location with ID ${id} was deleted by user ${userName}.`);
}


export async function getInventoryForItem(itemId: string): Promise<WarehouseInventoryItem[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM inventory WHERE itemId = ?').all(itemId) as WarehouseInventoryItem[];
}

export async function logMovement(movement: Omit<MovementLog, 'id' | 'timestamp'>): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const newMovement = { ...movement, timestamp: new Date().toISOString() };
    db.prepare(
        'INSERT INTO movements (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) VALUES (@itemId, @quantity, @fromLocationId, @toLocationId, @timestamp, @userId, @notes)'
    ).run(newMovement);
}

export async function updateInventory(itemId: string, locationId: number, newQuantity: number, userId: number): Promise<void> {
    const warehouseDb = await connectDb(WAREHOUSE_DB_FILE);
    
    // Get user name from main DB first
    const mainDb = await connectDb();
    const user = mainDb.prepare('SELECT name FROM users WHERE id = ?').get(userId) as User | undefined;
    const userName = user?.name || 'Sistema';

    try {
        const transaction = warehouseDb.transaction(() => {
            const currentInventory = warehouseDb.prepare('SELECT quantity FROM inventory WHERE itemId = ? AND locationId = ?').get(itemId, locationId) as { quantity: number } | undefined;
            const oldQuantity = currentInventory?.quantity ?? 0;
            const difference = newQuantity - oldQuantity;

            if (difference !== 0) {
                warehouseDb.prepare(
                    `INSERT INTO inventory (itemId, locationId, quantity, lastUpdated, updatedBy) 
                     VALUES (?, ?, ?, datetime('now', 'localtime'), ?)
                     ON CONFLICT(itemId, locationId) 
                     DO UPDATE SET quantity = ?, updatedBy = ?, lastUpdated = datetime('now', 'localtime')`
                ).run(itemId, locationId, newQuantity, userName, newQuantity, userName);

                warehouseDb.prepare(
                    "INSERT INTO movements (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)"
                ).run(itemId, difference, null, locationId, userId, `Ajuste de inventario físico. Conteo: ${newQuantity}`);
            }
        });

        transaction();
    } catch(error) {
        logError('Error in updateInventory transaction', { error: (error as Error).message, user: userName });
        throw error;
    }
}


export async function getWarehouseData(): Promise<{ locations: WarehouseLocation[], inventory: WarehouseInventoryItem[], stock: StockInfo[], itemLocations: ItemLocation[], warehouseSettings: WarehouseSettings, stockSettings: StockSettings }> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const mainDb = await connectDb();
    
    const locations = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
    const inventory = db.prepare('SELECT * FROM inventory').all() as WarehouseInventoryItem[];
    const itemLocations = db.prepare('SELECT * FROM item_locations').all() as ItemLocation[];
    
    const stock = mainDb.prepare('SELECT * FROM stock').all() as {itemId: string; stockByWarehouse: string, totalStock: number}[];
    const parsedStock = stock.map(s => ({...s, stockByWarehouse: JSON.parse(s.stockByWarehouse)}));

    const warehouseSettings = await getWarehouseSettings();
    const stockSettingsRows = mainDb.prepare('SELECT * FROM stock_settings').all() as { key: string; value: string }[];
    const stockSettings: StockSettings = { warehouses: [] };
    for (const row of stockSettingsRows) {
        if (row.key === 'warehouses') {
            stockSettings.warehouses = JSON.parse(row.value);
        }
    }

    return JSON.parse(JSON.stringify({
        locations: locations || [],
        inventory: inventory || [],
        stock: parsedStock || [],
        itemLocations: itemLocations || [],
        warehouseSettings: warehouseSettings,
        stockSettings: stockSettings || { warehouses: [] },
    }));
}

export async function getMovements(itemId?: string): Promise<MovementLog[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    if (itemId) {
        return db.prepare('SELECT * FROM movements WHERE itemId = ? ORDER BY timestamp DESC').all(itemId) as MovementLog[];
    }
    return db.prepare('SELECT * FROM movements ORDER BY timestamp DESC').all() as MovementLog[];
}

export async function getItemLocations(itemId?: string): Promise<ItemLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    if (itemId) {
        const itemLocations = db.prepare('SELECT * FROM item_locations WHERE itemId = ?').all(itemId) as ItemLocation[];
        return JSON.parse(JSON.stringify(itemLocations));
    }
    const itemLocations = db.prepare('SELECT * FROM item_locations').all() as ItemLocation[];
    return JSON.parse(JSON.stringify(itemLocations));
}

export async function assignItemToLocation(itemId: string, locationId: number, clientId: string | null, updatedBy: string): Promise<ItemLocation> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const info = db.prepare(`INSERT OR REPLACE INTO item_locations (itemId, locationId, clientId, updatedBy, updatedAt) VALUES (?, ?, ?, ?, datetime('now'))`).run(itemId, locationId, clientId, updatedBy);
    const newId = info.lastInsertRowid;
    const newItemLocation = db.prepare('SELECT * FROM item_locations WHERE id = ?').get(newId) as ItemLocation;
    return newItemLocation;
}

export async function unassignItemFromLocation(assignmentId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM item_locations WHERE id = ?').run(assignmentId);
}

export async function addInventoryUnit(unit: Omit<InventoryUnit, 'id' | 'createdAt' | 'unitCode'>): Promise<InventoryUnit> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    
    const transaction = db.transaction(() => {
        const settingsRow = db.prepare(`SELECT value FROM warehouse_config WHERE key = 'settings'`).get() as { value: string };
        const parsedSettings: WarehouseSettings = JSON.parse(settingsRow.value);
        const prefix = parsedSettings.unitPrefix || 'U';
        const nextNumber = parsedSettings.nextUnitNumber || 1;
        const unitCode = `${prefix}${String(nextNumber).padStart(5, '0')}`;
        
        const newUnitData = {
            ...unit,
            createdAt: new Date().toISOString(),
            unitCode: unitCode,
            humanReadableId: unit.humanReadableId || null,
            documentId: unit.documentId || null,
            quantity: unit.quantity ?? 1,
        };
        const info = db.prepare(
            'INSERT INTO inventory_units (unitCode, productId, humanReadableId, documentId, locationId, quantity, notes, createdAt, createdBy) VALUES (@unitCode, @productId, @humanReadableId, @documentId, @locationId, @quantity, @notes, @createdAt, @createdBy)'
        ).run(newUnitData);
        
        const newId = info.lastInsertRowid as number;
        
        parsedSettings.nextUnitNumber = nextNumber + 1;
        db.prepare(`UPDATE warehouse_config SET value = ? WHERE key = 'settings'`).run(JSON.stringify(parsedSettings));

        return db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(newId) as InventoryUnit;
    });

    const newUnit = transaction();
    
    // Trigger notification
    triggerNotificationEvent('onReceivingCompleted', newUnit).catch(e => console.error("Failed to trigger receiving notification:", e));
    
    return newUnit;
}




export async function deleteInventoryUnit(id: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM inventory_units WHERE id = ?').run(id);
}

export async function getInventoryUnitById(id: string | number): Promise<InventoryUnit | null> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const searchTerm = String(id).toUpperCase();
    
    let unit: InventoryUnit | null | undefined;
    
    if (searchTerm.startsWith('U')) {
        unit = db.prepare('SELECT * FROM inventory_units WHERE UPPER(unitCode) = ?').get(searchTerm) as InventoryUnit | undefined;
    } else {
        unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(id) as InventoryUnit | undefined;
    }
    return unit ? JSON.parse(JSON.stringify(unit)) : null;
}

export async function updateInventoryUnitLocation(id: number, locationId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('UPDATE inventory_units SET locationId = ? WHERE id = ?').run(locationId, id);
}


// --- Wizard Lock Functions ---

export async function getActiveLocks(): Promise<any[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const locationLocks = db.prepare("SELECT id, name, code, 'location' as entityType, lockedBy, lockedByUserId FROM locations WHERE isLocked = 1").all();
    const containerLocks = db.prepare("SELECT id, name, name as code, 'container' as entityType, lockedBy, lockedByUserId FROM dispatch_containers WHERE isLocked = 1").all();
    return JSON.parse(JSON.stringify([...locationLocks, ...containerLocks]));
}

export async function lockEntity(payload: { entityIds: number[]; entityType: 'location' | 'container', userName: string; userId: number; }): Promise<{ locked: boolean; error?: string }> {
    const { entityType, ...rest } = payload;
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { entityIds, userName, userId } = rest;
    const tableName = entityType === 'location' ? 'locations' : 'dispatch_containers';

    const transaction = db.transaction(() => {
        const placeholders = entityIds.map(() => '?').join(',');
        const conflictingLocks = db.prepare(`SELECT id, lockedBy FROM ${tableName} WHERE id IN (${placeholders}) AND isLocked = 1 AND lockedByUserId != ?`).all(...entityIds, userId) as { id: number; lockedBy: string }[];
        
        if (conflictingLocks.length > 0) {
            logWarn(`Lock attempt failed on ${tableName}, entity already locked`, { conflictingLocks, user: userName });
            return { locked: true, error: `Bloqueado por: ${conflictingLocks[0].lockedBy}` };
        }

        const stmt = db.prepare(`UPDATE ${tableName} SET isLocked = 1, lockedBy = ?, lockedByUserId = ?, lockedAt = datetime('now') WHERE id IN (${placeholders})`);
        stmt.run(userName, userId, ...entityIds);
        
        return { locked: false };
    });

    return transaction();
}

export async function releaseLock(entityIds: number[], entityType: 'location' | 'container', userId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    if (entityIds.length === 0) return;
    const tableName = entityType === 'location' ? 'locations' : 'dispatch_containers';
    const placeholders = entityIds.map(() => '?').join(',');
    
    db.prepare(`UPDATE ${tableName} SET isLocked = 0, lockedBy = NULL, lockedByUserId = NULL, lockedAt = NULL WHERE id IN (${placeholders}) AND lockedByUserId = ?`).run(...entityIds, userId);
}

export async function forceReleaseLock(entityId: number, entityType: 'location' | 'container'): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const tableName = entityType === 'location' ? 'locations' : 'dispatch_containers';
    db.prepare(`UPDATE ${tableName} SET isLocked = 0, lockedBy = NULL, lockedByUserId = NULL, lockedAt = NULL WHERE id = ?`).run(entityId);
}
export async function getChildLocations(parentIds: number[]): Promise<WarehouseLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    if (parentIds.length === 0) return [];
    
    let allChildren: WarehouseLocation[] = [];
    const queue = [...parentIds];
    const visited = new Set<number>();

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const children = db.prepare(`SELECT * FROM locations WHERE parentId = ?`).all(currentId) as WarehouseLocation[];
        if (children.length === 0) {
            const self = db.prepare('SELECT * FROM locations WHERE id = ?').get(currentId) as WarehouseLocation;
            if(self) allChildren.push(self);
        } else {
            queue.push(...children.map(c => c.id));
        }
    }
    
    // De-duplicate in case of complex structures
    const uniqueChildren = Array.from(new Map(allChildren.map(item => [item.id, item])).values());
    return JSON.parse(JSON.stringify(uniqueChildren));
}

// --- Dispatch Check Actions ---
export async function searchDocuments(searchTerm: string): Promise<{ id: string, type: string, clientId: string, clientName: string }[]> {
    const db = await connectDb();
    const likeTerm = `%${searchTerm}%`;

    const query = `
        SELECT FACTURA as id, TIPO_DOCUMENTO as typeCode, CLIENTE as clientId, NOMBRE_CLIENTE as clientName 
        FROM erp_invoice_headers 
        WHERE (FACTURA LIKE @term OR PEDIDO LIKE @term)
          AND TIPO_DOCUMENTO IN ('F', 'R')
        UNION ALL
        SELECT h.PEDIDO as id, 'P' as typeCode, h.CLIENTE as clientId, c.name as clientName
        FROM erp_order_headers h
        LEFT JOIN customers c ON h.CLIENTE = c.id
        WHERE h.PEDIDO LIKE @term
    `;

    const results = db.prepare(query).all({ term: likeTerm }) as any[];
    
    const combinedResults = results.map(r => ({
        ...r,
        type: r.typeCode === 'F' ? 'Factura' : (r.typeCode === 'R' ? 'Remisión' : 'Pedido')
    })).slice(0, 10);

    return JSON.parse(JSON.stringify(combinedResults));
}


export async function getInvoiceData(documentId: string): Promise<{ header: ErpInvoiceHeader, lines: ErpInvoiceLine[] } | null> {
    const db = await connectDb();
    const header = db.prepare(`SELECT * FROM erp_invoice_headers WHERE FACTURA = ?`).get(documentId) as ErpInvoiceHeader | undefined;
    if (!header) return null;
    const lines = db.prepare(`SELECT * FROM erp_invoice_lines WHERE FACTURA = ? ORDER BY LINEA ASC`).all(documentId) as ErpInvoiceLine[];
    return JSON.parse(JSON.stringify({ header, lines }));
}


export async function logDispatch(dispatchData: any): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare(`
        INSERT INTO dispatch_logs (documentId, documentType, verifiedAt, verifiedByUserId, verifiedByUserName, items, notes, vehiclePlate, driverName, helper1Name, helper2Name)
        VALUES (@documentId, @documentType, @verifiedAt, @verifiedByUserId, @verifiedByUserName, @items, @notes, @vehiclePlate, @driverName, @helper1Name, @helper2Name)
    `).run({
        ...dispatchData,
        items: JSON.stringify(dispatchData.items),
        vehiclePlate: dispatchData.vehiclePlate || null,
        driverName: dispatchData.driverName || null,
        helper1Name: dispatchData.helper1Name || null,
        helper2Name: dispatchData.helper2Name || null,
    });
}

export async function getDispatchLogs(dateRange?: DateRange): Promise<DispatchLog[]> {
    const warehouseDb = await connectDb(WAREHOUSE_DB_FILE);
    
    warehouseDb.exec(`ATTACH DATABASE '${path.join(process.cwd(), 'dbs', 'intratool.db')}' AS main_db`);

    const params: any[] = [];
    let query = `
        SELECT 
            dl.id,
            dl.documentId,
            dl.documentType,
            dl.verifiedAt,
            dl.verifiedByUserId,
            dl.verifiedByUserName,
            dl.items,
            dl.notes,
            dl.vehiclePlate,
            dl.driverName,
            h.CLIENTE as clientId,
            h.NOMBRE_CLIENTE as clientName,
            h.EMBARCAR_A as shippingAddress
        FROM dispatch_logs dl
        LEFT JOIN main_db.erp_invoice_headers h ON dl.documentId = h.FACTURA
    `;

    if (dateRange?.from) {
        const startDate = new Date(dateRange.from);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(dateRange.to || dateRange.from);
        endDate.setHours(23, 59, 59, 999);
        
        query += ' WHERE dl.verifiedAt BETWEEN ? AND ?';
        params.push(startDate.toISOString(), endDate.toISOString());
    }

    query += ' ORDER BY dl.verifiedAt DESC';

    const logs = warehouseDb.prepare(query).all(...params) as any[];
    warehouseDb.exec(`DETACH DATABASE main_db`);
    return logs.map(log => ({
        ...log,
        items: JSON.parse(log.items),
    }));
}

export async function getContainers(): Promise<DispatchContainer[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const rows = db.prepare(`
        SELECT 
            c.id, c.name, c.createdBy, c.createdAt, c.isLocked, c.lockedBy, c.lockedByUserId, c.lockedAt,
            (SELECT COUNT(*) FROM dispatch_assignments WHERE containerId = c.id) as assignmentCount,
            (SELECT COUNT(*) FROM dispatch_assignments WHERE containerId = c.id AND status IN ('completed', 'discrepancy')) as completedAssignmentCount,
            (SELECT dl.verifiedByUserName FROM dispatch_assignments da JOIN dispatch_logs dl ON da.documentId = dl.documentId WHERE da.containerId = c.id ORDER BY dl.verifiedAt DESC LIMIT 1) as lastVerifiedBy,
            (SELECT dl.verifiedAt FROM dispatch_assignments da JOIN dispatch_logs dl ON da.documentId = dl.documentId WHERE da.containerId = c.id ORDER BY dl.verifiedAt DESC LIMIT 1) as lastVerifiedAt
        FROM dispatch_containers c
        GROUP BY c.id
        ORDER BY c.name ASC
    `).all() as (DispatchContainer & { assignmentCount: number, completedAssignmentCount: number, lastVerifiedBy: string | null, lastVerifiedAt: string | null })[];
    return JSON.parse(JSON.stringify(rows));
}

export async function saveContainer(container: Omit<DispatchContainer, 'id' | 'createdAt'>, updatedBy: string): Promise<DispatchContainer> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const info = db.prepare('INSERT INTO dispatch_containers (name, createdBy, createdAt) VALUES (?, ?, ?)').run(container.name, updatedBy, new Date().toISOString());
    const newContainer = db.prepare('SELECT * FROM dispatch_containers WHERE id = ?').get(info.lastInsertRowid) as DispatchContainer;
    return newContainer;
}

export async function deleteContainer(id: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM dispatch_containers WHERE id = ?').run(id);
}

export async function getUnassignedDocuments(dateRange: DateRange): Promise<ErpInvoiceHeader[]> {
    const mainDb = await connectDb();
    
    let query = `SELECT * FROM erp_invoice_headers WHERE TIPO_DOCUMENTO IN ('F', 'R')`;
    const params: any[] = [];
    
    if (dateRange.from) {
        query += ' AND FECHA >= ?';
        params.push(dateRange.from.toISOString());
    }
    if (dateRange.to) {
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        query += ' AND FECHA <= ?';
        params.push(toDate.toISOString());
    }
    
    query += ' ORDER BY FECHA DESC';

    const allInvoices = mainDb.prepare(query).all(...params) as ErpInvoiceHeader[];
    
    return JSON.parse(JSON.stringify(allInvoices));
}

export async function assignDocumentsToContainer(documentIds: string[], containerId: number, updatedBy: string): Promise<void> {
    const mainDb = await connectDb();
    const warehouseDb = await connectDb(WAREHOUSE_DB_FILE);

    const placeholders = documentIds.map(() => '?').join(',');
    
    const invoices = mainDb.prepare(`SELECT * FROM erp_invoice_headers WHERE FACTURA IN (${placeholders})`).all(...documentIds) as ErpInvoiceHeader[];
    
    const insert = warehouseDb.prepare(`
        INSERT INTO dispatch_assignments (containerId, documentId, documentType, documentDate, clientId, clientName, assignedBy, assignedAt, status)
        VALUES (@containerId, @documentId, @documentType, @documentDate, @clientId, @clientName, @assignedBy, @assignedAt, 'pending')
    `);

    const transaction = warehouseDb.transaction((docs: ErpInvoiceHeader[]) => {
        // First, unassign these docs from ANY container they might already be in
        if (docs.length > 0) {
            const docIdsToUnassign = docs.map((d: ErpInvoiceHeader) => d.FACTURA);
            const unassignPlaceholders = docIdsToUnassign.map(() => '?').join(',');
            warehouseDb.prepare(`DELETE FROM dispatch_assignments WHERE documentId IN (${unassignPlaceholders})`).run(...docIdsToUnassign);
        }

        for (const doc of docs) {
            insert.run({
                containerId: containerId,
                documentId: doc.FACTURA,
                documentType: doc.TIPO_DOCUMENTO,
                documentDate: typeof doc.FECHA === 'string' ? doc.FECHA : (doc.FECHA as Date).toISOString(),
                clientId: doc.CLIENTE,
                clientName: doc.NOMBRE_CLIENTE,
                assignedBy: updatedBy,
                assignedAt: new Date().toISOString(),
            });
        }
    });

    transaction(invoices);
}

export async function updateAssignmentOrder(containerId: number, orderedDocumentIds: string[]): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const updateStmt = db.prepare('UPDATE dispatch_assignments SET sortOrder = ? WHERE documentId = ? AND containerId = ?');
    const transaction = db.transaction(() => {
        for (let i = 0; i < orderedDocumentIds.length; i++) {
            updateStmt.run(i, orderedDocumentIds[i], containerId);
        }
    });
    transaction();
}

export async function getAssignmentsForContainer(containerId: number): Promise<DispatchAssignment[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM dispatch_assignments WHERE containerId = ? ORDER BY sortOrder ASC').all(containerId) as DispatchAssignment[];
}

export async function getAssignmentsByIds(documentIds: string[]): Promise<DispatchAssignment[]> {
    if (documentIds.length === 0) return [];
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const placeholders = documentIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM dispatch_assignments WHERE documentId IN (${placeholders})`).all(...documentIds) as DispatchAssignment[];
    return JSON.parse(JSON.stringify(rows));
}

export async function getNextDocumentInContainer(containerId: number, currentDocumentId: string): Promise<string | null> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const assignments = await getAssignmentsForContainer(containerId);
    const currentIndex = assignments.findIndex(a => a.documentId === currentDocumentId);
    
    if (currentIndex === -1) return null;

    // Find the next *uncompleted* document
    for (let i = currentIndex + 1; i < assignments.length; i++) {
        if (assignments[i].status !== 'completed' && assignments[i].status !== 'discrepancy') {
            return assignments[i].documentId;
        }
    }
    
    // If no uncompleted found after current, check from the beginning
    for (let i = 0; i < currentIndex; i++) {
         if (assignments[i].status !== 'completed' && assignments[i].status !== 'discrepancy') {
            return assignments[i].documentId;
        }
    }

    return null; // All documents are completed
}

export async function moveAssignmentToContainer(assignmentId: number, targetContainerId: number, documentId?: string): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);

    let docId = documentId;
    if (!docId && assignmentId > 0) {
        const assignment = db.prepare('SELECT documentId FROM dispatch_assignments WHERE id = ?').get(assignmentId) as { documentId: string } | undefined;
        if (!assignment) throw new Error("Asignación no encontrada.");
        docId = assignment.documentId;
    }
    
    if (!docId) throw new Error("ID de documento no válido para mover.");
    
    // Update the containerId for the assignment with the given documentId
    db.prepare('UPDATE dispatch_assignments SET containerId = ?, status = ? WHERE documentId = ?').run(targetContainerId, 'pending', docId);
}

export async function updateAssignmentStatus(documentId: string, status: 'pending' | 'in-progress' | 'completed' | 'discrepancy' | 'partial'): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('UPDATE dispatch_assignments SET status = ? WHERE documentId = ?').run(status, documentId);
}

export async function resetContainerAssignments(containerId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare("UPDATE dispatch_assignments SET status = 'pending' WHERE containerId = ?").run(containerId);
    logInfo(`Container ${containerId} has been reset.`);
}

export async function unassignAllFromContainer(containerId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM dispatch_assignments WHERE containerId = ?').run(containerId);
    logInfo(`All assignments cleared from container ${containerId}.`);
}

export async function unassignDocumentFromContainer(assignmentId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM dispatch_assignments WHERE id = ?').run(assignmentId);
}

export async function finalizeDispatch(containerId: number, vehiclePlate: string, driverName: string, helper1Name: string, helper2Name: string): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const logs = db.prepare(`
        SELECT dl.* 
        FROM dispatch_logs dl
        JOIN dispatch_assignments da ON dl.documentId = da.documentId
        WHERE da.containerId = ? AND dl.vehiclePlate IS NULL
    `).all(containerId) as DispatchLog[];

    const updateStmt = db.prepare(`UPDATE dispatch_logs SET vehiclePlate = ?, driverName = ?, helper1Name = ?, helper2Name = ? WHERE id = ?`);
    
    const transaction = db.transaction((logsToUpdate) => {
        for (const log of logsToUpdate) {
            updateStmt.run(vehiclePlate, driverName, helper1Name || null, helper2Name || null, log.id);
        }
    });

    transaction(logs);
    logInfo(`Finalized dispatch for container ${containerId}`, { vehiclePlate, driverName, helper1Name, helper2Name });
}

export async function getEmployees(): Promise<Empleado[]> {
    const db = await connectDb();
    try {
        const employees = db.prepare('SELECT * FROM empleados WHERE ACTIVO = ? ORDER BY NOMBRE').all('S') as Empleado[];
        // Format names at the source
        return employees.map(e => ({...e, NOMBRE: e.NOMBRE}));
    } catch (error) {
        console.error("Failed to get all employees:", error);
        return [];
    }
}

export async function getVehicles(): Promise<Vehiculo[]> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM vehiculos ORDER BY placa').all() as Vehiculo[];
    } catch (error) {
        console.error("Failed to get all vehicles:", error);
        return [];
    }
}

export async function correctInventoryUnit(originalUnit: InventoryUnit, newProductId: string, correctedByUserId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const mainDb = await connectDb();
    
    const user = mainDb.prepare('SELECT name FROM users WHERE id = ?').get(correctedByUserId) as { name: string } | undefined;
    const userName = user?.name || 'Sistema';

    const transaction = db.transaction(() => {
        // Step 1: "Anular" the original unit by setting its quantity to 0
        const notesForAnnulment = `ANULADO: Corregido por ${userName}. Producto original era ${originalUnit.productId}.`;
        db.prepare('UPDATE inventory_units SET quantity = 0, notes = ? WHERE id = ?').run(notesForAnnulment, originalUnit.id);
        
        // Step 2: Log the "reversal" movement
        db.prepare(
            `INSERT INTO movements (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) 
             VALUES (?, ?, ?, ?, datetime('now'), ?, ?)`
        ).run(originalUnit.productId, -originalUnit.quantity, originalUnit.locationId, null, correctedByUserId, notesForAnnulment);

        // Step 3: Create a new unit with the correct product ID
        const newUnitPayload = {
            ...originalUnit,
            productId: newProductId,
            createdBy: userName, // The person making the correction is the creator of the new record
            notes: `CORRECCIÓN: Creado a partir de la unidad anulada ${originalUnit.unitCode}.`,
        };
        
        // This reuses the logic to create a unit but we don't need the returned object here
        const settingsRow = db.prepare(`SELECT value FROM warehouse_config WHERE key = 'settings'`).get() as { value: string };
        const parsedSettings: WarehouseSettings = JSON.parse(settingsRow.value);
        const prefix = parsedSettings.unitPrefix || 'U';
        const nextNumber = parsedSettings.nextUnitNumber || 1;
        const newUnitCode = `${prefix}${String(nextNumber).padStart(5, '0')}`;

        const newUnitData = {
            ...newUnitPayload,
            unitCode: newUnitCode,
            createdAt: new Date().toISOString(),
        };

        db.prepare(
            'INSERT INTO inventory_units (unitCode, productId, humanReadableId, documentId, locationId, quantity, notes, createdAt, createdBy) VALUES (@unitCode, @productId, @humanReadableId, @documentId, @locationId, @quantity, @notes, @createdAt, @createdBy)'
        ).run(newUnitData);
        
        parsedSettings.nextUnitNumber = nextNumber + 1;
        db.prepare(`UPDATE warehouse_config SET value = ? WHERE key = 'settings'`).run(JSON.stringify(parsedSettings));

        // Step 4: Log the "new" movement for the correct item
        db.prepare(
            `INSERT INTO movements (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) 
             VALUES (?, ?, ?, ?, datetime('now'), ?, ?)`
        ).run(newProductId, originalUnit.quantity, null, originalUnit.locationId, correctedByUserId, newUnitPayload.notes);
    });

    try {
        transaction();
        logInfo(`Inventory unit ${originalUnit.unitCode} corrected by ${userName}. New product: ${newProductId}.`);
    } catch(err) {
        logError('Failed to execute correctInventoryUnit transaction', { error: (err as Error).message });
        throw err;
    }
}
