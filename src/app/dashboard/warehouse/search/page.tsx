/**
 * @fileoverview Main warehouse search page.
 * This component allows users to search for products or customers and see a consolidated
 * view of their assigned physical locations (from the warehouse module) and their
 * stock levels from the ERP system. This version is mobile-first and uses a hierarchical display.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWarehouseData, getInventoryUnitById } from '@/modules/warehouse/lib/actions';
import { syncAllData } from '@/modules/core/lib/actions';
import type { WarehouseLocation, WarehouseInventoryItem, Product, StockInfo, StockSettings, ItemLocation, Customer, InventoryUnit } from '@/modules/core/types';
import { Search, MapPin, Package, Building, Waypoints, Box, Layers, Warehouse as WarehouseIcon, RefreshCw, Loader2, Info, User, ChevronRight } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Button } from '@/components/ui/button';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError } from '@/modules/core/lib/logger';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type SearchableItem = {
  id: string;
  type: 'product' | 'customer';
  searchText: string;
};

type CombinedItem = {
    product: Product | null;
    physicalLocations: {
        path: React.ReactNode;
        quantity?: number;
        clientId?: string;
    }[];
    erpStock: StockInfo | null;
    client?: Customer | null;
    isUnit?: boolean;
    unit?: InventoryUnit | null;
};

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

const renderLocationPath = (locationId: number | null | undefined, locations: WarehouseLocation[]) => {
    if (!locationId) return <span className="text-muted-foreground italic">Sin ubicación</span>;
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
                <React.Fragment key={loc.id}>
                    <div className="flex items-center gap-1">
                        <LocationIcon type={loc.type} />
                        <span>{loc.name}</span>
                    </div>
                    {index < path.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
                </React.Fragment>
            ))}
        </div>
    );
};


export default function WarehouseSearchPage() {
    useAuthorization(['warehouse:access']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData, products, customers } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [exactMatch, setExactMatch] = useState(true);
    const [debouncedSearchTerm] = useDebounce(searchTerm, companyData?.searchDebounceTime ?? 500);
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [inventory, setInventory] = useState<WarehouseInventoryItem[]>([]);
    const [itemLocations, setItemLocations] = useState<ItemLocation[]>([]);
    const [stock, setStock] = useState<StockInfo[]>([]);
    const [stockSettings, setStockSettings] = useState<StockSettings | null>(null);
    const [warehouseSettings, setWarehouseSettings] = useState<{ enablePhysicalInventoryTracking: boolean } | null>(null);

    const [unitSearchResult, setUnitSearchResult] = useState<InventoryUnit | null>(null);

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
            await syncAllData();
            toast({
                title: "Datos Actualizados",
                description: `Los datos del ERP se han sincronizado. La página se recargará para reflejar los cambios.`
            });
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

    const searchIndex = useMemo(() => {
        const productIndex: SearchableItem[] = products.map(p => ({
            id: p.id,
            type: 'product',
            searchText: normalizeText(`${p.id} ${p.description}`)
        }));
        const customerIndex: SearchableItem[] = customers.map(c => ({
            id: c.id,
            type: 'customer',
            searchText: normalizeText(`${c.id} ${c.name}`)
        }));
        return [...productIndex, ...customerIndex];
    }, [products, customers]);
    
     useEffect(() => {
        const performUnitSearch = async () => {
            const normalizedSearch = debouncedSearchTerm.toUpperCase();
            if (exactMatch && normalizedSearch.startsWith('U')) {
                setIsLoading(true);
                try {
                    const unit = await getInventoryUnitById(normalizedSearch);
                    setUnitSearchResult(unit);
                } catch(e) {
                    setUnitSearchResult(null);
                } finally {
                    setIsLoading(false);
                }
            } else if (!normalizedSearch.startsWith('U')) {
                setUnitSearchResult(null);
            }
        };
        performUnitSearch();
    }, [debouncedSearchTerm, exactMatch]);


    const filteredItems = useMemo(() => {
        if (unitSearchResult) {
            const product = products.find(p => p.id === unitSearchResult.productId);
            const erpStock = stock.find(s => s.itemId === unitSearchResult.productId);
            return [{
                isUnit: true,
                unit: unitSearchResult,
                product: product || { id: unitSearchResult.productId, description: `Artículo ${unitSearchResult.productId}`, active: 'S', cabys: '', classification: '', isBasicGood: 'N', lastEntry: '', notes: '', unit: '' },
                physicalLocations: [{
                    path: renderLocationPath(unitSearchResult.locationId, locations)
                }],
                erpStock: erpStock || null,
            }]
        }
        
        if (!debouncedSearchTerm) return [];
        const normalizedSearch = normalizeText(debouncedSearchTerm);
        
        let matchedIndexItems: SearchableItem[];
        
        if (exactMatch) {
            // Unit code search is handled by the useEffect
            if (normalizedSearch.toUpperCase().startsWith('U')) return [];
            matchedIndexItems = searchIndex.filter(item => normalizeText(item.id) === normalizedSearch);
        } else {
            const searchTerms = normalizedSearch.split(' ').filter(Boolean);
            if (searchTerms.length === 0) return [];
            matchedIndexItems = searchIndex.filter(item => 
                searchTerms.every(term => item.searchText.includes(term))
            );
        }

        const relevantProductIds = new Set(matchedIndexItems.filter(i => i.type === 'product').map(i => i.id));
        const relevantCustomerIds = new Set(matchedIndexItems.filter(i => i.type === 'customer').map(i => i.id));

        const groupedByItem: { [key: string]: CombinedItem } = {};

        relevantProductIds.forEach(productId => {
            if (!groupedByItem[productId]) {
                const product = products.find(p => p.id === productId);
                groupedByItem[productId] = {
                    isUnit: false,
                    unit: null,
                    product: product || null,
                    physicalLocations: [],
                    erpStock: stock.find(s => s.itemId === productId) || null,
                };
            }
        });
        
        if (warehouseSettings?.enablePhysicalInventoryTracking) {
             inventory.forEach(item => {
                if (groupedByItem[item.itemId]) {
                    groupedByItem[item.itemId].physicalLocations.push({
                        path: renderLocationPath(item.locationId, locations),
                        quantity: item.quantity
                    });
                }
            });
        } else {
            itemLocations.forEach(itemLoc => {
                const product = products.find(p => p.id === itemLoc.itemId);
                
                if (groupedByItem[itemLoc.itemId]) {
                    groupedByItem[itemLoc.itemId].physicalLocations.push({
                        path: renderLocationPath(itemLoc.locationId, locations),
                        clientId: itemLoc.clientId || undefined
                    });
                } 
                else if (itemLoc.clientId && relevantCustomerIds.has(itemLoc.clientId)) {
                    if (!groupedByItem[itemLoc.itemId]) {
                         groupedByItem[itemLoc.itemId] = {
                            isUnit: false,
                            unit: null,
                            product: product || { id: itemLoc.itemId, description: `Artículo ${itemLoc.itemId}`, active: 'S', cabys: '', classification: '', isBasicGood: 'N', lastEntry: '', notes: '', unit: '' },
                            physicalLocations: [],
                            erpStock: stock.find(s => s.itemId === itemLoc.itemId) || null,
                            client: customers.find(c => c.id === itemLoc.clientId)
                        };
                    }
                    groupedByItem[itemLoc.itemId].physicalLocations.push({
                        path: renderLocationPath(itemLoc.locationId, locations),
                        clientId: itemLoc.clientId || undefined
                    });
                }
            });
        }
        
        return Object.values(groupedByItem).sort((a, b) => (a.product?.id || '').localeCompare(b.product?.id || ''));

    }, [debouncedSearchTerm, searchIndex, products, customers, inventory, itemLocations, stock, warehouseSettings, locations, exactMatch, unitSearchResult]);

    if (!warehouseSettings) {
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
                                    <CardDescription>Busca un artículo, cliente o ID de unidad para encontrar su ubicación y existencias.</CardDescription>
                                </div>
                            </div>
                            <Button onClick={handleRefresh} disabled={isRefreshing} className="w-full sm:w-auto">
                                {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Refrescar Datos del ERP
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Escribe el código/descripción del artículo, cliente o ID de unidad..."
                                    className="w-full pl-10 text-lg h-14"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox 
                                    id="exact-match" 
                                    checked={exactMatch} 
                                    onCheckedChange={(checked) => setExactMatch(checked as boolean)}
                                />
                                <Label htmlFor="exact-match">Buscar coincidencia exacta de código / ID de unidad</Label>
                            </div>
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
                            {isLoading ? (
                                 <div className="flex justify-center items-center h-40">
                                    <Loader2 className="animate-spin h-8 w-8 text-muted-foreground"/>
                                </div>
                            ) : filteredItems.length > 0 ? (
                                filteredItems.map((item, itemIndex) => (
                                    <Card key={item.product?.id || item.unit?.id || itemIndex} className="w-full">
                                        <CardHeader>
                                            <CardTitle className="text-xl flex items-center gap-2">
                                                <Package className="h-6 w-6 text-primary" />
                                                {item.isUnit ? `Unidad ${item.unit?.unitCode} - ${item.product?.description}` : item.product?.description || 'Producto no encontrado'}
                                            </CardTitle>
                                            <CardDescription>
                                                {item.isUnit ? `ID legible: ${item.unit?.humanReadableId || 'N/A'}` : `Código: ${item.product?.id}`}
                                            </CardDescription>
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
                                                {item.unit?.notes && <p className="text-xs italic text-muted-foreground mt-2">&quot;{item.unit.notes}&quot;</p>}
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
