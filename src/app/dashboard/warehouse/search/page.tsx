/**
 * @fileoverview Main warehouse search page.
 * This component allows users to search for products or customers and see a consolidated
 * view of their assigned physical locations (from the warehouse module) and their
 * stock levels from the ERP system. This version is mobile-first and uses a hierarchical display.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWarehouseData, addInventoryUnit } from '@/modules/warehouse/lib/actions';
import { syncAllData } from '@/modules/core/lib/actions';
import type { WarehouseLocation, WarehouseInventoryItem, Product, StockInfo, StockSettings, ItemLocation, Customer, InventoryUnit, WarehouseSettings } from '@/modules/core/types';
import { Search, MapPin, Package, Building, Waypoints, Box, Layers, Warehouse as WarehouseIcon, RefreshCw, Loader2, Info, User, ChevronRight, Printer, Filter, Archive } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Button } from '@/components/ui/button';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { Separator } from '@/components/ui/separator';
import { SearchInput } from '@/components/ui/search-input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import jsPDF from "jspdf";
import QRCode from 'qrcode';
import { format } from 'date-fns';

type SearchableItem = {
  id: string;
  type: 'product' | 'customer' | 'unit';
  searchText: string;
};

type UnitResultItem = {
    isUnit: true;
    unit: InventoryUnit;
    product: Product | null;
    physicalLocations: {
        path: React.ReactNode;
        quantity?: undefined;
        clientId?: undefined;
        location: WarehouseLocation | undefined;
    }[];
    erpStock: StockInfo | null;
    client?: undefined;
}

type SearchResultItem = {
    isUnit: false;
    unit: null;
    product: Product | null;
    physicalLocations: {
        path: React.ReactNode;
        quantity?: number;
        clientId?: string;
        location: WarehouseLocation | undefined;
    }[];
    erpStock: StockInfo | null;
    client?: Customer | null;
}

type CombinedItem = SearchResultItem | UnitResultItem;

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
        case 'bin': return <Archive className="h-5 w-5 text-muted-foreground" />;
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
        current = parentId ? locations.find(l => l.id === parentId) : undefined;
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
    const router = useRouter();
    const { user, companyData, products, customers, isReady } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<SearchableItem | null>(null);

    const [debouncedSearchTerm] = useDebounce(searchTerm, companyData?.searchDebounceTime ?? 500);
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [inventory, setInventory] = useState<WarehouseInventoryItem[]>([]);
    const [itemLocations, setItemLocations] = useState<ItemLocation[]>([]);
    const [stock, setStock] = useState<StockInfo[]>([]);
    const [stockSettings, setStockSettings] = useState<StockSettings | null>(null);
    const [warehouseSettings, setWarehouseSettings] = useState<WarehouseSettings | null>(null);
    
    const [classificationFilter, setClassificationFilter] = useState<string[]>([]);

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
        if (isReady) {
            loadData();
        }
    }, [setTitle, loadData, isReady]);

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

    const searchOptions = useMemo(() => {
        if (debouncedSearchTerm.length < 2) return [];
        const searchTerms = normalizeText(debouncedSearchTerm).split(' ').filter(Boolean);
        if (searchTerms.length === 0) return [];
        
        const productResults = products
            .filter(p => searchTerms.every(term => normalizeText(`${p.id} ${p.description}`).includes(term)))
            .map(p => ({ value: `product-${p.id}`, label: `[ARTÍCULO] ${p.id} - ${p.description}` }));
        const customerResults = customers
            .filter(c => searchTerms.every(term => normalizeText(`${c.id} ${c.name}`).includes(term)))
            .map(c => ({ value: `customer-${c.id}`, label: `[CLIENTE] ${c.id} - ${c.name}` }));
        const unitCodePrefix = warehouseSettings?.unitPrefix?.toUpperCase();
        const unitResults = unitCodePrefix && debouncedSearchTerm.toUpperCase().startsWith(unitCodePrefix)
            ? [{ value: `unit-${debouncedSearchTerm.toUpperCase()}`, label: `[UNIDAD] ${debouncedSearchTerm.toUpperCase()}` }]
            : [];
            
        return [...unitResults, ...productResults, ...customerResults];
    }, [debouncedSearchTerm, products, customers, warehouseSettings]);

    const handleSelectSearchItem = (value: string) => {
        const [type, id] = value.split('-');
        setIsSearchOpen(false);

        if (type === 'product') {
            const product = products.find(p => p.id === id);
            if (product) {
                 setSelectedItem({ id: product.id, type: 'product', searchText: '' });
                 setSearchTerm(`[ARTÍCULO] ${product.id} - ${product.description}`);
            }
        } else if (type === 'customer') {
            const customer = customers.find(c => c.id === id);
            if (customer) {
                setSelectedItem({ id: customer.id, type: 'customer', searchText: '' });
                setSearchTerm(`[CLIENTE] ${customer.id} - ${customer.name}`);
            }
        } else if (type === 'unit') {
            router.push(`/dashboard/scanner?unitId=${id}`);
        }
    };


    const filteredItems = useMemo((): CombinedItem[] => {
        if (!selectedItem) return [];
        let results: CombinedItem[] = [];

        if (selectedItem.type === 'unit') {
            // This case is now handled by redirecting in handleSelectSearchItem.
        } else {
            const groupedByItem: { [key: string]: SearchResultItem } = {};

            if (selectedItem.type === 'product') {
                const product = products.find(p => p.id === selectedItem.id);
                if (product) {
                    groupedByItem[product.id] = { isUnit: false, unit: null, product, physicalLocations: [], erpStock: stock.find(s => s.itemId === product.id) || null };
                }
            }
            
            inventory.forEach(item => {
                if (groupedByItem[item.itemId]) {
                    groupedByItem[item.itemId].physicalLocations.push({ path: renderLocationPath(item.locationId, locations), quantity: item.quantity, location: locations.find(l => l.id === item.locationId) });
                }
            });
            
            itemLocations.forEach(itemLoc => {
                if (selectedItem.type === 'product' && itemLoc.itemId === selectedItem.id && groupedByItem[itemLoc.itemId]) {
                    groupedByItem[itemLoc.itemId].physicalLocations.push({ path: renderLocationPath(itemLoc.locationId, locations), clientId: itemLoc.clientId || undefined, location: locations.find(l => l.id === itemLoc.locationId) });
                } else if (selectedItem.type === 'customer' && itemLoc.clientId === selectedItem.id) {
                     const product = products.find(p => p.id === itemLoc.itemId);
                     if (!groupedByItem[itemLoc.itemId]) {
                         groupedByItem[itemLoc.itemId] = { isUnit: false, unit: null, product: product || { id: itemLoc.itemId, description: `Artículo ${itemLoc.itemId}`, active: 'S', cabys: '', classification: '', isBasicGood: 'N', lastEntry: '', notes: '', unit: '' }, physicalLocations: [], erpStock: stock.find(s => s.itemId === itemLoc.itemId) || null, client: customers.find(c => c.id === itemLoc.clientId) };
                     }
                     groupedByItem[itemLoc.itemId].physicalLocations.push({ path: renderLocationPath(itemLoc.locationId, locations), clientId: itemLoc.clientId || undefined, location: locations.find(l => l.id === itemLoc.locationId) });
                }
            });
            results = Object.values(groupedByItem).sort((a, b) => (a.product?.id || '').localeCompare(b.product?.id || ''));
        }

        if (classificationFilter.length > 0) {
            return results.filter(item => item.product && classificationFilter.includes(item.product.classification));
        }

        return results;

    }, [selectedItem, products, customers, inventory, itemLocations, stock, locations, classificationFilter]);
    
    const handlePrintLabel = async (product: Product, location: WarehouseLocation) => {
        if (!user || !companyData) return;
        try {
            const newUnit = await addInventoryUnit({ productId: product.id, locationId: location.id, createdBy: user.name, notes: 'Etiqueta generada desde búsqueda.' });
            
            const baseUrl = companyData.publicUrl || window.location.origin;
            const scanUrl = `${baseUrl}/dashboard/scanner?unitId=${newUnit.unitCode}`;

            const qrCodeDataUrl = await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: 'H', width: 200 });

            const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [4, 3] });
            doc.addImage(qrCodeDataUrl, 'PNG', 0.2, 0.2, 1.5, 1.5);
            doc.setFontSize(14).setFont('Helvetica', 'bold').text(`Producto: ${product.id}`, 1.8, 0.4);
            doc.setFontSize(10).setFont('Helvetica', 'normal').text(doc.splitTextToSize(product.description, 1.9), 1.8, 0.6);
            doc.setFontSize(12).setFont('Helvetica', 'bold').text(`Ubicación: ${location.code}`, 1.8, 1.3);
            doc.setFontSize(8).text(`ID Interno: ${newUnit.unitCode}`, 0.2, 2.8);
            doc.text(`Creado: ${format(new Date(), 'dd/MM/yyyy')}`, 1.8, 2.8);
            doc.save(`etiqueta_unidad_${newUnit.unitCode}.pdf`);
            
            toast({ title: "Etiqueta Generada", description: `Se creó la unidad ${newUnit.unitCode} y se generó el PDF.` });

        } catch (err: any) {
            logError("Failed to generate and print label", { error: err.message, productId: product.id });
            toast({ title: 'Error al Imprimir', description: err.message, variant: 'destructive' });
        }
    };
    
    const classifications = useMemo(() => Array.from(new Set(products.map(p => p.classification).filter(Boolean))), [products]);

    if (!isReady || !warehouseSettings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card className="max-w-5xl mx-auto">
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
        <div className="flex flex-col h-full">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm p-4 border-b">
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 max-w-5xl mx-auto">
                    <div className="w-full flex-1">
                        <SearchInput
                            options={searchOptions || []}
                            onSelect={handleSelectSearchItem}
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                            onOpenChange={setIsSearchOpen}
                            open={isSearchOpen}
                            placeholder="Buscar artículo, cliente o escanear unidad..."
                            className="text-lg h-12"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                         <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="outline" className="w-full sm:w-auto">
                                    <Filter className="mr-2 h-4 w-4" /> Filtros
                                </Button>
                            </SheetTrigger>
                            <SheetContent>
                                <SheetHeader>
                                    <SheetTitle>Filtros Adicionales</SheetTitle>
                                    <SheetDescription>Refina tu búsqueda con estas opciones.</SheetDescription>
                                </SheetHeader>
                                <div className="py-4 space-y-4">
                                     <MultiSelectFilter
                                        title="Clasificación"
                                        options={classifications.map(c => ({ value: c, label: c }))}
                                        selectedValues={classificationFilter}
                                        onSelectedChange={setClassificationFilter}
                                    />
                                    <Button onClick={handleRefresh} disabled={isRefreshing} className="w-full">
                                        {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                        Refrescar Datos del ERP
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </div>
            <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
                <div className="max-w-5xl mx-auto space-y-4">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="animate-spin h-8 w-8 text-muted-foreground"/>
                        </div>
                    ) : filteredItems.length > 0 ? (
                        filteredItems.map((item, itemIndex) => {
                            const warehouseEntries = (item.erpStock?.stockByWarehouse) 
                                ? Object.entries(item.erpStock.stockByWarehouse)
                                    .filter(([, qty]) => qty > 0)
                                    .map(([whId, qty]) => ({
                                        whId,
                                        qty,
                                        warehouse: stockSettings?.warehouses.find(w => w.id === whId)
                                    }))
                                    .filter(entry => entry.warehouse?.isVisible)
                                : [];

                            return (
                                <Card key={item.product?.id || item.unit?.id || itemIndex} className="w-full">
                                    <CardHeader>
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            <Package className="h-6 w-6 text-primary" />
                                            {item.isUnit ? `Unidad ${item.unit.unitCode} - ${item.product?.description}` : item.product?.description || 'Producto no encontrado'}
                                        </CardTitle>
                                        <CardDescription>
                                            {item.isUnit ? `ID legible: ${item.unit.humanReadableId || 'N/A'}` : `Código: ${item.product?.id}`}
                                        </CardDescription>
                                         {!item.isUnit && item.client && (
                                            <div className="text-sm text-muted-foreground flex items-center gap-2 pt-1">
                                                <User className="h-4 w-4"/>
                                                <span>Inventario de Cliente: <strong>{item.client.name}</strong> ({item.client.id})</span>
                                            </div>
                                        )}
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                        <div>
                                            <h4 className="font-semibold mb-2">Ubicaciones y Cantidades Físicas</h4>
                                            <div className="space-y-2">
                                            {item.physicalLocations.length > 0 ? item.physicalLocations.map((loc, index) => (
                                                <div key={index} className="flex justify-between items-center p-2 border rounded-md">
                                                    <span>{loc.path}</span>
                                                    <div className='flex items-center gap-1'>
                                                        {loc.quantity !== undefined && (
                                                            <span className="font-bold text-lg">{loc.quantity.toLocaleString()}</span>
                                                        )}
                                                        {item.product && loc.location && (
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintLabel(item.product!, loc.location!)}>
                                                                <Printer className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            )) : <p className="text-sm text-muted-foreground">Sin ubicaciones físicas registradas.</p>}
                                            </div>
                                            {item.isUnit && item.unit?.notes && <p className="text-xs italic text-muted-foreground mt-2">&quot;{item.unit.notes}&quot;</p>}
                                        </div>
                                        <div>
                                             <h4 className="font-semibold mb-2">Existencias por Bodega (ERP)</h4>
                                             {warehouseEntries.length > 0 ? (
                                                 <div className="space-y-2">
                                                    {warehouseEntries.map(entry => (
                                                        <div key={entry.whId} className="flex justify-between items-center p-2 border rounded-md">
                                                            <span>{entry.warehouse?.name} ({entry.whId})</span>
                                                            <span className="font-bold text-lg">{entry.qty.toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                     <Separator />
                                                     <div className="flex justify-between items-center p-2 font-bold">
                                                        <span>Total ERP</span>
                                                        <span className="text-xl">{item.erpStock?.totalStock.toLocaleString()}</span>
                                                     </div>
                                                 </div>
                                             ) : (
                                                 <p className="text-sm text-muted-foreground">Sin datos de existencias en el ERP.</p>
                                             )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })
                    ) : (
                        <div className="text-center py-16 text-muted-foreground">
                            {debouncedSearchTerm ? <p>No se encontraron resultados para &quot;{debouncedSearchTerm}&quot;.</p> : <p>Comienza a escribir para buscar un artículo, cliente o unidad.</p>}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
