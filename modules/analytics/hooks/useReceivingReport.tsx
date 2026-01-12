/**
 * @fileoverview Hook to manage the logic for the new receiving report page.
 * This hook has been rebuilt from scratch to ensure stability and prevent render-cycle errors.
 * It is now a read-only reporting tool.
 */
'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getReceivingReportData } from '@/modules/analytics/lib/actions';
import type { DateRange, InventoryUnit, Product, WarehouseLocation, UserPreferences } from '@/modules/core/types';
import { subDays, startOfDay, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDebounce } from 'use-debounce';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';
import { renderLocationPathAsString } from '@/modules/warehouse/lib/utils';

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const availableColumns = [
    { id: 'createdAt', label: 'Fecha' },
    { id: 'productId', label: 'Código Producto' },
    { id: 'productDescription', label: 'Descripción' },
    { id: 'humanReadableId', label: 'Nº Lote / ID' },
    { id: 'unitCode', label: 'ID Unidad' },
    { id: 'documentId', label: 'Documento' },
    { id: 'locationPath', label: 'Ubicación' },
    { id: 'quantity', label: 'Cantidad' },
    { id: 'createdBy', label: 'Usuario' },
];

interface State {
    isLoading: boolean;
    data: InventoryUnit[];
    allLocations: WarehouseLocation[];
    dateRange: DateRange;
    searchTerm: string;
    userFilter: string[];
    locationFilter: string[];
    visibleColumns: string[];
}

export function useReceivingReport() {
    const { isAuthorized } = useAuthorization(['analytics:receiving-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData, user, products } = useAuth();
    
    const [state, setState] = useState<State>({
        isLoading: true,
        data: [],
        allLocations: [],
        dateRange: {
            from: startOfDay(subDays(new Date(), 7)),
            to: new Date(),
        },
        searchTerm: '',
        userFilter: [],
        locationFilter: [],
        visibleColumns: availableColumns.map(c => c.id),
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, 500);

    useEffect(() => {
        setTitle("Reporte de Recepciones");
    }, [setTitle]);

    useEffect(() => {
        const loadPrefs = async () => {
            if (isAuthorized && user) {
                try {
                    const prefs = await getUserPreferences(user.id, 'receivingReportPrefs');
                    if (prefs && prefs.visibleColumns) {
                        setState(prevState => ({ ...prevState, visibleColumns: prefs.visibleColumns }));
                    }
                } catch (error) {
                    logError('Failed to load user preferences for receiving report.', { error });
                } finally {
                    setState(prevState => ({ ...prevState, isLoading: false }));
                }
            } else if (isAuthorized === false) {
                 setState(prevState => ({...prevState, isLoading: false }));
            }
        };

        if (isAuthorized !== null) {
            loadPrefs();
        }
    }, [isAuthorized, user?.id]);

    const fetchData = useCallback(async () => {
        if (!isAuthorized) return;
        setState(prevState => ({...prevState, isLoading: true }));
        try {
            const data = await getReceivingReportData({ dateRange: state.dateRange });
            setState(prevState => ({
                ...prevState,
                data: data.units, 
                allLocations: data.locations,
                isLoading: false,
            }));
        } catch (error: any) {
            logError("Failed to fetch receiving report data", { error: error.message });
            toast({ title: 'Error', description: 'No se pudieron cargar los registros de recepción.', variant: 'destructive' });
            setState(prevState => ({...prevState, isLoading: false }));
        }
    }, [isAuthorized, state.dateRange, toast]);
    
    const getAllChildLocationIds = useCallback((locationId: number): number[] => {
        let children: number[] = [];
        const queue: number[] = [locationId];
        const processed = new Set<number>();

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (processed.has(currentId)) continue;
            
            children.push(currentId);
            processed.add(currentId);

            const directChildren = state.allLocations
                .filter(l => l.parentId === currentId)
                .map(l => l.id);
            queue.push(...directChildren);
        }
        return children;
    }, [state.allLocations]);

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
                    normalizeText(item.documentId).includes(searchLower) ||
                    normalizeText(item.unitCode).includes(searchLower)
                );
            });
        }

        if (state.userFilter.length > 0) {
            filtered = filtered.filter(item => state.userFilter.includes(item.createdBy));
        }

        if (state.locationFilter.length > 0) {
            const targetLocationIds = new Set<number>();
            state.locationFilter.forEach(locIdStr => {
                getAllChildLocationIds(Number(locIdStr)).forEach(id => targetLocationIds.add(id));
            });
            filtered = filtered.filter(item => item.locationId && targetLocationIds.has(item.locationId));
        }

        return filtered.sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());
    }, [state.data, debouncedSearchTerm, state.userFilter, state.locationFilter, products, getAllChildLocationIds]);

    const getLocationPath = useCallback((locationId: number | null): string => {
        if (!locationId) return 'N/A';
        return renderLocationPathAsString(locationId, state.allLocations);
    }, [state.allLocations]);


    const getProductDescription = useCallback((productId: string): string => {
        return products.find(p => p.id === productId)?.description || 'Producto Desconocido';
    }, [products]);
    
    const handleSavePreferences = async () => {
        if (!user) return;
        try {
            await saveUserPreferences(user.id, 'receivingReportPrefs', { visibleColumns: state.visibleColumns });
            toast({ title: "Preferencias Guardadas" });
        } catch (error: any) {
            logError('Failed to save receiving report preferences', { error: error.message });
            toast({ title: 'Error', description: 'No se pudieron guardar las preferencias.', variant: 'destructive' });
        }
    };
    
    const handleExportExcel = () => {
        const headers = selectors.visibleColumnsData.map(c => c.label);
        const dataToExport = sortedData.map(item => 
            selectors.visibleColumnsData.map(col => {
                switch(col.id) {
                    case 'createdAt': return format(parseISO(item.createdAt), 'dd/MM/yyyy HH:mm');
                    case 'productId': return item.productId;
                    case 'productDescription': return getProductDescription(item.productId);
                    case 'humanReadableId': return item.humanReadableId || 'N/A';
                    case 'unitCode': return item.unitCode;
                    case 'documentId': return item.documentId || 'N/A';
                    case 'locationPath': return getLocationPath(item.locationId);
                    case 'quantity': return (item as any).quantity ?? 1;
                    case 'createdBy': return item.createdBy;
                    default: return '';
                }
            })
        );
        exportToExcel({
            fileName: 'reporte_recepciones',
            sheetName: 'Recepciones',
            headers,
            data: dataToExport,
        });
    };
    
    const handleExportPDF = () => {
         if (!companyData) return;
        const tableHeaders = selectors.visibleColumnsData.map(c => c.label);
        const tableRows = sortedData.map(item => 
            selectors.visibleColumnsData.map(col => {
                let cellValue: string;
                switch(col.id) {
                    case 'createdAt': cellValue = format(parseISO(item.createdAt), 'dd/MM/yy HH:mm'); break;
                    case 'productId': cellValue = item.productId; break;
                    case 'productDescription': cellValue = getProductDescription(item.productId); break;
                    case 'humanReadableId': cellValue = item.humanReadableId || 'N/A'; break;
                    case 'unitCode': cellValue = item.unitCode || 'N/A'; break;
                    case 'documentId': cellValue = item.documentId || 'N/A'; break;
                    case 'locationPath': cellValue = getLocationPath(item.locationId); break;
                    case 'quantity': return String((item as any).quantity ?? 1);
                    case 'createdBy': cellValue = item.createdBy; break;
                    default: cellValue = '';
                }
                return cellValue;
            })
        );
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
        fetchData,
        setDateRange: (range: DateRange | undefined) => setState(prevState => ({ ...prevState, dateRange: range || { from: undefined, to: undefined } })),
        setSearchTerm: (term: string) => setState(prevState => ({ ...prevState, searchTerm: term })),
        setUserFilter: (filter: string[]) => setState(prevState => ({ ...prevState, userFilter: filter })),
        setLocationFilter: (filter: string[]) => setState(prevState => ({ ...prevState, locationFilter: filter })),
        handleClearFilters: () => setState(prevState => ({ ...prevState, searchTerm: '', userFilter: [], locationFilter: [] })),
        handleExportExcel,
        handleExportPDF,
        handleColumnVisibilityChange: (columnId: string, checked: boolean) => {
            setState(prevState => ({
                ...prevState,
                visibleColumns: checked ? [...prevState.visibleColumns, columnId] : prevState.visibleColumns.filter(id => id !== columnId)
            }));
        },
        handleSavePreferences,
    };

    const selectors = {
        sortedData,
        userOptions: useMemo(() => Array.from(new Set(state.data.map(item => item.createdBy))).map(u => ({ value: u, label: u })), [state.data]),
        locationOptions: useMemo(() => state.allLocations.map(l => ({ value: String(l.id), label: getLocationPath(l.id) })), [state.allLocations, getLocationPath]),
        getLocationPath,
        getProductDescription,
        availableColumns,
        visibleColumnsData: useMemo(() => state.visibleColumns.map(id => availableColumns.find(col => col.id === id)).filter(Boolean) as (typeof availableColumns)[0][], [state.visibleColumns]),
    };
    
    return {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading: state.isLoading && !state.data.length,
    };
}
