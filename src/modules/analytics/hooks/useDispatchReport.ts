/**
 * @fileoverview Hook to manage the logic for the dispatch report page.
 */
'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getDispatchLogs } from '@/modules/warehouse/lib/actions';
import type { DateRange, DispatchLog, VerificationItem, Company, UserPreferences } from '@/modules/core/types';
import { format, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDebounce } from 'use-debounce';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import type { HAlignType, FontStyle, RowInput } from 'jspdf-autotable';
import { exportToExcel } from '@/modules/core/lib/excel-export';

interface State {
    isLoading: boolean;
    logs: DispatchLog[];
    dateRange: DateRange;
    searchTerm: string;
    visibleColumns: string[];
}

const availableColumns = [
    { id: 'documentId', label: 'Documento' },
    { id: 'documentType', label: 'Tipo' },
    { id: 'clientId', label: 'Código Cliente' },
    { id: 'clientName', label: 'Nombre Cliente' },
    { id: 'shippingAddress', label: 'Dirección Entrega' },
    { id: 'verifiedAt', label: 'Fecha Verificación' },
    { id: 'verifiedByUserName', label: 'Verificado por' },
    { id: 'actions', label: 'Acciones' },
];

export function useDispatchReport() {
    const { isAuthorized } = useAuthorization(['analytics:dispatch-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData, user } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: false,
        logs: [],
        dateRange: {
            from: startOfDay(new Date()),
            to: new Date(),
        },
        searchTerm: '',
        visibleColumns: availableColumns.map(c => c.id),
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const fetchData = useCallback(async () => {
        updateState({ isLoading: true });
        try {
            const data = await getDispatchLogs(state.dateRange);
            updateState({ logs: data });
        } catch (error: any) {
            logError("Failed to fetch dispatch logs", { error: error.message });
            toast({ title: 'Error', description: 'No se pudieron cargar los registros de despacho.', variant: 'destructive' });
        } finally {
            updateState({ isLoading: false });
        }
    }, [state.dateRange, toast, updateState]);
    
    useEffect(() => {
        setTitle('Reporte de Despachos');
        const loadPrefs = async () => {
            if (user) {
                const prefs = await getUserPreferences(user.id, 'dispatchReportPrefs');
                if (prefs && prefs.visibleColumns) {
                    updateState({ visibleColumns: prefs.visibleColumns });
                }
            }
            setIsInitialLoading(false);
        };

        if (isAuthorized) {
            loadPrefs();
        }
    }, [setTitle, isAuthorized, user, updateState]);

    const filteredData = useMemo(() => {
        return state.logs.filter(log => {
            if (debouncedSearchTerm) {
                const search = debouncedSearchTerm.toLowerCase();
                return (
                    log.documentId.toLowerCase().includes(search) ||
                    (log.clientId && log.clientId.toLowerCase().includes(search)) ||
                    (log.clientName && log.clientName.toLowerCase().includes(search)) ||
                    log.verifiedByUserName.toLowerCase().includes(search) ||
                    (Array.isArray(log.items) && JSON.stringify(log.items).toLowerCase().includes(search))
                );
            }
            return true;
        });
    }, [state.logs, debouncedSearchTerm]);

    const handlePrintPdf = useCallback((log: DispatchLog) => {
        if (!companyData || !Array.isArray(log.items)) return;
        
        const styledRows: RowInput[] = log.items.map((item: VerificationItem) => {
            let textColor: [number, number, number] = [0, 0, 0];
            let fontStyle: FontStyle = 'normal';
            if (item.verifiedQuantity > item.requiredQuantity) {
                 textColor = [220, 53, 69]; // Red
                 fontStyle = 'bold';
            }
            else if (item.verifiedQuantity === item.requiredQuantity) textColor = [25, 135, 84]; // Green
            else if (item.verifiedQuantity < item.requiredQuantity && item.verifiedQuantity > 0) {
                 textColor = [255, 193, 7]; // Amber
                 fontStyle = 'bold';
            }
             else if (item.verifiedQuantity === 0) {
                textColor = [220, 53, 69]; // Red
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
            docId: log.documentId,
            companyData,
            meta: [{ label: 'Verificado por', value: log.verifiedByUserName }, { label: 'Fecha', value: format(parseISO(log.verifiedAt), 'dd/MM/yyyy HH:mm') }],
            blocks: [],
            table: {
                columns: ['Código', 'Descripción', { content: 'Req.', styles: { halign: 'right' as HAlignType } }, { content: 'Verif.', styles: { halign: 'right' as HAlignType } }],
                rows: styledRows,
                columnStyles: {},
            },
            totals: []
        });
        doc.save(`Comprobante-${log.documentId}.pdf`);
    }, [companyData]);

    const handleExportExcel = () => {
        const dataToExport = filteredData.flatMap(log => {
            if (!Array.isArray(log.items)) return [];
            return log.items.map((item: VerificationItem) => ({
                'Documento': log.documentId,
                'Tipo': log.documentType,
                'Código Cliente': log.clientId,
                'Nombre Cliente': log.clientName,
                'Dirección Entrega': log.shippingAddress,
                'Fecha': format(parseISO(log.verifiedAt), 'dd/MM/yyyy HH:mm'),
                'Usuario': log.verifiedByUserName,
                'Código Artículo': item.itemCode,
                'Descripción': item.description,
                'Cant. Requerida': item.requiredQuantity,
                'Cant. Verificada': item.verifiedQuantity,
                'Diferencia': item.verifiedQuantity - item.requiredQuantity,
            }));
        });
        exportToExcel({
            fileName: 'reporte_despachos',
            sheetName: 'Despachos',
            headers: ['Documento', 'Tipo', 'Código Cliente', 'Nombre Cliente', 'Dirección Entrega', 'Fecha', 'Usuario', 'Código Artículo', 'Descripción', 'Cant. Requerida', 'Cant. Verificada', 'Diferencia'],
            data: dataToExport.map(item => Object.values(item)),
        });
    };
    
    const savePreferences = async () => {
        if (!user) return;
        try {
            await saveUserPreferences(user.id, 'dispatchReportPrefs', { visibleColumns: state.visibleColumns });
            toast({ title: "Preferencias Guardadas" });
        } catch (error: any) {
            logError('Failed to save dispatch report preferences', { error: error.message });
            toast({ title: 'Error', description: 'No se pudieron guardar las preferencias.', variant: 'destructive' });
        }
    };
    
    const actions = {
        fetchData,
        setDateRange: (range: DateRange | undefined) => updateState({ dateRange: range || { from: new Date(), to: new Date() } }),
        setSearchTerm: (term: string) => updateState({ searchTerm: term }),
        handleClearFilters: () => updateState({ searchTerm: '', dateRange: { from: new Date(), to: new Date() } }),
        handlePrintPdf,
        handleExportExcel,
        handleColumnVisibilityChange: (columnId: string, checked: boolean) => updateState({ visibleColumns: checked ? [...state.visibleColumns, columnId] : state.visibleColumns.filter(id => id !== columnId) }),
        savePreferences,
    };

    const selectors = {
        filteredData,
        availableColumns,
        visibleColumnsData: useMemo(() => state.visibleColumns.map(id => availableColumns.find(col => col.id === id)).filter(Boolean) as (typeof availableColumns)[0][], [state.visibleColumns]),
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading
    };
}
