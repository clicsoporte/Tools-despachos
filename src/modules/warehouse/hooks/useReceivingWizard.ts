/**
 * @fileoverview Hook to manage the state and logic for the receiving wizard.
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getLocations, getAllItemLocations, addInventoryUnit, getSelectableLocations, assignItemToLocation } from '../lib/actions';
import type { Product, WarehouseLocation, ItemLocation, InventoryUnit } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import jsbarcode from 'jsbarcode';
import { format } from 'date-fns';

type WizardStep = 'select_product' | 'select_location' | 'confirm_suggested' | 'confirm_new' | 'finished';

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

export const useReceivingWizard = () => {
    useAuthorization(['warehouse:receiving-wizard:use']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products: authProducts, isReady } = useAuth();

    const [state, setState] = useState({
        isLoading: true,
        isSubmitting: false,
        step: 'select_product' as WizardStep,
        allLocations: [] as WarehouseLocation[],
        selectableLocations: [] as WarehouseLocation[],
        allItemLocations: [] as ItemLocation[],
        selectedProduct: null as Product | null,
        suggestedLocations: [] as WarehouseLocation[],
        selectedLocationId: null as number | null,
        newLocationId: null as number | null,
        quantity: '1',
        humanReadableId: '',
        documentId: '',
        lastCreatedUnit: null as InventoryUnit | null,
        productSearchTerm: '',
        isProductSearchOpen: false,
        locationSearchTerm: '',
        isLocationSearchOpen: false,
        saveAsDefault: true, // New state for the switch
    });
    
    const [debouncedProductSearch] = useDebounce(state.productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedLocationSearch] = useDebounce(state.locationSearchTerm, 300);

    const updateState = useCallback((newState: Partial<typeof state>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    useEffect(() => {
        setTitle('Asistente de Recepción');
        const loadInitialData = async () => {
            updateState({ isLoading: true });
            try {
                const [locs, itemLocs] = await Promise.all([getLocations(), getAllItemLocations()]);
                updateState({
                    allLocations: locs,
                    selectableLocations: getSelectableLocations(locs),
                    allItemLocations: itemLocs,
                });
            } catch (error: any) {
                logError('Failed to load initial receiving data', { error: error.message });
                toast({ title: 'Error de Carga', variant: 'destructive' });
            } finally {
                updateState({ isLoading: false });
            }
        };
        if (isReady) {
            loadInitialData();
        }
    }, [setTitle, isReady, toast, updateState]);
    
    const productOptions = useMemo(() => {
        if (debouncedProductSearch.length < 2) return [];
        const searchLower = debouncedProductSearch.toLowerCase();
        return authProducts
            .filter(p => p.id.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
    }, [authProducts, debouncedProductSearch]);

    const locationOptions = useMemo(() => {
        const searchTerm = debouncedLocationSearch.trim().toLowerCase();
        if (searchTerm === '*' || searchTerm === '') return state.selectableLocations.map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, state.allLocations) }));
        return state.selectableLocations
            .filter(l => renderLocationPathAsString(l.id, state.allLocations).toLowerCase().includes(searchTerm))
            .map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, state.allLocations) }));
    }, [state.allLocations, state.selectableLocations, debouncedLocationSearch]);

    const handleSelectProduct = useCallback((productId: string) => {
        const product = authProducts.find(p => p.id === productId);
        if (!product) return;

        const suggestedLocIds = state.allItemLocations
            .filter(il => il.itemId === productId)
            .map(il => il.locationId);
        
        const suggested = state.allLocations.filter(loc => suggestedLocIds.includes(loc.id));
        
        updateState({
            selectedProduct: product,
            productSearchTerm: `[${product.id}] ${product.description}`,
            suggestedLocations: suggested,
            step: 'select_location',
            isProductSearchOpen: false,
            saveAsDefault: suggested.length === 0, // CRITICAL: Set switch to ON if no suggestions exist
        });
    }, [authProducts, state.allItemLocations, state.allLocations, updateState]);
    
    const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && productOptions.length > 0) {
            e.preventDefault();
            handleSelectProduct(productOptions[0].value);
        }
    };
    
    const handleUseSuggestedLocation = (locationId: number) => {
        updateState({
            selectedLocationId: locationId,
            newLocationId: locationId,
            step: 'confirm_suggested',
            saveAsDefault: false, // Turn off when using an existing suggestion
        });
    };
    
    const handleAssignNewLocation = () => updateState({ step: 'confirm_new' });
    
    const handleSelectLocation = (locationIdStr: string) => {
        const id = Number(locationIdStr);
        updateState({
            newLocationId: id,
            isLocationSearchOpen: false,
            locationSearchTerm: renderLocationPathAsString(id, state.allLocations),
        });
    };

    const handleGoBack = () => {
        if (state.step === 'finished' || state.step === 'select_product') return;
        if (state.step === 'select_location') {
            updateState({ step: 'select_product', selectedProduct: null, productSearchTerm: '' });
        } else {
            // When going back from confirm_new, reset saveAsDefault based on original suggestions
            const hadSuggestions = state.suggestedLocations.length > 0;
            updateState({ step: 'select_location', newLocationId: null, locationSearchTerm: '', saveAsDefault: !hadSuggestions });
        }
    };
    
    const handleReset = () => {
        updateState({
            step: 'select_product',
            selectedProduct: null,
            productSearchTerm: '',
            suggestedLocations: [],
            selectedLocationId: null,
            newLocationId: null,
            locationSearchTerm: '',
            quantity: '1',
            humanReadableId: '',
            documentId: '',
            lastCreatedUnit: null,
            saveAsDefault: true,
        });
    };

    const handlePrintLabel = async (unit: InventoryUnit | null) => {
        if (!unit || !state.selectedProduct || !companyData) {
            toast({ title: 'Error de Datos', description: 'No hay información suficiente para imprimir la etiqueta.', variant: 'destructive'});
            return;
        }

        try {
            const canvas = document.createElement('canvas');
            jsbarcode(canvas, unit.unitCode!, { format: 'CODE128', displayValue: false });
            const barcodeDataUrl = canvas.toDataURL('image/png');

            const qrCodeDataUrl = await QRCode.toDataURL(unit.unitCode!, { errorCorrectionLevel: 'H', width: 200 });

            const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [4, 3] });
            
            const margin = 0.2;
            const contentWidth = 4 - (margin * 2);
            
            // --- Left Column (QR and Barcode) ---
            const leftColX = margin;
            const leftColWidth = 1.2;
            doc.addImage(qrCodeDataUrl, 'PNG', leftColX, margin, leftColWidth, leftColWidth);
            doc.addImage(barcodeDataUrl, 'PNG', leftColX, margin + leftColWidth + 0.1, leftColWidth, 0.4);
            doc.setFontSize(10).text(unit.unitCode!, leftColX + leftColWidth / 2, margin + leftColWidth + 0.1 + 0.4 + 0.15, { align: 'center' });

            // --- Right Column (Text Info) ---
            const rightColX = leftColX + leftColWidth + 0.2;
            const rightColWidth = contentWidth - leftColWidth - 0.2;

            let currentY = margin + 0.1;
            doc.setFontSize(12).setFont('Helvetica', 'bold').text(`Producto: ${unit.productId}`, rightColX, currentY);
            currentY += 0.2;
            
            doc.setFontSize(9).setFont('Helvetica', 'normal');
            const descLines = doc.splitTextToSize(state.selectedProduct.description, rightColWidth);
            doc.text(descLines, rightColX, currentY);
            currentY += (descLines.length * 0.15) + 0.2;
            
            doc.setFontSize(10).setFont('Helvetica', 'bold').text(`Lote/ID: ${unit.humanReadableId || 'N/A'}`, rightColX, currentY);
            currentY += 0.15;
            doc.text(`Documento: ${unit.documentId || 'N/A'}`, rightColX, currentY);
            currentY += 0.25;

            doc.setFontSize(10).setFont('Helvetica', 'bold').text(`Ubicación:`, rightColX, currentY);
            currentY += 0.15;
            
            doc.setFontSize(9).setFont('Helvetica', 'normal');
            const locLines = doc.splitTextToSize(renderLocationPathAsString(unit.locationId!, state.allLocations), rightColWidth);
            doc.text(locLines, rightColX, currentY);
            
            // --- Footer ---
            const footerY = 3 - margin;
            doc.setFontSize(8).setTextColor(150);
            doc.text(`Creado: ${format(new Date(), 'dd/MM/yyyy')} por ${user?.name || 'Sistema'}`, 4 - margin, footerY, { align: 'right' });


            doc.save(`etiqueta_unidad_${unit.unitCode}.pdf`);

        } catch (err) {
            console.error(err);
            toast({ title: 'Error al generar QR/Barcode', description: 'No se pudo crear la imagen del código.', variant: 'destructive'});
        }
    };
    
    const handleConfirmAndRegister = async () => {
        if (!user || !state.selectedProduct || !state.newLocationId || !state.quantity) {
            toast({ title: 'Datos faltantes', variant: 'destructive'});
            return;
        }
        updateState({ isSubmitting: true });
        try {
            const unitData = {
                productId: state.selectedProduct.id,
                locationId: state.newLocationId,
                quantity: parseFloat(state.quantity) || 1,
                humanReadableId: state.humanReadableId,
                documentId: state.documentId,
                createdBy: user.name,
                notes: `Recibido vía asistente: ${state.quantity} unidades.`,
            };
            const newUnit = await addInventoryUnit(unitData);
            
            if (state.saveAsDefault) {
                await assignItemToLocation(unitData.productId, unitData.locationId, null, user.name);
                // After saving, re-fetch the item locations to update the local state
                const updatedItemLocations = await getAllItemLocations();
                updateState({ allItemLocations: updatedItemLocations });
            }
            
            updateState({
                step: 'finished',
                lastCreatedUnit: newUnit,
            });
            toast({ title: 'Unidad Registrada', description: `Se creó la unidad ${newUnit.unitCode}.`});

        } catch (error: any) {
            logError('Failed to register unit', { error: error.message });
            toast({ title: 'Error al Registrar', description: error.message, variant: 'destructive' });
        } finally {
            updateState({ isSubmitting: false });
        }
    };

    return {
        state,
        actions: {
            handleSelectProduct,
            handleUseSuggestedLocation,
            handleAssignNewLocation,
            handleSelectLocation,
            handleConfirmAndRegister,
            handleReset,
            handleGoBack,
            setProductSearchTerm: (term: string) => updateState({ productSearchTerm: term }),
            setProductSearchOpen: (isOpen: boolean) => updateState({ isProductSearchOpen: isOpen }),
            setLocationSearchTerm: (term: string) => updateState({ locationSearchTerm: term }),
            setLocationSearchOpen: (isOpen: boolean) => updateState({ isLocationSearchOpen: isOpen }),
            setQuantity: (qty: string) => updateState({ quantity: qty }),
            setHumanReadableId: (id: string) => updateState({ humanReadableId: id }),
            setDocumentId: (id: string) => updateState({ documentId: id }),
            setSaveAsDefault: (save: boolean) => updateState({ saveAsDefault: save }),
            handleProductSearchKeyDown,
            handlePrintLabel,
        },
        selectors: {
            productOptions,
            locationOptions,
            renderLocationPath: (locationId: number) => renderLocationPathAsString(locationId, state.allLocations),
        },
    };
};
