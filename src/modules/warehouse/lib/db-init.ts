/**
 * @fileoverview This file contains the warehouse database initialization and migration logic.
 * It's separated from the main db.ts to avoid circular dependencies with core modules.
 */
'use server';

import type { WarehouseSettings, CustomStatus } from '@/modules/core/types';
import { triggerNotificationEvent } from '@/modules/notifications/lib/notifications-engine';
import { renderLocationPathAsString } from './utils';
import { logInfo, logError } from '@/modules/core/lib/logger';

export async function initializeWarehouseDb(db: import('better-sqlite3').Database) {
    const schema = `
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            parentId INTEGER,
            isLocked BOOLEAN DEFAULT FALSE,
            lockedBy TEXT,
            lockedByUserId INTEGER,
            lockedAt TEXT,
            isFullyPopulated BOOLEAN DEFAULT FALSE
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL,
            locationId INTEGER NOT NULL,
            quantity REAL NOT NULL,
            lastUpdated TEXT NOT NULL,
            updatedBy TEXT NOT NULL,
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE,
            UNIQUE(itemId, locationId)
        );

        CREATE TABLE IF NOT EXISTS item_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL,
            locationId INTEGER NOT NULL,
            clientId TEXT,
            updatedBy TEXT,
            updatedAt TEXT,
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS inventory_units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unitCode TEXT UNIQUE,
            productId TEXT NOT NULL,
            humanReadableId TEXT,
            documentId TEXT,
            locationId INTEGER,
            quantity REAL NOT NULL DEFAULT 1,
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
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS warehouse_config (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS dispatch_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            documentId TEXT NOT NULL,
            documentType TEXT NOT NULL,
            verifiedAt TEXT NOT NULL,
            verifiedByUserId INTEGER NOT NULL,
            verifiedByUserName TEXT NOT NULL,
            items TEXT NOT NULL,
            notes TEXT,
            vehiclePlate TEXT,
            driverName TEXT,
            helper1Name TEXT,
            helper2Name TEXT
        );

        CREATE TABLE IF NOT EXISTS dispatch_containers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            createdBy TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            isLocked BOOLEAN DEFAULT FALSE,
            lockedBy TEXT,
            lockedByUserId INTEGER,
            lockedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS dispatch_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            containerId INTEGER NOT NULL,
            documentId TEXT NOT NULL,
            documentType TEXT NOT NULL,
            documentDate TEXT NOT NULL,
            clientId TEXT NOT NULL,
            clientName TEXT NOT NULL,
            assignedBy TEXT NOT NULL,
            assignedAt TEXT NOT NULL,
            sortOrder INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY (containerId) REFERENCES dispatch_containers(id) ON DELETE CASCADE
        );
    `;
    db.exec(schema);

    const defaultSettings: WarehouseSettings = {
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

    db.prepare(`INSERT OR IGNORE INTO warehouse_config (key, value) VALUES ('settings', ?)`).run(JSON.stringify(defaultSettings));

    console.log(`Database warehouse.db initialized for Warehouse Management.`);
    
    // Run migrations right after initializing
    await runWarehouseMigrations(db);
}


export async function runWarehouseMigrations(db: import('better-sqlite3').Database) {
    try {
        const locationsTableInfo = db.prepare(`PRAGMA table_info(locations)`).all() as { name: string }[];
        const locationColumns = new Set(locationsTableInfo.map(c => c.name));

        if (!locationColumns.has('isLocked')) db.exec(`ALTER TABLE locations ADD COLUMN isLocked BOOLEAN DEFAULT FALSE`);
        if (!locationColumns.has('lockedBy')) db.exec(`ALTER TABLE locations ADD COLUMN lockedBy TEXT`);
        if (!locationColumns.has('lockedByUserId')) db.exec(`ALTER TABLE locations ADD COLUMN lockedByUserId INTEGER`);
        if (!locationColumns.has('lockedAt')) db.exec(`ALTER TABLE locations ADD COLUMN lockedAt TEXT`);
        if (!locationColumns.has('isFullyPopulated')) db.exec(`ALTER TABLE locations ADD COLUMN isFullyPopulated BOOLEAN DEFAULT FALSE`);

        const inventoryTableInfo = db.prepare(`PRAGMA table_info(inventory)`).all() as { name: string }[];
        const inventoryColumns = new Set(inventoryTableInfo.map(c => c.name));
        if (!inventoryColumns.has('updatedBy')) db.exec(`ALTER TABLE inventory ADD COLUMN updatedBy TEXT`);
        
        const itemLocationsTableInfo = db.prepare(`PRAGMA table_info(item_locations)`).all() as { name: string }[];
        const itemLocationColumns = new Set(itemLocationsTableInfo.map(c => c.name));
        if (!itemLocationColumns.has('updatedBy')) db.exec(`ALTER TABLE item_locations ADD COLUMN updatedBy TEXT`);
        if (!itemLocationColumns.has('updatedAt')) db.exec(`ALTER TABLE item_locations ADD COLUMN updatedAt TEXT`);

        if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='dispatch_logs'`).get()) {
            db.exec(`CREATE TABLE dispatch_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                documentId TEXT NOT NULL,
                documentType TEXT NOT NULL,
                verifiedAt TEXT NOT NULL,
                verifiedByUserId INTEGER NOT NULL,
                verifiedByUserName TEXT NOT NULL,
                items TEXT NOT NULL,
                notes TEXT,
                vehiclePlate TEXT,
                driverName TEXT
            );`);
        } else {
            const dispatchLogsTableInfo = db.prepare(`PRAGMA table_info(dispatch_logs)`).all() as { name: string }[];
            const dispatchLogsColumns = new Set(dispatchLogsTableInfo.map(c => c.name));
            if (!dispatchLogsColumns.has('vehiclePlate')) db.exec(`ALTER TABLE dispatch_logs ADD COLUMN vehiclePlate TEXT`);
            if (!dispatchLogsColumns.has('driverName')) db.exec(`ALTER TABLE dispatch_logs ADD COLUMN driverName TEXT`);
            if (!dispatchLogsColumns.has('helper1Name')) db.exec(`ALTER TABLE dispatch_logs ADD COLUMN helper1Name TEXT`);
            if (!dispatchLogsColumns.has('helper2Name')) db.exec(`ALTER TABLE dispatch_logs ADD COLUMN helper2Name TEXT`);
        }

        if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='dispatch_containers'`).get()) {
            db.exec(`CREATE TABLE dispatch_containers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                createdBy TEXT NOT NULL,
                createdAt TEXT NOT NULL,
                isLocked BOOLEAN DEFAULT FALSE,
                lockedBy TEXT,
                lockedByUserId INTEGER,
                lockedAt TEXT
            );`);
        } else {
             const containerTableInfo = db.prepare(`PRAGMA table_info(dispatch_containers)`).all() as { name: string }[];
             const containerColumns = new Set(containerTableInfo.map(c => c.name));
             if (!containerColumns.has('isLocked')) db.exec(`ALTER TABLE dispatch_containers ADD COLUMN isLocked BOOLEAN DEFAULT FALSE`);
             if (!containerColumns.has('lockedBy')) db.exec(`ALTER TABLE dispatch_containers ADD COLUMN lockedBy TEXT`);
             if (!containerColumns.has('lockedByUserId')) db.exec(`ALTER TABLE dispatch_containers ADD COLUMN lockedByUserId INTEGER`);
             if (!containerColumns.has('lockedAt')) db.exec(`ALTER TABLE dispatch_containers ADD COLUMN lockedAt TEXT`);
        }

        if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='dispatch_assignments'`).get()) {
            db.exec(`CREATE TABLE dispatch_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                containerId INTEGER NOT NULL,
                documentId TEXT NOT NULL,
                documentType TEXT NOT NULL,
                documentDate TEXT NOT NULL,
                clientId TEXT NOT NULL,
                clientName TEXT NOT NULL,
                assignedBy TEXT NOT NULL,
                assignedAt TEXT NOT NULL,
                sortOrder INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                FOREIGN KEY (containerId) REFERENCES dispatch_containers(id) ON DELETE CASCADE
            );`);
        }

    } catch (error) {
        console.error("Error during warehouse DB migrations:", error);
    }
}
