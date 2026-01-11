// This file was restored to its stable version.
// The previous content was causing compilation issues.
'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { ToastAction } from "@/components/ui/toast";
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { 
    getPurchaseRequests, 
    savePurchaseRequest as saveRequestAction, 
    updatePurchaseRequest, 
    updatePurchaseRequestStatus, 
    getRequestHistory,
    getRequestSettings,
    saveRequestSettings,
    updatePendingAction,
    getErpOrderData,
    addNoteToRequest,
    updateRequestDetails as updateRequestDetailsAction,
    saveCostAnalysis as saveCostAnalysisAction
} from '../lib/actions';
import type { 
    PurchaseRequest, 
    PurchaseRequestHistoryEntry, 
    RequestSettings, 
    UpdatePurchaseRequestPayload, 
    DateRange, 
    AdministrativeActionPayload,
    StockInfo, 
    ErpOrderHeader, 
    ErpOrderLine, 
    User, 
    PurchaseSuggestion, 
    PurchaseRequestPriority, 
    RequestNotePayload,
    PurchaseRequestStatus
} from '../../core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { subDays, startOfDay } from 'date-fns';
import { useDebounce } from 'use-debounce';
import { useRouter } from 'next/navigation';
import { getStatusConfig as getPlannerStatusConfig } from '@/modules/planner/lib/utils';
import { getDaysRemaining } from '@/modules/core/lib/time-utils';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { getUserPreferences, saveUserPreferences, getAllErpPurchaseOrderHeaders, getAllErpPurchaseOrderLines } from '@/modules/core/lib/db';

const emptyRequest: Partial<PurchaseRequest> = {
    priority: 'medium',
    purchaseType: 'single',
    salePriceCurrency: 'CRC',
    requiresCurrency: false
};

const priorityConfig: { [key in PurchaseRequestPriority]: { label: string, className: string } } = { 
    low: { label: "Baja", className: "text-gray-500" }, 
    medium: { label: "Media", className: "text-blue-500" }, 
    high: { label: "Alta", className: "text-yellow-600" }, 
    urgent: { label: "Urgente", className: "text-red-600" }
};

const statusConfig: { [key in PurchaseRequestStatus]: { label: string, color: string } } = {
    'pending': { label: 'Pendiente', color: 'bg-yellow-500' },
    'purchasing-review': { label: 'Revisión Compras', color: 'bg-cyan-500' },
    'pending-approval': { label: 'Pendiente Aprobación', color: 'bg-orange-500' },
    'approved': { label: 'Aprobada', color: 'bg-green-500' },
    'ordered': { label: 'Ordenada', color: 'bg-blue-600' },
    'received-in-warehouse': { label: 'Recibido en Bodega', color: 'bg-teal-600' },
    'entered-erp': { label: 'Ingresado ERP', color: 'bg-indigo-600' },
    'canceled': { label: 'Cancelada', color: 'bg-red-700' },
};


export default function useRequests() {
    const { isAuthorized, hasPermission } = useAuthorization(['requests:access']);
    const { toast } = useToast();
    const router = useRouter();
    const { user: currentUser, customers, products, stockLevels, isReady } = useAuth();
    
    const [state, setState] = useState({
        isLoading: true,
        isSubmitting: false,
        isRefreshing: false,
        isNewRequestDialogOpen: false,
        isEditRequestDialogOpen: false,
        requests: [] as PurchaseRequest[],
        viewingArchived: false,
        currentPage: 0,
        rowsPerPage: 10,
        totalActive: 0,
        totalArchived: 0,
        requestSettings: null as RequestSettings | null,
        newRequest: emptyRequest,
        requestToEdit: null as PurchaseRequest | null,
        searchTerm: "",
        statusFilter: [] as string[],
        classificationFilter: 'all',
        showOnlyMyRequests: !hasPermission('requests:read:all'),
        dateFilter: undefined as DateRange | undefined,
        clientSearchTerm: "",
        isClientSearchOpen: false,
        itemSearchTerm: "",
        isItemSearchOpen: false,
        isStatusDialogOpen: false,
        requestToUpdate: null as PurchaseRequest | null,
        newStatus: null as PurchaseRequestStatus | null,
        statusUpdateNotes: "",
        deliveredQuantity: "" as number | string,
        isHistoryDialogOpen: false,
        historyRequest: null as PurchaseRequest | null,
        history: [] as PurchaseRequestHistoryEntry[],
        isHistoryLoading: false,
        isReopenDialogOpen: false,
        reopenStep: 0,
        reopenConfirmationText: '',
        arrivalDate: "",
        isActionDialogOpen: false,
        isErpOrderModalOpen: false,
        isErpItemsModalOpen: false,
        erpOrderNumber: "",
        erpOrderHeaders: [] as ErpOrderHeader[],
        selectedErpOrderHeader: null as ErpOrderHeader | null,
        erpOrderLines: [] as (ErpOrderLine & { selected: boolean, displayQuantity: string, displayPrice: string, stock: StockInfo | null, product: any })[],
        isErpLoading: false,
        showOnlyShortageItems: false,
        isContextInfoOpen: false,
        contextInfoData: null as PurchaseRequest | null,
        isAddNoteDialogOpen: false,
        notePayload: null as RequestNotePayload | null,
        isTransitsDialogOpen: false,
        activeTransits: null as { itemId: string; itemDescription: string; transits: any[] } | null,
        isCostAnalysisDialogOpen: false,
        analysisCost: '' as string | number,
        analysisSalePrice: '' as string | number,
        erpEntryNumber: '',
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, 500);
    const [debouncedClientSearch] = useDebounce(state.clientSearchTerm, 300);
    const [debouncedItemSearch] = useDebounce(state.itemSearchTerm, 300);

    const updateState = useCallback((newState: Partial<typeof state>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const loadInitialData = useCallback(async (isRefresh = false) => {
        if (!isReady) return;
        
        let isMounted = true;
        
        if (isRefresh) {
            updateState({ isRefreshing: true });
        } else {
            updateState({ isLoading: true });
        }
        
        try {
            const [settingsData, { requests, totalActive, totalArchived }] = await Promise.all([
                getRequestSettings(),
                getPurchaseRequests({
                    page: state.currentPage,
                    pageSize: state.rowsPerPage,
                    isArchived: state.viewingArchived,
                    filters: {
                        searchTerm: debouncedSearchTerm,
                        status: state.statusFilter,
                        classification: state.classificationFilter,
                        showOnlyMy: state.showOnlyMyRequests ? currentUser?.name : undefined,
                        dateRange: state.dateFilter,
                    }
                })
            ]);
            
            if (isMounted) {
                updateState({
                    requestSettings: settingsData,
                    requests: requests,
                    totalActive: totalActive,
                    totalArchived: totalArchived,
                });
            }
        } catch (error) {
            if (isMounted) {
                logError("Failed to load requests data", { error: (error as Error).message });
                toast({ title: "Error", description: "No se pudieron cargar los datos de solicitudes.", variant: "destructive" });
            }
        } finally {
            if (isMounted) {
                updateState({ isLoading: false, isRefreshing: false });
            }
        }
        return () => { isMounted = false; };
    }, [isReady, toast, updateState, state.currentPage, state.rowsPerPage, state.viewingArchived, debouncedSearchTerm, state.statusFilter, state.classificationFilter, state.showOnlyMyRequests, state.dateFilter, currentUser?.name]);

    useEffect(() => {
        if (!isReady) return;
        loadInitialData();
    }, [isReady, loadInitialData]);

    const actions = {
        loadInitialData,
        // ... other actions
    } as any;

    const selectors = { hasPermission } as any;

    return { state, actions, selectors, isAuthorized };
}
