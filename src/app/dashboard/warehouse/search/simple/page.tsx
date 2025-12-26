/**
 * @fileoverview Simplified warehouse search page, optimized for mobile devices.
 * This component provides a minimal UI for warehouse workers to quickly look up items.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWarehouseData, addInventoryUnit } from '@/modules/warehouse/lib/actions';
import type { WarehouseLocation, WarehouseInventoryItem, Product, StockInfo, StockSettings, ItemLocation, Customer, InventoryUnit, WarehouseSettings } from '@/modules/core/types';
import { Search, MapPin, Package, Building, Waypoints, Box, Layers, Warehouse as WarehouseIcon, Loader2, Info, User, ChevronRight, Printer, LogOut, Archive } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Button } from '@/components/ui/button';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { SearchInput } from '@/components/ui/search-input';
import jsPDF from "jspdf";
import QRCode from 'qrcode';
import { format } from 'date-fns';

type SearchableItem = {
  id: string;
  type: 'product' | 'unit';
  searchText: string;
};

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

const renderLocationPath = (locationId: number | null | undefined, locations: WarehouseLocation[]): React.ReactNode => {
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

export default function SimpleWarehouseSearchPage() {
    useAuthorization(['warehouse:access']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products, customers, logout } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
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
            logError("Failed to load warehouse data", { error });
            toast({ title: "Error de Carga", variant: "destructive"});
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        setTitle("Búsqueda Rápida de Almacén");
        loadData();
    }, [setTitle, loadData]);

    const searchOptions = useMemo(() => {
        if (debouncedSearchTerm.length < 2) return [];

        const searchTerms = normalizeText(debouncedSearchTerm).split(' ').filter(Boolean);
        if (searchTerms.length === 0) return [];
        
        const productResults = products
            .filter(p => searchTerms.every(term => normalizeText(`${p.id} ${p.description}`).includes(term)))
            .map(p => ({ value: `product-${p.id}`, label: `[ARTÍCULO] ${p.id} - ${p.description}` }));

        const unitCodePrefix = warehouseSettings?.unitPrefix?.toUpperCase();
        const unitResults = unitCodePrefix && debouncedSearchTerm.toUpperCase().startsWith(unitCodePrefix)
            ? [{ value: `unit-${debouncedSearchTerm.toUpperCase()}`, label: `[UNIDAD] ${debouncedSearchTerm.toUpperCase()}` }]
            : [];
            
        return [...unitResults, ...productResults];

    }, [debouncedSearchTerm, products, warehouseSettings]);

    const handleSelectSearchItem = (value: string) => {
        const [type, id] = value.split('-');
        setIsSearchOpen(false);

        if (type === 'product') {
            const product = products.find(p => p.id === id);
            if (product) setSelectedItem({ id: product.id, type: 'product', searchText: '' });
        } else if (type === 'unit') {
            setSelectedItem({ id, type: 'unit', searchText: '' });
        }
    };


    const filteredItems = useMemo((): CombinedItem[] => {
        if (!selectedItem) return [];

        const groupedByItem: { [key: string]: SearchResultItem } = {};

        if (selectedItem.type === 'product') {
            const product = products.find(p => p.id === selectedItem.id);
            if (product) {
                groupedByItem[product.id] = {
                    isUnit: false, unit: null, product,
                    physicalLocations: [],
                    erpStock: stock.find(s => s.itemId === product.id) || null,
                };
            }
        }
        
        inventory.forEach(item => {
            if (groupedByItem[item.itemId]) {
                groupedByItem[item.itemId].physicalLocations.push({
                    path: renderLocationPath(item.locationId, locations),
                    quantity: item.quantity,
                    location: locations.find(l => l.id === item.locationId),
                });
            }
        });
        
        itemLocations.forEach(itemLoc => {
            if (selectedItem.type === 'product' && itemLoc.itemId === selectedItem.id && groupedByItem[itemLoc.itemId]) {
                groupedByItem[itemLoc.itemId].physicalLocations.push({
                    path: renderLocationPath(itemLoc.locationId, locations),
                    clientId: itemLoc.clientId || undefined,
                    location: locations.find(l => l.id === itemLoc.locationId),
                });
            }
        });
        
        return Object.values(groupedByItem).sort((a, b) => (a.product?.id || '').localeCompare(b.product?.id || ''));
    }, [selectedItem, products, inventory, itemLocations, stock, locations]);
    
    const handlePrintLabel = async (product: Product, location: WarehouseLocation) => {
        if (!user) return;
        try {
            const newUnit = await addInventoryUnit({ productId: product.id, locationId: location.id, createdBy: user.name, notes: 'Etiqueta generada desde búsqueda simple.' });
            const scanUrl = `${window.location.origin}/dashboard/scanner?unitId=${newUnit.unitCode}`;
            const qrCodeDataUrl = await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: 'H', width: 200 });

            const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [4, 3] });
            doc.addImage(qrCodeDataUrl, 'PNG', 0.2, 0.2, 1.5, 1.5);
            doc.setFontSize(14).setFont('Helvetica', 'bold').text(`Producto: ${product.id}`, 1.8, 0.4);
            doc.setFontSize(10).setFont('Helvetica', 'normal').text(doc.splitTextToSize(product.description, 1.9), 1.8, 0.6);
            doc.setFontSize(12).setFont('Helvetica', 'bold').text(`Ubicación: ${location.code}`, 1.8, 1.3);
            doc.setFontSize(8).text(`ID Interno: ${newUnit.unitCode}`, 0.2, 2.8).text(`Creado: ${format(new Date(), 'dd/MM/yyyy')}`, 1.8, 2.8);
            doc.save(`etiqueta_unidad_${newUnit.unitCode}.pdf`);
            toast({ title: "Etiqueta Generada", description: `Se creó la unidad ${newUnit.unitCode}.` });
        } catch (err: any) {
            logError("Failed to generate and print label", { error: err.message, productId: product.id });
            toast({ title: 'Error al Imprimir', description: err.message, variant: 'destructive' });
        }
    };


    if (isLoading || !warehouseSettings || !stockSettings) {
        return <div className="flex h-screen w-full items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
    }

    return (
        <div className="flex flex-col min-h-screen bg-muted p-2 md:p-4">
            <header className="flex justify-between items-center p-2 mb-4">
                 <div className="flex items-center gap-2">
                    <WarehouseIcon className="h-8 w-8 text-primary" />
                    <h1 className="text-xl font-bold">Búsqueda Rápida</h1>
                 </div>
                 <Button variant="ghost" size="icon" onClick={logout}><LogOut className="h-5 w-5 text-destructive"/></Button>
            </header>
            <main className="flex-1 overflow-y-auto">
                <div className="space-y-4">
                     <SearchInput
                        options={searchOptions || []}
                        onSelect={handleSelectSearchItem}
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                        onOpenChange={setIsSearchOpen}
                        open={isSearchOpen}
                        placeholder="Escanear o buscar código..."
                        className="text-lg h-14"
                     />
                    
                    <div className="space-y-4 pt-4">
                         {filteredItems.length > 0 ? (
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
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                <Package className="h-5 w-5 text-primary" />
                                                {item.isUnit ? `${item.unit.unitCode} - ${item.product?.description}` : item.product?.description}
                                            </CardTitle>
                                            <CardDescription>{item.isUnit ? `ID legible: ${item.unit.humanReadableId}` : `Código: ${item.product?.id}`}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div>
                                                <h4 className="font-semibold mb-2">Ubicaciones y Cantidades Físicas</h4>
                                                <div className="space-y-2">
                                                    {item.physicalLocations.map((loc, index) => (
                                                        <div key={index} className="flex justify-between items-center p-2 border rounded-md">
                                                            {loc.path}
                                                            <div className="flex items-center gap-1">
                                                                {loc.quantity !== undefined && <span className="font-bold text-lg">{loc.quantity}</span>}
                                                                {item.product && loc.location && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintLabel(item.product!, loc.location!)}><Printer className="h-4 w-4" /></Button>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
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
                        ) : debouncedSearchTerm ? (
                            <div className="text-center py-10 text-muted-foreground"><p>No se encontraron resultados.</p></div>
                        ) : null}
                    </div>
                </div>
            </main>
        </div>
    );
}
