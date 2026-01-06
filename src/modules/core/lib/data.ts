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
  ClipboardList,
  Bell,
} from "lucide-react";
import { allAdminPermissions } from "./permissions";

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
        id: "warehouse-search-simple",
        name: "Búsqueda Rápida",
        description: "Escanear o buscar un artículo para una consulta rápida.",
        href: "/dashboard/warehouse/search/simple",
        icon: QrCode,
        bgColor: 'bg-sky-600',
    },
    {
        id: "warehouse-search",
        name: "Consulta de Almacén",
        description: "Localizar artículos, clientes y unidades de inventario.",
        href: "/dashboard/warehouse/search",
        icon: Search,
        bgColor: 'bg-blue-600',
    },
    {
        id: "warehouse-dispatch-check",
        name: "Chequeo de Despacho",
        description: "Verificar artículos de una factura antes de cargar al camión.",
        href: "/dashboard/warehouse/dispatch-check",
        icon: ClipboardCheck,
        bgColor: 'bg-sky-700',
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
        name: "Ubicaciones por Producto",
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
        name: "Gestión de Lotes/Tarimas",
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
        id: 'lock-management',
        name: 'Gestionar Bloqueos',
        description: 'Ver y liberar racks o niveles que están siendo editados.',
        href: '/dashboard/warehouse/locks',
        icon: Lock,
        bgColor: 'bg-slate-500',
    }
];

/**
 * Default roles and their permissions.
 * The 'viewer' role has been removed. Only the 'admin' role is defined by default.
 */
export const initialRoles: Role[] = [
  {
    id: "admin",
    name: "Admin",
    permissions: allAdminPermissions,
  },
];


/**
 * List of tools available in the admin section.
 */
export const adminTools: Tool[] = [
    {
        id: "users:read",
        name: "Gestión de Usuarios",
        description: "Añadir, editar y gestionar usuarios y sus roles.",
        href: "/dashboard/admin/users",
        icon: Users,
        bgColor: 'bg-blue-500',
      },
      {
        id: "roles:read",
        name: "Gestión de Roles",
        description: "Definir roles y asignar permisos granulares.",
        href: "/dashboard/admin/roles",
        icon: ShieldCheck,
        bgColor: 'bg-green-600',
      },
      {
        id: "admin:settings:general",
        name: "Configuración General",
        description: "Gestionar los datos de la empresa y logo.",
        href: "/dashboard/admin/general",
        icon: Briefcase,
        bgColor: 'bg-orange-500',
      },
      {
        id: "admin:settings:email",
        name: "Configuración de Correo",
        description: "Ajustes del servidor SMTP para enviar correos.",
        href: "/dashboard/admin/email",
        icon: Mail,
        bgColor: 'bg-purple-600',
      },
      {
        id: "admin:notifications:read",
        name: "Gestor de Notificaciones",
        description: "Crear y gestionar reglas de notificación automática.",
        href: "/dashboard/admin/notifications",
        icon: Bell,
        bgColor: 'bg-fuchsia-600',
      },
      {
        id: "admin:suggestions:read",
        name: "Buzón de Sugerencias",
        description: "Revisar el feedback enviado por los usuarios del sistema.",
        href: "/dashboard/admin/suggestions",
        icon: MessageSquare,
        bgColor: 'bg-green-700',
      },
      {
        id: "admin:settings:quoter",
        name: "Config. Cotizador",
        description: "Gestionar prefijos y consecutivos del cotizador.",
        href: "/dashboard/admin/quoter", 
        icon: Sheet,
        bgColor: 'bg-blue-600',
      },
      {
        id: "admin:settings:cost-assistant",
        name: "Config. Asist. Costos",
        description: "Gestionar ajustes para el asistente de costos.",
        href: "/dashboard/admin/cost-assistant",
        icon: Calculator,
        bgColor: 'bg-orange-500',
      },
      {
        id: "admin:import:run",
        name: "Importar Datos",
        description: "Cargar clientes, productos, exoneraciones y...",
        href: "/dashboard/admin/import",
        icon: FileUp,
        bgColor: 'bg-cyan-700',
      },
       {
        id: "admin:maintenance:backup",
        name: "Mantenimiento",
        description: "Backup, restauración y reseteo del sistema.",
        href: "/dashboard/admin/maintenance",
        icon: ServerCog,
        bgColor: 'bg-red-600',
      },
      {
        id: "admin:settings:api",
        name: "Configuración de API",
        description: "Gestionar URLs y claves de APIs externas.",
        href: "/dashboard/admin/api",
        icon: Network,
        bgColor: 'bg-indigo-500',
      },
       {
        id: "admin:settings:planner",
        name: "Config. Planificador",
        description: "Gestionar máquinas y otros ajustes del...",
        href: "/dashboard/admin/planner",
        icon: Factory,
        bgColor: 'bg-slate-600',
      },
       {
        id: "admin:settings:requests",
        name: "Config. Compras",
        description: "Gestionar rutas y otros ajustes de compras.",
        href: "/dashboard/admin/requests",
        icon: Store,
        bgColor: 'bg-amber-700',
      },
      {
        id: "admin:settings:warehouse",
        name: "Config. Almacenes e Inventario",
        description: "Gestionar bodegas, unidades y jerarquía del almacén.",
        href: "/dashboard/admin/warehouse",
        icon: Wrench,
        bgColor: 'bg-purple-600',
      },
      {
        id: "admin:logs:read",
        name: "Visor de Eventos",
        description: "Revisar los registros y errores del sistema.",
        href: "/dashboard/admin/logs",
        icon: FileTerminal,
        bgColor: 'bg-gray-500',
      }
];

export const analyticsTools: Tool[] = [
    {
        id: "analytics:purchase-suggestions:read",
        name: "Sugerencias de Compra",
        description: "Analizar pedidos y stock para sugerir compras proactivas.",
        href: "/dashboard/analytics/purchase-suggestions",
        icon: Lightbulb,
        bgColor: "bg-blue-600",
    },
    {
        id: "analytics:purchase-report:read",
        name: "Reporte de Compras",
        description: "Visualizar y exportar un reporte histórico de compras.",
        href: "/dashboard/analytics/purchase-report",
        icon: FileText,
        bgColor: "bg-green-600",
    },
     {
        id: "analytics:transits-report:read",
        name: "Reporte de Tránsitos",
        description: "Monitorear órdenes de compra del ERP activas y en tránsito.",
        href: "/dashboard/analytics/transits-report",
        icon: Truck,
        bgColor: "bg-orange-500",
    },
    {
        id: "analytics:production-report:read",
        name: "Reporte de Producción",
        description: "Analizar rendimiento y desperdicio de órdenes completadas.",
        href: "/dashboard/analytics/production-report",
        icon: BarChartBig,
        bgColor: "bg-purple-600",
    },
    {
        id: "analytics:physical-inventory-report:read",
        name: "Reporte de Inventario Físico",
        description: "Comparar conteos físicos con el stock del ERP para encontrar diferencias.",
        href: "/dashboard/analytics/physical-inventory-report",
        icon: ClipboardCheck,
        bgColor: "bg-cyan-600",
    },
    {
        id: "analytics:receiving-report:read",
        name: "Reporte de Recepciones",
        description: "Auditar las recepciones de mercadería registradas en el sistema.",
        href: "/dashboard/analytics/receiving-report",
        icon: ClipboardList,
        bgColor: "bg-teal-600",
    },
    {
        id: "analytics:dispatch-report:read",
        name: "Reporte de Despachos",
        description: "Auditar las verificaciones de despacho realizadas.",
        href: "/dashboard/analytics/dispatch-report",
        icon: ClipboardList,
        bgColor: 'bg-sky-700',
    },
    {
        id: "analytics:user-permissions:read",
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
