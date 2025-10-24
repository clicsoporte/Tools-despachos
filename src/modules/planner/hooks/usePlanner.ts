
/**
 * @fileoverview Custom hook `usePlanner` for managing the state and logic of the Production Planner page.
 * This hook encapsulates all state and actions for the planner, keeping the UI component clean.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { 
    getProductionOrders, saveProductionOrder, updateProductionOrder, 
    updateProductionOrderStatus, getOrderHistory, getPlannerSettings, 
    updateProductionOrderDetails, addNoteToOrder, updatePendingAction 
} from '@/modules/planner/lib/actions';
import type { 
    ProductionOrder, ProductionOrderStatus, ProductionOrderPriority, 
    ProductionOrderHistoryEntry, User, PlannerSettings, DateRange, 
    PlannerNotePayload, UpdateProductionOrderPayload, AdministrativeActionPayload, Product, StockInfo 
} from '../../core/types';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { getDaysRemaining as getSimpleDaysRemaining } from '@/modules/core/lib/time-utils';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import type { RowInput } from 'jspdf-autotable';
import { addNoteToOrder as addNoteServer } from '@/modules/planner/lib/actions';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { AlertCircle } from 'lucide-react';

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const emptyOrder: Omit<ProductionOrder, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'> = {
    deliveryDate: '',
    customerId: '',
    customerName: '',
    customerTaxId: '',
    productId: '',
    productDescription: '',
    quantity: 0,
    priority: 'medium',
    notes: '',
    inventory: 0,
    inventoryErp: 0,
    purchaseOrder: '',
    erpPackageNumber: undefined,
    erpTicketNumber: undefined,
    machineId: null,
    scheduledStartDate: null,
    scheduledEndDate: null,
    deliveredQuantity: undefined,
    defectiveQuantity: undefined,
    erpOrderNumber: undefined,
    shiftId: null,
    pendingAction: 'none',
};

const priorityConfig = { 
    low: { label: "Baja", className: "text-gray-500" }, 
    medium: { label: "Media", className: "text-blue-500" }, 
    high: { label: "Alta", className: "text-yellow-600" }, 
    urgent: { label: "Urgente", className: "text-red-600" }
};

const baseStatusConfig: { [key: string]: { label: string, color: string } } = {
    pending: { label: "Pendiente", color: "bg-yellow-500" },
    approved: { label: "Aprobada", color: "bg-green-500" },
    'in-queue': { label: "En Cola", color: "bg-cyan-500"},
    'in-progress': { label: "En Progreso", color: "bg-blue-500" },
    'on-hold': { label: "En Espera", color: "bg-gray-500" },
    'in-maintenance': { label: "En Mantenimiento", color: "bg-slate-600" },
    completed: { label: "Completada", color: "bg-teal-500" },
    'received-in-warehouse': { label: "En Bodega", color: "bg-gray-700" },
    canceled: { label: "Cancelada", color: "bg-red-700" },
};

export const usePlanner = () => {
    const { isAuthorized, hasPermission } = useAuthorization(['planner:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user: currentUser, companyData: authCompanyData, customers, products, stockLevels, isReady: isAuthReady } = useAuth();

    const [state, setState] = useState({
        isLoading: true,
        isSubmitting: false,
        isRefreshing: false,
        isNewOrderDialogOpen: false,
        isEditOrderDialogOpen: false,
        activeOrders: [] as ProductionOrder[],
        archivedOrders: [] as ProductionOrder[],
        viewingArchived: false,
        archivedPage: 0,
        pageSize: 50,
        totalArchived: 0,
        plannerSettings: null as PlannerSettings | null,
        newOrder: emptyOrder,
        orderToEdit: null as ProductionOrder | null,
        searchTerm: "",
        statusFilter: [] as string[],
        classificationFilter: [] as string[],
        showOnlyMyOrders: true,
        dateFilter: undefined as DateRange | undefined,
        customerSearchTerm: "",
        isCustomerSearchOpen: false,
        productSearchTerm: "",
        isProductSearchOpen: false,
        isStatusDialogOpen: false,
        orderToUpdate: null as ProductionOrder | null,
        newStatus: null as ProductionOrderStatus | null,
        statusUpdateNotes: "",
        deliveredQuantity: "" as number | string,
        defectiveQuantity: "" as number | string,
        erpPackageNumber: "",
        erpTicketNumber: "",
        isHistoryDialogOpen: false,
        historyOrder: null as ProductionOrder | null,
        history: [] as ProductionOrderHistoryEntry[],
        isHistoryLoading: false,
        isReopenDialogOpen: false,
        reopenStep: 0,
        reopenConfirmationText: '',
        dynamicStatusConfig: baseStatusConfig,
        isAddNoteDialogOpen: false,
        notePayload: null as { orderId: number; notes: string } | null,
        isActionDialogOpen: false,
        activeOrdersForSelectedProduct: [] as ProductionOrder[], // For duplicate check
    });
    
    const [debouncedSearchTerm] = useDebounce(state.searchTerm, authCompanyData?.searchDebounceTime ?? 500);
    const [debouncedCustomerSearch] = useDebounce(state.customerSearchTerm, authCompanyData?.searchDebounceTime ?? 500);
    const [debouncedProductSearch] = useDebounce(state.productSearchTerm, authCompanyData?.searchDebounceTime ?? 500);
    
    const updateState = useCallback((newState: Partial<typeof state>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const loadInitialData = useCallback(async (page = 0, isRefresh = false) => {
        let isMounted = true;
        
        if (isRefresh) {
            updateState({ isRefreshing: true });
        } else {
            updateState({ isLoading: true });
        }

        try {
            const [ settingsData, ordersData ] = await Promise.all([
                getPlannerSettings(),
                getProductionOrders({
                    page: state.viewingArchived ? page : undefined,
                    pageSize: state.viewingArchived ? state.pageSize : undefined,
                })
            ]);
            
            if (!isMounted) return;

            let newDynamicConfig = { ...baseStatusConfig };
            if (settingsData?.customStatuses) {
                settingsData.customStatuses.forEach(cs => {
                    if (cs.isActive && cs.label) {
                        newDynamicConfig[cs.id as ProductionOrderStatus] = { label: cs.label, color: cs.color };
                    }
                });
            }

            const finalStatus = settingsData?.useWarehouseReception ? 'received-in-warehouse' : 'completed';
            const activeFilter = (o: ProductionOrder) => o.status !== finalStatus && o.status !== 'canceled';

            const allOrders = [...ordersData.activeOrders, ...ordersData.archivedOrders];

            updateState({
                plannerSettings: settingsData,
                dynamicStatusConfig: newDynamicConfig,
                activeOrders: allOrders.filter(activeFilter),
                archivedOrders: allOrders.filter(o => !activeFilter(o)),
                totalArchived: ordersData.totalArchivedCount,
            });

        } catch (error) {
             if (isMounted) {
                logError("Failed to load planner data", { error: (error as Error).message });
                toast({ title: "Error", description: "No se pudieron cargar los datos del planificador.", variant: "destructive" });
            }
        } finally {
             if (isMounted) {
                updateState({ isLoading: false, isRefreshing: false });
            }
        }
        return () => { isMounted = false; };
    }, [toast, state.viewingArchived, state.pageSize, updateState]);
    
    useEffect(() => {
        setTitle("Planificador OP");
        if (isAuthReady) { // Use isAuthReady instead of isAuthorized
            loadInitialData(0);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTitle, isAuthReady]); // Use isAuthReady
    
    useEffect(() => {
        if (!isAuthReady || state.isLoading) return; // Use isAuthReady
        let isMounted = true;
        const reload = async () => {
            await loadInitialData(state.archivedPage);
        };
        if(isMounted) {
            reload();
        }
        return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.archivedPage, state.pageSize, state.viewingArchived, isAuthReady]);

    const getOrderPermissions = useCallback((order: ProductionOrder) => {
        const isPending = order.status === 'pending';
        const isApproved = order.status === 'approved';
        const isInQueue = order.status === 'in-queue';
        const isInProgress = order.status === 'in-progress';
        const isOnHold = order.status === 'on-hold' || order.status === 'in-maintenance';
        const isCompleted = order.status === 'completed';
        const isFinalArchived = order.status === (state.plannerSettings?.useWarehouseReception ? 'received-in-warehouse' : 'completed');
    
        return {
            canEdit: (isPending && hasPermission('planner:edit:pending')) || (!isPending && hasPermission('planner:edit:approved')),
            canApprove: isPending && hasPermission('planner:status:approve'),
            canQueue: isApproved && hasPermission('planner:status:in-progress'),
            canStart: (isApproved || isInQueue) && hasPermission('planner:status:in-progress'),
            canHold: isInProgress && hasPermission('planner:status:on-hold'),
            canMaintain: isInProgress && hasPermission('planner:status:on-hold'),
            canResumeFromHold: isOnHold && hasPermission('planner:status:in-progress'),
            canComplete: (isInProgress || isOnHold) && hasPermission('planner:status:completed'),
            canRequestUnapproval: (isApproved || isInQueue || isOnHold || isInProgress) && hasPermission('planner:status:unapprove-request'),
            canCancelPending: isPending && hasPermission('planner:status:cancel'),
            canRequestCancel: (isApproved || isInQueue) && hasPermission('planner:status:cancel-approved'),
            canReceive: isCompleted && !!state.plannerSettings?.useWarehouseReception && hasPermission('planner:receive'),
            canReopen: isFinalArchived && hasPermission('planner:reopen'),
        };
    }, [hasPermission, state.plannerSettings]);
    
    const actions = {
        setNewOrderDialogOpen: (isOpen: boolean) => updateState({ isNewOrderDialogOpen: isOpen, activeOrdersForSelectedProduct: [] }),
        setEditOrderDialogOpen: (isOpen: boolean) => updateState({ isEditOrderDialogOpen: isOpen }),
        setViewingArchived: (isArchived: boolean) => updateState({ viewingArchived: isArchived, archivedPage: 0 }),
        setArchivedPage: (pageUpdate: (page: number) => number) => updateState({ archivedPage: pageUpdate(state.archivedPage) }),
        setPageSize: (size: number) => updateState({ pageSize: size, archivedPage: 0 }),
        setNewOrder: (partialOrder: Partial<typeof state.newOrder>) => {
            updateState({ newOrder: { ...state.newOrder, ...partialOrder } });
        },
        setOrderToEdit: (order: ProductionOrder | null) => {
            updateState({ orderToEdit: order });
        },
        setOrderToUpdate: (order: ProductionOrder | null) => updateState({ orderToUpdate: order }),
        setSearchTerm: (term: string) => updateState({ searchTerm: term }),
        setStatusFilter: (status: string[]) => updateState({ statusFilter: status }),
        setClassificationFilter: (filter: string[]) => updateState({ classificationFilter: filter }),
        setShowOnlyMyOrders: (show: boolean) => {
            if (!show && !hasPermission('planner:read:all')) {
                toast({ title: "Permiso Requerido", description: "No tienes permiso para ver todas las órdenes.", variant: "destructive"});
                return;
            }
            updateState({ showOnlyMyOrders: show });
        },
        setDateFilter: (range: DateRange | undefined) => updateState({ dateFilter: range }),
        setCustomerSearchTerm: (term: string) => updateState({ customerSearchTerm: term }),
        setCustomerSearchOpen: (isOpen: boolean) => updateState({ isCustomerSearchOpen: isOpen }),
        setProductSearchTerm: (term: string) => {
            updateState({ productSearchTerm: term });
            if (!term) updateState({ activeOrdersForSelectedProduct: [] });
        },
        setProductSearchOpen: (isOpen: boolean) => updateState({ isProductSearchOpen: isOpen }),
        setStatusDialogOpen: (isOpen: boolean) => updateState({ isStatusDialogOpen: isOpen }),
        setNewStatus: (status: ProductionOrderStatus | null) => updateState({ newStatus: status }),
        setStatusUpdateNotes: (notes: string) => updateState({ statusUpdateNotes: notes }),
        setDeliveredQuantity: (qty: number | string) => updateState({ deliveredQuantity: qty }),
        setDefectiveQuantity: (qty: number | string) => updateState({ defectiveQuantity: qty }),
        setErpPackageNumber: (num: string) => updateState({ erpPackageNumber: num }),
        setErpTicketNumber: (num: string) => updateState({ erpTicketNumber: num }),
        setHistoryDialogOpen: (isOpen: boolean) => updateState({ isHistoryDialogOpen: isOpen }),
        setReopenDialogOpen: (isOpen: boolean) => updateState({ isReopenDialogOpen: isOpen }),
        setReopenStep: (step: number) => updateState({ reopenStep: step }),
        setReopenConfirmationText: (text: string) => updateState({ reopenConfirmationText: text }),
        setAddNoteDialogOpen: (isOpen: boolean) => updateState({ isAddNoteDialogOpen: isOpen }),
        setNotePayload: (payload: { orderId: number; notes: string } | null) => updateState({ notePayload: payload }),
        setActionDialogOpen: (isOpen: boolean) => updateState({ isActionDialogOpen: isOpen }),
        
        loadInitialData: (isRefresh: boolean = false) => loadInitialData(state.archivedPage, isRefresh),

        handleCreateOrder: async () => {
            if (!state.newOrder.customerId || !state.newOrder.productId || !state.newOrder.quantity || !state.newOrder.deliveryDate || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const createdOrder = await saveProductionOrder(state.newOrder, currentUser.name);
                toast({ title: "Orden Creada" });
                setState(prevState => ({
                    ...prevState,
                    isNewOrderDialogOpen: false,
                    newOrder: { ...emptyOrder, deliveryDate: new Date().toISOString().split('T')[0] },
                    customerSearchTerm: '',
                    productSearchTerm: '',
                    activeOrders: [...prevState.activeOrders, createdOrder],
                    activeOrdersForSelectedProduct: [],
                }));
            } catch (error: any) {
                logError("Failed to create order", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleEditOrder: async (e: React.FormEvent) => {
            e.preventDefault();
            if (!state.orderToEdit?.id || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const payload: UpdateProductionOrderPayload = {
                    ...state.orderToEdit,
                    orderId: state.orderToEdit.id,
                    updatedBy: currentUser.name
                };
                const updated = await updateProductionOrder(payload);
                setState(prevState => ({
                    ...prevState,
                    activeOrders: prevState.activeOrders.map(o => o.id === updated.id ? updated : o),
                    archivedOrders: prevState.archivedOrders.map(o => o.id === updated.id ? updated : o),
                    isEditOrderDialogOpen: false
                }));
                toast({ title: "Orden Actualizada" });
            } catch (error: any) {
                logError("Failed to edit order", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        openStatusDialog: (order: ProductionOrder, status: ProductionOrderStatus) => {
            if (state.plannerSettings?.requireMachineForStart && status === 'in-progress' && !order.machineId) {
                toast({ title: "Asignación no realizada", description: "Debe asignar una máquina/proceso.", variant: "destructive" });
                return;
            }
             if (state.plannerSettings?.requireShiftForCompletion && status === 'completed' && !order.shiftId) {
                toast({ title: "Turno no asignado", description: "Debe seleccionar un turno para completar la orden.", variant: "destructive" });
                return;
            }
            updateState({
                orderToUpdate: order,
                newStatus: status,
                statusUpdateNotes: ".",
                deliveredQuantity: status === 'completed' ? order.quantity : "",
                defectiveQuantity: status === 'completed' ? (order.defectiveQuantity || "") : "",
                erpPackageNumber: "",
                erpTicketNumber: "",
                isStatusDialogOpen: true,
            });
        },
        
        openAdminActionDialog: async (order: ProductionOrder, action: 'unapproval-request' | 'cancellation-request') => {
            if (!currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const payload: AdministrativeActionPayload = {
                    entityId: order.id,
                    action,
                    notes: `Solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} iniciada.`,
                    updatedBy: currentUser.name,
                };
                const updated = await updatePendingAction(payload);
                updateState({
                    activeOrders: state.activeOrders.map(o => o.id === updated.id ? updated : o),
                    archivedOrders: state.archivedOrders.map(o => o.id === updated.id ? updated : o)
                });
                toast({ title: "Solicitud Enviada", description: `Tu solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} ha sido enviada para revisión.` });
            } catch (error: any) {
                logError(`Failed to request ${action}`, { error: error.message });
                toast({ title: "Error al Solicitar", description: `No se pudo enviar la solicitud. ${error.message}`, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleAdminAction: async (approve: boolean) => {
            if (!state.orderToUpdate || !currentUser || !state.orderToUpdate.pendingAction || state.orderToUpdate.pendingAction === 'none') return;
            updateState({ isSubmitting: true });
    
            try {
                if (approve) {
                    const targetStatus = state.orderToUpdate.pendingAction === 'unapproval-request' ? 'pending' : 'canceled';
                    await actions.handleStatusUpdate(targetStatus);
                } else {
                     const updated = await updatePendingAction({
                        entityId: state.orderToUpdate.id,
                        action: 'none',
                        notes: state.statusUpdateNotes,
                        updatedBy: currentUser.name,
                    });
                    toast({ title: 'Solicitud Rechazada' });
                    updateState({ 
                        activeOrders: state.activeOrders.map(o => o.id === updated.id ? updated : o),
                        archivedOrders: state.archivedOrders.map(o => o.id === updated.id ? updated : o),
                    });
                }
                updateState({ isActionDialogOpen: false });
            } catch (error: any) {
                logError("Failed to handle admin action", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleStatusUpdate: async (statusOverride?: ProductionOrderStatus) => {
            const finalStatus = statusOverride || state.newStatus;
            if (!state.orderToUpdate || !finalStatus || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const updatedOrder = await updateProductionOrderStatus({ 
                    orderId: state.orderToUpdate.id, 
                    status: finalStatus, 
                    notes: state.statusUpdateNotes, 
                    updatedBy: currentUser.name, 
                    deliveredQuantity: finalStatus === 'completed' ? Number(state.deliveredQuantity) : undefined, 
                    defectiveQuantity: finalStatus === 'completed' ? Number(state.defectiveQuantity) : undefined, 
                    erpPackageNumber: finalStatus === 'received-in-warehouse' ? state.erpPackageNumber : undefined, 
                    erpTicketNumber: finalStatus === 'received-in-warehouse' ? state.erpTicketNumber : undefined, 
                    reopen: false 
                });
                toast({ title: "Estado Actualizado" });
                setState(prevState => {
                    const finalStatusValue = prevState.plannerSettings?.useWarehouseReception ? 'received-in-warehouse' : 'completed';
                    const isArchived = updatedOrder.status === finalStatusValue || updatedOrder.status === 'canceled';

                    return {
                        ...prevState,
                        isStatusDialogOpen: false,
                        isActionDialogOpen: false,
                        activeOrders: isArchived ? prevState.activeOrders.filter(o => o.id !== updatedOrder.id) : prevState.activeOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o),
                        archivedOrders: isArchived ? [...prevState.archivedOrders, updatedOrder] : prevState.archivedOrders.filter(o => o.id !== updatedOrder.id)
                    };
                });
            } catch (error: any) {
                logError("Failed to update status", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleDetailUpdate: async (orderId: number, details: { priority?: ProductionOrderPriority; machineId?: string | null; shiftId?: string | null; scheduledDateRange?: DateRange }) => {
            if (!currentUser) return;
            const finalDetails = {
                ...details,
                machineId: details.machineId === 'none' ? null : details.machineId,
                shiftId: details.shiftId === 'none' ? null : details.shiftId,
            };
            const updated = await updateProductionOrderDetails({ orderId, ...finalDetails, updatedBy: currentUser.name });
            updateState({ 
                activeOrders: state.activeOrders.map(o => o.id === orderId ? updated : o),
                archivedOrders: state.archivedOrders.map(o => o.id === orderId ? updated : o)
            });
        },
        
        handleOpenHistory: async (order: ProductionOrder) => {
            updateState({ historyOrder: order, isHistoryDialogOpen: true, isHistoryLoading: true });
            try {
                updateState({ history: await getOrderHistory(order.id) });
            } catch (error: any) {
                logError("Failed to get history", {error: error.message});
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isHistoryLoading: false });
            }
        },
        
        handleReopenOrder: async () => {
            if (!state.orderToUpdate || !currentUser || state.reopenStep !== 2 || state.reopenConfirmationText !== 'REABRIR') return;
            updateState({ isSubmitting: true });
            try {
                await updateProductionOrderStatus({ orderId: state.orderToUpdate.id, status: 'pending', notes: 'Orden reabierta.', updatedBy: currentUser.name, reopen: true });
                toast({ title: "Orden Reabierta" });
                updateState({ isReopenDialogOpen: false });
                await loadInitialData();
            } catch (error: any) {
                logError("Failed to reopen order", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleSelectProduct: (value: string) => {
            updateState({ isProductSearchOpen: false, activeOrdersForSelectedProduct: [] });
            const product = products.find(p => p.id === value);
            if (product) {
                const stock = stockLevels.find(s => s.itemId === product.id)?.totalStock ?? 0;
                
                const dataToUpdate = { 
                    productId: product.id, 
                    productDescription: product.description || '', 
                    inventoryErp: stock,
                    inventory: stock,
                };

                const existingActive = state.activeOrders.filter(o => o.productId === product.id);
                updateState({ activeOrdersForSelectedProduct: existingActive });

                if (state.orderToEdit) {
                    actions.setOrderToEdit({ ...state.orderToEdit, ...dataToUpdate });
                } else {
                    updateState({ newOrder: { ...state.newOrder, ...dataToUpdate }});
                }

                updateState({ productSearchTerm: `[${product.id}] - ${product.description}` });
            } else {
                 updateState({ productSearchTerm: '' });
            }
        },
    
        handleSelectCustomer: (value: string) => {
            updateState({ isCustomerSearchOpen: false });
            const customer = customers.find(c => c.id === value);
            if (customer) {
                const dataToUpdate = { customerId: customer.id, customerName: customer.name, customerTaxId: customer.taxId };
                if (state.orderToEdit) {
                     actions.setOrderToEdit({ ...state.orderToEdit, ...dataToUpdate });
                } else {
                    updateState({ newOrder: { ...state.newOrder, ...dataToUpdate }});
                }
                updateState({ customerSearchTerm: `[${customer.id}] ${customer.name} (${customer.taxId})` });
            } else {
                updateState({ customerSearchTerm: '' });
            }
        },

        handleProductInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && selectors.productOptions.length > 0) { e.preventDefault(); actions.handleSelectProduct(selectors.productOptions[0].value); }
        },
        handleCustomerInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && selectors.customerOptions.length > 0) { e.preventDefault(); actions.handleSelectCustomer(selectors.customerOptions[0].value); }
        },
        
        openAddNoteDialog: (order: ProductionOrder) => {
            updateState({ notePayload: { orderId: order.id, notes: '' }, isAddNoteDialogOpen: true });
        },
    
        handleAddNote: async () => {
            if (!state.notePayload || !state.notePayload.notes.trim() || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const payload = { ...state.notePayload, updatedBy: currentUser.name };
                const updatedOrder = await addNoteServer(payload);
                toast({ title: "Nota Añadida" });
                setState(prevState => ({
                    ...prevState,
                    isAddNoteDialogOpen: false,
                    activeOrders: prevState.activeOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o),
                    archivedOrders: prevState.archivedOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o)
                }));
            } catch(error: any) {
                logError("Failed to add note", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleExportExcel: () => {
            if (!state.plannerSettings) return;
            
            const dataToExport = selectors.filteredOrders.map(order => [
                order.consecutive,
                order.customerName,
                `[${order.productId}] ${order.productDescription}`,
                order.quantity,
                format(parseISO(order.deliveryDate), 'dd/MM/yyyy'),
                order.scheduledStartDate ? `${format(parseISO(order.scheduledStartDate), 'dd/MM/yy')} - ${order.scheduledEndDate ? format(parseISO(order.scheduledEndDate), 'dd/MM/yy') : ''}` : 'N/A',
                selectors.statusConfig[order.status]?.label || order.status,
                state.plannerSettings?.machines.find(m => m.id === order.machineId)?.name || 'N/A',
                selectors.priorityConfig[order.priority]?.label || order.priority,
                order.requestedBy
            ]);

            exportToExcel({
                fileName: 'ordenes_produccion',
                sheetName: 'Órdenes',
                headers: ['OP', 'Cliente', 'Producto', 'Cantidad', 'Fecha Entrega', 'Fecha Prog.', 'Estado', state.plannerSettings.assignmentLabel || 'Asignación', 'Prioridad', 'Solicitante'],
                data: dataToExport,
                columnWidths: [10, 25, 40, 10, 15, 20, 15, 20, 10, 15],
            });
        },

        handleExportPDF: async (orientation: 'portrait' | 'landscape' = 'portrait') => {
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
                } catch (e) {
                    console.error("Error processing logo for PDF:", e);
                }
            }
        
            const allPossibleColumns: { id: string; header: string; width?: number }[] = [
                { id: 'consecutive', header: 'OP', width: 45 },
                { id: 'customerName', header: 'Cliente' },
                { id: 'productDescription', header: 'Producto' },
                { id: 'quantity', header: 'Cant.', width: 35 },
                { id: 'deliveryDate', header: 'Entrega', width: 55 },
                { id: 'scheduledDate', header: 'Fecha Prog.', width: 85 },
                { id: 'status', header: 'Estado', width: 65 },
                { id: 'machineId', header: state.plannerSettings.assignmentLabel || 'Asignación', width: 75 },
                { id: 'priority', header: 'Prioridad', width: 55 },
            ];
        
            const selectedColumnIds = state.plannerSettings.pdfExportColumns || [];
            const tableHeaders = selectedColumnIds.map(id => allPossibleColumns.find(c => c.id === id)?.header || id);
            
            const tableRows: RowInput[] = selectors.filteredOrders.map(order => {
                return selectedColumnIds.map(id => {
                    switch (id) {
                        case 'consecutive': return order.consecutive;
                        case 'customerName': return order.customerName;
                        case 'productDescription': return `[${order.productId}] ${order.productDescription}`;
                        case 'quantity': return order.quantity.toLocaleString('es-CR');
                        case 'deliveryDate': return format(parseISO(order.deliveryDate), 'dd/MM/yy');
                        case 'scheduledDate': return (order.scheduledStartDate && order.scheduledEndDate) ? `${format(parseISO(order.scheduledStartDate), 'dd/MM/yy')} - ${format(parseISO(order.scheduledEndDate), 'dd/MM/yy')}` : 'N/A';
                        case 'status': return selectors.statusConfig[order.status]?.label || order.status;
                        case 'machineId': return state.plannerSettings?.machines.find(m => m.id === order.machineId)?.name || 'N/A';
                        case 'priority': return selectors.priorityConfig[order.priority]?.label || order.priority;
                        default: return '';
                    }
                });
            });
            
            const doc = generateDocument({
                docTitle: `Órdenes de Producción (${state.viewingArchived ? 'Archivadas' : 'Activas'})`,
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
                        if (col?.width) { acc[index] = { cellWidth: col.width }; }
                        if (id === 'quantity') { acc[index] = { ...acc[index], halign: 'right' }; }
                        return acc;
                    }, {} as { [key: number]: any })
                },
                totals: [],
                topLegend: state.plannerSettings.pdfTopLegend,
                paperSize: state.plannerSettings.pdfPaperSize,
                orientation: orientation,
            });
        
            doc.save(`ordenes_produccion_${new Date().getTime()}.pdf`);
        },

        handleExportSingleOrderPDF: async (order: ProductionOrder) => {
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
                } catch(e) { console.error("Error adding logo to PDF:", e) }
            }
            
            const historyData = await getOrderHistory(order.id);

            const machineName = state.plannerSettings.machines.find(m => m.id === order.machineId)?.name || 'N/A';
            
            const details = [
                { title: 'Cliente:', content: order.customerName },
                { title: 'Producto:', content: `[${order.productId}] ${order.productDescription}` },
                { title: 'Cantidad:', content: order.quantity.toLocaleString('es-CR') },
                { title: 'Fecha Solicitud:', content: format(parseISO(order.requestDate), 'dd/MM/yyyy') },
                { title: 'Fecha Entrega:', content: format(parseISO(order.deliveryDate), 'dd/MM/yyyy') },
                { title: 'Estado:', content: selectors.statusConfig[order.status]?.label || order.status },
                { title: 'Prioridad:', content: selectors.priorityConfig[order.priority]?.label || order.priority },
                { title: 'Asignación:', content: machineName },
                { title: 'Notas:', content: order.notes || 'N/A' },
                { title: 'Solicitado por:', content: order.requestedBy },
                { title: 'Aprobado por:', content: order.approvedBy || 'N/A' },
                { title: 'Última actualización:', content: `${order.lastStatusUpdateBy || 'N/A'} - ${order.lastStatusUpdateNotes || ''}` }
            ];

            generateDocument({
                docTitle: 'Orden de Producción',
                docId: order.consecutive,
                companyData: authCompanyData,
                logoDataUrl,
                meta: [{ label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
                blocks: [
                    { title: "Detalles de la Orden", content: details.map(d => `${d.title} ${d.content}`).join('\n') },
                ],
                table: {
                    columns: ["Fecha", "Estado", "Usuario", "Notas"],
                    rows: historyData.map(entry => [
                        format(parseISO(entry.timestamp), 'dd/MM/yy HH:mm'),
                        selectors.statusConfig[entry.status]?.label || entry.status,
                        entry.updatedBy,
                        entry.notes || ''
                    ]),
                    columnStyles: {},
                },
                totals: []
            }).save(`op_${order.consecutive}.pdf`);
        }
    };

    const selectors = {
        hasPermission,
        priorityConfig: priorityConfig,
        statusConfig: state.dynamicStatusConfig,
        getOrderPermissions,
        getDaysRemaining: (dateStr: string) => getSimpleDaysRemaining(dateStr),
        getScheduledDaysRemaining: (order: ProductionOrder) => {
            if (!order.scheduledStartDate || !order.scheduledEndDate) {
                return { label: 'Sin Programar', color: 'text-gray-500' };
            }
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const startDate = parseISO(order.scheduledStartDate);
                const endDate = parseISO(order.scheduledEndDate);
                
                const totalDuration = differenceInCalendarDays(endDate, startDate) + 1;
                const remainingDays = differenceInCalendarDays(endDate, today);

                if (remainingDays < 0) {
                    return { label: `Atrasado ${Math.abs(remainingDays)}d`, color: 'text-red-600' };
                }
                
                const percentageRemaining = totalDuration > 0 ? (remainingDays / totalDuration) : 0;
                let color = 'text-green-600';
                if (percentageRemaining <= 0.25) color = 'text-red-600';
                else if (percentageRemaining <= 0.50) color = 'text-orange-500';

                return { label: `Faltan ${remainingDays} de ${totalDuration}d`, color };
            } catch (error) {
                return { label: 'Fecha inv.', color: 'text-red-600' };
            }
        },
        customerOptions: useMemo(() => {
            if (debouncedCustomerSearch.length < 2) return [];
            const searchTerms = normalizeText(debouncedCustomerSearch).split(' ').filter(Boolean);
            return customers.filter(c => {
                const targetText = normalizeText(`${c.id} ${c.name} ${c.taxId}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(c => ({ value: c.id, label: `[${c.id}] ${c.name} (${c.taxId})` }));
        }, [customers, debouncedCustomerSearch]),
        productOptions: useMemo(() => {
            if (debouncedProductSearch.length < 2) return [];
            const searchTerms = normalizeText(debouncedProductSearch).split(' ').filter(Boolean);
            return products.filter(p => {
                const targetText = normalizeText(`${p.id} ${p.description}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(p => ({ value: p.id, label: `[${p.id}] - ${p.description}` }));
        }, [products, debouncedProductSearch]),
        classifications: useMemo<string[]>(() => 
            Array.from(new Set(products.map(p => p.classification).filter(Boolean)))
        , [products]),
        filteredOrders: useMemo(() => {
            let ordersToFilter = state.viewingArchived ? state.archivedOrders : state.activeOrders;
            
            const searchTerms = normalizeText(debouncedSearchTerm).split(' ').filter(Boolean);

            return ordersToFilter.filter(order => {
                const product = products.find(p => p.id === order.productId);

                const targetText = normalizeText(`${order.consecutive} ${order.customerName} ${order.productDescription} ${order.purchaseOrder || ''}`);
                const searchMatch = debouncedSearchTerm ? searchTerms.every(term => targetText.includes(term)) : true;
                
                const statusMatch = state.statusFilter.length === 0 || state.statusFilter.includes(order.status);
                const classificationMatch = state.classificationFilter.length === 0 || (product && state.classificationFilter.includes(product.classification));
                const dateMatch = !state.dateFilter || !state.dateFilter.from || (new Date(order.deliveryDate) >= state.dateFilter.from && new Date(order.deliveryDate) <= (state.dateFilter.to || state.dateFilter.from));
                const myOrdersMatch = !state.showOnlyMyOrders || (currentUser && (order.requestedBy.toLowerCase() === currentUser.name.toLowerCase() || (currentUser.erpAlias && order.erpOrderNumber?.toLowerCase().includes(currentUser.erpAlias.toLowerCase()))));

                return searchMatch && statusMatch && classificationMatch && dateMatch && myOrdersMatch;
            });
        }, [state.viewingArchived, state.activeOrders, state.archivedOrders, debouncedSearchTerm, state.statusFilter, state.classificationFilter, products, state.dateFilter, state.showOnlyMyOrders, currentUser]),
        stockLevels: stockLevels,
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
    };
};
