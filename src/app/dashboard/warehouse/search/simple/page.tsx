/**
 * @fileoverview Simplified warehouse search page, optimized for mobile devices.
 * This component provides a minimal UI for warehouse workers to quickly look up items.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWarehouseData, getInventoryUnitById, addInventoryUnit } from '@/modules/warehouse/lib/actions';
import type { WarehouseLocation, WarehouseInventoryItem, Product, StockInfo, StockSettings, ItemLocation, Customer, InventoryUnit } from '@/modules/core/types';
import { Search, MapPin, Package, Building, Waypoints, Box, Layers, Warehouse as WarehouseIcon, Loader2, Info, User, ChevronRight, Printer, LogOut } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Button } from '@/components/ui/button';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import jsPDF from "jspdf";
import QRCode from 'qrcode';
import { format } from 'date-fns';

type SearchableItem = {
  id: string;
  type: 'product' | 'customer';
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
        case 'bin': return <div className="h-5 w-5 text-muted-foreground font-bold text-center">B</div>;
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
    const [exactMatch, setExactMatch] = useState(true);
    const [debouncedSearchTerm] = useDebounce(searchTerm, companyData?.searchDebounceTime ?? 500);
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [inventory, setInventory] = useState<WarehouseInventoryItem[]>([]);
    const [itemLocations, setItemLocations] = useState<ItemLocation[]>([]);
    const [stock, setStock] = useState<StockInfo[]>([]);
    const [stockSettings, setStockSettings] = useState<StockSettings | null>(null);
    const [warehouseSettings, setWarehouseSettings] = useState<{ enablePhysicalInventoryTracking: boolean, unitPrefix?: string } | null>(null);

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
    
    useEffect(() => {
        const performUnitSearch = async () => {
            const normalizedSearch = debouncedSearchTerm.trim().toUpperCase();
            if (exactMatch && normalizedSearch.startsWith(warehouseSettings?.unitPrefix || 'U')) {
                setIsLoading(true);
                try {
                    const unit = await getInventoryUnitById(normalizedSearch);
                    setUnitSearchResult(unit);
                } catch(e) {
                    setUnitSearchResult(null);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setUnitSearchResult(null);
            }
        };
        performUnitSearch();
    }, [debouncedSearchTerm, exactMatch, warehouseSettings?.unitPrefix]);


    const filteredItems = useMemo((): CombinedItem[] => {
        if (unitSearchResult) {
            const product = products.find(p => p.id === unitSearchResult.productId);
            const erpStock = stock.find(s => s.itemId === unitSearchResult.productId);
            return [{
                isUnit: true,
                unit: unitSearchResult,
                product: product || { id: unitSearchResult.productId, description: `Artículo ${unitSearchResult.productId}`, active: 'S', cabys: '', classification: '', isBasicGood: 'N', lastEntry: '', notes: '', unit: '' },
                physicalLocations: [{
                    path: renderLocationPath(unitSearchResult.locationId, locations),
                    location: locations.find(l => l.id === unitSearchResult.locationId),
                }],
                erpStock: erpStock || null,
            }]
        }
        
        if (!debouncedSearchTerm) return [];
        const normalizedSearch = normalizeText(debouncedSearchTerm);
        
        let matchedIndexItems: SearchableItem[] = [];
        
        if (exactMatch) {
             if (normalizedSearch.toUpperCase().startsWith(warehouseSettings?.unitPrefix || 'U')) return [];
             const exactMatchLower = normalizedSearch.toLowerCase();
             matchedIndexItems = products.filter(p => normalizeText(p.id).toLowerCase() === exactMatchLower).map(p => ({ id: p.id, type: 'product', searchText: '' }));
        } else {
            const searchTerms = normalizedSearch.split(' ').filter(Boolean);
            if (searchTerms.length === 0) return [];
            matchedIndexItems = products.filter(p => {
                const targetText = normalizeText(`${p.id} ${p.description}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(p => ({ id: p.id, type: 'product', searchText: '' }));
        }

        const relevantProductIds = new Set(matchedIndexItems.map(i => i.id));
        const groupedByItem: { [key: string]: SearchResultItem } = {};

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
                        quantity: item.quantity,
                        location: locations.find(l => l.id === item.locationId),
                    });
                }
            });
        } else {
             itemLocations.forEach(itemLoc => {
                if (groupedByItem[itemLoc.itemId]) {
                    groupedByItem[itemLoc.itemId].physicalLocations.push({
                        path: renderLocationPath(itemLoc.locationId, locations),
                        clientId: itemLoc.clientId || undefined,
                        location: locations.find(l => l.id === itemLoc.locationId),
                    });
                } 
            });
        }
        
        return Object.values(groupedByItem).sort((a, b) => (a.product?.id || '').localeCompare(b.product?.id || ''));

    }, [debouncedSearchTerm, products, inventory, itemLocations, stock, warehouseSettings, locations, exactMatch, unitSearchResult]);
    
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
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Escanear o buscar código..."
                            className="w-full pl-10 text-lg h-14"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="exact-match-simple" checked={exactMatch} onCheckedChange={(checked) => setExactMatch(checked as boolean)} />
                        <Label htmlFor="exact-match-simple">Buscar coincidencia exacta de código / ID</Label>
                    </div>

                    <div className="space-y-4 pt-4">
                         {filteredItems.length > 0 ? (
                            filteredItems.map((item, itemIndex) => (
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
                                            <h4 className="font-semibold mb-2">Ubicaciones Asignadas</h4>
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
                                            {item.erpStock && stockSettings ? (
                                                <div className="space-y-2">
                                                    {Object.entries(item.erpStock.stockByWarehouse)
                                                        .filter(([, qty]) => qty > 0)
                                                        .map(([whId, qty]) => {
                                                            const warehouse = stockSettings.warehouses.find(w => w.id === whId);
                                                            return warehouse?.isVisible ? (
                                                                <div key={whId} className="flex justify-between items-center p-2 border rounded-md">
                                                                    <span>{warehouse.name} ({whId})</span>
                                                                    <span className="font-bold text-lg">{qty.toLocaleString('es-CR')}</span>
                                                                </div>
                                                            ) : null;
                                                    })}
                                                    <Separator />
                                                    <div className="flex justify-between items-center p-2 font-bold">
                                                        <span>Total ERP</span>
                                                        <span className="text-xl">{item.erpStock.totalStock.toLocaleString('es-CR')}</span>
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
                            <div className="text-center py-10 text-muted-foreground"><p>No se encontraron resultados.</p></div>
                        ) : null}
                    </div>
                </div>
            </main>
        </div>
    );
}
