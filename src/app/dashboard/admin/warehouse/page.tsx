/**
 * @fileoverview Page for managing warehouse structure and settings.
 * This component allows administrators to define the hierarchical levels of a warehouse
 * (e.g., Building, Aisle, Rack) and then create the actual physical locations
 * based on that hierarchy. It also controls global warehouse settings.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getWarehouseSettings, saveWarehouseSettings, getStockSettings, saveStockSettings, getContainers, saveContainer, deleteContainer } from '@/modules/warehouse/lib/actions';
import { Save, PlusCircle, Trash2, Palette, Mail, Truck, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { WarehouseSettings, StockSettings, Warehouse, DispatchContainer } from '@/modules/core/types';
import { Separator } from '@/components/ui/separator';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format, parseISO } from 'date-fns';

const defaultColors = [ '#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#ff7300', '#0088fe', '#00c49f', '#ffbb28', '#F44336', '#9C27B0', '#3F51B5', '#009688' ];

export default function WarehouseSettingsPage() {
    const { hasPermission } = useAuthorization(['admin:settings:warehouse', 'admin:settings:stock', 'warehouse:dispatch-containers:manage']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const router = useRouter();
    
    const [warehouseSettings, setWarehouseSettings] = useState<WarehouseSettings | null>(null);
    const [stockSettings, setStockSettings] = useState<StockSettings | null>(null);
    const [dispatchContainers, setDispatchContainers] = useState<DispatchContainer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newWarehouse, setNewWarehouse] = useState<Warehouse>({ id: "", name: "", isDefault: false, isVisible: true, color: '#CCCCCC' });
    const [newContainerName, setNewContainerName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [wSettings, sSettings, dContainers] = await Promise.all([
                getWarehouseSettings(),
                getStockSettings(),
                hasPermission('warehouse:dispatch-containers:manage') ? getContainers() : Promise.resolve([]),
            ]);

            if (wSettings && wSettings.dispatchNotificationEmails === undefined) {
                wSettings.dispatchNotificationEmails = '';
            }

            setWarehouseSettings(wSettings);
            if (!sSettings.warehouses) {
                sSettings.warehouses = [];
            }
            sSettings.warehouses = sSettings.warehouses.map(w => ({...w, color: w.color || '#CCCCCC'}));
            setStockSettings(sSettings);
            setDispatchContainers(dContainers);
        } catch (error) {
            logError('Failed to fetch warehouse/stock config data', { error });
            toast({ title: "Error", description: "No se pudieron cargar los datos de configuración.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast, hasPermission]);
    
    useEffect(() => {
        setTitle("Configuración de Almacenes e Inventario");
        fetchAllData();
    }, [setTitle, fetchAllData]);

    const handleSaveAllSettings = async () => {
        if (!warehouseSettings || !stockSettings) return;
        setIsSubmitting(true);
        try {
            await Promise.all([
                saveWarehouseSettings(warehouseSettings),
                saveStockSettings(stockSettings)
            ]);
            toast({ title: "Configuración Guardada", description: "Los ajustes de almacenes e inventario han sido guardados." });
            logInfo("Warehouse and Stock settings updated");
            router.refresh();
        } catch (error: any) {
            logError("Failed to save warehouse/stock settings", { error: error.message });
            toast({ title: "Error", description: "No se pudieron guardar los ajustes.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleAddWarehouse = () => {
        if (!stockSettings || !newWarehouse.id || !newWarehouse.name) {
            toast({ title: "Datos incompletos", description: "El ID y el Nombre de la bodega son requeridos.", variant: "destructive" });
            return;
        }
        if (stockSettings.warehouses.some(w => w.id === newWarehouse.id)) {
            toast({ title: "ID Duplicado", description: "Ya existe una bodega con ese ID.", variant: "destructive" });
            return;
        }
         
        let warehouses = [...stockSettings.warehouses, newWarehouse];
        if (newWarehouse.isDefault) {
            warehouses = warehouses.map(w => w.id === newWarehouse.id ? w : { ...w, isDefault: false });
        }
        
        setStockSettings(prev => prev ? { ...prev, warehouses } : null);
        setNewWarehouse({ id: "", name: "", isDefault: false, isVisible: true, color: '#CCCCCC' });
    };
    
    const handleWarehouseChange = (id: string, field: keyof Warehouse, value: any) => {
        if (!stockSettings) return;
        let warehouses = stockSettings.warehouses.map(w => {
            if (w.id === id) {
                return { ...w, [field]: value };
            }
            return w;
        });

        if (field === 'isDefault' && value === true) {
            warehouses = warehouses.map(w => w.id === id ? w : { ...w, isDefault: false });
        }

        setStockSettings(prev => prev ? { ...prev, warehouses } : null);
    };

    const handleDeleteWarehouse = (id: string) => {
        if (!stockSettings) return;
        setStockSettings(prev => prev ? { ...prev, warehouses: prev.warehouses.filter(w => w.id !== id) } : null);
    };

    const handleAddContainer = async () => {
        if (!newContainerName.trim()) {
            toast({ title: 'Nombre requerido', variant: 'destructive'});
            return;
        }
        setIsSubmitting(true);
        try {
            await saveContainer({ name: newContainerName, createdBy: '' }, ''); // User info is handled server-side
            setNewContainerName('');
            await fetchAllData();
            toast({ title: 'Contenedor Creado'});
        } catch (error: any) {
            logError('Failed to add dispatch container', { error: error.message });
            toast({ title: 'Error', description: `No se pudo crear el contenedor. ${error.message}`, variant: 'destructive'});
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteContainer = async (id: number) => {
        setIsSubmitting(true);
        try {
            await deleteContainer(id);
            await fetchAllData();
            toast({ title: 'Contenedor Eliminado', variant: 'destructive'});
        } catch (error: any) {
            logError('Failed to delete dispatch container', { error: error.message });
            toast({ title: 'Error', description: `No se pudo eliminar el contenedor. ${error.message}`, variant: 'destructive'});
        } finally {
            setIsSubmitting(false);
        }
    };


    if (isLoading || !warehouseSettings || !stockSettings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-2xl space-y-6">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>Configuración de Almacenes e Inventario</CardTitle>
                        <CardDescription>Ajustes globales para los módulos de almacenes, unidades de inventario y desglose de existencias.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-4 rounded-lg border p-4">
                            <h3 className="font-semibold">Unidades de Inventario (Etiquetas QR)</h3>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="unitPrefix">Prefijo de Unidad</Label>
                                    <Input
                                        id="unitPrefix"
                                        value={warehouseSettings.unitPrefix || 'U'}
                                        onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, unitPrefix: e.target.value } : null)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="nextUnitNumber">Próximo Nº de Unidad</Label>
                                    <Input
                                        id="nextUnitNumber"
                                        type="number"
                                        value={warehouseSettings.nextUnitNumber || 1}
                                        onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, nextUnitNumber: Number(e.target.value) } : null)}
                                    />
                                </div>
                            </div>
                         </div>
                        <Separator />
                        <div className="space-y-4 rounded-lg border p-4">
                            <h3 className="font-semibold">Gestión de Bodegas (para desglose de stock ERP)</h3>
                            <CardDescription className="mb-4">
                                Define las bodegas que existen en tu ERP para que el sistema pueda mostrar el desglose de inventario correctamente. Asigna un color para una fácil identificación visual.
                            </CardDescription>
                            <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                            {stockSettings.warehouses.map(wh => (
                                    <div key={wh.id} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-lg border p-3">
                                        <div>
                                            <p className="font-medium flex items-center gap-2">
                                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: wh.color }}></span>
                                                {wh.name} (<span className="font-mono">{wh.id}</span>)
                                            </p>
                                            <div className="flex items-center gap-4 mt-2">
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox id={`default-${wh.id}`} checked={wh.isDefault} onCheckedChange={(checked) => handleWarehouseChange(wh.id, 'isDefault', checked)} />
                                                    <Label htmlFor={`default-${wh.id}`} className="text-xs">Predeterm.</Label>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox id={`visible-${wh.id}`} checked={wh.isVisible} onCheckedChange={(checked) => handleWarehouseChange(wh.id, 'isVisible', checked)} />
                                                    <Label htmlFor={`visible-${wh.id}`} className="text-xs">Visible</Label>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="text"
                                                value={wh.color}
                                                onChange={(e) => handleWarehouseChange(wh.id, 'color', e.target.value)}
                                                className="w-24 h-8"
                                            />
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" size="icon" className="h-8 w-8"><Palette className="h-4 w-4" /></Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-48 p-2">
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {defaultColors.map(color => (
                                                            <button
                                                                key={color}
                                                                className={cn("h-8 w-8 rounded-full border", color === wh.color && "ring-2 ring-ring")}
                                                                style={{ backgroundColor: color }}
                                                                onClick={() => handleWarehouseChange(wh.id, 'color', color)}
                                                            />
                                                        ))}
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteWarehouse(wh.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Separator />
                            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 pt-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="warehouse-id">ID Bodega (desde ERP)</Label>
                                    <Input id="warehouse-id" value={newWarehouse.id} onChange={(e) => setNewWarehouse(prev => ({ ...prev, id: e.target.value }))} placeholder="Ej: 01" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="warehouse-name">Nombre Bodega</Label>
                                    <Input id="warehouse-name" value={newWarehouse.name} onChange={(e) => setNewWarehouse(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Bodega Principal" />
                                </div>
                                <Button size="icon" onClick={handleAddWarehouse}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <Separator />
                         <div className="space-y-4 rounded-lg border p-4">
                            <h3 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4"/>Notificaciones Automáticas de Despacho</h3>
                            <CardDescription className="mb-4">
                                Ingresa una lista de correos que recibirán una copia del comprobante de despacho cada vez que se finalice una verificación. Sepáralos por comas.
                            </CardDescription>
                            <Textarea
                                id="dispatchEmails"
                                placeholder="supervisor@ejemplo.com, logistica@ejemplo.com"
                                value={warehouseSettings.dispatchNotificationEmails || ''}
                                onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, dispatchNotificationEmails: e.target.value } : null)}
                                rows={3}
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                         <Button onClick={handleSaveAllSettings} disabled={isSubmitting}><Save className="mr-2"/> Guardar Configuración</Button>
                    </CardFooter>
                </Card>
                {hasPermission('warehouse:dispatch-containers:manage') && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5"/>Gestión de Contenedores de Despacho</CardTitle>
                            <CardDescription>Crea o elimina los "contenedores" que representan las rutas de despacho.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                                {dispatchContainers.map(container => (
                                    <div key={container.id} className="flex items-center justify-between rounded-lg border p-3">
                                        <div>
                                            <p className="font-medium">{container.name}</p>
                                            <p className="text-xs text-muted-foreground">Creado por {container.createdBy} el {format(parseISO(container.createdAt), 'dd/MM/yyyy')}</p>
                                        </div>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isSubmitting}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Eliminar Contenedor?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Se eliminará el contenedor &quot;{container.name}&quot; y todas sus asignaciones. Esta acción no se puede deshacer.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteContainer(container.id!)}>Sí, eliminar</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                ))}
                            </div>
                            <Separator />
                            <div className="flex items-end gap-2 pt-2">
                                <div className="grid flex-1 gap-2">
                                    <Label htmlFor="new-container-name">Nombre del Nuevo Contenedor</Label>
                                    <Input id="new-container-name" value={newContainerName} onChange={(e) => setNewContainerName(e.target.value)} placeholder="Ej: Ruta San José" onKeyDown={(e) => e.key === 'Enter' && handleAddContainer()} />
                                </div>
                                <Button size="icon" onClick={handleAddContainer} disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <PlusCircle className="h-4 w-4" />}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
    );
}
