/**
 * @fileoverview Hook to manage the logic for the production report page.
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getProductionReportData } from '@/modules/analytics/lib/actions';
import type { DateRange, ProductionOrder, PlannerSettings, ProductionOrderPriority, Product, PlannerMachine } from '@/modules/core/types';
import { subDays, startOfDay, format, parseISO } from 'date-fns';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { cn } from '@/lib/utils';
import React from 'react';
import { useDebounce } from 'use-debounce';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';

export interface ProductionReportDetail extends ProductionOrder {
    completionDate: string | null;
    productionDurationDays: number | null;
    totalCycleDays: number | null;
}

export interface ProductionReportData {
    details: ProductionReportDetail[];
}

const availableColumns = [
    { id: 'consecutive', label: 'OP' },
    { id: 'customerName', label: 'Cliente' },
    { id: 'purchaseOrder', label: 'OC Cliente' },
    { id: 'productDescription', label: 'Producto' },
    { id: 'priority', label: 'Prioridad' },
    { id: 'machineId', label: 'Asignación' },
    { id: 'quantity', label: 'Solicitado', align: 'right' },
    { id: 'deliveredQuantity', label: 'Producido', align: 'right' },
    { id: 'defectiveQuantity', label: 'Defectuoso', align: 'right' },
    { id: 'netDifference', label: 'Dif. Neta', align: 'right' },
    { id: 'inventory', label: 'Inv. Manual (Crea)', align: 'right' },
    { id: 'inventoryErp', label: 'Inv. ERP (Crea)', align: 'right' },
    { id: 'requestDate', label: 'Fecha Solicitud' },
    { id: 'deliveryDate', label: 'Fecha Requerida' },
    { id: 'scheduledDate', label: 'Fecha Programada' },
    { id: 'completionDate', label: 'Fecha Completada' },
    { id: 'productionDurationDays', label: 'Días Producción', align: 'right' },
    { id: 'totalCycleDays', label: 'Días Ciclo Total', align: 'right' },
    { id: 'requestedBy', label: 'Solicitante' },
];

interface State {
    isLoading: boolean;
    dateRange: DateRange;
    reportData: ProductionReportData;
    plannerSettings: PlannerSettings | null;
    visibleColumns: string[];
    // Filters
    productSearchTerm: string;
    productFilter: string | null;
    isProductSearchOpen: boolean;
    classificationFilter: string[];
    machineFilter: string[];
}

const priorityConfig: { [key in ProductionOrderPriority]: { label: string, className: string } } = { 
    low: { label: "Baja", className: "text-gray-500" }, 
    medium: { label: "Media", className: "text-blue-500" }, 
    high: { label: "Alta", className: "text-yellow-600" }, 
    urgent: { label: "Urgente", className: "text-red-600" }
};

export function useProductionReport() {
    const { isAuthorized } = useAuthorization(['analytics:read', 'analytics:production-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData: authCompanyData, products: authProducts } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: false,
        dateRange: {
            from: startOfDay(subDays(new Date(), 30)),
            to: startOfDay(new Date()),
        },
        reportData: { details: [] },
        plannerSettings: null,
        visibleColumns: ['consecutive', 'customerName', 'productDescription', 'quantity', 'deliveredQuantity', 'defectiveQuantity', 'netDifference', 'completionDate'],
        productSearchTerm: '',
        productFilter: null,
        isProductSearchOpen: false,
        classificationFilter: [],
        machineFilter: [],
    });

    const [debouncedProductSearch] = useDebounce(state.productSearchTerm, 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const handleAnalyze = useCallback(async () => {
        if (!isAuthorized) return;
        updateState({ isLoading: true });
        try {
            if (!state.dateRange.from) {
                toast({ title: "Fecha de inicio requerida", variant: "destructive" });
                return;
            }
            const data = await getProductionReportData({
                dateRange: state.dateRange,
                filters: {
                    productId: state.productFilter,
                    classifications: state.classificationFilter,
                    machineIds: state.machineFilter,
                }
            });
            updateState({ reportData: data.reportData, plannerSettings: data.plannerSettings });
        } catch (error: any) {
            logError("Failed to get production report", { error: error.message });
            toast({ title: "Error al Generar Reporte", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isLoading: false });
            if (isInitialLoading) setIsInitialLoading(false);
        }
    }, [isAuthorized, state.dateRange, state.productFilter, state.classificationFilter, state.machineFilter, toast, updateState, isInitialLoading]);
    
    useEffect(() => {
        setTitle("Reporte de Producción");
        const loadPrefsAndData = async () => {
             if(user) {
                const prefs = await getUserPreferences(user.id, 'productionReportPrefs');
                if (prefs && prefs.visibleColumns) {
                    updateState({ visibleColumns: prefs.visibleColumns });
                }
            }
            await handleAnalyze();
        };

        if (isAuthorized) {
            loadPrefsAndData();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTitle, isAuthorized, user?.id]);

    const handleColumnVisibilityChange = (columnId: string, checked: boolean) => {
        updateState({
            visibleColumns: checked
                ? [...state.visibleColumns, columnId]
                : state.visibleColumns.filter(id => id !== columnId)
        });
    };

    const handleSaveColumnVisibility = async () => {
        if (!user) return;
        try {
            await saveUserPreferences(user.id, 'productionReportPrefs', { visibleColumns: state.visibleColumns });
            toast({ title: "Preferencias Guardadas", description: "La visibilidad de las columnas ha sido guardada." });
        } catch (error: any) {
            logError("Failed to save production report column visibility", { error: error.message });
            toast({ title: "Error", description: "No se pudo guardar la configuración de columnas.", variant: "destructive" });
        }
    };


    const getNetDifference = (item: ProductionReportDetail) => (item.deliveredQuantity ?? 0) - (item.defectiveQuantity ?? 0) - item.quantity;
    
    const getColumnContent = (item: ProductionReportDetail, colId: string): { content: React.ReactNode, className?: string } => {
        switch (colId) {
            case 'consecutive': return { content: item.consecutive };
            case 'customerName': return { content: item.customerName };
            case 'purchaseOrder': return { content: item.purchaseOrder || 'N/A' };
            case 'productDescription': return { content: <><p className="font-medium">{item.productDescription}</p><p className="text-xs text-muted-foreground">{item.productId}</p></> };
            case 'priority': return { content: priorityConfig[item.priority]?.label, className: cn("font-medium", priorityConfig[item.priority]?.className) };
            case 'machineId': return { content: state.plannerSettings?.machines.find(m => m.id === item.machineId)?.name || 'N/A' };
            case 'quantity': return { content: item.quantity.toLocaleString('es-CR'), className: 'text-right' };
            case 'deliveredQuantity': return { content: (item.deliveredQuantity ?? 0).toLocaleString('es-CR'), className: 'text-right' };
            case 'defectiveQuantity': return { content: (item.defectiveQuantity ?? 0).toLocaleString('es-CR'), className: 'text-right text-red-600' };
            case 'netDifference': const diff = getNetDifference(item); return { content: diff.toLocaleString('es-CR'), className: cn("text-right font-bold", diff < 0 ? 'text-destructive' : 'text-green-600') };
            case 'inventory': return { content: (item.inventory ?? 0).toLocaleString('es-CR'), className: 'text-right' };
            case 'inventoryErp': return { content: (item.inventoryErp ?? 0).toLocaleString('es-CR'), className: 'text-right' };
            case 'requestDate': return { content: item.requestDate ? format(parseISO(item.requestDate), 'dd/MM/yyyy') : 'N/A' };
            case 'deliveryDate': return { content: item.deliveryDate ? format(parseISO(item.deliveryDate), 'dd/MM/yyyy') : 'N/A' };
            case 'scheduledDate': return { content: (item.scheduledStartDate && item.scheduledEndDate) ? `${format(parseISO(item.scheduledStartDate), 'dd/MM/yy')} - ${format(parseISO(item.scheduledEndDate), 'dd/MM/yy')}` : 'N/A' };
            case 'completionDate': return { content: item.completionDate ? format(parseISO(item.completionDate), 'dd/MM/yyyy') : 'N/A' };
            case 'productionDurationDays': return { content: item.productionDurationDays !== null ? `${item.productionDurationDays} día(s)` : 'N/A', className: 'text-right' };
            case 'totalCycleDays': return { content: item.totalCycleDays !== null ? `${item.totalCycleDays} día(s)` : 'N/A', className: 'text-right' };
            case 'requestedBy': return { content: item.requestedBy };
            default: return { content: '' };
        }
    };
    
    const visibleColumnsData = useMemo(() => {
        return state.visibleColumns.map(id => availableColumns.find(col => col.id === id)).filter(Boolean) as (typeof availableColumns)[0][];
    }, [state.visibleColumns]);

    const handleExportExcel = () => {
        const headers = visibleColumnsData.map(col => col.label);
        const dataToExport = state.reportData.details.map(item =>
            state.visibleColumns.map(colId => {
                const colContent = getColumnContent(item, colId).content;
                // A simple way to strip JSX for Excel export, might need refinement
                if (React.isValidElement(colContent)) {
                    // For the product description case, concatenate the parts
                    if (colId === 'productDescription') {
                        return `${item.productDescription} (${item.productId})`
                    }
                    return React.Children.toArray(colContent).join(' ');
                }
                return colContent?.toString() || '';
            })
        );

        exportToExcel({
            fileName: 'reporte_produccion',
            sheetName: 'Producción',
            headers,
            data: dataToExport,
        });
    };

    const handleExportPDF = async (orientation: 'portrait' | 'landscape' = 'landscape') => {
        if (!authCompanyData || !state.plannerSettings) return;

        let logoDataUrl: string | null = null;
        if (authCompanyData.logoUrl) {
            try {
                const response = await fetch(authCompanyData.logoUrl);
                const blob = await response.blob();
                logoDataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            } catch (e) { console.error("Error processing logo for PDF:", e); }
        }

        const tableHeaders = visibleColumnsData.map(col => col.label);
        const tableRows = state.reportData.details.map(item =>
            state.visibleColumns.map(colId => {
                const colContent = getColumnContent(item, colId).content;
                if (React.isValidElement(colContent)) {
                     if (colId === 'productDescription') {
                        return `${item.productDescription}\n${item.productId}`;
                    }
                    return React.Children.toArray(colContent).join(' ');
                }
                return colContent?.toString() || '';
            })
        );

        const doc = generateDocument({
            docTitle: "Reporte de Producción", docId: '', companyData: authCompanyData, logoDataUrl,
            meta: [
                { label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') },
                { label: 'Rango de Fechas', value: `${format(state.dateRange.from!, 'dd/MM/yy')} - ${format(state.dateRange.to!, 'dd/MM/yy')}` },
            ],
            blocks: [],
            table: { columns: tableHeaders, rows: tableRows },
            totals: [],
            orientation,
        });

        doc.save(`reporte_produccion_${new Date().getTime()}.pdf`);
    };

    const setProductFilter = (productId: string | null) => {
        if (productId) {
            const product = authProducts.find(p => p.id === productId);
            if (product) {
                updateState({ productFilter: productId, productSearchTerm: `[${product.id}] ${product.description}` });
            }
        } else {
            updateState({ productFilter: null, productSearchTerm: '' });
        }
    };
    
    return {
        state,
        actions: {
            setDateRange: (range: DateRange | undefined) => updateState({ dateRange: range || { from: undefined, to: undefined } }),
            handleAnalyze, handleExportExcel, handleExportPDF, handleColumnVisibilityChange,
            handleSaveColumnVisibility,
            setProductFilter,
            setProductSearchTerm: (term: string) => updateState({ productSearchTerm: term }),
            setProductSearchOpen: (isOpen: boolean) => updateState({ isProductSearchOpen: isOpen }),
            setClassificationFilter: (filter: string[]) => updateState({ classificationFilter: filter }),
            setMachineFilter: (filter: string[]) => updateState({ machineFilter: filter }),
            handleClearFilters: () => updateState({
                productFilter: null,
                productSearchTerm: '',
                classificationFilter: [],
                machineFilter: [],
            }),
        },
        selectors: {
            availableColumns,
            productOptions: useMemo(() => {
                if (debouncedProductSearch.length < 2) return [];
                return authProducts
                    .filter(p => 
                        p.id.toLowerCase().includes(debouncedProductSearch.toLowerCase()) || 
                        p.description.toLowerCase().includes(debouncedProductSearch.toLowerCase())
                    )
                    .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
            }, [debouncedProductSearch, authProducts]),
            classifications: useMemo<string[]>(() => 
                Array.from(new Set(authProducts.map(p => p.classification).filter(Boolean)))
            , [authProducts]),
            machines: useMemo<PlannerMachine[]>(() => state.plannerSettings?.machines || [], [state.plannerSettings]),
            getColumnContent,
            visibleColumnsData,
        },
        isAuthorized,
        isInitialLoading,
    };
}
