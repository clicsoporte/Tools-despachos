/**
 * @fileoverview Server-side functions for the warehouse database.
 */
"use server";

import { connectDb, getAllStock as getAllStockFromMain, getStockSettings as getStockSettingsFromMain } from '@/modules/core/lib/db';
import type { WarehouseLocation, WarehouseInventoryItem, MovementLog, WarehouseSettings, StockSettings, StockInfo, ItemLocation, InventoryUnit } from '@/modules/core/types';
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
            FOREIGN KEY (fromLocationId) REFERENCES locations(id),
            FOREIGN KEY (toLocationId) REFERENCES locations(id)
        );

        CREATE TABLE IF NOT EXISTS warehouse_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `;
    db.exec(schema);

    // Insert default settings
    const defaultSettings: WarehouseSettings = {
        locationLevels: [
            { type: 'building', name: 'Edificio' },
            { type: 'zone', name: 'Zona' },
            { type: 'rack', name: 'Rack' },
            { type: 'shelf', name: 'Estante' },
            { type: 'bin', name: 'Casilla' }
        ],
        enablePhysicalInventoryTracking: false,
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
        // Table doesn't exist, probably a fresh DB, let initialization handle it
        return;
    }

    // Migration to add enablePhysicalInventoryTracking
    try {
        const settingsRow = db.prepare(`SELECT value FROM warehouse_config WHERE key = 'settings'`).get() as { value: string } | undefined;
        if (settingsRow) {
            const settings = JSON.parse(settingsRow.value);
            if (typeof settings.enablePhysicalInventoryTracking !== 'boolean') {
                console.log("MIGRATION (warehouse.db): Adding enablePhysicalInventoryTracking to settings.");
                settings.enablePhysicalInventoryTracking = false;
                db.prepare(`UPDATE warehouse_config SET value = ? WHERE key = 'settings'`).run(JSON.stringify(settings));
            }
        }
    } catch (error) {
        console.error("Error during warehouse settings migration:", error);
    }
    
    const itemLocationsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='item_locations'`).get();
    if (!itemLocationsTable) {
        console.log("MIGRATION (warehouse.db): Creating item_locations table.");
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

    // Migration to handle parentId on DELETE
    const locationsTableInfo = db.prepare(`PRAGMA table_info(locations)`).all() as { name: string, type: string }[];
    if (!locationsTableInfo.find(c => c.name === 'parentId')) {
        db.exec(`ALTER TABLE locations ADD COLUMN parentId INTEGER REFERENCES locations(id) ON DELETE SET NULL;`);
    } else {
        // Recreate table to add ON DELETE SET NULL if not present. This is a bit risky but necessary for SQLite.
        const foreignKeyList = db.prepare(`PRAGMA foreign_key_list(locations)`).all() as any[];
        const parentFK = foreignKeyList.find(fk => fk.from === 'parentId');
        if (parentFK && parentFK.on_delete !== 'SET NULL') {
            console.log("MIGRATION (warehouse.db): Recreating 'locations' table to update parentId's ON DELETE action.");
            db.transaction(() => {
                db.exec(`
                    CREATE TABLE locations_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        code TEXT UNIQUE NOT NULL,
                        type TEXT NOT NULL,
                        parentId INTEGER,
                        FOREIGN KEY (parentId) REFERENCES locations(id) ON DELETE SET NULL
                    );
                `);
                db.exec(`INSERT INTO locations_new SELECT id, name, code, type, parentId FROM locations;`);
                db.exec(`DROP TABLE locations;`);
                db.exec(`ALTER TABLE locations_new RENAME TO locations;`);
            })();
        }
    }

    const inventoryUnitsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_units'`).get();
    if (!inventoryUnitsTable) {
        console.log("MIGRATION (warehouse.db): Creating inventory_units table.");
        db.exec(`
            CREATE TABLE IF NOT EXISTS inventory_units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                productId TEXT NOT NULL,
                humanReadableId TEXT,
                locationId INTEGER,
                notes TEXT,
                createdAt TEXT NOT NULL,
                createdBy TEXT NOT NULL,
                FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE SET NULL
            );
        `);
    }
}

export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    try {
        const row = db.prepare(`SELECT value FROM warehouse_config WHERE key = 'settings'`).get() as { value: string } | undefined;
        if (row) {
            const settings = JSON.parse(row.value);
            // Ensure enablePhysicalInventoryTracking exists, default to false if not.
            if (typeof settings.enablePhysicalInventoryTracking !== 'boolean') {
                settings.enablePhysicalInventoryTracking = false;
            }
            return settings;
        }
    } catch (error) {
        console.error("Error fetching warehouse settings, returning default.", error);
    }
    // Return a default object if nothing is found or an error occurs
    return {
        locationLevels: [
            { type: 'building', name: 'Edificio' },
            { type: 'zone', name: 'Zona' },
            { type: 'rack', name: 'Rack' },
            { type: 'shelf', name: 'Estante' },
            { type: 'bin', name: 'Casilla' }
        ],
        enablePhysicalInventoryTracking: false
    };
}

export async function saveWarehouseSettings(settings: WarehouseSettings): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare(`
        INSERT OR REPLACE INTO warehouse_config (key, value) VALUES ('settings', ?)
    `).run(JSON.stringify(settings));
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

export async function updateLocation(location: WarehouseLocation): Promise<WarehouseLocation> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { id, name, code, type, parentId } = location;
    db.prepare('UPDATE locations SET name = ?, code = ?, type = ?, parentId = ? WHERE id = ?').run(name, code, type, parentId ?? null, id);
    const updatedLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as WarehouseLocation;
    return updatedLocation;
}

export async function deleteLocation(id: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    // ON DELETE SET NULL on parentId will handle re-parenting children to the root.
    // ON DELETE CASCADE on other tables will handle inventory/item_locations.
    db.prepare('DELETE FROM locations WHERE id = ?').run(id);
}


export async function getInventoryForItem(itemId: string): Promise<WarehouseInventoryItem[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM inventory WHERE itemId = ?').all(itemId) as WarehouseInventoryItem[];
}

export async function updateInventory(itemId: string, locationId: number, quantityChange: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
     db.prepare(
        `INSERT INTO inventory (itemId, locationId, quantity, lastUpdated) 
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(itemId, locationId) 
         DO UPDATE SET quantity = quantity + ?`
    ).run(itemId, locationId, quantityChange, quantityChange);
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

    // Sanitize data to ensure they are plain objects for serialization
    return JSON.parse(JSON.stringify({
        locations,
        inventory,
        stock: stock || [], // Ensure stock is an array even if null
        itemLocations,
        warehouseSettings: warehouseSettings || { locationLevels: [], enablePhysicalInventoryTracking: false },
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

// --- Simple Mode Functions ---
export async function getItemLocations(itemId: string): Promise<ItemLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM item_locations WHERE itemId = ?').all(itemId) as ItemLocation[];
}

export async function assignItemToLocation(itemId: string, locationId: number, clientId?: string | null): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('INSERT OR IGNORE INTO item_locations (itemId, locationId, clientId) VALUES (?, ?, ?)').run(itemId, locationId, clientId);
}

export async function unassignItemFromLocation(itemLocationId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM item_locations WHERE id = ?').run(itemLocationId);
}

// --- Inventory Unit Functions ---
export async function addInventoryUnit(unit: Omit<InventoryUnit, 'id' | 'createdAt'>): Promise<InventoryUnit> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const newUnit = {
        ...unit,
        createdAt: new Date().toISOString(),
    };
    const info = db.prepare(
        'INSERT INTO inventory_units (productId, humanReadableId, locationId, notes, createdAt, createdBy) VALUES (@productId, @humanReadableId, @locationId, @notes, @createdAt, @createdBy)'
    ).run(newUnit);
    return db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(info.lastInsertRowid) as InventoryUnit;
}

export async function getInventoryUnits(): Promise<InventoryUnit[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM inventory_units ORDER BY createdAt DESC LIMIT 100').all() as InventoryUnit[];
}

export async function getInventoryUnitById(id: number): Promise<InventoryUnit | null> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
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
