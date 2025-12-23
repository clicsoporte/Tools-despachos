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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getLocations, getAllItemLocations, assignItemToLocation, unassignItemFromLocation } from '@/modules/warehouse/lib/actions';
import type { Product, Customer, WarehouseLocation, ItemLocation } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { Loader2, Trash2, Printer, List, PlusCircle, Search } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import jsPDF from "jspdf";
import QRCode from 'qrcode';

const renderLocationPathAsString = (locationId: number, locations: WarehouseLocation[]): string => {
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
    while (current) {
        path.unshift(current);
        current = current.parentId ? locations.find(l => l.id === current.parentId) : undefined;
    }
    return path.map(l => l.name).join(' > ');
};

const getSelectableLocations = (allLocations: WarehouseLocation[]) => {
    const parentIds = new Set(allLocations.map(l => l.parentId).filter(Boolean));
    return allLocations.filter(l => !parentIds.has(l.id));
};

const ROWS_PER_PAGE = 25;

export default function AssignItemPage() {
    useAuthorization(['warehouse:inventory:assign']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products: authProducts, customers: authCustomers } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [allAssignments, setAllAssignments] = useState<ItemLocation[]>([]);
    
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const [exactProductMatch, setExactProductMatch] = useState(true);
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
    const [locationSearchTerm, setLocationSearchTerm] = useState('');
    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);
    
    const [globalFilter, setGlobalFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(0);

    const [debouncedProductSearch] = useDebounce(productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedClientSearch] = useDebounce(clientSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedLocationSearch] = useDebounce(locationSearchTerm, 300);
    const [debouncedGlobalFilter] = useDebounce(globalFilter, 500);

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [locs, allAssigns] = await Promise.all([getLocations(), getAllItemLocations()]);
            setLocations(locs);
            setAllAssignments(allAssigns.sort((a, b) => b.id - a.id)); // Sort by most recent
        } catch (error) {
            logError("Failed to load data for assignment page", { error });
            toast({ title: "Error de Carga", description: "No se pudieron cargar los datos necesarios.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        setTitle("Catálogo de Ubicaciones por Artículo");
        loadInitialData();
    }, [setTitle, loadInitialData]);

    const productOptions = useMemo(() => {
        if (!debouncedProductSearch) return [];
        const searchLower = debouncedProductSearch.toLowerCase();
        
        if (exactProductMatch) {
            return authProducts
                .filter(p => p.id.toLowerCase() === searchLower)
                .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
        }

        if (debouncedProductSearch.length < 2) return [];

        return authProducts
            .filter(p => p.id.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
    }, [authProducts, debouncedProductSearch, exactProductMatch]);

    const clientOptions = useMemo(() =>
        debouncedClientSearch.length < 2 ? [] : authCustomers
            .filter(c => c.id.toLowerCase().includes(debouncedClientSearch.toLowerCase()) || c.name.toLowerCase().includes(debouncedClientSearch.toLowerCase()))
            .map(c => ({ value: c.id, label: `[${c.id}] ${c.name}` })),
        [authCustomers, debouncedClientSearch]
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
    
    const resetForm = useCallback(() => {
        setSelectedProductId(null);
        setSelectedClientId(null);
        setSelectedLocationId(null);
        setProductSearchTerm('');
        setClientSearchTerm('');
        setLocationSearchTerm('');
        setExactProductMatch(true);
    }, []);

    const handleCreateAssignment = async () => {
        if (!selectedProductId || !selectedLocationId) {
            toast({ title: "Datos Incompletos", description: "Debe seleccionar un producto y una ubicación.", variant: "destructive" });
            return;
        }
        if (!user) return;

        setIsSubmitting(true);
        try {
            const newAssignment = await assignItemToLocation(selectedProductId, parseInt(selectedLocationId, 10), selectedClientId);
            setAllAssignments(prev => [newAssignment, ...prev]);
            
            toast({ title: "Asignación Creada", description: "La asociación ha sido guardada." });
            logInfo('Item location assignment created', { itemId: selectedProductId, locationId: selectedLocationId, clientId: selectedClientId, user: user.name });
            
            setIsFormOpen(false);
            resetForm();

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
            setAllAssignments(prev => prev.filter(a => a.id !== assignmentId));
            toast({ title: "Asignación Eliminada", variant: "destructive" });
        } catch (e: any) {
            logError('Failed to delete item assignment', { error: e.message });
            toast({ title: "Error al Eliminar", description: `No se pudo eliminar la asignación. ${e.message}`, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const filteredAssignments = useMemo(() => {
        if (!debouncedGlobalFilter) {
            return allAssignments;
        }
        const lowerCaseFilter = debouncedGlobalFilter.toLowerCase();
        return allAssignments.filter(a => {
            const product = authProducts.find(p => p.id === a.itemId);
            const client = authCustomers.find(c => c.id === a.clientId);
            const locationString = renderLocationPathAsString(a.locationId, locations);

            return (
                product?.id.toLowerCase().includes(lowerCaseFilter) ||
                product?.description.toLowerCase().includes(lowerCaseFilter) ||
                client?.name.toLowerCase().includes(lowerCaseFilter) ||
                locationString.toLowerCase().includes(lowerCaseFilter)
            );
        });
    }, [allAssignments, debouncedGlobalFilter, authProducts, authCustomers, locations]);
    
    const paginatedAssignments = useMemo(() => {
        const start = currentPage * ROWS_PER_PAGE;
        const end = start + ROWS_PER_PAGE;
        return filteredAssignments.slice(start, end);
    }, [filteredAssignments, currentPage]);

    const totalPages = Math.ceil(filteredAssignments.length / ROWS_PER_PAGE);

    const handlePrintRackLabel = async (assignment: ItemLocation) => {
        const product = authProducts.find(p => p.id === assignment.itemId);
        const client = authCustomers.find(c => c.id === assignment.clientId);
        const locationString = renderLocationPathAsString(assignment.locationId, locations);
    
        if (!product) {
          toast({ title: "Error", description: "No se encontró el producto para esta asignación.", variant: "destructive" });
          return;
        }
    
        try {
            const scanUrl = `${window.location.origin}/dashboard/scanner?locationId=${assignment.locationId}&productId=${product.id}`;
            const qrCodeDataUrl = await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: 'H', width: 200 });
            
            const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
    
            doc.addImage(qrCodeDataUrl, 'PNG', 40, 40, 100, 100);

            doc.setFont("Helvetica", "bold");
            doc.setFontSize(150);
            const productCodeLines = doc.splitTextToSize(product.id, pageWidth - 80);
            doc.text(productCodeLines, pageWidth / 2, pageHeight / 2 - 60, { align: "center" });
    
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(24);
            const descriptionLines = doc.splitTextToSize(product.description, pageWidth - 80);
            doc.text(descriptionLines, pageWidth / 2, pageHeight / 2 + (productCodeLines.length * 50), { align: "center" });
    
            const bottomY = pageHeight - 40;
            doc.setFontSize(12);
            
            if (client) {
              doc.setFont("Helvetica", "bold");
              doc.text("Cliente:", 40, bottomY - 40);
              doc.setFont("Helvetica", "normal");
              doc.text(client.name, 95, bottomY - 40);
            }
            
            doc.setFont("Helvetica", "bold");
            doc.text("Ubicación:", 40, bottomY - 20);
            doc.setFont("Helvetica", "normal");
            doc.text(locationString, 105, bottomY - 20);
    
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
            <div className="mx-auto max-w-5xl space-y-8">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div>
                                <CardTitle>Catálogo de Ubicaciones por Artículo</CardTitle>
                                <CardDescription>Gestiona las ubicaciones físicas predeterminadas para los productos de tus clientes.</CardDescription>
                            </div>
                             <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) resetForm(); }}>
                                <DialogTrigger asChild>
                                    <Button><PlusCircle className="mr-2 h-4 w-4"/>Crear Nueva Asignación</Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-2xl">
                                    <DialogHeader>
                                        <DialogTitle>Crear Asignación</DialogTitle>
                                        <DialogDescription>Asocia un producto a un cliente y una ubicación física.</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                                        <div className="space-y-2">
                                            <Label>1. Seleccione un Producto <span className="text-destructive">*</span></Label>
                                            <SearchInput options={productOptions} onSelect={handleSelectProduct} value={productSearchTerm} onValueChange={setProductSearchTerm} placeholder="Buscar producto..." open={isProductSearchOpen} onOpenChange={setIsProductSearchOpen} />
                                             <div className="flex items-center space-x-2 pt-1">
                                                <Checkbox id="exact-product-match" checked={exactProductMatch} onCheckedChange={(checked) => setExactProductMatch(checked as boolean)} />
                                                <Label htmlFor="exact-product-match" className="text-xs font-normal">Buscar coincidencia exacta de código</Label>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>2. Seleccione un Cliente (Opcional)</Label>
                                            <SearchInput options={clientOptions} onSelect={handleSelectClient} value={clientSearchTerm} onValueChange={setClientSearchTerm} placeholder="Buscar cliente..." open={isClientSearchOpen} onOpenChange={setIsClientSearchOpen} />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>3. Seleccione una Ubicación <span className="text-destructive">*</span></Label>
                                            <div className="flex items-center gap-2">
                                                <SearchInput 
                                                    options={locationOptions} 
                                                    onSelect={handleSelectLocation} 
                                                    value={locationSearchTerm} 
                                                    onValueChange={setLocationSearchTerm} 
                                                    placeholder="Buscar... ('*' o vacío para ver todas)" 
                                                    open={isLocationSearchOpen} 
                                                    onOpenChange={setIsLocationSearchOpen}
                                                />
                                                <Button type="button" variant="outline" size="icon" onClick={() => {setLocationSearchTerm('*'); setIsLocationSearchOpen(true)}}>
                                                    <List className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                                        <Button onClick={handleCreateAssignment} disabled={isSubmitting || !selectedProductId || !selectedLocationId}>
                                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Crear Asignación
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                         <div className="relative mt-4">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filtrar asignaciones por producto, cliente o ubicación..."
                                value={globalFilter}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Ubicación Asignada</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedAssignments.length > 0 ? paginatedAssignments.map(a => {
                                    const product = authProducts.find(p => p.id === a.itemId);
                                    const client = authCustomers.find(c => c.id === a.clientId);
                                    const locationString = renderLocationPathAsString(a.locationId, locations);
                                    return (
                                        <TableRow key={a.id}>
                                            <TableCell className="font-medium">
                                                <div>{product?.description || 'Producto no encontrado'}</div>
                                                <div className="text-xs text-muted-foreground">{product?.id}</div>
                                            </TableCell>
                                            <TableCell>{client?.name || <span className="italic text-muted-foreground">General</span>}</TableCell>
                                            <TableCell>{locationString}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handlePrintRackLabel(a)}>
                                                    <Printer className="h-4 w-4 text-blue-600" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" disabled={isSubmitting}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                      <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                          Esta acción eliminará la asignación permanentemente. No se puede deshacer.
                                                        </AlertDialogDescription>
                                                      </AlertDialogHeader>
                                                      <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteAssignment(a.id)}>Eliminar</AlertDialogAction>
                                                      </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                            {debouncedGlobalFilter ? 'No se encontraron asignaciones con ese filtro.' : 'No hay asignaciones creadas.'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                    {totalPages > 1 && (
                        <CardFooter>
                            <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(0, p - 1)); }} className={currentPage === 0 ? "pointer-events-none opacity-50" : undefined}/>
                                    </PaginationItem>
                                    {[...Array(totalPages)].map((_, i) => (
                                        <PaginationItem key={i}>
                                            <PaginationLink href="#" isActive={i === currentPage} onClick={(e) => { e.preventDefault(); setCurrentPage(i); }}>
                                                {i + 1}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ))}
                                    <PaginationItem>
                                        <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages - 1, p + 1)); }} className={currentPage === totalPages - 1 ? "pointer-events-none opacity-50" : undefined}/>
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </CardFooter>
                    )}
                </Card>
            </div>
        </main>
    );
}
