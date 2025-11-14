

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
import { getWarehouseData, logMovement, updateInventory, assignItemToLocation, unassignItemFromLocation } from '@/modules/warehouse/lib/actions';
import type { Product, WarehouseLocation, WarehouseInventoryItem, ItemLocation, User } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { PackageSearch, Loader2, ArrowRight, Info, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebounce } from 'use-debounce';
import { Skeleton } from '@/components/ui/skeleton';

export default function AssignInventoryPage() {
    useAuthorization(['warehouse:inventory:assign']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products: authProducts } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // --- State for Advanced Mode ---
    const [inventory, setInventory] = useState<WarehouseInventoryItem[]>([]);
    const [fromLocationId, setFromLocationId] = useState<string>('');
    const [toLocationId, setToLocationId] = useState<string>('');
    const [quantity, setQuantity] = useState<number>(1);
    
    // --- State for Simple Mode ---
    const [itemLocations, setItemLocations] = useState<ItemLocation[]>([]);
    const [newLocationId, setNewLocationId] = useState<string>('');

    const [warehouseSettings, setWarehouseSettings] = useState<{ enablePhysicalInventoryTracking: boolean } | null>(null);
    
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isProductSearchOpen, setProductSearchOpen] = useState(false);
    const [fromLocationSearchTerm, setFromLocationSearchTerm] = useState('');
    const [isFromLocationSearchOpen, setFromLocationSearchOpen] = useState(false);
    const [toLocationSearchTerm, setToLocationSearchTerm] = useState('');
    const [isToLocationSearchOpen, setToLocationSearchOpen] = useState(false);
    const [newLocationSearchTerm, setNewLocationSearchTerm] = useState('');
    const [isNewLocationSearchOpen, setNewLocationSearchOpen] = useState(false);

    const [debouncedProductSearch] = useDebounce(productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedFromLocationSearch] = useDebounce(fromLocationSearchTerm, 300);
    const [debouncedToLocationSearch] = useDebounce(toLocationSearchTerm, 300);
    const [debouncedNewLocationSearch] = useDebounce(newLocationSearchTerm, 300);


    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const wData = await getWarehouseData();
            setProducts(authProducts.filter(p => p.active === 'S'));
            setLocations(wData.locations);
            setWarehouseSettings(wData.warehouseSettings);
            // This is a bit inefficient, but keeps data consistent
            if (selectedProductId) {
                if (wData.warehouseSettings.enablePhysicalInventoryTracking) {
                    setInventory(wData.inventory.filter(i => i.itemId === selectedProductId));
                } else {
                    setItemLocations(wData.itemLocations.filter(il => il.itemId === selectedProductId));
                }
            }

        } catch (error) {
            logError("Failed to load data for inventory assignment", { error });
            toast({ title: "Error de Carga", description: "No se pudieron cargar productos y ubicaciones.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast, authProducts, selectedProductId]);
    
    useEffect(() => {
        setTitle("Asignar Inventario a Ubicación");
        loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTitle]);

    const fetchItemData = useCallback(async (itemId: string) => {
        if (!warehouseSettings) return;
        const wData = await getWarehouseData();

        if (warehouseSettings.enablePhysicalInventoryTracking) {
            const items = wData.inventory.filter(i => i.itemId === itemId);
            setInventory(items);
        } else {
            const assigned = wData.itemLocations.filter(il => il.itemId === itemId);
            setItemLocations(assigned);
        }
    }, [warehouseSettings]);

    useEffect(() => {
        if (selectedProductId) {
            fetchItemData(selectedProductId);
        } else {
            setInventory([]);
            setItemLocations([]);
        }
    }, [selectedProductId, fetchItemData]);

    const productOptions = useMemo(() =>
        debouncedProductSearch.length < 2 ? [] : products
            .filter(p => p.id.toLowerCase().includes(debouncedProductSearch.toLowerCase()) || p.description.toLowerCase().includes(debouncedProductSearch.toLowerCase()))
            .map(p => ({ value: p.id, label: `${p.id} - ${p.description}` })),
        [products, debouncedProductSearch]
    );
    
    const fromLocationOptions = useMemo(() =>
        debouncedFromLocationSearch.length < 1 ? [] : locations
            .filter(l => l.name.toLowerCase().includes(debouncedFromLocationSearch.toLowerCase()) || l.code.toLowerCase().includes(debouncedFromLocationSearch.toLowerCase()))
            .map(l => ({ value: String(l.id), label: `${l.code} (${l.name})` })),
        [locations, debouncedFromLocationSearch]
    );
    
    const toLocationOptions = useMemo(() =>
        debouncedToLocationSearch.length < 1 ? [] : locations
            .filter(l => l.name.toLowerCase().includes(debouncedToLocationSearch.toLowerCase()) || l.code.toLowerCase().includes(debouncedToLocationSearch.toLowerCase()))
            .map(l => ({ value: String(l.id), label: `${l.code} (${l.name})` })),
        [locations, debouncedToLocationSearch]
    );

     const newLocationOptions = useMemo(() =>
        debouncedNewLocationSearch.length < 1 ? [] : locations
            .filter(l => l.name.toLowerCase().includes(debouncedNewLocationSearch.toLowerCase()) || l.code.toLowerCase().includes(debouncedNewLocationSearch.toLowerCase()))
            .map(l => ({ value: String(l.id), label: `${l.code} (${l.name})` })),
        [locations, debouncedNewLocationSearch]
    );

    const handleSelectProduct = (value: string) => {
        setProductSearchOpen(false);
        const product = products.find(p => p.id === value);
        if (product) {
            setSelectedProductId(value);
            setProductSearchTerm(`${product.id} - ${product.description}`);
        }
    };
    
    const handleMoveSubmit = async () => {
        if (!selectedProductId || !toLocationId || !quantity || quantity <= 0 || !user) {
            toast({ title: "Datos incompletos", description: "Debe seleccionar un producto, una ubicación de destino y una cantidad válida.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const fromId = fromLocationId ? parseInt(fromLocationId) : null;
            const toId = parseInt(toLocationId);
            
            await logMovement({
                itemId: selectedProductId,
                quantity: quantity,
                fromLocationId: fromId,
                toLocationId: toId,
                userId: (user as User).id,
                notes: 'Asignación manual de inventario'
            });

            if (fromId) {
                await updateInventory(selectedProductId, fromId, -quantity);
            }
            await updateInventory(selectedProductId, toId, quantity);

            toast({ title: "Movimiento Exitoso", description: `${quantity} unidad(es) de ${selectedProductId} movidas a la ubicación seleccionada.` });
            logInfo('Inventory manually assigned', { item: selectedProductId, quantity, from: fromId, to: toId, user: user.name });
            
            await fetchItemData(selectedProductId);
            
            setFromLocationId('');
            setFromLocationSearchTerm('');
            setToLocationId('');
            setToLocationSearchTerm('');
            setQuantity(1);

        } catch (error: any) {
            logError("Failed to assign inventory", { error });
            toast({ title: "Error en la Asignación", description: `No se pudo completar el movimiento de inventario. ${error.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleAssignSubmit = async () => {
        if (!selectedProductId || !newLocationId) {
            toast({ title: "Datos incompletos", description: "Debe seleccionar un producto y una ubicación.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            await assignItemToLocation(selectedProductId, parseInt(newLocationId));
            toast({ title: "Ubicación Asignada", description: `Se ha asignado el artículo a la ubicación.` });
            await fetchItemData(selectedProductId);
            setNewLocationId('');
            setNewLocationSearchTerm('');
        } catch (error: any) {
            logError("Failed to assign location to item", { error });
            toast({ title: "Error en la Asignación", description: `No se pudo asignar la ubicación. ${error.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUnassign = async (itemLocationId: number) => {
        if (!selectedProductId) return;
        try {
            await unassignItemFromLocation(itemLocationId);
            toast({ title: "Ubicación Removida", description: "Se ha quitado la asignación de la ubicación." });
            await fetchItemData(selectedProductId);
        } catch (error: any) {
             logError("Failed to unassign location from item", { error });
            toast({ title: "Error al Remover", description: `No se pudo quitar la ubicación. ${error.message}`, variant: "destructive" });
        }
    };

    const renderCurrentInventory = () => {
        const hasInventory = warehouseSettings?.enablePhysicalInventoryTracking ? inventory.length > 0 : itemLocations.length > 0;
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Ubicaciones Actuales del Artículo</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-48">
                        {hasInventory ? (
                            <ul className="space-y-2">
                                {warehouseSettings?.enablePhysicalInventoryTracking ? (
                                    inventory.map(item => (
                                        <li key={item.id} className="flex justify-between items-center p-2 border rounded-md">
                                            <span>{locations.find(l => l.id === item.locationId)?.code || 'Ubicación desconocida'}</span>
                                            <span className="font-bold">{item.quantity}</span>
                                        </li>
                                    ))
                                ) : (
                                     itemLocations.map(item => (
                                        <li key={item.id} className="flex justify-between items-center p-2 border rounded-md">
                                            <span>{locations.find(l => l.id === item.locationId)?.name || 'Ubicación desconocida'} ({locations.find(l => l.id === item.locationId)?.code})</span>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleUnassign(item.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                {selectedProductId ? "Este artículo no tiene ubicaciones asignadas." : "Selecciona un artículo para ver sus ubicaciones."}
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>
        );
    }
    
    const renderAdvancedMode = () => (
        <Card>
            <form onSubmit={(e) => { e.preventDefault(); handleMoveSubmit(); }}>
                <CardHeader>
                    <CardTitle>Asignar o Mover Inventario</CardTitle>
                    <CardDescription>
                        Selecciona una ubicación de origen (opcional) y una de destino para mover el inventario.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                            <div className="col-span-1 sm:col-span-2">
                                <Label>Desde (Origen)</Label>
                                <SearchInput
                                    options={fromLocationOptions}
                                    onSelect={(value) => { setFromLocationId(value); setFromLocationSearchTerm(locations.find(l => String(l.id) === value)?.name || ''); setFromLocationSearchOpen(false); }}
                                    value={fromLocationSearchTerm}
                                    onValueChange={setFromLocationSearchTerm}
                                    placeholder="Ninguno"
                                    open={isFromLocationSearchOpen}
                                    onOpenChange={setFromLocationSearchOpen}
                                />
                            </div>
                            <div className="col-span-1 text-center pt-6">
                                <ArrowRight className="h-6 w-6 mx-auto text-muted-foreground" />
                            </div>
                            <div className="col-span-1 sm:col-span-2">
                                <Label>Hacia (Destino)</Label>
                                <SearchInput
                                    options={toLocationOptions}
                                    onSelect={(value) => { setToLocationId(value); setToLocationSearchTerm(locations.find(l => String(l.id) === value)?.name || ''); setToLocationSearchOpen(false); }}
                                    value={toLocationSearchTerm}
                                    onValueChange={setToLocationSearchTerm}
                                    placeholder="Selecciona destino"
                                    open={isToLocationSearchOpen}
                                    onOpenChange={setToLocationSearchOpen}
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="quantity">Cantidad a Mover</Label>
                        <Input
                            id="quantity"
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            required
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={isSubmitting || !selectedProductId}>
                        {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <PackageSearch className="mr-2" />}
                        Confirmar Movimiento
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );

    const renderSimpleMode = () => (
        <Card>
            <form onSubmit={(e) => { e.preventDefault(); handleAssignSubmit(); }}>
                <CardHeader>
                    <CardTitle>Asignar Ubicación</CardTitle>
                    <CardDescription>
                       Selecciona una ubicación para asociarla con este artículo. Puedes asignar varias.
                    </CardDescription>
                </CardHeader>
                 <CardContent>
                     <Label>Nueva Ubicación a Asignar</Label>
                     <SearchInput
                        options={newLocationOptions}
                        onSelect={(value) => { setNewLocationId(value); setNewLocationSearchTerm(locations.find(l => String(l.id) === value)?.name || ''); setNewLocationSearchOpen(false); }}
                        value={newLocationSearchTerm}
                        onValueChange={setNewLocationSearchTerm}
                        placeholder="Selecciona una ubicación..."
                        open={isNewLocationSearchOpen}
                        onOpenChange={setNewLocationSearchOpen}
                    />
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={isSubmitting || !selectedProductId}>
                        {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <PackageSearch className="mr-2" />}
                        Asignar Ubicación
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                 <div className="grid gap-8 md:grid-cols-3">
                    <div className="md:col-span-1 space-y-6">
                        <Skeleton className="h-40 w-full" />
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
            <div className="grid gap-8 md:grid-cols-3">
                <div className="md:col-span-1 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Seleccionar Artículo</CardTitle>
                            <CardDescription>Busca el artículo al que deseas asignar una ubicación.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <SearchInput
                                options={productOptions}
                                onSelect={handleSelectProduct}
                                value={productSearchTerm}
                                onValueChange={setProductSearchTerm}
                                placeholder="Selecciona un artículo..."
                                open={isProductSearchOpen}
                                onOpenChange={setProductSearchOpen}
                            />
                        </CardContent>
                    </Card>
                    {renderCurrentInventory()}
                </div>

                <div className="md:col-span-2">
                    { !warehouseSettings?.enablePhysicalInventoryTracking && (
                         <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 mb-6">
                            <Info className="h-5 w-5"/>
                            <p className="text-sm">El modo de control de inventario físico está desactivado. Solo se pueden asignar ubicaciones, no cantidades.</p>
                        </div>
                    )}
                   {warehouseSettings?.enablePhysicalInventoryTracking ? renderAdvancedMode() : renderSimpleMode()}
                </div>
            </div>
             {isSubmitting && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-primary p-3 text-primary-foreground shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Procesando...</span>
                </div>
            )}
        </main>
    );
}
