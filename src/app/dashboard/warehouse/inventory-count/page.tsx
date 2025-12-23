/**
 * @fileoverview New page for physical inventory counting.
 * This component allows users to select a product and location, and input the physically counted quantity.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getLocations, updateInventory, logMovement, getSelectableLocations } from '@/modules/warehouse/lib/actions';
import type { Product, WarehouseLocation } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { Loader2, Save, List } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Skeleton } from '@/components/ui/skeleton';

const renderLocationPathAsString = (locationId: number, locations: WarehouseLocation[]): string => {
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
    while (current) {
        path.unshift(current);
        current = current.parentId ? locations.find(l => l.id === current.parentId) : undefined;
    }
    return path.map(l => l.name).join(' > ');
};

export default function InventoryCountPage() {
    useAuthorization(['warehouse:inventory:assign']); // Reusing permission, can be changed
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products: authProducts } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
    const [countedQuantity, setCountedQuantity] = useState<string>('');

    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const [locationSearchTerm, setLocationSearchTerm] = useState('');
    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);

    const [debouncedProductSearch] = useDebounce(productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedLocationSearch] = useDebounce(locationSearchTerm, 300);

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const locs = await getLocations();
            setLocations(locs);
        } catch (error) {
            logError("Failed to load data for inventory count page", { error });
            toast({ title: "Error de Carga", description: "No se pudieron cargar las ubicaciones.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        setTitle("Toma de Inventario Físico");
        loadInitialData();
    }, [setTitle, loadInitialData]);

    const productOptions = useMemo(() =>
        debouncedProductSearch.length < 2 ? [] : authProducts
            .filter(p => p.id.toLowerCase().includes(debouncedProductSearch.toLowerCase()) || p.description.toLowerCase().includes(debouncedProductSearch.toLowerCase()))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` })),
        [authProducts, debouncedProductSearch]
    );

    const locationOptions = useMemo(() => {
        const searchTerm = debouncedLocationSearch.trim().toLowerCase();
        const selectableLocations = getSelectableLocations(locations);
        if (searchTerm === '*' || searchTerm === '') {
            return selectableLocations.map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, locations) }));
        }
        return selectableLocations
            .filter(l => renderLocationPathAsString(l.id, locations).toLowerCase().includes(searchTerm))
            .map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, locations) }));
    }, [locations, debouncedLocationSearch]);

    const handleSelectProduct = (value: string) => {
        setIsProductSearchOpen(false);
        const product = authProducts.find(p => p.id === value);
        if (product) {
            setSelectedProductId(value);
            setProductSearchTerm(`[${product.id}] ${product.description}`);
        }
    };
    
    const handleSelectLocation = (value: string) => {
        setIsLocationSearchOpen(false);
        const location = locations.find(l => String(l.id) === value);
        if (location) {
            setSelectedLocationId(value);
            setLocationSearchTerm(renderLocationPathAsString(location.id, locations));
        }
    };

    const handleSaveCount = async () => {
        if (!selectedProductId || !selectedLocationId || countedQuantity === '') {
            toast({ title: "Datos Incompletos", description: "Debe seleccionar un producto, una ubicación e ingresar una cantidad.", variant: "destructive" });
            return;
        }
        if (!user) return;

        const quantity = parseFloat(countedQuantity);
        if (isNaN(quantity)) {
             toast({ title: "Cantidad Inválida", description: "La cantidad debe ser un número.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            await updateInventory(selectedProductId, parseInt(selectedLocationId, 10), quantity, user.name);
            await logMovement({
                itemId: selectedProductId,
                quantity: quantity,
                fromLocationId: null,
                toLocationId: parseInt(selectedLocationId, 10),
                userId: user.id,
                notes: 'Conteo de inventario físico'
            });
            
            toast({ title: "Conteo Guardado", description: `Se registró un inventario de ${quantity} para el producto.` });
            logInfo('Physical inventory count saved', { itemId: selectedProductId, locationId: selectedLocationId, quantity, user: user.name });
            
            // Reset product for next count
            setSelectedProductId(null);
            setProductSearchTerm('');
            setCountedQuantity('');

        } catch(e: any) {
            logError('Failed to save inventory count', { error: e.message });
            toast({ title: "Error", description: `No se pudo guardar el conteo. ${e.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                 <div className="grid gap-8 md:grid-cols-3">
                    <div className="md:col-span-1 space-y-6">
                        <Skeleton className="h-64 w-full" />
                    </div>
                    <div className="md:col-span-2">
                        <Skeleton className="h-80 w-full" />
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-2xl space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Toma de Inventario Físico</CardTitle>
                        <CardDescription>Selecciona un producto y una ubicación para registrar la cantidad contada físicamente.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>1. Seleccione un Producto</Label>
                            <SearchInput options={productOptions} onSelect={handleSelectProduct} value={productSearchTerm} onValueChange={setProductSearchTerm} placeholder="Buscar producto..." open={isProductSearchOpen} onOpenChange={setIsProductSearchOpen} />
                        </div>
                        <div className="space-y-2">
                            <Label>2. Seleccione una Ubicación</Label>
                            <div className="flex items-center gap-2">
                                <SearchInput options={locationOptions} onSelect={handleSelectLocation} value={locationSearchTerm} onValueChange={setLocationSearchTerm} placeholder="Buscar... ('*' o vacío para ver todas)" open={isLocationSearchOpen} onOpenChange={setIsLocationSearchOpen} />
                                <Button type="button" variant="outline" size="icon" onClick={() => {setLocationSearchTerm('*'); setIsLocationSearchOpen(true);}}>
                                    <List className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                         <div className="space-y-2">
                            <Label>3. Ingrese la Cantidad Contada</Label>
                            <Input type="number" value={countedQuantity} onChange={(e) => setCountedQuantity(e.target.value)} placeholder="0" className="text-lg h-12" />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSaveCount} disabled={isSubmitting || !selectedProductId || !selectedLocationId || countedQuantity === ''}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" />
                            Guardar Conteo
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </main>
    );
}
