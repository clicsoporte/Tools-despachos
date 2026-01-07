/**
 * @fileoverview Hook to manage the state and logic for the Dispatch Check module.
 */
'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getInvoiceData, searchDocuments, logDispatch, sendDispatchEmail, getNextDocumentInContainer, getContainers as getContainersAction, moveAssignmentToContainer, updateAssignmentStatus } from '../lib/actions';
import type { User, Product, ErpInvoiceHeader, ErpInvoiceLine, UserPreferences, Company, VerificationItem, DispatchLog, DispatchContainer, DispatchAssignment } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { HAlignType, FontStyle, RowInput } from 'jspdf-autotable';
import { triggerNotificationEvent } from '@/modules/notifications/lib/notifications-engine';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, Search, CheckCircle, XCircle, Info, ClipboardCheck, Circle, FileDown, Mail, ArrowRight, AlertTriangle, ArrowLeft, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

type WizardStep = 'initial' | 'loading' | 'verifying' | 'finished';

type CurrentDocument = {
    id: string;
    type: 'Factura' | 'Pedido' | 'Remisión';
    clientId: string;
    clientTaxId: string;
    clientName: string;
    shippingAddress: string;
    date: string;
    erpUser?: string;
    containerId?: number;
};

type ConfirmationState = {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
} | null;

type ErrorState = {
    title: string;
    message: string;
} | null;


type State = {
    isLoading: boolean;
    step: WizardStep;
    
    documentSearchTerm: string;
    isDocumentSearchOpen: boolean;
    documentOptions: { value: string, label: string }[];
    
    currentDocument: CurrentDocument | null;
    verificationItems: VerificationItem[];

    scannedCode: string;
    lastScannedProductCode: string | null;
    isStrictMode: boolean;

    errorState: ErrorState;
    confirmationState: ConfirmationState;

    // Email state
    selectedUsers: User[];
    userSearchTerm: string;
    isUserSearchOpen: boolean;
    externalEmail: string;
    emailBody: string;

    scannerInputRef: React.RefObject<HTMLInputElement>;
    quantityInputRefs: React.RefObject<Map<number, HTMLInputElement>>;

    // New states for container flow
    availableContainers: DispatchContainer[];
    isMoveDocOpen: boolean;
    targetContainerId: number | null;
    nextDocumentInContainer: string | null;
};

export function useDispatchCheck() {
    const { isAuthorized, hasPermission } = useAuthorization(['warehouse:dispatch-check:use']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, products, users, customers, companyData, isReady } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const scannerInputRef = useRef<HTMLInputElement>(null);
    const quantityInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

    const [state, setState] = useState<State>({
        isLoading: true,
        step: 'loading',
        documentSearchTerm: '',
        isDocumentSearchOpen: false,
        documentOptions: [],
        currentDocument: null,
        verificationItems: [],
        scannedCode: '',
        lastScannedProductCode: null,
        isStrictMode: false,
        errorState: null,
        confirmationState: null,
        selectedUsers: [],
        userSearchTerm: '',
        isUserSearchOpen: false,
        externalEmail: '',
        emailBody: '',
        scannerInputRef,
        quantityInputRefs,
        availableContainers: [],
        isMoveDocOpen: false,
        targetContainerId: null,
        nextDocumentInContainer: null,
    });

    const [debouncedDocSearch] = useDebounce(state.documentSearchTerm, 300);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);
    
    const reset = useCallback(() => {
        updateState({
            step: 'initial',
            isLoading: false,
            documentSearchTerm: '',
            currentDocument: null,
            verificationItems: [],
            scannedCode: '',
            lastScannedProductCode: null,
            errorState: null,
            confirmationState: null,
            selectedUsers: [],
            userSearchTerm: '',
            externalEmail: '',
            emailBody: '',
            nextDocumentInContainer: null,
        });
        // Clean URL params without triggering a full page reload if we are resetting to the initial state.
        if (window.location.pathname === '/dashboard/warehouse/dispatch-check') {
            router.replace('/dashboard/warehouse/dispatch-check');
        }
    }, [updateState, router]);


    const handleDocumentSelect = useCallback(async (documentId: string, containerId?: number) => {
        updateState({ isLoading: true, isDocumentSearchOpen: false, step: 'loading' });
        try {
            const data = await getInvoiceData(documentId);
            if (!data) throw new Error('No se encontraron datos para este documento.');
            
            const containers = await getContainersAction();

            const verificationItems: VerificationItem[] = data.lines.map(line => {
                const product = products.find(p => p.id === line.ARTICULO);
                return {
                    lineId: line.LINEA,
                    itemCode: line.ARTICULO,
                    description: product?.description || line.DESCRIPCION || 'N/A',
                    barcode: product?.barcode || '',
                    requiredQuantity: line.CANTIDAD,
                    verifiedQuantity: 0,
                    displayVerifiedQuantity: '0',
                };
            });

            const customer = customers.find(c => c.id === data.header.CLIENTE);
            
            const nextDocInContainer = containerId ? await getNextDocumentInContainer(containerId, documentId) : null;

            updateState({
                currentDocument: {
                    id: data.header.FACTURA,
                    type: data.header.TIPO_DOCUMENTO === 'F' ? 'Factura' : (data.header.TIPO_DOCUMENTO === 'R' ? 'Remisión' : 'Pedido'),
                    clientId: data.header.CLIENTE,
                    clientTaxId: customer?.taxId || 'N/A',
                    clientName: data.header.NOMBRE_CLIENTE,
                    shippingAddress: data.header.DIRECCION_FACTURA,
                    date: typeof data.header.FECHA === 'string' ? data.header.FECHA : data.header.FECHA.toISOString(),
                    erpUser: data.header.USUARIO,
                    containerId: containerId,
                },
                verificationItems,
                step: 'verifying',
                availableContainers: containers,
                isLoading: false,
                nextDocumentInContainer: nextDocInContainer
            });
             setTimeout(() => scannerInputRef.current?.focus(), 100);
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
            updateState({ step: 'initial', isLoading: false });
        }
    }, [products, customers, toast, updateState]);
    
    const handleDocumentSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && state.documentOptions.length > 0) {
            e.preventDefault();
            handleDocumentSelect(state.documentOptions[0].value);
        }
    }, [state.documentOptions, handleDocumentSelect]);

    useEffect(() => {
        setTitle('Chequeo de Despacho');
        const loadInitial = async () => {
            if (!isReady || !user) return;

            const docId = searchParams.get('docId');
            const containerId = searchParams.get('containerId');
            
            const prefs = await getUserPreferences(user.id, 'dispatchCheckPrefs');
            const isStrictMode = prefs?.isStrictMode || false;
            
            if (docId) {
                updateState({ isStrictMode, step: 'loading' });
                await handleDocumentSelect(docId, containerId ? Number(containerId) : undefined);
            } else {
                updateState({ isLoading: false, step: 'initial', isStrictMode });
            }
        };

        if (isAuthorized !== null) {
            loadInitial();
        }
    }, [setTitle, isAuthorized, user, isReady, searchParams, handleDocumentSelect, updateState]);
    
    useEffect(() => {
        const fetchDocs = async () => {
            if (debouncedDocSearch.length < 3) {
                updateState({ documentOptions: [] });
                return;
            }
            try {
                const results = await searchDocuments(debouncedDocSearch);
                const options = results.map(r => ({
                    value: r.id,
                    label: `[${r.type}] ${r.id} - ${r.clientName} (${r.clientId})`
                }));
                updateState({ documentOptions: options });
            } catch (error: any) {
                logError('Error searching documents', { error: error.message });
            }
        };
        fetchDocs();
    }, [debouncedDocSearch, updateState]);

    const clearError = useCallback(() => {
        updateState({ errorState: null });
        setTimeout(() => { if(state.scannerInputRef.current) state.scannerInputRef.current.focus() }, 50);
    }, [updateState, state.scannerInputRef]);

    const handleConfirmation = useCallback((lineId: number, confirm: boolean) => {
        const targetItem = state.verificationItems.find(item => item.lineId === lineId);
        if (!targetItem) return;

        if (confirm) {
            const newQty = targetItem.requiredQuantity;
            const newItems = state.verificationItems.map(item =>
                item.lineId === targetItem.lineId ? { ...item, verifiedQuantity: newQty, displayVerifiedQuantity: String(newQty), isManualOverride: true } : item
            );
            updateState({ verificationItems: newItems, confirmationState: null });
            setTimeout(() => { if (state.scannerInputRef.current) state.scannerInputRef.current.focus() }, 50);
        } else {
            updateState({ confirmationState: null });
            const inputRef = state.quantityInputRefs.current?.get(lineId);
            if (inputRef) {
                setTimeout(() => {
                    inputRef.focus();
                    inputRef.select();
                }, 50);
            }
        }
    }, [state.verificationItems, updateState, state.scannerInputRef, state.quantityInputRefs]);
    
    const handleIndicatorClick = useCallback((lineId: number) => {
        if (state.isStrictMode) return;
        const targetItem = state.verificationItems.find(item => item.lineId === lineId);
        if (targetItem && targetItem.verifiedQuantity < targetItem.requiredQuantity) {
             updateState({
                confirmationState: {
                    title: `Confirmar cantidad para "${targetItem.description}"`,
                    message: `¿Están las ${targetItem.requiredQuantity} unidades completas?`,
                    onConfirm: () => handleConfirmation(lineId, true),
                    onCancel: () => handleConfirmation(lineId, false),
                    confirmText: 'Sí, Completar',
                    cancelText: 'No, Ingresar Manual'
                },
            });
        }
    }, [state.isStrictMode, state.verificationItems, updateState, handleConfirmation]);

    const processScannedItem = useCallback((targetItem: VerificationItem) => {
        if (targetItem.verifiedQuantity >= targetItem.requiredQuantity) {
            updateState({ errorState: { title: 'Cantidad Completa', message: `Ya se verificaron todas las unidades de "${targetItem.description}".` } });
            return;
        }

        if (state.isStrictMode) {
            const newQty = targetItem.verifiedQuantity + 1;
            const newItems = state.verificationItems.map(item =>
                item.lineId === targetItem.lineId ? { ...item, verifiedQuantity: newQty, displayVerifiedQuantity: String(newQty) } : item
            );
            updateState({ verificationItems: newItems });
        } else {
            handleIndicatorClick(targetItem.lineId);
        }
    }, [state.isStrictMode, state.verificationItems, updateState, handleIndicatorClick]);
    
    const handleScan = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || !state.scannedCode.trim()) return;
        e.preventDefault();

        const scanned = state.scannedCode.trim().toLowerCase();
        
        const targetItem = state.verificationItems.find(item => 
            (item.barcode?.toLowerCase() === scanned) || 
            (item.itemCode.toLowerCase() === scanned)
        );

        updateState({ scannedCode: '', lastScannedProductCode: targetItem?.itemCode || null });

        if (!targetItem) {
            updateState({ errorState: { title: 'Artículo Incorrecto', message: `El código "${state.scannedCode.trim()}" no corresponde a ningún artículo de este despacho.` } });
            return;
        }
        
        processScannedItem(targetItem);
    }, [state.scannedCode, state.verificationItems, updateState, processScannedItem]);

    const handleManualQuantityChange = useCallback((lineId: number, value: string) => {
        updateState({
            verificationItems: state.verificationItems.map(item =>
                item.lineId === lineId ? { ...item, displayVerifiedQuantity: value, isManualOverride: true } : item
            ),
        });
    }, [state.verificationItems, updateState]);

    const handleManualQuantityBlur = useCallback((lineId: number, value: string) => {
        const qty = parseInt(value, 10);
        const newQty = isNaN(qty) ? 0 : qty;
        
        const targetItem = state.verificationItems.find(item => item.lineId === lineId);

        if (targetItem && newQty > targetItem.requiredQuantity) {
            updateState({ 
                errorState: {
                    title: 'Cantidad Excedida',
                    message: `Has verificado ${newQty} unidades, pero solo se requieren ${targetItem.requiredQuantity}.`
                }
            });
        }
        
        updateState({
            verificationItems: state.verificationItems.map(item =>
                item.lineId === lineId ? { ...item, verifiedQuantity: newQty, displayVerifiedQuantity: String(newQty) } : item
            ),
        });
    }, [state.verificationItems, updateState]);


    const handleModeChange = useCallback(async (isStrictMode: boolean) => {
        updateState({ isStrictMode });
        if (user) {
            await saveUserPreferences(user.id, 'dispatchCheckPrefs', { isStrictMode });
        }
    }, [user, updateState]);
    
    const handleGoBack = useCallback(() => {
        if (state.currentDocument?.containerId) {
            router.replace('/dashboard/warehouse/dispatch-center');
        } else {
            reset();
        }
    }, [state.currentDocument, router, reset]);
    
    const handlePrintPdf = useCallback((docData: {
        document: CurrentDocument;
        items: VerificationItem[];
        verifiedBy: string;
        companyData: Company;
    }) => {
        const { document, items, verifiedBy, companyData } = docData;
    
        const styledRows: RowInput[] = items.map((item: VerificationItem) => {
            let textColor: [number, number, number] = [0, 0, 0];
            let fontStyle: FontStyle = 'normal';
            if (item.verifiedQuantity > item.requiredQuantity) {
                textColor = [220, 53, 69]; // Red
                fontStyle = 'bold';
            } else if (item.verifiedQuantity === item.requiredQuantity) {
                textColor = [25, 135, 84]; // Green
            } else if (item.verifiedQuantity < item.requiredQuantity && item.verifiedQuantity > 0) {
                textColor = [255, 193, 7]; // Amber
                fontStyle = 'bold';
            } else if (item.verifiedQuantity === 0) {
                textColor = [220, 53, 69]; // Red for zero
                fontStyle = 'bold';
            }
    
            return [
                item.itemCode,
                item.description,
                { content: item.requiredQuantity.toString(), styles: { halign: 'right' as HAlignType } },
                { content: item.verifiedQuantity.toString(), styles: { halign: 'right' as HAlignType, textColor, fontStyle } }
            ];
        });
    
        const doc = generateDocument({
            docTitle: 'Comprobante de Despacho',
            docId: document.id,
            companyData,
            meta: [{ label: 'Verificado por', value: verifiedBy }, { label: 'Fecha', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
            blocks: [],
            table: {
                columns: ['Código', 'Descripción', { content: 'Req.', styles: { halign: 'right' as HAlignType } }, { content: 'Verif.', styles: { halign: 'right' as HAlignType } }],
                rows: styledRows,
                columnStyles: {},
            },
            totals: []
        });
        doc.save(`Comprobante-${document.id}.pdf`);
    }, []);

    const handleMoveAssignment = async (targetContainerId: number) => {
        if (!state.currentDocument || !state.currentDocument.containerId) return;
        
        updateState({isLoading: true});
        try {
            await moveAssignmentToContainer(-1, targetContainerId, state.currentDocument.id);
            await updateAssignmentStatus(state.currentDocument.id, 'partial');
            
            toast({ title: "Documento Movido", description: `Se ha movido ${state.currentDocument.id} a la nueva ruta.`});
            
             if (user) {
                await logDispatch({
                    id: 0,
                    documentId: state.currentDocument.id,
                    documentType: state.currentDocument.type,
                    verifiedAt: new Date().toISOString(),
                    verifiedByUserId: user.id,
                    verifiedByUserName: user.name,
                    items: state.verificationItems.filter(item => item.verifiedQuantity > 0),
                    notes: `Movido al contenedor ${targetContainerId}.`,
                    vehiclePlate: null,
                    driverName: null,
                });
            }

            router.replace('/dashboard/warehouse/dispatch-center');
        } catch (error: any) {
            toast({ title: "Error al Mover", description: error.message, variant: "destructive" });
        } finally {
            updateState({isLoading: false, isMoveDocOpen: false});
        }
    };


    const proceedWithFinalize = useCallback(async (action: 'finish' | 'email' | 'pdf') => {
        if (!user || !state.currentDocument || !companyData) return;
        
        updateState({ isLoading: true });

        try {
            const dispatchLogData: DispatchLog = {
                id: 0,
                documentId: state.currentDocument.id,
                documentType: state.currentDocument.type,
                verifiedAt: new Date().toISOString(),
                verifiedByUserId: user.id,
                verifiedByUserName: user.name,
                items: state.verificationItems,
                notes: `Acción: ${action}`,
                vehiclePlate: null,
                driverName: null,
            };

            await logDispatch(dispatchLogData);
            
            const hasDiscrepancy = dispatchLogData.items.some(i => i.requiredQuantity !== i.verifiedQuantity);
            await updateAssignmentStatus(dispatchLogData.documentId, hasDiscrepancy ? 'discrepancy' : 'completed');

            await triggerNotificationEvent('onDispatchCompleted', dispatchLogData);
    
            if (action === 'pdf') {
                handlePrintPdf({ document: state.currentDocument, items: state.verificationItems, verifiedBy: user.name, companyData });
            } else if (action === 'email') {
                const recipients = state.selectedUsers.map(u => u.email);
                await sendDispatchEmail({
                    to: recipients,
                    cc: state.externalEmail,
                    body: state.emailBody,
                    document: state.currentDocument,
                    items: state.verificationItems,
                    verifiedBy: user.name
                });
            }
    
            toast({ title: 'Verificación Finalizada', description: 'El despacho ha sido registrado.' });
            
            updateState({ step: 'finished', isLoading: false });
    
        } catch (error: any) {
            logError('Failed to finalize dispatch', { error: error.message });
            toast({ title: 'Error al Finalizar', description: error.message, variant: 'destructive' });
            updateState({ isLoading: false }); // Ensure loading state is false on error
        }
    }, [user, state.currentDocument, state.verificationItems, companyData, toast, updateState, handlePrintPdf, state.selectedUsers, state.externalEmail, state.emailBody]);
    
    const handleFinalizeAndAction = useCallback(async (action: 'finish' | 'email' | 'pdf') => {
        const hasUnverifiedItems = state.verificationItems.some(item => item.verifiedQuantity === 0 && item.requiredQuantity > 0);
        
        if (hasUnverifiedItems) {
            updateState({
                confirmationState: {
                    title: 'Finalizar con Líneas en Cero',
                    message: 'Algunos artículos no fueron verificados (cantidad 0). ¿Deseas mover esta factura a otra ruta para completar el chequeo o finalizarla con estas discrepancias?',
                    onConfirm: () => { // "Mover" is confirm
                        updateState({ confirmationState: null, isMoveDocOpen: true });
                    },
                    onCancel: () => { // "Finalizar" is cancel in this context
                        updateState({ confirmationState: null });
                        proceedWithFinalize(action);
                    },
                    confirmText: 'Mover a Contenedor',
                    cancelText: 'Finalizar con Discrepancias',
                    isDestructive: true,
                }
            });
        } else {
            const hasDiscrepancy = state.verificationItems.some(item => item.verifiedQuantity !== item.requiredQuantity);
            if (hasDiscrepancy) {
                updateState({
                    confirmationState: {
                        title: 'Finalizar con Discrepancias',
                        message: 'Existen diferencias entre las cantidades requeridas y las verificadas. ¿Estás seguro de que deseas finalizar y registrar este despacho?',
                        confirmText: 'Sí, Completar',
                        cancelText: 'Cancelar',
                        onConfirm: () => {
                            updateState({ confirmationState: null });
                            proceedWithFinalize(action);
                        },
                        onCancel: () => updateState({ confirmationState: null }),
                        isDestructive: true,
                    }
                });
            } else {
                 proceedWithFinalize(action);
            }
        }
    }, [state.verificationItems, updateState, proceedWithFinalize]);

    const [debouncedUserSearch] = useDebounce(state.userSearchTerm, 300);
    const userOptions = useMemo(() => {
        if (debouncedUserSearch.length < 2) return [];
        return users
            .filter((u: User) => u.name.toLowerCase().includes(debouncedUserSearch.toLowerCase()) || u.email.toLowerCase().includes(debouncedUserSearch.toLowerCase()))
            .map((u: User) => ({ value: String(u.id), label: `${u.name} (${u.email})` }));
    }, [debouncedUserSearch, users]);

    const handleUserSelect = useCallback((userId: string) => {
        const userToAdd = users.find((u: User) => String(u.id) === userId);
        if (userToAdd && !state.selectedUsers.some((u: User) => u.id === userToAdd.id)) {
            updateState({
                selectedUsers: [...state.selectedUsers, userToAdd],
                userSearchTerm: '',
                isUserSearchOpen: false,
            });
        }
    }, [users, state.selectedUsers, updateState]);

    const handleUserDeselect = useCallback((userId: number) => {
        updateState({ selectedUsers: state.selectedUsers.filter((u: User) => u.id !== userId) });
    }, [state.selectedUsers, updateState]);

    const selectors = {
        canSwitchMode: hasPermission('warehouse:dispatch-check:switch-mode'),
        canManuallyOverride: hasPermission('warehouse:dispatch-check:manual-override'),
        canSendExternalEmail: hasPermission('warehouse:dispatch-check:send-email-external'),
        isVerificationComplete: state.verificationItems.length > 0 && state.verificationItems.every(item => item.verifiedQuantity > 0),
        progressPercentage: (state.verificationItems.filter(item => item.verifiedQuantity >= item.requiredQuantity).length / (state.verificationItems.length || 1)) * 100,
        progressText: `${state.verificationItems.filter(item => item.verifiedQuantity >= item.requiredQuantity).length} de ${state.verificationItems.length} líneas completadas`,
        documentOptions: state.documentOptions,
        userOptions,
    };
    
    const actions = {
        setDocumentSearchTerm: (term: string) => updateState({ documentSearchTerm: term }),
        setIsDocumentSearchOpen: (isOpen: boolean) => updateState({ isDocumentSearchOpen: isOpen }),
        handleDocumentSelect,
        handleDocumentSearchKeyDown,
        setScannedCode: (code: string) => updateState({ scannedCode: code }),
        handleScan,
        clearError,
        handleIndicatorClick,
        handleManualQuantityChange,
        handleManualQuantityBlur,
        handleModeChange,
        reset,
        handleFinalizeAndAction,
        handlePrintPdf,
        handleUserSelect,
        handleUserDeselect,
        setUserSearchTerm: (term: string) => updateState({ userSearchTerm: term }),
        setIsUserSearchOpen: (isOpen: boolean) => updateState({ isUserSearchOpen: isOpen }),
        setExternalEmail: (email: string) => updateState({ externalEmail: email }),
        setEmailBody: (body: string) => updateState({ emailBody: body }),
        handleGoBack,
        handleMoveAssignment,
        setTargetContainerId: (id: number | null) => updateState({ targetContainerId: id }),
        proceedToNextStep: () => {
            if (state.nextDocumentInContainer && state.currentDocument?.containerId) {
                const containerId = state.currentDocument.containerId;
                const nextDocId = state.nextDocumentInContainer;
                // Reset step but keep other state to avoid re-fetching containers etc.
                updateState({
                    step: 'loading',
                    isLoading: true,
                    currentDocument: null,
                    verificationItems: [],
                });
                router.replace(`/dashboard/warehouse/dispatch-check?docId=${nextDocId}&containerId=${containerId}`);
            } else {
                 handleGoBack();
            }
        },
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
    };
}
