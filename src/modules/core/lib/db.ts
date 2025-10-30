/**
 * @fileoverview This file handles the SQLite database connection and provides
 * server-side functions for all database operations. It includes initialization,
 * schema creation, data access, and a centralized migration system for all application modules.
 */
"use server";

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initialCompany, initialRoles } from './data';
import type { Company, LogEntry, ApiSettings, User, Product, Customer, Role, QuoteDraft, DatabaseModule, Exemption, ExemptionLaw, StockInfo, StockSettings, ImportQuery, SqlConfig, ItemLocation, UpdateBackupInfo, Suggestion, DateRange, Supplier, ErpOrderHeader, ErpOrderLine, Notification, UserPreferences, AuditResult, ErpPurchaseOrderHeader, ErpPurchaseOrderLine } from '@/modules/core/types';
import bcrypt from 'bcryptjs';
import Papa from 'papaparse';
import { executeQuery } from './sql-service';
import { logInfo, logWarn, logError } from './logger';
import { initializePlannerDb, runPlannerMigrations, confirmModification as confirmPlannerModification } from '../../planner/lib/db';
import { initializeRequestsDb, runRequestMigrations } from '../../requests/lib/db';
import { initializeWarehouseDb, runWarehouseMigrations } from '../../warehouse/lib/db';
import { initializeCostAssistantDb, runCostAssistantMigrations } from '../../cost-assistant/lib/db';
import { costAssistantSchema } from '../../cost-assistant/lib/schema';
import { plannerSchema } from '../../planner/lib/schema';
import { requestSchema } from '../../requests/lib/schema';
import { warehouseSchema } from '../../warehouse/lib/schema';


const DB_FILE = 'intratool.db';
const SALT_ROUNDS = 10;
const CABYS_FILE_PATH = path.join(process.cwd(), 'docs', 'Datos', 'cabys.csv');
const UPDATE_BACKUP_DIR = 'update_backups';
const VERSION_FILE_PATH = path.join(process.cwd(), 'docs', 'VERSION.txt');

/**
 * Initializes the main database with all core system tables.
 * This function is called automatically when the main DB file is first created.
 * @param {Database.Database} db - The database instance to initialize.
 */
async function initializeMainDatabase(db: import('better-sqlite3').Database) {
    const schema = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT,
            whatsapp TEXT,
            erpAlias TEXT,
            avatar TEXT,
            role TEXT,
            recentActivity TEXT,
            securityQuestion TEXT,
            securityAnswer TEXT,
            forcePasswordChange BOOLEAN DEFAULT FALSE
        );
        CREATE TABLE IF NOT EXISTS roles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            permissions TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS company_settings (
            id INTEGER PRIMARY KEY,
            name TEXT, taxId TEXT, address TEXT, phone TEXT, email TEXT, logoUrl TEXT,
            systemName TEXT, quotePrefix TEXT, nextQuoteNumber INTEGER, decimalPlaces INTEGER, quoterShowTaxId BOOLEAN,
            searchDebounceTime INTEGER, syncWarningHours REAL, lastSyncTimestamp TEXT,
            importMode TEXT, customerFilePath TEXT, productFilePath TEXT, exemptionFilePath TEXT, stockFilePath TEXT, locationFilePath TEXT, cabysFilePath TEXT, supplierFilePath TEXT
        );
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            details TEXT
        );
        CREATE TABLE IF NOT EXISTS api_settings (id INTEGER PRIMARY KEY, exchangeRateApi TEXT, haciendaExemptionApi TEXT, haciendaTributariaApi TEXT);
        CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT, address TEXT, phone TEXT, taxId TEXT, currency TEXT, creditLimit REAL, paymentCondition TEXT, salesperson TEXT, active TEXT, email TEXT, electronicDocEmail TEXT);
        CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, description TEXT, classification TEXT, lastEntry TEXT, active TEXT, notes TEXT, unit TEXT, isBasicGood TEXT, cabys TEXT);
        CREATE TABLE IF NOT EXISTS exemptions (code TEXT PRIMARY KEY, description TEXT, customer TEXT, authNumber TEXT, startDate TEXT, endDate TEXT, percentage REAL, docType TEXT, institutionName TEXT, institutionCode TEXT);
        CREATE TABLE IF NOT EXISTS quote_drafts (id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, userId INTEGER, customerId TEXT, customerDetails TEXT, lines TEXT, totals TEXT, notes TEXT, currency TEXT, exchangeRate REAL, purchaseOrderNumber TEXT, deliveryAddress TEXT, deliveryDate TEXT, sellerName TEXT, sellerType TEXT, quoteDate TEXT, validUntilDate TEXT, paymentTerms TEXT, creditDays INTEGER);
        CREATE TABLE IF NOT EXISTS exemption_laws (docType TEXT PRIMARY KEY, institutionName TEXT, authNumber TEXT);
        CREATE TABLE IF NOT EXISTS cabys_catalog (code TEXT PRIMARY KEY, description TEXT, taxRate REAL);
        CREATE TABLE IF NOT EXISTS stock (itemId TEXT PRIMARY KEY, stockByWarehouse TEXT, totalStock REAL);
        CREATE TABLE IF NOT EXISTS sql_config (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS import_queries (type TEXT PRIMARY KEY, query TEXT);
        CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, userId INTEGER, userName TEXT, isRead INTEGER DEFAULT 0, timestamp TEXT);
        CREATE TABLE IF NOT EXISTS user_preferences (userId INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (userId, key));
        CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, message TEXT NOT NULL, href TEXT, isRead INTEGER DEFAULT 0, timestamp TEXT NOT NULL, entityId INTEGER, entityType TEXT, taskType TEXT, FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS email_settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, name TEXT, alias TEXT, email TEXT, phone TEXT);
        CREATE TABLE IF NOT EXISTS erp_order_headers (PEDIDO TEXT PRIMARY KEY, ESTADO TEXT, CLIENTE TEXT, FECHA_PEDIDO TEXT, FECHA_PROMETIDA TEXT, ORDEN_COMPRA TEXT, TOTAL_UNIDADES REAL, MONEDA_PEDIDO TEXT, USUARIO TEXT);
        CREATE TABLE IF NOT EXISTS erp_order_lines (PEDIDO TEXT, PEDIDO_LINEA INTEGER, ARTICULO TEXT, CANTIDAD_PEDIDA REAL, PRECIO_UNITARIO REAL, PRIMARY KEY (PEDIDO, PEDIDO_LINEA));
        CREATE TABLE IF NOT EXISTS erp_purchase_order_headers (ORDEN_COMPRA TEXT PRIMARY KEY, PROVEEDOR TEXT, FECHA_HORA TEXT, ESTADO TEXT);
        CREATE TABLE IF NOT EXISTS erp_purchase_order_lines (ORDEN_COMPRA TEXT, ARTICULO TEXT, CANTIDAD_ORDENADA REAL, PRIMARY KEY(ORDEN_COMPRA, ARTICULO));
    `;
    db.exec(schema);

    // Insert default data
    const insertRole = db.prepare('INSERT OR IGNORE INTO roles (id, name, permissions) VALUES (@id, @name, @permissions)');
    const insertRolesTransaction = db.transaction((roles) => { for (const role of roles) insertRole.run({ ...role, permissions: JSON.stringify(role.permissions) }); });
    insertRolesTransaction(initialRoles);
    
    const insertCompany = db.prepare('INSERT OR IGNORE INTO company_settings (id, name, taxId, address, phone, email, systemName, quotePrefix, nextQuoteNumber, decimalPlaces, quoterShowTaxId, searchDebounceTime, syncWarningHours, importMode) VALUES (1, @name, @taxId, @address, @phone, @email, @systemName, @quotePrefix, @nextQuoteNumber, @decimalPlaces, @quoterShowTaxId, @searchDebounceTime, @syncWarningHours, @importMode)');
    insertCompany.run({ ...initialCompany, quoterShowTaxId: initialCompany.quoterShowTaxId ? 1 : 0 });
    
    db.prepare(`INSERT OR IGNORE INTO api_settings (id, exchangeRateApi, haciendaExemptionApi, haciendaTributariaApi) VALUES (1, 'https://api.hacienda.go.cr/indicadores/tc/dolar', 'https://api.hacienda.go.cr/fe/ex?autorizacion=', 'https://api.hacienda.go.cr/fe/ae?identificacion=')`).run();
    console.log(`Database ${DB_FILE} initialized.`);
}

/**
 * Acts as a registry for all database modules in the application.
 * This structure allows the core `connectDb` function to be completely agnostic
 * of any specific module, promoting true modularity and decoupling.
 */
const DB_MODULES: DatabaseModule[] = [
    { 
        id: 'clic-tools-main', 
        name: 'Clic-Tools (Sistema Principal)', 
        dbFile: DB_FILE, 
        initFn: initializeMainDatabase, 
        migrationFn: checkAndApplyMigrations,
        schema: {
            'users': ['id', 'name', 'email', 'password', 'phone', 'whatsapp', 'erpAlias', 'avatar', 'role', 'recentActivity', 'securityQuestion', 'securityAnswer', 'forcePasswordChange'],
            'roles': ['id', 'name', 'permissions'],
            'company_settings': ['id', 'name', 'taxId', 'address', 'phone', 'email', 'logoUrl', 'systemName', 'quotePrefix', 'nextQuoteNumber', 'decimalPlaces', 'quoterShowTaxId', 'searchDebounceTime', 'syncWarningHours', 'lastSyncTimestamp', 'importMode', 'customerFilePath', 'productFilePath', 'exemptionFilePath', 'stockFilePath', 'locationFilePath', 'cabysFilePath', 'supplierFilePath'],
            'logs': ['id', 'timestamp', 'type', 'message', 'details'],
            'api_settings': ['id', 'exchangeRateApi', 'haciendaExemptionApi', 'haciendaTributariaApi'],
            'customers': ['id', 'name', 'address', 'phone', 'taxId', 'currency', 'creditLimit', 'paymentCondition', 'salesperson', 'active', 'email', 'electronicDocEmail'],
            'products': ['id', 'description', 'classification', 'lastEntry', 'active', 'notes', 'unit', 'isBasicGood', 'cabys'],
            'exemptions': ['code', 'description', 'customer', 'authNumber', 'startDate', 'endDate', 'percentage', 'docType', 'institutionName', 'institutionCode'],
            'quote_drafts': ['id', 'createdAt', 'userId', 'customerId', 'customerDetails', 'lines', 'totals', 'notes', 'currency', 'exchangeRate', 'purchaseOrderNumber', 'deliveryAddress', 'deliveryDate', 'sellerName', 'sellerType', 'quoteDate', 'validUntilDate', 'paymentTerms', 'creditDays'],
            'exemption_laws': ['docType', 'institutionName', 'authNumber'],
            'cabys_catalog': ['code', 'description', 'taxRate'],
            'stock': ['itemId', 'stockByWarehouse', 'totalStock'],
            'sql_config': ['key', 'value'],
            'import_queries': ['type', 'query'],
            'suggestions': ['id', 'content', 'userId', 'userName', 'isRead', 'timestamp'],
            'user_preferences': ['userId', 'key', 'value'],
            'notifications': ['id', 'userId', 'message', 'href', 'isRead', 'timestamp', 'entityId', 'entityType', 'taskType'],
            'email_settings': ['key', 'value'],
            'suppliers': ['id', 'name', 'alias', 'email', 'phone'],
            'erp_order_headers': ['PEDIDO', 'ESTADO', 'CLIENTE', 'FECHA_PEDIDO', 'FECHA_PROMETIDA', 'ORDEN_COMPRA', 'TOTAL_UNIDADES', 'MONEDA_PEDIDO', 'USUARIO'],
            'erp_order_lines': ['PEDIDO', 'PEDIDO_LINEA', 'ARTICULO', 'CANTIDAD_PEDIDA', 'PRECIO_UNITARIO'],
            'erp_purchase_order_headers': ['ORDEN_COMPRA', 'PROVEEDOR', 'FECHA_HORA', 'ESTADO'],
            'erp_purchase_order_lines': ['ORDEN_COMPRA', 'ARTICULO', 'CANTIDAD_ORDENADA'],
        }
    },
    { id: 'purchase-requests', name: 'Solicitud de Compra', dbFile: 'requests.db', initFn: initializeRequestsDb, migrationFn: runRequestMigrations, schema: requestSchema },
    { id: 'production-planner', name: 'Planificador de Producción', dbFile: 'planner.db', initFn: initializePlannerDb, migrationFn: runPlannerMigrations, schema: plannerSchema },
    { id: 'warehouse-management', name: 'Gestión de Almacenes', dbFile: 'warehouse.db', initFn: initializeWarehouseDb, migrationFn: runWarehouseMigrations, schema: warehouseSchema },
    { id: 'cost-assistant', name: 'Asistente de Costos', dbFile: 'cost_assistant.db', initFn: initializeCostAssistantDb, migrationFn: runCostAssistantMigrations, schema: costAssistantSchema },
];


// This path is configured to work correctly within the Next.js build output directory,
// which is crucial for serverless environments.
const dbDirectory = path.join(process.cwd(), 'dbs');

const dbConnections = new Map<string, Database.Database>();

/**
 * Establishes a connection to a specific SQLite database file.
 * If the database file does not exist, it creates it and initializes the schema and default data.
 * It manages multiple connections in a map to support a multi-database architecture.
 * @param {string} dbFile - The filename of the database to connect to.
 * @param {boolean} [forceRecreate=false] - If true, deletes the existing DB file to start fresh.
 * @returns {Database.Database} The database connection instance.
 */
export async function connectDb(dbFile: string = DB_FILE, forceRecreate = false): Promise<Database.Database> {
    if (!forceRecreate && dbConnections.has(dbFile) && dbConnections.get(dbFile)!.open) {
        return dbConnections.get(dbFile)!;
    }
    
    if (dbConnections.has(dbFile)) {
        const connection = dbConnections.get(dbFile);
        if (connection && connection.open) {
            connection.close();
        }
        dbConnections.delete(dbFile);
    }
    
    const dbPath = path.join(dbDirectory, dbFile);
    if (!fs.existsSync(dbDirectory)) {
        fs.mkdirSync(dbDirectory, { recursive: true });
    }

    if (forceRecreate && fs.existsSync(dbPath)) {
        console.log(`Forced recreation: Deleting database file ${dbFile}.`);
        fs.unlinkSync(dbPath);
    }

    let dbExists = fs.existsSync(dbPath);
    let db: Database.Database;

    try {
        db = new Database(dbPath);
    } catch (error: any) {
        if (error.code === 'SQLITE_CORRUPT') {
            console.error(`Database file ${dbFile} is corrupt. Renaming and creating a new one.`);
            const backupPath = `${dbPath}.corrupt.${Date.now()}`;
            fs.renameSync(dbPath, backupPath);
            await logError(`Database ${dbFile} was corrupt. A new one has been created. Corrupt file backed up to ${backupPath}.`);
            db = new Database(dbPath); // Create a new one
            dbExists = false; // Treat as a new DB
        } else {
            throw error;
        }
    }

    const dbModule = DB_MODULES.find(m => m.dbFile === dbFile);

    if (!dbExists) {
        console.log(`Database ${dbFile} not found, creating and initializing...`);
        if (dbModule?.initFn) {
            await dbModule.initFn(db);
        }
    }
    
    // Always run migrations on every connection attempt for robustness
    if (dbModule?.migrationFn) {
        try {
            await dbModule.migrationFn(db);
        } catch (error) {
            console.error(`Migration failed for ${dbFile}, but continuing. Error:`, error);
        }
    }


    try {
        db.pragma('journal_mode = WAL');
    } catch(error: any) {
        // This is a common error with a corrupt DB, log it but don't crash
        console.error(`Could not set PRAGMA on ${dbFile}. DB might be corrupt.`, error);
        if (error.code !== 'SQLITE_CORRUPT') {
            await logError(`Failed to set PRAGMA on ${dbFile}`, { error: (error as Error).message });
        }
    }
    
    dbConnections.set(dbFile, db);
    return db;
}


/**
 * Checks the database schema and applies necessary alterations (migrations).
 * This makes the app more resilient to schema changes over time without data loss.
 * @param {Database.Database} db - The database instance to check.
 */
export async function checkAndApplyMigrations(db: import('better-sqlite3').Database) {
    // Main DB Migrations
    try {
        const usersTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get();
        if(!usersTable) {
             console.log("Migration check skipped: Main database not initialized yet.");
             return;
        }

        const notificationsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'`).get();
        if (!notificationsTable) {
            console.log("MIGRATION: Creating notifications table.");
            db.exec(`
                CREATE TABLE notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    userId INTEGER NOT NULL,
                    message TEXT NOT NULL,
                    href TEXT,
                    isRead INTEGER DEFAULT 0,
                    timestamp TEXT NOT NULL,
                    entityId INTEGER,
                    entityType TEXT,
                    taskType TEXT,
                    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
                );
            `);
        } else {
             const notificationsTableInfo = db.prepare(`PRAGMA table_info(notifications)`).all() as { name: string }[];
            const notificationsColumns = new Set(notificationsTableInfo.map(c => c.name));
            
            if (!notificationsColumns.has('entityId')) db.exec('ALTER TABLE notifications ADD COLUMN entityId INTEGER');
            if (!notificationsColumns.has('entityType')) db.exec('ALTER TABLE notifications ADD COLUMN entityType TEXT');
            if (!notificationsColumns.has('taskType')) db.exec('ALTER TABLE notifications ADD COLUMN taskType TEXT');
        }
        
        const userPrefsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'`).get();
        if (!userPrefsTable) {
            console.log("MIGRATION: Creating user_preferences table.");
            db.exec(`CREATE TABLE user_preferences (userId INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (userId, key));`);
        }
        
        const emailTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='email_settings'`).get();
        if (!emailTable) {
            console.log("MIGRATION: Creating email_settings table.");
            db.exec(`CREATE TABLE email_settings (key TEXT PRIMARY KEY, value TEXT);`);
        }

        const usersTableInfo = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
        const userColumns = new Set(usersTableInfo.map(c => c.name));

        if (!userColumns.has('erpAlias')) {
            console.log("MIGRATION: Adding erpAlias to users table.");
            db.exec(`ALTER TABLE users ADD COLUMN erpAlias TEXT`);
        }
        
        if (!userColumns.has('forcePasswordChange')) {
            console.log("MIGRATION: Adding forcePasswordChange to users table.");
            db.exec(`ALTER TABLE users ADD COLUMN forcePasswordChange BOOLEAN DEFAULT FALSE`);
        }

        const companyTableInfo = db.prepare(`PRAGMA table_info(company_settings)`).all() as { name: string }[];
        const companyColumns = new Set(companyTableInfo.map(c => c.name));
        
        if (!companyColumns.has('decimalPlaces')) db.exec(`ALTER TABLE company_settings ADD COLUMN decimalPlaces INTEGER DEFAULT 2`);
        if (!companyColumns.has('quoterShowTaxId')) db.exec(`ALTER TABLE company_settings ADD COLUMN quoterShowTaxId BOOLEAN DEFAULT TRUE`);
        if (!companyColumns.has('syncWarningHours')) db.exec(`ALTER TABLE company_settings ADD COLUMN syncWarningHours REAL DEFAULT 12`);
        
        if (companyColumns.has('importPath')) {
            console.log("MIGRATION: Dropping importPath column from company_settings.");
            db.exec(`ALTER TABLE company_settings DROP COLUMN importPath`);
        }
        
        if (!companyColumns.has('customerFilePath')) db.exec(`ALTER TABLE company_settings ADD COLUMN customerFilePath TEXT`);
        if (!companyColumns.has('productFilePath')) db.exec(`ALTER TABLE company_settings ADD COLUMN productFilePath TEXT`);
        if (!companyColumns.has('exemptionFilePath')) db.exec(`ALTER TABLE company_settings ADD COLUMN exemptionFilePath TEXT`);
        if (!companyColumns.has('stockFilePath')) db.exec(`ALTER TABLE company_settings ADD COLUMN stockFilePath TEXT`);
        if (!companyColumns.has('locationFilePath')) db.exec(`ALTER TABLE company_settings ADD COLUMN locationFilePath TEXT`);
        if (!companyColumns.has('cabysFilePath')) db.exec(`ALTER TABLE company_settings ADD COLUMN cabysFilePath TEXT`);
        if (!companyColumns.has('supplierFilePath')) db.exec(`ALTER TABLE company_settings ADD COLUMN supplierFilePath TEXT`);
        if (!companyColumns.has('importMode')) db.exec(`ALTER TABLE company_settings ADD COLUMN importMode TEXT DEFAULT 'file'`);
        if (!companyColumns.has('logoUrl')) db.exec(`ALTER TABLE company_settings ADD COLUMN logoUrl TEXT`);
        if (!companyColumns.has('searchDebounceTime')) db.exec(`ALTER TABLE company_settings ADD COLUMN searchDebounceTime INTEGER DEFAULT 500`);
        if (!companyColumns.has('lastSyncTimestamp')) db.exec(`ALTER TABLE company_settings ADD COLUMN lastSyncTimestamp TEXT`);


        const adminUser = db.prepare('SELECT role FROM users WHERE id = 1').get() as { role: string } | undefined;
        if (adminUser && adminUser.role !== 'admin') {
            console.log("MIGRATION: Ensuring user with ID 1 is an admin.");
            db.prepare(`UPDATE users SET role = 'admin' WHERE id = 1`).run();
        }

        const draftsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='quote_drafts'`).get();
        if (draftsTable) {
            const draftsTableInfo = db.prepare(`PRAGMA table_info(quote_drafts)`).all() as { name: string }[];
            const draftColumns = new Set(draftsTableInfo.map(c => c.name));
            if (!draftColumns.has('userId')) db.exec(`ALTER TABLE quote_drafts ADD COLUMN userId INTEGER;`);
             if (!draftColumns.has('customerId')) {
                db.exec(`ALTER TABLE quote_drafts ADD COLUMN customerId TEXT;`);
            }
            if (!draftColumns.has('lines')) db.exec(`ALTER TABLE quote_drafts ADD COLUMN lines TEXT;`);
            if (!draftColumns.has('totals')) db.exec(`ALTER TABLE quote_drafts ADD COLUMN totals TEXT;`);
            if (!draftColumns.has('notes')) db.exec(`ALTER TABLE quote_drafts ADD COLUMN notes TEXT;`);
            if (!draftColumns.has('currency')) db.exec(`ALTER TABLE quote_drafts ADD COLUMN currency TEXT;`);
            if (!draftColumns.has('exchangeRate')) db.exec(`ALTER TABLE quote_drafts ADD COLUMN exchangeRate REAL;`);
            if (!draftColumns.has('purchaseOrderNumber')) db.exec(`ALTER TABLE quote_drafts ADD COLUMN purchaseOrderNumber TEXT;`);
        }

        const usersToUpdate = db.prepare('SELECT id, password FROM users').all() as User[];
        const updateUserPassword = db.prepare('UPDATE users SET password = ? WHERE id = ?');
        let updatedCount = 0;
        for (const user of usersToUpdate) {
            if (user.password && !user.password.startsWith('$2a$')) {
                const hashedPassword = bcrypt.hashSync(user.password, SALT_ROUNDS);
                updateUserPassword.run(hashedPassword, user.id);
                updatedCount++;
            }
        }
        if (updatedCount > 0) {
            console.log(`MIGRATION: Successfully hashed ${updatedCount} plaintext password(s).`);
        }
        
        const apiTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='api_settings'`).get();
        if (apiTable) {
            const apiTableInfo = db.prepare(`PRAGMA table_info(api_settings)`).all() as { name: string }[];
            if (!apiTableInfo.some(col => col.name === 'haciendaExemptionApi')) db.exec(`ALTER TABLE api_settings ADD COLUMN haciendaExemptionApi TEXT`);
            if (!apiTableInfo.some(col => col.name === 'haciendaTributariaApi')) db.exec(`ALTER TABLE api_settings ADD COLUMN haciendaTributariaApi TEXT`);
        }
        
        const suppliersTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='suppliers'`).get();
        if (!suppliersTable) {
            console.log("MIGRATION: Creating suppliers table.");
            db.exec(`CREATE TABLE suppliers (id TEXT PRIMARY KEY, name TEXT, alias TEXT, email TEXT, phone TEXT);`);
        }

        const erpHeadersTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='erp_order_headers'`).get();
        if (!erpHeadersTable) {
            console.log("MIGRATION: Creating erp_order_headers table.");
            db.exec(`CREATE TABLE erp_order_headers (PEDIDO TEXT PRIMARY KEY, ESTADO TEXT, CLIENTE TEXT, FECHA_PEDIDO TEXT, FECHA_PROMETIDA TEXT, ORDEN_COMPRA TEXT);`);
        } else {
            const erpHeadersInfo = db.prepare(`PRAGMA table_info(erp_order_headers)`).all() as { name: string }[];
            const erpHeadersColumns = new Set(erpHeadersInfo.map(c => c.name));
             if (!erpHeadersColumns.has('MONEDA_PEDIDO')) db.exec(`ALTER TABLE erp_order_headers ADD COLUMN MONEDA_PEDIDO TEXT`);
             if (!erpHeadersColumns.has('TOTAL_UNIDADES')) db.exec(`ALTER TABLE erp_order_headers ADD COLUMN TOTAL_UNIDADES REAL`);
             if (!erpHeadersColumns.has('USUARIO')) db.exec(`ALTER TABLE erp_order_headers ADD COLUMN USUARIO TEXT`);
        }

        const erpLinesTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='erp_order_lines'`).get();
        if (!erpLinesTable) {
            console.log("MIGRATION: Creating erp_order_lines table.");
            db.exec(`CREATE TABLE erp_order_lines (PEDIDO TEXT, PEDIDO_LINEA INTEGER, ARTICULO TEXT, CANTIDAD_PEDIDA REAL, PRECIO_UNITARIO REAL, PRIMARY KEY (PEDIDO, PEDIDO_LINEA));`);
        }
        
        if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='erp_purchase_order_headers'`).get()) {
            console.log("MIGRATION: Creating erp_purchase_order_headers table.");
            db.exec(`CREATE TABLE erp_purchase_order_headers (ORDEN_COMPRA TEXT PRIMARY KEY, PROVEEDOR TEXT, FECHA_HORA TEXT, ESTADO TEXT);`);
        }

        if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='erp_purchase_order_lines'`).get()) {
            console.log("MIGRATION: Creating erp_purchase_order_lines table.");
            db.exec(`CREATE TABLE erp_purchase_order_lines (ORDEN_COMPRA TEXT, ARTICULO TEXT, CANTIDAD_ORDENADA REAL, PRIMARY KEY(ORDEN_COMPRA, ARTICULO));`);
        } else {
             const erpPOLinesInfo = db.prepare(`PRAGMA table_info(erp_purchase_order_lines)`).all() as { name: string }[];
             const erpPOLinesColumns = new Set(erpPOLinesInfo.map(c => c.name));
             if (!erpPOLinesColumns.has('ORDEN_COMPRA')) {
                 // This indicates a legacy structure, so we need to recreate it.
                 console.log("MIGRATION: Recreating erp_purchase_order_lines table with composite primary key.");
                 db.exec(`DROP TABLE erp_purchase_order_lines;`);
                 db.exec(`CREATE TABLE erp_purchase_order_lines (ORDEN_COMPRA TEXT, ARTICULO TEXT, CANTIDAD_ORDENADA REAL, PRIMARY KEY (ORDEN_COMPRA, ARTICULO));`);
             }
        }

    } catch (error) {
        console.error("Failed to apply migrations:", error);
    }
}

export async function getUserCount(): Promise<number> {
    try {
        const db = await connectDb();
        const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
        return row.count;
    } catch(e) {
        console.error("Error getting user count, likely DB doesn't exist yet.", e);
        return 0;
    }
}


export async function getCompanySettings(): Promise<Company | null> {
    const db = await connectDb();
    try {
        const settings = db.prepare('SELECT * FROM company_settings WHERE id = 1').get() as any;
        if (settings && 'quoterShowTaxId' in settings) {
            // Manually handle boolean conversion from integer
            settings.quoterShowTaxId = Boolean(settings.quoterShowTaxId);
        }
        return settings as Company | null;
    } catch (error) {
        console.error("Failed to get company settings:", error);
        return null;
    }
}

export async function saveCompanySettings(settings: Company): Promise<void> {
    const db = await connectDb();
    try {
        const settingsToSave = { ...settings, quoterShowTaxId: settings.quoterShowTaxId ? 1 : 0 };
        db.prepare(`
            UPDATE company_settings SET 
                name = @name, taxId = @taxId, address = @address, phone = @phone, email = @email,
                logoUrl = @logoUrl, systemName = @systemName, quotePrefix = @quotePrefix, nextQuoteNumber = @nextQuoteNumber, 
                decimalPlaces = @decimalPlaces, searchDebounceTime = @searchDebounceTime,
                customerFilePath = @customerFilePath, productFilePath = @productFilePath, exemptionFilePath = @exemptionFilePath,
                stockFilePath = @stockFilePath, locationFilePath = @locationFilePath, cabysFilePath = @cabysFilePath,
                supplierFilePath = @supplierFilePath,
                importMode = @importMode, lastSyncTimestamp = @lastSyncTimestamp, quoterShowTaxId = @quoterShowTaxId, syncWarningHours = @syncWarningHours
            WHERE id = 1
        `).run(settingsToSave);
    } catch (error) {
        console.error("Failed to save company settings:", error);
    }
}

export async function getLogs(filters: {type?: 'operational' | 'system' | 'all'; search?: string; dateRange?: DateRange;} = {}): Promise<LogEntry[]> {
    const db = await connectDb();
    try {
        let query = 'SELECT * FROM logs';
        const whereClauses: string[] = [];
        const params: any[] = [];
        
        if (filters.type && filters.type !== 'all') {
            if (filters.type === 'operational') {
                whereClauses.push("type = 'INFO'");
            } else if (filters.type === 'system') {
                whereClauses.push("type IN ('WARN', 'ERROR')");
            }
        }
        if (filters.search) {
            whereClauses.push("(message LIKE ? OR details LIKE ?)");
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }
        if (filters.dateRange?.from) {
             whereClauses.push("timestamp >= ?");
             params.push(filters.dateRange.from.toISOString());
        }
        if (filters.dateRange?.to) {
            const toDate = new Date(filters.dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            whereClauses.push("timestamp <= ?");
            params.push(toDate.toISOString());
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        
        query += ' ORDER BY timestamp DESC LIMIT 500';

        const logs = db.prepare(query).all(...params) as LogEntry[];
        return logs.map(log => ({...log, details: log.details ? JSON.parse(log.details) : null}));
    } catch (error) {
        console.error("Failed to get logs from database", error);
        return [];
    }
};

export async function addLog(entry: Omit<LogEntry, "id" | "timestamp">) {
    try {
        const db = await connectDb();
        const newEntry = {
            ...entry,
            timestamp: new Date().toISOString(),
            details: entry.details ? JSON.stringify(entry.details) : null,
        };
        db.prepare('INSERT INTO logs (timestamp, type, message, details) VALUES (@timestamp, @type, @message, @details)').run(newEntry);
    } catch (error) {
        // If logging fails, log to console as a last resort.
        console.error("FATAL: Failed to add log to database", error);
        console.error("Original Log Message:", entry.message);
    }
};

export async function clearLogs(clearedBy: string, type: 'operational' | 'system' | 'all', deleteAllTime: boolean) {
    const db = await connectDb();
    try {
        const auditLog: Omit<LogEntry, "id" | "timestamp"> = { 
            type: 'WARN',
            message: `Limpieza de registros iniciada por ${clearedBy}`, 
            details: { type, deleteAllTime } 
        };

        let query = 'DELETE FROM logs';
        const whereClauses: string[] = [];
        const params: any[] = [];
        
        if (!deleteAllTime) {
            const date = new Date();
            date.setDate(date.getDate() - 30);
            whereClauses.push("timestamp < ?");
            params.push(date.toISOString());
        }
        
        if (type !== 'all') {
            if (type === 'operational') {
                whereClauses.push("type = 'INFO'");
            } else if (type === 'system') {
                whereClauses.push("type IN ('WARN', 'ERROR')");
            }
        }
        
        if(whereClauses.length > 0){
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        db.prepare(query).run(...params);
        await addLog(auditLog); // Add the audit log AFTER the delete operation.

    } catch (error) {
        console.error("Failed to clear logs from database", error);
        // If deletion fails, try to log the failure.
        await addLog({ type: 'ERROR', message: `Fallo al limpiar registros por ${clearedBy}`, details: { error: (error as Error).message } });
    }
};

export async function getApiSettings(): Promise<ApiSettings | null> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM api_settings WHERE id = 1').get() as ApiSettings | null;
    } catch (error) {
        console.error("Failed to get api settings:", error);
        return null;
    }
}

export async function saveApiSettings(settings: ApiSettings): Promise<void> {
    const db = await connectDb();
    try {
        db.prepare(`UPDATE api_settings SET exchangeRateApi = @exchangeRateApi, haciendaExemptionApi = @haciendaExemptionApi, haciendaTributariaApi = @haciendaTributariaApi WHERE id = 1`).run(settings);
    } catch (error) {
        console.error("Failed to save api settings:", error);
    }
}

export async function getExemptionLaws(): Promise<ExemptionLaw[]> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM exemption_laws').all() as ExemptionLaw[];
    } catch (error) {
        console.error("Failed to get exemption laws:", error);
        return [];
    }
}

export async function saveExemptionLaws(laws: ExemptionLaw[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT OR REPLACE INTO exemption_laws (docType, institutionName, authNumber) VALUES (@docType, @institutionName, @authNumber)');
    const transaction = db.transaction((lawsToSave) => {
        db.prepare('DELETE FROM exemption_laws').run();
        for(const law of lawsToSave) {
            insert.run({ ...law, authNumber: law.authNumber || null });
        }
    });
    try {
        transaction(laws);
    } catch (error) {
        console.error("Failed to save exemption laws:", error);
        throw new Error("Database transaction failed to save exemption laws.");
    }
}

export async function getAllCustomers(): Promise<Customer[]> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM customers').all() as Customer[];
    } catch (error) {
        console.error("Failed to get all customers:", error);
        return [];
    }
}

export async function saveAllCustomers(customers: Customer[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT INTO customers (id, name, address, phone, taxId, currency, creditLimit, paymentCondition, salesperson, active, email, electronicDocEmail) VALUES (@id, @name, @address, @phone, @taxId, @currency, @creditLimit, @paymentCondition, @salesperson, @active, @email, @electronicDocEmail)');
    const transaction = db.transaction((customersToSave) => {
        db.prepare('DELETE FROM customers').run();
        for(const customer of customersToSave) insert.run(customer);
    });
    try {
        transaction(customers);
    } catch (error) {
        console.error("Failed to save all customers:", error);
    }
}

export async function getAllProducts(): Promise<Product[]> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM products').all() as Product[];
    } catch (error) {
        console.error("Failed to get all products:", error);
        return [];
    }
}

export async function saveAllProducts(products: Product[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT INTO products (id, description, classification, lastEntry, active, notes, unit, isBasicGood, cabys) VALUES (@id, @description, @classification, @lastEntry, @active, @notes, @unit, @isBasicGood, @cabys)');
    
    const transaction = db.transaction((productsToSave) => {
        db.prepare('DELETE FROM products').run();
        for(let product of productsToSave) {
            // Ensure date objects are converted to strings before binding
            const productToSave = {
                ...product,
                lastEntry: product.lastEntry instanceof Date ? product.lastEntry.toISOString() : product.lastEntry,
            };
            insert.run(productToSave);
        }
    });

    try {
        transaction(products);
    } catch (error) {
        console.error("Failed to save all products:", error);
        throw error;
    }
}


export async function getAllSuppliers(): Promise<Supplier[]> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM suppliers').all() as Supplier[];
    } catch (error) {
        console.error("Failed to get all suppliers:", error);
        return [];
    }
}

export async function saveAllSuppliers(suppliers: Supplier[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT INTO suppliers (id, name, alias, email, phone) VALUES (@id, @name, @alias, @email, @phone)');
    const transaction = db.transaction((suppliersToSave) => {
        db.prepare('DELETE FROM suppliers').run();
        for(const supplier of suppliersToSave) insert.run(supplier);
    });
    try {
        transaction(suppliers);
    } catch (error) {
        console.error("Failed to save all suppliers:", error);
        throw error;
    }
}


export async function getAllExemptions(): Promise<Exemption[]> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM exemptions').all() as Exemption[];
    } catch (error) {
        console.error("Failed to get all exemptions:", error);
        return [];
    }
}

export async function saveAllExemptions(exemptions: Exemption[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT OR REPLACE INTO exemptions (code, description, customer, authNumber, startDate, endDate, percentage, docType, institutionName, institutionCode) VALUES (@code, @description, @customer, @authNumber, @startDate, @endDate, @percentage, @docType, @institutionName, @institutionCode)');
    
    const transaction = db.transaction((exemptionsToSave) => {
        db.prepare('DELETE FROM exemptions').run();
        for(let exemption of exemptionsToSave) {
             const exemptionToSave = {
                ...exemption,
                startDate: exemption.startDate instanceof Date ? exemption.startDate.toISOString() : exemption.startDate,
                endDate: exemption.endDate instanceof Date ? exemption.endDate.toISOString() : exemption.endDate,
             };
            insert.run(exemptionToSave);
        }
    });

    try {
        transaction(exemptions);
    } catch (error) {
        console.error("Failed to save all exemptions:", error);
        throw error;
    }
}


export async function getAllRoles(): Promise<Role[]> {
    const db = await connectDb();
    try {
        const roles = db.prepare('SELECT * FROM roles').all() as any[];
        return roles.map(role => ({ ...role, permissions: JSON.parse(role.permissions) }));
    } catch (error) {
        console.error("Failed to get all roles:", error);
        return [];
    }
}

export async function saveAllRoles(roles: Role[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT INTO roles (id, name, permissions) VALUES (@id, @name, @permissions)');
    const transaction = db.transaction((rolesToSave) => {
        db.prepare('DELETE FROM roles').run();
        for(const role of rolesToSave) {
            insert.run({ ...role, permissions: JSON.stringify(role.permissions) });
        }
    });
    try {
        transaction(roles);
    } catch (error) {
        console.error("Failed to save all roles:", error);
    }
}

export async function resetDefaultRoles(): Promise<void> {
    const db = await connectDb();
    const insertOrReplace = db.prepare('INSERT OR REPLACE INTO roles (id, name, permissions) VALUES (@id, @name, @permissions)');
    const transaction = db.transaction(() => {
        for (const role of initialRoles) {
            insertOrReplace.run({ ...role, permissions: JSON.stringify(role.permissions) });
        }
    });
    try {
        transaction();
    } catch(error) {
        console.error("Failed to reset default roles:", error);
    }
}

export async function getAllQuoteDrafts(userId: number): Promise<QuoteDraft[]> {
    const db = await connectDb();
    try {
        const drafts = db.prepare('SELECT * FROM quote_drafts WHERE userId = ? ORDER BY createdAt DESC').all(userId) as any[];
        return drafts.map(draft => ({
            ...draft,
            lines: draft.lines ? JSON.parse(draft.lines) : [],
            totals: draft.totals ? JSON.parse(draft.totals) : {},
        }));
    } catch (error) {
        console.error("Failed to get all quote drafts:", error);
        return [];
    }
}

export async function saveQuoteDraft(draft: QuoteDraft): Promise<void> {
    const db = await connectDb();
    const stmt = db.prepare('INSERT OR REPLACE INTO quote_drafts (id, createdAt, userId, customerId, customerDetails, lines, totals, notes, currency, exchangeRate, purchaseOrderNumber, deliveryAddress, deliveryDate, sellerName, sellerType, quoteDate, validUntilDate, paymentTerms, creditDays) VALUES (@id, @createdAt, @userId, @customerId, @customerDetails, @lines, @totals, @notes, @currency, @exchangeRate, @purchaseOrderNumber, @deliveryAddress, @deliveryDate, @sellerName, @sellerType, @quoteDate, @validUntilDate, @paymentTerms, @creditDays)');
    try {
        stmt.run({
            ...draft,
            lines: JSON.stringify(draft.lines),
            totals: JSON.stringify(draft.totals),
        });
    } catch (error) {
        console.error("Failed to save quote draft:", error);
    }
}

export async function deleteQuoteDraft(draftId: string): Promise<void> {
    const db = await connectDb();
    try {
        db.prepare('DELETE FROM quote_drafts WHERE id = ?').run(draftId);
    } catch (error) {
        console.error("Failed to delete quote draft:", error);
    }
}

export async function getDbModules(): Promise<Omit<DatabaseModule, 'initFn' | 'migrationFn'>[]> {
    return DB_MODULES.map(({ initFn, migrationFn, ...rest }) => rest);
}

const createHeaderMapping = (type: ImportQuery['type']) => {
    switch (type) {
        case 'customers': return {'CLIENTE': 'id', 'NOMBRE': 'name', 'DIRECCION': 'address', 'TELEFONO1': 'phone', 'CONTRIBUYENTE': 'taxId', 'MONEDA': 'currency', 'LIMITE_CREDITO': 'creditLimit', 'CONDICION_PAGO': 'paymentCondition', 'VENDEDOR': 'salesperson', 'ACTIVO': 'active', 'E_MAIL': 'email', 'EMAIL_DOC_ELECTRONICO': 'electronicDocEmail'};
        case 'products': return {'ARTICULO': 'id', 'DESCRIPCION': 'description', 'CLASIFICACION_2': 'classification', 'ULTIMO_INGRESO': 'lastEntry', 'ACTIVO': 'active', 'NOTAS': 'notes', 'UNIDAD_VENTA': 'unit', 'CANASTA_BASICA': 'isBasicGood', 'CODIGO_HACIENDA': 'cabys'};
        case 'exemptions': return {'CODIGO': 'code', 'DESCRIPCION': 'description', 'CLIENTE': 'customer', 'NUM_AUTOR': 'authNumber', 'FECHA_RIGE': 'startDate', 'FECHA_VENCE': 'endDate', 'PORCENTAJE': 'percentage', 'TIPO_DOC': 'docType', 'NOMBRE_INSTITUCION': 'institutionName', 'CODIGO_INSTITUCION': 'institutionCode'};
        case 'stock': return {'ARTICULO': 'itemId', 'BODEGA': 'warehouseId', 'CANT_DISPONIBLE': 'stock'};
        case 'locations': return {'CODIGO': 'itemId', 'P. HORIZONTAL': 'hPos', 'P. VERTICAL': 'vPos', 'RACK': 'rack', 'CLIENTE': 'client', 'DESCRIPCION': 'description'};
        case 'cabys': return {'Codigo': 'code', 'Descripcion': 'description', 'Impuesto': 'taxRate'};
        case 'suppliers': return {'PROVEEDOR': 'id', 'NOMBRE': 'name', 'ALIAS': 'alias', 'E_MAIL': 'email', 'TELEFONO1': 'phone'};
        case 'erp_order_headers': return {'PEDIDO': 'PEDIDO', 'ESTADO': 'ESTADO', 'CLIENTE': 'CLIENTE', 'FECHA_PEDIDO': 'FECHA_PEDIDO', 'FECHA_PROMETIDA': 'FECHA_PROMETIDA', 'ORDEN_COMPRA': 'ORDEN_COMPRA', 'TOTAL_UNIDADES': 'TOTAL_UNIDADES', 'MONEDA_PEDIDO': 'MONEDA_PEDIDO', 'USUARIO': 'USUARIO'};
        case 'erp_order_lines': return {'PEDIDO': 'PEDIDO', 'PEDIDO_LINEA': 'PEDIDO_LINEA', 'ARTICULO': 'ARTICULO', 'CANTIDAD_PEDIDA': 'CANTIDAD_PEDIDA', 'PRECIO_UNITARIO': 'PRECIO_UNITARIO'};
        case 'erp_purchase_order_headers': return { 'ORDEN_COMPRA': 'ORDEN_COMPRA', 'PROVEEDOR': 'PROVEEDOR', 'FECHA_HORA': 'FECHA_HORA', 'ESTADO': 'ESTADO' };
        case 'erp_purchase_order_lines': return { 'ORDEN_COMPRA': 'ORDEN_COMPRA', 'ARTICULO': 'ARTICULO', 'CANTIDAD_ORDENADA': 'CANTIDAD_ORDENADA' };
        default: return {};
    }
}

const parseData = (lines: string[], type: ImportQuery['type']) => {
    if (lines.length < 2) throw new Error("El archivo está vacío o no contiene datos.");
    const headerMapping = createHeaderMapping(type);
    const header = lines[0].split('\t').map(h => h.trim().toUpperCase());
    const dataArray: any[] = [];
    for (let i = 1; i < lines.length; i++) {
        const data = lines[i].split('\t');
        const dataObject: { [key: string]: any } = {};
        header.forEach((h, index) => {
            const key = headerMapping[h as keyof typeof headerMapping];
            if (key) {
                const value = data[index]?.replace(/[\n\r]/g, '').trim() || '';
                if (['creditLimit', 'percentage', 'stock', 'rack', 'hPos', 'taxRate', 'CANTIDAD_PEDIDA', 'PRECIO_UNITARIO', 'TOTAL_UNIDADES', 'CANTIDAD_ORDENADA'].includes(key)) {
                    dataObject[key] = parseFloat(value.replace('%','')) || 0;
                    if(key === 'taxRate') dataObject[key] /= 100;
                } else dataObject[key] = value;
            }
        });
        if (Object.keys(dataObject).length > 0) dataArray.push(dataObject);
    }
    return dataArray;
};

async function updateCabysCatalog(data: any[]): Promise<{ count: number }> {
    const db = await connectDb();
    const transaction = db.transaction((rows) => {
        db.prepare('DELETE FROM cabys_catalog').run();
        const insertStmt = db.prepare('INSERT INTO cabys_catalog (code, description, taxRate) VALUES (?, ?, ?)');
        for (const row of rows) {
            const taxRate = row.taxRate ?? (row.Impuesto !== undefined ? parseFloat(String(row.Impuesto).replace('%', '')) / 100 : undefined);
            if (row.code && row.description && taxRate !== undefined && !isNaN(taxRate)) {
                insertStmt.run(row.code, row.description, taxRate);
            }
        }
    });
    transaction(data);
    return { count: data.length };
}

export async function importDataFromFile(type: 'customers' | 'products' | 'exemptions' | 'stock' | 'locations' | 'cabys' | 'suppliers' | 'erp_purchase_order_headers' | 'erp_purchase_order_lines'): Promise<{ count: number, source: string }> {
    const companySettings = await getCompanySettings();
    if (!companySettings) throw new Error("No se pudo cargar la configuración de la empresa.");
    
    let filePath = '';
    switch(type) {
        case 'customers': filePath = companySettings.customerFilePath || ''; break;
        case 'products': filePath = companySettings.productFilePath || ''; break;
        case 'exemptions': filePath = companySettings.exemptionFilePath || ''; break;
        case 'stock': filePath = companySettings.stockFilePath || ''; break;
        case 'locations': filePath = companySettings.locationFilePath || ''; break;
        case 'cabys': filePath = companySettings.cabysFilePath || ''; break;
        case 'suppliers': filePath = companySettings.supplierFilePath || ''; break;
        case 'erp_purchase_order_headers': filePath = companySettings.erpPurchaseOrderHeaderFilePath || ''; break;
        case 'erp_purchase_order_lines': filePath = companySettings.erpPurchaseOrderLineFilePath || ''; break;
    }
    if (!filePath) throw new Error(`La ruta de importación para ${type} no está configurada.`);
    if (!fs.existsSync(filePath)) throw new Error(`El archivo no fue encontrado: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const isCsv = filePath.toLowerCase().endsWith('.csv');
    if (type === 'cabys' && isCsv) {
        const results = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
        });
        const mappedData = results.data.map((row: any) => ({
            code: row.Codigo,
            description: row.Descripcion,
            taxRate: parseFloat(row.Impuesto) / 100
        }));
        const { count } = await updateCabysCatalog(mappedData);
        return { count, source: filePath };
    }
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
    const dataArray = parseData(lines, type);
    if (type === 'customers') await saveAllCustomers(dataArray as Customer[]);
    else if (type === 'products') await saveAllProducts(dataArray as Product[]);
    else if (type === 'exemptions') await saveAllExemptions(dataArray as Exemption[]);
    else if (type === 'stock') {
        await saveAllStock(dataArray as { itemId: string, warehouseId: string, stock: number }[]);
        return { count: new Set(dataArray.map(item => item.itemId)).size, source: filePath };
    }
    else if (type === 'suppliers') await saveAllSuppliers(dataArray as Supplier[]);
    else if (type === 'erp_purchase_order_headers') await saveAllErpPurchaseOrderHeaders(dataArray as ErpPurchaseOrderHeader[]);
    else if (type === 'erp_purchase_order_lines') await saveAllErpPurchaseOrderLines(dataArray as ErpPurchaseOrderLine[]);
    
    return { count: dataArray.length, source: filePath };
}

async function importDataFromSql(type: ImportQuery['type']): Promise<{ count: number, source: string }> {
    const db = await connectDb();
    const queryRow = db.prepare('SELECT query FROM import_queries WHERE type = ?').get(type) as { query: string } | undefined;
    if (!queryRow || !queryRow.query) {
        throw new Error(`No hay una consulta SQL configurada para ${type}.`);
    }
    
    await logInfo(`Importando ${type} desde SQL...`, { query: queryRow.query });
    
    const dataArray = await executeQuery(queryRow.query);
    const headerMapping = createHeaderMapping(type);
    const mappedData = dataArray.map(row => {
        const newRow: { [key: string]: any } = {};
        for (const key in row) {
            const newKey = headerMapping[key.toUpperCase() as keyof typeof headerMapping] || key;
            newRow[newKey] = row[key];
        }
        return newRow;
    });
    if (type === 'customers') await saveAllCustomers(mappedData as Customer[]);
    else if (type === 'products') await saveAllProducts(mappedData as Product[]);
    else if (type === 'exemptions') await saveAllExemptions(mappedData as Exemption[]);
    else if (type === 'stock') {
        await saveAllStock(mappedData as { itemId: string, warehouseId: string, stock: number }[]);
        return { count: new Set(mappedData.map(item => item.itemId)).size, source: 'SQL Server' };
    } else if (type === 'cabys') {
        const { count } = await updateCabysCatalog(mappedData);
        return { count, source: 'SQL Server' };
    } else if (type === 'suppliers') {
        await saveAllSuppliers(mappedData as Supplier[]);
    } else if (type === 'erp_order_headers') {
        await saveAllErpOrderHeaders(mappedData as ErpOrderHeader[]);
    } else if (type === 'erp_order_lines') {
        await saveAllErpOrderLines(mappedData as ErpOrderLine[]);
    } else if (type === 'erp_purchase_order_headers') {
        await saveAllErpPurchaseOrderHeaders(mappedData as ErpPurchaseOrderHeader[]);
    } else if (type === 'erp_purchase_order_lines') {
        await saveAllErpPurchaseOrderLines(mappedData as ErpPurchaseOrderLine[]);
    }
    return { count: mappedData.length, source: 'SQL Server' };
}

export async function importData(type: ImportQuery['type']): Promise<{ count: number, source: string }> {
    const companySettings = await getCompanySettings();
    if (!companySettings) throw new Error("No se pudo cargar la configuración de la empresa.");
    
    if (companySettings.importMode === 'sql') {
        return importDataFromSql(type);
    } else {
        if (['erp_order_headers', 'erp_order_lines', 'erp_purchase_order_headers', 'erp_purchase_order_lines'].includes(type)) {
            return { count: 0, source: 'file (skipped)' };
        }
        return importDataFromFile(type as 'customers' | 'products' | 'exemptions' | 'stock' | 'locations' | 'cabys' | 'suppliers' );
    }
}

export async function importAllDataFromFiles(): Promise<{ type: string; count: number; }[]> {
    const db = await connectDb();
    const companySettings = await getCompanySettings();
    if (!companySettings) throw new Error("No se pudo cargar la configuración de la empresa.");
    
    const importTasks: { type: ImportQuery['type'] }[] = [
        { type: 'customers' }, { type: 'products' }, { type: 'exemptions' },
        { type: 'stock' }, { type: 'locations' }, { type: 'cabys' }, { type: 'suppliers' },
        { type: 'erp_order_headers' }, { type: 'erp_order_lines' },
        { type: 'erp_purchase_order_headers' }, { type: 'erp_purchase_order_lines' },
    ];
    
    const results: { type: string; count: number; }[] = [];
    
    for (const task of importTasks) {
        try {
            if (companySettings.importMode === 'file') {
                const filePathKey = `${task.type}FilePath` as keyof Company;
                const filePath = companySettings[filePathKey] as string | undefined;

                if (!filePath && !['erp_order_headers', 'erp_order_lines', 'erp_purchase_order_headers', 'erp_purchase_order_lines'].includes(task.type)) {
                    console.log(`Skipping file import for ${task.type}: no file path configured.`);
                    continue;
                }
            }
            const result = await importData(task.type);
            results.push({ type: task.type, count: result.count });
        } catch (error: any) {
             const queryRow = companySettings.importMode === 'sql' 
                ? db.prepare('SELECT query FROM import_queries WHERE type = ?').get(task.type) as { query: string } | undefined
                : undefined;
                
            await logError(`Error al importar datos para '${task.type}'`, {
                errorMessage: error.message,
                importMode: companySettings.importMode,
                query: queryRow?.query
            });
        }
    }

    db.prepare('UPDATE company_settings SET lastSyncTimestamp = ? WHERE id = 1')
      .run(new Date().toISOString());
    
    return results;
}

export async function saveSqlConfig(config: SqlConfig): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT OR REPLACE INTO sql_config (key, value) VALUES (@key, @value)');
    const transaction = db.transaction((cfg: any) => {
        for(const key in cfg) if (cfg[key as keyof SqlConfig] !== undefined) insert.run({ key, value: cfg[key as keyof SqlConfig] });
    });
    try {
        transaction(config);
    } catch (error) {
        console.error("Failed to save SQL config:", error);
    }
}

export async function getImportQueries(): Promise<ImportQuery[]> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM import_queries').all() as ImportQuery[];
    } catch (error) {
        console.error("Failed to get import queries:", error);
        return [];
    }
}

export async function saveImportQueries(queries: ImportQuery[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT OR REPLACE INTO import_queries (type, query) VALUES (@type, @query)');
    const transaction = db.transaction((qs) => { for (const q of qs) insert.run(q); });
    try {
        transaction(queries);
    } catch (error) {
        console.error("Failed to save import queries:", error);
    }
}

export async function testSqlConnection(): Promise<void> {
    await executeQuery("SELECT 1"); 
}

export async function getCabysCatalog(): Promise<{ code: string; description: string; taxRate: number; }[]> {
    const db = await connectDb();
    return db.prepare('SELECT * FROM cabys_catalog').all() as { code: string; description: string; taxRate: number; }[];
}

export async function getSuggestions(): Promise<Suggestion[]> {
  const db = await connectDb();
  return db.prepare('SELECT * FROM suggestions ORDER BY timestamp DESC').all() as Suggestion[];
}

export async function getUnreadSuggestions(): Promise<Suggestion[]> {
    const db = await connectDb();
    return db.prepare('SELECT * FROM suggestions WHERE isRead = 0 ORDER BY timestamp DESC').all() as Suggestion[];
}

export async function getUnreadSuggestionsCount(): Promise<number> {
  const db = await connectDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM suggestions WHERE isRead = 0').get() as { count: number };
  return result.count;
}

export async function markSuggestionAsRead(id: number): Promise<void> {
  const db = await connectDb();
  db.prepare('UPDATE suggestions SET isRead = 1 WHERE id = ?').run(id);
}

export async function deleteSuggestion(id: number): Promise<void> {
  const db = await connectDb();
  db.prepare('DELETE FROM suggestions WHERE id = ?').run(id);
}

// --- Stock Functions ---

export async function getAllStock(): Promise<StockInfo[]> {
  const db = await connectDb();
  try {
    const rows = db.prepare('SELECT * FROM stock').all() as { itemId: string; stockByWarehouse: string; totalStock: number }[];
    return rows.map(row => ({
      ...row,
      stockByWarehouse: JSON.parse(row.stockByWarehouse),
    }));
  } catch (error) {
    console.error("Failed to get all stock:", error);
    return [];
  }
}

export async function saveAllStock(stockData: { itemId: string, warehouseId: string, stock: number }[]): Promise<void> {
    const db = await connectDb();
    const stockMap = new Map<string, { [key: string]: number }>();

    for (const item of stockData) {
        if (!stockMap.has(item.itemId)) {
            stockMap.set(item.itemId, {});
        }
        stockMap.get(item.itemId)![item.warehouseId] = item.stock;
    }

    const insert = db.prepare('INSERT OR REPLACE INTO stock (itemId, stockByWarehouse, totalStock) VALUES (?, ?, ?)');
    const transaction = db.transaction((data) => {
        db.prepare('DELETE FROM stock').run();
        for (const [itemId, stockByWarehouse] of data.entries()) {
            const totalStock = (Object.values(stockByWarehouse) as number[]).reduce((acc: number, val: number) => acc + val, 0);
            insert.run(itemId, JSON.stringify(stockByWarehouse), totalStock);
        }
    });

    try {
        transaction(stockMap);
    } catch (error) {
        console.error("Failed to save all stock:", error);
        throw error;
    }
}

export async function getStockSettings(): Promise<StockSettings> {
    const db = await connectDb();
    const rows = db.prepare('SELECT * FROM stock_settings').all() as { key: string; value: string }[];
    const settings: StockSettings = { warehouses: [] };
    for (const row of rows) {
        if (row.key === 'warehouses') {
            settings.warehouses = JSON.parse(row.value);
        }
    }
    return settings;
}

export async function saveStockSettings(settings: StockSettings): Promise<void> {
    const db = await connectDb();
    db.prepare('INSERT OR REPLACE INTO stock_settings (key, value) VALUES (?, ?)')
      .run('warehouses', JSON.stringify(settings.warehouses));
}

// --- Versioning ---
export async function getCurrentVersion(): Promise<string | null> {
    try {
        if (fs.existsSync(VERSION_FILE_PATH)) {
            const content = fs.readFileSync(VERSION_FILE_PATH, 'utf-8');
            const match = content.match(/v(\d+\.\d+\.\d+)/);
            return match ? match[1] : content.trim();
        }
        return null;
    } catch (error) {
        console.error("Could not read VERSION.txt", error);
        return null;
    }
}

// --- Maintenance Functions ---

const backupDir = path.join(dbDirectory, UPDATE_BACKUP_DIR);

export async function backupAllForUpdate(): Promise<void> {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    // Create a Windows-compatible timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const version = await getCurrentVersion() || 'unknown';
    
    for (const dbModule of DB_MODULES) {
        const dbPath = path.join(dbDirectory, dbModule.dbFile);
        if (fs.existsSync(dbPath)) {
            const backupPath = path.join(backupDir, `${timestamp}_v${version}_${dbModule.dbFile}`);
            fs.copyFileSync(dbPath, backupPath);
        }
    }
}

export async function listAllUpdateBackups(): Promise<UpdateBackupInfo[]> {
    if (!fs.existsSync(backupDir)) return [];
    const files = fs.readdirSync(backupDir);
    return files.map(file => {
        const parts = file.split('_');
        const date = parts[0];
        const version = parts[1]?.startsWith('v') ? parts[1].substring(1) : null;
        const dbFile = version ? parts.slice(2).join('_') : parts.slice(1).join('_');
        
        const dbModule = DB_MODULES.find(m => m.dbFile === dbFile);
        return {
            moduleId: dbModule?.id || 'unknown',
            moduleName: dbModule?.name || 'Base de Datos Desconocida',
            fileName: file,
            date: date,
            version: version
        };
    }).sort((a, b) => b.date.localeCompare(a.date));
}

export async function restoreDatabase(moduleId: string, backupFile: File): Promise<void> {
    if (!moduleId || !backupFile) {
        throw new Error("Module ID and backup file are required.");
    }
    
    const dbModule = DB_MODULES.find(m => m.id === moduleId);
    if (!dbModule) throw new Error("Module not found");

    if (dbConnections.has(dbModule.dbFile)) {
        const connection = dbConnections.get(dbModule.dbFile);
        if (connection && connection.open) {
            connection.close();
        }
        dbConnections.delete(dbModule.dbFile);
    }

    const dbPath = path.join(dbDirectory, dbModule.dbFile);
    const buffer = Buffer.from(await backupFile.arrayBuffer());
    fs.writeFileSync(dbPath, buffer);
    await connectDb(dbModule.dbFile); // Reconnect to validate
}

export async function restoreAllFromUpdateBackup(timestamp: string): Promise<void> {
    const backups = await listAllUpdateBackups();
    const backupsToRestore = backups.filter(b => b.date === timestamp);

    if (backupsToRestore.length === 0) {
        throw new Error("No se encontraron archivos de backup para la fecha y hora seleccionada.");
    }
    
    // First, close all active database connections
    for (const dbModule of DB_MODULES) {
        if (dbConnections.has(dbModule.dbFile)) {
            const connection = dbConnections.get(dbModule.dbFile);
            if (connection && connection.open) {
                console.log(`Closing connection to ${dbModule.dbFile} before restore...`);
                connection.close();
            }
            dbConnections.delete(dbModule.dbFile);
        }
    }

    // Now, perform the file copy operations
    for (const backup of backupsToRestore) {
        const dbModule = DB_MODULES.find(m => m.id === backup.moduleId);
        if (dbModule) {
            const backupPath = path.join(backupDir, backup.fileName);
            const targetDbPath = path.join(dbDirectory, dbModule.dbFile);
            fs.copyFileSync(backupPath, targetDbPath);
            console.log(`Restored ${dbModule.dbFile} from ${backup.fileName}`);
        }
    }
}


export async function deleteOldUpdateBackups(): Promise<number> {
    const backups = await listAllUpdateBackups();
    const uniqueTimestamps = [...new Set(backups.map(b => b.date))].sort((a,b) => b.localeCompare(a));
    if (uniqueTimestamps.length <= 1) return 0;
    
    const timestampsToDelete = uniqueTimestamps.slice(1);
    let deletedCount = 0;
    for (const timestamp of timestampsToDelete) {
        const filesToDelete = fs.readdirSync(backupDir).filter(file => file.startsWith(timestamp));
        for (const file of filesToDelete) {
            fs.unlinkSync(path.join(backupDir, file));
            deletedCount++;
        }
    }
    return deletedCount;
}

export async function factoryReset(moduleId: string): Promise<void> {
    await addLog({ type: 'WARN', message: `FACTORY RESET triggered for module: ${moduleId}` });

    const modulesToReset = moduleId === '__all__' ? DB_MODULES : DB_MODULES.filter(m => m.id === moduleId);

    if (modulesToReset.length === 0) throw new Error("Módulo no encontrado para resetear.");

    for (const dbModule of modulesToReset) {
        const dbPath = path.join(dbDirectory, dbModule.dbFile);
        if (dbConnections.has(dbModule.dbFile)) {
            const connection = dbConnections.get(dbModule.dbFile);
            if (connection && connection.open) {
                connection.close();
            }
            dbConnections.delete(dbModule.dbFile);
        }
        if (fs.existsSync(dbPath)) {
            try {
                fs.unlinkSync(dbPath);
                 console.log(`Successfully deleted ${dbPath}`);
            } catch(e) {
                console.error(`Error deleting database file ${dbPath}`, e);
                throw e;
            }
        }
    }
}

// --- ERP Order Import ---
export async function saveAllErpOrderHeaders(headers: ErpOrderHeader[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT OR REPLACE INTO erp_order_headers (PEDIDO, ESTADO, CLIENTE, FECHA_PEDIDO, FECHA_PROMETIDA, ORDEN_COMPRA, TOTAL_UNIDADES, MONEDA_PEDIDO, USUARIO) VALUES (@PEDIDO, @ESTADO, @CLIENTE, @FECHA_PEDIDO, @FECHA_PROMETIDA, @ORDEN_COMPRA, @TOTAL_UNIDADES, @MONEDA_PEDIDO, @USUARIO)');
    
    const transaction = db.transaction((headersToSave: ErpOrderHeader[]) => {
        db.prepare('DELETE FROM erp_order_headers').run();
        for(const header of headersToSave) {
            // Sanitize data to ensure it's in a format SQLite can handle.
            const sanitizedHeader = {
                PEDIDO: String(header.PEDIDO),
                ESTADO: String(header.ESTADO),
                CLIENTE: String(header.CLIENTE),
                FECHA_PEDIDO: header.FECHA_PEDIDO instanceof Date ? header.FECHA_PEDIDO.toISOString() : String(header.FECHA_PEDIDO),
                FECHA_PROMETIDA: header.FECHA_PROMETIDA instanceof Date ? header.FECHA_PROMETIDA.toISOString() : String(header.FECHA_PROMETIDA),
                ORDEN_COMPRA: header.ORDEN_COMPRA || null,
                TOTAL_UNIDADES: header.TOTAL_UNIDADES || null,
                MONEDA_PEDIDO: header.MONEDA_PEDIDO || null,
                USUARIO: header.USUARIO || null
            };
            insert.run(sanitizedHeader);
        }
    });

    try {
        transaction(headers);
    } catch (error) {
        console.error("Failed to save ERP order headers:", error);
        throw error;
    }
}

export async function saveAllErpOrderLines(lines: ErpOrderLine[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT OR REPLACE INTO erp_order_lines (PEDIDO, PEDIDO_LINEA, ARTICULO, CANTIDAD_PEDIDA, PRECIO_UNITARIO) VALUES (@PEDIDO, @PEDIDO_LINEA, @ARTICULO, @CANTIDAD_PEDIDA, @PRECIO_UNITARIO)');
    const transaction = db.transaction((linesToSave) => {
        db.prepare('DELETE FROM erp_order_lines').run();
        for(const line of linesToSave) {
            insert.run(line);
        }
    });
    try {
        transaction(lines);
    } catch (error) {
        console.error("Failed to save ERP order lines:", error);
        throw error;
    }
}

export async function saveAllErpPurchaseOrderHeaders(headers: ErpPurchaseOrderHeader[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT OR REPLACE INTO erp_purchase_order_headers (ORDEN_COMPRA, PROVEEDOR, FECHA_HORA, ESTADO) VALUES (?, ?, ?, ?)');
    const transaction = db.transaction((headersToSave: ErpPurchaseOrderHeader[]) => {
        db.prepare('DELETE FROM erp_purchase_order_headers').run();
        for(const header of headersToSave) {
            insert.run(header.ORDEN_COMPRA, header.PROVEEDOR, header.FECHA_HORA instanceof Date ? header.FECHA_HORA.toISOString() : String(header.FECHA_HORA), header.ESTADO);
        }
    });
    try {
        transaction(headers);
    } catch (error) {
        console.error("Failed to save ERP purchase order headers:", error);
        throw error;
    }
}

export async function saveAllErpPurchaseOrderLines(lines: ErpPurchaseOrderLine[]): Promise<void> {
    const db = await connectDb();
    const insert = db.prepare('INSERT OR REPLACE INTO erp_purchase_order_lines (ORDEN_COMPRA, ARTICULO, CANTIDAD_ORDENADA) VALUES (?, ?, ?)');
    const transaction = db.transaction((linesToSave: ErpPurchaseOrderLine[]) => {
        db.prepare('DELETE FROM erp_purchase_order_lines').run();
        for(const line of linesToSave) {
            insert.run(line.ORDEN_COMPRA, line.ARTICULO, line.CANTIDAD_ORDENADA);
        }
    });
    try {
        transaction(lines);
    } catch (error) {
        console.error("Failed to save ERP purchase order lines:", error);
        throw error;
    }
}

export async function getAllErpPurchaseOrderHeaders(): Promise<ErpPurchaseOrderHeader[]> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM erp_purchase_order_headers').all() as ErpPurchaseOrderHeader[];
    } catch (error) {
        console.error("Failed to get all ERP purchase order headers:", error);
        return [];
    }
}

export async function getAllErpPurchaseOrderLines(): Promise<ErpPurchaseOrderLine[]> {
    const db = await connectDb();
    try {
        return db.prepare('SELECT * FROM erp_purchase_order_lines').all() as ErpPurchaseOrderLine[];
    } catch (error) {
        console.error("Failed to get all ERP purchase order lines:", error);
        return [];
    }
}


// --- Notification Functions ---
export async function createNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>): Promise<void> {
  const db = await connectDb();
  db.prepare('INSERT INTO notifications (userId, message, href, isRead, timestamp, entityId, entityType, taskType) VALUES (?, ?, ?, 0, ?, ?, ?, ?)')
    .run(notification.userId, notification.message, notification.href, new Date().toISOString(), notification.entityId, notification.entityType, notification.taskType);
}

export async function getNotifications(userId: number): Promise<Notification[]> {
  const db = await connectDb();
  return db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY timestamp DESC').all(userId) as Notification[];
}

export async function markNotificationsAsRead(notificationIds: number[], userId: number): Promise<void> {
  const db = await connectDb();
  if (notificationIds.length === 0) return;
  const ids = notificationIds.map(() => '?').join(',');
  db.prepare(`UPDATE notifications SET isRead = 1 WHERE id IN (${ids}) AND userId = ?`).run(...notificationIds, userId);
}

export async function getNotificationById(id: number): Promise<Notification | null> {
    const db = await connectDb();
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Notification | null;
}

export async function deleteNotificationById(id: number): Promise<void> {
    const db = await connectDb();
    db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
}


// --- User Preferences ---
export async function getUserPreferences(userId: number, key: string): Promise<any | null> {
    const db = await connectDb();
    const row = db.prepare('SELECT value FROM user_preferences WHERE userId = ? AND key = ?').get(userId, key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
}

export async function saveUserPreferences(userId: number, key: string, value: any): Promise<void> {
    const db = await connectDb();
    db.prepare('INSERT OR REPLACE INTO user_preferences (userId, key, value) VALUES (?, ?, ?)').run(userId, key, JSON.stringify(value));
}

// --- Database Audit ---
export async function runDatabaseAudit(userName: string): Promise<AuditResult[]> {
    const results: AuditResult[] = [];
    let overallStatus: 'OK' | 'ERROR' = 'OK';
    const allIssues: string[] = [];
    
    for (const dbModule of DB_MODULES) {
        const audit: AuditResult = {
            moduleId: dbModule.id,
            moduleName: dbModule.name,
            dbFile: dbModule.dbFile,
            status: 'OK',
            issues: []
        };
        
        try {
            const db = await connectDb(dbModule.dbFile);
            
            for (const expectedTable in dbModule.schema) {
                const tableInfo = db.prepare(`PRAGMA table_info(${expectedTable})`).all() as { name: string }[];
                
                if (tableInfo.length === 0) {
                    audit.status = 'ERROR';
                    overallStatus = 'ERROR';
                    const issue = `FALTA TABLA: La tabla '${expectedTable}' no existe en ${dbModule.dbFile}.`;
                    audit.issues.push(issue);
                    allIssues.push(issue);
                    continue; // Skip column check for this table
                }

                const existingColumns = new Set(tableInfo.map(col => col.name));
                const expectedColumns = dbModule.schema[expectedTable];

                for (const expectedColumn of expectedColumns) {
                    if (!existingColumns.has(expectedColumn)) {
                        audit.status = 'ERROR';
                        overallStatus = 'ERROR';
                        const issue = `FALTA COLUMNA: '${expectedColumn}' en la tabla '${expectedTable}' de ${dbModule.dbFile}.`;
                        audit.issues.push(issue);
                        allIssues.push(issue);
                    }
                }
            }
        } catch (error: any) {
            audit.status = 'ERROR';
            overallStatus = 'ERROR';
            const issue = `Error al auditar '${dbModule.name}': ${error.message}`;
            audit.issues.push(issue);
            allIssues.push(issue);
        }
        results.push(audit);
    }
    
    if (overallStatus === 'ERROR') {
        await logError('Auditoría de base de datos fallida.', { user: userName, issues: allIssues });
    } else {
        await logInfo(`Auditoría de base de datos completada con éxito por ${userName}.`, { user: userName });
    }
    
    return results;
}

// --- Planner-specific functions moved from core ---
export { confirmPlannerModification };
