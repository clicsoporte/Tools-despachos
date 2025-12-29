/**
 * @fileoverview Hook to manage the logic for the new receiving report page.
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getReceivingReportData } from '@/modules/analytics/lib/actions';
import type { DateRange, InventoryUnit, Product, WarehouseLocation } from '@/modules/core/types';
import { subDays, startOfDay, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDebounce } from 'use-debounce';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { generateDocument } from '@/modules/core/lib/pdf-generator';

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

interface State {
    isLoading: boolean;
    data: InventoryUnit[];
    allLocations: WarehouseLocation[];
    dateRange: DateRange;
    searchTerm: string;
    userFilter: string[];
    locationFilter: string[];
}

export function useReceivingReport() {
    const { isAuthorized } = useAuthorization(['analytics:receiving-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData, user, products } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: false,
        data: [],
        allLocations: [],
        dateRange: {
            from: startOfDay(subDays(new Date(), 7)),
            to: new Date(),
        },
        searchTerm: '',
        userFilter: [],
        locationFilter: [],
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const fetchData = useCallback(async () => {
        updateState({ isLoading: true });
        try {
            const data = await getReceivingReportData({ dateRange: state.dateRange });
            updateState({ 
                data: data.units, 
                allLocations: data.locations 
            });
        } catch (error: any) {
            logError("Failed to fetch receiving report data", { error: error.message });
            toast({ title: "Error al Generar Reporte", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isLoading: false });
        }
    }, [state.dateRange, toast, updateState]);
    
    useEffect(() => {
        setTitle("Reporte de Recepciones");
        const loadInitial = async () => {
             await fetchData();
             setIsInitialLoading(false);
        }
        if (isAuthorized) {
            loadInitial();
        }
    }, [setTitle, isAuthorized, fetchData]);
    
    const sortedData = useMemo(() => {
        let filtered = state.data;
        
        if (debouncedSearchTerm) {
            const searchLower = normalizeText(debouncedSearchTerm);
            filtered = filtered.filter(item => {
                const product = products.find(p => p.id === item.productId);
                return (
                    normalizeText(item.productId).includes(searchLower) ||
                    normalizeText(product?.description).includes(searchLower) ||
                    normalizeText(item.humanReadableId).includes(searchLower) ||
                    normalizeText(item.documentId).includes(searchLower)
                );
            });
        }

        if (state.userFilter.length > 0) {
            filtered = filtered.filter(item => state.userFilter.includes(item.createdBy));
        }

        if (state.locationFilter.length > 0) {
            filtered = filtered.filter(item => item.locationId && state.locationFilter.includes(String(item.locationId)));
        }

        return filtered.sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());
    }, [state.data, debouncedSearchTerm, state.userFilter, state.locationFilter, products]);

    const getLocationPath = useCallback((locationId: number | null): string => {
        if (!locationId) return 'N/A';
        const path: string[] = [];
        let current = state.allLocations.find(l => l.id === locationId);
        while(current) {
            path.unshift(current.name);
            current = current.parentId ? state.allLocations.find(l => l.id === current.parentId) : undefined;
        }
        return path.join(' > ');
    }, [state.allLocations]);

    const getProductDescription = useCallback((productId: string): string => {
        return products.find(p => p.id === productId)?.description || 'Producto Desconocido';
    }, [products]);
    
    const handleExportExcel = () => {
        const dataToExport = sortedData.map(item => ({
            'Fecha': format(parseISO(item.createdAt), 'dd/MM/yyyy HH:mm'),
            'Código Producto': item.productId,
            'Descripción': getProductDescription(item.productId),
            'Nº Lote / ID Físico': item.humanReadableId || 'N/A',
            'Documento': item.documentId || 'N/A',
            'Ubicación': getLocationPath(item.locationId),
            'Cantidad': (item as any).quantity || 1,
            'Usuario': item.createdBy,
        }));

        exportToExcel({
            fileName: 'reporte_recepciones',
            sheetName: 'Recepciones',
            headers: Object.keys(dataToExport[0] || {}),
            data: dataToExport.map(item => Object.values(item)),
            columnWidths: [20, 15, 40, 20, 20, 30, 10, 20],
        });
    };
    
    const handleExportPDF = () => {
         if (!companyData) return;
        const tableHeaders = ["Fecha", "Producto", "Lote/ID", "Documento", "Ubicación", "Cant.", "Usuario"];
        const tableRows = sortedData.map(item => [
            format(parseISO(item.createdAt), 'dd/MM/yy HH:mm'),
            `${getProductDescription(item.productId)}\n(${item.productId})`,
            item.humanReadableId || 'N/A',
            item.documentId || 'N/A',
            getLocationPath(item.locationId),
            (item as any).quantity || 1,
            item.createdBy,
        ]);
        const doc = generateDocument({
            docTitle: "Reporte de Recepciones y Movimientos", docId: '', companyData,
            meta: [{ label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
            blocks: [],
            table: { columns: tableHeaders, rows: tableRows },
            totals: [], orientation: 'landscape'
        });
        doc.save('reporte_recepciones.pdf');
    };

    const actions = {
        setDateRange: (range: DateRange | undefined) => updateState({ dateRange: range || { from: undefined, to: undefined } }),
        setSearchTerm: (term: string) => updateState({ searchTerm: term }),
        setUserFilter: (filter: string[]) => updateState({ userFilter: filter }),
        setLocationFilter: (filter: string[]) => updateState({ locationFilter: filter }),
        handleClearFilters: () => updateState({ searchTerm: '', userFilter: [], locationFilter: [] }),
        handleExportExcel,
        handleExportPDF,
    };

    const selectors = {
        sortedData,
        userOptions: useMemo(() => Array.from(new Set(state.data.map(item => item.createdBy))).map(u => ({ value: u, label: u })), [state.data]),
        locationOptions: useMemo(() => state.allLocations.map(l => ({ value: String(l.id), label: getLocationPath(l.id) })), [state.allLocations, getLocationPath]),
        getLocationPath,
        getProductDescription,
    };
    
    return {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    };
}
