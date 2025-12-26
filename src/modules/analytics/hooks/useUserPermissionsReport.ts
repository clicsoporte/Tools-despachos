/**
 * @fileoverview Hook to manage the logic for the user permissions report page.
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getUserPermissionsReportData } from '@/modules/analytics/lib/actions';
import type { User, Role } from '@/modules/core/types';
import { useDebounce } from 'use-debounce';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { format } from 'date-fns';
import { permissionTranslations } from '@/modules/core/lib/data';

export interface UserPermissionRow {
    userId: number;
    userName: string;
    userEmail: string;
    roleId: string;
    roleName: string;
    permissions: string[];
}

export type SortKey = 'userName' | 'roleName';
export type SortDirection = 'asc' | 'desc';

const normalizeText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

interface State {
    isLoading: boolean;
    data: UserPermissionRow[];
    searchTerm: string;
    sortKey: SortKey;
    sortDirection: SortDirection;
}

export function useUserPermissionsReport() {
    const { isAuthorized } = useAuthorization(['analytics:user-permissions:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: false,
        data: [],
        searchTerm: '',
        sortKey: 'userName',
        sortDirection: 'asc',
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const fetchData = useCallback(async () => {
        if (!isAuthorized) return;
        updateState({ isLoading: true });
        try {
            const { users, roles } = await getUserPermissionsReportData();
            const reportData = users.map(user => {
                const role = roles.find(r => r.id === user.role);
                return {
                    userId: user.id,
                    userName: user.name,
                    userEmail: user.email,
                    roleId: user.role,
                    roleName: role ? role.name : 'Rol no encontrado',
                    permissions: role ? role.permissions : [],
                };
            });
            updateState({ data: reportData });
        } catch (error: any) {
            logError("Failed to get user permissions report", { error: error.message });
            toast({ title: "Error al Generar Reporte", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isLoading: false });
            if (isInitialLoading) setIsInitialLoading(false);
        }
    }, [isAuthorized, toast, updateState, isInitialLoading]);
    
    useEffect(() => {
        setTitle("Reporte de Permisos");
        if (isAuthorized) {
            fetchData();
        }
    }, [setTitle, isAuthorized, fetchData]);

    const filteredData = useMemo(() => {
        let filtered = state.data;

        if (debouncedSearchTerm) {
            const searchLower = normalizeText(debouncedSearchTerm);
            filtered = filtered.filter(item => 
                normalizeText(item.userName).includes(searchLower) ||
                normalizeText(item.userEmail).includes(searchLower) ||
                normalizeText(item.roleName).includes(searchLower)
            );
        }

        filtered.sort((a, b) => {
            const dir = state.sortDirection === 'asc' ? 1 : -1;
            const valA = a[state.sortKey];
            const valB = b[state.sortKey];
            return valA.localeCompare(valB, 'es') * dir;
        });

        return filtered;
    }, [state.data, debouncedSearchTerm, state.sortKey, state.sortDirection]);

    const handleSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (state.sortKey === key && state.sortDirection === 'asc') {
            direction = 'desc';
        }
        updateState({ sortKey: key, sortDirection: direction });
    };
    
    const translatePermission = (perm: string) => (permissionTranslations as Record<string, string>)[perm] || perm;

    const handleExportExcel = () => {
        const headers = ["Usuario", "Correo", "Rol", "Permisos"];
        const dataToExport = filteredData.map(item => [
            item.userName,
            item.userEmail,
            item.roleName,
            item.permissions.map(translatePermission).join(', ')
        ]);
        exportToExcel({
            fileName: 'reporte_permisos_usuario',
            sheetName: 'Permisos',
            headers,
            data: dataToExport,
            columnWidths: [30, 30, 20, 80],
        });
    };

    const handleExportPDF = async () => {
        if (!companyData) return;
        
        let logoDataUrl: string | null = null;
        if (companyData.logoUrl) {
            try {
                const response = await fetch(companyData.logoUrl);
                const blob = await response.blob();
                logoDataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            } catch (e) { console.error("Error processing logo for PDF:", e); }
        }

        const tableHeaders = ["Usuario", "Rol", "Permisos"];
        const tableRows = filteredData.map(item => [
            `${item.userName}\n${item.userEmail}`,
            item.roleName,
            item.permissions.map(translatePermission).join(', ')
        ]);

        const doc = generateDocument({
            docTitle: "Reporte de Permisos de Usuario",
            docId: '',
            companyData,
            logoDataUrl,
            meta: [{ label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
            blocks: [],
            table: {
                columns: tableHeaders,
                rows: tableRows,
                columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 80 }, 2: { cellWidth: 'auto' } }
            },
            totals: [],
            orientation: 'landscape',
        });
        doc.save(`reporte_permisos_${new Date().getTime()}.pdf`);
    };

    return {
        state,
        actions: {
            setSearchTerm: (term: string) => updateState({ searchTerm: term }),
            handleSort,
            handleExportExcel,
            handleExportPDF,
        },
        selectors: {
            filteredData,
            translatePermission,
        },
        isAuthorized,
        isInitialLoading,
    };
}
