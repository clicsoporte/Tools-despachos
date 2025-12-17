/**
 * @fileoverview Page for managing individual inventory units (pallets, boxes, etc.).
 * Allows creation of unique trackable units, assignment to products and locations,
 * and printing of QR code labels.
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
import { getLocations, addInventoryUnit, getInventoryUnits, deleteInventoryUnit } from '@/modules/warehouse/lib/actions';
import type { Product, WarehouseLocation, InventoryUnit } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { Loader2, Trash2, PlusCircle, Printer } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import jsPDF from "jspdf";
import QRCode from 'qrcode';
import { format } from 'date-fns';

const initialNewUnitState = {
    productId: '',
    humanReadableId: '',
    locationId: null as number | null,
    notes: ''
};

export default function ManageUnitsPage() {
    useAuthorization(['warehouse:units:manage']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products: authProducts } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [products, setProducts] = useState<Product[]>([]);
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [inventoryUnits, setInventoryUnits] = useState<InventoryUnit[]>([]);
    
    const [newUnit, setNewUnit] = useState(initialNewUnitState);

    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isProductSearchOpen, setProductSearchOpen] = useState(false);
    const [locationSearchTerm, setLocationSearchTerm] = useState('');
    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);

    const [debouncedProductSearch] = useDebounce(productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedLocationSearch] = useDebounce(locationSearchTerm, 300);

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [locs, units] = await Promise.all([
                getLocations(),
                getInventoryUnits(),
            ]);
            setProducts(authProducts.filter(p => p.active === 'S'));
            setLocations(locs);
            setInventoryUnits(units);
        } catch (error) {
            logError("Failed to load data for units page", { error });
            toast({ title: "Error de Carga", description: "No se pudieron cargar los datos necesarios.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast, authProducts]);
    
    useEffect(() => {
        setTitle("Gestión de Unidades de Inventario");
        loadInitialData();
    }, [setTitle, loadInitialData]);

    const productOptions = useMemo(() =>
        debouncedProductSearch.length < 2 ? [] : products
            .filter(p => p.id.toLowerCase().includes(debouncedProductSearch.toLowerCase()) || p.description.toLowerCase().includes(debouncedProductSearch.toLowerCase()))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` })),
        [products, debouncedProductSearch]
    );

    const locationOptions = useMemo(() => {
        const searchTerm = debouncedLocationSearch.trim().toLowerCase();
        if (searchTerm === '*' || searchTerm === '') {
            return locations.map(l => ({ value: String(l.id), label: `${l.code} (${l.name})` }));
        }
        return locations
            .filter(l => l.name.toLowerCase().includes(searchTerm) || l.code.toLowerCase().includes(searchTerm))
            .map(l => ({ value: String(l.id), label: `${l.code} (${l.name})` }));
    }, [locations, debouncedLocationSearch]);

    const handleSelectProduct = (value: string) => {
        setProductSearchOpen(false);
        const product = products.find(p => p.id === value);
        if (product) {
            setNewUnit(prev => ({ ...prev, productId: value }));
            setProductSearchTerm(`[${product.id}] ${product.description}`);
        }
    };
    
    const handleSelectLocation = (value: string) => {
        setIsLocationSearchOpen(false);
        const location = locations.find(l => String(l.id) === value);
        if (location) {
            setNewUnit(prev => ({ ...prev, locationId: Number(value) }));
            setLocationSearchTerm(`${location.code} (${location.name})`);
        }
    };

    const handleCreateUnit = async () => {
        if (!newUnit.productId || !newUnit.locationId) {
            toast({ title: "Datos Incompletos", description: "Debe seleccionar un producto y una ubicación.", variant: "destructive" });
            return;
        }
        if (!user) {
             toast({ title: "Error de Autenticación", description: "No se pudo identificar al usuario.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const createdUnit = await addInventoryUnit({ ...newUnit, createdBy: user.name });
            setInventoryUnits(prev => [createdUnit, ...prev]);
            
            toast({ title: "Unidad Creada", description: `Se ha creado la unidad ${createdUnit.unitCode} para ${createdUnit.productId}.` });
            logInfo('Inventory unit created', { unitCode: createdUnit.unitCode, productId: createdUnit.productId });
            
            // Reset form
            setNewUnit(initialNewUnitState);
            setProductSearchTerm('');
            setLocationSearchTerm('');

        } catch(e: any) {
            logError('Failed to create inventory unit', { error: e.message });
            toast({ title: "Error", description: `No se pudo crear la unidad. ${e.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUnit = async (id: number) => {
        setIsSubmitting(true);
        try {
            await deleteInventoryUnit(id);
            setInventoryUnits(prev => prev.filter(u => u.id !== id));
            toast({ title: "Unidad Eliminada", variant: "destructive" });
        } catch(e: any) {
             logError('Failed to delete inventory unit', { error: e.message });
            toast({ title: "Error", description: `No se pudo eliminar la unidad. ${e.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrintLabel = async (unit: InventoryUnit) => {
        const product = products.find(p => p.id === unit.productId);
        const location = locations.find(l => l.id === unit.locationId);
        
        const scanUrl = `${window.location.origin}/dashboard/scanner?unitId=${unit.unitCode}`;
        
        try {
            const qrCodeDataUrl = await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: 'H', width: 200 });

            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'in',
                format: [4, 3] // 4x3 inch label
            });

            doc.addImage(qrCodeDataUrl, 'PNG', 0.2, 0.2, 1.5, 1.5);
            
            doc.setFontSize(14);
            doc.setFont('Helvetica', 'bold');
            doc.text(`Producto: ${product?.id || 'N/A'}`, 1.8, 0.4);
            
            doc.setFontSize(10);
            doc.setFont('Helvetica', 'normal');
            const descLines = doc.splitTextToSize(product?.description || 'Descripción no disponible', 1.9);
            doc.text(descLines, 1.8, 0.6);

            doc.setFontSize(12);
            doc.setFont('Helvetica', 'bold');
            doc.text(`Lote/ID: ${unit.humanReadableId || 'N/A'}`, 1.8, 1.3);

            doc.setFontSize(10);
            doc.text(`Ubicación Sugerida:`, 0.2, 2.0);
            doc.setFontSize(12);
            doc.setFont('Helvetica', 'bold');
            doc.text(`${location?.code || 'N/A'} - ${location?.name || 'N/A'}`, 0.2, 2.2);

            doc.setFontSize(8);
            doc.text(`ID Interno: ${unit.unitCode}`, 0.2, 2.8);
            doc.text(`Creado: ${format(new Date(unit.createdAt), 'dd/MM/yyyy')}`, 1.8, 2.8);

            doc.save(`etiqueta_unidad_${unit.unitCode}.pdf`);

        } catch (err) {
            console.error(err);
            toast({ title: 'Error al generar QR', description: 'No se pudo crear la imagen del código QR.', variant: 'destructive'});
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
            <div className="mx-auto max-w-5xl space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Nueva Unidad de Inventario</CardTitle>
                        <CardDescription>Crea un identificador único (tarima, lote, caja) para un producto, asígnale una ubicación y genera su etiqueta QR.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>1. Producto <span className="text-destructive">*</span></Label>
                                <SearchInput options={productOptions} onSelect={handleSelectProduct} value={productSearchTerm} onValueChange={setProductSearchTerm} placeholder="Buscar producto..." open={isProductSearchOpen} onOpenChange={setProductSearchOpen} />
                            </div>
                             <div className="space-y-2">
                                <Label>2. Ubicación <span className="text-destructive">*</span></Label>
                                <SearchInput options={locationOptions} onSelect={handleSelectLocation} value={locationSearchTerm} onValueChange={setLocationSearchTerm} placeholder="Buscar... ('*' o vacío para ver todas)" open={isLocationSearchOpen} onOpenChange={setIsLocationSearchOpen} />
                            </div>
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="human-id">3. Identificador Humano (Lote/Tarima)</Label>
                                <Input id="human-id" value={newUnit.humanReadableId} onChange={(e) => setNewUnit(prev => ({ ...prev, humanReadableId: e.target.value }))} placeholder="Ej: LOTE-2024-10-A"/>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="notes">4. Notas (Opcional)</Label>
                                <Textarea id="notes" value={newUnit.notes} onChange={(e) => setNewUnit(prev => ({ ...prev, notes: e.target.value }))} placeholder="Ej: Media tarima, producto de alta rotación"/>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleCreateUnit} disabled={isSubmitting || !newUnit.productId || !newUnit.locationId}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Crear Unidad
                        </Button>
                    </CardFooter>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Unidades Creadas Recientemente</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-muted">
                                    <tr className="text-left">
                                        <th className="p-2">ID Unidad</th>
                                        <th className="p-2">Producto</th>
                                        <th className="p-2">ID Humano</th>
                                        <th className="p-2">Ubicación</th>
                                        <th className="p-2">Creado</th>
                                        <th className="p-2 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventoryUnits.map(unit => {
                                        const product = products.find(p => p.id === unit.productId);
                                        const location = locations.find(l => l.id === unit.locationId);
                                        return (
                                            <tr key={unit.id} className="border-b">
                                                <td className="p-2 font-mono">{unit.unitCode}</td>
                                                <td className="p-2">
                                                    <div className="font-medium">{product?.description || 'N/A'}</div>
                                                    <div className="text-xs text-muted-foreground">{unit.productId}</div>
                                                </td>
                                                <td className="p-2 font-mono">{unit.humanReadableId || '-'}</td>
                                                <td className="p-2">{location ? `${location.code} (${location.name})` : 'N/A'}</td>
                                                <td className="p-2 text-xs text-muted-foreground">
                                                    <div>{unit.createdBy}</div>
                                                    <div>{format(new Date(unit.createdAt), 'dd/MM/yyyy HH:mm')}</div>
                                                </td>
                                                <td className="p-2 text-right">
                                                    <Button variant="outline" size="sm" onClick={() => handlePrintLabel(unit)}><Printer className="mr-2 h-4 w-4"/>Imprimir</Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteUnit(unit.id)} disabled={isSubmitting}>
                                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                             {inventoryUnits.length === 0 && (
                                <div className="text-center py-10 text-muted-foreground">No hay unidades de inventario creadas.</div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
