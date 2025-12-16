/**
 * @fileoverview Page for assigning items to warehouse locations, optionally linked to a customer.
 * This component allows users to create a catalog of where items are stored.
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
import { getWarehouseData, assignItemToLocation, unassignItemFromLocation } from '@/modules/warehouse/lib/actions';
import type { Product, WarehouseLocation, ItemLocation, Customer } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { Loader2, Trash2 } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Skeleton } from '@/components/ui/skeleton';

export default function AssignInventoryPage() {
    useAuthorization(['warehouse:inventory:assign']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products: authProducts, customers: authCustomers } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [itemLocations, setItemLocations] = useState<ItemLocation[]>([]);
    
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isProductSearchOpen, setProductSearchOpen] = useState(false);
    const [customerSearchTerm, setCustomerSearchTerm] = useState('');
    const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
    const [locationSearchTerm, setLocationSearchTerm] = useState('');
    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);

    const [debouncedProductSearch] = useDebounce(productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedCustomerSearch] = useDebounce(customerSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedLocationSearch] = useDebounce(locationSearchTerm, 300);

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const wData = await getWarehouseData();
            setProducts(authProducts.filter(p => p.active === 'S'));
            setCustomers(authCustomers.filter(c => c.active === 'S'));
            setLocations(wData.locations);
            setItemLocations(wData.itemLocations);
        } catch (error) {
            logError("Failed to load data for assignment page", { error });
            toast({ title: "Error de Carga", description: "No se pudieron cargar los datos necesarios.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast, authProducts, authCustomers]);
    
    useEffect(() => {
        setTitle("Asignar Artículo a Cliente/Ubicación");
        loadInitialData();
    }, [setTitle, loadInitialData]);

    const productOptions = useMemo(() =>
        debouncedProductSearch.length < 2 ? [] : products
            .filter(p => p.id.toLowerCase().includes(debouncedProductSearch.toLowerCase()) || p.description.toLowerCase().includes(debouncedProductSearch.toLowerCase()))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` })),
        [products, debouncedProductSearch]
    );

    const customerOptions = useMemo(() =>
        debouncedCustomerSearch.length < 2 ? [] : customers
            .filter(c => c.id.toLowerCase().includes(debouncedCustomerSearch.toLowerCase()) || c.name.toLowerCase().includes(debouncedCustomerSearch.toLowerCase()))
            .map(c => ({ value: c.id, label: `[${c.id}] ${c.name}` })),
        [customers, debouncedCustomerSearch]
    );

    const locationOptions = useMemo(() => {
        const searchTerm = debouncedLocationSearch.trim();
        if (searchTerm === '*' || searchTerm === '') {
            return locations.map(l => ({ value: String(l.id), label: `${l.code} (${l.name})` }));
        }
        return locations
            .filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.code.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(l => ({ value: String(l.id), label: `${l.code} (${l.name})` }));
    }, [locations, debouncedLocationSearch]);

    const handleSelectProduct = (value: string) => {
        setProductSearchOpen(false);
        const product = products.find(p => p.id === value);
        if (product) {
            setSelectedProductId(value);
            setProductSearchTerm(`[${product.id}] ${product.description}`);
        }
    };
    
    const handleSelectCustomer = (value: string) => {
        setIsCustomerSearchOpen(false);
        const customer = customers.find(c => c.id === value);
        if (customer) {
            setSelectedCustomerId(value);
            setCustomerSearchTerm(`[${customer.id}] ${customer.name}`);
        }
    };
    
    const handleSelectLocation = (value: string) => {
        setIsLocationSearchOpen(false);
        const location = locations.find(l => String(l.id) === value);
        if (location) {
            setSelectedLocationId(value);
            setLocationSearchTerm(`${location.code} (${location.name})`);
        }
    };

    const handleAssign = async () => {
        if (!selectedProductId || !selectedLocationId) {
            toast({ title: "Datos Incompletos", description: "Debe seleccionar un producto y una ubicación.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            await assignItemToLocation(selectedProductId, parseInt(selectedLocationId, 10), selectedCustomerId);
            
            const wData = await getWarehouseData();
            setItemLocations(wData.itemLocations);

            const productName = products.find(p => p.id === selectedProductId)?.description || selectedProductId;
            const locationName = locations.find(l => String(l.id) === selectedLocationId)?.name || selectedLocationId;
            const customerName = selectedCustomerId ? (customers.find(c => c.id === selectedCustomerId)?.name || selectedCustomerId) : null;
            
            const successMessage = customerName 
                ? `Artículo '${productName}' asignado a ${customerName} en la ubicación ${locationName}.`
                : `Artículo '${productName}' asignado a la ubicación ${locationName}.`;
            
            toast({ title: "Asignación Creada", description: successMessage });
            logInfo('Item location assigned', { itemId: selectedProductId, locationId: selectedLocationId, clientId: selectedCustomerId });
            
            // Optionally reset some fields after assignment
            // setSelectedProductId(null);
            // setProductSearchTerm('');

        } catch(e: any) {
            logError('Failed to assign item location', { error: e.message });
            toast({ title: "Error", description: `No se pudo crear la asignación. ${e.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUnassign = async (itemLocationId: number) => {
        setIsSubmitting(true);
        try {
            await unassignItemFromLocation(itemLocationId);
            const wData = await getWarehouseData();
            setItemLocations(wData.itemLocations);
            toast({ title: "Asignación Eliminada", variant: "destructive" });
        } catch(e: any) {
             logError('Failed to unassign item location', { error: e.message });
            toast({ title: "Error", description: `No se pudo eliminar la asignación. ${e.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const currentAssignments = useMemo(() => {
        return itemLocations
            .map(il => {
                const product = products.find(p => p.id === il.itemId);
                const customer = il.clientId ? customers.find(c => c.id === il.clientId) : null;
                const location = locations.find(l => l.id === il.locationId);
                return { ...il, product, customer, location };
            })
            .filter(il => il.product && il.location) // Only show valid assignments
            .sort((a,b) => (a.customer?.name || '').localeCompare(b.customer?.name || '') || a.product!.id.localeCompare(b.product!.id));
    }, [itemLocations, products, customers, locations]);
    
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
            <div className="mx-auto max-w-5xl space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Asignar Artículo a Cliente y Ubicación</CardTitle>
                        <CardDescription>Cree un catálogo de productos por cliente y asigne su ubicación física en el almacén.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>1. Seleccione un Producto</Label>
                                <SearchInput options={productOptions} onSelect={handleSelectProduct} value={productSearchTerm} onValueChange={setProductSearchTerm} placeholder="Buscar producto..." open={isProductSearchOpen} onOpenChange={setProductSearchOpen} />
                            </div>
                             <div className="space-y-2">
                                <Label>2. Seleccione un Cliente (Opcional)</Label>
                                <SearchInput options={customerOptions} onSelect={handleSelectCustomer} value={customerSearchTerm} onValueChange={setCustomerSearchTerm} placeholder="Buscar cliente..." open={isCustomerSearchOpen} onOpenChange={setIsCustomerSearchOpen} />
                            </div>
                            <div className="space-y-2">
                                <Label>3. Seleccione una Ubicación</Label>
                                <SearchInput options={locationOptions} onSelect={handleSelectLocation} value={locationSearchTerm} onValueChange={setLocationSearchTerm} placeholder="Buscar o '*' para ver todas..." open={isLocationSearchOpen} onOpenChange={setIsLocationSearchOpen} />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleAssign} disabled={isSubmitting || !selectedProductId || !selectedLocationId}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Crear Asignación
                        </Button>
                    </CardFooter>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Asignaciones Actuales</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-muted">
                                    <tr>
                                        <th className="p-2 text-left">Producto</th>
                                        <th className="p-2 text-left">Cliente</th>
                                        <th className="p-2 text-left">Ubicación</th>
                                        <th className="p-2 text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentAssignments.map(item => (
                                        <tr key={item.id} className="border-b">
                                            <td className="p-2">
                                                <div className="font-medium">{item.product?.description}</div>
                                                <div className="text-xs text-muted-foreground">{item.product?.id}</div>
                                            </td>
                                            <td className="p-2">{item.customer ? item.customer.name : <span className="text-muted-foreground italic">General</span>}</td>
                                            <td className="p-2">{item.location?.name} ({item.location?.code})</td>
                                            <td className="p-2 text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleUnassign(item.id)} disabled={isSubmitting}>
                                                    <Trash2 className="h-4 w-4 text-destructive"/>
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                             {currentAssignments.length === 0 && (
                                <div className="text-center py-10 text-muted-foreground">No hay asignaciones.</div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
