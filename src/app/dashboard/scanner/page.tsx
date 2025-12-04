/**
 * @fileoverview Page to display the results of a scanned inventory unit QR code.
 * It reads the `unitId` from the URL, fetches the corresponding data, and displays it.
 */
'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { getInventoryUnitById } from '@/modules/warehouse/lib/actions';
import { getLocations, getWarehouseData } from '@/modules/warehouse/lib/actions';
import type { InventoryUnit, Product, WarehouseLocation, StockInfo } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { AlertCircle, QrCode, Package, MapPin, Warehouse, ChevronRight, Building, Waypoints, Box, Layers } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const LocationIcon = ({ type }: { type: WarehouseLocation['type'] }) => {
    switch (type) {
        case 'building': return <Building className="h-5 w-5 text-muted-foreground" />;
        case 'zone': return <Waypoints className="h-5 w-5 text-muted-foreground" />;
        case 'rack': return <Box className="h-5 w-5 text-muted-foreground" />;
        case 'shelf': return <Layers className="h-5 w-5 text-muted-foreground" />;
        case 'bin': return <div className="h-5 w-5 text-muted-foreground font-bold text-center">B</div>;
        default: return <MapPin className="h-5 w-5 text-muted-foreground" />;
    }
};

const renderLocationPath = (locationId: number | null | undefined, allLocations: WarehouseLocation[]) => {
    if (!locationId) return <span className="text-muted-foreground italic">Sin ubicación asignada</span>;
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = allLocations.find(l => l.id === locationId);
    
    while (current) {
        path.unshift(current);
        current = allLocations.find(l => l.id === current.parentId);
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
    const { products, stockLevels } = useAuth();
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [unit, setUnit] = useState<InventoryUnit | null>(null);
    const [product, setProduct] = useState<Product | null>(null);
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [stock, setStock] = useState<StockInfo | null>(null);

    useEffect(() => {
        setTitle("Resultado de Escaneo");
        const unitId = searchParams.get('unitId');

        if (!unitId) {
            setError("No se proporcionó un ID de unidad para escanear.");
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                const [fetchedUnit, allLocations] = await Promise.all([
                    getInventoryUnitById(Number(unitId)),
                    getLocations(),
                ]);

                if (!fetchedUnit) {
                    throw new Error(`No se encontró ninguna unidad de inventario con el ID ${unitId}.`);
                }
                
                setUnit(fetchedUnit);
                setLocations(allLocations);
                
                const foundProduct = products.find(p => p.id === fetchedUnit.productId);
                setProduct(foundProduct || null);

                const foundStock = stockLevels.find(s => s.itemId === fetchedUnit.productId);
                setStock(foundStock || null);

            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [setTitle, searchParams, products, stockLevels]);

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

    if (!unit) {
         return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                 <Card className="w-full max-w-md text-center"><CardHeader><CardTitle>No Encontrado</CardTitle></CardHeader><CardContent><p>La unidad de inventario no pudo ser encontrada.</p></CardContent></Card>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
            <Card className="w-full max-w-3xl">
                <CardHeader>
                    <div className="flex items-start gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary text-white flex-shrink-0">
                            <QrCode className="h-8 w-8" />
                        </div>
                        <div>
                             <CardTitle className="text-3xl">Unidad de Inventario: {unit.id}</CardTitle>
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
                        <h3 className="font-semibold flex items-center gap-2"><MapPin className="h-5 w-5"/>Ubicación Asignada</h3>
                        <div className="p-4 bg-muted rounded-lg">
                             {renderLocationPath(unit.locationId, locations)}
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
