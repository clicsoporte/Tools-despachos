/**
 * @fileoverview Server-side functions for the planner database.
 */
"use server";

import { connectDb, getAllRoles as getAllRolesFromMain } from '../../core/lib/db';
import { getAllUsers as getAllUsersFromMain } from '../../core/lib/auth';
import type { ProductionOrder, PlannerSettings, UpdateStatusPayload, UpdateOrderDetailsPayload, ProductionOrderHistoryEntry, RejectCancellationPayload, ProductionOrderStatus, UpdateProductionOrderPayload, CustomStatus, DateRange, PlannerNotePayload, AdministrativeActionPayload, User, PlannerShift } from '../../core/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { logError } from '../../core/lib/logger';
import { getAllProducts } from '@/modules/core/lib/db';

const PLANNER_DB_FILE = 'planner.db';

export async function initializePlannerDb(db: import('better-sqlite3').Database) {
    const schema = `
        CREATE TABLE IF NOT EXISTS planner_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS production_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            consecutive TEXT UNIQUE NOT NULL,
            purchaseOrder TEXT,
            requestDate TEXT NOT NULL,
            deliveryDate TEXT NOT NULL,
            scheduledStartDate TEXT,
            scheduledEndDate TEXT,
            customerId TEXT NOT NULL,
            customerName TEXT NOT NULL,
            customerTaxId TEXT,
            productId TEXT NOT NULL,
            productDescription TEXT NOT NULL,
            quantity REAL NOT NULL,
            inventory REAL,
            inventoryErp REAL,
            priority TEXT NOT NULL,
            status TEXT NOT NULL,
            pendingAction TEXT DEFAULT 'none',
            notes TEXT,
            requestedBy TEXT NOT NULL,
            approvedBy TEXT,
            lastStatusUpdateBy TEXT,
            lastStatusUpdateNotes TEXT,
            lastModifiedBy TEXT,
            lastModifiedAt TEXT,
            hasBeenModified BOOLEAN DEFAULT FALSE,
            deliveredQuantity REAL,
            defectiveQuantity REAL,
            erpPackageNumber TEXT,
            erpTicketNumber TEXT,
            reopened BOOLEAN DEFAULT FALSE,
            machineId TEXT,
            shiftId TEXT,
            previousStatus TEXT,
            erpOrderNumber TEXT
        );
         CREATE TABLE IF NOT EXISTS production_order_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orderId INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            status TEXT NOT NULL,
            notes TEXT,
            updatedBy TEXT NOT NULL,
            FOREIGN KEY (orderId) REFERENCES production_orders(id)
        );
    `;
    db.exec(schema);

    const defaultCustomStatuses: CustomStatus[] = [
        { id: 'custom-1', label: '', color: '#8884d8', isActive: false },
        { id: 'custom-2', label: '', color: '#82ca9d', isActive: false },
        { id: 'custom-3', label: '', color: '#ffc658', isActive: false },
        { id: 'custom-4', label: '', color: '#ff8042', isActive: false },
    ];
    
    const defaultShifts: PlannerShift[] = [
        { id: 'turno-a', name: 'Turno A' },
        { id: 'turno-b', name: 'Turno B' },
    ]

    const defaultPdfColumns = ['consecutive', 'customerName', 'productDescription', 'quantity', 'deliveryDate', 'status'];

    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('orderPrefix', 'OP-')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('nextOrderNumber', '1')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('useWarehouseReception', 'false')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('showCustomerTaxId', 'true')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('machines', '[]')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('shifts', ?)`).run(JSON.stringify(defaultShifts));
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('requireMachineForStart', 'false')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('requireShiftForCompletion', 'false')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('assignmentLabel', 'Máquina Asignada')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('shiftLabel', 'Turno')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('customStatuses', ?)`).run(JSON.stringify(defaultCustomStatuses));
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('pdfPaperSize', 'letter')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('pdfOrientation', 'portrait')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('pdfExportColumns', ?)`).run(JSON.stringify(defaultPdfColumns));
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('pdfTopLegend', '')`).run();
    db.prepare(`INSERT OR IGNORE INTO planner_settings (key, value) VALUES ('fieldsToTrackChanges', '[]')`).run();
    
    console.log(`Database ${PLANNER_DB_FILE} initialized for Production Planner.`);
    await runPlannerMigrations(db);
}

export async function runPlannerMigrations(db: import('better-sqlite3').Database) {
    try {
        const plannerTableInfo = db.prepare(`PRAGMA table_info(production_orders)`).all() as { name: string }[];
        const plannerColumns = new Set(plannerTableInfo.map(c => c.name));
        
        if (!plannerColumns.has('deliveredQuantity')) db.exec(`ALTER TABLE production_orders ADD COLUMN deliveredQuantity REAL`);
        if (!plannerColumns.has('defectiveQuantity')) db.exec(`ALTER TABLE production_orders ADD COLUMN defectiveQuantity REAL`);
        if (!plannerColumns.has('purchaseOrder')) db.exec(`ALTER TABLE production_orders ADD COLUMN purchaseOrder TEXT`);
        if (!plannerColumns.has('scheduledStartDate')) db.exec(`ALTER TABLE production_orders ADD COLUMN scheduledStartDate TEXT`);
        if (!plannerColumns.has('scheduledEndDate')) db.exec(`ALTER TABLE production_orders ADD COLUMN scheduledEndDate TEXT`);
        if (!plannerColumns.has('lastModifiedBy')) db.exec(`ALTER TABLE production_orders ADD COLUMN lastModifiedBy TEXT`);
        if (!plannerColumns.has('lastModifiedAt')) db.exec(`ALTER TABLE production_orders ADD COLUMN lastModifiedAt TEXT`);
        if (!plannerColumns.has('hasBeenModified')) db.exec(`ALTER TABLE production_orders ADD COLUMN hasBeenModified BOOLEAN DEFAULT FALSE`);
        if (!plannerColumns.has('previousStatus')) db.exec(`ALTER TABLE production_orders ADD COLUMN previousStatus TEXT`);
        if (!plannerColumns.has('pendingAction')) db.exec(`ALTER TABLE production_orders ADD COLUMN pendingAction TEXT DEFAULT 'none'`);
        if (!plannerColumns.has('inventoryErp')) db.exec(`ALTER TABLE production_orders ADD COLUMN inventoryErp REAL`);
        if (!plannerColumns.has('customerTaxId')) db.exec(`ALTER TABLE production_orders ADD COLUMN customerTaxId TEXT`);
        if (!plannerColumns.has('shiftId')) db.exec(`ALTER TABLE production_orders ADD COLUMN shiftId TEXT`);
        if (!plannerColumns.has('erpOrderNumber')) db.exec(`ALTER TABLE production_orders ADD COLUMN erpOrderNumber TEXT`);
        

        const historyTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='production_order_history'`).get();
        if (!historyTable) {
            console.log("MIGRATION (planner.db): Creating production_order_history table.");
            db.exec(`
                CREATE TABLE IF NOT EXISTS production_order_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    orderId INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    status TEXT NOT NULL,
                    notes TEXT,
                    updatedBy TEXT NOT NULL,
                    FOREIGN KEY (orderId) REFERENCES production_orders(id)
                );
            `);
        }

        const settingsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='planner_settings'`).get();
        if (settingsTable) {
            if (!db.prepare(`SELECT key FROM planner_settings WHERE key = 'orderPrefix'`).get()) {
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('orderPrefix', 'OP-')`).run();
            }
            if (!db.prepare(`SELECT key FROM planner_settings WHERE key = 'nextOrderNumber'`).get()) {
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('nextOrderNumber', '1')`).run();
            }
            const customStatusesRow = db.prepare(`SELECT value FROM planner_settings WHERE key = 'customStatuses'`).get() as { value: string } | undefined;
            if (!customStatusesRow) {
                console.log("MIGRATION (planner.db): Adding customStatuses to settings.");
                const defaultCustomStatuses: CustomStatus[] = [
                    { id: 'custom-1', label: '', color: '#8884d8', isActive: false },
                    { id: 'custom-2', label: '', color: '#82ca9d', isActive: false },
                    { id: 'custom-3', label: '', color: '#ffc658', isActive: false },
                    { id: 'custom-4', label: '', color: '#ff8042', isActive: false },
                ];
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('customStatuses', ?)`).run(JSON.stringify(defaultCustomStatuses));
            }

            const pdfPaperSizeRow = db.prepare(`SELECT value FROM planner_settings WHERE key = 'pdfPaperSize'`).get() as { value: string } | undefined;
            if (!pdfPaperSizeRow) {
                console.log("MIGRATION (planner.db): Adding pdfPaperSize and pdfOrientation to settings.");
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('pdfPaperSize', 'letter')`).run();
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('pdfOrientation', 'portrait')`).run();
            }

            const pdfExportColumnsRow = db.prepare(`SELECT value FROM planner_settings WHERE key = 'pdfExportColumns'`).get() as { value: string } | undefined;
            if (!pdfExportColumnsRow) {
                console.log("MIGRATION (planner.db): Adding pdfExportColumns to settings.");
                const defaultColumns = ['consecutive', 'customerName', 'productDescription', 'quantity', 'deliveryDate', 'status'];
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('pdfExportColumns', ?)`).run(JSON.stringify(defaultColumns));
            }

            const pdfTopLegendRow = db.prepare(`SELECT value FROM planner_settings WHERE key = 'pdfTopLegend'`).get() as { value: string } | undefined;
            if (!pdfTopLegendRow) {
                console.log("MIGRATION (planner.db): Adding pdfTopLegend to settings.");
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('pdfTopLegend', '')`).run();
            }

            const fieldsToTrackRow = db.prepare(`SELECT value FROM planner_settings WHERE key = 'fieldsToTrackChanges'`).get() as { value: string } | undefined;
            if (!fieldsToTrackRow) {
                console.log("MIGRATION (planner.db): Adding fieldsToTrackChanges to settings.");
                const defaultFields = ['quantity', 'deliveryDate', 'customerId', 'productId'];
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('fieldsToTrackChanges', ?)`).run(JSON.stringify(defaultFields));
            }
            
            if (!db.prepare(`SELECT key FROM planner_settings WHERE key = 'showCustomerTaxId'`).get()) {
                console.log("MIGRATION (planner.db): Adding showCustomerTaxId to settings.");
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('showCustomerTaxId', 'true')`).run();
            }
            if (!db.prepare(`SELECT key FROM planner_settings WHERE key = 'shifts'`).get()) {
                console.log("MIGRATION (planner.db): Adding shifts to settings.");
                const defaultShifts: PlannerShift[] = [
                    { id: 'turno-a', name: 'Turno A' },
                    { id: 'turno-b', name: 'Turno B' },
                ]
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('shifts', ?)`).run(JSON.stringify(defaultShifts));
            }
            if (!db.prepare(`SELECT key FROM planner_settings WHERE key = 'requireShiftForCompletion'`).get()) {
                console.log("MIGRATION (planner.db): Adding requireShiftForCompletion to settings.");
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('requireShiftForCompletion', 'false')`).run();
            }
            if (!db.prepare(`SELECT key FROM planner_settings WHERE key = 'shiftLabel'`).get()) {
                console.log("MIGRATION (planner.db): Adding shiftLabel to settings.");
                db.prepare(`INSERT INTO planner_settings (key, value) VALUES ('shiftLabel', 'Turno')`).run();
            }
        }
    } catch (error) {
        console.error("Error during planner migrations:", error);
    }
}


export async function getPlannerSettings(): Promise<PlannerSettings> {
    const db = await connectDb(PLANNER_DB_FILE);
    const settingsRows = db.prepare('SELECT * FROM planner_settings').all() as { key: string; value: string }[];
    
    const settings: PlannerSettings = {
        orderPrefix: 'OP-',
        nextOrderNumber: 1,
        useWarehouseReception: false,
        showCustomerTaxId: true,
        machines: [],
        shifts: [],
        requireMachineForStart: false,
        requireShiftForCompletion: false,
        assignmentLabel: 'Máquina Asignada',
        shiftLabel: 'Turno',
        customStatuses: [],
        pdfPaperSize: 'letter',
        pdfOrientation: 'portrait',
        pdfExportColumns: [],
        pdfTopLegend: '',
        fieldsToTrackChanges: [],
    };

    for (const row of settingsRows) {
        if (row.key === 'nextOrderNumber') settings.nextOrderNumber = Number(row.value);
        else if (row.key === 'orderPrefix') settings.orderPrefix = row.value;
        else if (row.key === 'useWarehouseReception') settings.useWarehouseReception = row.value === 'true';
        else if (row.key === 'showCustomerTaxId') settings.showCustomerTaxId = row.value === 'true';
        else if (row.key === 'machines') settings.machines = JSON.parse(row.value);
        else if (row.key === 'shifts') settings.shifts = JSON.parse(row.value);
        else if (row.key === 'requireMachineForStart') settings.requireMachineForStart = row.value === 'true';
        else if (row.key === 'requireShiftForCompletion') settings.requireShiftForCompletion = row.value === 'true';
        else if (row.key === 'assignmentLabel') settings.assignmentLabel = row.value;
        else if (row.key === 'shiftLabel') settings.shiftLabel = row.value;
        else if (row.key === 'customStatuses') settings.customStatuses = JSON.parse(row.value);
        else if (row.key === 'pdfPaperSize') settings.pdfPaperSize = row.value as 'letter' | 'legal';
        else if (row.key === 'pdfOrientation') settings.pdfOrientation = row.value as 'portrait' | 'landscape';
        else if (row.key === 'pdfExportColumns') settings.pdfExportColumns = JSON.parse(row.value);
        else if (row.key === 'pdfTopLegend') settings.pdfTopLegend = row.value;
        else if (row.key === 'fieldsToTrackChanges') settings.fieldsToTrackChanges = JSON.parse(row.value);
    }
    return settings;
}

export async function saveSettings(settings: PlannerSettings): Promise<void> {
    const db = await connectDb(PLANNER_DB_FILE);
    
    const transaction = db.transaction((settingsToUpdate) => {
        const keys: (keyof PlannerSettings)[] = ['orderPrefix', 'nextOrderNumber', 'useWarehouseReception', 'showCustomerTaxId', 'machines', 'shifts', 'requireMachineForStart', 'requireShiftForCompletion', 'assignmentLabel', 'shiftLabel', 'customStatuses', 'pdfPaperSize', 'pdfOrientation', 'pdfExportColumns', 'pdfTopLegend', 'fieldsToTrackChanges'];
        for (const key of keys) {
            if (settingsToUpdate[key] !== undefined) {
                const value = typeof settingsToUpdate[key] === 'object' ? JSON.stringify(settingsToUpdate[key]) : String(settingsToUpdate[key]);
                db.prepare('INSERT OR REPLACE INTO planner_settings (key, value) VALUES (?, ?)').run(key, value);
            }
        }
    });

    transaction(settings);
}


export async function getOrders(options: {
    page: number;
    pageSize: number;
    isArchived: boolean;
    filters: {
        searchTerm?: string;
        status?: string[];
        classification?: string[];
        showOnlyMy?: string;
        dateRange?: DateRange;
    };
}): Promise<{ activeOrders: ProductionOrder[]; archivedOrders: ProductionOrder[]; totalActiveCount: number; totalArchivedCount: number; }> {
    const db = await connectDb(PLANNER_DB_FILE);
    const { page, pageSize, isArchived, filters } = options;

    const settings = await getPlannerSettings();
    const finalStatus = settings.useWarehouseReception ? 'received-in-warehouse' : 'completed';
    const archivedStatuses = [`'${finalStatus}'`, `'canceled'`];

    const buildQueryParts = async (isArchivedQuery: boolean) => {
        let whereClauses: string[] = [];
        let queryParams: any[] = [];
        
        if (isArchivedQuery) {
            whereClauses.push(`po.status IN (${archivedStatuses.join(',')})`);
        } else {
            whereClauses.push(`po.status NOT IN (${archivedStatuses.join(',')})`);
        }

        if (filters.searchTerm) {
            whereClauses.push(`(po.consecutive LIKE ? OR po.customerName LIKE ? OR po.productDescription LIKE ? OR po.productId LIKE ?)`);
            const searchTermParam = `%${filters.searchTerm}%`;
            queryParams.push(searchTermParam, searchTermParam, searchTermParam, searchTermParam);
        }

        if (filters.status && filters.status.length > 0) {
            whereClauses.push(`po.status IN (${filters.status.map(() => '?').join(',')})`);
            queryParams.push(...filters.status);
        }
        
        if (filters.showOnlyMy) {
            whereClauses.push(`po.requestedBy = ?`);
            queryParams.push(filters.showOnlyMy);
        }

        if (filters.dateRange?.from) {
            whereClauses.push("po.requestDate >= ?");
            queryParams.push(filters.dateRange.from.toISOString());
        }
        if (filters.dateRange?.to) {
            const toDate = new Date(filters.dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            whereClauses.push("po.requestDate <= ?");
            queryParams.push(toDate.toISOString());
        }

        let fromClause = 'production_orders po';
        if (filters.classification && filters.classification.length > 0) {
            // This requires a temporary connection to the main DB to get product info
            // This is not ideal but necessary for filtering across DBs
            const mainDb = await connectDb();
            const productIds = mainDb.prepare(`SELECT id FROM products WHERE classification IN (${filters.classification.map(() => '?').join(',')})`).all(...filters.classification).map((p: any) => p.id);
            if (productIds.length > 0) {
                whereClauses.push(`po.productId IN (${productIds.map(() => '?').join(',')})`);
                queryParams.push(...productIds);
            } else {
                // If no products match the classification, return no results
                whereClauses.push('1 = 0');
            }
        }


        return { whereClause: whereClauses.join(' AND '), params: queryParams, fromClause };
    };

    const activeQueryParts = await buildQueryParts(false);
    const archivedQueryParts = await buildQueryParts(true);

    const totalActiveCount = (db.prepare(`SELECT COUNT(*) as count FROM ${activeQueryParts.fromClause} WHERE ${activeQueryParts.whereClause}`).get(...activeQueryParts.params) as { count: number }).count;
    const totalArchivedCount = (db.prepare(`SELECT COUNT(*) as count FROM ${archivedQueryParts.fromClause} WHERE ${archivedQueryParts.whereClause}`).get(...archivedQueryParts.params) as { count: number }).count;
    
    const targetQueryParts = isArchived ? archivedQueryParts : activeQueryParts;
    let finalQuery = `SELECT * FROM ${targetQueryParts.fromClause} WHERE ${targetQueryParts.whereClause} ORDER BY requestDate DESC LIMIT ? OFFSET ?`;
    let finalParams = [...targetQueryParts.params, pageSize, page * pageSize];
    
    const ordersRaw = db.prepare(finalQuery).all(...finalParams) as any[];
    const orders = ordersRaw.map(o => JSON.parse(JSON.stringify(o)));
    
    return {
        activeOrders: !isArchived ? orders : [],
        archivedOrders: isArchived ? orders : [],
        totalActiveCount,
        totalArchivedCount,
    };
}


export async function addOrder(order: Omit<ProductionOrder, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'erpPackageNumber' | 'erpTicketNumber' | 'machineId' | 'previousStatus' | 'scheduledStartDate' | 'scheduledEndDate' | 'requestedBy' | 'hasBeenModified' | 'lastModifiedBy' | 'lastModifiedAt' | 'shiftId'>, requestedBy: string): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    
    const settings = await getPlannerSettings();
    const nextNumber = settings.nextOrderNumber || 1;
    const prefix = settings.orderPrefix || 'OP-';

    const newOrder: Omit<ProductionOrder, 'id'> = {
        ...order,
        requestedBy: requestedBy,
        consecutive: `${prefix}${nextNumber.toString().padStart(5, '0')}`,
        requestDate: new Date().toISOString(),
        status: 'pending',
        reopened: false,
    };
    
    const preparedOrder = {
        ...newOrder,
        purchaseOrder: newOrder.purchaseOrder || null,
        notes: newOrder.notes || null,
        inventory: newOrder.inventory ?? null,
        inventoryErp: newOrder.inventoryErp ?? null,
        reopened: newOrder.reopened ? 1 : 0,
        customerTaxId: newOrder.customerTaxId || null,
    };

    try {
        const transaction = db.transaction(() => {
            const insertStmt = db.prepare(`
                INSERT INTO production_orders (
                    consecutive, requestDate, deliveryDate, customerId, customerName, customerTaxId,
                    productId, productDescription, quantity, priority, status, pendingAction, notes,
                    requestedBy, inventory, inventoryErp, purchaseOrder
                ) VALUES (
                    @consecutive, @requestDate, @deliveryDate, @customerId, @customerName, @customerTaxId,
                    @productId, @productDescription, @quantity, @priority, @status, @pendingAction, @notes,
                    @requestedBy, @inventory, @inventoryErp, @purchaseOrder
                )
            `);
            
            const info = insertStmt.run(preparedOrder);
            const newOrderId = info.lastInsertRowid as number;

            db.prepare(`UPDATE planner_settings SET value = ? WHERE key = 'nextOrderNumber'`).run(nextNumber + 1);
            
            const historyStmt = db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
            historyStmt.run(newOrderId, new Date().toISOString(), 'pending', newOrder.requestedBy, 'Orden creada');
            
            return newOrderId;
        });

        const newId = transaction();
        const createdOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(newId) as ProductionOrder;
        return createdOrder;
    } catch (error: any) {
        logError("Failed to create order in DB", { context: 'addOrder DB transaction', error: error.message, details: preparedOrder });
        throw error;
    }
}

export async function updateOrder(payload: UpdateProductionOrderPayload): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    const { orderId, updatedBy, ...dataToUpdate } = payload;
    
    const currentOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder | undefined;
    if (!currentOrder) {
        throw new Error("Order not found.");
    }
    
    let hasBeenModified = currentOrder.hasBeenModified;
    if (['approved', 'in-queue', 'in-progress'].includes(currentOrder.status)) {
        hasBeenModified = true;
    }

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE production_orders SET
                deliveryDate = @deliveryDate,
                customerId = @customerId,
                customerName = @customerName,
                customerTaxId = @customerTaxId,
                productId = @productId,
                productDescription = @productDescription,
                quantity = @quantity,
                inventory = @inventory,
                notes = @notes,
                purchaseOrder = @purchaseOrder,
                lastModifiedBy = @updatedBy,
                lastModifiedAt = @lastModifiedAt,
                hasBeenModified = @hasBeenModified
            WHERE id = @orderId
        `).run({ 
            orderId, 
            ...dataToUpdate,
            updatedBy,
            lastModifiedAt: new Date().toISOString(),
            hasBeenModified: hasBeenModified ? 1 : 0
        });

        if (hasBeenModified) {
            const historyStmt = db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
            historyStmt.run(orderId, new Date().toISOString(), currentOrder.status, updatedBy, 'Orden editada después de aprobación.');
        }
    });

    transaction();
    const updatedOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder;
    return updatedOrder;
}

export async function confirmModification(orderId: number, updatedBy: string): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    
    const currentOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder | undefined;
    if (!currentOrder) throw new Error("Order not found.");

    const transaction = db.transaction(() => {
        db.prepare('UPDATE production_orders SET hasBeenModified = 0, lastModifiedBy = ?, lastModifiedAt = ? WHERE id = ?').run(updatedBy, new Date().toISOString(), orderId);
        
        const historyStmt = db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
        historyStmt.run(orderId, new Date().toISOString(), currentOrder.status, updatedBy, 'Modificación confirmada y alerta eliminada.');
    });

    transaction();
    return db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder;
}

export async function updateStatus(payload: UpdateStatusPayload): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    const { orderId, status, notes, updatedBy, reopen, deliveredQuantity, defectiveQuantity, erpPackageNumber, erpTicketNumber } = payload;

    const currentOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder | undefined;
    if (!currentOrder) throw new Error("Order not found.");
    
    let approvedBy = currentOrder.approvedBy;
    if (status === 'approved' && !currentOrder.approvedBy) {
        approvedBy = updatedBy;
    }

    let previousStatus = currentOrder.previousStatus;
    if (status === 'pending' || status === 'pending-review') {
        previousStatus = currentOrder.status;
    } else {
        previousStatus = null;
    }

    const transaction = db.transaction(() => {
        const stmt = db.prepare(`
            UPDATE production_orders SET
                status = @status,
                lastStatusUpdateNotes = @notes,
                lastStatusUpdateBy = @updatedBy,
                approvedBy = @approvedBy,
                reopened = @reopened,
                deliveredQuantity = @deliveredQuantity,
                defectiveQuantity = @defectiveQuantity,
                erpPackageNumber = @erpPackageNumber,
                erpTicketNumber = @erpTicketNumber,
                previousStatus = @previousStatus,
                pendingAction = 'none',
                hasBeenModified = CASE WHEN @reopen = 1 THEN 0 ELSE hasBeenModified END
            WHERE id = @orderId
        `);

        stmt.run({
            status,
            notes: notes || null,
            updatedBy,
            approvedBy,
            orderId,
            reopened: reopen ? 1 : (currentOrder.reopened ? 1 : 0),
            deliveredQuantity: deliveredQuantity !== undefined ? deliveredQuantity : currentOrder.deliveredQuantity,
            defectiveQuantity: defectiveQuantity !== undefined ? defectiveQuantity : currentOrder.defectiveQuantity,
            erpPackageNumber: erpPackageNumber !== undefined ? erpPackageNumber : currentOrder.erpPackageNumber,
            erpTicketNumber: erpTicketNumber !== undefined ? erpTicketNumber : currentOrder.erpTicketNumber,
            previousStatus,
        });
        
        const historyStmt = db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
        historyStmt.run(orderId, new Date().toISOString(), status, updatedBy, notes);
    });

    transaction();
    const updatedOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder;
    return updatedOrder;
}

export async function updateDetails(payload: UpdateOrderDetailsPayload): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    const { orderId, updatedBy, priority, machineId, scheduledDateRange, shiftId } = payload;
    
    const transaction = db.transaction(() => {
        if (priority) {
            db.prepare('UPDATE production_orders SET priority = ? WHERE id = ?').run(priority, orderId);
        }
        if (machineId !== undefined) {
             db.prepare('UPDATE production_orders SET machineId = ? WHERE id = ?').run(machineId, orderId);
        }
        if (shiftId !== undefined) {
             db.prepare('UPDATE production_orders SET shiftId = ? WHERE id = ?').run(shiftId, orderId);
        }
        if (scheduledDateRange) {
             db.prepare('UPDATE production_orders SET scheduledStartDate = ?, scheduledEndDate = ? WHERE id = ?').run(
                scheduledDateRange.from?.toISOString(), 
                scheduledDateRange.to?.toISOString(), 
                orderId
            );
        }
    });

    transaction();
    const updatedOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder;
    return updatedOrder;
}

export async function getOrderHistory(orderId: number): Promise<ProductionOrderHistoryEntry[]> {
    const db = await connectDb(PLANNER_DB_FILE);
    return db.prepare('SELECT * FROM production_order_history WHERE orderId = ? ORDER BY timestamp DESC').all(orderId) as ProductionOrderHistoryEntry[];
}

export async function addNote(payload: PlannerNotePayload): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    const { orderId, notes, updatedBy } = payload;
    const currentOrder = db.prepare('SELECT status FROM production_orders WHERE id = ?').get(orderId) as { status: ProductionOrderStatus };

    if (!currentOrder) throw new Error("Order not found");

    db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)')
      .run(orderId, new Date().toISOString(), currentOrder.status, updatedBy, `Nota agregada: ${notes}`);

    return db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder;
}

export async function updatePendingAction(payload: AdministrativeActionPayload): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    const { entityId, action, notes, updatedBy } = payload;

    const currentOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(entityId) as ProductionOrder | undefined;
    if (!currentOrder) throw new Error("Order not found.");

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE production_orders SET
                pendingAction = @action,
                previousStatus = CASE WHEN @action != 'none' THEN status ELSE previousStatus END
            WHERE id = @entityId
        `).run({ action, entityId });
        
        const historyStmt = db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
        const historyNote = action === 'none' 
            ? 'Acción administrativa rechazada/cancelada' 
            : `Solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} iniciada`;
        historyStmt.run(entityId, new Date().toISOString(), currentOrder.status, updatedBy, `${historyNote}: ${notes}`);
    });
    
    transaction();
    const updatedOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(entityId) as ProductionOrder;
    return updatedOrder;
}

export async function getUserByName(name: string): Promise<User | null> {
    const users = await getAllUsersFromMain();
    return users.find(u => u.name === name) || null;
}

export async function getRolesWithPermission(permission: string): Promise<string[]> {
    const roles = await getAllRolesFromMain();
    return roles.filter(role => role.id === 'admin' || role.permissions.includes(permission)).map(role => role.id);
}

export async function getCompletedOrdersByDateRange(dateRange: DateRange): Promise<(ProductionOrder & { history: ProductionOrderHistoryEntry[] })[]> {
    const db = await connectDb(PLANNER_DB_FILE);
    if (!dateRange.from) {
        throw new Error("Date 'from' is required.");
    }
    const toDate = dateRange.to || new Date();
    toDate.setHours(23, 59, 59, 999);

    const finalStatuses = ['completed', 'received-in-warehouse'];
    const finalStatusPlaceholders = finalStatuses.map(() => '?').join(',');
    
    const completedOrders = db.prepare(`
        SELECT DISTINCT p.* 
        FROM production_orders p
        JOIN production_order_history h ON p.id = h.orderId
        WHERE h.status IN (${finalStatusPlaceholders})
        AND h.timestamp BETWEEN ? AND ?
    `).all(...finalStatuses, dateRange.from.toISOString(), toDate.toISOString()) as ProductionOrder[];

    if (completedOrders.length === 0) {
        return [];
    }

    const orderIds = completedOrders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    const allHistory = db.prepare(`
        SELECT * FROM production_order_history WHERE orderId IN (${placeholders}) ORDER BY timestamp ASC
    `).all(...orderIds) as ProductionOrderHistoryEntry[];

    const historyMap = new Map<number, ProductionOrderHistoryEntry[]>();
    allHistory.forEach(h => {
        if (!historyMap.has(h.orderId)) {
            historyMap.set(h.orderId, []);
        }
        historyMap.get(h.orderId)!.push(h);
    });

    const result = completedOrders.map(order => ({
        ...order,
        history: historyMap.get(order.id) || []
    }));

    return JSON.parse(JSON.stringify(result));
}
