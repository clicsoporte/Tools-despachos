/**
 * @fileoverview Main warehouse search page.
 * This component allows users to search for products or customers and see a consolidated
 * view of their assigned physical locations (from the warehouse module) and their
 * stock levels from the ERP system.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWarehouseData } from '@/modules/warehouse/lib/actions';
import { importAllDataFromFiles } from '@/modules/core/lib/db';
import type { WarehouseLocation, WarehouseInventoryItem, Product, StockInfo, StockSettings, ItemLocation, Customer } from '@/modules/core/types';
import { Search, MapPin, Package, Building, Waypoints, Box, Layers, Warehouse as WarehouseIcon, RefreshCw, Loader2, Info, User } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Button } from '@/components/ui/button';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError } from '@/modules/core/lib/logger';
import { Separator } from '@/components/ui/separator';

type CombinedItem = {
    product: Product | null;
    physicalLocations: {
        path: React.ReactNode;
        quantity?: number; // Only present in advanced mode
        clientId?: string;
    }[];
    erpStock: StockInfo | null;
    client?: Customer | null;
};

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export default function WarehousePage() {
    useAuthorization(['warehouse:access']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData, products, customers } = useAuth(); // Get master data from context

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, companyData?.searchDebounceTime ?? 500);
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [inventory, setInventory] = useState<WarehouseInventoryItem[]>([]);
    const [itemLocations, setItemLocations] = useState<ItemLocation[]>([]);
    const [stock, setStock] = useState<StockInfo[]>([]);
    const [stockSettings, setStockSettings] = useState<StockSettings | null>(null);
    const [warehouseSettings, setWarehouseSettings] = useState<{ enablePhysicalInventoryTracking: boolean } | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const wData = await getWarehouseData();
            setLocations(wData.locations);
            setInventory(wData.inventory);
            setItemLocations(wData.itemLocations);
            setStock(wData.stock);
            setStockSettings(wData.stockSettings);
            setWarehouseSettings(wData.warehouseSettings);
        } catch (error) {
            console.error("Failed to load warehouse data", error);
            logError("Failed to load warehouse data", { error });
            toast({ title: "Error de Carga", description: "No se pudieron cargar los datos del almacén.", variant: "destructive"});
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        setTitle("Búsqueda en Almacén");
        loadData();
    }, [setTitle, loadData]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await importAllDataFromFiles();
            toast({
                title: "Datos Actualizados",
                description: `Los datos del ERP se han sincronizado. La página se recargará para reflejar los cambios.`
            });
            // A full reload is simpler here to ensure all contexts and states are updated
            window.location.reload();
        } catch (error: any) {
            logError("Error during manual data refresh", { error: error.message });
            toast({
                title: "Error al Refrescar",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsRefreshing(false);
        }
    };

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
    
    const renderLocationPath = useCallback((locationId?: number | null) => {
        if (!locationId) return 'N/A';
        const path: WarehouseLocation[] = [];
        let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
        
        while (current) {
            path.unshift(current);
            const parentId = current.parentId;
            if (parentId) {
                current = locations.find(l => l.id === parentId);
            } else {
                current = undefined;
            }
        }

        return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {path.map((loc, index) => (
                    <div key={loc.id} className="flex items-center gap-1">
                        <LocationIcon type={loc.type} />
                        <span>{loc.name}</span>
                        {index < path.length - 1 && <span className="hidden sm:inline">/</span>}
                    </div>
                ))}
            </div>
        );
    }, [locations]);

    const filteredItems = useMemo(() => {
        if (!debouncedSearchTerm) return [];

        const searchTerms = normalizeText(debouncedSearchTerm).split(' ').filter(Boolean);
        
        const relevantProducts = products.filter(p => {
            const targetText = normalizeText(`${p.id} ${p.description}`);
            return searchTerms.every(term => targetText.includes(term));
        });

        const relevantCustomers = customers.filter(c => {
            const targetText = normalizeText(`${c.id} ${c.name}`);
            return searchTerms.every(term => targetText.includes(term));
        });
        const relevantCustomerIds = new Set(relevantCustomers.map(c => c.id));

        const groupedByItem: { [key: string]: CombinedItem } = {};
        
        for (const product of relevantProducts) {
            if (!groupedByItem[product.id]) {
                groupedByItem[product.id] = {
                    product: product,
                    physicalLocations: [],
                    erpStock: stock.find(s => s.itemId === product.id) || null,
                };
            }
        }

        if (warehouseSettings?.enablePhysicalInventoryTracking) {
             inventory.forEach(item => {
                if (groupedByItem[item.itemId]) {
                    groupedByItem[item.itemId].physicalLocations.push({
                        path: renderLocationPath(item.locationId),
                        quantity: item.quantity
                    });
                }
            });
        } else {
            itemLocations.forEach(itemLoc => {
                const product = products.find(p => p.id === itemLoc.itemId);
                
                if (groupedByItem[itemLoc.itemId]) {
                    groupedByItem[itemLoc.itemId].physicalLocations.push({
                        path: renderLocationPath(itemLoc.locationId),
                        clientId: itemLoc.clientId || undefined
                    });
                } 
                else if (itemLoc.clientId && relevantCustomerIds.has(itemLoc.clientId)) {
                    if (!groupedByItem[itemLoc.itemId]) {
                         groupedByItem[itemLoc.itemId] = {
                            product: product || { id: itemLoc.itemId, description: `Artículo ${itemLoc.itemId}`, active: 'S', cabys: '', classification: '', isBasicGood: 'N', lastEntry: '', notes: '', unit: '' },
                            physicalLocations: [],
                            erpStock: stock.find(s => s.itemId === itemLoc.itemId) || null,
                            client: customers.find(c => c.id === itemLoc.clientId)
                        };
                    }
                    groupedByItem[itemLoc.itemId].physicalLocations.push({
                        path: renderLocationPath(itemLoc.locationId),
                        clientId: itemLoc.clientId || undefined
                    });
                }
            });
        }
        
        return Object.values(groupedByItem).sort((a, b) => (a.product?.id || '').localeCompare(b.product?.id || ''));

    }, [debouncedSearchTerm, products, customers, inventory, itemLocations, stock, warehouseSettings, renderLocationPath]);

    if (isLoading || !warehouseSettings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                 <Card className="max-w-4xl mx-auto">
                    <CardHeader>
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-6 w-full max-w-md mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-40 w-full" />
                    </CardContent>
                 </Card>
            </main>
        )
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-600 text-white">
                                    <WarehouseIcon className="h-6 w-6" />
                                </div>
                                <div>
                                    <CardTitle className="text-2xl">Búsqueda en Almacén</CardTitle>
                                    <CardDescription>Busca un artículo o cliente para encontrar su ubicación y existencias.</CardDescription>
                                </div>
                            </div>
                            <Button onClick={handleRefresh} disabled={isRefreshing} className="w-full sm:w-auto">
                                {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Refrescar Datos del ERP
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Escribe el código/descripción del artículo o el código/nombre del cliente..."
                                className="w-full pl-10 text-lg h-14"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                         {
                            !warehouseSettings.enablePhysicalInventoryTracking && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
                                    <Info className="h-5 w-5"/>
                                    <p className="text-sm">El modo de control de inventario físico está desactivado. Solo se mostrarán ubicaciones asignadas, no cantidades.</p>
                                </div>
                            )
                        }
                        
                        <div className="space-y-4">
                            {filteredItems.length > 0 ? (
                                filteredItems.map(item => (
                                    <Card key={item.product?.id} className="w-full">
                                        <CardHeader>
                                            <CardTitle className="text-xl flex items-center gap-2">
                                                <Package className="h-6 w-6 text-primary" />
                                                {item.product?.description || 'Producto no encontrado'}
                                            </CardTitle>
                                            <CardDescription>Código: {item.product?.id}</CardDescription>
                                             {item.client && (
                                                <div className="text-sm text-muted-foreground flex items-center gap-2 pt-1">
                                                    <User className="h-4 w-4"/>
                                                    <span>Inventario de Cliente: <strong>{item.client.name}</strong> ({item.client.id})</span>
                                                </div>
                                            )}
                                        </CardHeader>
                                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                            <div>
                                                <h4 className="font-semibold mb-2">Ubicaciones Físicas Asignadas</h4>
                                                <div className="space-y-2">
                                                {item.physicalLocations.length > 0 ? item.physicalLocations.map((loc, index) => (
                                                    <div key={index} className="flex justify-between items-center p-2 border rounded-md">
                                                        <span>{loc.path}</span>
                                                        {loc.quantity !== undefined && (
                                                            <span className="font-bold text-lg">{loc.quantity.toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                )) : <p className="text-sm text-muted-foreground">Sin ubicaciones asignadas.</p>}
                                                </div>
                                            </div>
                                            <div>
                                                 <h4 className="font-semibold mb-2">Existencias por Bodega (ERP)</h4>
                                                 {item.erpStock && stockSettings ? (
                                                     <div className="space-y-2">
                                                        {Object.entries(item.erpStock.stockByWarehouse).map(([whId, qty]) => {
                                                            const warehouse = stockSettings.warehouses.find(w => w.id === whId);
                                                            return warehouse?.isVisible ? (
                                                                <div key={whId} className="flex justify-between items-center p-2 border rounded-md">
                                                                    <span>{warehouse.name} ({whId})</span>
                                                                    <span className="font-bold text-lg">{qty.toLocaleString()}</span>
                                                                </div>
                                                            ) : null;
                                                        })}
                                                         <Separator />
                                                         <div className="flex justify-between items-center p-2 font-bold">
                                                            <span>Total ERP</span>
                                                            <span className="text-xl">{item.erpStock.totalStock.toLocaleString()}</span>
                                                         </div>
                                                     </div>
                                                 ) : (
                                                     <p className="text-sm text-muted-foreground">Sin datos de existencias en el ERP.</p>
                                                 )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : debouncedSearchTerm ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    <p>No se encontraron resultados para &quot;{debouncedSearchTerm}&quot;.</p>
                                </div>
                            ) : (
                                 <div className="text-center py-10 text-muted-foreground">
                                    <p>Comienza a escribir para buscar un artículo o cliente.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
