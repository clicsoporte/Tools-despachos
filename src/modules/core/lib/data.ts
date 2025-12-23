/**
 * @fileoverview This file contains the initial or default data for the application.
 * This data is used to populate the database on its first run.
 * Spanish is used for UI-facing strings like names and descriptions.
 */

import type { Tool, User, Role, Company, DatabaseModule } from "@/modules/core/types";
import {
  Users,
  Sheet,
  Network,
  ShieldCheck,
  FileTerminal,
  FileUp,
  LifeBuoy,
  ServerCog,
  CalendarCheck,
  Factory,
  ShoppingCart,
  Warehouse,
  Briefcase,
  Store,
  Search,
  Wrench,
  LayoutDashboard,
  Map,
  PackagePlus,
  MessageSquare,
  BarChartBig,
  Lightbulb,
  FileText,
  Calculator,
  Mail,
  UserCheck,
  Truck,
  QrCode,
  ClipboardCheck,
  BookMarked,
  Save,
  Copy,
  Folder,
  AlertTriangle,
  ToggleRight,
  FilePlusIcon,
  Warehouse,
  Send,
  Loader2,
  Play,
  Pause,
  History,
  Undo2,
  Info,
  BadgeInfo,
  CreditCard,
  ListChecks,
  Hourglass,
  Layers,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { initializePlannerDb, runPlannerMigrations, plannerSchema } from '../../planner/lib/db';
import { initializeRequestsDb, runRequestMigrations, requestSchema } from '../../requests/lib/db';
import { initializeWarehouseDb, runWarehouseMigrations, warehouseSchema } from '../../warehouse/lib/db';
import { initializeCostAssistantDb, runCostAssistantMigrations, costAssistantSchema } from '../../cost-assistant/lib/db';
import { initializeMainDatabase, runMainDbMigrations } from "./db";

/**
 * Acts as a registry for all database modules in the application.
 * This structure allows the core `connectDb` function to be completely agnostic
 * of any specific module, promoting true modularity and decoupling.
 */
export const DB_MODULES: DatabaseModule[] = [
    { 
        id: 'clic-tools-main', 
        name: 'Clic-Tools (Sistema Principal)', 
        dbFile: 'intratool.db', 
        initFn: initializeMainDatabase, 
        migrationFn: runMainDbMigrations,
        schema: {
            'users': ['id', 'name', 'email', 'password', 'phone', 'whatsapp', 'erpAlias', 'avatar', 'role', 'recentActivity', 'securityQuestion', 'securityAnswer', 'forcePasswordChange'],
            'roles': ['id', 'name', 'permissions'],
            'company_settings': ['id', 'name', 'taxId', 'address', 'phone', 'email', 'logoUrl', 'systemName', 'quotePrefix', 'nextQuoteNumber', 'decimalPlaces', 'quoterShowTaxId', 'searchDebounceTime', 'syncWarningHours', 'lastSyncTimestamp', 'importMode', 'customerFilePath', 'productFilePath', 'exemptionFilePath', 'stockFilePath', 'locationFilePath', 'cabysFilePath', 'supplierFilePath', 'erpPurchaseOrderHeaderFilePath', 'erpPurchaseOrderLineFilePath'],
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
            'erp_purchase_order_headers': ['ORDEN_COMPRA', 'PROVEEDOR', 'FECHA_HORA', 'ESTADO', 'CreatedBy'],
            'erp_purchase_order_lines': ['ORDEN_COMPRA', 'ARTICULO', 'CANTIDAD_ORDENADA'],
        }
    },
    { id: 'purchase-requests', name: 'Solicitud de Compra', dbFile: 'requests.db', initFn: initializeRequestsDb, migrationFn: runRequestMigrations, schema: requestSchema },
    { id: 'production-planner', name: 'Planificador de Producción', dbFile: 'planner.db', initFn: initializePlannerDb, migrationFn: runPlannerMigrations, schema: plannerSchema },
    { id: 'warehouse-management', name: 'Gestión de Almacenes', dbFile: 'warehouse.db', initFn: initializeWarehouseDb, migrationFn: runWarehouseMigrations, schema: warehouseSchema },
    { id: 'cost-assistant', name: 'Asistente de Costos', dbFile: 'cost_assistant.db', initFn: initializeCostAssistantDb, migrationFn: runCostAssistantMigrations, schema: costAssistantSchema },
];


/**
 * The default user to be created in the database.
 * This is no longer used. The first user is created via the setup wizard.
 */
export const initialUsers: User[] = [];

/**
 * Initial company data for the general settings.
 */
export const initialCompany: Company = {
    name: "CLIC SOPORTE Y CLIC TIENDA S.R.L",
    taxId: "3102894538",
    address: "San José, Costa Rica",
    phone: "+50640000630",
    email: "facturacion@clicsoporte.com",
    systemName: "Clic-Tools",
    quotePrefix: "COT-",
    nextQuoteNumber: 1,
    decimalPlaces: 2,
    quoterShowTaxId: true,
    searchDebounceTime: 500,
    syncWarningHours: 12,
    importMode: 'file',
    lastSyncTimestamp: null,
    customerFilePath: "",
    productFilePath: "",
    exemptionFilePath: "",
    stockFilePath: "",
    locationFilePath: "",
    cabysFilePath: "",
    supplierFilePath: "",
    erpPurchaseOrderHeaderFilePath: "",
    erpPurchaseOrderLineFilePath: ""
};

/**
 * List of tools available on the main dashboard.
 */
export const mainTools: Tool[] = [
  {
    id: "quoter",
    name: "Cotizador",
    description: "Crear y gestionar cotizaciones para clientes.",
    href: "/dashboard/quoter",
    icon: Sheet,
    bgColor: "bg-green-500",
  },
  {
    id: "purchase-request",
    name: "Solicitud de Compra",
    description: "Crear y gestionar solicitudes de compra internas.",
    href: "/dashboard/requests",
    icon: ShoppingCart,
    bgColor: "bg-amber-700",
  },
   {
    id: "planner",
    name: "Planificador OP",
    description: "Gestionar y visualizar la carga de producción.",
    href: "/dashboard/planner",
    icon: CalendarCheck,
    bgColor: "bg-purple-700",
  },
  {
    id: 'cost-assistant',
    name: 'Asistente de Costos',
    description: 'Calcular costos y precios a partir de facturas XML.',
    href: '/dashboard/cost-assistant',
    icon: Calculator,
    bgColor: 'bg-orange-600',
  },
   {
    id: "warehouse",
    name: "Almacén",
    description: "Consultar ubicaciones, gestionar unidades y registrar conteos.",
    href: "/dashboard/warehouse",
    icon: Warehouse,
    bgColor: "bg-cyan-600",
  },
     {
      id: "hacienda-query",
      name: "Consultas Hacienda",
      description: "Verificar situación tributaria y exoneraciones.",
      href: "/dashboard/hacienda",
      icon: Search,
      bgColor: "bg-fuchsia-600",
    },
  {
    id: "help",
    name: "Centro de Ayuda",
    description: "Consultar la documentación y guías de uso del sistema.",
    href: "/dashboard/help",
    icon: LifeBuoy,
    bgColor: "bg-blue-700",
  },
];


export const warehouseTools: Tool[] = [
    {
        id: "warehouse-search",
        name: "Consulta de Almacén",
        description: "Localizar artículos, clientes y unidades de inventario.",
        href: "/dashboard/warehouse/search",
        icon: Search,
        bgColor: 'bg-blue-600',
    },
    {
        id: "warehouse-search-simple",
        name: "Búsqueda Rápida (Móvil)",
        description: "Interfaz optimizada para búsquedas rápidas en celulares y tablets.",
        href: "/dashboard/warehouse/search/simple",
        icon: QrCode,
        bgColor: 'bg-sky-600',
    },
     {
        id: "assign-item",
        name: "Asignar Ubicación a Producto",
        description: "Asociar productos a clientes y ubicaciones de forma permanente.",
        href: "/dashboard/warehouse/assign",
        icon: PackagePlus,
        bgColor: 'bg-teal-600',
    },
    {
        id: "inventory-count",
        name: "Toma de Inventario Físico",
        description: "Registrar conteos físicos de productos en ubicaciones específicas.",
        href: "/dashboard/warehouse/inventory-count",
        icon: ClipboardCheck,
        bgColor: 'bg-lime-600',
    },
    {
        id: "warehouse-units",
        name: "Gestión de Unidades (QR)",
        description: "Crear y etiquetar unidades de inventario (lotes/tarimas).",
        href: "/dashboard/warehouse/units",
        icon: QrCode,
        bgColor: 'bg-cyan-700',
    },
    {
        id: "warehouse-locations",
        name: "Gestionar Ubicaciones",
        description: "Definir la jerarquía y crear las ubicaciones físicas del almacén.",
        href: "/dashboard/warehouse/locations",
        icon: Map,
        bgColor: 'bg-purple-600',
    }
];


/**
 * Default roles and their permissions.
 */
export const initialRoles: Role[] = [
  {
    id: "admin",
    name: "Admin",
    permissions: [
        "dashboard:access",
        "quotes:create",
        "quotes:generate",
        "quotes:drafts:create",
        "quotes:drafts:read",
        "quotes:drafts:delete",
        "requests:read",
        "requests:read:all",
        "requests:create",
        "requests:create:duplicate",
        "requests:edit:pending",
        "requests:edit:approved",
        "requests:reopen",
        "requests:notes:add",
        "requests:status:review",
        "requests:status:pending-approval",
        "requests:status:approve",
        "requests:status:ordered",
        "requests:status:received-in-warehouse",
        "requests:status:entered-erp",
        "requests:status:cancel",
        "requests:status:unapproval-request",
        "requests:status:unapproval-request:approve",
        "requests:status:revert-to-approved",
        "planner:read",
        "planner:read:all",
        "planner:create",
        "planner:edit:pending",
        "planner:edit:approved",
        "planner:reopen",
        "planner:receive",
        "planner:status:review",
        "planner:status:pending-approval",
        "planner:status:approve",
        "planner:status:in-progress",
        "planner:status:on-hold",
        "planner:status:completed",
        "planner:status:cancel",
        "planner:status:cancel-approved",
        "planner:status:unapprove-request",
        "planner:status:unapprove-request:approve",
        "planner:priority:update",
        "planner:machine:assign",
        "planner:schedule",
        "analytics:read",
        "analytics:purchase-suggestions:read",
        "analytics:purchase-report:read",
        "analytics:production-report:read",
        "analytics:transits-report:read",
        "analytics:user-permissions:read",
        "analytics:physical-inventory-report:read",
        "cost-assistant:access",
        "cost-assistant:drafts:read-write",
        "users:create",
        "users:read",
        "users:update",
        "users:delete",
        "roles:create",
        "roles:read",
        "roles:update",
        "roles:delete",
        "admin:settings:general",
        "admin:settings:api",
        "admin:settings:planner",
        "admin:settings:requests",
        "admin:settings:warehouse",
        "admin:settings:stock",
        "admin:settings:cost-assistant",
        "admin:suggestions:read",
        "admin:import:run",
        "admin:import:files",
        "admin:import:sql",
        "admin:import:sql-config",
        "admin:logs:read",
        "admin:logs:clear",
        "admin:maintenance:backup",
        "admin:maintenance:restore",
        "admin:maintenance:reset",
        "warehouse:access",
        "warehouse:inventory:assign",
        "warehouse:locations:manage",
        "warehouse:units:manage",
        "hacienda:query",
    ],
  },
  {
    id: "viewer",
    name: "Viewer",
    permissions: ["dashboard:access", "quotes:create", "quotes:drafts:read"],
  },
  {
    id: 'planner-user',
    name: 'Planificador',
    permissions: [
        "dashboard:access",
        "planner:read",
        "planner:create",
        "planner:status:approve",
        "planner:status:in-progress",
        "planner:status:on-hold",
        "planner:status:completed",
        "planner:status:cancel",
        "planner:priority:update",
        "planner:machine:assign",
        "planner:schedule",
    ]
  },
   {
    id: 'requester-user',
    name: 'Solicitante',
    permissions: [
        "dashboard:access",
        "requests:read",
        "requests:create",
        "requests:status:review",
        "requests:status:cancel",
        "requests:notes:add",
    ]
  }
];

/**
 * List of all permissions that grant access to the admin section.
 */
export const adminPermissions = [
    "users:create", "users:read", "users:update", "users:delete",
    "roles:create", "roles:read", "roles:update", "roles:delete",
    "admin:settings:general", "admin:settings:api", "admin:settings:planner", "admin:settings:requests", "admin:settings:warehouse", "admin:settings:stock", "admin:settings:cost-assistant",
    "admin:suggestions:read",
    "admin:import:run", "admin:import:files", "admin:import:sql", "admin:import:sql-config",
    "admin:logs:read", "admin:logs:clear",
    "admin:maintenance:backup", "admin:maintenance:restore", "admin:maintenance:reset",
];

/**
 * List of all permissions that grant access to the analytics section.
 */
export const analyticsPermissions = [
    "analytics:read",
    "analytics:purchase-suggestions:read",
    "analytics:purchase-report:read",
    "analytics:production-report:read",
    "analytics:transits-report:read",
    "analytics:user-permissions:read",
    "analytics:physical-inventory-report:read",
];


/**
 * List of tools available in the admin section.
 */
export const adminTools: Tool[] = [
    {
        id: "user-management",
        name: "Gestión de Usuarios",
        description: "Añadir, editar y gestionar usuarios y sus roles.",
        href: "/dashboard/admin/users",
        icon: Users,
        bgColor: 'bg-blue-500',
      },
      {
        id: "role-management",
        name: "Gestión de Roles",
        description: "Definir roles y asignar permisos granulares.",
        href: "/dashboard/admin/roles",
        icon: ShieldCheck,
        bgColor: 'bg-green-600',
      },
      {
        id: "general-settings",
        name: "Configuración General",
        description: "Gestionar los datos de la empresa y logo.",
        href: "/dashboard/admin/general",
        icon: Briefcase,
        bgColor: 'bg-orange-500',
      },
      {
        id: "email-settings",
        name: "Configuración de Correo",
        description: "Ajustes del servidor SMTP para enviar correos.",
        href: "/dashboard/admin/email",
        icon: Mail,
        bgColor: 'bg-purple-600',
      },
      {
        id: "suggestions-viewer",
        name: "Buzón de Sugerencias",
        description: "Revisar el feedback enviado por los usuarios del sistema.",
        href: "/dashboard/admin/suggestions",
        icon: MessageSquare,
        bgColor: 'bg-green-700',
      },
      {
        id: "quoter-settings",
        name: "Config. Cotizador",
        description: "Gestionar prefijos y consecutivos del cotizador.",
        href: "/dashboard/admin/quoter", 
        icon: BookMarked,
        bgColor: 'bg-blue-600',
      },
      {
        id: "cost-assistant-settings",
        name: "Config. Asist. Costos",
        description: "Gestionar ajustes para el asistente de costos.",
        href: "/dashboard/admin/cost-assistant",
        icon: Calculator,
        bgColor: 'bg-orange-500',
      },
      {
        id: "import-data",
        name: "Importar Datos",
        description: "Cargar clientes, productos, exoneraciones y...",
        href: "/dashboard/admin/import",
        icon: FileUp,
        bgColor: 'bg-cyan-700',
      },
       {
        id: "maintenance",
        name: "Mantenimiento",
        description: "Backup, restauración y reseteo del sistema.",
        href: "/dashboard/admin/maintenance",
        icon: ServerCog,
        bgColor: 'bg-red-600',
      },
      {
        id: "api-settings",
        name: "Configuración de API",
        description: "Gestionar URLs y claves de APIs externas.",
        href: "/dashboard/admin/api",
        icon: Network,
        bgColor: 'bg-indigo-500',
      },
       {
        id: "planner-settings",
        name: "Config. Planificador",
        description: "Gestionar máquinas y otros ajustes del...",
        href: "/dashboard/admin/planner",
        icon: Factory,
        bgColor: 'bg-slate-600',
      },
       {
        id: "requests-settings",
        name: "Config. Compras",
        description: "Gestionar rutas y otros ajustes de compras.",
        href: "/dashboard/admin/requests",
        icon: Store,
        bgColor: 'bg-amber-700',
      },
      {
        id: "warehouse-settings",
        name: "Config. Almacenes e Inventario",
        description: "Gestionar bodegas, unidades y jerarquía del almacén.",
        href: "/dashboard/admin/warehouse",
        icon: Wrench,
        bgColor: 'bg-purple-600',
      },
      {
        id: "log-viewer",
        name: "Visor de Eventos",
        description: "Revisar los registros y errores del sistema.",
        href: "/dashboard/admin/logs",
        icon: FileTerminal,
        bgColor: 'bg-gray-500',
      }
];

export const analyticsTools: Tool[] = [
    {
        id: "purchase-suggestions",
        name: "Sugerencias de Compra",
        description: "Analizar pedidos y stock para sugerir compras proactivas.",
        href: "/dashboard/analytics/purchase-suggestions",
        icon: Lightbulb,
        bgColor: "bg-blue-600",
    },
    {
        id: "purchase-report",
        name: "Reporte de Compras",
        description: "Visualizar y exportar un reporte histórico de compras.",
        href: "/dashboard/analytics/purchase-report",
        icon: FileText,
        bgColor: "bg-green-600",
    },
     {
        id: "transits-report",
        name: "Reporte de Tránsitos",
        description: "Monitorear órdenes de compra del ERP activas y en tránsito.",
        href: "/dashboard/analytics/transits-report",
        icon: Truck,
        bgColor: "bg-orange-500",
    },
    {
        id: "production-report",
        name: "Reporte de Producción",
        description: "Analizar rendimiento y desperdicio de órdenes completadas.",
        href: "/dashboard/analytics/production-report",
        icon: BarChartBig,
        bgColor: "bg-purple-600",
    },
    {
        id: "physical-inventory-report",
        name: "Reporte de Inventario Físico",
        description: "Comparar conteos físicos con el stock del ERP para encontrar diferencias.",
        href: "/dashboard/analytics/physical-inventory-report",
        icon: ClipboardCheck,
        bgColor: "bg-cyan-600",
    },
    {
        id: "user-permissions",
        name: "Reporte de Permisos",
        description: "Auditar los permisos asignados a cada usuario según su rol.",
        href: "/dashboard/analytics/user-permissions",
        icon: UserCheck,
        bgColor: "bg-slate-600",
    },
];


/**
 * A combined list of all tools for easy access.
 */
export const allTools: Tool[] = [...mainTools, ...adminTools, ...analyticsTools];
