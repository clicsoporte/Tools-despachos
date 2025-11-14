

"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import { logError, logInfo } from "@/modules/core/lib/logger";
import type { RequestSettings } from "@/modules/core/types";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { getRequestSettings, saveRequestSettings } from "@/modules/requests/lib/actions";
import { PlusCircle, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";

const availableColumns = [
    { id: 'consecutive', label: 'Solicitud' },
    { id: 'itemDescription', label: 'Artículo' },
    { id: 'clientName', label: 'Cliente' },
    { id: 'quantity', label: 'Cant.' },
    { id: 'requiredDate', label: 'Fecha Req.' },
    { id: 'status', label: 'Estado' },
    { id: 'requestedBy', label: 'Solicitante' },
    { id: 'purchaseOrder', label: 'OC Cliente' },
    { id: 'manualSupplier', label: 'Proveedor' },
];


export default function RequestSettingsPage() {
    const { isAuthorized } = useAuthorization(['admin:settings:requests']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const [settings, setSettings] = useState<RequestSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [newRoute, setNewRoute] = useState("");
    const [newShippingMethod, setNewShippingMethod] = useState("");

    useEffect(() => {
        setTitle("Configuración de Compras");
        const loadSettings = async () => {
            setIsLoading(true);
            const currentSettings = await getRequestSettings();
            if (currentSettings) {
                if (!Array.isArray(currentSettings.shippingMethods)) {
                    currentSettings.shippingMethods = [];
                }
                if (currentSettings.useWarehouseReception === undefined) {
                    currentSettings.useWarehouseReception = false;
                }
                 if (!currentSettings.pdfPaperSize) {
                    currentSettings.pdfPaperSize = 'letter';
                }
                if (!currentSettings.pdfOrientation) {
                    currentSettings.pdfOrientation = 'portrait';
                }
                if (!currentSettings.pdfExportColumns) {
                    currentSettings.pdfExportColumns = availableColumns.map(c => c.id);
                }
                 if (currentSettings.showCustomerTaxId === undefined) {
                    currentSettings.showCustomerTaxId = true;
                }
                if (currentSettings.useErpEntry === undefined) {
                    currentSettings.useErpEntry = false;
                }
            }
            setSettings(currentSettings);
            setIsLoading(false);
        };
        if (isAuthorized) {
            loadSettings();
        }
    }, [setTitle, isAuthorized]);

    const handleAddRoute = () => {
        if (!settings || !newRoute.trim()) {
            toast({ title: "Datos incompletos", description: "El nombre de la ruta no puede estar vacío.", variant: "destructive" });
            return;
        }
        if (settings.routes.some(r => r.toLowerCase() === newRoute.trim().toLowerCase())) {
            toast({ title: "Ruta Duplicada", description: "Esa ruta ya existe.", variant: "destructive" });
            return;
        }
        setSettings(prev => {
            if (!prev) return null;
            const updatedRoutes = [...prev.routes, newRoute.trim()];
            return { ...prev, routes: updatedRoutes };
        });
        setNewRoute("");
    };

    const handleDeleteRoute = useCallback((routeToDelete: string) => {
        if (!settings) return;
        setSettings(prev => {
            if (!prev) return null;
            const updatedRoutes = prev.routes.filter(r => r !== routeToDelete);
            return { ...prev, routes: updatedRoutes };
        });
        toast({ title: "Ruta Eliminada", description: "La ruta ha sido eliminada. Guarda los cambios para confirmar.", variant: "destructive"});
    }, [settings, toast]);

    const handleAddShippingMethod = () => {
        if (!settings || !newShippingMethod.trim()) {
            toast({ title: "Datos incompletos", description: "El método de envío no puede estar vacío.", variant: "destructive" });
            return;
        }
        if (settings.shippingMethods.some(s => s.toLowerCase() === newShippingMethod.trim().toLowerCase())) {
            toast({ title: "Método Duplicado", description: "Ese método de envío ya existe.", variant: "destructive" });
            return;
        }
        setSettings(prev => {
            if (!prev) return null;
            const updatedMethods = [...prev.shippingMethods, newShippingMethod.trim()];
            return { ...prev, shippingMethods: updatedMethods };
        });
        setNewShippingMethod("");
    };

    const handleDeleteShippingMethod = useCallback((methodToDelete: string) => {
        if (!settings) return;
        setSettings(prev => {
            if (!prev) return null;
            const updatedMethods = prev.shippingMethods.filter(s => s !== methodToDelete);
            return { ...prev, shippingMethods: updatedMethods };
        });
        toast({ title: "Método de Envío Eliminado", description: "El método ha sido eliminado. Guarda los cambios para confirmar.", variant: "destructive"});
    }, [settings, toast]);

    const handlePdfColumnChange = (columnId: string, checked: boolean) => {
        if (!settings) return;
        setSettings(prev => {
            if (!prev) return null;
            const currentColumns = prev.pdfExportColumns || [];
            const newColumns = checked 
                ? [...currentColumns, columnId]
                : currentColumns.filter(id => id !== columnId);
            return { ...prev, pdfExportColumns: newColumns };
        });
    };


    const handleSave = async () => {
        if (!settings) return;
        try {
            await saveRequestSettings(settings);
            toast({ title: "Configuración Guardada", description: "Los ajustes de compras han sido guardados." });
            await logInfo("Request settings updated", { settings });
        } catch (error: any) {
            logError("Failed to save request settings", { error: error.message });
            toast({ title: "Error", description: "No se pudieron guardar los ajustes.", variant: "destructive" });
        }
    };
    
    if (!isAuthorized) {
        return null;
    }

    if (isLoading || !settings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-4xl space-y-6">
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
                        <CardTitle>Configuración General de Compras</CardTitle>
                        <CardDescription>Ajustes generales para el módulo de solicitudes de compra.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="requestPrefix">Prefijo de Solicitud</Label>
                                <Input
                                    id="requestPrefix"
                                    value={settings.requestPrefix || 'SC-'}
                                    onChange={(e) => setSettings(prev => prev ? { ...prev, requestPrefix: e.target.value } : null)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="nextRequestNumber">Próximo Número de Solicitud</Label>
                                <Input
                                    id="nextRequestNumber"
                                    type="number"
                                    value={settings.nextRequestNumber || 1}
                                    onChange={(e) => setSettings(prev => prev ? { ...prev, nextRequestNumber: Number(e.target.value) } : null)}
                                />
                            </div>
                        </div>
                        <Separator />
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="show-customer-tax-id-req"
                                    checked={settings.showCustomerTaxId}
                                    onCheckedChange={(checked) => setSettings(prev => prev ? { ...prev, showCustomerTaxId: checked } : null)}
                                />
                                <Label htmlFor="show-customer-tax-id-req">Mostrar cédula junto al nombre del cliente</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="use-warehouse"
                                    checked={settings.useWarehouseReception}
                                    onCheckedChange={(checked) => setSettings(prev => prev ? { ...prev, useWarehouseReception: checked } : null)}
                                />
                                <Label htmlFor="use-warehouse">Habilitar paso de &quot;Recibido en Bodega&quot;</Label>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">
                                Si se activa, las solicitudes recibidas necesitarán un paso adicional para ser archivadas.
                            </p>
                             <div className="flex items-center space-x-2">
                                <Switch
                                    id="use-erp-entry"
                                    checked={settings.useErpEntry}
                                    onCheckedChange={(checked) => setSettings(prev => prev ? { ...prev, useErpEntry: checked } : null)}
                                />
                                <Label htmlFor="use-erp-entry">Habilitar paso de &quot;Ingresado en ERP&quot;</Label>
                            </div>
                             <p className="text-sm text-muted-foreground mt-2">
                                Requiere que &quot;Recibido en Bodega&quot; esté activo. Añade un estado final para registrar el ingreso al ERP.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Accordion type="multiple" defaultValue={['pdf-export']} className="w-full space-y-6">
                     <Card>
                        <AccordionItem value="pdf-export">
                            <AccordionTrigger className="p-6">
                                <CardTitle>Configuración de Exportación a PDF</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                <CardDescription className="mb-4">Personaliza el contenido y formato de los reportes PDF de compras.</CardDescription>
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="pdf-top-legend">Leyenda Superior del PDF (Opcional)</Label>
                                        <Input
                                            id="pdf-top-legend"
                                            value={settings.pdfTopLegend || ''}
                                            onChange={(e) => setSettings(prev => prev ? { ...prev, pdfTopLegend: e.target.value } : null)}
                                            placeholder="Ej: Documento Controlado - Versión 1.0"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label>Tamaño del Papel</Label>
                                            <RadioGroup
                                                value={settings.pdfPaperSize}
                                                onValueChange={(value) => setSettings(prev => prev ? { ...prev, pdfPaperSize: value as 'letter' | 'legal' } : null)}
                                                className="flex items-center gap-4"
                                            >
                                                <div className="flex items-center space-x-2">
                                                    <RadioGroupItem value="letter" id="r-req-letter" />
                                                    <Label htmlFor="r-req-letter">Carta (Letter)</Label>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <RadioGroupItem value="legal" id="r-req-legal" />
                                                    <Label htmlFor="r-req-legal">Oficio (Legal)</Label>
                                                </div>
                                            </RadioGroup>
                                        </div>
                                         <div className="space-y-2">
                                            <Label>Orientación</Label>
                                            <RadioGroup
                                                value={settings.pdfOrientation}
                                                onValueChange={(value) => setSettings(prev => prev ? { ...prev, pdfOrientation: value as 'portrait' | 'landscape' } : null)}
                                                className="flex items-center gap-4"
                                            >
                                                <div className="flex items-center space-x-2">
                                                    <RadioGroupItem value="portrait" id="r-req-portrait" />
                                                    <Label htmlFor="r-req-portrait">Vertical</Label>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <RadioGroupItem value="landscape" id="r-req-landscape" />
                                                    <Label htmlFor="r-req-landscape">Horizontal</Label>
                                                </div>
                                            </RadioGroup>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <Label>Columnas a Incluir en el Reporte</Label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border rounded-md">
                                            {availableColumns.map(col => (
                                                <div key={col.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`pdf-col-req-${col.id}`}
                                                        checked={settings.pdfExportColumns.includes(col.id)}
                                                        onCheckedChange={(checked) => handlePdfColumnChange(col.id, checked as boolean)}
                                                    />
                                                    <Label htmlFor={`pdf-col-req-${col.id}`} className="font-normal">{col.label}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>
                </Accordion>

                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestión de Rutas</CardTitle>
                            <CardDescription>Añade o elimina las rutas de entrega disponibles para las solicitudes de compra.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                                {settings.routes.map(route => (
                                    <div key={route} className="flex items-center justify-between rounded-lg border p-3">
                                        <p className="font-medium">{route}</p>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteRoute(route)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <Separator />
                            <div className="flex items-end gap-2 pt-2">
                                <div className="grid flex-1 gap-2">
                                    <Label htmlFor="new-route">Nueva Ruta</Label>
                                    <Input id="new-route" value={newRoute} onChange={(e) => setNewRoute(e.target.value)} placeholder="Ej: Zona Norte" />
                                </div>
                                <Button size="icon" onClick={handleAddRoute}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                     <Card>
                        <CardHeader>
                            <CardTitle>Métodos de Envío</CardTitle>
                            <CardDescription>Añade o elimina los métodos de envío para las solicitudes de compra.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                           <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                             {settings.shippingMethods.map(method => (
                                <div key={method} className="flex items-center justify-between rounded-lg border p-3">
                                    <p className="font-medium">{method}</p>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteShippingMethod(method)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                             ))}
                           </div>
                            <Separator />
                            <div className="flex items-end gap-2 pt-2">
                                <div className="grid flex-1 gap-2">
                                    <Label htmlFor="new-shipping-method">Nuevo Método de Envío</Label>
                                    <Input id="new-shipping-method" value={newShippingMethod} onChange={(e) => setNewShippingMethod(e.target.value)} placeholder="Ej: Encomienda" />
                                </div>
                                <Button size="icon" onClick={handleAddShippingMethod}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
             <Card className="mt-6 max-w-4xl mx-auto">
                <CardFooter className="border-t px-6 py-4">
                    <Button onClick={handleSave}>Guardar Todos los Cambios</Button>
                </CardFooter>
            </Card>
        </main>
    );
}
