/**
 * @fileoverview Page for associating products with clients and warehouse locations.
 * This tool allows users to create a catalog-like mapping, indicating where
 * a specific client's product should be stored.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getLocations, getItemLocations, assignItemToLocation, unassignItemFromLocation } from '@/modules/warehouse/lib/actions';
import type { Product, Customer, WarehouseLocation, ItemLocation } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { Loader2, Trash2, Printer } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';


const renderLocationPathAsString = (locationId: number, locations: WarehouseLocation[]): string => {
    if (!locationId) return "Sin ubicación";
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
    while (current) {
        path.unshift(current);
        const parentId = current.parentId;
        current = parentId ? locations.find(l => l.id === parentId) : undefined;
    }
    return path.map(l => l.name).join(' > ');
};

export default function AssignItemPage() {
    useAuthorization(['warehouse:inventory:assign']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products: authProducts, customers: authCustomers } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [assignments, setAssignments] = useState<ItemLocation[]>([]);
    
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isProductSearchOpen, setProductSearchOpen] = useState(false);
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
    const [locationSearchTerm, setLocationSearchTerm] = useState('');
    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);

    const [debouncedProductSearch] = useDebounce(productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedClientSearch] = useDebounce(clientSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedLocationSearch] = useDebounce(locationSearchTerm, 300);

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [locs] = await Promise.all([getLocations()]);
            setLocations(locs);
        } catch (error) {
            logError("Failed to load data for assignment page", { error });
            toast({ title: "Error de Carga", description: "No se pudieron cargar los datos necesarios.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        setTitle("Asignar Artículo a Cliente/Ubicación");
        loadInitialData();
    }, [setTitle, loadInitialData]);

    const productOptions = useMemo(() =>
        debouncedProductSearch.length < 2 ? [] : authProducts
            .filter(p => p.id.toLowerCase().includes(debouncedProductSearch.toLowerCase()) || p.description.toLowerCase().includes(debouncedProductSearch.toLowerCase()))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` })),
        [authProducts, debouncedProductSearch]
    );

    const clientOptions = useMemo(() =>
        debouncedClientSearch.length < 2 ? [] : authCustomers
            .filter(c => c.id.toLowerCase().includes(debouncedClientSearch.toLowerCase()) || c.name.toLowerCase().includes(debouncedClientSearch.toLowerCase()))
            .map(c => ({ value: c.id, label: `[${c.id}] ${c.name}` })),
        [authCustomers, debouncedClientSearch]
    );

    const locationOptions = useMemo(() => {
        const searchTerm = debouncedLocationSearch.trim().toLowerCase();
        if (searchTerm === '*' || searchTerm === '') {
            return locations.map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, locations) }));
        }
        return locations
            .filter(l => renderLocationPathAsString(l.id, locations).toLowerCase().includes(searchTerm))
            .map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, locations) }));
    }, [locations, debouncedLocationSearch]);

    useEffect(() => {
        if (selectedProductId) {
            getItemLocations(selectedProductId).then(setAssignments);
        } else {
            setAssignments([]);
        }
    }, [selectedProductId]);


    const handleSelectProduct = (value: string) => {
        setProductSearchOpen(false);
        const product = authProducts.find(p => p.id === value);
        if (product) {
            setSelectedProductId(value);
            setProductSearchTerm(`[${product.id}] ${product.description}`);
        }
    };
    
    const handleSelectClient = (value: string) => {
        setIsClientSearchOpen(false);
        const client = authCustomers.find(c => c.id === value);
        if (client) {
            setSelectedClientId(value);
            setClientSearchTerm(`[${client.id}] ${client.name}`);
        } else {
            setSelectedClientId(null);
            setClientSearchTerm('');
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

    const handleCreateAssignment = async () => {
        if (!selectedProductId || !selectedLocationId) {
            toast({ title: "Datos Incompletos", description: "Debe seleccionar un producto y una ubicación.", variant: "destructive" });
            return;
        }
        if (!user) return;

        setIsSubmitting(true);
        try {
            const newAssignment = await assignItemToLocation(selectedProductId, parseInt(selectedLocationId, 10), selectedClientId);
            setAssignments(prev => [...prev, newAssignment]);
            
            toast({ title: "Asignación Creada", description: "La asociación entre producto, cliente y ubicación ha sido guardada." });
            logInfo('Item location assignment created', { itemId: selectedProductId, locationId: selectedLocationId, clientId: selectedClientId, user: user.name });
            
            // Reset selectors for next assignment, keeping the product selected
            setSelectedClientId(null);
            setSelectedLocationId(null);
            setClientSearchTerm('');
            setLocationSearchTerm('');

        } catch(e: any) {
            logError('Failed to save item assignment', { error: e.message });
            toast({ title: "Error al Asignar", description: `No se pudo guardar la asignación. ${e.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteAssignment = async (assignmentId: number) => {
        setIsSubmitting(true);
        try {
            await unassignItemFromLocation(assignmentId);
            setAssignments(prev => prev.filter(a => a.id !== assignmentId));
            toast({ title: "Asignación Eliminada", variant: "destructive" });
        } catch (e: any) {
            logError('Failed to delete item assignment', { error: e.message });
            toast({ title: "Error al Eliminar", description: `No se pudo eliminar la asignación. ${e.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrintRackLabel = async (assignment: ItemLocation) => {
        const product = authProducts.find(p => p.id === assignment.itemId);
        const client = authCustomers.find(c => c.id === assignment.clientId);
        const locationString = renderLocationPathAsString(assignment.locationId, locations);
    
        if (!product) {
          toast({ title: "Error", description: "No se encontró el producto para esta asignación.", variant: "destructive" });
          return;
        }
    
        try {
          const { default: jsPDF } = await import('jspdf');
          const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
    
          // --- Main Product Code ---
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(150);
          const productCodeLines = doc.splitTextToSize(product.id, pageWidth - 80);
          doc.text(productCodeLines, pageWidth / 2, pageHeight / 2 - 60, { align: "center" });
    
          // --- Product Description ---
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(24);
          const descriptionLines = doc.splitTextToSize(product.description, pageWidth - 80);
          doc.text(descriptionLines, pageWidth / 2, pageHeight / 2 + (productCodeLines.length * 50), { align: "center" });
    
          // --- Bottom Information ---
          const bottomY = pageHeight - 40;
          doc.setFontSize(12);
          
          // Client Info
          if (client) {
            doc.setFont("Helvetica", "bold");
            doc.text("Cliente:", 40, bottomY - 40);
            doc.setFont("Helvetica", "normal");
            doc.text(client.name, 95, bottomY - 40);
          }
          
          // Location Info
          doc.setFont("Helvetica", "bold");
          doc.text("Ubicación:", 40, bottomY - 20);
          doc.setFont("Helvetica", "normal");
          doc.text(locationString, 105, bottomY - 20);
    
          // Date Info
          doc.setFontSize(9);
          doc.setTextColor(150);
          doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - 40, bottomY, { align: "right" });
    
          doc.save(`etiqueta_rack_${product.id}.pdf`);
        } catch (error: any) {
          logError('Failed to generate rack label', { error });
          toast({ title: "Error al generar PDF", description: "No se pudo crear la etiqueta.", variant: "destructive" });
        }
      };
    
    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                 <Skeleton className="h-96 w-full max-w-4xl mx-auto" />
            </main>
        )
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-8">
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
                                <SearchInput options={clientOptions} onSelect={handleSelectClient} value={clientSearchTerm} onValueChange={setClientSearchTerm} placeholder="Buscar cliente..." open={isClientSearchOpen} onOpenChange={setIsClientSearchOpen} />
                            </div>
                            <div className="space-y-2">
                                <Label>3. Seleccione una Ubicación</Label>
                                <SearchInput options={locationOptions} onSelect={handleSelectLocation} value={locationSearchTerm} onValueChange={setLocationSearchTerm} placeholder="Buscar o '*' para ver todas..." open={isLocationSearchOpen} onOpenChange={setIsLocationSearchOpen} />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleCreateAssignment} disabled={isSubmitting || !selectedProductId || !selectedLocationId}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Crear Asignación
                        </Button>
                    </CardFooter>
                </Card>

                 {selectedProductId && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Asignaciones Actuales para: {productSearchTerm}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Producto</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Ubicación</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {assignments.map(a => {
                                        const product = authProducts.find(p => p.id === a.itemId);
                                        const client = authCustomers.find(c => c.id === a.clientId);
                                        const locationString = renderLocationPathAsString(a.locationId, locations);
                                        return (
                                            <TableRow key={a.id}>
                                                <TableCell className="font-medium">
                                                    <div>{product?.description}</div>
                                                    <div className="text-xs text-muted-foreground">{product?.id}</div>
                                                </TableCell>
                                                <TableCell>{client?.name || <span className="italic text-muted-foreground">General</span>}</TableCell>
                                                <TableCell>{locationString}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => handlePrintRackLabel(a)}>
                                                        <Printer className="h-4 w-4 text-blue-600" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteAssignment(a.id)} disabled={isSubmitting}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {assignments.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground">No hay asignaciones para este producto.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
    );
}
