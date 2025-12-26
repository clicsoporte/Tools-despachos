/**
 * @fileoverview Page to display the results of a scanned inventory unit QR code.
 * If a `unitId` is provided in the URL, it fetches and displays the unit's data.
 * If no `unitId` is provided, it redirects the user to the main warehouse search page.
 */
'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { getInventoryUnitById, getLocations, getItemLocations } from '@/modules/warehouse/lib/actions';
import type { InventoryUnit, Product, WarehouseLocation, StockInfo, ItemLocation } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { AlertCircle, QrCode, Package, MapPin, Warehouse, ChevronRight, Building, Waypoints, Box, Layers, Loader2, Archive } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const LocationIcon = ({ type }: { type: WarehouseLocation['type'] }) => {
    switch (type) {
        case 'building': return <Building className="h-5 w-5 text-muted-foreground" />;
        case 'zone': return <Waypoints className="h-5 w-5 text-muted-foreground" />;
        case 'rack': return <Box className="h-5 w-5 text-muted-foreground" />;
        case 'shelf': return <Layers className="h-5 w-5 text-muted-foreground" />;
        case 'bin': return <Archive className="h-5 w-5 text-muted-foreground" />;
        default: return <MapPin className="h-5 w-5 text-muted-foreground" />;
    }
};

const renderLocationPath = (locationId: number | null | undefined, allLocations: WarehouseLocation[]) => {
    if (!locationId) return <span className="text-muted-foreground italic">Sin ubicación asignada</span>;
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = allLocations.find(l => l.id === locationId);
    
    while (current) {
        path.unshift(current);
        const parentId = current.parentId;
        current = parentId ? allLocations.find(l => l.id === parentId) : undefined;
    }

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg">
            {path.map((loc, index) => (
                <React.Fragment key={loc.id}>
                    <div className="flex items-center gap-2">
                        <LocationIcon type={loc.type} />
                        <span className="font-semibold">{loc.name}</span>
                    </div>
                    {index < path.length - 1 && <ChevronRight className="h-5 w-5 text-muted-foreground/50 shrink-0" />}
                </React.Fragment>
            ))}
        </div>
    );
};

export default function ScannerResultPage() {
    const { setTitle } = usePageTitle();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { products, stockLevels } = useAuth();
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // State for different scan types
    const [unit, setUnit] = useState<InventoryUnit | null>(null);
    const [location, setLocation] = useState<WarehouseLocation | null>(null);
    const [product, setProduct] = useState<Product | null>(null);
    const [stock, setStock] = useState<StockInfo | null>(null);
    const [allLocations, setAllLocations] = useState<WarehouseLocation[]>([]);

    useEffect(() => {
        setTitle("Resultado de Escaneo");
        
        if (!searchParams) {
            router.replace('/dashboard/warehouse/search');
            return;
        }

        const unitId = searchParams.get('unitId');
        const locationId = searchParams.get('locationId');
        const productId = searchParams.get('productId');

        if (!unitId && !locationId) {
            router.replace('/dashboard/warehouse/search');
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const fetchedLocations = await getLocations();
                setAllLocations(fetchedLocations);

                if (unitId) {
                    const fetchedUnit = await getInventoryUnitById(unitId);
                    if (!fetchedUnit) throw new Error(`No se encontró ninguna unidad con el ID ${unitId}.`);
                    
                    setUnit(fetchedUnit);
                    const foundProduct = products.find(p => p.id === fetchedUnit.productId);
                    setProduct(foundProduct || null);
                    const foundStock = stockLevels.find(s => s.itemId === fetchedUnit.productId);
                    setStock(foundStock || null);

                } else if (locationId && productId) {
                    const foundLocation = fetchedLocations.find(l => l.id === Number(locationId));
                    if (!foundLocation) throw new Error(`No se encontró la ubicación con ID ${locationId}.`);
                    
                    const foundProduct = products.find(p => p.id === productId);
                    if (!foundProduct) throw new Error(`No se encontró el producto con ID ${productId}.`);

                    setLocation(foundLocation);
                    setProduct(foundProduct);
                    const foundStock = stockLevels.find(s => s.itemId === productId);
                    setStock(foundStock || null);
                }

            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [setTitle, searchParams, products, stockLevels, router]);

    if (!searchParams?.get('unitId') && !searchParams?.get('locationId')) {
        return (
             <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin" />
                    <p>Redirigiendo a la búsqueda principal...</p>
                </div>
            </main>
        );
    }

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <Card className="w-full max-w-2xl">
                    <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
                    <CardContent className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></CardContent>
                </Card>
            </main>
        );
    }
    
    if (error) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <Card className="w-full max-w-md text-center border-destructive">
                    <CardHeader><CardTitle className="flex items-center justify-center gap-2"><AlertCircle/>Error</CardTitle></CardHeader>
                    <CardContent><p>{error}</p></CardContent>
                </Card>
            </main>
        );
    }

    if (unit) { // Render for Unit Scan
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <Card className="w-full max-w-3xl">
                    <CardHeader>
                        <div className="flex items-start gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary text-white flex-shrink-0">
                                <QrCode className="h-8 w-8" />
                            </div>
                            <div>
                                 <CardTitle className="text-3xl">Unidad de Inventario: {unit.unitCode}</CardTitle>
                                 <CardDescription>Información detallada de la unidad escaneada.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <h3 className="font-semibold flex items-center gap-2"><Package className="h-5 w-5"/>Producto</h3>
                            <p className="text-lg">{product?.description || 'Descripción no disponible'}</p>
                            <p className="text-muted-foreground">Código: {unit.productId}</p>
                            {unit.humanReadableId && <p className="text-muted-foreground">Lote/ID Humano: {unit.humanReadableId}</p>}
                        </div>
                        <Separator />
                         <div className="space-y-2">
                            <h3 className="font-semibold flex items-center gap-2"><Warehouse className="h-5 w-5"/>Inventario Total (ERP)</h3>
                            <p className="text-2xl font-bold">{stock?.totalStock.toLocaleString() || 0} unidades</p>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                            <h3 className="font-semibold flex items-center gap-2"><MapPin className="h-5 w-5"/>Ubicación Actual de la Unidad</h3>
                            <div className="p-4 bg-muted rounded-lg">
                                 {renderLocationPath(unit.locationId, allLocations)}
                            </div>
                        </div>
                         {unit.notes && (
                            <>
                                <Separator />
                                <div className="space-y-2">
                                    <h3 className="font-semibold">Notas</h3>
                                    <p className="text-muted-foreground italic">&quot;{unit.notes}&quot;</p>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </main>
        );
    }
    
    if (location && product) { // Render for Location + Product Scan
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <Card className="w-full max-w-3xl">
                    <CardHeader>
                        <div className="flex items-start gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-teal-600 text-white flex-shrink-0">
                                <MapPin className="h-8 w-8" />
                            </div>
                            <div>
                                 <CardTitle className="text-3xl">Ubicación de Rack</CardTitle>
                                 <CardDescription>Información del producto asignado a esta ubicación.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <h3 className="font-semibold flex items-center gap-2"><MapPin className="h-5 w-5"/>Ubicación Escaneada</h3>
                            <div className="p-4 bg-muted rounded-lg">
                                {renderLocationPath(location.id, allLocations)}
                            </div>
                        </div>
                        <Separator />
                         <div className="space-y-2">
                            <h3 className="font-semibold flex items-center gap-2"><Package className="h-5 w-5"/>Producto Asignado</h3>
                            <p className="text-lg">{product.description}</p>
                            <p className="text-muted-foreground">Código: {product.id}</p>
                        </div>
                        <Separator />
                         <div className="space-y-2">
                            <h3 className="font-semibold flex items-center gap-2"><Warehouse className="h-5 w-5"/>Inventario Total (ERP)</h3>
                            <p className="text-2xl font-bold">{stock?.totalStock.toLocaleString() || 0} unidades</p>
                        </div>
                    </CardContent>
                </Card>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
             <Card className="w-full max-w-md text-center"><CardHeader><CardTitle>Información no disponible</CardTitle></CardHeader><CardContent><p>No se pudo cargar la información para los parámetros proporcionados.</p></CardContent></Card>
        </main>
    );
}
