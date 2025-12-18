/**
 * @fileoverview Server-side functions for the warehouse database.
 */
"use server";

import { connectDb, getAllStock as getAllStockFromMain, getStockSettings as getStockSettingsFromMain } from '@/modules/core/lib/db';
import type { WarehouseLocation, WarehouseInventoryItem, MovementLog, WarehouseSettings, StockSettings, StockInfo, ItemLocation, InventoryUnit, DateRange } from '@/modules/core/types';
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
            FOREIGN KEY (parentId) REFERENCES locations(id) ON DELETE SET NULL
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
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE SET NULL
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
            FOREIGN KEY (fromLocationId) REFERENCES locations(id) ON DELETE SET NULL,
            FOREIGN KEY (toLocationId) REFERENCES locations(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS warehouse_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
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
    const warehouseConfigTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='warehouse_config'`).get();
    if (!warehouseConfigTable) {
        return;
    }

    try {
        const settingsRow = db.prepare(`SELECT value FROM warehouse_config WHERE key = 'settings'`).get() as { value: string } | undefined;
        if (settingsRow) {
            const settings = JSON.parse(settingsRow.value);
            let settingsUpdated = false;

            if (settings.enablePhysicalInventoryTracking !== undefined) {
                delete settings.enablePhysicalInventoryTracking;
                settingsUpdated = true;
                console.log("MIGRATION (warehouse.db): Removed obsolete 'enablePhysicalInventoryTracking' setting.");
            }
            if (typeof settings.unitPrefix !== 'string') {
                settings.unitPrefix = 'U';
                settingsUpdated = true;
            }
            if (typeof settings.nextUnitNumber !== 'number') {
                settings.nextUnitNumber = 1;
                settingsUpdated = true;
            }
            if (settingsUpdated) {
                db.prepare(`UPDATE warehouse_config SET value = ? WHERE key = 'settings'`).run(JSON.stringify(settings));
                console.log("MIGRATION (warehouse.db): Cleaned up and added default unit settings.");
            }
        }
    } catch (error) {
        console.error("Error during warehouse settings migration:", error);
    }
    
    const itemLocationsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='item_locations'`).get();
    if (!itemLocationsTable) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS item_locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                itemId TEXT NOT NULL,
                locationId INTEGER NOT NULL,
                clientId TEXT,
                FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE,
                UNIQUE (itemId, locationId, clientId)
            );
        `);
    }

    const locationsTableInfo = db.prepare(`PRAGMA table_info(locations)`).all() as { name: string, type: string }[];
    const hasParentId = locationsTableInfo.some(c => c.name === 'parentId');

    if (!hasParentId) {
        db.exec(`ALTER TABLE locations ADD COLUMN parentId INTEGER REFERENCES locations(id) ON DELETE SET NULL;`);
    } else {
        const foreignKeyList = db.prepare(`PRAGMA foreign_key_list(locations)`).all() as any[];
        const parentFK = foreignKeyList.find(fk => fk.from === 'parentId');
        if (parentFK && parentFK.on_delete !== 'SET NULL') {
            db.transaction(() => {
                db.exec(`
                    CREATE TABLE locations_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
                        type TEXT NOT NULL, parentId INTEGER,
                        FOREIGN KEY (parentId) REFERENCES locations(id) ON DELETE SET NULL
                    );
                `);
                db.exec(`INSERT INTO locations_new(id, name, code, type, parentId) SELECT id, name, code, type, parentId FROM locations;`);
                db.exec(`DROP TABLE locations;`);
                db.exec(`ALTER TABLE locations_new RENAME TO locations;`);
            })();
             console.log("MIGRATION (warehouse.db): Recreated 'locations' table to update parentId's ON DELETE action.");
        }
    }
    
    // ** ROBUST MIGRATION FOR inventory_units **
    const inventoryUnitsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_units'`).get();
    if (!inventoryUnitsTable) {
        console.log("MIGRATION (warehouse.db): Creating 'inventory_units' table as it does not exist.");
        db.exec(`
            CREATE TABLE inventory_units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                unitCode TEXT UNIQUE,
                productId TEXT NOT NULL,
                humanReadableId TEXT,
                locationId INTEGER,
                notes TEXT,
                createdAt TEXT NOT NULL,
                createdBy TEXT NOT NULL,
                FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE SET NULL
            );
        `);
    } else {
        const unitsTableInfo = db.prepare(`PRAGMA table_info(inventory_units)`).all() as { name: string }[];
        if (!unitsTableInfo.some(c => c.name === 'unitCode')) {
            console.log("MIGRATION (warehouse.db): 'unitCode' column is missing. Performing robust migration.");
            try {
                db.transaction(() => {
                    // 1. Rename old table
                    db.exec('ALTER TABLE inventory_units RENAME TO inventory_units_old;');

                    // 2. Create new table with correct schema
                    db.exec(`
                        CREATE TABLE inventory_units (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            unitCode TEXT UNIQUE,
                            productId TEXT NOT NULL,
                            humanReadableId TEXT,
                            locationId INTEGER,
                            notes TEXT,
                            createdAt TEXT NOT NULL,
                            createdBy TEXT NOT NULL,
                            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE SET NULL
                        );
                    `);

                    // 3. Copy data and generate unit codes
                    const oldUnits = db.prepare('SELECT * FROM inventory_units_old').all();
                    const insertNew = db.prepare('INSERT INTO inventory_units (id, unitCode, productId, humanReadableId, locationId, notes, createdAt, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                    
                    const settingsRow = db.prepare(`SELECT value FROM warehouse_config WHERE key = 'settings'`).get() as { value: string };
                    const settings = JSON.parse(settingsRow.value);
                    let nextUnitNumber = settings.nextUnitNumber || 1;
                    const prefix = settings.unitPrefix || 'U';

                    for (const oldUnit of oldUnits) {
                        const unitCode = `${prefix}${String(nextUnitNumber).padStart(5, '0')}`;
                        insertNew.run(
                            (oldUnit as any).id,
                            unitCode,
                            (oldUnit as any).productId,
                            (oldUnit as any).humanReadableId,
                            (oldUnit as any).locationId,
                            (oldUnit as any).notes,
                            (oldUnit as any).createdAt,
                            (oldUnit as any).createdBy
                        );
                        nextUnitNumber++;
                    }

                    // Update the next unit number in settings
                    settings.nextUnitNumber = nextUnitNumber;
                    db.prepare('UPDATE warehouse_config SET value = ? WHERE key = \\'settings\\'').run(JSON.stringify(settings));

                    // 4. Drop old table
                    db.exec('DROP TABLE inventory_units_old;');
                })();
                console.log("MIGRATION (warehouse.db): Successfully migrated 'inventory_units' table.");
            } catch (error) {
                console.error("CRITICAL: Failed to migrate 'inventory_units' table. Rolling back.", error);
                // Attempt to restore if something went wrong
                if (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_units_old'`).get()) {
                    db.exec('DROP TABLE IF EXISTS inventory_units;');
                    db.exec('ALTER TABLE inventory_units_old RENAME TO inventory_units;');
                }
                throw error; // Re-throw to indicate failure
            }
        }
    }


    const movementsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='movements'`).get();
    if(movementsTable) {
        const fkList = db.prepare(`PRAGMA foreign_key_list(movements)`).all() as any[];
        const fromFK = fkList.find(fk => fk.from === 'fromLocationId');
        if (fromFK && fromFK.on_delete !== 'SET NULL') {
            console.log("MIGRATION (warehouse.db): Recreating 'movements' table to update ON DELETE actions.");
            db.transaction(() => {
                db.exec('ALTER TABLE movements RENAME TO movements_old;');
                db.exec(`
                    CREATE TABLE movements (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, itemId TEXT NOT NULL, quantity REAL NOT NULL,
                        fromLocationId INTEGER, toLocationId INTEGER, timestamp TEXT NOT NULL,
                        userId INTEGER NOT NULL, notes TEXT,
                        FOREIGN KEY (fromLocationId) REFERENCES locations(id) ON DELETE SET NULL,
                        FOREIGN KEY (toLocationId) REFERENCES locations(id) ON DELETE SET NULL
                    );
                `);
                db.exec('INSERT INTO movements SELECT * FROM movements_old;');
                db.exec('DROP TABLE movements_old;');
            })();
        }
    }

    const inventoryTableInfo = db.prepare(`PRAGMA table_info(inventory)`).all() as { name: string }[];
    if (!inventoryTableInfo.some(c => c.name === 'updatedBy')) {
        console.log("MIGRATION (warehouse.db): Adding 'updatedBy' to 'inventory' table.");
        db.exec('ALTER TABLE inventory ADD COLUMN updatedBy TEXT');
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
            // Ensure this obsolete property is removed if it exists from old versions
            if (settings.enablePhysicalInventoryTracking !== undefined) {
                delete settings.enablePhysicalInventoryTracking;
            }
            return { ...defaults, ...settings };
        }
    } catch (error) {
        console.error("Error fetching warehouse settings, returning default.", error);
    }
    return defaults;
}

export async function saveWarehouseSettings(settings: WarehouseSettings): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const settingsToSave = { ...settings };
    // @ts-ignore - Ensure this obsolete property is not saved.
    delete settingsToSave.enablePhysicalInventoryTracking;
    
    db.prepare(`
        INSERT OR REPLACE INTO warehouse_config (key, value) VALUES ('settings', ?)
    `).run(JSON.stringify(settingsToSave));
}

export async function getLocations(): Promise<WarehouseLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    // Order by parentId then name to facilitate tree building on the client
    return db.prepare('SELECT * FROM locations ORDER BY parentId, name').all() as WarehouseLocation[];
}

export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { name, code, type, parentId } = location;
    const info = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(name, code, type, parentId ?? null);
    const newLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(info.lastInsertRowid) as WarehouseLocation;
    return newLocation;
}

export async function addBulkLocations(payload: { type: 'rack' | 'clone', params: any }): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { type, params } = payload;
    const settings = await getWarehouseSettings();

    const transaction = db.transaction(() => {
        if (type === 'rack') {
            const { name, prefix, levels, positions, depth } = params;
            // Create the main rack location
            const rackType = settings.locationLevels.find(l => l.name.toLowerCase().includes('rack'))?.type || 'rack';
            const info = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, NULL)').run(name, prefix, rackType);
            const rackId = info.lastInsertRowid as number;

            // Generate children
            for (let i = 0; i < levels; i++) {
                const levelName = String.fromCharCode(65 + i); // A, B, C...
                const levelType = settings.locationLevels[3]?.type || 'shelf';
                const levelInfo = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(`Nivel ${levelName}`, `${prefix}-${levelName}`, levelType, rackId);
                const levelId = levelInfo.lastInsertRowid as number;

                for (let j = 1; j <= positions; j++) {
                    const posName = String(j).padStart(2, '0');
                    const posType = settings.locationLevels[4]?.type || 'bin';
                    const posCode = `${prefix}-${levelName}-${posName}`;
                    const posInfo = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(`Posición ${posName}`, posCode, posType, levelId);
                    const posId = posInfo.lastInsertRowid as number;

                    for (let k = 1; k <= depth; k++) {
                        const depthName = k === 1 ? 'Frente' : 'Fondo';
                        const depthCode = `${posCode}-${k === 1 ? 'F' : 'T'}`;
                         db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(depthName, depthCode, posType, posId);
                    }
                }
            }
        } else if (type === 'clone') {
            const { sourceRackId, newName, newPrefix } = params;
            const allLocations = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
            const sourceRack = allLocations.find(l => l.id === Number(sourceRackId));
            if (!sourceRack) throw new Error('Rack de origen no encontrado.');

            const mapping = new Map<number, number>();
            
            // 1. Create the new parent rack
            const newRackInfo = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(newName, newPrefix, sourceRack.type, sourceRack.parentId);
            const newRackId = newRackInfo.lastInsertRowid as number;
            mapping.set(sourceRack.id, newRackId);

            // 2. Recursively clone children
            function cloneChildren(oldParentId: number, newParentId: number) {
                const children = allLocations.filter(l => l.parentId === oldParentId);
                for (const child of children) {
                    const newCode = child.code.replace(sourceRack.code, newPrefix);
                    const newChildInfo = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(child.name, newCode, child.type, newParentId);
                    const newChildId = newChildInfo.lastInsertRowid as number;
                    mapping.set(child.id, newChildId);
                    cloneChildren(child.id, newChildId);
                }
            }

            cloneChildren(sourceRack.id, newRackId);
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

const getAllDescendantIds = (locationId: number, allLocations: WarehouseLocation[]): number[] => {
    let descendants: number[] = [];
    const children = allLocations.filter(loc => loc.parentId === locationId);
    for (const child of children) {
        descendants.push(child.id);
        descendants = descendants.concat(getAllDescendantIds(child.id, allLocations));
    }
    return descendants;
};


export async function deleteLocation(id: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);

    // --- Safety Check ---
    const allLocations = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
    const idsToCheck = [id, ...getAllDescendantIds(id, allLocations)];

    const placeholders = idsToCheck.map(() => '?').join(',');

    const itemLocationCheck = db.prepare(`SELECT 1 FROM item_locations WHERE locationId IN (${placeholders}) LIMIT 1`).get(...idsToCheck);
    if (itemLocationCheck) {
        throw new Error('No se puede eliminar la ubicación porque esta o una de sus sub-ubicaciones está en uso (asignación simple).');
    }

    const unitCheck = db.prepare(`SELECT 1 FROM inventory_units WHERE locationId IN (${placeholders}) LIMIT 1`).get(...idsToCheck);
    if (unitCheck) {
        throw new Error('No se puede eliminar la ubicación porque esta o una de sus sub-ubicaciones está en uso (unidades de inventario).');
    }

    // If checks pass, proceed with deletion
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
         DO UPDATE SET quantity = ?, updatedBy = ?`
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

export async function unassignItemFromLocation(itemLocationId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM item_locations WHERE id = ?').run(itemLocationId);
}

export async function addInventoryUnit(unit: Omit<InventoryUnit, 'id' | 'createdAt'>): Promise<InventoryUnit> {
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
            unitCode: unitCode
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
