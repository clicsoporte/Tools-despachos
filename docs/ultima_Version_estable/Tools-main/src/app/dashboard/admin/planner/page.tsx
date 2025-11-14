

'use client';

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import { logError, logInfo } from "@/modules/core/lib/logger";
import type { PlannerMachine, PlannerSettings, CustomStatus, PlannerShift } from "@/modules/core/types";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { getPlannerSettings, savePlannerSettings } from "@/modules/planner/lib/actions";
import { PlusCircle, Trash2, Palette, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRouter } from "next/navigation";

const defaultColors = [ '#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#ff7300', '#0088fe', '#00c49f', '#ffbb28' ];

const availableColumns = [
    { id: 'consecutive', label: 'Nº Orden (OP)' },
    { id: 'customerName', label: 'Cliente' },
    { id: 'productDescription', label: 'Producto' },
    { id: 'quantity', label: 'Cant.' },
    { id: 'deliveryDate', label: 'Fecha Entrega' },
    { id: 'scheduledDate', label: 'Fecha Programada' },
    { id: 'status', label: 'Estado' },
    { id: 'machineId', label: 'Asignación' },
    { id: 'priority', label: 'Prioridad' },
];

const availableFieldsToTrack = [
    { id: 'quantity', label: 'Cantidad' },
    { id: 'deliveryDate', label: 'Fecha Entrega' },
    { id: 'notes', label: 'Notas' },
    { id: 'purchaseOrder', label: 'Nº OC Cliente' },
    { id: 'customerId', label: 'Cliente' },
    { id: 'productId', label: 'Producto' },
]


export default function PlannerSettingsPage() {
    const { isAuthorized } = useAuthorization(['admin:settings:planner']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const router = useRouter();
    const [settings, setSettings] = useState<PlannerSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [newMachine, setNewMachine] = useState({ id: "", name: "" });
    const [newShift, setNewShift] = useState<PlannerShift>({ id: "", name: "" });

    useEffect(() => {
        setTitle("Configuración del Planificador");
        const loadSettings = async () => {
            setIsLoading(true);
            const currentSettings = await getPlannerSettings();
            if (!currentSettings.assignmentLabel) currentSettings.assignmentLabel = 'Máquina Asignada';
            if (!currentSettings.shiftLabel) currentSettings.shiftLabel = 'Turno';
            if (!currentSettings.shifts) currentSettings.shifts = [{ id: 'turno-a', name: 'Turno A'}, {id: 'turno-b', name: 'Turno B'}];
            if (!currentSettings.requireShiftForCompletion) currentSettings.requireShiftForCompletion = false;

            if (!currentSettings.customStatuses || currentSettings.customStatuses.length < 4) {
                 currentSettings.customStatuses = [
                    { id: 'custom-1', label: '', color: '#8884d8', isActive: false },
                    { id: 'custom-2', label: '', color: '#82ca9d', isActive: false },
                    { id: 'custom-3', label: '', color: '#ffc658', isActive: false },
                    { id: 'custom-4', label: '', color: '#ff8042', isActive: false },
                ];
            }
            if (!currentSettings.pdfPaperSize) currentSettings.pdfPaperSize = 'letter';
            if (!currentSettings.pdfOrientation) currentSettings.pdfOrientation = 'portrait';
            if (!currentSettings.pdfExportColumns || currentSettings.pdfExportColumns.length === 0) currentSettings.pdfExportColumns = availableColumns.map(c => c.id);
            if (!Array.isArray(currentSettings.fieldsToTrackChanges)) currentSettings.fieldsToTrackChanges = ['quantity', 'deliveryDate', 'customerId', 'productId'];
            if (currentSettings.showCustomerTaxId === undefined) currentSettings.showCustomerTaxId = true;
            
            setSettings(currentSettings);
            setIsLoading(false);
        };
        if (isAuthorized) {
            loadSettings();
        }
    }, [setTitle, isAuthorized]);

    const handleAddMachine = () => {
        if (!settings || !newMachine.id || !newMachine.name) {
            toast({ title: "Datos incompletos", description: "El ID y el Nombre de la máquina son requeridos.", variant: "destructive" });
            return;
        }
        if (settings.machines.some(m => m.id === newMachine.id)) {
            toast({ title: "ID Duplicado", description: "Ya existe una máquina con ese ID.", variant: "destructive" });
            return;
        }
        setSettings(prev => prev ? { ...prev, machines: [...prev.machines, newMachine] } : null);
        setNewMachine({ id: "", name: "" });
    };

    const handleDeleteMachine = useCallback((id: string) => {
        if (!settings) return;
        setSettings(prev => prev ? { ...prev, machines: prev.machines.filter(m => m.id !== id) } : null);
        toast({ title: "Asignación Eliminada", description: "La asignación ha sido eliminada. Guarda los cambios para confirmar.", variant: "destructive"});
    }, [settings, toast]);
    
    const handleAddShift = () => {
        if (!settings || !newShift.id || !newShift.name) {
            toast({ title: "Datos incompletos", description: "El ID y el Nombre del turno son requeridos.", variant: "destructive" });
            return;
        }
        if (settings.shifts.some(s => s.id === newShift.id)) {
            toast({ title: "ID Duplicado", description: "Ya existe un turno con ese ID.", variant: "destructive" });
            return;
        }
        setSettings(prev => prev ? { ...prev, shifts: [...prev.shifts, newShift] } : null);
        setNewShift({ id: "", name: "" });
    };
    
    const handleDeleteShift = useCallback((id: string) => {
        if (!settings) return;
        setSettings(prev => prev ? { ...prev, shifts: prev.shifts.filter(s => s.id !== id) } : null);
        toast({ title: "Turno Eliminado", description: "El turno ha sido eliminado. Guarda los cambios para confirmar.", variant: "destructive"});
    }, [settings, toast]);

    const handleCustomStatusChange = (id: CustomStatus['id'], field: keyof CustomStatus, value: any) => {
        if (!settings) return;
        setSettings(prev => {
            if (!prev) return null;
            const updatedStatuses = prev.customStatuses.map(cs => 
                cs.id === id ? { ...cs, [field]: value } : cs
            );
            return { ...prev, customStatuses: updatedStatuses };
        });
    };

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

    const handleFieldToTrackChange = (fieldId: string, checked: boolean) => {
        if (!settings) return;
        setSettings(prev => {
            if (!prev) return null;
            const currentFields = prev.fieldsToTrackChanges || [];
            const newFields = checked
                ? [...currentFields, fieldId]
                : currentFields.filter(id => id !== fieldId);
            return { ...prev, fieldsToTrackChanges: newFields };
        });
    }

    const handleSave = async () => {
        if (!settings) return;
        try {
            await savePlannerSettings(settings);
            toast({ title: "Configuración Guardada", description: "Los ajustes del planificador han sido guardados." });
            await logInfo("Planner settings updated", { settings });
            router.refresh();
        } catch (error: any) {
            logError("Failed to save planner settings", { error: error.message });
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
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-96 w-full" />
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Configuración General del Planificador</CardTitle>
                        <CardDescription>Ajustes generales para el módulo de planificación de producción.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div className="space-y-2">
                                <Label htmlFor="orderPrefix">Prefijo de Orden de Producción</Label>
                                <Input
                                    id="orderPrefix"
                                    value={settings.orderPrefix || 'OP-'}
                                    onChange={(e) => setSettings(prev => prev ? { ...prev, orderPrefix: e.target.value } : null)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="nextOrderNumber">Próximo Número de Orden</Label>
                                <Input
                                    id="nextOrderNumber"
                                    type="number"
                                    value={settings.nextOrderNumber || 1}
                                    onChange={(e) => setSettings(prev => prev ? { ...prev, nextOrderNumber: Number(e.target.value) } : null)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="assignment-label">Etiqueta para Asignación</Label>
                                <Input
                                    id="assignment-label"
                                    value={settings.assignmentLabel}
                                    onChange={(e) => setSettings(prev => prev ? { ...prev, assignmentLabel: e.target.value } : null)}
                                />
                                <p className="text-sm text-muted-foreground">
                                    Cambia el texto para la asignación (ej: &quot;Máquina&quot;, &quot;Operario&quot;).
                                </p>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="shift-label">Etiqueta para Turno</Label>
                                <Input
                                    id="shift-label"
                                    value={settings.shiftLabel}
                                    onChange={(e) => setSettings(prev => prev ? { ...prev, shiftLabel: e.target.value } : null)}
                                />
                                <p className="text-sm text-muted-foreground">
                                    Cambia el texto para el turno (ej: &quot;Turno&quot;, &quot;Jornada&quot;).
                                </p>
                            </div>
                        </div>
                        <Separator />
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="show-customer-tax-id"
                                    checked={settings.showCustomerTaxId}
                                    onCheckedChange={(checked) => setSettings(prev => prev ? { ...prev, showCustomerTaxId: checked } : null)}
                                />
                                <Label htmlFor="show-customer-tax-id">Mostrar cédula junto al nombre del cliente</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="use-warehouse"
                                    checked={settings.useWarehouseReception}
                                    onCheckedChange={(checked) => setSettings(prev => prev ? { ...prev, useWarehouseReception: checked } : null)}
                                />
                                <Label htmlFor="use-warehouse">Habilitar paso de &quot;Recibido en Bodega&quot;</Label>
                            </div>
                             <div className="flex items-center space-x-2">
                                <Switch
                                    id="require-machine"
                                    checked={settings.requireMachineForStart}
                                    onCheckedChange={(checked) => setSettings(prev => prev ? { ...prev, requireMachineForStart: checked } : null)}
                                />
                                <Label htmlFor="require-machine">Requerir asignación para iniciar la orden</Label>
                            </div>
                             <div className="flex items-center space-x-2">
                                <Switch
                                    id="require-shift"
                                    checked={settings.requireShiftForCompletion}
                                    onCheckedChange={(checked) => setSettings(prev => prev ? { ...prev, requireShiftForCompletion: checked } : null)}
                                />
                                <Label htmlFor="require-shift">Requerir turno para completar la orden</Label>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Accordion type="multiple" defaultValue={['assignments', 'shifts']} className="w-full space-y-6">
                    <Card>
                        <AccordionItem value="assignments">
                            <AccordionTrigger className="p-6">
                                <CardTitle>Gestión de Asignaciones</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                <CardDescription className="mb-4">Añade o elimina las opciones de asignación disponibles (máquinas, procesos, etc.).</CardDescription>
                                <div className="space-y-4">
                                    <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                                        {settings.machines.map(machine => (
                                            <div key={machine.id} className="flex items-center justify-between rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">{machine.name}</p>
                                                    <p className="text-sm text-muted-foreground">ID: <span className="font-mono">{machine.id}</span></p>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteMachine(machine.id)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <Separator />
                                    <div className="flex items-end gap-2 pt-2">
                                        <div className="grid flex-1 gap-2">
                                            <Label htmlFor="machine-id">ID de Asignación</Label>
                                            <Input id="machine-id" value={newMachine.id} onChange={(e) => setNewMachine(prev => ({ ...prev, id: e.target.value }))} placeholder="Ej: M01" />
                                        </div>
                                        <div className="grid flex-1 gap-2">
                                            <Label htmlFor="machine-name">Nombre de Asignación</Label>
                                            <Input id="machine-name" value={newMachine.name} onChange={(e) => setNewMachine(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Prensa Heidelberg" />
                                        </div>
                                        <Button size="icon" onClick={handleAddMachine}>
                                            <PlusCircle className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>

                     <Card>
                        <AccordionItem value="shifts">
                            <AccordionTrigger className="p-6">
                                <CardTitle>Gestión de Turnos</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                <CardDescription className="mb-4">Añade o elimina los turnos de trabajo disponibles.</CardDescription>
                                <div className="space-y-4">
                                    <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                                        {settings.shifts.map(shift => (
                                            <div key={shift.id} className="flex items-center justify-between rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">{shift.name}</p>
                                                    <p className="text-sm text-muted-foreground">ID: <span className="font-mono">{shift.id}</span></p>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteShift(shift.id)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <Separator />
                                    <div className="flex items-end gap-2 pt-2">
                                        <div className="grid flex-1 gap-2">
                                            <Label htmlFor="shift-id">ID de Turno</Label>
                                            <Input id="shift-id" value={newShift.id} onChange={(e) => setNewShift(prev => ({ ...prev, id: e.target.value }))} placeholder="Ej: turno-a" />
                                        </div>
                                        <div className="grid flex-1 gap-2">
                                            <Label htmlFor="shift-name">Nombre del Turno</Label>
                                            <Input id="shift-name" value={newShift.name} onChange={(e) => setNewShift(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Turno A (7am-3pm)" />
                                        </div>
                                        <Button size="icon" onClick={handleAddShift}>
                                            <PlusCircle className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>

                    <Card>
                        <AccordionItem value="custom-statuses">
                            <AccordionTrigger className="p-6">
                                <CardTitle>Estados Personalizados de Órdenes</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                <CardDescription className="mb-4">Define hasta 4 estados adicionales para tu flujo de trabajo. Solo se mostrarán si están activos y tienen un nombre.</CardDescription>
                                <div className="space-y-6">
                                    {settings.customStatuses.map((status, index) => (
                                        <div key={status.id} className="space-y-4 rounded-lg border p-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-semibold">Estado Personalizado {index + 1}</h4>
                                                <div className="flex items-center space-x-2">
                                                    <Label htmlFor={`active-${status.id}`}>Activo</Label>
                                                    <Switch
                                                        id={`active-${status.id}`}
                                                        checked={status.isActive}
                                                        onCheckedChange={(checked) => handleCustomStatusChange(status.id, 'isActive', checked)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                                <div className="space-y-2">
                                                    <Label htmlFor={`label-${status.id}`}>Nombre del Estado (Etiqueta)</Label>
                                                    <Input
                                                        id={`label-${status.id}`}
                                                        value={status.label}
                                                        onChange={(e) => handleCustomStatusChange(status.id, 'label', e.target.value)}
                                                        placeholder="Ej: En Diseño, Esperando Material"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`color-${status.id}`}>Color</Label>
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            id={`color-${status.id}`}
                                                            value={status.color}
                                                            onChange={(e) => handleCustomStatusChange(status.id, 'color', e.target.value)}
                                                        />
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <Button variant="outline" size="icon">
                                                                    <Palette className="h-4 w-4" />
                                                                </Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-48 p-2">
                                                                <div className="grid grid-cols-4 gap-2">
                                                                    {defaultColors.map(color => (
                                                                        <button
                                                                            key={color}
                                                                            className={cn("h-8 w-8 rounded-full border", color === status.color && "ring-2 ring-ring")}
                                                                            style={{ backgroundColor: color }}
                                                                            onClick={() => handleCustomStatusChange(status.id, 'color', color)}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                        <div className="h-8 w-8 rounded-full border" style={{ backgroundColor: status.color }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>

                    <Card>
                        <AccordionItem value="change-detection">
                             <AccordionTrigger className="p-6">
                                <CardTitle>Detección de Cambios</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                <CardDescription className="mb-4">Selecciona qué campos, al ser modificados después de que una orden sea aprobada, activarán la alerta &quot;Modificado&quot;.</CardDescription>
                                <div className="space-y-4 p-4 border rounded-md">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {availableFieldsToTrack.map(field => (
                                            <div key={field.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`track-field-${field.id}`}
                                                    checked={settings.fieldsToTrackChanges.includes(field.id)}
                                                    onCheckedChange={(checked) => handleFieldToTrackChange(field.id, checked as boolean)}
                                                />
                                                <Label htmlFor={`track-field-${field.id}`} className="font-normal">{field.label}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>

                    <Card>
                        <AccordionItem value="pdf-export">
                            <AccordionTrigger className="p-6">
                                <CardTitle>Configuración de Exportación a PDF</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                <CardDescription className="mb-4">Personaliza el contenido y formato de los reportes PDF del planificador.</CardDescription>
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
                                                    <RadioGroupItem value="letter" id="r-letter" />
                                                    <Label htmlFor="r-letter">Carta (Letter)</Label>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <RadioGroupItem value="legal" id="r-legal" />
                                                    <Label htmlFor="r-legal">Oficio (Legal)</Label>
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
                                                    <RadioGroupItem value="portrait" id="r-portrait" />
                                                    <Label htmlFor="r-portrait">Vertical</Label>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <RadioGroupItem value="landscape" id="r-landscape" />
                                                    <Label htmlFor="r-landscape">Horizontal</Label>
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
                                                        id={`pdf-col-${col.id}`}
                                                        checked={settings.pdfExportColumns?.includes(col.id)}
                                                        onCheckedChange={(checked) => handlePdfColumnChange(col.id, checked as boolean)}
                                                    />
                                                    <Label htmlFor={`pdf-col-${col.id}`} className="font-normal">{col.label}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>
                </Accordion>

                <Card>
                    <CardFooter className="border-t px-6 py-4">
                        <Button onClick={handleSave}><Save className="mr-2 h-4 w-4"/>Guardar Todos los Cambios</Button>
                    </CardFooter>
                </Card>
            </div>
        </main>
    );
}
 
