
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import { logError, logInfo } from "@/modules/core/lib/logger";
import type { Warehouse, StockSettings } from "@/modules/core/types";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { getStockSettings, saveStockSettings } from "@/modules/core/lib/db";
import { PlusCircle, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";

export default function StockSettingsPage() {
    useAuthorization(['admin:settings:stock']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const router = useRouter();
    const [settings, setSettings] = useState<StockSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [newWarehouse, setNewWarehouse] = useState<Warehouse>({ id: "", name: "", isDefault: false, isVisible: true });

    useEffect(() => {
        setTitle("Configuración de Inventario");
        const loadSettings = async () => {
            setIsLoading(true);
            const currentSettings = await getStockSettings();
            if (!currentSettings.warehouses) {
                currentSettings.warehouses = [];
            }
            setSettings(currentSettings);
            setIsLoading(false);
        };
        loadSettings();
    }, [setTitle]);

    const handleAddWarehouse = () => {
        if (!settings || !newWarehouse.id || !newWarehouse.name) {
            toast({ title: "Datos incompletos", description: "El ID y el Nombre de la bodega son requeridos.", variant: "destructive" });
            return;
        }
        if (settings.warehouses.some(w => w.id === newWarehouse.id)) {
            toast({ title: "ID Duplicado", description: "Ya existe una bodega con ese ID.", variant: "destructive" });
            return;
        }
         
        let warehouses = [...settings.warehouses, newWarehouse];
        // If the new warehouse is set as default, unset all others
        if (newWarehouse.isDefault) {
            warehouses = warehouses.map(w => w.id === newWarehouse.id ? w : { ...w, isDefault: false });
        }
        
        setSettings(prev => prev ? { ...prev, warehouses } : null);
        setNewWarehouse({ id: "", name: "", isDefault: false, isVisible: true });
    };
    
    const handleWarehouseChange = (id: string, field: keyof Warehouse, value: any) => {
        if (!settings) return;
        let warehouses = settings.warehouses.map(w => {
            if (w.id === id) {
                return { ...w, [field]: value };
            }
            return w;
        });

        // If a warehouse is set as default, unset all others
        if (field === 'isDefault' && value === true) {
            warehouses = warehouses.map(w => w.id === id ? w : { ...w, isDefault: false });
        }

        setSettings(prev => prev ? { ...prev, warehouses } : null);
    };

    const handleDeleteWarehouse = (id: string) => {
        if (!settings) return;
        setSettings(prev => prev ? { ...prev, warehouses: prev.warehouses.filter(w => w.id !== id) } : null);
    };

    const handleSave = async () => {
        if (!settings) return;
        try {
            await saveStockSettings(settings);
            toast({ title: "Configuración Guardada", description: "Los ajustes de inventario han sido guardados." });
            await logInfo("Stock settings updated", { settings });
            router.refresh();
        } catch (error: any) {
            logError("Failed to save stock settings", { error: error.message });
            toast({ title: "Error", description: "No se pudieron guardar los ajustes.", variant: "destructive" });
        }
    };

    if (isLoading || !settings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-2xl space-y-6">
                    <Skeleton className="h-64 w-full" />
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-2xl space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Gestión de Bodegas</CardTitle>
                        <CardDescription>
                            Configura las bodegas para el desglose de inventario. El sistema mostrará por defecto
                            la bodega marcada como &quot;Predeterminada&quot;.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="max-h-96 overflow-y-auto pr-2 space-y-2">
                           {settings.warehouses.map(wh => (
                                <div key={wh.id} className="flex items-center justify-between rounded-lg border p-3">
                                    <div>
                                        <p className="font-medium">{wh.name} (<span className="font-mono">{wh.id}</span>)</p>
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
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteWarehouse(wh.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                         <Separator />
                        <div className="flex items-end gap-2 pt-2">
                            <div className="grid flex-1 gap-2">
                                <Label htmlFor="warehouse-id">ID Bodega (desde ERP)</Label>
                                <Input id="warehouse-id" value={newWarehouse.id} onChange={(e) => setNewWarehouse(prev => ({ ...prev, id: e.target.value }))} placeholder="Ej: 01" />
                            </div>
                            <div className="grid flex-1 gap-2">
                                <Label htmlFor="warehouse-name">Nombre Bodega</Label>
                                <Input id="warehouse-name" value={newWarehouse.name} onChange={(e) => setNewWarehouse(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Bodega Principal" />
                            </div>
                            <Button size="icon" onClick={handleAddWarehouse}>
                                <PlusCircle className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardFooter className="border-t px-6 py-4">
                        <Button onClick={handleSave}>Guardar Todos los Cambios</Button>
                    </CardFooter>
                </Card>
            </div>
        </main>
    );
}
