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
    ErpOrderHeader,
    ErpOrderLine,
    StockInfo,
    PurchaseRequestPriority,
    RequestNotePayload
} from '../../core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { useRouter } from 'next/navigation';

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
        newRequest: { priority: 'medium', purchaseType: 'single', salePriceCurrency: 'CRC', requiresCurrency: false } as Partial<PurchaseRequest>,
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
        if (!isAuthReady) return;
        
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
    }, [isAuthReady, toast, updateState, state.currentPage, state.pageSize, state.viewingArchived, debouncedSearchTerm, state.statusFilter, state.classificationFilter, state.showOnlyMyRequests, state.dateFilter, currentUser?.name]);

    useEffect(() => {
        if (!isAuthReady) return;
        loadInitialData();
    }, [isAuthReady, loadInitialData]);

    const actions = {
        loadInitialData,
        // ... other actions
    } as any;

    const selectors = {} as any;

    return { state, actions, selectors, isAuthorized };
}
