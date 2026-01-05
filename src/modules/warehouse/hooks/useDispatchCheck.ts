/**
 * @fileoverview Hook to manage the state and logic for the Dispatch Check module.
 */
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getInvoiceData, searchDocuments, logDispatch, sendDispatchEmail } from '../lib/actions';
import type { User, Product, ErpInvoiceHeader, ErpInvoiceLine, UserPreferences } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { HAlignType, FontStyle } from 'jspdf-autotable';

type WizardStep = 'initial' | 'verifying' | 'finished';

type VerificationItem = {
    lineId: number;
    itemCode: string;
    description: string;
    barcode: string;
    requiredQuantity: number;
    verifiedQuantity: number;
    displayVerifiedQuantity: string;
    isManualOverride?: boolean;
};

type CurrentDocument = {
    id: string;
    type: 'Factura' | 'Pedido' | 'Remisión';
    clientId: string;
    clientName: string;
    shippingAddress: string;
    date: string;
    erpUser?: string;
};

type ConfirmationState = {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
} | null;

type ErrorState = {
    title: string;
    message: string;
} | null;


type State = {
    isLoading: boolean;
    isSubmitting: boolean;
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
};

export function useDispatchCheck() {
    const { isAuthorized, hasPermission } = useAuthorization(['warehouse:dispatch-check:use']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, products, users, companyData } = useAuth();
    
    const scannerInputRef = useRef<HTMLInputElement>(null);
    const quantityInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());


    const [state, setState] = useState<State>({
        isLoading: true,
        isSubmitting: false,
        step: 'initial',
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
    });

    const [debouncedDocSearch] = useDebounce(state.documentSearchTerm, 300);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);
    
    useEffect(() => {
        setTitle("Chequeo de Despacho");
        const loadPrefs = async () => {
            if (user) {
                const prefs = await getUserPreferences(user.id, 'dispatchCheckPrefs');
                if (prefs) {
                    updateState({ isStrictMode: prefs.isStrictMode || false });
                }
            }
            updateState({ isLoading: false });
        };
        if (isAuthorized) {
            loadPrefs();
        } else {
            updateState({ isLoading: false });
        }
    }, [setTitle, isAuthorized, user, updateState]);
    
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
                logError("Error searching documents", { error: error.message });
            }
        };
        fetchDocs();
    }, [debouncedDocSearch, updateState]);

    const handleDocumentSelect = useCallback(async (documentId: string) => {
        updateState({ isLoading: true, isDocumentSearchOpen: false });
        try {
            const data = await getInvoiceData(documentId);
            if (!data) throw new Error("No se encontraron datos para este documento.");

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

            updateState({
                currentDocument: {
                    id: data.header.FACTURA,
                    type: data.header.TIPO_DOCUMENTO === 'F' ? 'Factura' : (data.header.TIPO_DOCUMENTO === 'R' ? 'Remisión' : 'Pedido'),
                    clientId: data.header.CLIENTE,
                    clientName: data.header.NOMBRE_CLIENTE,
                    shippingAddress: data.header.DIRECCION_FACTURA,
                    date: typeof data.header.FECHA === 'string' ? data.header.FECHA : data.header.FECHA.toISOString(),
                    erpUser: data.header.USUARIO,
                },
                verificationItems,
                step: 'verifying'
            });
             setTimeout(() => scannerInputRef.current?.focus(), 100);
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
            updateState({ step: 'initial' });
        } finally {
            updateState({ isLoading: false });
        }
    }, [products, toast, updateState]);
    
    const handleDocumentSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (state.documentOptions.length > 0) {
                 handleDocumentSelect(state.documentOptions[0].value);
            } else if (state.documentSearchTerm) {
                 handleDocumentSelect(state.documentSearchTerm);
            }
        }
    };
    
    const processScannedItem = useCallback((targetItem: VerificationItem) => {
        if (targetItem.verifiedQuantity >= targetItem.requiredQuantity) {
            updateState({ errorState: { title: "Cantidad Completa", message: `Ya se verificaron todas las unidades de "${targetItem.description}".` } });
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
    }, [state.isStrictMode, state.verificationItems, updateState]);
    
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
            updateState({ errorState: { title: "Artículo Incorrecto", message: `El código "${state.scannedCode.trim()}" no corresponde a ningún artículo de este despacho.` } });
            return;
        }
        
        processScannedItem(targetItem);
    }, [state.scannedCode, state.verificationItems, updateState, processScannedItem]);
    
    const clearError = useCallback(() => {
        updateState({ errorState: null });
        setTimeout(() => state.scannerInputRef.current?.focus(), 50);
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
            setTimeout(() => state.scannerInputRef.current?.focus(), 50);
        } else {
            updateState({ confirmationState: null });
            const inputRef = state.quantityInputRefs.current.get(lineId);
            if (inputRef) {
                setTimeout(() => {
                    inputRef.focus();
                    inputRef.select();
                }, 50);
            }
        }
    }, [state.verificationItems, updateState, state.scannerInputRef, state.quantityInputRefs]);

    const handleIndicatorClick = useCallback((lineId: number) => {
        if (state.isStrictMode) return; // Not allowed in strict mode
        const targetItem = state.verificationItems.find(item => item.lineId === lineId);
        if (targetItem) {
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

    const reset = useCallback(() => {
        updateState({
            step: 'initial',
            documentSearchTerm: '',
            currentDocument: null,
            verificationItems: [],
            scannedCode: '',
            errorState: null,
            confirmationState: null,
            selectedUsers: [],
            userSearchTerm: '',
            externalEmail: '',
            emailBody: '',
        });
    }, [updateState]);

    const proceedWithFinalize = useCallback(async (action: 'finish' | 'pdf' | 'email') => {
        if (!user || !state.currentDocument) return;
        updateState({ isSubmitting: true });

        try {
            await logDispatch({
                documentId: state.currentDocument.id,
                documentType: state.currentDocument.type,
                userId: user.id,
                userName: user.name,
                items: state.verificationItems,
                notes: `Acción: ${action}`
            });

            if (action === 'email') {
                await sendDispatchEmail({
                    to: state.selectedUsers.map(u => u.email),
                    cc: state.externalEmail,
                    body: state.emailBody,
                    documentId: state.currentDocument.id,
                    document: state.currentDocument,
                    items: state.verificationItems,
                    verifiedBy: user.name,
                });
            }

            toast({ title: "Verificación Finalizada", description: "El despacho ha sido registrado." });
            updateState({ step: 'finished' });

        } catch (error: any) {
            logError("Failed to finalize dispatch", { error: error.message });
            toast({ title: "Error al Finalizar", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    }, [user, state.currentDocument, state.verificationItems, state.selectedUsers, state.externalEmail, state.emailBody, toast, updateState]);
    
    const handleFinalizeAndAction = useCallback(async (action: 'finish' | 'pdf' | 'email') => {
        const hasDiscrepancy = state.verificationItems.some(item => item.requiredQuantity !== item.verifiedQuantity);
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
                    onCancel: () => updateState({ confirmationState: null })
                }
            });
        } else {
            proceedWithFinalize(action);
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
        isVerificationComplete: state.verificationItems.length > 0, // Always allow finalizing
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
        handleUserSelect,
        handleUserDeselect,
        setUserSearchTerm: (term: string) => updateState({ userSearchTerm: term }),
        setIsUserSearchOpen: (isOpen: boolean) => updateState({ isUserSearchOpen: isOpen }),
        setExternalEmail: (email: string) => updateState({ externalEmail: email }),
        setEmailBody: (body: string) => updateState({ emailBody: body }),
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
    };
}
