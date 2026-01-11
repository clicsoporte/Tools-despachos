/**
 * @fileoverview Server Actions for the Analytics module.
 */
'use server';

import { getAllRoles, getAllSuppliers, getAllStock, getAllProducts, getUserPreferences, saveUserPreferences, getAllErpPurchaseOrderHeaders, getAllErpPurchaseOrderLines, getPublicUrl, getAllItemLocations as getAllItemLocationsServer } from '@/modules/core/lib/db';
import { getInventoryUnits as getPhysicalInventory, getLocations as getWarehouseLocationsServer } from '@/modules/warehouse/lib/actions';
import type { DateRange, ProductionOrder, PlannerSettings, ProductionOrderHistoryEntry, Product, User, Role, ErpPurchaseOrderLine, ErpPurchaseOrderHeader, Supplier, StockInfo, InventoryUnit, WarehouseLocation, PhysicalInventoryComparisonItem, ItemLocation } from '@/modules/core/types';
import { differenceInDays, parseISO } from 'date-fns';
import type { ProductionReportDetail, ProductionReportData } from '../hooks/useProductionReport';
import { logError } from '@/modules/core/lib/logger';
import type { TransitReportItem } from '../hooks/useTransitsReport';
import { getPlannerSettings, getCompletedOrdersByDateRange } from '@/modules/planner/lib/actions';
import { reformatEmployeeName } from '@/lib/utils';
import { renderLocationPathAsString } from '@/modules/warehouse/lib/utils';
import { getAllUsersForReport } from '@/modules/core/lib/auth';

interface ReportFilters {
    productId?: string | null;
    classifications?: string[];
    machineIds?: string[];
}

interface FullProductionReportData {
    reportData: ProductionReportData;
    plannerSettings: PlannerSettings;
}

/**
 * Fetches and processes data for the production report.
 * @param dateRange - The date range to filter production orders.
 * @param filters - Additional filters for product, classification, or machine.
 * @returns A promise that resolves to the structured production report data, including planner settings.
 */
export async function getProductionReportData(options: { dateRange: DateRange, filters?: ReportFilters }): Promise<FullProductionReportData> {
    const { dateRange, filters } = options;
    
    let allOrders = await getCompletedOrdersByDateRange(dateRange, filters);

    const details: ProductionReportDetail[] = allOrders.map((order) => {
        const history = order.history || [];
        
        const completionEntry = history.find((h: ProductionOrderHistoryEntry) => h.status === 'completed' || h.status === 'received-in-warehouse');
        const startEntry = history.find((h: ProductionOrderHistoryEntry) => h.status === 'in-progress');
        
        const completionDate = completionEntry?.timestamp || null;
        
        let productionDurationDays: number | null = null;
        if (startEntry?.timestamp && completionDate) {
            productionDurationDays = differenceInDays(parseISO(completionDate), parseISO(startEntry.timestamp));
        }

        let totalCycleDays: number | null = null;
        if (order.requestDate && completionDate) {
            totalCycleDays = differenceInDays(parseISO(completionDate), parseISO(order.requestDate));
        }
        
        return {
            ...order,
            completionDate,
            productionDurationDays,
            totalCycleDays,
        };
    });

    const plannerSettings = await getPlannerSettings();

    return {
        reportData: {
            details: JSON.parse(JSON.stringify(details)),
        },
        plannerSettings: JSON.parse(JSON.stringify(plannerSettings)),
    };
}


export async function getUserPermissionsReportData(): Promise<{ users: User[], roles: Role[] }> {
    try {
        const [users, roles] = await Promise.all([
            getAllUsersForReport(),
            getAllRoles()
        ]);
        return { users, roles };
    } catch (error: any) {
        logError("Failed to fetch user permissions report data", { error: error.message });
        throw new Error("No se pudieron obtener los datos para el reporte de permisos.");
    }
}


export async function getActiveTransitsReportData(dateRange: DateRange): Promise<TransitReportItem[]> {
    if (!dateRange.from) {
        throw new Error("Date 'from' is required for the transits report.");
    }
    const toDate = dateRange.to || new Date();
    toDate.setHours(23, 59, 59, 999);

    const [allHeaders, allLines, allSuppliers, allProducts, allStock] = await Promise.all([
        getAllErpPurchaseOrderHeaders(),
        getAllErpPurchaseOrderLines(),
        getAllSuppliers(),
        getAllProducts(),
        getAllStock(),
    ]);

    const supplierMap = new Map<string, string>(allSuppliers.map((s: Supplier) => [s.id, s.name]));
    const productMap = new Map<string, string>(allProducts.map((p: Product) => [p.id, p.description]));
    const stockMap = new Map<string, number>(allStock.map((s: StockInfo) => [s.itemId, s.totalStock]));

    const filteredHeaders = allHeaders.filter((h: ErpPurchaseOrderHeader) => {
        const orderDate = new Date(h.FECHA_HORA);
        return h.ESTADO === 'A' && orderDate >= dateRange.from! && orderDate <= toDate;
    });

    const headerIds = new Set(filteredHeaders.map((h: ErpPurchaseOrderHeader) => h.ORDEN_COMPRA));

    const reportData: TransitReportItem[] = allLines
        .filter((line: ErpPurchaseOrderLine) => headerIds.has(line.ORDEN_COMPRA))
        .map((line: ErpPurchaseOrderLine) => {
            const header = filteredHeaders.find((h: ErpPurchaseOrderHeader) => h.ORDEN_COMPRA === line.ORDEN_COMPRA)!;
            const fechaHora = header.FECHA_HORA;
            const fechaHoraString = typeof fechaHora === 'object' && fechaHora !== null && 'toISOString' in fechaHora ? (fechaHora as Date).toISOString() : String(fechaHora);

            return {
                ...line,
                FECHA_HORA: fechaHoraString,
                ESTADO: header.ESTADO,
                PROVEEDOR: header.PROVEEDOR,
                CreatedBy: header.CreatedBy,
                proveedorName: supplierMap.get(header.PROVEEDOR) || header.PROVEEDOR,
                productDescription: productMap.get(line.ARTICULO) || 'Artículo no encontrado',
                currentStock: stockMap.get(line.ARTICULO) || 0,
            };
        });

    return JSON.parse(JSON.stringify(reportData));
}


export async function getReceivingReportData({ dateRange }: { dateRange?: DateRange }): Promise<{ units: InventoryUnit[], locations: WarehouseLocation[] }> {
    try {
        const [units, locations] = await Promise.all([
            getPhysicalInventory(dateRange),
            getWarehouseLocationsServer(),
        ]);
        return { units, locations };
    } catch (error) {
        logError('Failed to generate receiving report data', { error });
        throw new Error('No se pudo generar el reporte de recepciones.');
    }
}


export async function getPhysicalInventoryReportData({ dateRange }: { dateRange?: DateRange }): Promise<{ comparisonData: PhysicalInventoryComparisonItem[], allLocations: WarehouseLocation[] }> {
    try {
        const [physicalInventory, erpStock, allProducts, allLocations] = await Promise.all([
            getPhysicalInventory(dateRange),
            getAllStock(),
            getAllProducts(),
            getWarehouseLocationsServer(),
        ]);
        
        const allItemLocations = await getAllItemLocationsServer();
        
        const erpStockMap = new Map<string, number>(erpStock.map((item: StockInfo) => [item.itemId, item.totalStock]));
        const productMap = new Map(allProducts.map((item: Product) => [item.id, item.description]));
        const locationMap = new Map(allLocations.map((item: WarehouseLocation) => [item.id, item]));
        const itemLocationMap = new Map<string, string>();
        allItemLocations.forEach((itemLoc: ItemLocation) => {
            itemLocationMap.set(itemLoc.itemId, renderLocationPathAsString(itemLoc.locationId, allLocations));
        });

        const comparisonData: PhysicalInventoryComparisonItem[] = physicalInventory.map((item: InventoryUnit) => {
            const erpQuantity = erpStockMap.get(item.productId) ?? 0;
            const location = locationMap.get(item.locationId!);
            return {
                productId: item.productId,
                productDescription: productMap.get(item.productId) || 'Producto Desconocido',
                locationId: item.locationId!,
                locationName: location?.name || 'Ubicación Desconocida',
                locationCode: location?.code || 'N/A',
                physicalCount: item.quantity,
                erpStock: erpQuantity,
                difference: Number(item.quantity) - erpQuantity,
                lastCountDate: item.createdAt,
                updatedBy: item.createdBy || 'N/A',
                assignedLocationPath: itemLocationMap.get(item.productId) || 'Sin Asignar',
            };
        });

        return JSON.parse(JSON.stringify({ comparisonData, allLocations: allLocations }));
    } catch (error) {
        logError('Failed to generate physical inventory comparison report', { error });
        throw new Error('No se pudo generar el reporte de inventario físico.');
    }
}
