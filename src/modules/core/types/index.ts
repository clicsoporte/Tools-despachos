/**
 * @fileoverview This file defines the core TypeScript types used throughout the application.
 * Using centralized types helps ensure data consistency and provides autocompletion benefits.
 */

import type { LucideIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

/**
 * Represents a user account in the system.
 */
export type User = {
  id: number;
  name: string;
  email: string;
  password?: string; // Hashed password from DB, or plaintext only when updating.
  phone: string;
  whatsapp: string;
  erpAlias?: string; // User's username in the external ERP system
  avatar: string;
  role: string; // Corresponds to a Role ID
  recentActivity: string;
  securityQuestion?: string;
  securityAnswer?: string;
  forcePasswordChange?: boolean | number;
  activeWizardSession?: string | null;
};

/**
 * Represents the company's general information.
 */
export type Company = {
    name: string;
    taxId: string;
    address: string;
    phone: string;
    email: string;
    logoUrl?: string;
    systemName?: string;
    publicUrl?: string;
    quotePrefix: string;
    nextQuoteNumber: number;
    decimalPlaces: number;
    quoterShowTaxId?: boolean;
    searchDebounceTime?: number;
    syncWarningHours?: number;
    importMode: 'file' | 'sql';
    lastSyncTimestamp?: string | null;
    customerFilePath?: string;
    productFilePath?: string;
    exemptionFilePath?: string;
    stockFilePath?: string;
    locationFilePath?: string;
    cabysFilePath?: string;
    supplierFilePath?: string;
    erpPurchaseOrderHeaderFilePath?: string;
    erpPurchaseOrderLineFilePath?: string;
    erpInvoiceHeaderFilePath?: string;
    erpInvoiceLineFilePath?: string;
};

/**
 * Represents a tool or module accessible from a dashboard.
 */
export type Tool = {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  bgColor?: string;
  adminOnly?: boolean;
};

/**
 * Defines a user role and its associated permissions.
 */
export type Role = {
  id: string;
  name: string;
  permissions: string[];
};

/**
 * Represents a customer, typically imported from an ERP system.
 */
export type Customer = {
    id: string; // CLIENTE
    name: string; // NOMBRE
    address: string; // DIRECCION
    phone: string; // TELEFONO1
    taxId: string; // CONTRIBUYENTE
    currency: string; // MONEDA
    creditLimit: number; // LIMITE_CREDITO
    paymentCondition: string; // CONDICION_PAGO
    salesperson: string; // VENDEDOR
    active: 'S' | 'N'; // ACTIVO
    email: string; // E_MAIL
    electronicDocEmail: string; // EMAIL_DOC_ELECTRONICO
};

/**
 * Represents a product or article, typically imported from an ERP system.
 */
export type Product = {
    id: string;             // ARTICULO
    description: string;    // DESCRIPCION
    classification: string; // CLASIFICACION_2
    lastEntry: string;      // ULTIMO_INGRESO
    active: 'S' | 'N';      // ACTIVO
    notes: string;          // NOTAS
    unit: string;           // UNIDAD_VENTA
    isBasicGood: 'S' | 'N'; // CANASTA_BASICA
    cabys: string;          // CODIGO_HACIENDA
    barcode?: string;       // CODIGO_BARRAS_VENT
};

/**
 * Represents a single line item within a quote.
 */
export type QuoteLine = {
    id: string; // Unique identifier for the line item in the UI
    product: Product; // The product details
    quantity: number;
    price: number;
    tax: number;
    // display fields are used to hold the string value from the input
    // before it's parsed, allowing for more flexible user input.
    displayQuantity: string;
    displayPrice: string;
};


/**
 * Represents the structure of the exchange rate API response.
 */
export type ExchangeRateApiResponse = {
    compra?: { fecha: string; valor: number; };
    venta: { fecha: string; valor: number; };
}

/**
 * Represents a saved quote draft.
 */
export type QuoteDraft = {
    id: string;
    createdAt: string;
    userId: number;
    customerId: string | null;
    customer?: Customer | null;
    lines: Omit<QuoteLine, 'displayQuantity' | 'displayPrice'>[];
    totals: {
        subtotal: number;
        totalTaxes: number;
        total: number;
    };
    notes: string;
    currency: string;
    exchangeRate: number | null;
    purchaseOrderNumber?: string;
    // Fields for complete form state restoration
    customerDetails?: string;
    deliveryAddress?: string;
    deliveryDate?: string;
    sellerName?: string;
    sellerType?: string;
    quoteDate?: string;
    validUntilDate?: string;
    paymentTerms?: string;
    creditDays?: number;
}

/**
* Represents a system log entry for auditing and debugging.
*/
export type LogEntry = {
    id: number;
    timestamp: string;
    type: "INFO" | "WARN" | "ERROR";
    message: string;
    details?: any; // Stored as a JSON string in the DB
};

/**
 * Represents the settings for external APIs.
 */
export type ApiSettings = {
    exchangeRateApi: string;
    haciendaExemptionApi: string;
    haciendaTributariaApi: string;
    };

/**
 * Represents the expected schema of a table for database auditing.
 */
export type ExpectedSchema = {
    [tableName: string]: string[]; // e.g., { 'users': ['id', 'name', 'email'], ... }
};

/**
 * Represents a database module for modular maintenance, initialization, and auditing.
 */
export type DatabaseModule = {
    id: string;
    name: string;
    dbFile: string;
    schema: ExpectedSchema;
};


/**
 * Represents a customer's tax exemption record from the ERP.
 */
export type Exemption = {
    code: string;
    description: string;
    customer: string;
    authNumber: string;
    startDate: string;
    endDate: string;
    percentage: number;
    docType: string;
    institutionName: string;
    institutionCode: string;
};


/**
 * Represents a configurable exemption law in the system.
 */
export type ExemptionLaw = {
  docType: string; // e.g., '99' or '03'
  institutionName: string; // e.g., 'Régimen de Zona Franca'
  authNumber: string | null; // e.g., '9635', only for specific cases
};


// --- Production Planner Types ---

export type ProductionOrderStatus = 'pending' | 'pending-review' | 'pending-approval' | 'approved' | 'in-queue' | 'in-progress' | 'on-hold' | 'in-maintenance' | 'completed' | 'received-in-warehouse' | 'canceled' | 'custom-1' | 'custom-2' | 'custom-3' | 'custom-4';
export type AdministrativeAction = 'unapproval-request' | 'cancellation-request' | 'none';
export type ProductionOrderPriority = 'low' | 'medium' | 'high' | 'urgent';

export type ProductionOrder = {
  id: number;
  consecutive: string;
  purchaseOrder?: string;
  requestDate: string;
  deliveryDate: string;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  customerId: string;
  customerName: string;
  customerTaxId: string;
  productId: string;
  productDescription: string;
  quantity: number;
  inventory?: number;
  inventoryErp?: number;
  priority: ProductionOrderPriority;
  status: ProductionOrderStatus;
  pendingAction: AdministrativeAction;
  notes?: string;
  requestedBy: string;
  approvedBy?: string;
  lastStatusUpdateBy?: string;
  lastStatusUpdateNotes?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
  hasBeenModified?: boolean;
  deliveredQuantity?: number;
  defectiveQuantity?: number;
  erpPackageNumber?: string;
  erpTicketNumber?: string;
  reopened?: boolean;
  machineId?: string | null;
  shiftId?: string | null;
  previousStatus?: ProductionOrderStatus | null;
  erpOrderNumber?: string;
};

export type UpdateProductionOrderPayload = Partial<Omit<ProductionOrder, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'erpPackageNumber' | 'erpTicketNumber' | 'machineId' | 'previousStatus' | 'scheduledStartDate' | 'scheduledEndDate' | 'requestedBy' | 'hasBeenModified' | 'lastModifiedBy' | 'lastModifiedAt' | 'shiftId'>> & {
    orderId: number;
    updatedBy: string;
};

export type ProductionOrderHistoryEntry = {
    id: number;
    orderId: number;
    timestamp: string;
    status: ProductionOrderStatus;
    notes?: string;
    updatedBy: string;
};

export type PlannerMachine = {
  id: string;
  name: string;
};

export type PlannerShift = {
  id: string;
  name: string;
};

export type CustomStatus = {
    id: 'custom-1' | 'custom-2' | 'custom-3' | 'custom-4';
    label: string;
    color: string;
    isActive: boolean;
};

export type PlannerSettings = {
    orderPrefix?: string;
    nextOrderNumber?: number;
    useWarehouseReception: boolean;
    showCustomerTaxId: boolean;
    machines: PlannerMachine[];
    shifts: PlannerShift[];
    requireMachineForStart: boolean;
    requireShiftForCompletion: boolean;
    assignmentLabel: string;
    shiftLabel: string;
    customStatuses: CustomStatus[];
    pdfPaperSize: 'letter' | 'legal';
    pdfOrientation: 'portrait' | 'landscape';
    pdfExportColumns: string[];
    pdfTopLegend?: string;
    fieldsToTrackChanges: string[];
};

export type UpdateStatusPayload = {
    orderId: number;
    status: ProductionOrderStatus;
    notes: string;
    updatedBy: string;
    deliveredQuantity?: number;
    defectiveQuantity?: number;
    erpPackageNumber?: string;
    erpTicketNumber?: string;
    reopen: boolean;
};

export type UpdateOrderDetailsPayload = {
  orderId: number;
  priority?: ProductionOrderPriority;
  machineId?: string | null;
  shiftId?: string | null;
  scheduledDateRange?: DateRange;
  updatedBy: string;
};


// --- Purchase Request Types ---

export type PurchaseRequestStatus = 'pending' | 'purchasing-review' | 'pending-approval' | 'approved' | 'ordered' | 'received-in-warehouse' | 'entered-erp' | 'canceled';
export type PurchaseRequestPriority = 'low' | 'medium' | 'high' | 'urgent';
export type PurchaseType = 'single' | 'multiple';

export type PurchaseRequest = {
  id: number;
  consecutive: string;
  purchaseOrder?: string; // Nº Orden de Compra Cliente
  requestDate: string;
  requiredDate: string;
  arrivalDate?: string;
  receivedDate?: string;
  clientId: string;
  clientName: string;
  clientTaxId: string;
  itemId: string;
  itemDescription: string;
  quantity: number;
  deliveredQuantity?: number;
  inventory?: number;
  inventoryErp?: number;
  priority: PurchaseRequestPriority;
  purchaseType: PurchaseType;
  unitSalePrice?: number; // Precio de venta unitario sin IVA
  salePriceCurrency?: 'CRC' | 'USD';
  requiresCurrency?: boolean;
  erpOrderNumber?: string; // Número de pedido ERP de origen
  erpOrderLine?: number; // Número de línea del pedido ERP
  erpEntryNumber?: string; // Consecutivo de ingreso en el ERP
  manualSupplier?: string; // Proveedor (manual)
  route?: string; // Ruta
  shippingMethod?: string; // Método de Envío
  status: PurchaseRequestStatus;
  pendingAction: AdministrativeAction;
  notes?: string;
  requestedBy: string;
  approvedBy?: string;
  receivedInWarehouseBy?: string;
  lastStatusUpdateBy?: string;
  lastStatusUpdateNotes?: string;
  reopened?: boolean;
  previousStatus?: PurchaseRequestStatus | null;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
  hasBeenModified?: boolean;
  sourceOrders?: string[];
  involvedClients?: { id: string; name: string }[];
  analysis?: {
      cost: number;
      salePrice: number;
      margin: number;
  } | null;
};

export type UpdatePurchaseRequestPayload = Partial<Omit<PurchaseRequest, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'deliveredQuantity' | 'receivedInWarehouseBy' | 'receivedDate' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'>> & {
    requestId: number;
    updatedBy: string;
};

export type PurchaseRequestHistoryEntry = {
    id: number;
    requestId: number;
    timestamp: string;
    status: PurchaseRequestStatus;
    notes?: string;
    updatedBy: string;
};

export type RequestSettings = {
    requestPrefix?: string;
    nextRequestNumber?: number;
    showCustomerTaxId: boolean;
    routes: string[];
    shippingMethods: string[];
    useWarehouseReception: boolean;
    useErpEntry: boolean;
    pdfTopLegend?: string;
    pdfExportColumns: string[];
    pdfPaperSize: 'letter' | 'legal';
    pdfOrientation: 'portrait' | 'landscape';
    erpHeaderQuery?: string;
    erpLinesQuery?: string;
};

export type UpdateRequestStatusPayload = {
    requestId: number;
    status: PurchaseRequestStatus;
    notes: string;
    updatedBy: string;
    reopen: boolean;
    manualSupplier?: string;
    erpOrderNumber?: string;
    deliveredQuantity?: number;
    arrivalDate?: string;
    erpEntryNumber?: string;
};

export type RejectCancellationPayload = {
    entityId: number;
    notes: string;
    updatedBy: string;
}

export type AdministrativeActionPayload = {
    entityId: number;
    action: AdministrativeAction;
    notes: string;
    updatedBy: string;
};


// --- Warehouse Management Types ---

export type LocationType = 'building' | 'zone' | 'rack' | 'shelf' | 'bin';

export type WarehouseLocationLevel = {
    type: string; // e.g. "level1", "level2"
    name: string; // e.g. "Edificio", "Pasillo"
}

export type WarehouseSettings = {
    locationLevels: WarehouseLocationLevel[];
    unitPrefix: string;
    nextUnitNumber: number;
    dispatchNotificationEmails?: string;
};

export type WarehouseLocation = {
    id: number;
    name: string;
    code: string; // A unique, human-readable code, e.g., R01-S03-B05
    type: string; // Corresponds to WarehouseLocationLevel['type']
    parentId?: number | null; // For hierarchical structure
    isLocked?: 0 | 1;
    lockedBy?: string | null;
    lockedByUserId?: number;
    lockedAt?: string;
};

/** Tracks physical quantity in a specific location */
export type WarehouseInventoryItem = {
    id: number;
    itemId: string; // Corresponds to Product['id'] from main DB
    locationId: number; // Foreign key to locations table
    quantity: number;
    lastUpdated: string;
    updatedBy: string;
};

/** Maps an item to a location without quantity */
export type ItemLocation = {
    id: number;
    itemId: string;
    locationId: number;
    clientId?: string | null;
    updatedBy?: string;
    updatedAt?: string;
};

/** Represents a single physical unit of inventory (pallet, box, etc.) */
export type InventoryUnit = {
    id: number;
    unitCode?: string; // e.g., 'U00001'
    productId: string;
    humanReadableId?: string; // e.g. a lot number
    documentId?: string; // e.g. a delivery note
    locationId: number | null;
    quantity: number;
    notes?: string;
    createdAt: string;
    createdBy: string;
};


export type MovementLog = {
    id: number;
    itemId: string;
    quantity: number;
    fromLocationId?: number | null; // null for initial entry
    toLocationId?: number | null;   // null for removal
    timestamp: string;
    userId: number;
    notes?: string;
};

// --- Stock Management Types ---
export type StockInfo = {
    itemId: string;
    stockByWarehouse: { [key: string]: number };
    totalStock: number;
};

export type Warehouse = {
    id: string;
    name: string;
    isDefault: boolean;
    isVisible: boolean;
    color: string;
};

export type StockSettings = {
    warehouses: Warehouse[];
};

// --- Hacienda Query Types ---
export type HaciendaContributorInfo = {
    nombre: string;
    tipoIdentificacion: string;
    regimen: {
        codigo: string;
        descripcion: string;
    };
    situacion: {
        moroso: "SI" | "NO";
        omiso: "SI" | "NO";
        estado: string;
    };
    administracionTributaria: string;
    actividades: {
        estado: string;
        tipo: string;
        codigo: string;
        descripcion: string;
    }[];
};

export type HaciendaExemptionApiResponse = {
    numeroDocumento: string;
    identificacion: string;
    porcentajeExoneracion: number;
    fechaEmision: string;
    fechaVencimiento: string;
    ano: number;
    cabys: string[];
    tipoAutorizacion: string;
    tipoDocumento: {
        codigo: string;
        descripcion: string;
        };
    CodigoInstitucion: string;
    nombreInstitucion: string;
    poseeCabys: boolean;
};

export type EnrichedCabysItem = {
    code: string;
    description: string;
    taxRate: number;
};

export type EnrichedExemptionInfo = HaciendaExemptionApiResponse & {
    enrichedCabys: EnrichedCabysItem[];
};

// Legacy type for migration, can be removed later.
export type Location = {
    id: number;
    name: string;
    code: string;
    type: string;
    parentId?: number | null;
}

export type InventoryItem = {
    id: number;
    itemId: string;
    locationId: number;
    quantity: number;
    lastUpdated: string;
    erpStock?: StockInfo | null;
};


// --- SQL Import Types ---
export type ImportQuery = {
    type: 'customers' | 'products' | 'exemptions' | 'stock' | 'locations' | 'cabys' | 'suppliers' | 'erp_order_headers' | 'erp_order_lines' | 'erp_purchase_order_headers' | 'erp_purchase_order_lines' | 'erp_invoice_headers' | 'erp_invoice_lines' | 'vendedores' | 'direcciones_embarque' | 'nominas' | 'puestos' | 'departamentos' | 'empleados' | 'vehiculos';
    query: string;
}

export type SqlConfig = {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
};

export type { DateRange };

export type PlannerNotePayload = {
    orderId: number;
    notes: string;
    updatedBy: string;
};

export type RequestNotePayload = {
    requestId: number;
    notes: string;
    updatedBy: string;
};


// --- Maintenance Types ---
export type UpdateBackupInfo = {
    moduleId: string;
    moduleName: string;
    fileName: string;
    date: string;
    version: string | null;
};

export type AuditResult = {
    moduleId: string;
    moduleName: string;
    dbFile: string;
    status: 'OK' | 'ERROR';
    issues: string[];
};

export type WizardSession = {
    rackId: number;
    levelIds: number[];
    currentIndex: number;
};


// --- Suggestion Box Types ---
export type Suggestion = {
  id: number;
  content: string;
  userId: number;
  userName: string;
  isRead: 0 | 1;
  timestamp: string;
};

// --- Notification Types ---
export type Notification = {
    id: number | string; // Can be number for DB notifications, string for synthetic ones like suggestions
    userId: number;
    message: string;
    href: string;
    isRead: 0 | 1;
    timestamp: string;
    entityId?: number; // e.g., order ID
    entityType?: string; // e.g., 'purchase-request'
    entityStatus?: ProductionOrderStatus | PurchaseRequestStatus; // The CURRENT status of the entity
    taskType?: string; // e.g., 'approve'
    isSuggestion?: boolean; // Flag to identify suggestion notifications
    suggestionId?: number; // Original suggestion ID
};


// --- Supplier Type ---
export type Supplier = {
    id: string;      // PROVEEDOR
    name: string;    // NOMBRE
    alias: string;   // ALIAS
    email: string;   // E_MAIL
    phone: string;   // TELEFONO1
};

// --- ERP Order Import Types ---
export type ErpOrderHeader = {
    PEDIDO: string;
    ESTADO: string;
    CLIENTE: string;
    FECHA_PEDIDO: string | Date;
    FECHA_PROMETIDA: string | Date;
    ORDEN_COMPRA?: string;
    CLIENTE_NOMBRE?: string;
    TOTAL_UNIDADES?: number;
    MONEDA_PEDIDO?: string;
    USUARIO?: string;
};

export type ErpOrderLine = {
    PEDIDO: string;
    PEDIDO_LINEA: number;
    ARTICULO: string;
    CANTIDAD_PEDIDA: number;
    PRECIO_UNITARIO: number;
};

// --- ERP Invoice Import Types (NEW) ---
export type ErpInvoiceHeader = {
    CLIENTE: string;
    NOMBRE_CLIENTE: string;
    TIPO_DOCUMENTO: string;
    FACTURA: string;
    PEDIDO: string;
    FACTURA_ORIGINAL: string;
    FECHA: string | Date;
    FECHA_ENTREGA: string | Date;
    ANULADA: string;
    EMBARCAR_A: string;
    DIRECCION_FACTURA: string;
    OBSERVACIONES: string;
    RUTA: string;
    USUARIO: string;
    USUARIO_ANULA: string;
    ZONA: string;
    VENDEDOR: string;
    REIMPRESO: number;
};

export type ErpInvoiceLine = {
    FACTURA: string;
    TIPO_DOCUMENTO: string;
    LINEA: number;
    BODEGA: string;
    PEDIDO: string;
    ARTICULO: string;
    ANULADA: string;
    FECHA_FACTURA: string | Date;
    CANTIDAD: number;
    PRECIO_UNITARIO: number;
    TOTAL_IMPUESTO1: number;
    PRECIO_TOTAL: number;
    DESCRIPCION: string;
    DOCUMENTO_ORIGEN: string;
    CANT_DESPACHADA: number;
    ES_CANASTA_BASICA: string;
};


// --- ERP Purchase Order (Transit) Types ---
export type ErpPurchaseOrderHeader = {
    ORDEN_COMPRA: string;
    PROVEEDOR: string;
    FECHA_HORA: string | Date;
    ESTADO: string; // 'A' = Activa/Abierta, 'R' = Recibida/Cerrada, 'N' = Anulada
    CreatedBy?: string;
};

export type ErpPurchaseOrderLine = {
    ORDEN_COMPRA: string;
    ARTICULO: string;
    CANTIDAD_ORDENADA: number;
};


// --- Analytics Types ---
export interface PurchaseSuggestion {
    itemId: string;
    itemDescription: string;
    itemClassification: string;
    totalRequired: number;
    currentStock: number;
    inTransitStock: number;
    shortage: number;
    sourceOrders: string[];
    involvedClients: { id: string; name: string }[];
    erpUsers: string[];
    earliestCreationDate: string | null;
    earliestDueDate: string | null;
    existingActiveRequests: { 
        id: number; 
        consecutive: string; 
        status: string; 
        quantity: number; 
        purchaseOrder?: string; 
        erpOrderNumber?: string;
        requestedBy: string;
    }[];
}

export type ProductionReportData = {
    totals: {
        totalRequested: number;
        totalDelivered: number;
        totalDefective: number;
        totalNet: number;
    };
    details: (ProductionOrder & { completionDate: string | null })[];
}

export interface PhysicalInventoryComparisonItem {
    productId: string;
    productDescription: string;
    locationId: number;
    locationName: string;
    locationCode: string;
    physicalCount: number;
    erpStock: number;
    difference: number;
    lastCountDate: string;
    updatedBy: string;
    assignedLocationPath: string;
}

// --- User Preferences ---
export interface UserPreferences {
    [key: string]: any;
}

// --- Dispatch Check Types ---
export type VerificationItem = {
    lineId: number;
    itemCode: string;
    description: string;
    barcode: string;
    requiredQuantity: number;
    verifiedQuantity: number;
    displayVerifiedQuantity: string;
    isManualOverride?: boolean;
};

export type DispatchLog = {
    id: number;
    documentId: string;
    documentType: string;
    verifiedAt: string;
    verifiedByUserId: number;
    verifiedByUserName: string;
    items: VerificationItem[];
    notes: string | null;
    vehiclePlate?: string | null;
    driverName?: string | null;
};

export interface DispatchContainer {
  id?: number;
  name: string;
  createdBy: string;
  createdAt: string;
  isLocked?: boolean;
  lockedBy?: string | null;
  lockedByUserId?: number | null;
  lockedAt?: string | null;
  assignmentCount?: number;
  completedAssignmentCount?: number;
  lastVerifiedBy?: string | null;
  lastVerifiedAt?: string | null;
}

export interface DispatchAssignment {
    id: number;
    containerId: number;
    documentId: string;
    documentType: string;
    documentDate: string;
    clientId: string;
    clientName: string;
    assignedBy: string;
    assignedAt: string;
    sortOrder: number;
    status: 'pending' | 'in-progress' | 'completed' | 'discrepancy' | 'partial';
}


// --- Cost Assistant Types ---
export type DraftableCostAssistantLine = Omit<CostAssistantLine, 'displayMargin' | 'displayTaxRate' | 'displayUnitCost'>;

export type CostAssistantLine = {
    id: string; // Unique ID for the line, e.g., `${invoiceKey}-${lineNumber}`
    invoiceKey: string;
    lineNumber: number;
    cabysCode: string;
    supplierCode: string;
    supplierCodeType: string;
    description: string;
    quantity: number;
    discountAmount: number; // Discount amount for the entire line
    xmlUnitCost: number; // Cost from XML, before prorating
    unitCostWithTax: number; // Cost per unit with tax, in local currency (CRC)
    unitCostWithoutTax: number; // Cost per unit without tax, in local currency (CRC), after prorating/editing
    taxRate: number; // e.g., 0.13
    taxCode: string; // e.g., '08' for 13%
    margin: number; // Profit margin, e.g., 0.20 for 20%
    displayMargin: string;
    displayTaxRate: string;
    displayUnitCost: string;
    isCostEdited: boolean;
    sellPriceWithoutTax: number;
    finalSellPrice: number;
    profitPerLine: number;
    supplierName: string;
};

export type ProcessedInvoiceInfo = {
    supplierName: string;
    invoiceNumber: string;
    invoiceDate: string;
    status: 'success' | 'error';
    errorMessage?: string;
};

export type CostAnalysisDraft = {
    id: string;
    userId: number;
    name: string;
    createdAt: string;
    lines: DraftableCostAssistantLine[];
    globalCosts: {
        transportCost: number;
        otherCosts: number;
    };
    processedInvoices: ProcessedInvoiceInfo[];
    discountHandling: 'customer' | 'company';
};

export type CostAssistantSettings = {
    draftPrefix?: string;
    nextDraftNumber?: number;
    columnVisibility: {
        cabysCode: boolean;
        supplierCode: boolean;
        description: boolean;
        quantity: boolean;
        discountAmount: boolean;
        unitCostWithoutTax: boolean;
        unitCostWithTax: boolean;
        taxRate: boolean;
        margin: boolean;
        sellPriceWithoutTax: boolean;
        finalSellPrice: boolean;
        profitPerLine: boolean;
    };
    discountHandling: 'customer' | 'company';
};

// --- Email Types ---
export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  recoveryEmailSubject: string;
  recoveryEmailBody: string;
}

// --- Notification Engine Types ---
export type NotificationEventId = 'onDispatchCompleted' | 'onReceivingCompleted' | 'onPlannerOrderCreated' | 'onPlannerOrderApproved' | 'onPlannerOrderCompleted' | 'onRequestCreated' | 'onRequestApproved' | 'onRequestOrdered' | 'onRackCreated';
export type NotificationActionType = 'sendEmail' | 'sendTelegram';

export interface NotificationEvent {
  id: NotificationEventId;
  module: string;
  name: string;
  description: string;
}

export interface NotificationRule {
  id: number;
  name: string;
  event: NotificationEventId;
  action: NotificationActionType;
  recipients: string[];
  subject?: string;
  enabled: boolean;
}

export interface TelegramSettings {
    botToken: string;
    chatId: string;
}

export interface NotificationServiceConfig {
    telegram: TelegramSettings;
}

// --- NEW DATA TYPES from SQL.txt ---
export type Vendedor = {
    VENDEDOR: string;
    NOMBRE: string;
    EMPLEADO: string;
};

export type DireccionEmbarque = {
    CLIENTE: string;
    DIRECCION: string;
    DETALLE_DIRECCION: string;
    DESCRIPCION: string;
};

export type Nomina = {
    NOMINA: string;
    DESCRIPCION: string;
    TIPO_NOMINA: string;
};

export type Puesto = {
    PUESTO: string;
    DESCRIPCION: string;
    ACTIVO: string;
};

export type Departamento = {
    DEPARTAMENTO: string;
    DESCRIPCION: string;
    ACTIVO: string;
};

export type Empleado = {
    EMPLEADO: string;
    NOMBRE: string;
    ACTIVO: string;
    DEPARTAMENTO: string;
    PUESTO: string;
    NOMINA: string;
};

export type Vehiculo = {
    placa: string;
    marca: string;
};
