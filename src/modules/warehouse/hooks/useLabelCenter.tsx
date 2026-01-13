/**
 * @fileoverview Hook to manage the state and logic for the new Label Center page.
 */
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getLocations } from '@/modules/warehouse/lib/actions';
import type { WarehouseLocation } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import jsPDF from "jspdf";
import QRCode from 'qrcode';

const renderLocationPathAsString = (locationId: number, locations: WarehouseLocation[]): string => {
    if (!locationId) return '';
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
    while (current) {
        path.unshift(current);
        const parentId = current.parentId;
        if (!parentId) break;
        current = locations.find(l => l.id === parentId);
    }
    return path.map(l => l.name).join(' > ');
};

export function useLabelCenter() {
    const { isAuthorized } = useAuthorization(['warehouse:labels:print']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData } = useAuth();

    const [state, setState] = useState({
        isLoading: true,
        isSubmitting: false,
        allLocations: [] as WarehouseLocation[],
        rootLocationSearch: '',
        isRootLocationSearchOpen: false,
        selectedRootLocationId: null as number | null,
        levelFilter: [] as string[],
        positionFilter: [] as string[],
        depthFilter: [] as string[],
    });

    const [debouncedSearch] = useDebounce(state.rootLocationSearch, 300);

    const updateState = useCallback((newState: Partial<typeof state>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    useEffect(() => {
        setTitle("Centro de Impresión de Etiquetas");
        const loadData = async () => {
            if (!isAuthorized) {
                updateState({ isLoading: false });
                return;
            };
            try {
                const locs = await getLocations();
                updateState({ allLocations: locs, isLoading: false });
            } catch (err: any) {
                logError('Failed to load locations for label center', { error: err.message });
                toast({ title: 'Error', description: 'No se pudieron cargar las ubicaciones.', variant: 'destructive' });
                updateState({ isLoading: false });
            }
        };
        loadData();
    }, [setTitle, isAuthorized, toast, updateState]);
    
    const handleSelectRootLocation = (idStr: string) => {
        const id = Number(idStr);
        const location = state.allLocations.find(l => l.id === id);
        if (location) {
            updateState({
                selectedRootLocationId: id,
                rootLocationSearch: renderLocationPathAsString(id, state.allLocations),
                isRootLocationSearchOpen: false,
                levelFilter: [],
                positionFilter: [],
                depthFilter: [],
            });
        }
    };

    const handleClearFilters = () => {
        updateState({
            levelFilter: [],
            positionFilter: [],
            depthFilter: [],
        });
    };

    const generateLabelPage = (doc: jsPDF, location: WarehouseLocation) => {
        const qrContent = String(location.id);
        const pathString = renderLocationPathAsString(location.id, state.allLocations);
        
        doc.addPage();
        
        QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'H', width: 200 }, (err, url) => {
            if (err) {
                console.error("QR Code generation failed for location:", location.id);
                return;
            }
            doc.addImage(url, 'PNG', 40, 40, 100, 100);
        });

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Generado: ${new Date().toLocaleDateString()}`, doc.internal.pageSize.getWidth() - 40, 40, { align: 'right' });
        
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(150);
        const codeLines = doc.splitTextToSize(location.code, doc.internal.pageSize.getWidth() - 80);
        let currentY = doc.internal.pageSize.getHeight() / 2 - 80;
        doc.text(codeLines, doc.internal.pageSize.getWidth() / 2, currentY, { align: "center" });

        currentY += (codeLines.length * 100);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(36);
        const pathLines = doc.splitTextToSize(pathString, doc.internal.pageSize.getWidth() - 80);
        doc.text(pathLines, doc.internal.pageSize.getWidth() / 2, currentY + 40, { align: "center" });
    };

    const handleGenerateLabels = async () => {
        if (selectors.filteredLocations.length === 0) {
            toast({ title: 'Sin selección', description: 'No hay etiquetas para generar con los filtros actuales.', variant: 'destructive' });
            return;
        }
        updateState({ isSubmitting: true });
        try {
            const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
            // Remove the default first page
            doc.deletePage(1);

            for (const location of selectors.filteredLocations) {
                generateLabelPage(doc, location);
            }
            
            const rootLocation = state.allLocations.find(l => l.id === state.selectedRootLocationId);
            doc.save(`etiquetas_${rootLocation?.code || 'rack'}.pdf`);

            logInfo(`Generated ${selectors.filteredLocations.length} labels`, { root: rootLocation?.code });
            toast({ title: 'PDF Generado', description: `Se creó un archivo con ${selectors.filteredLocations.length} etiquetas.` });

        } catch (error: any) {
            logError('Label generation failed', { error: error.message });
            toast({ title: 'Error', description: 'No se pudieron generar las etiquetas.', variant: 'destructive' });
        } finally {
            updateState({ isSubmitting: false });
        }
    };
    
    const rootLocationOptions = useMemo(() => {
        const searchLower = debouncedSearch.toLowerCase();
        return state.allLocations
            .filter(l => 
                l.type === 'rack' || l.type === 'zone' || l.type === 'building' &&
                (l.name.toLowerCase().includes(searchLower) || l.code.toLowerCase().includes(searchLower))
            )
            .map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, state.allLocations) }));
    }, [state.allLocations, debouncedSearch]);

    const { levelOptions, positionOptions, depthOptions, filteredLocations } = useMemo(() => {
        if (!state.selectedRootLocationId) {
            return { levelOptions: [], positionOptions: [], depthOptions: [], filteredLocations: [] };
        }
    
        const descendants: WarehouseLocation[] = [];
        const queue: number[] = [state.selectedRootLocationId];
        const visited = new Set<number>();
    
        while(queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);
    
            const location = state.allLocations.find(l => l.id === currentId);
            if (location) {
                descendants.push(location);
            }
    
            const children = state.allLocations.filter(l => l.parentId === currentId);
            queue.push(...children.map(c => c.id));
        }
        
        const leafLocations = descendants.filter(l => 
            !descendants.some(other => other.parentId === l.id)
        );
    
        const levels = new Set<string>();
        const positions = new Set<string>();
        const depths = new Set<string>();
    
        descendants.forEach(loc => {
            if (loc.type === 'shelf') levels.add(loc.name);
            if (loc.type === 'bin') {
                const nameParts = loc.name.split(' ');
                if (nameParts[0] === 'Posición') positions.add(nameParts[1]);
                else if (nameParts[0] === 'Frente' || nameParts[0] === 'Fondo') depths.add(nameParts[0]);
            }
        });
        
        let filtered = [...leafLocations];
        if (state.levelFilter.length > 0) {
            const levelIds = new Set(descendants.filter(l => l.type === 'shelf' && state.levelFilter.includes(l.name)).map(l => l.id));
            filtered = filtered.filter(l => {
                let current = l;
                while(current.parentId) {
                    if (levelIds.has(current.parentId)) return true;
                    const parent = descendants.find(d => d.id === current.parentId);
                    if (!parent) break;
                    current = parent;
                }
                return false;
            });
        }
        if (state.positionFilter.length > 0) {
             const positionIds = new Set(descendants.filter(l => l.type === 'bin' && l.name.startsWith('Posición') && state.positionFilter.includes(l.name.split(' ')[1])).map(l => l.id));
             filtered = filtered.filter(l => {
                let current = l;
                while(current.parentId) {
                    if (positionIds.has(current.parentId)) return true;
                    const parent = descendants.find(d => d.id === current.parentId);
                    if (!parent || parent.id === state.selectedRootLocationId) break;
                    current = parent;
                }
                return false;
            });
        }
        if (state.depthFilter.length > 0) {
            filtered = filtered.filter(l => state.depthFilter.includes(l.name));
        }
        
        return {
            levelOptions: Array.from(levels).sort().map(l => ({ value: l, label: l })),
            positionOptions: Array.from(positions).sort((a,b) => a.localeCompare(b, undefined, { numeric: true })).map(p => ({ value: p, label: p })),
            depthOptions: Array.from(depths).map(d => ({ value: d, label: d })),
            filteredLocations: filtered
        };
    
    }, [state.selectedRootLocationId, state.allLocations, state.levelFilter, state.positionFilter, state.depthFilter]);
    
    const selectors = {
        rootLocationOptions,
        levelOptions,
        positionOptions,
        depthOptions,
        filteredLocations,
        selectedRootLocationName: state.selectedRootLocationId ? renderLocationPathAsString(state.selectedRootLocationId, state.allLocations) : ''
    };

    const actions = {
        setRootLocationSearch: (term: string) => updateState({ rootLocationSearch: term }),
        setIsRootLocationSearchOpen: (isOpen: boolean) => updateState({ isRootLocationSearchOpen: isOpen }),
        handleSelectRootLocation,
        setLevelFilter: (filter: string[]) => updateState({ levelFilter: filter }),
        setPositionFilter: (filter: string[]) => updateState({ positionFilter: filter }),
        setDepthFilter: (filter: string[]) => updateState({ depthFilter: filter }),
        handleClearFilters,
        handleGenerateLabels,
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
    };
}
