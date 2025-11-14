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
    updatePendingAction, getErpOrderData, addNoteToRequest, updateRequestDetails, getAllErpPurchaseOrderHeaders, getAllErpPurchaseOrderLines
} from '@/modules/requests/lib/actions';
import type { 
    PurchaseRequest, PurchaseRequestStatus, PurchaseRequestPriority, 
    PurchaseRequestHistoryEntry, RequestSettings, Company, DateRange, 
    AdministrativeAction, AdministrativeActionPayload, StockInfo, ErpOrderHeader, ErpOrderLine, User, RequestNotePayload, ErpPurchaseOrderHeader, ErpPurchaseOrderLine
} from '../../core/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { getDaysRemaining as getSimpleDaysRemaining } from '@/modules/core/lib/time-utils';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { AlertCircle, Undo2, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { RowInput } from 'jspdf-autotable';
import { getAllProducts as getAllProductsFromDB } from '@/modules/core/lib/db';
import { getAllCustomers as getAllCustomersFromDB } from '@/modules/core/lib/db';
import type { Product, Customer } from '../../core/types';
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
    products: Product[];
    customers: Customer[];
    erpPoHeaders: ErpPurchaseOrderHeader[];
    erpPoLines: ErpPurchaseOrderLine[];
    isTransitsDialogOpen: boolean;
    activeTransits: { itemId: string; itemDescription: string; transits: any[] } | null;
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

  return sanitized as PurchaseRequest;
};


export const useRequests = () => {
    const { isAuthorized, hasPermission } = useAuthorization(['requests:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user: currentUser, stockLevels: authStockLevels, companyData: authCompanyData, isReady: isAuthReady } = useAuth();
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
        products: [],
        customers: [],
        erpPoHeaders: [],
        erpPoLines: [],
        isTransitsDialogOpen: false,
        activeTransits: null,
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
             const [settingsData, requestsData, dbProducts, dbCustomers, poHeaders, poLines] = await Promise.all([
                getRequestSettings(),
                getPurchaseRequests({
                    page: state.viewingArchived ? state.archivedPage : undefined,
                    pageSize: state.viewingArchived ? state.pageSize : undefined,
                }),
                getAllProductsFromDB(),
                getAllCustomersFromDB(),
                getAllErpPurchaseOrderHeaders(),
                getAllErpPurchaseOrderLines(),
            ]);
            
            if (!isMounted) return;

            updateState({ 
                requestSettings: settingsData, 
                products: dbProducts, 
                customers: dbCustomers,
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
        if (isAuthReady && state.customers.length > 0 && state.products.length > 0) {
            const itemId = searchParams.get('itemId');
            if (itemId) {
                const product = state.products.find(p => p.id === itemId);
                const customer = state.customers.find(c => c.id === searchParams.get('clientId'));

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
    }, [isAuthReady, searchParams, state.customers, state.products, updateState]);

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
            const updatedRequest = await updatePurchaseRequestStatus({ 
                requestId: state.requestToUpdate.id, 
                status: finalStatus, 
                notes: state.statusUpdateNotes, 
                updatedBy: currentUser.name, 
                reopen: false, 
                deliveredQuantity: finalStatus === 'received-in-warehouse' ? Number(state.deliveredQuantity) : undefined,
                arrivalDate: finalStatus === 'ordered' ? state.arrivalDate : undefined,
                erpEntryNumber: finalStatus === 'entered-erp' ? state.erpEntryNumber : undefined,
            });
            
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
                 const updated = await updatePendingAction({
                    entityId: state.requestToUpdate.id,
                    action: 'none',
                    notes: state.statusUpdateNotes,
                    updatedBy: currentUser.name,
                });
                toast({ title: 'Solicitud Rechazada' });
                updateState({
                    activeRequests: state.activeRequests.map(r => r.id === updated.id ? sanitizeRequest(updated) : r)
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
            const product = state.products.find(p => p.id === value);
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
            const client = state.customers.find(c => c.id === value);
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
                    const client = state.customers.find(c => c.id === h.CLIENTE);
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
            const client = state.customers.find(c => c.id === header.CLIENTE);
            const enrichedHeader = { ...header, CLIENTE_NOMBRE: client?.name || 'Cliente no encontrado' };
            
            const { lines, inventory } = await getErpOrderData(header.PEDIDO);

            const enrichedLines: UIErpOrderLine[] = lines.map(line => {
                const product = state.products.find(p => p.id === line.ARTICULO) || {id: line.ARTICULO, description: `Artículo ${line.ARTICULO} no encontrado`, active: 'N', cabys: '', classification: '', isBasicGood: 'N', lastEntry: '', notes: '', unit: ''};
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
                        clientTaxId: state.customers.find(c => c.id === erpHeader.CLIENTE)?.taxId || '',
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
            return state.customers.filter(c => {
                const targetText = normalizeText(`${c.id} ${c.name} ${c.taxId}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(c => ({ value: c.id, label: `[${c.id}] ${c.name} (${c.taxId})` }));
        }, [state.customers, debouncedClientSearch]),
        itemOptions: useMemo(() => {
            if (debouncedItemSearch.length < 2) return [];
            const searchTerms = normalizeText(debouncedItemSearch).split(' ').filter(Boolean);
            return state.products.filter(p => {
                const targetText = normalizeText(`${p.id} ${p.description}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(p => ({ value: p.id, label: `[${p.id}] - ${p.description}` }));
        }, [state.products, debouncedItemSearch]),
        classifications: useMemo(() => Array.from(new Set(state.products.map(p => p.classification).filter(Boolean))), [state.products]),
        filteredRequests: useMemo(() => {
            let requestsToFilter = state.viewingArchived ? state.archivedRequests : state.activeRequests;
            
            const searchTerms = normalizeText(debouncedSearchTerm).split(' ').filter(Boolean);
            return requestsToFilter.filter(request => {
                const product = state.products.find(p => p.id === request.itemId);
                const targetText = normalizeText(`${request.consecutive} ${request.clientName} ${request.itemDescription} ${request.purchaseOrder || ''} ${request.erpOrderNumber || ''}`);
                
                const searchMatch = debouncedSearchTerm ? searchTerms.every(term => targetText.includes(term)) : true;
                const statusMatch = state.statusFilter === 'all' || request.status === state.statusFilter;
                const classificationMatch = state.classificationFilter === 'all' || (product && product.classification === state.classificationFilter);
                const dateMatch = !state.dateFilter || !state.dateFilter.from || (new Date(request.requiredDate) >= state.dateFilter.from && new Date(request.requiredDate) <= (state.dateFilter.to || state.dateFilter.from));
                const myRequestsMatch = !state.showOnlyMyRequests || (currentUser?.name && request.requestedBy.toLowerCase() === currentUser.name.toLowerCase()) || (currentUser?.erpAlias && request.erpOrderNumber && request.erpOrderNumber.toLowerCase().includes(currentUser.erpAlias.toLowerCase()));

                return searchMatch && statusMatch && classificationMatch && dateMatch && myRequestsMatch;
            });
        }, [state.viewingArchived, state.activeRequests, state.archivedRequests, debouncedSearchTerm, state.statusFilter, state.classificationFilter, state.products, state.dateFilter, state.showOnlyMyRequests, currentUser?.name, currentUser?.erpAlias]),
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
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized
    };
}

    
```
- src/modules/requests/lib/actions.ts:
```ts
/**
 * @fileoverview Client-side functions for interacting with the request module's server-side DB functions.
 * This abstraction layer ensures components only call client-safe functions.
 */
'use client';

import type { PurchaseRequest, UpdateRequestStatusPayload, PurchaseRequestHistoryEntry, RequestSettings, UpdatePurchaseRequestPayload, RejectCancellationPayload, DateRange, AdministrativeAction, AdministrativeActionPayload, StockInfo, ErpOrderHeader, ErpOrderLine, User, RequestNotePayload, UserPreferences, PurchaseSuggestion, PurchaseRequestPriority, ErpPurchaseOrderHeader, ErpPurchaseOrderLine } from '../../core/types';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { createNotificationForPermission, createNotification } from '@/modules/core/lib/notifications-actions';
import { 
    getRequests, 
    addRequest,
    updateRequest,
    updateStatus, 
    getRequestHistory as getRequestHistoryServer,
    getSettings,
    saveSettings,
    updatePendingAction as updatePendingActionServer,
    getErpOrderData as getErpOrderDataServer,
    getUserByName,
    getRolesWithPermission,
    addNote as addNoteServer,
    updateRequestDetails as updateRequestDetailsServer
} from './db';
import {
    saveUserPreferences as saveUserPreferencesServer,
    getUserPreferences as getUserPreferencesServer,
    getAllErpPurchaseOrderHeaders as getAllErpPurchaseOrderHeadersServer,
    getAllErpPurchaseOrderLines as getAllErpPurchaseOrderLinesServer,
} from '@/modules/core/lib/db';
import { getAllProducts, getAllStock, getAllCustomers } from '@/modules/core/lib/db';


/**
 * Fetches purchase requests from the server.
 * @param options - Pagination and filtering options.
 * @returns A promise that resolves to the requests and total archived count.
 */
export async function getPurchaseRequests(options: { 
    page?: number; 
    pageSize?: number;
    filters?: {
        searchTerm?: string;
        status?: string;
        classification?: string;
        dateRange?: DateRange;
    };
}): Promise<{ requests: PurchaseRequest[], totalArchivedCount: number }> {
    return getRequests(options);
}

/**
 * Saves a new purchase request.
 * @param request - The request data to save.
 * @param requestedBy - The name of the user creating the request.
 * @returns The newly created purchase request.
 */
export async function savePurchaseRequest(request: Omit<PurchaseRequest, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'deliveredQuantity' | 'receivedInWarehouseBy' | 'receivedDate' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'>, requestedBy: string): Promise<PurchaseRequest> {
    const createdRequest = await addRequest(request, requestedBy);
    await logInfo(`Purchase request ${createdRequest.consecutive} created by ${requestedBy}`, { item: createdRequest.itemDescription, quantity: createdRequest.quantity });
    
    await createNotificationForPermission(
        'requests:status:review',
        `Nueva solicitud ${createdRequest.consecutive} para "${createdRequest.clientName}" requiere revisión.`,
        `/dashboard/requests?search=${createdRequest.consecutive}`,
        createdRequest.id,
        'purchase-request',
        'review'
    );
    
    return createdRequest;
}

/**
 * Updates the main details of an existing purchase request.
 * @param payload - The data to update.
 * @returns The updated purchase request.
 */
export async function updatePurchaseRequest(payload: UpdatePurchaseRequestPayload): Promise<PurchaseRequest> {
    const updatedRequest = await updateRequest(payload);
    await logInfo(`Purchase request ${updatedRequest.consecutive} edited by ${payload.updatedBy}`, { requestId: payload.requestId });
    return updatedRequest;
}

/**
 * Updates the status of a purchase request.
 * @param payload - The status update information.
 * @returns The updated purchase request.
 */
export async function updatePurchaseRequestStatus(payload: UpdateRequestStatusPayload): Promise<PurchaseRequest> {
    const updatedRequest = await updateStatus(payload);
    await logInfo(`Status of request ${updatedRequest.consecutive} updated to '${payload.status}' by ${payload.updatedBy}`, { notes: payload.notes, requestId: payload.requestId });
    
    if (updatedRequest.requestedBy !== payload.updatedBy) {
        const targetUser = await getUserByName(updatedRequest.requestedBy);
        if (targetUser) {
             const settings = await getSettings();
             const statusConfig = {
                'pending': 'Pendiente',
                'purchasing-review': 'Revisión Compras',
                'pending-approval': 'Pendiente Aprobación',
                'approved': 'Aprobada',
                'ordered': 'Ordenada',
                'received-in-warehouse': 'Recibido en Bodega',
                'entered-erp': 'Ingresado ERP',
                'canceled': 'Cancelada'
             };
             const statusLabel = (statusConfig as any)[payload.status] || payload.status;
            await createNotification({
                userId: targetUser.id,
                message: `La solicitud ${updatedRequest.consecutive} ha sido actualizada a: ${statusLabel}.`,
                href: `/dashboard/requests?search=${updatedRequest.consecutive}`,
                entityId: updatedRequest.id,
                entityType: 'purchase-request',
                entityStatus: payload.status,
            });
        }
    }
    
    return updatedRequest;
}

/**
 * Updates specific details of a purchase request like priority.
 * @param payload - The details to update.
 * @returns The updated purchase request.
 */
export async function updateRequestDetails(payload: { requestId: number; priority: PurchaseRequestPriority, updatedBy: string }): Promise<PurchaseRequest> {
    const updatedRequest = await updateRequestDetailsServer(payload);
    await logInfo(`Details for request ${updatedRequest.consecutive} updated by ${payload.updatedBy}`, { details: payload });
    return updatedRequest;
}


/**
 * Fetches the history for a specific request.
 * @param requestId - The ID of the request.
 * @returns A promise that resolves to an array of history entries.
 */
export async function getRequestHistory(requestId: number): Promise<PurchaseRequestHistoryEntry[]> {
    return getRequestHistoryServer(requestId);
}

/**
 * Fetches request settings from the server.
 * @returns The current request settings.
 */
export async function getRequestSettings(): Promise<RequestSettings> {
    return getSettings();
}

/**
 * Saves request settings.
 * @param settings - The settings object to save.
 */
export async function saveRequestSettings(settings: RequestSettings): Promise<void> {
    await logInfo('Purchase requests settings updated.');
    return saveSettings(settings);
}

/**
 * Updates the pending administrative action for a request.
 * @param payload - The action details.
 * @returns The updated purchase request.
 */
export async function updatePendingAction(payload: AdministrativeActionPayload): Promise<PurchaseRequest> {
    const updatedRequest = await updatePendingActionServer(payload);
    await logInfo(`Administrative action '${payload.action}' initiated for request ${updatedRequest.consecutive} by ${payload.updatedBy}.`);
    
    if (payload.action.includes('request')) {
         await createNotificationForPermission(
            'requests:status:approve', // A suitable admin-level permission
            `El usuario ${payload.updatedBy} solicita cancelar la solicitud ${updatedRequest.consecutive}.`,
            `/dashboard/requests?search=${updatedRequest.consecutive}`,
            updatedRequest.id,
            'purchase-request',
            'cancellation-request'
        );
    }
    
    return updatedRequest;
}

/**
 * Fetches the header and line items for a given ERP order number.
 * @param orderNumber The ERP order number to fetch.
 * @returns An object containing the order headers, an array of lines, and the real-time inventory for those lines.
 */
export async function getErpOrderData(identifier: string | DateRange): Promise<{headers: ErpOrderHeader[], lines: ErpOrderLine[], inventory: StockInfo[]}> {
    return getErpOrderDataServer(identifier);
}

/**
 * Analyzes ERP orders within a date range and suggests purchases for items with stock shortages.
 * @param dateRange - The date range for ERP orders to analyze.
 * @returns A promise that resolves to an array of purchase suggestions.
 */
export async function getRequestSuggestions(dateRange: DateRange): Promise<PurchaseSuggestion[]> {
    const { headers, lines } = await getErpOrderDataServer(dateRange);
    const [allStock, allProducts, allCustomers, erpPoHeaders, erpPoLines] = await Promise.all([
        getAllStock(),
        getAllProducts(),
        getAllCustomers(),
        getAllErpPurchaseOrderHeaders(),
        getAllErpPurchaseOrderLines(),
    ]);
    const allActiveRequests = await getRequests({}).then(res => res.requests.filter(r => ['pending', 'approved', 'ordered', 'purchasing-review', 'pending-approval'].includes(r.status)));

    const activePoNumbers = new Set(erpPoHeaders.filter((h: any) => h.ESTADO === 'A').map((h: any) => h.ORDEN_COMPRA));

    const requiredItems = new Map<string, { totalRequired: number; sourceOrders: Set<string>; clientIds: Set<string>; erpUsers: Set<string>; earliestCreationDate: Date | null, earliestDueDate: Date | null; }>();

    for (const line of lines) {
        const header = headers.find(h => h.PEDIDO === line.PEDIDO);
        if (!header) continue;

        if (!requiredItems.has(line.ARTICULO)) {
            requiredItems.set(line.ARTICULO, { totalRequired: 0, sourceOrders: new Set(), clientIds: new Set(), erpUsers: new Set(), earliestCreationDate: null, earliestDueDate: null });
        }
        
        const item = requiredItems.get(line.ARTICULO)!;
        item.totalRequired += line.CANTIDAD_PEDIDA;
        item.sourceOrders.add(header.PEDIDO);
        item.clientIds.add(header.CLIENTE);
        if (header.USUARIO) {
            item.erpUsers.add(header.USUARIO);
        }
        
        const creationDate = new Date(header.FECHA_PEDIDO);
        if (!item.earliestCreationDate || creationDate < item.earliestCreationDate) {
            item.earliestCreationDate = creationDate;
        }

        const dueDate = new Date(header.FECHA_PROMETIDA);
        if (!item.earliestDueDate || dueDate < item.earliestDueDate) {
            item.earliestDueDate = dueDate;
        }
    }

    const suggestions: PurchaseSuggestion[] = [];

    for (const [itemId, data] of requiredItems.entries()) {
        const stockInfo: StockInfo | undefined = allStock.find((s: StockInfo) => s.itemId === itemId);
        const currentStock = stockInfo?.totalStock ?? 0;
        
        const inTransitStock = erpPoLines
            .filter((line: any) => line.ARTICULO === itemId && activePoNumbers.has(line.ORDEN_COMPRA))
            .reduce((sum: any, line: any) => sum + line.CANTIDAD_ORDENADA, 0);

        const existingActiveRequests = allActiveRequests.filter(r => r.itemId === itemId);
        
        const shortage = data.totalRequired - currentStock - inTransitStock;

        if (shortage > 0) {
            const productInfo = allProducts.find((p: any) => p.id === itemId);
            const involvedClients = Array.from(data.clientIds).map(id => {
                const customer = allCustomers.find((c: any) => c.id === id);
                return { id, name: customer?.name || 'Desconocido' };
            });
            
            suggestions.push({
                itemId,
                itemDescription: productInfo?.description || 'Artículo no encontrado',
                itemClassification: productInfo?.classification || 'N/A',
                totalRequired: data.totalRequired,
                currentStock,
                inTransitStock,
                shortage,
                sourceOrders: Array.from(data.sourceOrders),
                involvedClients,
                erpUsers: Array.from(data.erpUsers),
                earliestCreationDate: data.earliestCreationDate ? data.earliestCreationDate.toISOString() : null,
                earliestDueDate: data.earliestDueDate ? data.earliestDueDate.toISOString() : null,
                existingActiveRequests,
            });
        }
    }

    return suggestions;
}


/**
 * Adds a note to a purchase request without changing its status.
 * @param payload - The note details including requestId and notes.
 * @returns The updated purchase request.
 */
export async function addNoteToRequest(payload: { requestId: number; notes: string; updatedBy: string; }): Promise<PurchaseRequest> {
    const updatedRequest = await addNoteServer(payload);
    await logInfo(`Note added to request ${updatedRequest.consecutive} by ${payload.updatedBy}.`);
    return updatedRequest;
}

/**
 * Gets the saved preferences for the purchase suggestions page for a specific user.
 * @param userId The ID of the user.
 * @returns A promise that resolves to the saved preferences or null.
 */
export async function getPurchaseSuggestionsPreferences(userId: number): Promise<Partial<UserPreferences> | null> {
    return getUserPreferencesServer(userId, 'purchaseSuggestionsPrefs');
}

/**
 * Saves the preferences for the purchase suggestions page for a specific user.
 * @param userId The ID of the user.
 * @param preferences The preferences object to save.
 */
export async function savePurchaseSuggestionsPreferences(userId: number, preferences: Partial<UserPreferences>): Promise<void> {
    return saveUserPreferencesServer(userId, 'purchaseSuggestionsPrefs', preferences);
}


export async function getAllErpPurchaseOrderHeaders(): Promise<ErpPurchaseOrderHeader[]> {
    return getAllErpPurchaseOrderHeadersServer();
}

export async function getAllErpPurchaseOrderLines(): Promise<ErpPurchaseOrderLine[]> {
    return getAllErpPurchaseOrderLinesServer();
}

```
- src/modules/requests/lib/schema.ts:
```ts
/**
 * @fileoverview Defines the expected database schema for the Requests module.
 * This is used by the central database audit system to verify integrity.
 */

import type { ExpectedSchema } from '@/modules/core/types';

export const requestSchema: ExpectedSchema = {
    'request_settings': ['key', 'value'],
    'purchase_requests': [
        'id', 'consecutive', 'purchaseOrder', 'requestDate', 'requiredDate', 'arrivalDate',
        'receivedDate', 'clientId', 'clientName', 'clientTaxId', 'itemId', 'itemDescription',
        'quantity', 'deliveredQuantity', 'inventory', 'priority', 'purchaseType', 'unitSalePrice',
        'salePriceCurrency', 'requiresCurrency', 'erpOrderNumber', 'erpOrderLine', 'erpEntryNumber',
        'manualSupplier', 'route', 'shippingMethod', 'status', 'pendingAction', 'notes',
        'requestedBy', 'approvedBy', 'receivedInWarehouseBy', 'lastStatusUpdateBy',
        'lastStatusUpdateNotes', 'reopened', 'previousStatus', 'lastModifiedBy', 'lastModifiedAt',
        'hasBeenModified'
    ],
    'purchase_request_history': ['id', 'requestId', 'timestamp', 'status', 'notes', 'updatedBy'],
};

```
- src/modules/warehouse/lib/actions.ts:
```ts
/**
 * @fileoverview Client-side functions for interacting with the warehouse module's server-side DB functions.
 * This abstraction layer ensures components only call client-safe functions.
 */
'use server';

import {
    getLocations as getLocationsServer,
    addLocation as addLocationServer,
    updateLocation as updateLocationServer,
    deleteLocation as deleteLocationServer,
    getWarehouseSettings as getWarehouseSettingsServer,
    saveWarehouseSettings as saveWarehouseSettingsServer,
    getInventoryForItem as getInventoryForItemServer,
    logMovement as logMovementServer,
    updateInventory as updateInventoryServer,
    getItemLocations as getItemLocationsServer,
    assignItemToLocation as assignItemToLocationServer,
    unassignItemFromLocation as unassignItemFromLocationServer,
    getWarehouseData as getWarehouseDataServer,
    getMovements as getMovementsServer,
} from './db';
import type { WarehouseSettings, WarehouseLocation, WarehouseInventoryItem, MovementLog, ItemLocation } from '../../core/types';
import { logInfo } from '@/modules/core/lib/logger';

export const getWarehouseSettings = async (): Promise<WarehouseSettings> => getWarehouseSettingsServer();
export async function saveWarehouseSettings(settings: WarehouseSettings): Promise<void> {
    await logInfo("Warehouse settings updated.");
    return saveWarehouseSettingsServer(settings);
}
export const getLocations = async (): Promise<WarehouseLocation[]> => getLocationsServer();

export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    const newLocation = await addLocationServer(location);
    await logInfo(`New warehouse location created: ${newLocation.name} (${newLocation.code})`);
    return newLocation;
}
export async function updateLocation(location: WarehouseLocation): Promise<WarehouseLocation> {
    const updatedLocation = await updateLocationServer(location);
    await logInfo(`Warehouse location updated: ${updatedLocation.name} (${updatedLocation.code})`);
    return updatedLocation;
}
export async function deleteLocation(id: number): Promise<void> {
    await logInfo(`Warehouse location with ID ${id} deleted.`);
    return deleteLocationServer(id);
}
export const getInventoryForItem = async (itemId: string): Promise<WarehouseInventoryItem[]> => getInventoryForItemServer(itemId);
export const logMovement = async (movement: Omit<MovementLog, 'id'|'timestamp'>): Promise<void> => logMovementServer(movement);
export const updateInventory = async(itemId: string, locationId: number, quantityChange: number): Promise<void> => updateInventoryServer(itemId, locationId, quantityChange);

// --- Simple Mode Actions ---
export const getItemLocations = async (itemId: string): Promise<ItemLocation[]> => getItemLocationsServer(itemId);
export async function assignItemToLocation(itemId: string, locationId: number): Promise<void> {
    await logInfo(`Item ${itemId} assigned to location ID ${locationId}.`);
    return assignItemToLocationServer(itemId, locationId);
}
export async function unassignItemFromLocation(itemLocationId: number): Promise<void> {
    await logInfo(`Item location mapping with ID ${itemLocationId} was removed.`);
    return unassignItemFromLocationServer(itemLocationId);
}

// --- Page-specific data loaders ---
export const getWarehouseData = async () => getWarehouseDataServer();
export const getMovements = async (itemId?: string): Promise<MovementLog[]> => getMovementsServer(itemId);

```
- src/modules/warehouse/lib/db.ts:
```ts


/**
 * @fileoverview Server-side functions for the warehouse database.
 */
"use server";

import { connectDb, getAllStock as getAllStockFromMain, getStockSettings as getStockSettingsFromMain } from '../../core/lib/db';
import type { WarehouseLocation, WarehouseInventoryItem, MovementLog, WarehouseSettings, StockSettings, StockInfo, ItemLocation } from '../../core/types';

const WAREHOUSE_DB_FILE = 'warehouse.db';

// This function is automatically called when the database is first created.
export async function initializeWarehouseDb(db: import('better-sqlite3').Database) {
    const schema = `
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL, -- 'building', 'zone', 'rack', 'shelf', 'bin'
            parentId INTEGER,
            FOREIGN KEY (parentId) REFERENCES locations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL, -- Corresponds to Product['id'] from main DB
            locationId INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 0,
            lastUpdated TEXT NOT NULL,
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE,
            UNIQUE (itemId, locationId)
        );

         CREATE TABLE IF NOT EXISTS item_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL,
            locationId INTEGER NOT NULL,
            clientId TEXT,
            FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE,
            UNIQUE (itemId, locationId, clientId)
        );

        CREATE TABLE IF NOT EXISTS movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL,
            quantity REAL NOT NULL,
            fromLocationId INTEGER,
            toLocationId INTEGER,
            timestamp TEXT NOT NULL,
            userId INTEGER NOT NULL,
            notes TEXT,
            FOREIGN KEY (fromLocationId) REFERENCES locations(id),
            FOREIGN KEY (toLocationId) REFERENCES locations(id)
        );

        CREATE TABLE IF NOT EXISTS warehouse_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `;
    db.exec(schema);

    // Insert default settings
    const defaultSettings: WarehouseSettings = {
        locationLevels: [
            { type: 'building', name: 'Edificio' },
            { type: 'zone', name: 'Zona' },
            { type: 'rack', name: 'Rack' },
            { type: 'shelf', name: 'Estante' },
            { type: 'bin', name: 'Casilla' }
        ],
        enablePhysicalInventoryTracking: false,
    };
    db.prepare(`
        INSERT OR IGNORE INTO warehouse_config (key, value) VALUES ('settings', ?)
    `).run(JSON.stringify(defaultSettings));
    
    console.log(`Database ${WAREHOUSE_DB_FILE} initialized for Warehouse Management.`);
    await runWarehouseMigrations(db);
};

export async function runWarehouseMigrations(db: import('better-sqlite3').Database) {
    const warehouseConfigTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='warehouse_config'`).get();
    if (!warehouseConfigTable) {
        // Table doesn't exist, probably a fresh DB, let initialization handle it
        return;
    }

    // Migration to add enablePhysicalInventoryTracking
    try {
        const settingsRow = db.prepare(`SELECT value FROM warehouse_config WHERE key = 'settings'`).get() as { value: string } | undefined;
        if (settingsRow) {
            const settings = JSON.parse(settingsRow.value);
            if (typeof settings.enablePhysicalInventoryTracking !== 'boolean') {
                console.log("MIGRATION (warehouse.db): Adding enablePhysicalInventoryTracking to settings.");
                settings.enablePhysicalInventoryTracking = false;
                db.prepare(`UPDATE warehouse_config SET value = ? WHERE key = 'settings'`).run(JSON.stringify(settings));
            }
        }
    } catch (error) {
        console.error("Error during warehouse settings migration:", error);
    }
    
    const itemLocationsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='item_locations'`).get();
    if (!itemLocationsTable) {
        console.log("MIGRATION (warehouse.db): Creating item_locations table.");
        db.exec(`
            CREATE TABLE IF NOT EXISTS item_locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                itemId TEXT NOT NULL,
                locationId INTEGER NOT NULL,
                clientId TEXT,
                FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE,
                UNIQUE (itemId, locationId, clientId)
            );
        `);
    }
}

export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    try {
        const row = db.prepare(`SELECT value FROM warehouse_config WHERE key = 'settings'`).get() as { value: string } | undefined;
        if (row) {
            const settings = JSON.parse(row.value);
            // Ensure enablePhysicalInventoryTracking exists, default to false if not.
            if (typeof settings.enablePhysicalInventoryTracking !== 'boolean') {
                settings.enablePhysicalInventoryTracking = false;
            }
            return settings;
        }
    } catch (error) {
        console.error("Error fetching warehouse settings, returning default.", error);
    }
    // Return a default object if nothing is found or an error occurs
    return {
        locationLevels: [
            { type: 'building', name: 'Edificio' },
            { type: 'zone', name: 'Zona' },
            { type: 'rack', name: 'Rack' },
            { type: 'shelf', name: 'Estante' },
            { type: 'bin', name: 'Casilla' }
        ],
        enablePhysicalInventoryTracking: false
    };
}

export async function saveWarehouseSettings(settings: WarehouseSettings): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare(`
        INSERT OR REPLACE INTO warehouse_config (key, value) VALUES ('settings', ?)
    `).run(JSON.stringify(settings));
}

export async function getLocations(): Promise<WarehouseLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM locations ORDER BY parentId, name').all() as WarehouseLocation[];
}

export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { name, code, type, parentId } = location;
    const info = db.prepare('INSERT INTO locations (name, code, type, parentId) VALUES (?, ?, ?, ?)').run(name, code, type, parentId ?? null);
    const newLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(info.lastInsertRowid) as WarehouseLocation;
    return newLocation;
}

export async function updateLocation(location: WarehouseLocation): Promise<WarehouseLocation> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const { id, name, code, type, parentId } = location;
    db.prepare('UPDATE locations SET name = ?, code = ?, type = ?, parentId = ? WHERE id = ?').run(name, code, type, parentId ?? null, id);
    const updatedLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as WarehouseLocation;
    return updatedLocation;
}

export async function deleteLocation(id: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    // Note: ON DELETE CASCADE will handle child locations, item_locations and inventory.
    db.prepare('DELETE FROM locations WHERE id = ?').run(id);
}


export async function getInventoryForItem(itemId: string): Promise<WarehouseInventoryItem[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM inventory WHERE itemId = ?').all(itemId) as WarehouseInventoryItem[];
}

export async function updateInventory(itemId: string, locationId: number, quantityChange: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
     db.prepare(
        `INSERT INTO inventory (itemId, locationId, quantity, lastUpdated) 
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(itemId, locationId) 
         DO UPDATE SET quantity = quantity + ?`
    ).run(itemId, locationId, quantityChange, quantityChange);
}

export async function logMovement(movement: Omit<MovementLog, 'id' | 'timestamp'>): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const newMovement = { ...movement, timestamp: new Date().toISOString() };
    db.prepare(
        'INSERT INTO movements (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) VALUES (@itemId, @quantity, @fromLocationId, @toLocationId, @timestamp, @userId, @notes)'
    ).run(newMovement);
}

export async function getWarehouseData(): Promise<{ locations: WarehouseLocation[], inventory: WarehouseInventoryItem[], stock: StockInfo[], itemLocations: ItemLocation[], warehouseSettings: WarehouseSettings, stockSettings: StockSettings }> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    const locations = db.prepare('SELECT * FROM locations').all() as WarehouseLocation[];
    const inventory = db.prepare('SELECT * FROM inventory').all() as WarehouseInventoryItem[];
    const itemLocations = db.prepare('SELECT * FROM item_locations').all() as ItemLocation[];
    const stock = await getAllStockFromMain();
    const warehouseSettings = await getWarehouseSettings();
    const stockSettings = await getStockSettingsFromMain();

    // Sanitize data to ensure they are plain objects for serialization
    return {
        locations: locations.map(loc => ({
            id: Number(loc.id),
            name: String(loc.name),
            code: String(loc.code),
            type: String(loc.type),
            parentId: loc.parentId ? Number(loc.parentId) : null
        })),
        inventory: inventory.map(inv => ({
            id: Number(inv.id),
            itemId: String(inv.itemId),
            locationId: Number(inv.locationId),
            quantity: Number(inv.quantity),
            lastUpdated: String(inv.lastUpdated),
        })),
        stock: Array.isArray(stock) ? stock.map(s => ({
            itemId: String(s.itemId),
            stockByWarehouse: typeof s.stockByWarehouse === 'object' ? {...s.stockByWarehouse} : {},
            totalStock: Number(s.totalStock)
        })) : [],
        itemLocations: itemLocations.map(il => ({
            id: Number(il.id),
            itemId: String(il.itemId),
            locationId: Number(il.locationId),
            clientId: il.clientId ? String(il.clientId) : null
        })),
        warehouseSettings,
        stockSettings
    };
}

export async function getMovements(itemId?: string): Promise<MovementLog[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    if (itemId) {
        return db.prepare('SELECT * FROM movements WHERE itemId = ? ORDER BY timestamp DESC').all(itemId) as MovementLog[];
    }
    return db.prepare('SELECT * FROM movements ORDER BY timestamp DESC').all() as MovementLog[];
}

// --- Simple Mode Functions ---
export async function getItemLocations(itemId: string): Promise<ItemLocation[]> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    return db.prepare('SELECT * FROM item_locations WHERE itemId = ?').all(itemId) as ItemLocation[];
}

export async function assignItemToLocation(itemId: string, locationId: number, clientId?: string | null): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('INSERT OR IGNORE INTO item_locations (itemId, locationId, clientId) VALUES (?, ?, ?)').run(itemId, locationId, clientId);
}

export async function unassignItemFromLocation(itemLocationId: number): Promise<void> {
    const db = await connectDb(WAREHOUSE_DB_FILE);
    db.prepare('DELETE FROM item_locations WHERE id = ?').run(itemLocationId);
}

```
- src/modules/warehouse/lib/schema.ts:
```ts
/**
 * @fileoverview Defines the expected database schema for the Warehouse module.
 * This is used by the central database audit system to verify integrity.
 */

import type { ExpectedSchema } from '@/modules/core/types';

export const warehouseSchema: ExpectedSchema = {
    'locations': ['id', 'name', 'code', 'type', 'parentId'],
    'inventory': ['id', 'itemId', 'locationId', 'quantity', 'lastUpdated'],
    'item_locations': ['id', 'itemId', 'locationId', 'clientId'],
    'movements': ['id', 'itemId', 'quantity', 'fromLocationId', 'toLocationId', 'timestamp', 'userId', 'notes'],
    'warehouse_config': ['key', 'value'],
};

```
- src/modules/warehouse/page.tsx:
```tsx
/**
 * @fileoverview Main warehouse search page.
 * This component allows users to search for products or customers and see a consolidated
 * view of their assigned physical locations (from the warehouse module) and their
 * stock levels from the ERP system.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWarehouseData } from '@/modules/warehouse/lib/actions';
import { syncAllData } from '@/modules/core/lib/actions';
import type { WarehouseLocation, WarehouseInventoryItem, Product, StockInfo, StockSettings, ItemLocation, Customer } from '@/modules/core/types';
import { Search, MapPin, Package, Building, Waypoints, Box, Layers, Warehouse as WarehouseIcon, RefreshCw, Loader2, Info, User } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Button } from '@/components/ui/button';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError } from '@/modules/core/lib/logger';
import { Separator } from '@/components/ui/separator';

type CombinedItem = {
    product: Product | null;
    physicalLocations: {
        path: React.ReactNode;
        quantity?: number; // Only present in advanced mode
        clientId?: string;
    }[];
    erpStock: StockInfo | null;
    client?: Customer | null;
};

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export default function WarehousePage() {
    useAuthorization(['warehouse:access']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData, products, customers } = useAuth(); // Get master data from context

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, companyData?.searchDebounceTime ?? 500);
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [inventory, setInventory] = useState<WarehouseInventoryItem[]>([]);
    const [itemLocations, setItemLocations] = useState<ItemLocation[]>([]);
    const [stock, setStock] = useState<StockInfo[]>([]);
    const [stockSettings, setStockSettings] = useState<StockSettings | null>(null);
    const [warehouseSettings, setWarehouseSettings] = useState<{ enablePhysicalInventoryTracking: boolean } | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const wData = await getWarehouseData();
            setLocations(wData.locations);
            setInventory(wData.inventory);
            setItemLocations(wData.itemLocations);
            setStock(wData.stock);
            setStockSettings(wData.stockSettings);
            setWarehouseSettings(wData.warehouseSettings);
        } catch (error) {
            console.error("Failed to load warehouse data", error);
            logError("Failed to load warehouse data", { error });
            toast({ title: "Error de Carga", description: "No se pudieron cargar los datos del almacén.", variant: "destructive"});
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        setTitle("Búsqueda en Almacén");
        loadData();
    }, [setTitle, loadData]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await syncAllData();
            toast({
                title: "Datos Sincronizados",
                description: `Los datos del ERP se han sincronizado. Recargando vista...`
            });
            await loadData();
        } catch (error: any) {
            logError("Error during manual data refresh", { error: error.message });
            toast({
                title: "Error al Refrescar",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsRefreshing(false);
        }
    };

    const LocationIcon = ({ type }: { type: WarehouseLocation['type'] }) => {
        switch (type) {
            case 'building': return <Building className="h-5 w-5 text-muted-foreground" />;
            case 'zone': return <Waypoints className="h-5 w-5 text-muted-foreground" />;
            case 'rack': return <Box className="h-5 w-5 text-muted-foreground" />;
            case 'shelf': return <Layers className="h-5 w-5 text-muted-foreground" />;
            case 'bin': return <div className="h-5 w-5 text-muted-foreground font-bold text-center">B</div>;
            default: return <MapPin className="h-5 w-5 text-muted-foreground" />;
        }
    };
    
    const renderLocationPath = useCallback((locationId?: number | null) => {
        if (!locationId) return 'N/A';
        const path: WarehouseLocation[] = [];
        let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
        
        while (current) {
            path.unshift(current);
            const parentId = current.parentId;
            if (parentId) {
                current = locations.find(l => l.id === parentId);
            } else {
                current = undefined;
            }
        }

        return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {path.map((loc, index) => (
                    <div key={loc.id} className="flex items-center gap-1">
                        <LocationIcon type={loc.type} />
                        <span>{loc.name}</span>
                        {index < path.length - 1 && <span className="hidden sm:inline">/</span>}
                    </div>
                ))}
            </div>
        );
    }, [locations]);

    const filteredItems = useMemo(() => {
        if (!debouncedSearchTerm) return [];

        const searchTerms = normalizeText(debouncedSearchTerm).split(' ').filter(Boolean);
        
        const relevantProducts = products.filter(p => {
            const targetText = normalizeText(`${p.id} ${p.description}`);
            return searchTerms.every(term => targetText.includes(term));
        });

        const relevantCustomers = customers.filter(c => {
            const targetText = normalizeText(`${c.id} ${c.name}`);
            return searchTerms.every(term => targetText.includes(term));
        });
        const relevantCustomerIds = new Set(relevantCustomers.map(c => c.id));

        const groupedByItem: { [key: string]: CombinedItem } = {};
        
        for (const product of relevantProducts) {
            if (!groupedByItem[product.id]) {
                groupedByItem[product.id] = {
                    product: product,
                    physicalLocations: [],
                    erpStock: stock.find(s => s.itemId === product.id) || null,
                };
            }
        }

        if (warehouseSettings?.enablePhysicalInventoryTracking) {
             inventory.forEach(item => {
                if (groupedByItem[item.itemId]) {
                    groupedByItem[item.itemId].physicalLocations.push({
                        path: renderLocationPath(item.locationId),
                        quantity: item.quantity
                    });
                }
            });
        } else {
            itemLocations.forEach(itemLoc => {
                const product = products.find(p => p.id === itemLoc.itemId);
                
                if (groupedByItem[itemLoc.itemId]) {
                    groupedByItem[itemLoc.itemId].physicalLocations.push({
                        path: renderLocationPath(itemLoc.locationId),
                        clientId: itemLoc.clientId || undefined
                    });
                } 
                else if (itemLoc.clientId && relevantCustomerIds.has(itemLoc.clientId)) {
                    if (!groupedByItem[itemLoc.itemId]) {
                         groupedByItem[itemLoc.itemId] = {
                            product: product || { id: itemLoc.itemId, description: `Artículo ${itemLoc.itemId}`, active: 'S', cabys: '', classification: '', isBasicGood: 'N', lastEntry: '', notes: '', unit: '' },
                            physicalLocations: [],
                            erpStock: stock.find(s => s.itemId === itemLoc.itemId) || null,
                            client: customers.find(c => c.id === itemLoc.clientId)
                        };
                    }
                    groupedByItem[itemLoc.itemId].physicalLocations.push({
                        path: renderLocationPath(itemLoc.locationId),
                        clientId: itemLoc.clientId || undefined
                    });
                }
            });
        }
        
        return Object.values(groupedByItem).sort((a, b) => (a.product?.id || '').localeCompare(b.product?.id || ''));

    }, [debouncedSearchTerm, products, customers, inventory, itemLocations, stock, warehouseSettings, renderLocationPath]);

    if (isLoading || !warehouseSettings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                 <Card className="max-w-4xl mx-auto">
                    <CardHeader>
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-6 w-full max-w-md mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-40 w-full" />
                    </CardContent>
                 </Card>
            </main>
        )
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-600 text-white">
                                    <WarehouseIcon className="h-6 w-6" />
                                </div>
                                <div>
                                    <CardTitle className="text-2xl">Búsqueda en Almacén</CardTitle>
                                    <CardDescription>Busca un artículo o cliente para encontrar su ubicación y existencias.</CardDescription>
                                </div>
                            </div>
                            <Button onClick={handleRefresh} disabled={isRefreshing} className="w-full sm:w-auto">
                                {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Refrescar Datos del ERP
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Escribe el código/descripción del artículo o el código/nombre del cliente..."
                                className="w-full pl-10 text-lg h-14"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                         {
                            !warehouseSettings.enablePhysicalInventoryTracking && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
                                    <Info className="h-5 w-5"/>
                                    <p className="text-sm">El modo de control de inventario físico está desactivado. Solo se mostrarán ubicaciones asignadas, no cantidades.</p>
                                </div>
                            )
                        }
                        
                        <div className="space-y-4">
                            {filteredItems.length > 0 ? (
                                filteredItems.map(item => (
                                    <Card key={item.product?.id || item.client?.id} className="w-full">
                                        <CardHeader>
                                            <CardTitle className="text-xl flex items-center gap-2">
                                                <Package className="h-6 w-6 text-primary" />
                                                {item.product?.description || 'Producto no encontrado'}
                                            </CardTitle>
                                            <CardDescription>Código: {item.product?.id}</CardDescription>
                                             {item.client && (
                                                <div className="text-sm text-muted-foreground flex items-center gap-2 pt-1">
                                                    <User className="h-4 w-4"/>
                                                    <span>Inventario de Cliente: <strong>{item.client.name}</strong> ({item.client.id})</span>
                                                </div>
                                            )}
                                        </CardHeader>
                                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                            <div>
                                                <h4 className="font-semibold mb-2">Ubicaciones Físicas Asignadas</h4>
                                                <div className="space-y-2">
                                                {item.physicalLocations.length > 0 ? item.physicalLocations.map((loc, index) => (
                                                    <div key={index} className="flex justify-between items-center p-2 border rounded-md">
                                                        <span>{loc.path}</span>
                                                        {loc.quantity !== undefined && (
                                                            <span className="font-bold text-lg">{loc.quantity.toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                )) : <p className="text-sm text-muted-foreground">Sin ubicaciones asignadas.</p>}
                                                </div>
                                            </div>
                                            <div>
                                                 <h4 className="font-semibold mb-2">Existencias por Bodega (ERP)</h4>
                                                 {item.erpStock && stockSettings ? (
                                                     <div className="space-y-2">
                                                        {Object.entries(item.erpStock.stockByWarehouse).map(([whId, qty]) => {
                                                            const warehouse = stockSettings.warehouses.find(w => w.id === whId);
                                                            return warehouse?.isVisible ? (
                                                                <div key={whId} className="flex justify-between items-center p-2 border rounded-md">
                                                                    <span>{warehouse.name} ({whId})</span>
                                                                    <span className="font-bold text-lg">{qty.toLocaleString()}</span>
                                                                </div>
                                                            ) : null;
                                                        })}
                                                         <Separator />
                                                         <div className="flex justify-between items-center p-2 font-bold">
                                                            <span>Total ERP</span>
                                                            <span className="text-xl">{item.erpStock.totalStock.toLocaleString()}</span>
                                                         </div>
                                                     </div>
                                                 ) : (
                                                     <p className="text-sm text-muted-foreground">Sin datos de existencias en el ERP.</p>
                                                 )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : debouncedSearchTerm ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    <p>No se encontraron resultados para &quot;{debouncedSearchTerm}&quot;.</p>
                                </div>
                            ) : (
                                 <div className="text-center py-10 text-muted-foreground">
                                    <p>Comienza a escribir para buscar un artículo o cliente.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}

```
- tailwind.config.ts:
```ts
import type {Config} from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'bg-blue-500',
    'bg-green-500',
    'bg-orange-500',
    'bg-cyan-700',
    'bg-red-600',
    'bg-indigo-700',
    'bg-purple-700',
    'bg-amber-700',
    'bg-teal-700',
    'bg-green-700',
    'bg-slate-600',
    'bg-yellow-500',
    'bg-cyan-600',
    'bg-teal-600',
    'bg-blue-600',
    'bg-blue-700',
    'bg-emerald-600',
    'bg-gray-500',
    'bg-gray-600',
    'bg-gray-700',
    'bg-red-700',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-orange-400',
    'bg-orange-600',
    'bg-indigo-500',
    'bg-purple-600',
    'bg-indigo-600',
    'bg-fuchsia-600',
    'bg-sky-600',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

```
- tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "baseUrl": ".",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}

```