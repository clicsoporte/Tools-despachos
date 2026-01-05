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
import type { HAlignType } from 'jspdf-autotable';

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
    type: 'info' | 'error';
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
    const { user, products, users: allUsers, companyData } = useAuth();
    
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
    
    const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || !state.scannedCode.trim()) return;
        e.preventDefault();

        const scanned = state.scannedCode.trim();
        const targetItem = state.verificationItems.find(item => item.barcode === scanned);

        updateState({ scannedCode: '', lastScannedProductCode: targetItem?.itemCode || null });

        if (!targetItem) {
            updateState({ errorState: { type: 'error', title: "Artículo Incorrecto", message: `El código "${scanned}" no corresponde a ningún artículo de este despacho.` } });
            return;
        }

        if (targetItem.verifiedQuantity >= targetItem.requiredQuantity) {
            updateState({ errorState: { type: 'info', title: "Cantidad Completa", message: `Ya se verificaron todas las unidades de "${targetItem.description}".` } });
            return;
        }
        
        if (state.isStrictMode) {
            const newQty = targetItem.verifiedQuantity + 1;
            const newItems = state.verificationItems.map(item =>
                item.lineId === targetItem.lineId ? { ...item, verifiedQuantity: newQty, displayVerifiedQuantity: String(newQty) } : item
            );
            updateState({ verificationItems: newItems });
        } else {
             actions.handleIndicatorClick(targetItem.lineId);
        }
    };
    
    const clearError = () => {
        updateState({ errorState: null });
        setTimeout(() => state.scannerInputRef.current?.focus(), 50);
    };

    const handleConfirmation = (lineId: number, confirm: boolean) => {
        const targetItem = state.verificationItems.find(item => item.lineId === lineId);
        if (!targetItem) return;

        if (confirm) {
            const newQty = targetItem.requiredQuantity;
            const newItems = state.verificationItems.map(item =>
                item.lineId === targetItem.lineId ? { ...item, verifiedQuantity: newQty, displayVerifiedQuantity: String(newQty), isManualOverride: true } : item
            );
            updateState({ verificationItems: newItems });
            setTimeout(() => state.scannerInputRef.current?.focus(), 50);
        } else {
            const inputRef = state.quantityInputRefs.current.get(lineId);
            if (inputRef) {
                setTimeout(() => {
                    inputRef.focus();
                    inputRef.select();
                }, 50);
            }
        }
        updateState({ confirmationState: null });
    };

    const handleIndicatorClick = (lineId: number) => {
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
    };

    const handleManualQuantityChange = (lineId: number, value: string) => {
        updateState({
            verificationItems: state.verificationItems.map(item =>
                item.lineId === lineId ? { ...item, displayVerifiedQuantity: value, isManualOverride: true } : item
            ),
        });
    };

    const handleManualQuantityBlur = (lineId: number, value: string) => {
        const qty = parseInt(value, 10);
        const newQty = isNaN(qty) ? 0 : qty;
        
        const targetItem = state.verificationItems.find(item => item.lineId === lineId);

        if (targetItem && newQty > targetItem.requiredQuantity) {
            updateState({ 
                errorState: {
                    type: 'info',
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
            confirmationState: null,
            selectedUsers: [],
            userSearchTerm: '',
            externalEmail: '',
            emailBody: '',
        });
    };

    const generatePdfForAction = async (): Promise<{ buffer: Buffer; fileName: string } | null> => {
        if (!companyData || !state.currentDocument) return null;
        const fileName = `Comprobante-${state.currentDocument.id}.pdf`;

        const styledRows = state.verificationItems.map(item => {
            let textColor: [number, number, number] = [0, 0, 0]; // Default black
            if (item.verifiedQuantity > item.requiredQuantity) {
                textColor = [220, 53, 69]; // Red
            } else if (item.verifiedQuantity === item.requiredQuantity) {
                textColor = [25, 135, 84]; // Green
            } else if (item.verifiedQuantity > 0) {
                textColor = [255, 193, 7]; // Orange/Yellow
            }

            return [
                item.itemCode,
                item.description,
                { content: item.requiredQuantity.toString(), styles: { halign: 'right' as HAlignType } },
                { content: item.verifiedQuantity.toString(), styles: { halign: 'right' as HAlignType, textColor, fontStyle: 'bold' as const } }
            ];
        });

        const doc = generateDocument({
            docTitle: `Comprobante de Despacho`,
            docId: state.currentDocument.id,
            companyData,
            meta: [{ label: 'Verificado por', value: user?.name || 'N/A' }, { label: 'Fecha', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
            blocks: [{ title: 'Cliente', content: `${state.currentDocument.clientName}\nCédula: ${state.currentDocument.clientId}\nDirección: ${state.currentDocument.shippingAddress}` }],
            table: {
                columns: ["Código", "Descripción", { content: "Req.", styles: { halign: 'right' } }, { content: "Verif.", styles: { halign: 'right' } }],
                rows: styledRows,
            },
            totals: [],
        });
        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
        return { buffer: pdfBuffer, fileName };
    };

    const handleFinalizeAndAction = async (action: 'finish' | 'pdf' | 'email') => {
        if (!user || !state.currentDocument) return;

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
    };
    
    const proceedWithFinalize = async (action: 'finish' | 'pdf' | 'email') => {
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
                const pdfData = await generatePdfForAction();
                if (pdfData) {
                    await sendDispatchEmail({
                        to: state.selectedUsers.map(u => u.email),
                        cc: state.externalEmail,
                        body: state.emailBody,
                        pdfBuffer: pdfData.buffer.toString('base64'),
                        fileName: pdfData.fileName,
                        documentId: state.currentDocument.id,
                    });
                }
            } else if (action === 'pdf') {
                const pdfData = await generatePdfForAction();
                if (pdfData) {
                    const blob = new Blob([pdfData.buffer], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = pdfData.fileName;
                    link.click();
                    URL.revokeObjectURL(url);
                }
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
            .filter(u => u.name.toLowerCase().includes(debouncedUserSearch.toLowerCase()) || u.email.toLowerCase().includes(debouncedUserSearch.toLowerCase()))
            .map(u => ({ value: String(u.id), label: `${u.name} (${u.email})` }));
    }, [debouncedUserSearch, allUsers]);

    const handleUserSelect = (userId: string) => {
        const userToAdd = allUsers.find(u => String(u.id) === userId);
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
        setConfirmationState: (confirmation: ConfirmationState) => updateState({ confirmationState: confirmation }),
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
    };
}
