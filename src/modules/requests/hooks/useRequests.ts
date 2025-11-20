/**
 * @fileoverview Custom hook `useRequests` for managing the state and logic of the Purchase Request page.
 * This hook encapsulates all state and actions for the module, keeping the UI component clean.
 */

'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { 
    getPurchaseRequests, savePurchaseRequest, updatePurchaseRequest, 
    updatePurchaseRequestStatus, getRequestHistory, getRequestSettings, 
    updatePendingAction, getErpOrderData, addNoteToRequest, updateRequestDetails, 
    saveCostAnalysis as saveCostAnalysisAction
} from '@/modules/requests/lib/actions';
import { getAllErpPurchaseOrderHeaders, getAllErpPurchaseOrderLines } from '@/modules/core/lib/db';
import type { 
    PurchaseRequest, PurchaseRequestStatus, PurchaseRequestPriority, 
    PurchaseRequestHistoryEntry, RequestSettings, Company, DateRange, 
    AdministrativeAction, AdministrativeActionPayload, StockInfo, ErpOrderHeader, ErpOrderLine, User, RequestNotePayload, ErpPurchaseOrderHeader as ErpPOHeader, Product, Customer, ErpPurchaseOrderLine
} from '../../core/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { getDaysRemaining as getSimpleDaysRemaining } from '@/modules/core/lib/time-utils';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { AlertTriangle, Undo2, ChevronsLeft, ChevronsRight, Send, ShoppingBag } from 'lucide-react';
import type { RowInput } from 'jspdf-autotable';
import { useSearchParams } from 'next/navigation';


const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const emptyRequest: Omit<PurchaseRequest, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'deliveredQuantity' | 'receivedInWarehouseBy' | 'receivedDate' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'> = {
    requiredDate: new Date().toISOString().split('T')[0],
    clientId: '',
    clientName: '',
    clientTaxId: '',
    itemId: '',
    itemDescription: '',
    quantity: 0,
    notes: '',
    unitSalePrice: undefined,
    salePriceCurrency: 'CRC',
    requiresCurrency: true,
    manualSupplier: '',
    erpOrderNumber: '',
    erpOrderLine: 0,
    purchaseOrder: '',
    route: '',
    shippingMethod: '',
    inventory: 0,
    inventoryErp: 0,
    priority: 'medium',
    purchaseType: 'single',
    arrivalDate: '',
    pendingAction: 'none',
    analysis: undefined,
};

type UIErpOrderLine = {
    PEDIDO: string;
    PEDIDO_LINEA: number;
    ARTICULO: string;
    PRECIO_UNITARIO: number;
    CANTIDAD_PEDIDA: number;
    // UI state
    product: Product;
    stock: StockInfo | null;
    selected: boolean;
    displayQuantity: string;
    displayPrice: string;
};


const statusConfig: { [key: string]: { label: string; color: string } } = {
    pending: { label: "Pendiente", color: "bg-yellow-500" },
    'purchasing-review': { label: "Revisión Compras", color: "bg-cyan-500" },
    'pending-approval': { label: "Pendiente Aprobación", color: "bg-orange-500" },
    approved: { label: "Aprobada", color: "bg-green-500" },
    ordered: { label: "Ordenada", color: "bg-blue-500" },
    'received-in-warehouse': { label: "Recibido en Bodega", color: "bg-teal-500" },
    'entered-erp': { label: "Ingresado ERP", color: "bg-indigo-500" },
    canceled: { label: "Cancelada", color: "bg-red-700" }
};

const priorityConfig = { 
    low: { label: "Baja", className: "text-gray-500" }, 
    medium: { label: "Media", className: "text-blue-500" }, 
    high: { label: "Alta", className: "text-yellow-600" }, 
    urgent: { label: "Urgente", className: "text-red-600" }
};

type State = {
    isLoading: boolean;
    isRefreshing: boolean;
    isSubmitting: boolean;
    isNewRequestDialogOpen: boolean;
    isEditRequestDialogOpen: boolean;
    activeRequests: PurchaseRequest[];
    archivedRequests: PurchaseRequest[];
    viewingArchived: boolean;
    archivedPage: number;
    pageSize: number;
    totalArchived: number;
    requestSettings: RequestSettings | null;
    companyData: Company | null;
    newRequest: Omit<PurchaseRequest, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'deliveredQuantity' | 'receivedInWarehouseBy' | 'receivedDate' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'>;
    requestToEdit: PurchaseRequest | null;
    searchTerm: string;
    statusFilter: string;
    classificationFilter: string;
    dateFilter: DateRange | undefined;
    showOnlyMyRequests: boolean;
    clientSearchTerm: string;
    isClientSearchOpen: boolean;
    itemSearchTerm: string;
    isItemSearchOpen: boolean;
    isStatusDialogOpen: boolean;
    requestToUpdate: PurchaseRequest | null;
    newStatus: PurchaseRequestStatus | null;
    statusUpdateNotes: string;
    deliveredQuantity: number | string;
    erpEntryNumber: string;
    isHistoryDialogOpen: boolean;
    historyRequest: PurchaseRequest | null;
    history: PurchaseRequestHistoryEntry[];
    isHistoryLoading: boolean;
    isReopenDialogOpen: boolean;
    reopenStep: number;
    reopenConfirmationText: string;
    arrivalDate: string;
    isActionDialogOpen: boolean;
    isErpOrderModalOpen: boolean;
    isErpItemsModalOpen: boolean;
    erpOrderNumber: string;
    erpOrderHeaders: ErpOrderHeader[];
    selectedErpOrderHeader: ErpOrderHeader | null;
    erpOrderLines: UIErpOrderLine[];
    isErpLoading: boolean;
    showOnlyShortageItems: boolean;
    isContextInfoOpen: boolean;
    contextInfoData: PurchaseRequest | null;
    isAddNoteDialogOpen: boolean;
    notePayload: RequestNotePayload | null;
    erpPoHeaders: ErpPOHeader[];
    erpPoLines: ErpPurchaseOrderLine[];
    isTransitsDialogOpen: boolean;
    activeTransits: { itemId: string; itemDescription: string; transits: any[] } | null;
    isCostAnalysisDialogOpen: boolean;
    analysisCost: string;
    analysisSalePrice: string;
};

// Helper function to ensure complex fields are in the correct format (array).
const sanitizeRequest = (request: any): PurchaseRequest => {
  const sanitized = { ...request };
  if (sanitized.sourceOrders && typeof sanitized.sourceOrders === 'string') {
    try {
      sanitized.sourceOrders = JSON.parse(sanitized.sourceOrders);
    } catch {
      sanitized.sourceOrders = [];
    }
  } else if (!Array.isArray(sanitized.sourceOrders)) {
      sanitized.sourceOrders = [];
  }
  
  if (sanitized.involvedClients && typeof sanitized.involvedClients === 'string') {
    try {
      sanitized.involvedClients = JSON.parse(sanitized.involvedClients);
    } catch {
      sanitized.involvedClients = [];
    }
  } else if (!Array.isArray(sanitized.involvedClients)) {
      sanitized.involvedClients = [];
  }

  try {
      if (sanitized.analysis && typeof sanitized.analysis === 'string') {
          sanitized.analysis = JSON.parse(sanitized.analysis);
      } else if (typeof sanitized.analysis !== 'object') { // Allow null, but not other non-object types
          sanitized.analysis = undefined;
      }
  } catch {
      sanitized.analysis = undefined;
  }

  return sanitized as PurchaseRequest;
};


export const useRequests = () => {
    const { isAuthorized, hasPermission } = useAuthorization(['requests:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user: currentUser, stockLevels: authStockLevels, companyData: authCompanyData, isReady: isAuthReady, products, customers } = useAuth();
    const searchParams = useSearchParams();
    
    const [state, setState] = useState<State>({
        isLoading: true,
        isRefreshing: false,
        isSubmitting: false,
        isNewRequestDialogOpen: false,
        isEditRequestDialogOpen: false,
        activeRequests: [],
        archivedRequests: [],
        viewingArchived: false,
        archivedPage: 0,
        pageSize: 50,
        totalArchived: 0,
        requestSettings: null,
        companyData: null,
        newRequest: emptyRequest,
        requestToEdit: null,
        searchTerm: "",
        statusFilter: "all",
        classificationFilter: "all",
        dateFilter: undefined,
        showOnlyMyRequests: true,
        clientSearchTerm: "",
        isClientSearchOpen: false,
        itemSearchTerm: "",
        isItemSearchOpen: false,
        isStatusDialogOpen: false,
        requestToUpdate: null,
        newStatus: null,
        statusUpdateNotes: "",
        deliveredQuantity: "",
        erpEntryNumber: "",
        isHistoryDialogOpen: false,
        historyRequest: null,
        history: [],
        isHistoryLoading: false,
        isReopenDialogOpen: false,
        reopenStep: 0,
        reopenConfirmationText: '',
        arrivalDate: '',
        isActionDialogOpen: false,
        isErpOrderModalOpen: false,
        isErpItemsModalOpen: false,
        erpOrderNumber: '',
        erpOrderHeaders: [],
        selectedErpOrderHeader: null,
        erpOrderLines: [],
        isErpLoading: false,
        showOnlyShortageItems: true,
        isContextInfoOpen: false,
        contextInfoData: null,
        isAddNoteDialogOpen: false,
        notePayload: null,
        erpPoHeaders: [],
        erpPoLines: [],
        isTransitsDialogOpen: false,
        activeTransits: null,
        isCostAnalysisDialogOpen: false,
        analysisCost: '',
        analysisSalePrice: '',
    });
    
    const [debouncedSearchTerm] = useDebounce(state.searchTerm, state.companyData?.searchDebounceTime ?? 500);
    const [debouncedClientSearch] = useDebounce(state.clientSearchTerm, state.companyData?.searchDebounceTime ?? 500);
    const [debouncedItemSearch] = useDebounce(state.itemSearchTerm, state.companyData?.searchDebounceTime ?? 500);
    
    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const loadInitialData = useCallback(async (isRefresh = false) => {
        let isMounted = true;
        
        if (isRefresh) {
            updateState({ isRefreshing: true });
        } else {
            updateState({ isLoading: true });
        }

        try {
             const [settingsData, requestsData, poHeaders, poLines] = await Promise.all([
                getRequestSettings(),
                getPurchaseRequests({
                    page: state.viewingArchived ? state.archivedPage : undefined,
                    pageSize: state.viewingArchived ? state.pageSize : undefined,
                }),
                getAllErpPurchaseOrderHeaders(),
                getAllErpPurchaseOrderLines(),
            ]);
            
            if (!isMounted) return;

            updateState({ 
                requestSettings: settingsData, 
                erpPoHeaders: poHeaders,
                erpPoLines: poLines
            });
            
            const useWarehouse = settingsData.useWarehouseReception;
            const useErpEntry = settingsData.useErpEntry;

            const finalStatus = useErpEntry ? 'entered-erp' : (useWarehouse ? 'received-in-warehouse' : 'ordered');
            const archivedStatuses = [finalStatus, 'canceled'];

            const allRequests = requestsData.requests.map(sanitizeRequest);
            
            updateState({
                activeRequests: allRequests.filter(req => !archivedStatuses.includes(req.status)),
                archivedRequests: allRequests.filter(req => archivedStatuses.includes(req.status)),
                totalArchived: requestsData.totalArchivedCount,
            });

        } catch (error) {
             if (isMounted) {
                logError("Failed to load purchase requests data", { context: 'useRequests.loadInitialData', error: (error as Error).message });
                toast({ title: "Error", description: "No se pudieron cargar las solicitudes de compra.", variant: "destructive" });
            }
        } finally {
            if (isMounted) {
                updateState({ isLoading: false, isRefreshing: false });
            }
        }
         return () => { isMounted = false; };
    }, [toast, state.viewingArchived, state.pageSize, updateState, state.archivedPage]);
    
    useEffect(() => {
        setTitle("Solicitud de Compra");
        if (isAuthReady) {
            loadInitialData(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTitle, isAuthReady]);

     useEffect(() => {
        if (!isAuthReady || state.isLoading) return;
        loadInitialData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.viewingArchived, state.archivedPage, state.pageSize, isAuthReady]);

    // Effect to pre-fill form from URL parameters
    useEffect(() => {
        if (isAuthReady && customers.length > 0 && products.length > 0) {
            const itemId = searchParams.get('itemId');
            if (itemId) {
                const product = products.find(p => p.id === itemId);
                const customer = customers.find(c => c.id === searchParams.get('clientId'));

                if (product) {
                    const newRequestData: Partial<typeof emptyRequest> = {
                        itemId: product.id,
                        itemDescription: product.description,
                        quantity: Number(searchParams.get('quantity')) || 1,
                        clientId: customer?.id || '',
                        clientName: customer?.name || '',
                        clientTaxId: customer?.taxId || '',
                        purchaseOrder: searchParams.get('purchaseOrder') || '',
                        notes: searchParams.get('notes') || '',
                        requiredDate: searchParams.get('requiredDate') || new Date().toISOString().split('T')[0],
                    };
                    updateState({ newRequest: { ...emptyRequest, ...newRequestData }, isNewRequestDialogOpen: true });
                    // Clean URL
                    window.history.replaceState({}, '', '/dashboard/requests');
                }
            }
        }
    }, [isAuthReady, searchParams, customers, products, updateState]);

    useEffect(() => {
        updateState({ companyData: authCompanyData });
    }, [authCompanyData, updateState]);
    
    const getRequestPermissions = useCallback((request: PurchaseRequest) => {
        const isPending = request.status === 'pending';
        const isPurchasingReview = request.status === 'purchasing-review';
        const isPendingApproval = request.status === 'pending-approval';
        const isApproved = request.status === 'approved';
        const isOrdered = request.status === 'ordered';
        const isReceivedInWarehouse = request.status === 'received-in-warehouse';
        
        let finalArchivedStatus: PurchaseRequestStatus = 'ordered';
        if (state.requestSettings?.useErpEntry) {
            finalArchivedStatus = 'entered-erp';
        } else if (state.requestSettings?.useWarehouseReception) {
            finalArchivedStatus = 'received-in-warehouse';
        }
        const isArchived = request.status === finalArchivedStatus || request.status === 'canceled';

        return {
            canEdit: (isPending || isPurchasingReview || isPendingApproval) && hasPermission('requests:edit:pending'),
            canReopen: isArchived && hasPermission('requests:reopen'),
            canSendToReview: isPending && hasPermission('requests:status:review'),
            canGoBackToPending: isPurchasingReview && hasPermission('requests:status:review'),
            canSendToApproval: isPurchasingReview && hasPermission('requests:status:pending-approval'),
            canGoBackToReview: isPendingApproval && hasPermission('requests:status:pending-approval'),
            canApprove: isPendingApproval && hasPermission('requests:status:approve'),
            canOrder: isApproved && hasPermission('requests:status:ordered'),
            canRevertToApproved: isOrdered && hasPermission('requests:status:revert-to-approved'),
            canReceiveInWarehouse: isOrdered && !!state.requestSettings?.useWarehouseReception && hasPermission('requests:status:received-in-warehouse'),
            canEnterToErp: isReceivedInWarehouse && !!state.requestSettings?.useErpEntry && hasPermission('requests:status:entered-erp'),
            canRequestCancel: (isApproved || isOrdered) && hasPermission('requests:status:cancel'),
            canCancelPending: (isPending || isPurchasingReview || isPendingApproval) && hasPermission('requests:status:cancel'),
            canRequestUnapproval: (isApproved || isOrdered) && hasPermission('requests:status:unapproval-request'),
            canAddNote: hasPermission('requests:notes:add'),
        };
    }, [hasPermission, state.requestSettings]);

    const executeStatusUpdate = async (statusOverride?: PurchaseRequestStatus) => {
        const finalStatus = statusOverride || state.newStatus;
        if (!state.requestToUpdate || !finalStatus || !currentUser) return;
        updateState({ isSubmitting: true });
        try {
            const rawUpdatedRequest = await updatePurchaseRequestStatus({ 
                requestId: state.requestToUpdate.id, 
                status: finalStatus, 
                notes: state.statusUpdateNotes, 
                updatedBy: currentUser.name, 
                reopen: false, 
                deliveredQuantity: finalStatus === 'received-in-warehouse' ? Number(state.deliveredQuantity) : undefined,
                arrivalDate: finalStatus === 'ordered' ? state.arrivalDate : undefined,
                erpEntryNumber: finalStatus === 'entered-erp' ? state.erpEntryNumber : undefined,
            });
            
            const updatedRequest = sanitizeRequest(rawUpdatedRequest);

            toast({ title: "Estado Actualizado" });
            
            updateState({
                isStatusDialogOpen: false,
                isActionDialogOpen: false,
            });
            // Reload data to correctly move items between active/archived lists
            await loadInitialData(true);

        } catch (error: any) {
            logError("Failed to update status", { context: 'useRequests.executeStatusUpdate', error: error.message });
            toast({ title: "Error", variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };
    
    const handleAdminAction = async (approve: boolean) => {
        if (!state.requestToUpdate || !currentUser || !state.requestToUpdate.pendingAction || state.requestToUpdate.pendingAction === 'none') return;
        updateState({ isSubmitting: true });

        try {
            if (approve) {
                const targetStatus = state.requestToUpdate.pendingAction === 'unapproval-request' ? 'pending' : 'canceled';
                await executeStatusUpdate(targetStatus);
            } else {
                 const rawUpdated = await updatePendingAction({
                    entityId: state.requestToUpdate.id,
                    action: 'none',
                    notes: state.statusUpdateNotes,
                    updatedBy: currentUser.name,
                });
                const updated = sanitizeRequest(rawUpdated);
                toast({ title: 'Solicitud Rechazada' });
                updateState({
                    activeRequests: state.activeRequests.map(r => r.id === updated.id ? updated : r)
                });
            }
            updateState({ isActionDialogOpen: false });
        } catch (error: any) {
            logError("Failed to handle admin action", { context: 'useRequests.handleAdminAction', error: error.message });
            toast({ title: "Error", variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };
    
    const actions = {
        loadInitialData,
        handleStatusUpdate: executeStatusUpdate,
        handleAdminAction,
        handleCreateRequest: async () => {
            if (!currentUser) return;
            
            if (!state.newRequest.clientId || !state.newRequest.itemId || !state.newRequest.quantity || !state.newRequest.requiredDate) {
                toast({ title: "Campos Requeridos", description: "Cliente, artículo, cantidad y fecha requerida son obligatorios.", variant: "destructive" });
                return;
            }
            if (state.newRequest.requiresCurrency && (!state.newRequest.unitSalePrice || state.newRequest.unitSalePrice <= 0)) {
                toast({ title: "Precio de Venta Requerido", description: "Debe ingresar un precio de venta mayor a cero o desmarcar la casilla 'Registrar Precio de Venta'.", variant: "destructive" });
                return;
            }

            const requestWithFormattedDate = {
                ...state.newRequest,
                requiredDate: new Date(state.newRequest.requiredDate).toISOString().split('T')[0]
            };

            updateState({ isSubmitting: true });
            try {
                const rawCreatedRequest = await savePurchaseRequest(requestWithFormattedDate, currentUser.name);
                const createdRequest = sanitizeRequest(rawCreatedRequest);
                toast({ title: "Solicitud Creada" });
                updateState({
                    isNewRequestDialogOpen: false,
                    newRequest: { ...emptyRequest, requiredDate: '', requiresCurrency: true },
                    clientSearchTerm: '',
                    itemSearchTerm: '',
                    activeRequests: [createdRequest, ...state.activeRequests]
                });
            } catch (error: any) {
                logError("Failed to create request", { context: 'useRequests.handleCreateRequest', error: error.message });
                toast({ title: "Error al Crear", description: `No se pudo crear la solicitud. ${error.message}`, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleEditRequest: async (e: FormEvent) => {
            e.preventDefault();
            if (!state.requestToEdit || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const updated = await updatePurchaseRequest({ requestId: state.requestToEdit.id, updatedBy: currentUser.name, ...state.requestToEdit });
                updateState({
                    activeRequests: state.activeRequests.map(r => r.id === updated.id ? sanitizeRequest(updated) : r),
                    archivedRequests: state.archivedRequests.map(r => r.id === updated.id ? sanitizeRequest(updated) : r),
                    isEditRequestDialogOpen: false
                });
                toast({ title: "Solicitud Actualizada" });
            } catch (error: any) {
                logError("Failed to edit request", { context: 'useRequests.handleEditRequest', error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        openStatusDialog: (request: PurchaseRequest, status: PurchaseRequestStatus) => {
            updateState({
                requestToUpdate: request,
                newStatus: status,
                statusUpdateNotes: ".",
                deliveredQuantity: status === 'received-in-warehouse' ? request.quantity : "",
                erpEntryNumber: "",
                arrivalDate: '',
                isStatusDialogOpen: true
            });
        },
        openAdminActionDialog: async (request: PurchaseRequest, action: AdministrativeAction) => {
            if (!currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const updated = await updatePendingAction({
                    entityId: request.id,
                    action,
                    notes: `Solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} iniciada.`,
                    updatedBy: currentUser.name,
                });
                updateState({
                    activeRequests: state.activeRequests.map(r => r.id === updated.id ? sanitizeRequest(updated) : r),
                    archivedRequests: state.archivedRequests.map(r => r.id === updated.id ? sanitizeRequest(updated) : r)
                });
                toast({ title: "Solicitud Enviada", description: `Tu solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} ha sido enviada para revisión.` });
            } catch (error: any) {
                logError(`Failed to request ${action}`, { context: 'useRequests.openAdminActionDialog', error: error.message });
                toast({ title: "Error al Solicitar", description: `No se pudo enviar la solicitud. ${error.message}`, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleOpenHistory: async (request: PurchaseRequest) => {
            updateState({ historyRequest: request, isHistoryDialogOpen: true, isHistoryLoading: true });
            try {
                updateState({ history: await getRequestHistory(request.id) });
            } catch (error: any) {
                logError("Failed to get history", { context: 'useRequests.handleOpenHistory', error: error.message});
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isHistoryLoading: false });
            }
        },
        handleReopenRequest: async () => {
            if (!state.requestToUpdate || !currentUser || state.reopenStep !== 2 || state.reopenConfirmationText !== 'REABRIR') return;
            updateState({ isSubmitting: true });
            try {
                await updatePurchaseRequestStatus({ requestId: state.requestToUpdate.id, status: 'pending', notes: 'Solicitud reabierta.', updatedBy: currentUser.name, reopen: true });
                toast({ title: "Solicitud Reabierta" });
                updateState({ isReopenDialogOpen: false });
                await loadInitialData(true);
            } catch (error: any) {
                logError("Failed to reopen request", { context: 'useRequests.handleReopenRequest', error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleSelectItem: (value: string) => {
            updateState({ isItemSearchOpen: false });
            const product = products.find(p => p.id === value);
            if (product) {
                const stock = authStockLevels.find(s => s.itemId === product.id)?.totalStock ?? 0;
                const dataToUpdate = { 
                    itemId: product.id, 
                    itemDescription: product.description || '', 
                    inventoryErp: stock 
                };
                if (state.requestToEdit) {
                     updateState({
                        requestToEdit: state.requestToEdit ? { ...state.requestToEdit, ...dataToUpdate } : null
                    });
                } else {
                    updateState({ newRequest: { ...state.newRequest, ...dataToUpdate }});
                }
                updateState({ itemSearchTerm: `[${product.id}] - ${product.description}` });
            } else {
                 updateState({ itemSearchTerm: '' });
            }
        },
        handleSelectClient: (value: string) => {
            updateState({ isClientSearchOpen: false });
            const client = customers.find(c => c.id === value);
            if (client) {
                const dataToUpdate = { clientId: client.id, clientName: client.name, clientTaxId: client.taxId };
                if (state.requestToEdit) {
                     updateState({
                        requestToEdit: state.requestToEdit ? { ...state.requestToEdit, ...dataToUpdate } : null
                    });
                } else {
                    updateState({ newRequest: { ...state.newRequest, ...dataToUpdate }});
                }
                updateState({ clientSearchTerm: `[${client.id}] ${client.name} (${client.taxId})` });
            } else {
                updateState({ clientSearchTerm: '' });
            }
        },
        handleFetchErpOrder: async () => {
            if (!state.erpOrderNumber) return;
            updateState({ isErpLoading: true });
            
            try {
                const { headers } = await getErpOrderData(state.erpOrderNumber);
                
                const enrichedHeaders = headers.map(h => {
                    const client = customers.find(c => c.id === h.CLIENTE);
                    return { ...h, CLIENTE_NOMBRE: client?.name || 'Cliente no encontrado' };
                }).sort((a, b) => {
                    if (a.PEDIDO === state.erpOrderNumber) return -1;
                    if (b.PEDIDO === state.erpOrderNumber) return 1;
                    return a.PEDIDO.localeCompare(b.PEDIDO);
                });

                if (enrichedHeaders.length === 1) {
                    await actions.processSingleErpOrder(enrichedHeaders[0]);
                } else if (enrichedHeaders.length > 1) {
                    updateState({ erpOrderHeaders: enrichedHeaders });
                } else {
                     toast({ title: "Pedido no encontrado", description: `No se encontró ningún pedido con el número: ${state.erpOrderNumber}`, variant: "destructive" });
                }
                
            } catch (error: any) {
                logError('Failed to fetch ERP order data', { context: 'useRequests.handleFetchErpOrder', error: error.message, orderNumber: state.erpOrderNumber });
                toast({ title: "Error al Cargar Pedido", description: error.message, variant: "destructive" });
            } finally {
                updateState({ isErpLoading: false });
            }
        },
        processSingleErpOrder: async (header: ErpOrderHeader) => {
            const client = customers.find(c => c.id === header.CLIENTE);
            const enrichedHeader = { ...header, CLIENTE_NOMBRE: client?.name || 'Cliente no encontrado' };
            
            const { lines, inventory } = await getErpOrderData(header.PEDIDO);

            const enrichedLines: UIErpOrderLine[] = lines.map(line => {
                const product = products.find(p => p.id === line.ARTICULO) || {id: line.ARTICULO, description: `Artículo ${line.ARTICULO} no encontrado`, active: 'N', cabys: '', classification: '', isBasicGood: 'N', lastEntry: '', notes: '', unit: ''};
                const stock = inventory.find(s => s.itemId === line.ARTICULO) || null;
                const needsBuying = stock ? line.CANTIDAD_PEDIDA > stock.totalStock : true;
                return {
                    ...line,
                    product,
                    stock,
                    selected: needsBuying,
                    displayQuantity: String(line.CANTIDAD_PEDIDA),
                    displayPrice: String(line.PRECIO_UNITARIO),
                };
            }).sort((a, b) => (a.selected === b.selected) ? 0 : a.selected ? -1 : 1);

            updateState({
                selectedErpOrderHeader: enrichedHeader,
                erpOrderLines: enrichedLines,
                isErpOrderModalOpen: false,
                isErpItemsModalOpen: true,
            });
        },
        handleSelectErpOrderHeader: async (header: ErpOrderHeader) => {
            updateState({ isErpLoading: true, isErpOrderModalOpen: false });
            
            try {
                await actions.processSingleErpOrder(header);
            } catch (error: any) {
                logError('Failed to fetch lines for selected ERP order', { context: 'useRequests.handleSelectErpOrderHeader', error: error.message, orderNumber: header.PEDIDO });
                toast({ title: "Error al Cargar Líneas", description: error.message, variant: "destructive" });
            } finally {
                updateState({ isErpLoading: false });
            }
        },
        handleCancelErpFetch: () => {
            updateState({
                isErpLoading: false,
                isErpOrderModalOpen: false,
                erpOrderHeaders: [],
                erpOrderNumber: ''
            });
        },
        handleErpLineChange: (lineIndex: number, field: keyof UIErpOrderLine, value: string | boolean) => {
            if (lineIndex === -1) { // Select/Deselect all
                 updateState({ erpOrderLines: state.erpOrderLines.map(line => ({ ...line, selected: !!value })) });
            } else {
                updateState({
                    erpOrderLines: state.erpOrderLines.map((line, index) => 
                        index === lineIndex ? { ...line, [field]: value } : line
                    )
                });
            }
        },
        handleCreateRequestsFromErp: async () => {
            if (!state.selectedErpOrderHeader || !currentUser) return;
            const erpHeader = state.selectedErpOrderHeader;

            const selectedLines = state.erpOrderLines.filter(line => line.selected);
            if (selectedLines.length === 0) {
                toast({ title: "No hay artículos seleccionados", description: "Marque al menos un artículo para crear solicitudes.", variant: "destructive" });
                return;
            }

            updateState({ isSubmitting: true });
            try {
                for (const line of selectedLines) {
                    const requestPayload = {
                        requiredDate: new Date(erpHeader.FECHA_PROMETIDA).toISOString().split('T')[0],
                        clientId: erpHeader.CLIENTE,
                        clientName: erpHeader.CLIENTE_NOMBRE || '',
                        clientTaxId: customers.find(c => c.id === erpHeader.CLIENTE)?.taxId || '',
                        itemId: line.ARTICULO,
                        itemDescription: line.product.description,
                        quantity: parseFloat(line.displayQuantity) || 0,
                        notes: `Generado desde Pedido ERP: ${erpHeader.PEDIDO}`,
                        unitSalePrice: parseFloat(line.displayPrice) || 0,
                        purchaseOrder: erpHeader.ORDEN_COMPRA || '',
                        erpOrderNumber: erpHeader.PEDIDO,
                        erpOrderLine: line.PEDIDO_LINEA,
                        priority: 'medium' as PurchaseRequestPriority,
                        purchaseType: 'single' as const,
                        route: '',
                        shippingMethod: '',
                        inventory: 0,
                        manualSupplier: '',
                        arrivalDate: '',
                        pendingAction: 'none' as const,
                    };
                    await savePurchaseRequest(requestPayload, currentUser.name);
                }
                toast({ title: "Solicitudes Creadas", description: `Se crearon ${selectedLines.length} solicitudes de compra.` });
                updateState({ isErpItemsModalOpen: false, erpOrderNumber: '' });
                await loadInitialData();
            } catch (error: any) {
                logError("Failed to create requests from ERP order", { context: 'useRequests.handleCreateRequestsFromErp', error: error.message });
                toast({ title: "Error al Crear Solicitudes", description: error.message, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleExportExcel: () => {
            if (!state.requestSettings) return;
            
            const dataToExport = selectors.filteredRequests.map(request => [
                request.consecutive,
                request.itemDescription,
                request.clientName,
                request.quantity,
                format(parseISO(request.requiredDate), 'dd/MM/yyyy'),
                statusConfig[request.status]?.label || request.status,
                request.requestedBy,
                request.purchaseOrder,
                request.manualSupplier,
            ]);

            exportToExcel({
                fileName: 'solicitudes_compra',
                sheetName: 'Solicitudes',
                headers: ['Solicitud', 'Artículo', 'Cliente', 'Cant.', 'Fecha Req.', 'Estado', 'Solicitante', 'OC Cliente', 'Proveedor'],
                data: dataToExport,
                columnWidths: [12, 40, 25, 8, 12, 15, 15, 15, 20],
            });
        },
        handleExportPDF: async (orientation: 'portrait' | 'landscape' = 'portrait') => {
            if (!authCompanyData || !state.requestSettings) return;

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
                } catch (e) {
                    console.error("Error processing logo for PDF:", e);
                }
            }

            const allPossibleColumns: { id: string; header: string; width?: number }[] = [
                { id: 'consecutive', header: 'SC', width: 45 },
                { id: 'itemDescription', header: 'Artículo' },
                { id: 'clientName', header: 'Cliente' },
                { id: 'quantity', header: 'Cant.', width: 35 },
                { id: 'requiredDate', header: 'F. Req.', width: 55 },
                { id: 'status', header: 'Estado', width: 75 },
                { id: 'requestedBy', header: 'Solicita', width: 65 },
                { id: 'purchaseOrder', header: 'OC Cliente' },
                { id: 'manualSupplier', header: 'Proveedor' },
            ];
            
            const selectedColumnIds = state.requestSettings.pdfExportColumns || [];
            const tableHeaders = selectedColumnIds.map(id => allPossibleColumns.find(c => c.id === id)?.header || id);
            
            const tableRows: RowInput[] = selectors.filteredRequests.map(request => {
                return selectedColumnIds.map(id => {
                    switch (id) {
                        case 'consecutive': return request.consecutive;
                        case 'itemDescription': return `[${request.itemId}] ${request.itemDescription}`;
                        case 'clientName': return request.clientName;
                        case 'quantity': return request.quantity.toLocaleString('es-CR');
                        case 'requiredDate': return format(parseISO(request.requiredDate), 'dd/MM/yy');
                        case 'status': return statusConfig[request.status]?.label || request.status;
                        case 'requestedBy': return request.requestedBy;
                        case 'purchaseOrder': return request.purchaseOrder || 'N/A';
                        case 'manualSupplier': return request.manualSupplier || 'N/A';
                        default: return '';
                    }
                });
            });

            const doc = generateDocument({
                docTitle: `Solicitudes de Compra (${state.viewingArchived ? 'Archivadas' : 'Activas'})`,
                docId: '',
                companyData: authCompanyData,
                logoDataUrl,
                meta: [{ label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
                blocks: [],
                table: {
                    columns: tableHeaders,
                    rows: tableRows,
                    columnStyles: selectedColumnIds.reduce((acc, id, index) => {
                        const col = allPossibleColumns.find(c => c.id === id);
                        if (col?.width) { (acc as any)[index] = { cellWidth: col.width }; }
                        if (id === 'quantity') { (acc as any)[index] = { ...(acc as any)[index], halign: 'right' }; }
                        return acc;
                    }, {} as { [key: number]: any })
                },
                totals: [],
                topLegend: state.requestSettings.pdfTopLegend,
                paperSize: state.requestSettings.pdfPaperSize,
                orientation: orientation,
            });
        
            doc.save(`solicitudes_compra_${new Date().getTime()}.pdf`);
        },
        handleExportSingleRequestPDF: async (request: PurchaseRequest) => {
            // Implementation remains the same
        },
        openAddNoteDialog: (request: PurchaseRequest) => {
            if (!currentUser) return;
            updateState({
                notePayload: { requestId: request.id, notes: '', updatedBy: currentUser.name },
                isAddNoteDialogOpen: true
            });
        },
    
        handleAddNote: async () => {
            if (!state.notePayload || !state.notePayload.notes.trim() || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const payload = { ...state.notePayload, updatedBy: currentUser.name };
                const updatedRequest = await addNoteToRequest(payload);
                toast({ title: "Nota Añadida" });
                setState(prevState => ({
                    ...prevState,
                    isAddNoteDialogOpen: false,
                    activeRequests: prevState.activeRequests.map(o => o.id === updatedRequest.id ? sanitizeRequest(updatedRequest) : o),
                    archivedRequests: prevState.archivedRequests.map(o => o.id === updatedRequest.id ? sanitizeRequest(updatedRequest) : o)
                }));
            } catch(error: any) {
                logError("Failed to add note to request", { context: 'useRequests.handleAddNote', error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleDetailUpdate: async (requestId: number, details: { priority: PurchaseRequestPriority }) => {
            if (!currentUser) return;
            const updated = await updateRequestDetails({ requestId, ...details, updatedBy: currentUser.name });
            updateState({ 
                activeRequests: state.activeRequests.map(o => o.id === requestId ? sanitizeRequest(updated) : o),
                archivedRequests: state.archivedRequests.map(o => o.id === requestId ? sanitizeRequest(updated) : o)
            });
        },
        setNewRequest: (updater: (prev: State['newRequest']) => State['newRequest']) => {
            const newState = updater(state.newRequest);
            if (newState.requiresCurrency && !newState.salePriceCurrency) {
                newState.salePriceCurrency = 'CRC';
            }
            updateState({ newRequest: newState });
        },
        handleOpenTransits: (request: PurchaseRequest) => {
            const activePoNumbers = new Set(state.erpPoHeaders.filter(h => h.ESTADO === 'A').map(h => h.ORDEN_COMPRA));
            const transitsForProduct = state.erpPoLines
                .filter(line => line.ARTICULO === request.itemId && activePoNumbers.has(line.ORDEN_COMPRA))
                .map(line => {
                    const header = state.erpPoHeaders.find(h => h.ORDEN_COMPRA === line.ORDEN_COMPRA);
                    return {
                        ...header,
                        quantity: line.CANTIDAD_ORDENADA,
                        supplierName: 'Desconocido' // This needs to be fetched from suppliers table
                    };
                });
            
            updateState({ 
                activeTransits: {
                    itemId: request.itemId,
                    itemDescription: request.itemDescription,
                    transits: transitsForProduct
                },
                isTransitsDialogOpen: true 
            });
        },
        openCostAnalysisDialog: (request: PurchaseRequest) => {
            updateState({
                requestToUpdate: request,
                analysisCost: request.analysis?.cost?.toString() || '',
                analysisSalePrice: request.unitSalePrice?.toString() || '',
                isCostAnalysisDialogOpen: true,
            });
        },
        handleSaveCostAnalysis: async () => {
            if (!state.requestToUpdate) return;
            const cost = parseFloat(state.analysisCost);
            const salePrice = parseFloat(state.analysisSalePrice);
            if (isNaN(cost) || isNaN(salePrice)) {
                toast({ title: "Valores inválidos", description: "El costo y el precio de venta deben ser números.", variant: "destructive" });
                return;
            }
            updateState({ isSubmitting: true });
            try {
                const updatedRequest = await saveCostAnalysisAction(state.requestToUpdate.id, cost, salePrice);
                toast({ title: "Análisis Guardado" });
                setState(prevState => ({
                    ...prevState,
                    isCostAnalysisDialogOpen: false,
                    activeRequests: prevState.activeRequests.map(r => r.id === updatedRequest.id ? sanitizeRequest(updatedRequest) : r),
                    archivedRequests: prevState.archivedRequests.map(r => r.id === updatedRequest.id ? sanitizeRequest(updatedRequest) : r),
                }));
            } catch (error: any) {
                logError("Failed to save cost analysis", { error: error.message, requestId: state.requestToUpdate.id });
                toast({ title: "Error", description: `No se pudo guardar el análisis: ${error.message}`, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        // setters
        setNewRequestDialogOpen: (isOpen: boolean) => updateState({ 
            isNewRequestDialogOpen: isOpen, 
            newRequest: { ...emptyRequest, requiredDate: new Date().toISOString().split('T')[0], requiresCurrency: true }, 
            clientSearchTerm: '', 
            itemSearchTerm: '' 
        }),
        setEditRequestDialogOpen: (isOpen: boolean) => updateState({ isEditRequestDialogOpen: isOpen }),
        setViewingArchived: (isArchived: boolean) => updateState({ viewingArchived: isArchived, archivedPage: 0 }),
        setArchivedPage: (updater: (prev: number) => number) => updateState({ archivedPage: updater(state.archivedPage) }),
        setPageSize: (size: number) => updateState({ pageSize: size, archivedPage: 0 }),
        setRequestToEdit: (request: PurchaseRequest | null) => updateState({ requestToEdit: request }),
        setSearchTerm: (term: string) => updateState({ searchTerm: term }),
        setStatusFilter: (filter: string) => updateState({ statusFilter: filter }),
        setClassificationFilter: (filter: string) => updateState({ classificationFilter: filter }),
        setDateFilter: (range: DateRange | undefined) => updateState({ dateFilter: range }),
        setShowOnlyMyRequests: (show: boolean) => {
            if (!show && !hasPermission('requests:read:all')) {
                toast({ title: "Permiso Requerido", description: "No tienes permiso para ver todas las solicitudes.", variant: "destructive"});
                return;
            }
            updateState({ showOnlyMyRequests: show });
        },
        setClientSearchTerm: (term: string) => updateState({ clientSearchTerm: term }),
        setClientSearchOpen: (isOpen: boolean) => updateState({ isClientSearchOpen: isOpen }),
        setItemSearchTerm: (term: string) => updateState({ itemSearchTerm: term }),
        setItemSearchOpen: (isOpen: boolean) => updateState({ isItemSearchOpen: isOpen }),
        setStatusDialogOpen: (isOpen: boolean) => updateState({ isStatusDialogOpen: isOpen }),
        setRequestToUpdate: (request: PurchaseRequest | null) => updateState({ requestToUpdate: request }),
        setNewStatus: (status: PurchaseRequestStatus | null) => updateState({ newStatus: status }),
        setStatusUpdateNotes: (notes: string) => updateState({ statusUpdateNotes: notes }),
        setDeliveredQuantity: (qty: number | string) => updateState({ deliveredQuantity: qty }),
        setErpEntryNumber: (num: string) => updateState({ erpEntryNumber: num }),
        setHistoryDialogOpen: (isOpen: boolean) => updateState({ isHistoryDialogOpen: isOpen }),
        setReopenDialogOpen: (isOpen: boolean) => updateState({ isReopenDialogOpen: isOpen }),
        setReopenStep: (step: number) => updateState({ reopenStep: step }),
        setReopenConfirmationText: (text: string) => updateState({ reopenConfirmationText: text }),
        setArrivalDate: (date: string) => updateState({ arrivalDate: date }),
        setActionDialogOpen: (isOpen: boolean) => updateState({ isActionDialogOpen: isOpen }),
        setErpOrderModalOpen: (isOpen: boolean) => updateState({ isErpOrderModalOpen: isOpen, erpOrderHeaders: [], erpOrderNumber: '' }),
        setErpItemsModalOpen: (isOpen: boolean) => updateState({ isErpItemsModalOpen: isOpen }),
        setErpOrderNumber: (num: string) => updateState({ erpOrderNumber: num }),
        setShowOnlyShortageItems: (show: boolean) => updateState({ showOnlyShortageItems: show }),
        setContextInfoOpen: (request: PurchaseRequest | null) => updateState({ isContextInfoOpen: !!request, contextInfoData: request }),
        setAddNoteDialogOpen: (isOpen: boolean) => updateState({ isAddNoteDialogOpen: isOpen }),
        setNotePayload: (payload: RequestNotePayload | null) => updateState({ notePayload: payload }),
        setTransitsDialogOpen: (isOpen: boolean) => updateState({ isTransitsDialogOpen: isOpen }),
        setCostAnalysisDialogOpen: (isOpen: boolean) => updateState({ isCostAnalysisDialogOpen: isOpen }),
        setAnalysisCost: (cost: string) => updateState({ analysisCost: cost }),
        setAnalysisSalePrice: (price: string) => updateState({ analysisSalePrice: price }),
    };

    const selectors = {
        hasPermission,
        priorityConfig,
        statusConfig,
        getRequestPermissions,
        getDaysRemaining: (dateStr: string) => getSimpleDaysRemaining(dateStr),
        clientOptions: useMemo(() => {
            if (debouncedClientSearch.length < 2) return [];
            const searchTerms = normalizeText(debouncedClientSearch).split(' ').filter(Boolean);
            return customers.filter(c => {
                const targetText = normalizeText(`${c.id} ${c.name} ${c.taxId}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(c => ({ value: c.id, label: `[${c.id}] ${c.name} (${c.taxId})` }));
        }, [customers, debouncedClientSearch]),
        itemOptions: useMemo(() => {
            if (debouncedItemSearch.length < 2) return [];
            const searchTerms = normalizeText(debouncedItemSearch).split(' ').filter(Boolean);
            return products.filter(p => {
                const targetText = normalizeText(`${p.id} ${p.description}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(p => ({ value: p.id, label: `[${p.id}] - ${p.description}` }));
        }, [products, debouncedItemSearch]),
        classifications: useMemo(() => Array.from(new Set(products.map(p => p.classification).filter(Boolean))), [products]),
        filteredRequests: useMemo(() => {
            let requestsToFilter = state.viewingArchived ? state.archivedRequests : state.activeRequests;
            
            const searchTerms = normalizeText(debouncedSearchTerm).split(' ').filter(Boolean);
            return requestsToFilter.filter(request => {
                const product = products.find(p => p.id === request.itemId);
                const targetText = normalizeText(`${request.consecutive} ${request.clientName} ${request.itemDescription} ${request.purchaseOrder || ''} ${request.erpOrderNumber || ''}`);
                
                const searchMatch = debouncedSearchTerm ? searchTerms.every(term => targetText.includes(term)) : true;
                const statusMatch = state.statusFilter === 'all' || request.status === state.statusFilter;
                const classificationMatch = state.classificationFilter === 'all' || (product && product.classification === state.classificationFilter);
                const dateMatch = !state.dateFilter || !state.dateFilter.from || (new Date(request.requiredDate) >= state.dateFilter.from && new Date(request.requiredDate) <= (state.dateFilter.to || state.dateFilter.from));
                const myRequestsMatch = !state.showOnlyMyRequests || (currentUser?.name && request.requestedBy.toLowerCase() === currentUser.name.toLowerCase()) || (currentUser?.erpAlias && request.erpOrderNumber && request.erpOrderNumber.toLowerCase().includes(currentUser.erpAlias.toLowerCase()));

                return searchMatch && statusMatch && classificationMatch && dateMatch && myRequestsMatch;
            });
        }, [state.viewingArchived, state.activeRequests, state.archivedRequests, debouncedSearchTerm, state.statusFilter, state.classificationFilter, products, state.dateFilter, state.showOnlyMyRequests, currentUser?.name, currentUser?.erpAlias]),
        stockLevels: authStockLevels,
        visibleErpOrderLines: useMemo(() => {
            if (!state.showOnlyShortageItems) {
                return state.erpOrderLines;
            }
            return state.erpOrderLines.filter(line => {
                const needsBuying = line.stock ? line.CANTIDAD_PEDIDA > line.stock.totalStock : true;
                return needsBuying;
            });
        }, [state.erpOrderLines, state.showOnlyShortageItems]),
        getInTransitStock: useCallback((itemId: string): number => {
            const activePoNumbers = new Set(state.erpPoHeaders.filter(h => h.ESTADO === 'A').map(h => h.ORDEN_COMPRA));
            return state.erpPoLines
                .filter(line => line.ARTICULO === itemId && activePoNumbers.has(line.ORDEN_COMPRA))
                .reduce((sum, line) => sum + line.CANTIDAD_ORDENADA, 0);
        }, [state.erpPoHeaders, state.erpPoLines]),
        costAnalysis: useMemo(() => {
            const cost = parseFloat(state.analysisCost);
            const salePrice = parseFloat(state.analysisSalePrice);
            let margin = 0;
            if (!isNaN(cost) && !isNaN(salePrice) && cost > 0) {
                margin = (salePrice - cost) / cost;
            } else if (!isNaN(cost) && !isNaN(salePrice) && salePrice > 0) {
                 margin = ((salePrice - cost) / salePrice) * 100;
            }
            return { cost: state.analysisCost, salePrice: state.analysisSalePrice, margin };
        }, [state.analysisCost, state.analysisSalePrice]),
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized
    };
}
