/**
 * @fileoverview Server-side functions for the purchase requests database.
 */
"use server";

import { connectDb, getImportQueries as getImportQueriesFromMain, getAllRoles as getAllRolesFromMain } from '../../core/lib/db';
import { getAllUsers as getAllUsersFromMain } from '../../core/lib/auth';
import { logInfo, logError, logWarn } from '../../core/lib/logger';
import type { PurchaseRequest, RequestSettings, UpdateRequestStatusPayload, PurchaseRequestHistoryEntry, UpdatePurchaseRequestPayload, RejectCancellationPayload, PurchaseRequestStatus, DateRange, AdministrativeAction, AdministrativeActionPayload, StockInfo, ErpOrderHeader, ErpOrderLine, User, PurchaseSuggestion, PurchaseRequestPriority, ErpPurchaseOrderHeader, ErpPurchaseOrderLine } from '../../core/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { executeQuery } from '@/modules/core/lib/sql-service';
import { getAllProducts, getAllStock, getAllCustomers, getAllErpPurchaseOrderHeaders, getAllErpPurchaseOrderLines } from '@/modules/core/lib/db';

const REQUESTS_DB_FILE = 'requests.db';

export async function initializeRequestsDb(db: import('better-sqlite3').Database) {
    const schema = `
        CREATE TABLE IF NOT EXISTS request_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS purchase_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            consecutive TEXT UNIQUE NOT NULL,
            purchaseOrder TEXT,
            requestDate TEXT NOT NULL,
            requiredDate TEXT NOT NULL,
            arrivalDate TEXT,
            receivedDate TEXT,
            clientId TEXT NOT NULL,
            clientName TEXT NOT NULL,
            clientTaxId TEXT,
            itemId TEXT NOT NULL,
            itemDescription TEXT NOT NULL,
            quantity REAL NOT NULL,
            deliveredQuantity REAL,
            inventory REAL,
            inventoryErp REAL,
            priority TEXT DEFAULT 'medium',
            purchaseType TEXT DEFAULT 'single',
            unitSalePrice REAL,
            salePriceCurrency TEXT DEFAULT 'CRC',
            requiresCurrency BOOLEAN DEFAULT FALSE,
            erpOrderNumber TEXT,
            erpOrderLine INTEGER,
            erpEntryNumber TEXT,
            manualSupplier TEXT,
            route TEXT,
            shippingMethod TEXT,
            status TEXT NOT NULL,
            pendingAction TEXT DEFAULT 'none',
            notes TEXT,
            requestedBy TEXT NOT NULL,
            approvedBy TEXT,
            receivedInWarehouseBy TEXT,
            lastStatusUpdateBy TEXT,
            lastStatusUpdateNotes TEXT,
            reopened BOOLEAN DEFAULT FALSE,
            previousStatus TEXT,
            lastModifiedBy TEXT,
            lastModifiedAt TEXT,
            hasBeenModified BOOLEAN DEFAULT FALSE,
            sourceOrders TEXT,
            involvedClients TEXT,
            analysis TEXT
        );
        CREATE TABLE IF NOT EXISTS purchase_request_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requestId INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            status TEXT NOT NULL,
            notes TEXT,
            updatedBy TEXT NOT NULL,
            FOREIGN KEY (requestId) REFERENCES purchase_requests(id) ON DELETE CASCADE
        );
    `;
    db.exec(schema);

    db.prepare(`INSERT OR IGNORE INTO request_settings (key, value) VALUES ('requestPrefix', 'SC-')`).run();
    db.prepare(`INSERT OR IGNORE INTO request_settings (key, value) VALUES ('nextRequestNumber', '1')`).run();
    db.prepare(`INSERT OR IGNORE INTO request_settings (key, value) VALUES ('routes', '["Ruta GAM", "Fuera de GAM"]')`).run();
    db.prepare(`INSERT OR IGNORE INTO request_settings (key, value) VALUES ('shippingMethods', '["Mensajería", "Encomienda", "Transporte Propio"]')`).run();
    db.prepare(`INSERT OR IGNORE INTO request_settings (key, value) VALUES ('useWarehouseReception', 'false')`).run();
    db.prepare(`INSERT OR IGNORE INTO request_settings (key, value) VALUES ('useErpEntry', 'false')`).run();
    db.prepare(`INSERT OR IGNORE INTO request_settings (key, value) VALUES ('showCustomerTaxId', 'true')`).run();
    
    console.log(`Database ${REQUESTS_DB_FILE} initialized for Purchase Requests.`);
    
    await runRequestMigrations(db);
}


export async function runRequestMigrations(db: import('better-sqlite3').Database) {
    try {
        const requestsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='purchase_requests'`).get();
        if (!requestsTable) {
            return;
        }

        const tableInfo = db.prepare(`PRAGMA table_info(purchase_requests)`).all() as { name: string }[];
        const columns = new Set(tableInfo.map(c => c.name));

        if (!columns.has('shippingMethod')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN shippingMethod TEXT`);
        if (!columns.has('deliveredQuantity')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN deliveredQuantity REAL;`);
        if (!columns.has('receivedInWarehouseBy')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN receivedInWarehouseBy TEXT;`);
        if (!columns.has('inventory')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN inventory REAL;`);
        if (!columns.has('priority')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN priority TEXT DEFAULT 'medium'`);
        if (!columns.has('receivedDate')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN receivedDate TEXT`);
        if (!columns.has('previousStatus')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN previousStatus TEXT`);
        if (!columns.has('purchaseType')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN purchaseType TEXT DEFAULT 'single'`);
        if (!columns.has('arrivalDate')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN arrivalDate TEXT`);
        if (!columns.has('purchaseOrder')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN purchaseOrder TEXT`);
        if (!columns.has('unitSalePrice')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN unitSalePrice REAL`);
        if (!columns.has('erpOrderNumber')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN erpOrderNumber TEXT`);
        if (!columns.has('erpOrderLine')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN erpOrderLine INTEGER`);
        if (!columns.has('manualSupplier')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN manualSupplier TEXT`);
        if (!columns.has('pendingAction')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN pendingAction TEXT DEFAULT 'none'`);
        if (!columns.has('lastModifiedBy')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN lastModifiedBy TEXT`);
        if (!columns.has('lastModifiedAt')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN lastModifiedAt TEXT`);
        if (!columns.has('hasBeenModified')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN hasBeenModified BOOLEAN DEFAULT FALSE`);
        if (!columns.has('clientTaxId')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN clientTaxId TEXT`);
        if (!columns.has('erpEntryNumber')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN erpEntryNumber TEXT`);
        if (!columns.has('salePriceCurrency')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN salePriceCurrency TEXT DEFAULT 'CRC'`);
        if (!columns.has('requiresCurrency')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN requiresCurrency BOOLEAN DEFAULT FALSE`);
        if (!columns.has('sourceOrders')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN sourceOrders TEXT`);
        if (!columns.has('involvedClients')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN involvedClients TEXT`);
        if (!columns.has('inventoryErp')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN inventoryErp REAL`);
        if (!columns.has('analysis')) db.exec(`ALTER TABLE purchase_requests ADD COLUMN analysis TEXT`);
        
        const settingsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='request_settings'`).get();
        if(settingsTable){
            if (!db.prepare(`SELECT key FROM request_settings WHERE key = 'requestPrefix'`).get()) {
                db.prepare(`INSERT INTO request_settings (key, value) VALUES ('requestPrefix', 'SC-')`).run();
            }
            if (!db.prepare(`SELECT key FROM request_settings WHERE key = 'nextRequestNumber'`).get()) {
                db.prepare(`INSERT INTO request_settings (key, value) VALUES ('nextRequestNumber', '1')`).run();
            }
            const pdfTopLegendRow = db.prepare(`SELECT value FROM request_settings WHERE key = 'pdfTopLegend'`).get() as { value: string } | undefined;
            if (!pdfTopLegendRow) {
                console.log("MIGRATION (requests.db): Adding pdfTopLegend to settings.");
                db.prepare(`INSERT INTO request_settings (key, value) VALUES ('pdfTopLegend', '')`).run();
            }
            const pdfExportColumnsRow = db.prepare(`SELECT value FROM request_settings WHERE key = 'pdfExportColumns'`).get() as { value: string } | undefined;
            if (!pdfExportColumnsRow) {
                console.log("MIGRATION (requests.db): Adding pdfExportColumns to settings.");
                const defaultColumns = ['consecutive', 'itemDescription', 'quantity', 'clientName', 'requiredDate', 'status'];
                db.prepare(`INSERT INTO request_settings (key, value) VALUES ('pdfExportColumns', ?)`).run(JSON.stringify(defaultColumns));
            }
            const pdfPaperSizeRow = db.prepare(`SELECT value FROM request_settings WHERE key = 'pdfPaperSize'`).get() as { value: string } | undefined;
            if (!pdfPaperSizeRow) {
                console.log("MIGRATION (requests.db): Adding pdfPaperSize and pdfOrientation to settings.");
                db.prepare(`INSERT INTO request_settings (key, value) VALUES ('pdfPaperSize', 'letter')`).run();
                db.prepare(`INSERT INTO request_settings (key, value) VALUES ('pdfOrientation', 'portrait')`).run();
            }
            if (!db.prepare(`SELECT key FROM request_settings WHERE key = 'showCustomerTaxId'`).get()) {
                console.log("MIGRATION (requests.db): Adding showCustomerTaxId to settings.");
                db.prepare(`INSERT INTO request_settings (key, value) VALUES ('showCustomerTaxId', 'true')`).run();
            }
            if (!db.prepare(`SELECT key FROM request_settings WHERE key = 'useErpEntry'`).get()) {
                console.log("MIGRATION (requests.db): Adding useErpEntry to settings.");
                db.prepare(`INSERT INTO request_settings (key, value) VALUES ('useErpEntry', 'false')`).run();
            }
        }
    } catch (error) {
        console.error("Error during requests migrations:", error);
    }
}


export async function getSettings(): Promise<RequestSettings> {
    const db = await connectDb(REQUESTS_DB_FILE);
    const settingsRows = db.prepare('SELECT * FROM request_settings').all() as { key: string; value: string }[];
    
    const settings: RequestSettings = {
        requestPrefix: 'SC-',
        nextRequestNumber: 1,
        showCustomerTaxId: true,
        routes: [],
        shippingMethods: [],
        useWarehouseReception: false,
        useErpEntry: false,
        pdfTopLegend: '',
        pdfExportColumns: [],
        pdfPaperSize: 'letter',
        pdfOrientation: 'portrait',
    };

    for (const row of settingsRows) {
        if (row.key === 'nextRequestNumber') settings.nextRequestNumber = Number(row.value);
        else if (row.key === 'requestPrefix') settings.requestPrefix = row.value;
        else if (row.key === 'routes') settings.routes = JSON.parse(row.value);
        else if (row.key === 'shippingMethods') settings.shippingMethods = JSON.parse(row.value);
        else if (row.key === 'useWarehouseReception') settings.useWarehouseReception = row.value === 'true';
        else if (row.key === 'useErpEntry') settings.useErpEntry = row.value === 'true';
        else if (row.key === 'showCustomerTaxId') settings.showCustomerTaxId = row.value === 'true';
        else if (row.key === 'pdfTopLegend') settings.pdfTopLegend = row.value;
        else if (row.key === 'pdfExportColumns') settings.pdfExportColumns = JSON.parse(row.value);
        else if (row.key === 'pdfPaperSize') settings.pdfPaperSize = row.value as 'letter' | 'legal';
        else if (row.key === 'pdfOrientation') settings.pdfOrientation = row.value as 'portrait' | 'landscape';
    }
    return settings;
}

export async function saveSettings(settings: RequestSettings): Promise<void> {
    const db = await connectDb(REQUESTS_DB_FILE);
    
    const transaction = db.transaction((settingsToUpdate) => {
        const keys: (keyof RequestSettings)[] = ['requestPrefix', 'nextRequestNumber', 'routes', 'shippingMethods', 'useWarehouseReception', 'useErpEntry', 'showCustomerTaxId', 'pdfTopLegend', 'pdfExportColumns', 'pdfPaperSize', 'pdfOrientation'];
        for (const key of keys) {
             if (settingsToUpdate[key] !== undefined) {
                const value = typeof settingsToUpdate[key] === 'object' ? JSON.stringify(settingsToUpdate[key]) : String(settingsToUpdate[key]);
                db.prepare('INSERT OR REPLACE INTO request_settings (key, value) VALUES (?, ?)').run(key, value);
            }
        }
    });

    transaction(settings);
}

// Helper function to ensure complex fields are in the correct format (array).
const sanitizeRequest = (request: any): PurchaseRequest => {
    const sanitized = { ...request };

    try {
        if (sanitized.sourceOrders && typeof sanitized.sourceOrders === 'string') {
            sanitized.sourceOrders = JSON.parse(sanitized.sourceOrders);
        } else if (!Array.isArray(sanitized.sourceOrders)) {
            sanitized.sourceOrders = [];
        }
    } catch {
        sanitized.sourceOrders = [];
    }

    try {
        if (sanitized.involvedClients && typeof sanitized.involvedClients === 'string') {
            sanitized.involvedClients = JSON.parse(sanitized.involvedClients);
        } else if (!Array.isArray(sanitized.involvedClients)) {
            sanitized.involvedClients = [];
        }
    } catch {
        sanitized.involvedClients = [];
    }
    
    try {
        if (sanitized.analysis && typeof sanitized.analysis === 'string') {
            sanitized.analysis = JSON.parse(sanitized.analysis);
        } else if (typeof sanitized.analysis !== 'object' || sanitized.analysis === null) {
            sanitized.analysis = undefined;
        }
    } catch {
        sanitized.analysis = undefined;
    }


  return sanitized as PurchaseRequest;
};


export async function getRequests(options: { 
    page?: number; 
    pageSize?: number;
}): Promise<{ requests: PurchaseRequest[], totalArchivedCount: number }> {
    const db = await connectDb(REQUESTS_DB_FILE);
    
    const settings = await getSettings();
    const finalStatus = settings.useErpEntry ? 'entered-erp' : (settings.useWarehouseReception ? 'received-in-warehouse' : 'ordered');
    const archivedStatuses = `'${finalStatus}', 'canceled'`;

    if (options.page !== undefined && options.pageSize !== undefined) {
        const { page, pageSize } = options;
        const archivedRequestsRaw = db.prepare(`
            SELECT * FROM purchase_requests 
            WHERE status IN (${archivedStatuses}) 
            ORDER BY requestDate DESC 
            LIMIT ? OFFSET ?
        `).all(pageSize, page * pageSize) as any[];

        const activeRequestsRaw = db.prepare(`
            SELECT * FROM purchase_requests
            WHERE status NOT IN (${archivedStatuses})
            ORDER BY requestDate DESC
        `).all() as any[];
        
        const totalArchivedCount = (db.prepare(`
            SELECT COUNT(*) as count 
            FROM purchase_requests 
            WHERE status IN (${archivedStatuses})
        `).get() as { count: number }).count;
        
        const activeRequests = activeRequestsRaw.map(sanitizeRequest);
        const archivedRequests = archivedRequestsRaw.map(sanitizeRequest);
        
        return { requests: [...activeRequests, ...archivedRequests], totalArchivedCount };
    }
    
    const allRequestsRaw = db.prepare(`SELECT * FROM purchase_requests ORDER BY requestDate DESC`).all() as any[];
    const allRequests = allRequestsRaw.map(sanitizeRequest);
    const totalArchivedCount = allRequests.filter(r => archivedStatuses.includes(`'${r.status}'`)).length;

    return { requests: allRequests, totalArchivedCount };
}

export async function addRequest(request: Omit<PurchaseRequest, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'deliveredQuantity' | 'receivedInWarehouseBy' | 'receivedDate' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'>, requestedBy: string): Promise<PurchaseRequest> {
    const db = await connectDb(REQUESTS_DB_FILE);
    
    const settings = await getSettings();
    const nextNumber = settings.nextRequestNumber || 1;
    const prefix = settings.requestPrefix || 'SC-';

    const newRequest: Omit<PurchaseRequest, 'id'> = {
        ...request,
        requestedBy: requestedBy,
        consecutive: `${prefix}${nextNumber.toString().padStart(5, '0')}`,
        requestDate: new Date().toISOString(),
        status: 'pending',
        reopened: false,
    };
    
    const preparedRequest = {
        ...newRequest,
        unitSalePrice: newRequest.unitSalePrice ?? null,
        salePriceCurrency: newRequest.salePriceCurrency || 'CRC',
        requiresCurrency: newRequest.requiresCurrency ? 1 : 0,
        erpOrderNumber: newRequest.erpOrderNumber || null,
        erpOrderLine: newRequest.erpOrderLine || null,
        manualSupplier: newRequest.manualSupplier || null,
        route: newRequest.route || null,
        shippingMethod: newRequest.shippingMethod || null,
        purchaseOrder: newRequest.purchaseOrder || null,
        notes: newRequest.notes || null,
        inventory: newRequest.inventory ?? null,
        inventoryErp: newRequest.inventoryErp ?? null,
        reopened: newRequest.reopened ? 1 : 0,
        purchaseType: newRequest.purchaseType || 'single',
        arrivalDate: newRequest.arrivalDate || null,
        clientTaxId: newRequest.clientTaxId || null,
        sourceOrders: JSON.stringify(newRequest.sourceOrders || []),
        involvedClients: JSON.stringify(newRequest.involvedClients || []),
        analysis: newRequest.analysis ? JSON.stringify(newRequest.analysis) : null,
    };

    try {
        const transaction = db.transaction(() => {
            const insertStmt = db.prepare(`
                INSERT INTO purchase_requests (
                    consecutive, requestDate, requiredDate, clientId, clientName, clientTaxId,
                    itemId, itemDescription, quantity, unitSalePrice, salePriceCurrency, requiresCurrency,
                    erpOrderNumber, erpOrderLine, manualSupplier, route, shippingMethod, purchaseOrder,
                    status, pendingAction, notes, requestedBy, reopened, inventory, inventoryErp, priority, purchaseType, arrivalDate,
                    sourceOrders, involvedClients, analysis
                ) VALUES (
                    @consecutive, @requestDate, @requiredDate, @clientId, @clientName, @clientTaxId,
                    @itemId, @itemDescription, @quantity, @unitSalePrice, @salePriceCurrency, @requiresCurrency,
                    @erpOrderNumber, @erpOrderLine, @manualSupplier, @route, @shippingMethod, @purchaseOrder,
                    @status, @pendingAction, @notes, @requestedBy, @reopened, @inventory, @inventoryErp, @priority, @purchaseType, @arrivalDate,
                    @sourceOrders, @involvedClients, @analysis
                )
            `);
            
            const info = insertStmt.run(preparedRequest);
            const newRequestId = info.lastInsertRowid as number;

            db.prepare('UPDATE request_settings SET value = ? WHERE key = \'nextRequestNumber\'').run(nextNumber + 1);
            
            const historyStmt = db.prepare('INSERT INTO purchase_request_history (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
            historyStmt.run(newRequestId, new Date().toISOString(), 'pending', newRequest.requestedBy, 'Solicitud creada');
            
            return newRequestId;
        });

        const newId = transaction();
        const createdRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(newId) as any;
        return sanitizeRequest(createdRequest);
    } catch (error: any) {
        logError("Failed to create request in DB", { context: 'addRequest DB transaction', error: error.message, details: preparedRequest });
        throw error;
    }
}

export async function updateRequest(payload: UpdatePurchaseRequestPayload): Promise<PurchaseRequest> {
    const db = await connectDb(REQUESTS_DB_FILE);
    const { requestId, updatedBy, ...dataToUpdate } = payload;
    
    const currentRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(requestId) as PurchaseRequest | undefined;
    if (!currentRequest) {
        throw new Error("Request not found.");
    }
    
    let hasBeenModified = currentRequest.hasBeenModified;
    if (['approved', 'ordered'].includes(currentRequest.status)) {
        hasBeenModified = true;
    }

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE purchase_requests SET
                requiredDate = @requiredDate,
                clientId = @clientId,
                clientName = @clientName,
                clientTaxId = @clientTaxId,
                itemId = @itemId,
                itemDescription = @itemDescription,
                quantity = @quantity,
                unitSalePrice = @unitSalePrice,
                salePriceCurrency = @salePriceCurrency,
                requiresCurrency = @requiresCurrency,
                erpOrderNumber = @erpOrderNumber,
                erpOrderLine = @erpOrderLine,
                manualSupplier = @manualSupplier,
                route = @route,
                shippingMethod = @shippingMethod,
                purchaseOrder = @purchaseOrder,
                notes = @notes,
                inventory = @inventory,
                priority = @priority,
                purchaseType = @purchaseType,
                arrivalDate = @arrivalDate,
                lastModifiedBy = @updatedBy,
                lastModifiedAt = @lastModifiedAt,
                hasBeenModified = @hasBeenModified,
                sourceOrders = @sourceOrders,
                involvedClients = @involvedClients,
                analysis = @analysis
            WHERE id = @requestId
        `).run({ 
            requestId, 
            ...dataToUpdate,
            requiresCurrency: dataToUpdate.requiresCurrency ? 1 : 0,
            salePriceCurrency: dataToUpdate.salePriceCurrency || 'CRC',
            updatedBy,
            lastModifiedAt: new Date().toISOString(),
            hasBeenModified: hasBeenModified ? 1 : 0,
            sourceOrders: JSON.stringify(dataToUpdate.sourceOrders || []),
            involvedClients: JSON.stringify(dataToUpdate.involvedClients || []),
            analysis: dataToUpdate.analysis ? JSON.stringify(dataToUpdate.analysis) : null,
        });

        if (hasBeenModified) {
            const historyStmt = db.prepare('INSERT INTO purchase_request_history (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
            historyStmt.run(requestId, new Date().toISOString(), currentRequest.status, updatedBy, 'Solicitud editada después de aprobación.');
        }
    });

    transaction();
    const updatedRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}

export async function updateStatus(payload: UpdateRequestStatusPayload): Promise<PurchaseRequest> {
    const db = await connectDb(REQUESTS_DB_FILE);
    const { requestId, status, notes, updatedBy, reopen, manualSupplier, erpOrderNumber, erpEntryNumber, deliveredQuantity, arrivalDate } = payload;

    const currentRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(requestId) as PurchaseRequest | undefined;
    if (!currentRequest) {
        throw new Error("Request not found.");
    }
    
    let approvedBy = currentRequest.approvedBy;
    if (status === 'approved' && !currentRequest.approvedBy) {
        approvedBy = updatedBy;
    }

    let receivedInWarehouseBy = currentRequest.receivedInWarehouseBy;
    if (status === 'received-in-warehouse') {
        receivedInWarehouseBy = updatedBy;
    }

    let receivedDate = currentRequest.receivedDate;
    if(status === 'received-in-warehouse'){
        receivedDate = new Date().toISOString();
    }
    
    let previousStatus = currentRequest.previousStatus;
    // Store the current status as 'previousStatus' if we're moving backwards in the flow
    if (status === 'purchasing-review' && currentRequest.status === 'pending-approval') {
        previousStatus = currentRequest.status;
    } else if (status === 'pending' && currentRequest.status === 'purchasing-review') {
        previousStatus = currentRequest.status;
    } else if (status === 'approved' && currentRequest.status === 'ordered') { // Reverting from ordered
        previousStatus = currentRequest.status;
    } else {
        previousStatus = null; // Clear it for forward movements
    }

    const transaction = db.transaction(() => {
        const stmt = db.prepare(`
            UPDATE purchase_requests SET
                status = @status,
                lastStatusUpdateNotes = @notes,
                lastStatusUpdateBy = @updatedBy,
                approvedBy = @approvedBy,
                reopened = @reopened,
                manualSupplier = @manualSupplier,
                erpOrderNumber = @erpOrderNumber,
                erpEntryNumber = @erpEntryNumber,
                deliveredQuantity = @deliveredQuantity,
                receivedInWarehouseBy = @receivedInWarehouseBy,
                receivedDate = @receivedDate,
                arrivalDate = @arrivalDate,
                previousStatus = @previousStatus,
                pendingAction = 'none'
            WHERE id = @requestId
        `);

        stmt.run({
            status,
            notes: notes || null,
            updatedBy,
            approvedBy,
            requestId,
            reopened: reopen ? 1 : (currentRequest.reopened ? 1 : 0),
            manualSupplier: manualSupplier !== undefined ? manualSupplier : currentRequest.manualSupplier,
            erpOrderNumber: erpOrderNumber !== undefined ? erpOrderNumber : currentRequest.erpOrderNumber,
            erpEntryNumber: erpEntryNumber !== undefined ? erpEntryNumber : currentRequest.erpEntryNumber,
            deliveredQuantity: deliveredQuantity !== undefined ? deliveredQuantity : currentRequest.deliveredQuantity,
            receivedInWarehouseBy: receivedInWarehouseBy !== undefined ? receivedInWarehouseBy : currentRequest.receivedInWarehouseBy,
            receivedDate: receivedDate,
            arrivalDate: arrivalDate !== undefined ? arrivalDate : currentRequest.arrivalDate,
            previousStatus: previousStatus
        });
        
        const historyStmt = db.prepare('INSERT INTO purchase_request_history (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
        historyStmt.run(requestId, new Date().toISOString(), status, updatedBy, notes);
    });

    transaction();
    const updatedRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}

export async function getRequestHistory(requestId: number): Promise<PurchaseRequestHistoryEntry[]> {
    const db = await connectDb(REQUESTS_DB_FILE);
    return db.prepare('SELECT * FROM purchase_request_history WHERE requestId = ? ORDER BY timestamp DESC').all(requestId) as PurchaseRequestHistoryEntry[];
}

export async function updatePendingAction(payload: AdministrativeActionPayload): Promise<PurchaseRequest> {
    const db = await connectDb(REQUESTS_DB_FILE);
    const { entityId, action, notes, updatedBy } = payload;

    const currentRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(entityId) as PurchaseRequest | undefined;
    if (!currentRequest) throw new Error("Request not found.");

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE purchase_requests SET
                pendingAction = @action,
                previousStatus = CASE WHEN @action != 'none' THEN status ELSE previousStatus END
            WHERE id = @entityId
        `).run({ action, entityId });
        
        const historyStmt = db.prepare('INSERT INTO purchase_request_history (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
        const historyNote = action === 'none' 
            ? 'Acción administrativa rechazada/cancelada' 
            : `Solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} iniciada`;
        historyStmt.run(entityId, new Date().toISOString(), currentRequest.status, updatedBy, `${historyNote}: ${notes}`);
    });
    
    transaction();
    const updatedRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(entityId) as any;
    return sanitizeRequest(updatedRequest);
}

export async function getErpOrderData(identifier: string | DateRange): Promise<{headers: ErpOrderHeader[], lines: ErpOrderLine[], inventory: StockInfo[]}> {
    const mainDb = await connectDb();
    
    let headers: ErpOrderHeader[] = [];

    if (typeof identifier === 'string') {
        logInfo("Buscando pedido ERP en DB local por número", { searchTerm: identifier });
        headers = mainDb.prepare('SELECT * FROM erp_order_headers WHERE PEDIDO LIKE ?').all(`%${identifier}%`) as ErpOrderHeader[];
    } else {
        const { from, to } = identifier;
        if (!from) throw new Error('Date "from" is required for range search.');
        
        const toDate = to || new Date();
        logInfo("Buscando pedidos ERP en DB local por rango de fecha", { from: from.toISOString(), to: toDate.toISOString() });
        headers = mainDb.prepare('SELECT * FROM erp_order_headers WHERE FECHA_PEDIDO BETWEEN ? AND ?').all(from.toISOString(), toDate.toISOString()) as ErpOrderHeader[];
    }

    if (headers.length === 0) {
        logWarn("No se encontraron pedidos ERP para el criterio", { identifier });
        return { headers: [], lines: [], inventory: [] };
    }

    const orderNumbers: string[] = headers.map(h => h.PEDIDO);
    const sanitizedOrderNumbers = orderNumbers.map(n => `'${n.replace(/'/g, "''")}'`).join(',');

    if (!sanitizedOrderNumbers) {
        return { headers, lines: [], inventory: [] };
    }

    const lines: ErpOrderLine[] = mainDb.prepare(`SELECT * FROM erp_order_lines WHERE PEDIDO IN (${sanitizedOrderNumbers})`).all() as ErpOrderLine[];
    
    if (lines.length === 0) {
         return { headers, lines: [], inventory: [] };
    }

    const itemIds = [...new Set(lines.map(line => line.ARTICULO))];
    const inventory: StockInfo[] = await (await connectDb()).prepare(`SELECT * FROM stock WHERE itemId IN (${itemIds.map(() => '?').join(',')})`).all(...itemIds) as StockInfo[];
    const relevantInventory = inventory.filter(inv => itemIds.includes(inv.itemId));

    return JSON.parse(JSON.stringify({ headers, lines, inventory: relevantInventory }));
}

export async function updateRequestDetails(payload: { requestId: number; priority: PurchaseRequestPriority, updatedBy: string }): Promise<PurchaseRequest> {
    const db = await connectDb(REQUESTS_DB_FILE);
    const { requestId, priority, updatedBy } = payload;
    
    const currentRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(requestId) as PurchaseRequest | undefined;
    if (!currentRequest) throw new Error("Request not found.");

    const transaction = db.transaction(() => {
        db.prepare('UPDATE purchase_requests SET priority = ? WHERE id = ?').run(priority, requestId);
        
        const historyNote = `Prioridad cambiada a: ${priority}`;
        const historyStmt = db.prepare('INSERT INTO purchase_request_history (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
        historyStmt.run(requestId, new Date().toISOString(), currentRequest.status, updatedBy, historyNote);
    });

    transaction();
    const updatedRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}

export async function getUserByName(name: string): Promise<User | null> {
    const users = await getAllUsersFromMain();
    return users.find(u => u.name === name) || null;
}

export async function getRolesWithPermission(permission: string): Promise<string[]> {
    const roles = await getAllRolesFromMain();
    return roles.filter(role => role.id === 'admin' || role.permissions.includes(permission)).map(role => role.id);
}

export async function addNote(payload: { requestId: number; notes: string; updatedBy: string; }): Promise<PurchaseRequest> {
    const db = await connectDb(REQUESTS_DB_FILE);
    const { requestId, notes, updatedBy } = payload;

    const currentRequest = db.prepare('SELECT status FROM purchase_requests WHERE id = ?').get(requestId) as PurchaseRequest | undefined;
    if (!currentRequest) {
        throw new Error("Request not found.");
    }

    db.prepare('INSERT INTO purchase_request_history (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)')
      .run(requestId, new Date().toISOString(), currentRequest.status, updatedBy, `Nota agregada: ${notes}`);

    const updatedRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}


export async function saveCostAnalysis(requestId: number, cost: number, salePrice: number): Promise<PurchaseRequest> {
    const db = await connectDb(REQUESTS_DB_FILE);
    
    if (cost <= 0) {
        throw new Error('El costo debe ser mayor a cero para calcular el margen.');
    }
    
    const margin = (salePrice - cost) / cost;
    const analysis = { cost, salePrice, margin };

    db.prepare(`UPDATE purchase_requests SET analysis = ?, unitSalePrice = ? WHERE id = ?`).run(JSON.stringify(analysis), salePrice, requestId);

    const updatedRequest = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}
