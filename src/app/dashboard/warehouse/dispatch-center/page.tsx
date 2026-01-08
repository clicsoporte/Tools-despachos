/**
 * @fileoverview Main page for the Dispatch Center, where checkers access their assigned routes.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useRouter } from 'next/navigation';
import { 
    getContainers, 
    lockEntity, 
    releaseLock, 
    getAssignmentsForContainer, 
    moveAssignmentToContainer, 
    updateAssignmentStatus, 
    resetContainerAssignments,
    unassignAllFromContainer,
    unassignDocumentFromContainer,
    getEmployees,
    getVehicles,
    finalizeDispatch
} from '@/modules/warehouse/lib/actions';
import type { DispatchContainer, DispatchAssignment, ErpInvoiceHeader, Vehiculo, Empleado } from '@/modules/core/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Lock, Unlock, ArrowRight, ArrowLeft, CheckCircle, Package, AlertTriangle, Undo2, RefreshCcw, Trash2, GripVertical, Send, Search, CalendarIcon, List, Truck, User as UserIcon } from 'lucide-react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { format, parseISO, startOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, reformatEmployeeName } from '@/lib/utils';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getInvoicesByIds } from '@/modules/core/lib/db';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { getUnassignedDocuments, assignDocumentsToContainer } from '@/modules/warehouse/lib/actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { updateAssignmentOrder } from '@/modules/warehouse/lib/actions';
import { SearchInput } from '@/components/ui/search-input';
import { useDebounce } from 'use-debounce';


const DraggableItem = ({ item, erpHeaders, index, onUnassign }: { item: DispatchAssignment, erpHeaders: Map<string, ErpInvoiceHeader>, index: number, onUnassign: (assignment: DispatchAssignment) => void }) => {
    const erpHeader = erpHeaders.get(item.documentId);
    const isCancelled = erpHeader?.ANULADA === 'S';

    return (
        <Draggable draggableId={String(item.id)} index={index}>
            {(provided) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={cn(
                        "p-3 mb-2 rounded-md shadow-sm border flex items-center justify-between",
                        isCancelled ? 'bg-destructive/10 border-destructive' : 'bg-card'
                    )}
                >
                    <div className="flex items-center gap-2">
                        <div {...provided.dragHandleProps} className="cursor-grab p-1">
                            <GripVertical className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="font-semibold">{item.documentId}</p>
                            <p className="text-sm text-muted-foreground">{item.clientName}</p>
                            {erpHeader?.EMBARCAR_A && <p className="text-xs text-muted-foreground italic truncate max-w-xs">{erpHeader.EMBARCAR_A}</p>}
                            {isCancelled && <Badge variant="destructive" className="mt-1"><AlertTriangle className="mr-1 h-3 w-3" /> ANULADA</Badge>}
                        </div>
                    </div>
                     <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onUnassign(item)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            )}
        </Draggable>
    );
};

type EnrichedErpHeader = ErpInvoiceHeader & { suggestedContainerId?: string };

export default function DispatchCenterPage() {
    const { isAuthorized, hasPermission } = useAuthorization(['warehouse:dispatch-check:use', 'warehouse:dispatch-classifier:use']);
    const { setTitle } = usePageTitle();
    const { user, isReady } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [containers, setContainers] = useState<DispatchContainer[]>([]);
    const [selectedContainer, setSelectedContainer] = useState<DispatchContainer | null>(null);
    const [assignments, setAssignments] = useState<Record<string, DispatchAssignment[]>>({});
    const [erpHeaders, setErpHeaders] = useState<Map<string, ErpInvoiceHeader>>(new Map());

    const [assignmentToMove, setAssignmentToMove] = useState<DispatchAssignment | null>(null);
    const [containerToModify, setContainerToModify] = useState<DispatchContainer | null>(null);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    
    // State for Classifier Tab
    const [isLoadingDocs, setIsLoadingDocs] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: startOfDay(subDays(new Date(), 7)), to: new Date() });
    const [unassignedDocs, setUnassignedDocs] = useState<EnrichedErpHeader[]>([]);
    const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
    const [bulkAssignContainerId, setBulkAssignContainerId] = useState<string>('');
    const [activeTab, setActiveTab] = useState('assign');

    // State for Finalize Route Screen
    const [vehicles, setVehicles] = useState<Vehiculo[]>([]);
    const [employees, setEmployees] = useState<Empleado[]>([]);
    const [selectedVehicle, setSelectedVehicle] = useState<string>('');
    const [selectedDriver, setSelectedDriver] = useState<string>('');
    const [driverSearchTerm, setDriverSearchTerm] = useState('');
    const [isDriverSearchOpen, setIsDriverSearchOpen] = useState(false);
    const [debouncedDriverSearch] = useDebounce(driverSearchTerm, 300);
    
    const fetchContainers = useCallback(async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const fetchedContainers = await getContainers();
            setContainers(fetchedContainers);
        } catch (error: any) {
            toast({ title: "Error", description: `No se pudieron cargar los contenedores: ${error.message}`, variant: "destructive" });
        } finally {
            if (showLoading) setIsLoading(false);
        }
    }, [toast]);
    
    const handleSelectContainer = useCallback(async (container: DispatchContainer, skipLock = false) => {
        if (!user) return;
        setIsLoading(true);
        
        if (!skipLock) {
            try {
                const lockResult = await lockEntity({ entityIds: [container.id!], entityType: 'container', userId: user.id, userName: user.name });
                if (lockResult.error) {
                    toast({ title: "Contenedor en Uso", description: lockResult.error, variant: "destructive" });
                    setIsLoading(false);
                    return;
                }
            } catch (error: any) {
                toast({ title: "Error al Bloquear", description: error.message, variant: "destructive" });
                setIsLoading(false);
                return;
            }
        }
        
        try {
            const [fetchedAssignments, fetchedVehicles, fetchedEmployees] = await Promise.all([
                getAssignmentsForContainer(container.id!),
                getVehicles(),
                getEmployees()
            ]);

            setVehicles(fetchedVehicles);
            setEmployees(fetchedEmployees);
            
            if (fetchedAssignments.length > 0) {
                const documentIds = fetchedAssignments.map(a => a.documentId);
                const invoiceDetails = await getInvoicesByIds(documentIds);
                const headersMap = new Map<string, ErpInvoiceHeader>(invoiceDetails.map((h: ErpInvoiceHeader) => [h.FACTURA, h]));
                setErpHeaders(headersMap);
            }

            setAssignments({ [container.id!]: fetchedAssignments });
            setSelectedContainer(container);
            sessionStorage.setItem('activeDispatchContainer', String(container.id!));
        } catch (error: any) {
            toast({ title: "Error", description: `No se pudieron cargar las asignaciones: ${error.message}`, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [user, toast]);

    const fetchAllAssignments = useCallback(async () => {
        const assignmentsByContainer: Record<string, DispatchAssignment[]> = {};
        const allDocumentIds: string[] = [];

        for (const container of containers) {
            const containerAssignments = await getAssignmentsForContainer(container.id!);
            assignmentsByContainer[container.id!] = containerAssignments;
            allDocumentIds.push(...containerAssignments.map(a => a.documentId));
        }
        
        if (allDocumentIds.length > 0) {
            const invoiceDetails = await getInvoicesByIds(allDocumentIds);
            const headersMap = new Map<string, ErpInvoiceHeader>(invoiceDetails.map((h: ErpInvoiceHeader) => [h.FACTURA, h]));
            setErpHeaders(headersMap);
        }

        setAssignments(assignmentsByContainer);
    }, [containers]);


    useEffect(() => {
        setTitle("Centro de Despacho");
        if (isReady && isAuthorized) {
            fetchContainers();
        } else if (isReady && !isAuthorized) {
            setIsLoading(false);
        }
    }, [setTitle, isReady, isAuthorized, fetchContainers]);
    
    useEffect(() => {
        if(containers.length > 0) {
            fetchAllAssignments();
        }
    }, [containers, fetchAllAssignments]);


    useEffect(() => {
        const checkActiveSession = async () => {
            const activeContainerId = sessionStorage.getItem('activeDispatchContainer');
            if (activeContainerId && containers.length > 0) {
                const activeContainer = containers.find(c => c.id === Number(activeContainerId));
                if (activeContainer) {
                    await handleSelectContainer(activeContainer, true);
                }
            }
        };
        if (containers.length > 0 && !selectedContainer) {
            checkActiveSession();
        }
    }, [containers, selectedContainer, handleSelectContainer]);

    const handleExitContainer = async () => {
        if (!user || !selectedContainer) return;
        try {
            await releaseLock([selectedContainer.id!], 'container', user.id);
            sessionStorage.removeItem('activeDispatchContainer');
            setSelectedContainer(null);
            setAssignments({});
            setErpHeaders(new Map());
            await fetchContainers();
        } catch (error: any) {
             toast({ title: "Error al Liberar", description: error.message, variant: "destructive" });
        }
    };

    const handleVerifyClick = (assignment: DispatchAssignment) => {
        if (!selectedContainer) return;
        router.push(`/dashboard/warehouse/dispatch-check?docId=${assignment.documentId}&containerId=${selectedContainer.id}`);
    };
    
    const handleMoveAssignment = async (targetContainerId: number) => {
        if (!assignmentToMove || !selectedContainer) return;
        try {
            await moveAssignmentToContainer(assignmentToMove.id, targetContainerId, assignmentToMove.documentId);
            setAssignments(prev => ({
                ...prev,
                [selectedContainer.id!]: prev[selectedContainer.id!]?.filter(a => a.id !== assignmentToMove.id) || []
            }));
            toast({ title: "Documento Movido", description: `Se ha movido ${assignmentToMove.documentId} al nuevo contenedor.`});
            setAssignmentToMove(null);
        } catch (error: any) {
            toast({ title: "Error al Mover", description: error.message, variant: "destructive" });
        }
    };
    
    const handleReopenVerification = async (documentId: string) => {
        try {
            await updateAssignmentStatus(documentId, 'pending');
            toast({ title: "Verificación Reabierta", description: `El documento ${documentId} está listo para ser verificado de nuevo.` });
            if (selectedContainer) {
                const fetchedAssignments = await getAssignmentsForContainer(selectedContainer.id!);
                setAssignments(prev => ({...prev, [selectedContainer.id!]: fetchedAssignments}));
            }
        } catch (error: any) {
            toast({ title: "Error al Reabrir", description: error.message, variant: "destructive" });
        }
    };
    
    const handleResetContainer = async () => {
        if (!containerToModify) return;
        try {
            await resetContainerAssignments(containerToModify.id!);
            const freshAssignments = await getAssignmentsForContainer(containerToModify.id!);
            setAssignments(prev => ({
                ...prev,
                [containerToModify.id!]: freshAssignments,
            }));
            toast({ title: 'Ruta Reiniciada', description: `Todos los documentos en "${containerToModify.name}" están pendientes de nuevo.` });
        } catch (error: any) {
             toast({ title: "Error al Reiniciar", description: `No se pudo reiniciar la ruta. ${error.message}`, variant: "destructive" });
        } finally {
             setContainerToModify(null);
        }
    };
    
    const handleClearContainer = useCallback(async () => {
        if (!containerToModify) return;
        try {
            await unassignAllFromContainer(containerToModify.id!);
            toast({ title: 'Contenedor Limpiado', description: `Se desasignaron todos los documentos de "${containerToModify.name}".`, variant: "destructive"});
            
            // Correctly update local state
            setAssignments(prev => ({
                ...prev,
                [containerToModify!.id!]: []
            }));

        } catch (error: any) {
            toast({ title: 'Error al Limpiar', description: `No se pudieron limpiar las asignaciones. ${error.message}`, variant: 'destructive'});
        } finally {
            setContainerToModify(null);
            setIsClearConfirmOpen(false);
        }
    }, [containerToModify, toast]);

    const handleOnDragEnd = async (result: DropResult) => {
        const { source, destination } = result;
        if (!destination) return;
    
        const sourceId = source.droppableId;
        const destinationId = destination.droppableId;
    
        const sourceItems = Array.from(assignments[sourceId] || []);
        const [movedItem] = sourceItems.splice(source.index, 1);
        if (!movedItem) return;

        if (sourceId === destinationId) {
            sourceItems.splice(destination.index, 0, movedItem);
            setAssignments(prev => ({ ...prev, [sourceId]: sourceItems }));
            await updateAssignmentOrder(Number(sourceId), sourceItems.map(item => item.documentId));
        } else {
            const destinationItems = Array.from(assignments[destinationId] || []);
            destinationItems.splice(destination.index, 0, movedItem);

            setAssignments(prev => ({
                ...prev,
                [sourceId]: sourceItems,
                [destinationId]: destinationItems
            }));
            
            await moveAssignmentToContainer(movedItem.id, Number(destinationId), movedItem.documentId);
        }
    };

    const handleFetchDocuments = useCallback(async () => {
        if (!dateRange?.from) {
            toast({ title: "Fecha requerida", description: "Por favor, selecciona un rango de fechas.", variant: "destructive" });
            return;
        }
        setIsLoadingDocs(true);
        try {
            const docs = await getUnassignedDocuments(dateRange);
            const enrichedDocs = docs.map(doc => {
                const matchingContainer = containers.find(c => c.name.toLowerCase() === doc.RUTA?.toLowerCase());
                return { ...doc, suggestedContainerId: matchingContainer ? String(matchingContainer.id) : undefined };
            });
            setUnassignedDocs(enrichedDocs);
        } catch (error: any) {
             toast({ title: 'Error', description: `No se pudieron cargar los documentos del ERP: ${error.message}`, variant: 'destructive' });
        } finally {
            setIsLoadingDocs(false);
        }
    }, [dateRange, toast, containers]);

    const getAssignedContainerId = useCallback((docId: string): string | null => {
        for (const containerId in assignments) {
            if (assignments[containerId].some(a => a.documentId === docId)) {
                return containerId;
            }
        }
        return null;
    }, [assignments]);
    
    const handleSingleAssign = useCallback(async (documentId: string, containerId: string | null) => {
        if (!user) return;
        
        const doc = unassignedDocs.find(d => d.FACTURA === documentId);
        if (doc?.ANULADA === 'S') {
            toast({ title: "Acción no permitida", description: "No se puede asignar una factura anulada.", variant: "destructive" });
            return;
        }
        
        const currentContainerId = getAssignedContainerId(documentId);
        
        try {
            if (containerId === null) {
                const assignmentToRemove = assignments[currentContainerId!]?.find(a => a.documentId === documentId);
                if (assignmentToRemove) {
                    await unassignDocumentFromContainer(assignmentToRemove.id);
                }
            } else {
                await assignDocumentsToContainer([documentId], Number(containerId), user.name);
            }
            await fetchAllAssignments();
            setUnassignedDocs(prev => prev.filter(d => d.FACTURA !== documentId));
        } catch (error: any) {
            toast({ title: 'Error', description: `Ocurrió un error: ${error.message}`, variant: 'destructive' });
        }
    }, [user, unassignedDocs, toast, assignments, fetchAllAssignments, getAssignedContainerId]);
    
    const handleBulkAssign = useCallback(async () => {
        if (!user || selectedDocumentIds.size === 0 || !bulkAssignContainerId) {
            toast({ title: 'Selección requerida', description: 'Selecciona al menos un documento y un contenedor de destino.', variant: 'destructive'});
            return;
        }
    
        setIsLoadingDocs(true);
        try {
            const validDocsToAssign: string[] = [];
            let cancelledCount = 0;
    
            for (const docId of selectedDocumentIds) {
                const doc = unassignedDocs.find(d => d.FACTURA === docId);
                if (doc && doc.ANULADA !== 'S') {
                    validDocsToAssign.push(docId);
                } else if (doc) {
                    cancelledCount++;
                }
            }
            
            if (cancelledCount > 0) {
                toast({ title: 'Facturas Omitidas', description: `${cancelledCount} factura(s) estaban anuladas y no se asignaron.`, variant: 'destructive'});
            }
    
            if (validDocsToAssign.length === 0) {
                toast({ title: 'Sin Documentos Válidos', description: 'No hay documentos válidos para asignar.', variant: 'destructive'});
                setIsLoadingDocs(false);
                return;
            }
            
            await assignDocumentsToContainer(validDocsToAssign, Number(bulkAssignContainerId), user.name);
            toast({ title: "Asignación Completa", description: `Se asignaron ${validDocsToAssign.length} documentos.` });
            
            const freshAssignments = await getAssignmentsForContainer(Number(bulkAssignContainerId));
            setAssignments(prev => ({...prev, [bulkAssignContainerId]: freshAssignments }));
    
            setUnassignedDocs(prev => prev.filter(d => !validDocsToAssign.includes(d.FACTURA)));
            setSelectedDocumentIds(new Set());
            setBulkAssignContainerId('');
        } catch (error: any) {
            toast({ title: 'Error al Asignar', description: error.message, variant: 'destructive' });
        } finally {
            setIsLoadingDocs(false);
        }
    }, [user, selectedDocumentIds, bulkAssignContainerId, unassignedDocs, toast]);

    const handleUnassign = async (assignment: DispatchAssignment) => {
        try {
            await unassignDocumentFromContainer(assignment.id);
            setAssignments(prev => {
                const newAssignments = {...prev};
                if (newAssignments[assignment.containerId]) {
                    newAssignments[assignment.containerId] = newAssignments[assignment.containerId].filter(a => a.id !== assignment.id);
                }
                return newAssignments;
            });
            await handleFetchDocuments();
            toast({ title: 'Documento Desasignado', variant: 'destructive'});
        } catch (error: any) {
            toast({ title: 'Error al desasignar', description: error.message, variant: 'destructive' });
        }
    };
    
    const isRouteCompleted = (c: DispatchContainer) => {
        const assignmentCount = c.assignmentCount ?? 0;
        return (c.assignmentCount ?? 0) > 0 && c.completedAssignmentCount === assignmentCount;
    };

    const handleFinalizeDispatch = async () => {
        if (!selectedContainer) return;
        await finalizeDispatch(selectedContainer.id!, selectedVehicle, selectedDriver);
        toast({ title: 'Ruta Finalizada', description: 'El vehículo y el chofer han sido asignados.' });
        handleExitContainer();
    };

    const driverOptions = useMemo(() => {
        if (debouncedDriverSearch.length < 2) return [];
        const searchLower = debouncedDriverSearch.toLowerCase();
        return employees
            .filter(e => reformatEmployeeName(e.NOMBRE).toLowerCase().includes(searchLower))
            .map(e => ({ value: e.EMPLEADO, label: reformatEmployeeName(e.NOMBRE) }));
    }, [employees, debouncedDriverSearch]);

    const handleSelectDriver = (driverEmployeeId: string) => {
        const driver = employees.find(e => e.EMPLEADO === driverEmployeeId);
        if (driver) {
            setSelectedDriver(driver.EMPLEADO);
            setDriverSearchTerm(reformatEmployeeName(driver.NOMBRE));
        }
        setIsDriverSearchOpen(false);
    };


    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (selectedContainer) {
        const containerAssignments = assignments[selectedContainer.id!] || [];
        const allCompleted = isRouteCompleted(selectedContainer);

        return (
            <div className="p-4 md:p-8 max-w-4xl mx-auto">
                 <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" onClick={handleExitContainer}>
                            <ArrowLeft />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">{selectedContainer.name}</h1>
                            <p className="text-muted-foreground">Verificando como: <strong>{user?.name}</strong></p>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                     <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : allCompleted ? (
                    <Card className="text-center p-8">
                         <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
                         <CardTitle className="text-2xl">¡Ruta Completada!</CardTitle>
                         <CardDescription className="mt-2">Todos los documentos para esta ruta han sido verificados.</CardDescription>
                         <CardContent className="mt-6 space-y-4 max-w-sm mx-auto">
                            <div className="space-y-2 text-left">
                                <Label htmlFor="vehicle-select">Seleccionar Vehículo</Label>
                                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                    <SelectTrigger><SelectValue placeholder="Buscar por placa o marca..."/></SelectTrigger>
                                    <SelectContent>
                                        {vehicles.map(v => <SelectItem key={v.placa} value={v.placa}>{v.marca} ({v.placa})</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2 text-left">
                                <Label>Seleccionar Chofer</Label>
                                 <SearchInput
                                    options={driverOptions}
                                    onSelect={handleSelectDriver}
                                    value={driverSearchTerm}
                                    onValueChange={setDriverSearchTerm}
                                    placeholder="Buscar empleado..."
                                    open={isDriverSearchOpen}
                                    onOpenChange={setIsDriverSearchOpen}
                                />
                            </div>
                         </CardContent>
                         <CardFooter className="flex-col sm:flex-row justify-center gap-2 mt-6">
                            <Button onClick={handleExitContainer} variant="outline" className="w-full sm:w-auto">Volver</Button>
                            <Button onClick={handleFinalizeDispatch} className="w-full sm:w-auto" disabled={!selectedVehicle || !selectedDriver}>
                                Finalizar y Registrar Despacho
                            </Button>
                         </CardFooter>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {containerAssignments.map(a => {
                            const isCompleted = a.status === 'completed' || a.status === 'discrepancy';
                            const erpHeader = erpHeaders.get(a.documentId);
                            const isCancelled = erpHeader?.ANULADA === 'S';
                            
                            return (
                                <Card key={a.id} className={cn("transition-all", isCompleted ? 'bg-muted/50 border-dashed' : 'bg-card', isCancelled && 'border-destructive bg-destructive/10')}>
                                    <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2">
                                                {isCompleted ? <CheckCircle className="h-5 w-5 text-green-500"/> : <Package className="h-5 w-5 text-muted-foreground"/>}
                                                <span className="font-bold text-lg">{a.documentId} <span className="font-normal text-sm">({a.documentType === 'F' ? 'Factura' : 'Remisión'})</span></span>
                                            </div>
                                            <p className="text-sm text-muted-foreground">{a.clientName} ({a.clientId})</p>
                                            <p className="text-xs text-muted-foreground">Fecha Doc: {format(parseISO(a.documentDate), 'dd/MM/yyyy')}</p>
                                             {isCancelled && <Badge variant="destructive" className="mt-2"><AlertTriangle className="mr-1 h-3 w-3"/> FACTURA ANULADA EN ERP</Badge>}
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {isCompleted ? (
                                                 <Button variant="outline" size="sm" onClick={() => handleReopenVerification(a.documentId)}><Undo2 className="mr-2 h-4 w-4"/>Re-Verificar</Button>
                                            ) : (
                                                <>
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button variant="outline" size="sm" disabled={isCancelled} onClick={() => setAssignmentToMove(a)}>Mover</Button>
                                                        </DialogTrigger>
                                                        <DialogContent>
                                                            <DialogHeader>
                                                                <DialogTitle>Mover Documento a Otra Ruta</DialogTitle>
                                                                <DialogDescription>
                                                                    Selecciona el contenedor de destino para el documento {a.documentId}.
                                                                </DialogDescription>
                                                            </DialogHeader>
                                                            <div className="py-4 space-y-2">
                                                                {containers.filter(c => c.id !== selectedContainer.id).map(c => (
                                                                    <DialogClose asChild key={c.id}>
                                                                        <Button variant="secondary" className="w-full justify-start" onClick={() => handleMoveAssignment(c.id!)}>
                                                                            {c.name}
                                                                        </Button>
                                                                    </DialogClose>
                                                                ))}
                                                            </div>
                                                        </DialogContent>
                                                    </Dialog>
                                                    <Button className="w-40" onClick={() => handleVerifyClick(a)} disabled={isCancelled}>
                                                        Verificar <ArrowRight className="ml-2 h-4 w-4"/>
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>
                )}
            </div>
        );
    }
    
    if (!hasPermission('warehouse:dispatch-check:use')) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-destructive">Acceso Denegado</h1>
                <p className="text-muted-foreground">No tienes permiso para usar el centro de despacho.</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col h-screen bg-muted/30">
             <div className="p-4 border-b bg-background flex justify-between items-center">
                 <div>
                    <h1 className="text-2xl font-bold">Centro de Despacho</h1>
                    <p className="text-muted-foreground">Selecciona una ruta para empezar a verificar o gestiona las asignaciones.</p>
                 </div>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto">
                {containers.map(c => {
                    const assignmentCount = c.assignmentCount ?? 0;
                    const completedCount = c.completedAssignmentCount ?? 0;
                    const isCompleted = isRouteCompleted(c);
                    const isLocked = c.isLocked && c.lockedByUserId !== user?.id;

                    return (
                        <Card 
                            key={c.id} 
                            onClick={() => !isLocked && handleSelectContainer(c)}
                            className={cn(
                                "flex flex-col transition-all hover:shadow-lg hover:-translate-y-1",
                                isLocked ? "bg-muted/60 cursor-not-allowed border-dashed" : "cursor-pointer",
                                isCompleted && "bg-green-50 border-green-500"
                            )}
                        >
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5"/>{c.name}</CardTitle>
                                    {isLocked ? (
                                        <Badge variant="destructive"><Lock className="mr-1 h-3 w-3"/> En Uso</Badge>
                                    ) : isCompleted ? (
                                        <Badge variant="default" className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3"/> Completada</Badge>
                                    ) : (assignmentCount > 0) ? (
                                        <Badge variant="secondary">{assignmentCount}</Badge>
                                    ) : null}
                                </div>
                                <CardDescription>
                                    {assignmentCount} {assignmentCount === 1 ? 'documento asignado' : 'documentos asignados'}.
                                </CardDescription>
                            </CardHeader>
                             <CardContent className="flex-grow">
                                {isLocked ? (
                                    <p className="text-sm font-semibold text-destructive">Bloqueado por: {c.lockedBy}</p>
                                ) : isCompleted ? (
                                     <p className="text-sm text-green-700">Verificado por {c.lastVerifiedBy} el {c.lastVerifiedAt ? format(parseISO(c.lastVerifiedAt), 'dd/MM/yy HH:mm') : ''}</p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{completedCount} de {assignmentCount} verificados.</p>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full" disabled={isLocked}>
                                    {isLocked ? 'Ruta en Uso' : (isCompleted ? 'Finalizar Despacho' : 'Empezar Verificación')}
                                </Button>
                            </CardFooter>
                        </Card>
                    )
                })}
            </div>
        </div>
    );
}
