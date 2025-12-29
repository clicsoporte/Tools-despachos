/**
 * @fileoverview Hook to manage the state and logic for the receiving wizard.
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getLocations, getItemLocations, addInventoryUnit, getSelectableLocations } from '@/modules/warehouse/lib/actions';
import type { Product, WarehouseLocation, ItemLocation } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
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
    useAuthorization(['warehouse:access']);
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
        quantity: '',
        humanReadableId: '',
        documentId: '',
        lastReceipt: null as { unitCode: string, productDescription: string, locationPath: string } | null,
        productSearchTerm: '',
        isProductSearchOpen: false,
        locationSearchTerm: '',
        isLocationSearchOpen: false,
    });
    
    const [debouncedProductSearch] = useDebounce(state.productSearchTerm, 300);
    const [debouncedLocationSearch] = useDebounce(state.locationSearchTerm, 300);

    const updateState = useCallback((newState: Partial<typeof state>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    useEffect(() => {
        setTitle("Asistente de Recepción");
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
                logError("Failed to load initial receiving data", { error: error.message });
                toast({ title: "Error de Carga", variant: "destructive" });
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
            step: 'confirm_suggested'
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
            updateState({ step: 'select_location', newLocationId: null, locationSearchTerm: '' });
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
            quantity: '',
            humanReadableId: '',
            documentId: '',
            lastReceipt: null,
        });
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
                quantity: parseFloat(state.quantity),
                humanReadableId: state.humanReadableId,
                documentId: state.documentId,
                createdBy: user.name,
                notes: `Recibido vía asistente: ${state.quantity} unidades.`,
            };
            const newUnit = await addInventoryUnit(unitData);
            
            const locationPath = renderLocationPathAsString(newUnit.locationId!, state.allLocations);
            updateState({
                step: 'finished',
                lastReceipt: {
                    unitCode: newUnit.unitCode!,
                    productDescription: state.selectedProduct.description,
                    locationPath,
                }
            });
            toast({ title: 'Unidad Registrada', description: `Se creó la unidad ${newUnit.unitCode}.`});

            // Auto-generate and download label
            const canvas = document.createElement('canvas');
            jsbarcode(canvas, newUnit.unitCode!, { format: 'CODE128', displayValue: false });
            const barcodeDataUrl = canvas.toDataURL('image/png');
            
            const qrCodeDataUrl = await QRCode.toDataURL(newUnit.unitCode!, { errorCorrectionLevel: 'H', width: 200 });

            const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [4, 3] });
            doc.addImage(qrCodeDataUrl, 'PNG', 0.2, 0.2, 1.2, 1.2);
            doc.addImage(barcodeDataUrl, 'PNG', 0.2, 1.5, 1.2, 0.5);
            doc.setFontSize(10).text(newUnit.unitCode!, 0.8, 2.2, { align: 'center' });
            
            doc.setFontSize(12).setFont('Helvetica', 'bold').text(`Producto: ${newUnit.productId}`, 1.6, 0.4);
            doc.setFontSize(9).setFont('Helvetica', 'normal').text(doc.splitTextToSize(state.selectedProduct.description, 2.2), 1.6, 0.6);
            doc.setFontSize(10).setFont('Helvetica', 'bold').text(`Lote/ID: ${newUnit.humanReadableId || 'N/A'}`, 1.6, 1.2);
            doc.text(`Documento: ${newUnit.documentId || 'N/A'}`, 1.6, 1.4);
            doc.text(`Ubicación:`, 1.6, 1.8);
            doc.setFontSize(8).setFont('Helvetica', 'normal').text(locationPath, 1.6, 1.95);
            doc.setFontSize(8).text(`Creado: ${format(new Date(), 'dd/MM/yyyy')} por ${user.name}`, 3.8, 2.8, { align: 'right' });
            
            doc.save(`etiqueta_unidad_${newUnit.unitCode}.pdf`);

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
            handleProductSearchKeyDown
        },
        selectors: {
            productOptions,
            locationOptions,
            renderLocationPath: (locationId: number) => renderLocationPathAsString(locationId, state.allLocations),
        },
    };
};
