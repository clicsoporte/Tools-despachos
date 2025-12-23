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
    page?: number; 
    pageSize?: number;
}): Promise<{ activeOrders: ProductionOrder[], archivedOrders: ProductionOrder[], totalArchivedCount: number }> {
    const db = await connectDb(PLANNER_DB_FILE);
    
    const { page = 0, pageSize = 50 } = options;
    const settings = await getPlannerSettings();
    const finalStatus = settings.useWarehouseReception ? 'received-in-warehouse' : 'completed';
    const archivedStatuses = `'${finalStatus}', 'canceled'`;

    // Fetch all active orders
    const activeOrders: ProductionOrder[] = db.prepare(`
        SELECT * FROM production_orders 
        WHERE status NOT IN (${archivedStatuses}) 
        ORDER BY requestDate DESC
    `).all() as ProductionOrder[];
    
    // Fetch paginated archived orders
    const archivedOrders: ProductionOrder[] = db.prepare(`
        SELECT * FROM production_orders 
        WHERE status IN (${archivedStatuses}) 
        ORDER BY requestDate DESC 
        LIMIT ? OFFSET ?
    `).all(pageSize, page * pageSize) as ProductionOrder[];
        
    const totalArchivedCount = (db.prepare(`
        SELECT COUNT(*) as count 
        FROM production_orders 
        WHERE status IN (${archivedStatuses})
    `).get() as { count: number }).count;

    return { activeOrders, archivedOrders, totalArchivedCount };
}


export async function addOrder(order: Omit<ProductionOrder, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'erpPackageNumber' | 'erpTicketNumber' | 'machineId' | 'previousStatus' | 'scheduledStartDate' | 'scheduledEndDate' | 'requestedBy' | 'hasBeenModified' | 'lastModifiedBy' | 'lastModifiedAt' | 'shiftId'>, requestedBy: string): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    
    const transaction = db.transaction(() => {
        // --- ATOMIC OPERATION START ---
        const settings = db.prepare('SELECT value FROM planner_settings WHERE key = ?').get('nextOrderNumber') as { value: string };
        const prefix = (db.prepare('SELECT value FROM planner_settings WHERE key = ?').get('orderPrefix') as { value: string }).value;
        const nextNumber = parseInt(settings.value, 10);
        
        db.prepare('UPDATE planner_settings SET value = ? WHERE key = ?').run(String(nextNumber + 1), 'nextOrderNumber');
        // --- ATOMIC OPERATION END ---

        const newOrder: Omit<ProductionOrder, 'id'> = {
            ...order,
            requestedBy: requestedBy,
            consecutive: `${prefix}${nextNumber.toString().padStart(5, '0')}`,
            requestDate: new Date().toISOString(),
            status: 'pending',
            pendingAction: 'none',
            reopened: false,
            machineId: null,
            shiftId: null,
            previousStatus: null,
            scheduledStartDate: null,
            scheduledEndDate: null,
            hasBeenModified: false,
        };

        const stmt = db.prepare(`
            INSERT INTO production_orders (
                consecutive, purchaseOrder, requestDate, deliveryDate, scheduledStartDate, scheduledEndDate,
                customerId, customerName, customerTaxId, productId, productDescription, quantity, inventory, inventoryErp, priority,
                status, pendingAction, notes, requestedBy, reopened, machineId, shiftId, previousStatus, hasBeenModified, erpOrderNumber
            ) VALUES (
                @consecutive, @purchaseOrder, @requestDate, @deliveryDate, @scheduledStartDate, @scheduledEndDate,
                @customerId, @customerName, @customerTaxId, @productId, @productDescription, @quantity, @inventory, @inventoryErp, @priority,
                @status, @pendingAction, @notes, @requestedBy, @reopened, @machineId, @shiftId, @previousStatus, @hasBeenModified, @erpOrderNumber
            )
        `);

        const preparedOrder = {
            ...newOrder,
            purchaseOrder: newOrder.purchaseOrder || null,
            inventory: newOrder.inventory ?? null,
            inventoryErp: newOrder.inventoryErp ?? null,
            notes: newOrder.notes || null,
            reopened: newOrder.reopened ? 1 : 0,
            hasBeenModified: newOrder.hasBeenModified ? 1 : 0,
            shiftId: newOrder.shiftId || null,
            erpOrderNumber: newOrder.erpOrderNumber || null,
        };

        const info = stmt.run(preparedOrder);
        const newOrderId = info.lastInsertRowid as number;

        const historyStmt = db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
        historyStmt.run(newOrderId, new Date().toISOString(), 'pending', newOrder.requestedBy, 'Orden creada');

        return db.prepare('SELECT * FROM production_orders WHERE id = ?').get(newOrderId) as ProductionOrder;
    });

    try {
        const createdOrder = transaction();
        return createdOrder;
    } catch (error: any) {
        logError("Failed to create order in DB transaction", { error: (error as Error).message });
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
    const settings = await getPlannerSettings();
    const fieldsToTrack = settings.fieldsToTrackChanges || [];

    let hasBeenModified = currentOrder.hasBeenModified;
    const changes: string[] = [];
    
    if (currentOrder.status !== 'pending') {
        const checkChange = (field: keyof typeof dataToUpdate, label: string) => {
            if (fieldsToTrack.includes(field) && dataToUpdate[field] !== undefined && String(currentOrder[field as keyof ProductionOrder] || '') !== String(dataToUpdate[field] || '')) {
                changes.push(`${label}: de '${currentOrder[field as keyof ProductionOrder] || 'N/A'}' a '${dataToUpdate[field] || 'N/A'}'`);
                hasBeenModified = true;
            }
        };

        checkChange('quantity', 'Cantidad');
        checkChange('deliveryDate', 'Fecha Entrega');
        checkChange('purchaseOrder', 'Nº OC');
        checkChange('notes', 'Notas');
        checkChange('customerId', 'Cliente');
        checkChange('productId', 'Producto');
    }

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE production_orders SET
                deliveryDate = @deliveryDate,
                customerId = @customerId,
                customerName = @customerName,
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
            ...dataToUpdate,
            orderId, 
            updatedBy, 
            lastModifiedAt: new Date().toISOString(), 
            hasBeenModified: hasBeenModified ? 1 : 0 
        });

        if (changes.length > 0) {
            const historyNotes = `Orden editada. ${changes.join('. ')}`;
            const historyStmt = db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
            historyStmt.run(orderId, new Date().toISOString(), currentOrder.status, updatedBy, historyNotes);
        }
    });

    transaction();
    
    const updatedOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder;
    return updatedOrder;
}

export async function confirmModification(orderId: number, updatedBy: string): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    db.prepare('UPDATE production_orders SET hasBeenModified = 0, lastModifiedBy = ?, lastModifiedAt = ? WHERE id = ?')
      .run(updatedBy, new Date().toISOString(), orderId);
    
    const currentStatus = (db.prepare('SELECT status FROM production_orders WHERE id = ?').get(orderId) as {status: string}).status;
    
    db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)')
      .run(orderId, new Date().toISOString(), currentStatus, updatedBy, 'Modificación confirmada y alerta eliminada.');
      
    const updatedOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder;
    return updatedOrder;
}


export async function updateStatus(payload: UpdateStatusPayload): Promise<ProductionOrder> {
    const db = await connectDb(PLANNER_DB_FILE);
    const { orderId, status, notes, updatedBy, deliveredQuantity, defectiveQuantity, erpPackageNumber, erpTicketNumber, reopen } = payload;

    const currentOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder | undefined;
    if (!currentOrder) {
        throw new Error("Order not found.");
    }
    
    let approvedBy = currentOrder.approvedBy;
    if (status === 'approved' && !currentOrder.approvedBy) {
        approvedBy = updatedBy;
    }
    
    const transaction = db.transaction(() => {
        const stmt = db.prepare(`
            UPDATE production_orders SET
                status = @status,
                lastStatusUpdateNotes = @notes,
                lastStatusUpdateBy = @updatedBy,
                approvedBy = @approvedBy,
                deliveredQuantity = @deliveredQuantity,
                defectiveQuantity = @defectiveQuantity,
                erpPackageNumber = @erpPackageNumber,
                erpTicketNumber = @erpTicketNumber,
                reopened = @reopened,
                pendingAction = 'none',
                previousStatus = NULL
            WHERE id = @orderId
        `);

        stmt.run({
            status,
            notes: notes || null,
            updatedBy,
            approvedBy,
            orderId,
            deliveredQuantity: deliveredQuantity !== undefined ? deliveredQuantity : currentOrder.deliveredQuantity,
            defectiveQuantity: defectiveQuantity !== undefined ? defectiveQuantity : currentOrder.defectiveQuantity,
            erpPackageNumber: erpPackageNumber !== undefined ? erpPackageNumber : currentOrder.erpPackageNumber,
            erpTicketNumber: erpTicketNumber !== undefined ? erpTicketNumber : currentOrder.erpTicketNumber,
            reopened: reopen ? 1 : (currentOrder.reopened ? 1 : 0),
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
    const { orderId, priority, machineId, shiftId, scheduledDateRange, updatedBy } = payload;
    
    const currentOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder | undefined;
    if (!currentOrder) throw new Error("Order not found.");

    let query = 'UPDATE production_orders SET';
    const params: any = { orderId };
    const updates: string[] = [];
    const historyItems: string[] = [];

    if (priority && currentOrder.priority !== priority) {
        updates.push('priority = @priority');
        params.priority = priority;
        historyItems.push(`Prioridad: de ${currentOrder.priority} a ${priority}`);
    }
    if (machineId !== undefined && currentOrder.machineId !== machineId) {
        const settings = await getPlannerSettings();
        const oldMachineName = currentOrder.machineId ? settings.machines.find(m => m.id === currentOrder.machineId)?.name : 'N/A';
        const newMachineName = machineId ? settings.machines.find(m => m.id === machineId)?.name : 'N/A';
        updates.push('machineId = @machineId');
        params.machineId = machineId;
        historyItems.push(`${settings.assignmentLabel || 'Máquina'}: de ${oldMachineName} a ${newMachineName}`);
    }
    if (shiftId !== undefined && currentOrder.shiftId !== shiftId) {
        const settings = await getPlannerSettings();
        const oldShiftName = currentOrder.shiftId ? settings.shifts.find(s => s.id === currentOrder.shiftId)?.name : 'N/A';
        const newShiftName = shiftId ? settings.shifts.find(s => s.id === shiftId)?.name : 'N/A';
        updates.push('shiftId = @shiftId');
        params.shiftId = shiftId;
        historyItems.push(`${settings.shiftLabel || 'Turno'}: de ${oldShiftName} a ${newShiftName}`);
    }
     if (scheduledDateRange) {
        const newStartDate = scheduledDateRange.from ? scheduledDateRange.from.toISOString().split('T')[0] : null;
        const newEndDate = scheduledDateRange.to ? scheduledDateRange.to.toISOString().split('T')[0] : null;
        if (currentOrder.scheduledStartDate !== newStartDate || currentOrder.scheduledEndDate !== newEndDate) {
            updates.push('scheduledStartDate = @scheduledStartDate', 'scheduledEndDate = @scheduledEndDate');
            params.scheduledStartDate = newStartDate;
            params.scheduledEndDate = newEndDate;
            
            const oldStart = currentOrder.scheduledStartDate ? format(parseISO(currentOrder.scheduledStartDate), 'dd/MM/yy') : 'N/A';
            const oldEnd = currentOrder.scheduledEndDate ? format(parseISO(currentOrder.scheduledEndDate), 'dd/MM/yy') : 'N/A';
            const newStart = newStartDate ? format(parseISO(newStartDate), 'dd/MM/yy') : 'N/A';
            const newEnd = newEndDate ? format(parseISO(newEndDate), 'dd/MM/yy') : 'N/A';
            historyItems.push(`Fecha Prog.: de ${oldStart}-${oldEnd} a ${newStart}-${newEnd}`);
        }
    }
    
    if (updates.length === 0) {
        const orderWithoutChanges = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder;
        return orderWithoutChanges;
    };

    query += ` ${updates.join(', ')} WHERE id = @orderId`;
    const historyNotes = `Detalles actualizados: ${historyItems.join('. ')}`;
    
    const transaction = db.transaction(() => {
        db.prepare(query).run(params);
        
        const historyStmt = db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
        const currentStatus = (db.prepare('SELECT status FROM production_orders WHERE id = ?').get(orderId) as { status: string }).status;
        historyStmt.run(orderId, new Date().toISOString(), currentStatus, updatedBy, historyNotes);
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

    const currentOrder = db.prepare('SELECT status FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder | undefined;
    if (!currentOrder) {
        throw new Error("Order not found.");
    }

    const transaction = db.transaction(() => {
        db.prepare('UPDATE production_orders SET lastStatusUpdateNotes = ?, lastStatusUpdateBy = ? WHERE id = ?')
          .run(notes, updatedBy, orderId);
        
        const historyStmt = db.prepare('INSERT INTO production_order_history (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)');
        historyStmt.run(orderId, new Date().toISOString(), currentOrder.status, updatedBy, `Nota agregada: ${notes}`);
    });

    transaction();
    const updatedOrder = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as ProductionOrder;
    return updatedOrder;
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
    return db.prepare('SELECT * FROM production_orders WHERE id = ?').get(entityId) as ProductionOrder;
}

export async function getUserByName(name: string): Promise<User | null> {
    const users = await getAllUsersFromMain();
    return users.find((u: User) => u.name === name) || null;
}

export async function getRolesWithPermission(permission: string): Promise<string[]> {
    const roles = await getAllRolesFromMain();
    return roles.filter(role => role.id === 'admin' || role.permissions.includes(permission)).map(role => role.id);
}

export async function getCompletedOrdersByDateRange(dateRange: DateRange): Promise<(ProductionOrder & { history: ProductionOrderHistoryEntry[] })[]> {
    const db = await connectDb(PLANNER_DB_FILE);
    if (!dateRange.from) throw new Error("Start date is required.");
    
    const toDate = dateRange.to || new Date();
    toDate.setHours(23, 59, 59, 999); // Include the whole end day

    const settings = await getPlannerSettings();
    const completedStatuses = settings.useWarehouseReception 
        ? ['completed', 'received-in-warehouse'] 
        : ['completed'];
    
    const statusPlaceholders = completedStatuses.map(() => '?').join(',');

    const orders: ProductionOrder[] = db.prepare(`
        SELECT o.*
        FROM production_orders o
        WHERE o.status IN (${statusPlaceholders})
    `).all(...completedStatuses) as ProductionOrder[];

    const ordersWithHistory = orders.map(order => {
        const history = db.prepare('SELECT * FROM production_order_history WHERE orderId = ? ORDER BY timestamp ASC').all(order.id) as ProductionOrderHistoryEntry[];
        return { ...order, history };
    });
    
    const filteredOrders = ordersWithHistory.filter(order => {
        const completionEntry = order.history.find(h => completedStatuses.includes(h.status));
        if (!completionEntry) return false;
        
        const completionDate = parseISO(completionEntry.timestamp);
        return completionDate >= dateRange.from! && completionDate <= toDate;
    });

    return filteredOrders;
}

    
