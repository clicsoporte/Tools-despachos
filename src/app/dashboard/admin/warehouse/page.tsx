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
import { getWarehouseSettings, saveWarehouseSettings } from '@/modules/warehouse/lib/actions';
import { Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { WarehouseSettings } from '@/modules/core/types';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useRouter } from 'next/navigation';

export default function WarehouseSettingsPage() {
    useAuthorization(['admin:settings:warehouse']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const router = useRouter();
    
    const [settings, setSettings] = useState<WarehouseSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const settingsData = await getWarehouseSettings();
            setSettings(settingsData);
        } catch (error) {
            logError('Failed to fetch warehouse config data', { error });
            toast({ title: "Error", description: "No se pudieron cargar los datos de configuración del almacén.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        setTitle("Configuración de Almacenes");
        fetchAllData();
    }, [setTitle, fetchAllData]);

    const handleSaveSettings = async () => {
        if (!settings) return;
        try {
            await saveWarehouseSettings(settings);
            toast({ title: "Configuración Guardada", description: "Los ajustes de almacén han sido guardados." });
            logInfo("Warehouse settings updated", { settings });
            router.refresh();
        } catch (error: any) {
            logError("Failed to save warehouse settings", { error: error.message });
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
                        <CardTitle>Configuración de Almacenes</CardTitle>
                        <CardDescription>Ajustes globales para el módulo de almacenes y unidades de inventario.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="unitPrefix">Prefijo de Unidad</Label>
                                <Input
                                    id="unitPrefix"
                                    value={settings.unitPrefix || 'U'}
                                    onChange={(e) => setSettings(prev => prev ? { ...prev, unitPrefix: e.target.value } : null)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="nextUnitNumber">Próximo Nº de Unidad</Label>
                                <Input
                                    id="nextUnitNumber"
                                    type="number"
                                    value={settings.nextUnitNumber || 1}
                                    onChange={(e) => setSettings(prev => prev ? { ...prev, nextUnitNumber: Number(e.target.value) } : null)}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Para reiniciar el consecutivo, cámbielo a 1 y asegúrese de usar un prefijo diferente para evitar duplicados.
                        </p>
                        <Separator />
                        <div className="flex items-center space-x-2">
                             <Switch
                                id="enable-physical-inventory"
                                checked={settings.enablePhysicalInventoryTracking}
                                onCheckedChange={(checked) => setSettings(prev => prev ? { ...prev, enablePhysicalInventoryTracking: checked } : null)}
                            />
                            <Label htmlFor="enable-physical-inventory" className="text-base">Habilitar Control de Inventario Físico</Label>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                           Si está desactivado, el sistema solo permitirá asignar ubicaciones a un artículo (modo informativo). 
                           Si está activado, se habilitará el control de cantidades por ubicación y movimientos de inventario.
                        </p>
                    </CardContent>
                    <CardFooter>
                         <Button onClick={handleSaveSettings}><Save className="mr-2"/> Guardar Configuración</Button>
                    </CardFooter>
                </Card>
            </div>
        </main>
    );
}
