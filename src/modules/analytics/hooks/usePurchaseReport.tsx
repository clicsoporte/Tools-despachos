/**
 * @fileoverview Hook to manage the logic for the purchase report page.
 * This is largely based on useRequestSuggestions but is read-only.
 */
'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getRequestSuggestions } from '@/modules/requests/lib/actions';
import type { DateRange, PurchaseRequest, UserPreferences } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { subDays, startOfDay } from 'date-fns';
import { useDebounce } from 'use-debounce';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
    existingActiveRequests: { id: number; consecutive: string, status: string, quantity: number, purchaseOrder?: string, erpOrderNumber?: string }[];
}

export type SortKey = keyof Pick<PurchaseSuggestion, 'earliestCreationDate' | 'earliestDueDate' | 'shortage' | 'totalRequired' | 'currentStock' | 'inTransitStock' | 'erpUsers' | 'sourceOrders' | 'involvedClients'> | 'item';
export type SortDirection = 'asc' | 'desc';

const availableColumns = [
    { id: 'item', label: 'Artículo', tooltip: 'Código y descripción del artículo con faltante de inventario.', sortable: true },
    { id: 'sourceOrders', label: 'Pedidos Origen', tooltip: 'Números de pedido del ERP que requieren este artículo.', sortable: true, sortKey: 'sourceOrders' },
    { id: 'clients', label: 'Clientes Involucrados', tooltip: 'Lista de todos los clientes de los pedidos analizados que están esperando este artículo.', sortable: true, sortKey: 'involvedClients' },
    { id: 'erpUsers', label: 'Usuario ERP', tooltip: 'Usuario que creó el pedido en el sistema ERP.', sortable: true, sortKey: 'erpUsers' },
    { id: 'creationDate', label: 'Fecha Pedido', tooltip: 'La fecha de creación más temprana para este artículo entre todos los pedidos analizados.', sortable: true, sortKey: 'earliestCreationDate' },
    { id: 'dueDate', label: 'Próxima Entrega', tooltip: 'La fecha de entrega más cercana para este artículo entre todos los pedidos analizados.', sortable: true, sortKey: 'earliestDueDate' },
    { id: 'required', label: 'Cant. Requerida', tooltip: 'La suma total de este artículo requerida para cumplir con todos los pedidos en el rango de fechas.', align: 'right', sortable: true, sortKey: 'totalRequired' },
    { id: 'stock', label: 'Inv. Actual (ERP)', tooltip: 'La cantidad total de este artículo disponible en todas las bodegas según la última sincronización del ERP.', align: 'right', sortable: true, sortKey: 'currentStock' },
    { id: 'inTransit', label: 'Tránsito OC (ERP)', tooltip: 'La cantidad total de este artículo que ya se ordenó a proveedores en el ERP y está en camino.', align: 'right', sortable: true, sortKey: 'inTransitStock'},
    { id: 'shortage', label: 'Faltante Total', tooltip: 'La cantidad que necesitas comprar para cubrir la demanda (Cant. Requerida - Inv. Actual - Tránsito).', align: 'right', sortable: true, sortKey: 'shortage' },
];

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

interface State {
    isLoading: boolean;
    dateRange: DateRange;
    suggestions: PurchaseSuggestion[];
    searchTerm: string;
    classificationFilter: string[];
    visibleColumns: string[];
    showOnlyMyOrders: boolean;
    sortKey: SortKey;
    sortDirection: SortDirection;
    currentPage: number;
    rowsPerPage: number;
}

export function usePurchaseReport() {
    const { isAuthorized } = useAuthorization(['analytics:purchase-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user: currentUser, products } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: true,
        dateRange: {
            from: startOfDay(subDays(new Date(), 15)),
            to: startOfDay(new Date()),
        },
        suggestions: [],
        searchTerm: '',
        classificationFilter: [],
        visibleColumns: availableColumns.map(c => c.id),
        showOnlyMyOrders: false,
        sortKey: 'earliestCreationDate',
        sortDirection: 'desc',
        currentPage: 0,
        rowsPerPage: 10,
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const handleAnalyze = useCallback(async () => {
        updateState({ isLoading: true, suggestions: [] });
        try {
            if (!state.dateRange.from) {
                toast({ title: "Fecha de inicio requerida", variant: "destructive" });
                return;
            }
            const data = await getRequestSuggestions(state.dateRange);
            updateState({ suggestions: data });
        } catch (error: any) {
            logError("Failed to get purchase report data", { error: error.message });
            toast({ title: "Error al Generar Reporte", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isLoading: false, currentPage: 0 });
            if (isInitialLoading) {
                setIsInitialLoading(false);
            }
        }
    }, [state.dateRange, toast, updateState, isInitialLoading]);
    
    useEffect(() => {
        setTitle("Reporte de Compras");
        if(isAuthorized) {
            handleAnalyze();
        }
    }, [setTitle, isAuthorized, handleAnalyze]);

    const filteredSuggestions = useMemo(() => {
        let filtered = state.suggestions.filter(item => {
            const searchTerms = normalizeText(debouncedSearchTerm).split(' ').filter(Boolean);
            
            const classificationMatch = state.classificationFilter.length > 0 ? state.classificationFilter.includes(item.itemClassification) : true;
            if (!classificationMatch) return false;

            const myOrdersMatch = !state.showOnlyMyOrders || (currentUser?.erpAlias && item.erpUsers.some(erpUser => erpUser.toLowerCase() === currentUser!.erpAlias!.toLowerCase()));
            if (!myOrdersMatch) return false;

            if (searchTerms.length === 0) return true;

            const targetText = normalizeText(`${item.itemId} ${item.itemDescription} ${item.sourceOrders.join(' ')} ${item.involvedClients.map(c => c.name).join(' ')} ${item.erpUsers.join(' ')}`);
            return searchTerms.every(term => targetText.includes(term));
        });

        filtered.sort((a, b) => {
            const dir = state.sortDirection === 'asc' ? 1 : -1;
            switch(state.sortKey) {
                case 'item': return a.itemDescription.localeCompare(b.itemDescription) * dir;
                case 'sourceOrders': return (a.sourceOrders[0] || '').localeCompare(b.sourceOrders[0] || '') * dir;
                case 'involvedClients': return (a.involvedClients[0]?.name || '').localeCompare(b.involvedClients[0]?.name || '') * dir;
                case 'erpUsers': return (a.erpUsers.join(', ') || '').localeCompare(b.erpUsers.join(', ') || '') * dir;
                case 'earliestCreationDate': return (new Date(a.earliestCreationDate || 0).getTime() - new Date(b.earliestCreationDate || 0).getTime()) * dir;
                case 'earliestDueDate': return (new Date(a.earliestDueDate || 0).getTime() - new Date(b.earliestDueDate || 0).getTime()) * dir;
                case 'shortage': return (a.shortage - b.shortage) * dir;
                case 'totalRequired': return (a.totalRequired - b.totalRequired) * dir;
                case 'currentStock': return (a.currentStock - b.currentStock) * dir;
                case 'inTransitStock': return (a.inTransitStock - b.inTransitStock) * dir;
                default: return 0;
            }
        });
        return filtered;
    }, [state.suggestions, debouncedSearchTerm, state.classificationFilter, state.showOnlyMyOrders, currentUser, state.sortKey, state.sortDirection]);
    
    const paginatedSuggestions = useMemo(() => {
        const start = state.currentPage * state.rowsPerPage;
        const end = start + state.rowsPerPage;
        return filteredSuggestions.slice(start, end);
    }, [filteredSuggestions, state.currentPage, state.rowsPerPage]);

    const handleSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (state.sortKey === key && state.sortDirection === 'asc') {
            direction = 'desc';
        }
        updateState({ sortKey: key, sortDirection: direction });
    };

    const getColumnContent = (item: PurchaseSuggestion, colId: string): { type: string, data: any, className?: string } => {
        switch (colId) {
            case 'item': {
                const itemContent = (
                    <div>
                        <p className="font-medium">{item.itemDescription}</p>
                        <p className="text-sm text-muted-foreground">{item.itemId}</p>
                    </div>
                );
                return { type: 'reactNode', data: itemContent };
            }
            case 'sourceOrders': return { type: 'string', data: item.sourceOrders.join(', '), className: "text-xs text-muted-foreground truncate max-w-xs" };
            case 'clients': return { type: 'string', data: item.involvedClients.map(c => c.name).join(', '), className: "text-xs text-muted-foreground truncate max-w-xs" };
            case 'erpUsers': return { type: 'string', data: item.erpUsers.join(', '), className: "text-xs text-muted-foreground" };
            case 'creationDate': return { type: 'date', data: item.earliestCreationDate };
            case 'dueDate': return { type: 'date', data: item.earliestDueDate };
            case 'required': return { type: 'number', data: item.totalRequired, className: 'text-right' };
            case 'stock': return { type: 'number', data: item.currentStock, className: 'text-right' };
            case 'inTransit': return { type: 'number', data: item.inTransitStock, className: 'text-right font-semibold text-blue-600' };
            case 'shortage': return { type: 'number', data: item.shortage, className: cn('text-right font-bold', item.shortage > 0 ? 'text-red-600' : 'text-green-600') };
            default: return { type: 'string', data: '' };
        }
    };
    
    const visibleColumnsData = useMemo(() => {
        return state.visibleColumns.map(id => availableColumns.find(col => col.id === id)).filter(Boolean) as (typeof availableColumns)[0][];
    }, [state.visibleColumns]);

    const handleExportExcel = () => {
        const headers = visibleColumnsData.map(col => col.label);
        const dataToExport = filteredSuggestions.map(item =>
            state.visibleColumns.map(colId => {
                switch(colId) {
                    case 'item': return `${item.itemDescription} (${item.itemId})`;
                    case 'sourceOrders': return item.sourceOrders.join(', ');
                    case 'clients': return item.involvedClients.map(c => c.name).join(', ');
                    case 'erpUsers': return item.erpUsers.join(', ');
                    case 'creationDate': return item.earliestCreationDate ? new Date(item.earliestCreationDate).toLocaleDateString('es-CR') : 'N/A';
                    case 'dueDate': return item.earliestDueDate ? new Date(item.earliestDueDate).toLocaleDateString('es-CR') : 'N/A';
                    case 'required': return item.totalRequired;
                    case 'stock': return item.currentStock;
                    case 'inTransit': return item.inTransitStock;
                    case 'shortage': return item.shortage;
                    default: return '';
                }
            })
        );
        exportToExcel({
            fileName: 'reporte_compras',
            sheetName: 'Compras',
            headers,
            data: dataToExport,
            columnWidths: state.visibleColumns.map(id => {
                switch(id) {
                    case 'item': return 40;
                    case 'sourceOrders': return 25;
                    case 'clients': return 30;
                    case 'erpUsers': return 20;
                    default: return 15;
                }
            })
        });
    };

    const actions = {
        setDateRange: (range: DateRange | undefined) => updateState({ dateRange: range || { from: undefined, to: undefined } }),
        handleAnalyze,
        setSearchTerm: (term: string) => updateState({ searchTerm: term }),
        setClassificationFilter: (filter: string[]) => updateState({ classificationFilter: filter }),
        handleClearFilters: () => updateState({ searchTerm: '', classificationFilter: [] }),
        handleExportExcel,
        setShowOnlyMyOrders: (show: boolean) => updateState({ showOnlyMyOrders: show }),
        handleSort,
        setCurrentPage: (page: number) => updateState({ currentPage: page }),
        setRowsPerPage: (size: number) => updateState({ rowsPerPage: size, currentPage: 0 }),
    };

    const selectors = {
        filteredSuggestions,
        paginatedSuggestions,
        totalPages: useMemo(() => Math.ceil(filteredSuggestions.length / state.rowsPerPage), [filteredSuggestions, state.rowsPerPage]),
        classifications: useMemo(() => Array.from(new Set(products.map(p => p.classification).filter(Boolean))), [products]),
        availableColumns,
        visibleColumnsData,
        getColumnContent
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    };
}
