/**
 * @fileoverview Hook to manage the logic for the purchase request suggestions page.
 */
'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getRequestSuggestions, savePurchaseRequest, getAllErpPurchaseOrderHeaders, getAllErpPurchaseOrderLines } from '@/modules/requests/lib/actions';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';
import type { DateRange, UserPreferences, PurchaseSuggestion, PurchaseRequestPriority, ErpPurchaseOrderHeader, ErpPurchaseOrderLine } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { subDays, startOfDay } from 'date-fns';
import { useDebounce } from 'use-debounce';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import { useRouter } from 'next/navigation';


export type SortKey = keyof Pick<PurchaseSuggestion, 'earliestCreationDate' | 'earliestDueDate' | 'shortage' | 'totalRequired' | 'currentStock' | 'inTransitStock' | 'erpUsers' | 'sourceOrders' | 'involvedClients'> | 'item';
export type SortDirection = 'asc' | 'desc';

const availableColumns = [
    { id: 'item', label: 'Artículo', tooltip: 'Código y descripción del artículo con faltante de inventario.', sortable: true },
    { id: 'activeRequests', label: 'Solicitudes Activas (SC)', tooltip: 'Muestra si ya existen solicitudes de compra activas en Clic-Tools para este artículo.' },
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
    isSubmitting: boolean;
    dateRange: DateRange;
    suggestions: PurchaseSuggestion[];
    selectedItems: Set<string>;
    searchTerm: string;
    classificationFilter: string[];
    visibleColumns: string[];
    showOnlyMyOrders: boolean;
    sortKey: SortKey;
    sortDirection: SortDirection;
    isDuplicateConfirmOpen: boolean;
    itemsToCreate: PurchaseSuggestion[];
    currentPage: number;
    rowsPerPage: number;
    erpPoHeaders: ErpPurchaseOrderHeader[];
    erpPoLines: ErpPurchaseOrderLine[];
}

export function useRequestSuggestions() {
    const { isAuthorized, hasPermission } = useAuthorization(['requests:create', 'analytics:purchase-suggestions:read', 'requests:create:duplicate']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user: currentUser, products } = useAuth();
    const router = useRouter();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: true,
        isSubmitting: false,
        dateRange: {
            from: startOfDay(subDays(new Date(), 15)),
            to: startOfDay(new Date()),
        },
        suggestions: [],
        selectedItems: new Set(),
        searchTerm: '',
        classificationFilter: [],
        visibleColumns: availableColumns.map(c => c.id),
        showOnlyMyOrders: false,
        sortKey: 'earliestCreationDate',
        sortDirection: 'desc',
        isDuplicateConfirmOpen: false,
        itemsToCreate: [],
        currentPage: 5,
        rowsPerPage: 10,
        erpPoHeaders: [],
        erpPoLines: [],
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const handleAnalyze = useCallback(async () => {
        updateState({ isLoading: true, suggestions: [], selectedItems: new Set() });
        try {
            if (!state.dateRange.from) {
                toast({ title: "Fecha de inicio requerida", variant: "destructive" });
                return;
            }
            const data = await getRequestSuggestions(state.dateRange);
            updateState({ suggestions: data });
        } catch (error: any) {
            logError("Failed to get purchase suggestions", { error: error.message });
            toast({ title: "Error al Analizar", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isLoading: false, currentPage: 0 }); // Reset page on new analysis
            if (isInitialLoading) {
                setIsInitialLoading(false);
            }
        }
    }, [state.dateRange, toast, updateState, isInitialLoading]);
    
    useEffect(() => {
        setTitle("Sugerencias de Compra");
        const loadPrefsAndData = async () => {
             if(currentUser) {
                const prefs = await getUserPreferences(currentUser.id, 'purchaseSuggestionsPrefs');
                const [poHeaders, poLines] = await Promise.all([getAllErpPurchaseOrderHeaders(), getAllErpPurchaseOrderLines()]);

                const newState: Partial<State> = { erpPoHeaders: poHeaders, erpPoLines: poLines };
                
                if (prefs) {
                    newState.classificationFilter = prefs.classificationFilter || [];
                    newState.showOnlyMyOrders = prefs.showOnlyMyOrders || false;
                    newState.visibleColumns = prefs.visibleColumns || availableColumns.map(c => c.id);
                    newState.sortKey = prefs.sortKey || 'earliestCreationDate';
                    newState.sortDirection = prefs.sortDirection || 'desc';
                    newState.rowsPerPage = prefs.rowsPerPage || 5;
                }
                updateState(newState);
            }
            await handleAnalyze();
        };

        if(isAuthorized) {
            loadPrefsAndData();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTitle, isAuthorized, currentUser?.id]);

    const filteredSuggestions = useMemo(() => {
        let filtered = state.suggestions;
        
        if (state.showOnlyMyOrders && currentUser?.erpAlias) {
            const userErpAliasLower = currentUser.erpAlias.toLowerCase();
            filtered = filtered.filter(item => 
                item.erpUsers.some(erpUser => erpUser.toLowerCase() === userErpAliasLower)
            );
        }

        if (debouncedSearchTerm) {
            const searchTerms = normalizeText(debouncedSearchTerm).split(' ').filter(Boolean);
            filtered = filtered.filter(item => {
                const targetText = normalizeText(`
                    ${item.itemId} 
                    ${item.itemDescription} 
                    ${item.sourceOrders.join(' ')}
                    ${item.involvedClients.map(c => c.name).join(' ')}
                    ${item.erpUsers.join(' ')}
                `);
                return searchTerms.every(term => targetText.includes(term));
            });
        }
        
        if (state.classificationFilter.length > 0) {
            filtered = filtered.filter(item => state.classificationFilter.includes(item.itemClassification));
        }

        // Sorting logic
        filtered.sort((a, b) => {
            const dir = state.sortDirection === 'asc' ? 1 : -1;
            switch(state.sortKey) {
                case 'item':
                    return a.itemDescription.localeCompare(b.itemDescription) * dir;
                case 'sourceOrders':
                    return (a.sourceOrders[0] || '').localeCompare(b.sourceOrders[0] || '') * dir;
                case 'involvedClients':
                    return (a.involvedClients[0]?.name || '').localeCompare(b.involvedClients[0]?.name || '') * dir;
                case 'erpUsers':
                    return (a.erpUsers.join(', ') || '').localeCompare(b.erpUsers.join(', ') || '') * dir;
                case 'earliestCreationDate':
                    return (new Date(a.earliestCreationDate || 0).getTime() - new Date(b.earliestCreationDate || 0).getTime()) * dir;
                case 'earliestDueDate':
                     return (new Date(a.earliestDueDate || 0).getTime() - new Date(b.earliestDueDate || 0).getTime()) * dir;
                case 'shortage':
                    return (a.shortage - b.shortage) * dir;
                case 'totalRequired':
                    return (a.totalRequired - b.totalRequired) * dir;
                case 'currentStock':
                    return (a.currentStock - b.currentStock) * dir;
                case 'inTransitStock':
                    return (a.inTransitStock - b.inTransitStock) * dir;
                default:
                    return 0;
            }
        });

        return filtered;
    }, [state.suggestions, debouncedSearchTerm, state.classificationFilter, state.showOnlyMyOrders, currentUser, state.sortKey, state.sortDirection]);

    const paginatedSuggestions = useMemo(() => {
        const start = state.currentPage * state.rowsPerPage;
        const end = start + state.rowsPerPage;
        return filteredSuggestions.slice(start, end);
    }, [filteredSuggestions, state.currentPage, state.rowsPerPage]);


    const toggleItemSelection = (itemId: string) => {
        const item = state.suggestions.find(s => s.itemId === itemId);
        if (!item) return;

        const isDuplicate = item.existingActiveRequests.length > 0;
        const canCreateDuplicates = hasPermission('requests:create:duplicate');
        if (isDuplicate && !canCreateDuplicates) {
            toast({ title: "Permiso Requerido", description: "No tienes permiso para crear solicitudes duplicadas para este artículo.", variant: "destructive" });
            return;
        }

        updateState({
            selectedItems: new Set(
                state.selectedItems.has(itemId)
                    ? [...state.selectedItems].filter(id => id !== itemId)
                    : [...state.selectedItems, itemId]
            ),
        });
    };

    const toggleSelectAll = (checked: boolean) => {
        const canCreateDuplicates = hasPermission('requests:create:duplicate');
        
        const itemsToSelect = filteredSuggestions
            .filter(s => {
                const isDuplicate = s.existingActiveRequests.length > 0;
                return !isDuplicate || canCreateDuplicates;
            })
            .map(s => s.itemId);

        updateState({
            selectedItems: new Set(
                checked ? itemsToSelect : []
            ),
        });
    };
    
    const selectedSuggestions = useMemo(
        () => state.suggestions.filter(s => state.selectedItems.has(s.itemId)),
        [state.suggestions, state.selectedItems]
    );

    const handleCreateRequests = async (confirmedItems?: PurchaseSuggestion[]) => {
        if (!currentUser) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            return;
        }

        const itemsToProcess = confirmedItems || selectedSuggestions;

        if (itemsToProcess.length === 0) {
            toast({ title: "No hay artículos seleccionados", variant: "destructive" });
            return;
        }
        
        if (!confirmedItems) {
            const itemsWithDuplicates = itemsToProcess.filter(item => item.existingActiveRequests.length > 0);
            if (itemsWithDuplicates.length > 0) {
                updateState({ itemsToCreate: itemsWithDuplicates, isDuplicateConfirmOpen: true });
                return;
            }
        }
        
        updateState({ isSubmitting: true, isDuplicateConfirmOpen: false });

        let createdCount = 0;
        let errorCount = 0;

        for (const item of itemsToProcess) {
             try {
                const client = item.involvedClients[0] || { id: 'VAR-CLI', name: 'VARIOS CLIENTES' };
                const requestPayload = {
                    requiredDate: item.earliestDueDate ? new Date(item.earliestDueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    clientId: client.id,
                    clientName: client.name,
                    clientTaxId: '', // Will be fetched from DB
                    itemId: item.itemId,
                    itemDescription: item.itemDescription,
                    quantity: item.shortage,
                    notes: `Sugerencia generada a partir de la demanda de los pedidos del ERP: ${item.sourceOrders.join(', ')}. Clientes: ${item.involvedClients.map(c => c.name).join(', ')}.`,
                    erpOrderNumber: item.sourceOrders.join(', '),
                    priority: 'medium' as PurchaseRequestPriority,
                    purchaseType: 'single' as const,
                    sourceOrders: item.sourceOrders,
                    involvedClients: item.involvedClients,
                };
                await savePurchaseRequest(requestPayload as any, currentUser.name);
                createdCount++;
            } catch (error: any) {
                logError(`Failed to create request for item ${item.itemId}`, { error: error.message });
                errorCount++;
            }
        }

        updateState({ isSubmitting: false });
        
        if (createdCount > 0) {
            toast({
                title: "Solicitudes Creadas",
                description: `Se crearon ${createdCount} solicitudes de compra.`,
            });
        }
        if (errorCount > 0) {
            toast({
                title: "Error",
                description: `No se pudieron crear ${errorCount} solicitudes. Revisa los registros para más detalles.`,
                variant: 'destructive',
            });
        }
        
        // Deselect items and re-analyze to update the active requests status
        await handleAnalyze();
    };


    const handleColumnVisibilityChange = (columnId: string, checked: boolean) => {
        updateState({
            visibleColumns: checked
                ? [...state.visibleColumns, columnId]
                : state.visibleColumns.filter(id => id !== columnId)
        });
    };
    
    const getColumnContent = (item: PurchaseSuggestion, colId: string): { content: React.ReactNode, className?: string } => {
        const isDuplicate = item.existingActiveRequests.length > 0;
        const totalRequestedInActive = item.existingActiveRequests.reduce((sum, req) => sum + req.quantity, 0);

        switch (colId) {
            case 'item': {
                const itemContent = (
                    <div>
                        <p className="font-medium">{item.itemDescription}</p>
                        <p className="text-sm text-muted-foreground">{item.itemId}</p>
                    </div>
                );
                return { content: itemContent, className: isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '' };
            }
            case 'activeRequests': {
                if (!isDuplicate) return { content: <p className="text-xs text-muted-foreground">Ninguna</p> };
                const badgeContent = (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-200 px-2 py-1 text-xs font-semibold text-amber-800">
                                <Info className="h-3 w-3" />
                                {totalRequestedInActive.toLocaleString()}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="font-bold">Este artículo ya tiene solicitudes activas:</p>
                            <ul className="list-disc list-inside mt-1 text-xs">
                                {item.existingActiveRequests.map(req => (
                                    <li key={req.id}>{req.consecutive} ({req.status}) - Cant: {req.quantity} - OC: {req.purchaseOrder} - Por: {req.requestedBy}</li>
                                ))}
                                <li className="font-semibold mt-1">Total activo: {totalRequestedInActive}</li>
                            </ul>
                        </TooltipContent>
                    </Tooltip>
                );
                return { content: badgeContent, className: isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '' };
            }
            case 'sourceOrders': {
                const content = (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                        {item.sourceOrders.map(order => <div key={order}>{order}</div>)}
                    </div>
                );
                return { content, className: isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '' };
            }
            case 'clients': {
                const content = (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                        {item.involvedClients.map(client => <div key={client.id} className="truncate" title={`${client.name} (${client.id})`}>{client.name}</div>)}
                    </div>
                );
                return { content, className: isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '' };
            }
            case 'erpUsers': return { content: <p className="text-xs text-muted-foreground">{item.erpUsers.join(', ')}</p>, className: isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '' };
            case 'creationDate': return { content: item.earliestCreationDate ? new Date(item.earliestCreationDate).toLocaleDateString('es-CR') : 'N/A', className: isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '' };
            case 'dueDate': return { content: item.earliestDueDate ? new Date(item.earliestDueDate).toLocaleDateString('es-CR') : 'N/A', className: isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '' };
            case 'required': return { content: item.totalRequired.toLocaleString(), className: cn('text-right', isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '') };
            case 'stock': return { content: item.currentStock.toLocaleString(), className: cn('text-right', isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '') };
            case 'inTransit': return { content: item.inTransitStock.toLocaleString(), className: cn('text-right font-semibold text-blue-600', isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '') };
            case 'shortage': return { content: item.shortage.toLocaleString(), className: cn('text-right font-bold text-red-600', isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '') };
            default: return { content: '', className: isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : '' };
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
                    case 'activeRequests': return item.existingActiveRequests.map(r => r.consecutive).join(', ');
                    case 'sourceOrders': return item.sourceOrders.join(', ');
                    case 'clients': return item.involvedClients.map((c: any) => c.name).join(', ');
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
            fileName: 'sugerencias_compra',
            sheetName: 'Sugerencias',
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
    
    const handleSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (state.sortKey === key && state.sortDirection === 'asc') {
            direction = 'desc';
        } else if (state.sortKey === key && state.sortDirection === 'desc') {
            key = 'earliestCreationDate';
            direction = 'desc';
        }
        updateState({ sortKey: key, sortDirection: direction });
    };

    const savePreferences = async () => {
        if (!currentUser) return;
        const prefsToSave: Partial<UserPreferences> = {
            classificationFilter: state.classificationFilter,
            showOnlyMyOrders: state.showOnlyMyOrders,
            visibleColumns: state.visibleColumns,
            sortKey: state.sortKey,
            sortDirection: state.sortDirection,
            rowsPerPage: state.rowsPerPage,
        };
        try {
            await saveUserPreferences(currentUser.id, 'purchaseSuggestionsPrefs', prefsToSave);
            toast({ title: "Preferencias Guardadas", description: "Tus filtros y configuraciones de vista han sido guardados." });
        } catch (error: any) {
            logError("Failed to save purchase suggestions preferences", { error: error.message });
            toast({ title: "Error", description: "No se pudieron guardar tus preferencias.", variant: "destructive" });
        }
    };
    
    const getInTransitStock = useCallback((itemId: string): number => {
        const activePoNumbers = new Set(state.erpPoHeaders.filter(h => h.ESTADO === 'A').map(h => h.ORDEN_COMPRA));
        return state.erpPoLines
            .filter(line => line.ARTICULO === itemId && activePoNumbers.has(line.ORDEN_COMPRA))
            .reduce((sum, line) => sum + line.CANTIDAD_ORDENADA, 0);
    }, [state.erpPoHeaders, state.erpPoLines]);


    const selectors = {
        filteredSuggestions,
        paginatedSuggestions,
        totalPages: useMemo(() => Math.ceil(filteredSuggestions.length / state.rowsPerPage), [filteredSuggestions, state.rowsPerPage]),
        selectedSuggestions,
        areAllSelected: useMemo(() => {
            if (filteredSuggestions.length === 0) return false;
            const canCreateDuplicates = hasPermission('requests:create:duplicate');
            const selectableItems = filteredSuggestions.filter(s => !s.existingActiveRequests.length || canCreateDuplicates);
            if (selectableItems.length === 0) return false;
            return selectableItems.every(s => state.selectedItems.has(s.itemId));
        }, [filteredSuggestions, state.selectedItems, hasPermission]),
        
        classifications: useMemo<string[]>(() => 
            Array.from(new Set(products.map(p => p.classification).filter(Boolean)))
        , [products]),
        availableColumns,
        visibleColumnsData,
        getColumnContent,
        getInTransitStock,
    };


    const actions = {
        setDateRange: (range: DateRange | undefined) => updateState({ dateRange: range || { from: undefined, to: undefined } }),
        handleAnalyze,
        toggleItemSelection,
        toggleSelectAll,
        handleCreateRequests,
        setSearchTerm: (term: string) => updateState({ searchTerm: term }),
        setClassificationFilter: (filter: string[]) => updateState({ classificationFilter: filter }),
        handleClearFilters: () => updateState({ searchTerm: '', classificationFilter: [] }),
        handleExportExcel,
        handleColumnVisibilityChange,
        setShowOnlyMyOrders: (show: boolean) => updateState({ showOnlyMyOrders: show }),
        handleSort,
        setDuplicateConfirmOpen: (isOpen: boolean) => updateState({ isDuplicateConfirmOpen: isOpen }),
        setCurrentPage: (page: number) => updateState({ currentPage: page }),
        setRowsPerPage: (size: number) => updateState({ rowsPerPage: size, currentPage: 0 }),
        savePreferences,
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    };
}
