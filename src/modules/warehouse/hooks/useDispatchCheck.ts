/**
 * @fileoverview Hook to manage the state and logic for the Dispatch Check module.
 */
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getInvoiceData, searchDocuments, logDispatch } from '../lib/actions';
import type { User, Product, ErpInvoiceHeader, ErpInvoiceLine, UserPreferences } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';

type WizardStep = 'initial' | 'verifying' | 'finished';

type VerificationItem = {
    lineId: number;
    itemCode: string;
    description: string;
    barcode: string;
    requiredQuantity: number;
    verifiedQuantity: number;
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

    // Email state
    selectedUsers: User[];
    userSearchTerm: string;
    isUserSearchOpen: boolean;
    externalEmail: string;
    emailBody: string;

    scannerInputRef: React.RefObject<HTMLInputElement>;
};

export function useDispatchCheck() {
    const { isAuthorized, hasPermission } = useAuthorization(['warehouse:dispatch-check:use']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, products, users: allUsers } = useAuth();
    
    const scannerInputRef = useRef<HTMLInputElement>(null);

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
        selectedUsers: [],
        userSearchTerm: '',
        isUserSearchOpen: false,
        externalEmail: '',
        emailBody: '',
        scannerInputRef,
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
                };
            });

            updateState({
                currentDocument: {
                    id: data.header.FACTURA,
                    type: data.header.TIPO_DOCUMENTO === 'F' ? 'Factura' : data.header.TIPO_DOCUMENTO === 'R' ? 'Remisión' : 'Pedido',
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
        if (e.key === 'Enter' && state.documentOptions.length > 0) {
            e.preventDefault();
            handleDocumentSelect(state.documentOptions[0].value);
        }
    };
    
    // --- Verification Logic ---

    const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || !state.scannedCode.trim()) return;
        e.preventDefault();

        const scanned = state.scannedCode.trim();
        const targetItem = state.verificationItems.find(item => item.barcode === scanned);

        updateState({ scannedCode: '', lastScannedProductCode: targetItem?.itemCode || null });

        if (!targetItem) {
            updateState({ errorState: { title: "Artículo Incorrecto", message: `El código "${scanned}" no corresponde a ningún artículo de este despacho.` } });
            return;
        }

        if (targetItem.verifiedQuantity >= targetItem.requiredQuantity) {
            updateState({ errorState: { title: "Cantidad Completa", message: `Ya se verificaron todas las unidades de "${targetItem.description}".` } });
            return;
        }
        
        if (state.isStrictMode) {
            // Increment by one
            const newItems = state.verificationItems.map(item =>
                item.lineId === targetItem.lineId ? { ...item, verifiedQuantity: item.verifiedQuantity + 1 } : item
            );
            updateState({ verificationItems: newItems });
        } else {
            // Quick confirmation mode
            if (targetItem.requiredQuantity === 1) {
                const newItems = state.verificationItems.map(item =>
                    item.lineId === targetItem.lineId ? { ...item, verifiedQuantity: 1 } : item
                );
                updateState({ verificationItems: newItems });
            } else {
                updateState({
                    errorState: {
                        title: `Confirmar cantidad para "${targetItem.description}"`,
                        message: `¿Están las ${targetItem.requiredQuantity} unidades completas?`,
                    },
                });
            }
        }
    };

    const clearError = () => {
        if (state.errorState?.title.startsWith('Confirmar')) {
             // This was a confirmation dialog, not an error. Mark as complete.
            const targetItem = state.verificationItems.find(item => state.errorState?.title.includes(item.description));
            if (targetItem) {
                const newItems = state.verificationItems.map(item =>
                    item.lineId === targetItem.lineId ? { ...item, verifiedQuantity: item.requiredQuantity } : item
                );
                updateState({ verificationItems: newItems, errorState: null });
            }
        } else {
            updateState({ errorState: null });
        }
    };

    const handleIndicatorClick = (lineId: number) => {
        if (state.isStrictMode) return; // Not allowed in strict mode
        const targetItem = state.verificationItems.find(item => item.lineId === lineId);
        if (targetItem) {
             updateState({
                errorState: {
                    title: `Confirmar cantidad para "${targetItem.description}"`,
                    message: `¿Están las ${targetItem.requiredQuantity} unidades completas?`,
                },
            });
        }
    };

    const handleManualQuantityChange = (lineId: number, value: string) => {
        const qty = parseInt(value, 10);
        if (isNaN(qty) && value !== '') return;

        updateState({
            verificationItems: state.verificationItems.map(item =>
                item.lineId === lineId ? { ...item, verifiedQuantity: isNaN(qty) ? 0 : qty, isManualOverride: true } : item
            ),
        });
    };

    const handleModeChange = async (isStrictMode: boolean) => {
        updateState({ isStrictMode });
        if (user) {
            await saveUserPreferences(user.id, 'dispatchCheckPrefs', { isStrictMode });
        }
    };

    const reset = () => {
        updateState({
            step: 'initial',
            documentSearchTerm: '',
            currentDocument: null,
            verificationItems: [],
            scannedCode: '',
            errorState: null,
            selectedUsers: [],
            userSearchTerm: '',
            externalEmail: '',
            emailBody: '',
        });
    };

    const handleFinalizeAndAction = async (action: 'finish' | 'pdf' | 'email') => {
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
                // Email logic would go here
            } else if (action === 'pdf') {
                // PDF logic here
            }

            toast({ title: "Verificación Finalizada", description: "El despacho ha sido registrado." });
            updateState({ step: 'finished' });

        } catch (error: any) {
            logError("Failed to finalize dispatch", { error: error.message });
            toast({ title: "Error al Finalizar", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };

    const [debouncedUserSearch] = useDebounce(state.userSearchTerm, 300);
    const userOptions = useMemo(() => {
        if (debouncedUserSearch.length < 2) return [];
        return allUsers
            .filter((u) => u.name.toLowerCase().includes(debouncedUserSearch.toLowerCase()) || u.email.toLowerCase().includes(debouncedUserSearch.toLowerCase()))
            .map((u) => ({ value: String(u.id), label: `${u.name} (${u.email})` }));
    }, [debouncedUserSearch, allUsers]);

    const handleUserSelect = (userId: string) => {
        const userToAdd = allUsers.find((u) => String(u.id) === userId);
        if (userToAdd && !state.selectedUsers.some(u => u.id === userToAdd.id)) {
            updateState({
                selectedUsers: [...state.selectedUsers, userToAdd],
                userSearchTerm: '',
                isUserSearchOpen: false,
            });
        }
    };

    const handleUserDeselect = (userId: number) => {
        updateState({ selectedUsers: state.selectedUsers.filter(u => u.id !== userId) });
    };

    const selectors = {
        canSwitchMode: hasPermission('warehouse:dispatch-check:switch-mode'),
        canManuallyOverride: hasPermission('warehouse:dispatch-check:manual-override'),
        canSendExternalEmail: hasPermission('warehouse:dispatch-check:send-email-external'),
        isVerificationComplete: state.verificationItems.every(item => item.verifiedQuantity >= item.requiredQuantity),
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
