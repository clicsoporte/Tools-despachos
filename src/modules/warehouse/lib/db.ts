/**
 * @fileoverview Server-side functions for the warehouse database.
 */
"use server";

import { connectDb, getAllStock as getAllStockFromMain, getStockSettings as getStockSettingsFromMain } from '@/modules/core/lib/db';
import type { WarehouseLocation, WarehouseInventoryItem, MovementLog, WarehouseSettings, StockSettings, StockInfo, ItemLocation, InventoryUnit, DateRange, WizardSession } from '@/modules/core/types';
import { logError } from '@/modules/core/lib/logger';

const WAREHOUSE_DB_FILE = 'warehouse.db';

// This function is automatically called when the database is first created.
export async function initializeWarehouseDb(db: import('better-sqlite3').Database) {
    const schema = `
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL, -- 'building', 'zone', 'rack', 'shelf', 'bin'
            parentId INTEGER,
            FOREIGN KEY (parentId) REFERENCES locations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL, -- Corresponds to Product['id'] from main DB
            locationId INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 0,
            lastUpdated TEXT NOT NULL,
            updatedBy TEXT,
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE,
            UNIQUE (itemId, locationId)
        );

         CREATE TABLE IF NOT EXISTS item_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL,
            locationId INTEGER NOT NULL,
            clientId TEXT,
            updatedBy TEXT,
            updatedAt TEXT,
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE,
            UNIQUE (itemId, locationId, clientId)
        );

        CREATE TABLE IF NOT EXISTS inventory_units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unitCode TEXT UNIQUE,
            productId TEXT NOT NULL,
            humanReadableId TEXT,
            locationId INTEGER,
            notes TEXT,
            createdAt TEXT NOT NULL,
            createdBy TEXT NOT NULL,
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL,
            quantity REAL NOT NULL,
            fromLocationId INTEGER,
            toLocationId INTEGER,
            timestamp TEXT NOT NULL,
            userId INTEGER NOT NULL,
            notes TEXT,
            FOREIGN KEY (fromLocationId) REFERENCES locations(id) ON DELETE CASCADE,
            FOREIGN KEY (toLocationId) REFERENCES locations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS warehouse_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS active_wizard_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            userName TEXT NOT NULL,
            lockedEntityIds TEXT NOT NULL,
            lockedEntityName TEXT NOT NULL,
            expiresAt TEXT NOT NULL
        );
    `;
    db.exec(schema);

    // Insert default settings
    const defaultSettings: Partial<WarehouseSettings> = {
        locationLevels: [
            { type: 'building', name: 'Edificio' },
            { type: 'zone', name: 'Zona' },
            { type: 'rack', name: 'Rack' },
            { type: 'shelf', name: 'Estante' },
            { type: 'bin', name: 'Casilla' }
        ],
        unitPrefix: 'U',
        nextUnitNumber: 1,
    };
    db.prepare(`
        INSERT OR IGNORE INTO warehouse_config (key, value) VALUES ('settings', ?)
    `).run(JSON.stringify(defaultSettings));
    
    console.log(`Database ${WAREHOUSE_DB_FILE} initialized for Warehouse Management.`);
    await runWarehouseMigrations(db);
};

export async function runWarehouseMigrations(db: import('better-sqlite3').Database) {
    try {
        const recreateTableWithCascade = (tableName: string, createSql: string, columns: string) => {
            db.transaction(() => {
                db.exec(`CREATE TABLE ${tableName}_temp_migration AS SELECT * FROM ${tableName};`);
                db.exec(`DROP TABLE ${tableName};`);
                db.exec(createSql);
                db.exec(`INSERT INTO ${tableName} (${columns}) SELECT ${columns} FROM ${tableName}_temp_migration;`);
                db.exec(`DROP TABLE ${tableName}_temp_migration;`);
                console.log(`MIGRATION (warehouse.db): Successfully recreated '${tableName}' table with ON DELETE CASCADE.`);
            })();
        };

        const checkAndRecreateForeignKey = (tableName: string, columnName: string, createSql: string, columnsCsv: string) => {
            const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`).get();
            if (!tableExists) return;

            const foreignKeyList = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all() as any[];
            const fk = foreignKeyList.find(f => f.from === columnName);
            
            // Also check if it's pointing to the wrong table (the old bug)
            if ((fk && fk.on_delete !== 'CASCADE') || (fk && fk.table !== 'locations')) {
                recreateTableWithCascade(tableName, createSql, columnsCsv);
            }
        };

        checkAndRecreateForeignKey('locations', 'parentId', 
            `CREATE TABLE locations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, type TEXT NOT NULL, parentId INTEGER, FOREIGN KEY (parentId) REFERENCES locations(id) ON DELETE CASCADE);`,
            'id, name, code, type, parentId');
        
        checkAndRecreateForeignKey('inventory', 'locationId',
            `CREATE TABLE inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, itemId TEXT NOT NULL, locationId INTEGER NOT NULL, quantity REAL NOT NULL DEFAULT 0, lastUpdated TEXT NOT NULL, updatedBy TEXT, FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE, UNIQUE (itemId, locationId));`,
            'id, itemId, locationId, quantity, lastUpdated, updatedBy');
        
        checkAndRecreateForeignKey('item_locations', 'locationId',
            `CREATE TABLE item_locations (id INTEGER PRIMARY KEY AUTOINCREMENT, itemId TEXT NOT NULL, locationId INTEGER NOT NULL, clientId TEXT, updatedBy TEXT, updatedAt TEXT, FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE, UNIQUE (itemId, locationId, clientId));`,
            'id, itemId, locationId, clientId, updatedBy, updatedAt');
        
        checkAndRecreateForeignKey('inventory_units', 'locationId',
            `CREATE TABLE inventory_units (id INTEGER PRIMARY KEY AUTOINCREMENT, unitCode TEXT UNIQUE, productId TEXT NOT NULL, humanReadableId TEXT, locationId INTEGER, notes TEXT, createdAt TEXT NOT NULL, createdBy TEXT NOT NULL, FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE);`,
            'id, unitCode, productId, humanReadableId, locationId, notes, createdAt, createdBy');
        
        // Corrected createSql for 'movements'
        const movementsCreateSql = `CREATE TABLE movements (id INTEGER PRIMARY KEY AUTOINCREMENT, itemId TEXT NOT NULL, quantity REAL NOT NULL, fromLocationId INTEGER, toLocationId INTEGER, timestamp TEXT NOT NULL, userId INTEGER NOT NULL, notes TEXT, FOREIGN KEY (fromLocationId) REFERENCES locations(id) ON DELETE CASCADE, FOREIGN KEY (toLocationId) REFERENCES locations(id) ON DELETE CASCADE);`;
        
        checkAndRecreateForeignKey('movements', 'fromLocationId',
            movementsCreateSql,
            'id, itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes');
        
        // It's possible only one of the two FKs is wrong, so check the other one too.
        checkAndRecreateForeignKey('movements', 'toLocationId',
            movementsCreateSql,
            'id, itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes');

        const inventoryTableInfo = db.prepare(`PRAGMA table_info(inventory)`).all() as { name: string }[];
        if (!inventoryTableInfo.some(c => c.name === 'updatedBy')) {
            console.log("MIGRATION (warehouse.db): Adding 'updatedBy' to 'inventory' table.");
            db.exec('ALTER TABLE inventory ADD COLUMN updatedBy TEXT');
        }

        const itemLocationsTableInfo = db.prepare(`PRAGMA table_info(item_locations)`).all() as { name: string }[];
        if (!itemLocationsTableInfo.some(c => c.name === 'updatedBy')) {
            console.log("MIGRATION (warehouse.db): Adding 'updatedBy' to 'item_locations' table.");
            db.exec('ALTER TABLE item_locations ADD COLUMN updatedBy TEXT');
        }
        if (!itemLocationsTableInfo.some(c => c.name === 'updatedAt')) {
            console.log("MIGRATION (warehouse.db): Adding 'updatedAt' to 'item_locations' table.");
            db.exec('ALTER TABLE item_locations ADD COLUMN updatedAt TEXT');
        }

        const wizardTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='active_wizard_sessions'`).get();
        if (!wizardTable) {
             console.log("MIGRATION (warehouse.db): Creating 'active_wizard_sessions' table.");
             db.exec(`
                CREATE TABLE IF NOT EXISTS active_wizard_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    userId INTEGER NOT NULL,
                    userName TEXT NOT NULL,
                    lockedEntityIds TEXT NOT NULL,
                    lockedEntityName TEXT NOT NULL,
                    expiresAt TEXT NOT NULL
                );
             `);
        } else {
            const wizardTableInfo = db.prepare(`PRAGMA table_info(active_wizard_sessions)`).all() as { name: string }[];
            const wizardColumns = new Set(wizardTableInfo.map(c => c.name));
            if (!wizardColumns.has('lockedEntityIds')) {
                db.exec('ALTER TABLE active_wizard_sessions ADD COLUMN lockedEntityIds TEXT');
                // Potentially migrate old lockedEntityId to new column here if needed.
                // For simplicity, we are assuming a fresh start for this feature.
                // You might run: db.exec('UPDATE active_wizard_sessions SET lockedEntityIds = JSON_ARRAY(lockedEntityId)');
            }
             if (wizardColumns.has('lockedEntityId') || wizardColumns.has('lockedEntityType')) {
                console.log("MIGRATION (warehouse.db): Recreating 'active_wizard_sessions' table with new schema.");
                db.transaction(() => {
                    const tempCreate = `CREATE TABLE active_wizard_sessions_temp (id INTEGER, userId INTEGER, userName TEXT, lockedEntityIds TEXT, lockedEntityName TEXT, expiresAt TEXT);`;
                    db.exec(tempCreate);
                    // No data migration as the structure is fundamentally changing
                    db.exec('DROP TABLE active_wizard_sessions;');
                    db.exec(`
                        CREATE TABLE active_wizard_sessions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            userId INTEGER NOT NULL,
                            userName TEXT NOT NULL,
                            lockedEntityIds TEXT NOT NULL,
                            lockedEntityName TEXT NOT NULL,
                            expiresAt TEXT NOT NULL
                        );
                    `);
                    db.exec('DROP TABLE active_wizard_sessions_temp;');
                })();
            }
        }

    } catch (error) {
        console.error("Error during warehouse migrations:", error);
        logError("Error during warehouse migrations", { error: (error as Error).message });
    }
}


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

export async function getLocations(): Promise<WarehouseLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM locations ORDER BY parentId, name').all() as WarehouseLocation[];
}

export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { name, code, type, parentId } = location;
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
            const { name, prefix, levels, positions, depth } = params;
            const rackType = settings.locationLevels.find(l => l.name.toLowerCase().includes('rack'))?.type || 'rack';
            const info = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, NULL)').run(name, prefix, rackType);
            const rackId = info.lastInsertRowid as number;

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
            const allLocations = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
            const sourceRack = allLocations.find(l => l.id === Number(sourceRackId));
            if (!sourceRack) throw new Error('Rack de origen no encontrado.');

            const mapping = new Map<number, number>();
            
            const newRackInfo = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(newName, newPrefix, sourceRack.type, sourceRack.parentId);
            const newRackId = newRackInfo.lastInsertRowid as number;
            mapping.set(sourceRack.id, newRackId);

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

export async function deleteLocation(id: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM locations WHERE id = ?').run(id);
}


export async function getInventoryForItem(itemId: string): Promise<WarehouseInventoryItem[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM inventory WHERE itemId = ?').all(itemId) as WarehouseInventoryItem[];
}

export async function getInventory(dateRange?: DateRange): Promise<WarehouseInventoryItem[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    if (dateRange?.from) {
        const toDate = dateRange.to || new Date();
        toDate.setHours(23, 59, 59, 999);
        return db.prepare(`
            SELECT * FROM inventory 
            WHERE lastUpdated BETWEEN ? AND ?
            ORDER BY lastUpdated DESC
        `).all(dateRange.from.toISOString(), toDate.toISOString()) as WarehouseInventoryItem[];
    }
    return db.prepare('SELECT * FROM inventory ORDER BY lastUpdated DESC').all() as WarehouseInventoryItem[];
}

export async function updateInventory(itemId: string, locationId: number, quantity: number, updatedBy: string): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
     db.prepare(
        `INSERT INTO inventory (itemId, locationId, quantity, lastUpdated, updatedBy) 
         VALUES (?, ?, ?, datetime('now'), ?)
         ON CONFLICT(itemId, locationId) 
         DO UPDATE SET quantity = ?, updatedBy = ?, lastUpdated = datetime('now')`
    ).run(itemId, locationId, quantity, updatedBy, quantity, updatedBy);
}

export async function logMovement(movement: Omit<MovementLog, 'id' | 'timestamp'>): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const newMovement = { ...movement, timestamp: new Date().toISOString() };
    db.prepare(
        'INSERT INTO movements (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) VALUES (@itemId, @quantity, @fromLocationId, @toLocationId, @timestamp, @userId, @notes)'
    ).run(newMovement);
}

export async function getWarehouseData(): Promise<{ locations: WarehouseLocation[], inventory: WarehouseInventoryItem[], stock: StockInfo[], itemLocations: ItemLocation[], warehouseSettings: WarehouseSettings, stockSettings: StockSettings }> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const locations = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
    const inventory = db.prepare('SELECT * FROM inventory').all() as WarehouseInventoryItem[];
    const itemLocations = db.prepare('SELECT * FROM item_locations').all() as ItemLocation[];
    const stock = await getAllStockFromMain();
    const warehouseSettings = await getWarehouseSettings();
    const stockSettings = await getStockSettingsFromMain();

    return JSON.parse(JSON.stringify({
        locations: locations || [],
        inventory: inventory || [],
        stock: stock || [],
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

export async function getItemLocations(itemId: string): Promise<ItemLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM item_locations WHERE itemId = ?').all(itemId) as ItemLocation[];
}

export async function getAllItemLocations(): Promise<ItemLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM item_locations').all() as ItemLocation[];
}

export async function assignItemToLocation(itemId: string, locationId: number, clientId: string | null, updatedBy: string): Promise<ItemLocation> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const info = db.prepare('INSERT OR REPLACE INTO item_locations (itemId, locationId, clientId, updatedBy, updatedAt) VALUES (?, ?, ?, ?, datetime(\'now\'))').run(itemId, locationId, clientId, updatedBy);
    const newId = info.lastInsertRowid;
    const newItemLocation = db.prepare('SELECT * FROM item_locations WHERE id = ?').get(newId) as ItemLocation;
    return newItemLocation;
}

export async function unassignItemFromLocation(itemLocationId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM item_locations WHERE id = ?').run(itemLocationId);
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
            humanReadableId: unit.humanReadableId || null
        };
        const info = db.prepare(
            'INSERT INTO inventory_units (unitCode, productId, humanReadableId, locationId, notes, createdAt, createdBy) VALUES (@unitCode, @productId, @humanReadableId, @locationId, @notes, @createdAt, @createdBy)'
        ).run(newUnitData);
        
        const newId = info.lastInsertRowid as number;
        
        parsedSettings.nextUnitNumber = nextNumber + 1;
        db.prepare(`UPDATE warehouse_config SET value = ? WHERE key = 'settings'`).run(JSON.stringify(parsedSettings));

        return db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(newId) as InventoryUnit;
    });

    return transaction();
}


export async function getInventoryUnits(): Promise<InventoryUnit[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM inventory_units ORDER BY createdAt DESC LIMIT 100').all() as InventoryUnit[];
}

export async function getInventoryUnitById(id: string | number): Promise<InventoryUnit | null> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const searchTerm = String(id).toUpperCase();
    if (searchTerm.startsWith('U')) {
        return db.prepare('SELECT * FROM inventory_units WHERE UPPER(unitCode) = ?').get(searchTerm) as InventoryUnit | null;
    }
    return db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(id) as InventoryUnit | null;
}

export async function deleteInventoryUnit(id: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM inventory_units WHERE id = ?').run(id);
}

export async function updateInventoryUnitLocation(id: number, locationId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('UPDATE inventory_units SET locationId = ? WHERE id = ?').run(locationId, id);
}


// --- Wizard Lock Functions ---

export async function getActiveLocks(): Promise<WizardSession[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const now = new Date().toISOString();
    db.prepare('DELETE FROM active_wizard_sessions WHERE expiresAt < ?').run(now);
    const rows = db.prepare('SELECT * FROM active_wizard_sessions').all() as any[];
    return rows.map(row => ({
        ...row,
        lockedEntityIds: JSON.parse(row.lockedEntityIds)
    }));
}

export async function lockEntity(payload: Omit<WizardSession, 'id' | 'expiresAt' > & { entityIds: number[] }): Promise<{ sessionId: number, locked: boolean }> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { entityIds, lockedEntityName, userId, userName } = payload;
    
    const allLocks = await getActiveLocks(); // This already cleans up expired locks
    const requestedIds = new Set(entityIds);
    
    for (const lock of allLocks) {
        for (const lockedId of lock.lockedEntityIds) {
            if (requestedIds.has(lockedId)) {
                return { sessionId: lock.id, locked: true }; // Found an overlap
            }
        }
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    
    const info = db.prepare(
        'INSERT INTO active_wizard_sessions (userId, userName, lockedEntityIds, lockedEntityName, expiresAt) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, userName, JSON.stringify(entityIds), lockedEntityName, expiresAt);

    const sessionId = info.lastInsertRowid as number;
    return { sessionId, locked: false };
}

export async function releaseLock(sessionId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM active_wizard_sessions WHERE id = ?').run(sessionId);
}

export async function forceReleaseLock(sessionId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM active_wizard_sessions WHERE id = ?').run(sessionId);
}

export async function getChildLocations(parentIds: number[]): Promise<WarehouseLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    if (parentIds.length === 0) return [];
    const placeholders = parentIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM locations WHERE parentId IN (${placeholders})`).all(...parentIds) as WarehouseLocation[];
}
