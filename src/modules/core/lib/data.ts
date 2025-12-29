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
  Wand2,
  Lock,
  PackageCheck,
} from "lucide-react";

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
    publicUrl: "",
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
        id: 'receiving-wizard',
        name: 'Asistente de Recepción',
        description: 'Registrar producto terminado o compras y generar etiquetas.',
        href: '/dashboard/warehouse/receiving',
        icon: PackageCheck,
        bgColor: 'bg-emerald-600',
    },
    {
        id: 'population-wizard',
        name: 'Asistente de Poblado',
        description: 'Poblar masivamente las ubicaciones de un rack de forma guiada.',
        href: '/dashboard/warehouse/population-wizard',
        icon: Wand2,
        bgColor: 'bg-indigo-500',
    },
     {
        id: "assign-item",
        name: "Catálogo de Ubicaciones",
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
    },
     {
        id: "scanner-lookup",
        name: "Consulta por Código",
        description: "Buscar manualmente una unidad por su código único.",
        href: "/dashboard/scanner",
        icon: QrCode,
        bgColor: 'bg-sky-600',
    },
    {
        id: 'lock-management',
        name: 'Gestionar Bloqueos',
        description: 'Ver y liberar racks o niveles que están siendo editados.',
        href: '/dashboard/warehouse/locks',
        icon: Lock,
        bgColor: 'bg-slate-500',
    }
];

export const allAdminPermissions = [
    "dashboard:access", "quotes:create", "quotes:generate", "quotes:drafts:create", "quotes:drafts:read", "quotes:drafts:delete",
    "requests:read", "requests:read:all", "requests:create", "requests:create:duplicate", "requests:edit:pending", "requests:edit:approved", "requests:reopen", "requests:notes:add", "requests:status:review", "requests:status:pending-approval", "requests:status:approve", "requests:status:ordered", "requests:status:received-in-warehouse", "requests:status:entered-erp", "requests:status:cancel", "requests:status:unapproval-request", "requests:status:unapproval-request:approve", "requests:status:revert-to-approved",
    "planner:read", "planner:read:all", "planner:create", "planner:edit:pending", "planner:edit:approved", "planner:reopen", "planner:receive", "planner:status:review", "planner:status:pending-approval", "planner:status:approve", "planner:status:in-progress", "planner:status:on-hold", "planner:status:completed", "planner:status:cancel", "planner:status:cancel-approved", "planner:status:unapprove-request", "planner:status:unapprove-request:approve", "planner:priority:update", "planner:machine:assign", "planner:schedule",
    "analytics:read", "analytics:purchase-suggestions:read", "analytics:purchase-report:read", "analytics:production-report:read", "analytics:transits-report:read", "analytics:user-permissions:read", "analytics:physical-inventory-report:read",
    "cost-assistant:access", "cost-assistant:drafts:read-write", "users:create", "users:read", "users:update", "users:delete",
    "roles:create", "roles:read", "roles:update", "roles:delete", "admin:settings:general", "admin:settings:api", "admin:settings:planner", "admin:settings:requests", "admin:settings:warehouse", "admin:settings:stock", "admin:settings:cost-assistant",
    "admin:suggestions:read", "admin:import:run", "admin:import:files", "admin:import:sql", "admin:import:sql-config",
    "admin:logs:read", "admin:logs:clear", "admin:maintenance:backup", "admin:maintenance:restore", "admin:maintenance:reset",
    "warehouse:access", "warehouse:inventory:assign", "warehouse:locations:manage", "warehouse:locks:manage", "warehouse:units:manage", "hacienda:query",
];


/**
 * Default roles and their permissions.
 */
export const initialRoles: Role[] = [
  {
    id: "admin",
    name: "Admin",
    permissions: allAdminPermissions,
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

export const permissionGroups = {
    "Acceso General": ["dashboard:access"],
    "Cotizador": ["quotes:create", "quotes:generate", "quotes:drafts:create", "quotes:drafts:read", "quotes:drafts:delete"],
    "Solicitud de Compra (Lectura y Creación)": ["requests:read", "requests:read:all", "requests:create", "requests:create:duplicate", "requests:notes:add"],
    "Solicitud de Compra (Edición y Flujo)": ["requests:edit:pending", "requests:edit:approved", "requests:status:review", "requests:status:pending-approval"],
    "Solicitud de Compra (Acciones de Aprobador)": ["requests:reopen", "requests:status:approve", "requests:status:ordered", "requests:status:received-in-warehouse", "requests:status:entered-erp", "requests:status:cancel", "requests:status:revert-to-approved", "requests:status:unapproval-request", "requests:status:unapproval-request:approve"],
    "Planificador de Producción (Lectura y Creación)": ["planner:read", "planner:read:all", "planner:create"],
    "Planificador de Producción (Edición)": ["planner:edit:pending", "planner:edit:approved"],
    "Planificador de Producción (Acciones)": [
        "planner:reopen", "planner:receive", "planner:status:review", "planner:status:approve", "planner:status:in-progress", "planner:status:on-hold", 
        "planner:status:completed", "planner:status:cancel", "planner:status:cancel-approved", "planner:status:unapprove-request",
        "planner:priority:update", "planner:machine:assign", "planner:schedule"
    ],
    "Asistente de Costos": ["cost-assistant:access", "cost-assistant:drafts:read-write"],
    "Gestión de Almacenes": ["warehouse:access", "warehouse:inventory:assign", "warehouse:locations:manage", "warehouse:units:manage", "warehouse:locks:manage"],
    "Consultas Hacienda": ["hacienda:query"],
    "Analíticas y Reportes": ["analytics:read", "analytics:purchase-suggestions:read", "analytics:purchase-report:read", "analytics:production-report:read", "analytics:transits-report:read", "analytics:user-permissions:read", "analytics:physical-inventory-report:read"],
    "Gestión de Usuarios": ["users:create", "users:read", "users:update", "users:delete"],
    "Gestión de Roles": ["roles:create", "roles:read", "roles:update", "roles:delete"],
    "Administración del Sistema": [
        "admin:settings:general", "admin:settings:api", "admin:settings:planner", "admin:settings:requests", "admin:settings:warehouse", "admin:settings:stock", "admin:settings:cost-assistant",
        "admin:suggestions:read",
        "admin:import:run", "admin:import:files", "admin:import:sql", "admin:import:sql-config",
        "admin:logs:read", "admin:logs:clear",
        "admin:maintenance:backup", "admin:maintenance:restore", "admin:maintenance:reset"
    ],
};

export const permissionTranslations: { [key: string]: string } = {
    "dashboard:access": "Acceso al Panel", "quotes:create": "Cotizador: Crear", "quotes:generate": "Cotizador: Generar PDF", "quotes:drafts:create": "Borradores: Crear", "quotes:drafts:read": "Borradores: Cargar", "quotes:drafts:delete": "Borradores: Eliminar",
    "requests:read": "Compras: Leer", "requests:read:all": "Compras: Leer Todo", "requests:create": "Compras: Crear", "requests:create:duplicate": "Compras: Crear Duplicados", "requests:notes:add": "Compras: Añadir Notas",
    "requests:edit:pending": "Compras: Editar (Pendientes)", "requests:edit:approved": "Compras: Editar (Aprobadas)", "requests:status:review": "Compras: Enviar a Revisión", "requests:status:pending-approval": "Compras: Enviar a Aprobación", "requests:reopen": "Compras: Reabrir", "requests:status:approve": "Compras: Aprobar", "requests:status:ordered": "Compras: Marcar como Ordenada", "requests:status:received-in-warehouse": "Compras: Recibir en Bodega", "requests:status:entered-erp": "Compras: Ingresar a ERP", "requests:status:cancel": "Compras: Cancelar", "requests:status:revert-to-approved": "Compras: Revertir a Aprobada", "requests:status:unapproval-request": "Compras: Solicitar Desaprobación", "requests:status:unapproval-request:approve": "Compras: Aprobar Desaprobación",
    "planner:read": "Plan.: Leer Órdenes", "planner:read:all": "Plan.: Leer Todas las Órdenes", "planner:create": "Plan.: Crear Órdenes",
    "planner:edit:pending": "Plan.: Editar (Pendientes)", "planner:edit:approved": "Plan.: Editar (Aprobadas)", "planner:reopen": "Plan.: Reabrir Órdenes", "planner:receive": "Plan.: Recibir en Bodega", "planner:status:review": "Plan.: Enviar a Revisión", "planner:status:approve": "Plan.: Cambiar a Aprobada", "planner:status:in-progress": "Plan.: Cambiar a En Progreso", "planner:status:on-hold": "Plan.: Cambiar a En Espera", 
    "planner:status:completed": "Plan.: Cambiar a Completada", "planner:status:cancel": "Plan.: Cancelar (Pendientes)", "planner:status:cancel-approved": "Plan.: Cancelar (Aprobadas)", "planner:priority:update": "Plan.: Cambiar Prioridad", "planner:machine:assign": "Plan.: Asignar Máquina", "planner:status:unapprove-request": "Plan.: Solicitar Desaprobación", "planner:schedule": "Plan.: Programar Fechas",
    "cost-assistant:access": "Asist. Costos: Acceso", "cost-assistant:drafts:read-write": "Asist. Costos: Guardar Borradores",
    "warehouse:access": "Almacén: Acceso General", "warehouse:inventory:assign": "Almacén: Asignar Inventario", "warehouse:locations:manage": "Almacén: Gestionar Ubicaciones", "warehouse:units:manage": "Almacén: Gestionar Unidades (QR)", "warehouse:locks:manage": "Almacén: Gestionar Bloqueos",
    "hacienda:query": "Hacienda: Realizar Consultas",
    "analytics:read": "Analíticas: Acceso", "analytics:purchase-suggestions:read": "Analíticas: Sugerencias Compra", "analytics:purchase-report:read": "Analíticas: Reporte Compras", "analytics:production-report:read": "Analíticas: Reporte Producción", "analytics:transits-report:read": "Analíticas: Reporte Tránsitos", "analytics:user-permissions:read": "Analíticas: Reporte Permisos", "analytics:physical-inventory-report:read": "Analíticas: Reporte Inv. Físico",
    "users:create": "Usuarios: Crear", "users:read": "Usuarios: Leer", "users:update": "Usuarios: Actualizar", "users:delete": "Usuarios: Eliminar",
    "roles:create": "Roles: Crear", "roles:read": "Roles: Leer", "roles:update": "Roles: Actualizar", "roles:delete": "Roles: Eliminar",
    "admin:settings:general": "Admin: Config. General", "admin:settings:api": "Admin: Config. de API", "admin:settings:planner": "Admin: Config. Planificador", "admin:settings:requests": "Admin: Config. Compras", "admin:settings:warehouse": "Admin: Config. Almacenes", "admin:settings:stock": "Admin: Config. Inventario", "admin:settings:cost-assistant": "Admin: Config. Asist. Costos",
    "admin:suggestions:read": "Admin: Leer Sugerencias",
    "admin:import:run": "Admin: Ejecutar Sincronización ERP", "admin:import:files": "Admin: Importar (Archivos)", "admin:import:sql": "Admin: Importar (SQL)", "admin:import:sql-config": "Admin: Configurar SQL",
    "admin:logs:read": "Admin: Ver Registros (Logs)", "admin:logs:clear": "Admin: Limpiar Registros (Logs)",
    "admin:maintenance:backup": "Admin: Mantenimiento (Backup)", "admin:maintenance:restore": "Admin: Mantenimiento (Restaurar)", "admin:maintenance:reset": "Admin: Mantenimiento (Resetear)",
};


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
        icon: Sheet,
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
