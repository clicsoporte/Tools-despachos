/**
 * @fileoverview Page for the Dispatch Classifier.
 * This component allows logistics managers to view unassigned ERP documents (invoices, etc.)
 * and assign them to specific dispatch containers (routes) using an efficient table-based interface.
 * It also provides a separate view for re-ordering documents within a container.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { 
    getContainers, 
    getUnassignedDocuments, 
    getAssignmentsForContainer, 
    assignDocumentsToContainer, 
    updateAssignmentOrder, 
    unassignDocumentFromContainer,
    moveAssignmentToContainer,
    unassignAllFromContainer,
    resetContainerAssignments,
} from '@/modules/warehouse/lib/actions';
import { getInvoicesByIds } from '@/modules/core/lib/db';
import type { DispatchContainer, ErpInvoiceHeader, DispatchAssignment } from '@/modules/core/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Search, CalendarIcon, Truck, AlertTriangle, List, Check, ChevronsUpDown, Send, Trash2, GripVertical, RefreshCcw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parseISO, startOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

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

export default function DispatchClassifierPage() {
    const { hasPermission } = useAuthorization(['warehouse:dispatch-classifier:use']);
    const { setTitle } = usePageTitle();
    const { user } = useAuth();
    const { toast } = useToast();

    const [containers, setContainers] = useState<DispatchContainer[]>([]);
    const [assignments, setAssignments] = useState<Record<string, DispatchAssignment[]>>({});
    const [unassignedDocs, setUnassignedDocs] = useState<EnrichedErpHeader[]>([]);
    const [erpHeaders, setErpHeaders] = useState<Map<string, ErpInvoiceHeader>>(new Map());
    
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDocs, setIsLoadingDocs] = useState(false);
    
    const [activeTab, setActiveTab] = useState('assign');
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: startOfDay(subDays(new Date(), 7)), to: new Date() });
    const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
    const [bulkAssignContainerId, setBulkAssignContainerId] = useState<string>('');

    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [containerToModify, setContainerToModify] = useState<DispatchContainer | null>(null);

    const fetchAllAssignments = useCallback(async (allContainers: DispatchContainer[]) => {
        const assignmentsByContainer: Record<string, DispatchAssignment[]> = {};
        const allDocumentIds: string[] = [];

        for (const container of allContainers) {
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
    }, []);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const fetchedContainers = await getContainers();
            setContainers(fetchedContainers);
            await fetchAllAssignments(fetchedContainers);
        } catch (error: any) {
            toast({ title: 'Error', description: `No se pudieron cargar los datos iniciales: ${error.message}`, variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [toast, fetchAllAssignments]);
    
    useEffect(() => {
        setTitle("Clasificador de Despachos");
        if (hasPermission) {
            fetchAllData();
        } else {
            setIsLoading(false);
        }
    }, [setTitle, hasPermission, fetchAllData]);
    

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

    const getAssignedContainerId = (docId: string): string | null => {
        for (const containerId in assignments) {
            if (assignments[containerId].some(a => a.documentId === docId)) {
                return containerId;
            }
        }
        return null;
    };

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

            // Efficiently update local state instead of re-fetching everything
            const freshAssignments = await getAssignmentsForContainer(containerId ? Number(containerId) : Number(currentContainerId!));
            setAssignments(prev => ({
                ...prev,
                [containerId || currentContainerId!]: freshAssignments
            }));
            
            if (containerId !== null) {
                setUnassignedDocs(prev => prev.filter(d => d.FACTURA !== documentId));
            } else {
                await handleFetchDocuments(); // Re-fetch unassigned only when an item is unassigned
            }
        } catch(error: any) {
            toast({ title: 'Error', description: `Ocurrió un error: ${error.message}`, variant: 'destructive' });
        }
    }, [user, unassignedDocs, toast, assignments, handleFetchDocuments]);
    
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
    
    const handleClearContainer = async () => {
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
    };

    const handleResetContainer = async () => {
        if (!containerToModify) return;
        try {
            await resetContainerAssignments(containerToModify.id!);
            toast({ title: 'Ruta Reiniciada', description: `Todos los documentos en "${containerToModify.name}" están pendientes de nuevo.` });
            
            const freshAssignments = await getAssignmentsForContainer(containerToModify.id!);
            setAssignments(prev => ({
                ...prev,
                [containerToModify!.id!]: freshAssignments
            }));

        } catch (error: any) {
             toast({ title: "Error al Reiniciar", description: `No se pudo reiniciar la ruta. ${error.message}`, variant: "destructive" });
        } finally {
             setContainerToModify(null);
        }
    };

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="flex flex-col h-screen bg-muted/30">
            <header className="p-4 border-b bg-background">
                <h1 className="text-2xl font-bold">Clasificador de Despachos</h1>
                <p className="text-muted-foreground">Asigna facturas a contenedores y luego ordénalas según la ruta de entrega.</p>
            </header>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col p-4 gap-4">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="assign">Asignar Documentos</TabsTrigger>
                    <TabsTrigger value="order">Ordenar Contenedores</TabsTrigger>
                </TabsList>
                <TabsContent value="assign" className="flex-1 overflow-auto">
                     <Card>
                        <CardHeader>
                            <CardTitle>Paso 1: Cargar Documentos del ERP</CardTitle>
                            <div className="flex flex-col sm:flex-row gap-4 items-center pt-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button id="date" variant={'outline'} className={cn('w-full sm:w-[280px] justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, 'LLL dd, y', { locale: es })} - ${format(dateRange.to, 'LLL dd, y', { locale: es })}`) : format(dateRange.from, 'LLL dd, y', { locale: es })) : (<span>Rango de Fechas</span>)}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={(range) => setDateRange(range)} numberOfMonths={2} locale={es} /></PopoverContent>
                                </Popover>
                                <Button onClick={handleFetchDocuments} disabled={isLoadingDocs} className="w-full sm:w-auto">
                                    {isLoadingDocs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                    Buscar Documentos Pendientes
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <div className="flex items-center gap-4 mb-4 p-2 border rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-docs"
                                        checked={selectedDocumentIds.size > 0 && selectedDocumentIds.size === unassignedDocs.filter(d => d.ANULADA !== 'S').length}
                                        onCheckedChange={(checked) => setSelectedDocumentIds(checked ? new Set(unassignedDocs.filter(d => d.ANULADA !== 'S').map(d => d.FACTURA)) : new Set())}
                                    />
                                    <Label htmlFor="select-all-docs" className="font-semibold">{selectedDocumentIds.size} seleccionados</Label>
                                </div>
                                <Select value={bulkAssignContainerId} onValueChange={setBulkAssignContainerId}>
                                    <SelectTrigger className="w-[250px]">
                                        <SelectValue placeholder="Asignar en bloque a..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {containers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button onClick={handleBulkAssign} disabled={selectedDocumentIds.size === 0 || !bulkAssignContainerId}>
                                    <Send className="mr-2 h-4 w-4"/>
                                    Asignar
                                </Button>
                            </div>
                            <ScrollArea className="h-[55vh]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12"></TableHead>
                                            <TableHead>Documento</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead>Vendedor</TableHead>
                                            <TableHead>Ruta (ERP)</TableHead>
                                            <TableHead>Embarcar A</TableHead>
                                            <TableHead>Observaciones</TableHead>
                                            <TableHead className="w-[250px]">Asignar a Contenedor</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unassignedDocs.map(doc => {
                                            const assignedContainerId = getAssignedContainerId(doc.FACTURA);
                                            const isCancelled = doc.ANULADA === 'S';
                                            return (
                                                <TableRow key={doc.FACTURA} className={cn(isCancelled ? 'bg-destructive/10' : '', assignedContainerId && 'bg-green-100/50')}>
                                                    <TableCell>
                                                        {!isCancelled && <Checkbox checked={selectedDocumentIds.has(doc.FACTURA)} onCheckedChange={(checked) => {
                                                            const newSet = new Set(selectedDocumentIds);
                                                            if (checked) newSet.add(doc.FACTURA); else newSet.delete(doc.FACTURA);
                                                            setSelectedDocumentIds(newSet);
                                                        }} />}
                                                    </TableCell>
                                                    <TableCell className="font-mono">{doc.FACTURA}{isCancelled && <Badge variant="destructive" className="ml-2">ANULADA</Badge>}</TableCell>
                                                    <TableCell>{doc.NOMBRE_CLIENTE}</TableCell>
                                                    <TableCell>{doc.VENDEDOR}</TableCell>
                                                    <TableCell><Badge variant="outline">{doc.RUTA || 'Sin Ruta'}</Badge></TableCell>
                                                    <TableCell className="text-xs">{doc.EMBARCAR_A}</TableCell>
                                                     <TableCell className="text-xs max-w-xs truncate" title={doc.OBSERVACIONES}>{doc.OBSERVACIONES}</TableCell>
                                                    <TableCell>
                                                        <Select
                                                            value={assignedContainerId || doc.suggestedContainerId || ''}
                                                            onValueChange={(value) => handleSingleAssign(doc.FACTURA, value === 'unassign' ? null : value)}
                                                            disabled={isCancelled}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Seleccionar..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {assignedContainerId && <SelectItem value="unassign" className="text-destructive">Quitar Asignación</SelectItem>}
                                                                {containers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                             </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="order" className="flex-1 overflow-auto">
                    <DragDropContext onDragEnd={handleOnDragEnd}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 h-full">
                            {containers.map(container => (
                                <Droppable key={container.id} droppableId={String(container.id)}>
                                    {(provided) => (
                                        <Card ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col">
                                            <CardHeader>
                                                 <div className="flex justify-between items-start">
                                                    <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5"/>{container.name}</CardTitle>
                                                    {hasPermission('warehouse:dispatch-containers:manage') && (
                                                        <AlertDialog open={isClearConfirmOpen && containerToModify?.id === container.id} onOpenChange={(open) => { if (!open) { setIsClearConfirmOpen(false); setContainerToModify(null); }}}>
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { setIsClearConfirmOpen(true); setContainerToModify(container); }}>
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>¿Limpiar Contenedor &quot;{container.name}&quot;?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        Esta acción desasignará **TODOS** los documentos del contenedor. Es útil para reiniciar la ruta para el día siguiente. No se borra ningún registro de verificación.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={handleClearContainer} className="bg-destructive hover:bg-destructive/90">Sí, Limpiar Contenedor</AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </CardHeader>
                                            <CardContent className="flex-1 p-4 bg-muted/40 rounded-b-lg overflow-y-auto">
                                                {(assignments[container.id!] || []).map((item, index) => (
                                                    <DraggableItem key={item.id} item={item} erpHeaders={erpHeaders} index={index} onUnassign={handleUnassign} />
                                                ))}
                                                {provided.placeholder}
                                            </CardContent>
                                             <CardFooter className="p-2">
                                                {((assignments[container.id!] || []).length > 0) && hasPermission('warehouse:dispatch:reset') && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="outline" size="sm" className="w-full" onClick={() => setContainerToModify(container)}>
                                                                <RefreshCcw className="mr-2 h-4 w-4" /> Reiniciar Ruta
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>¿Reiniciar la ruta &quot;{container.name}&quot;?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Todos los documentos en este contenedor volverán al estado &quot;pendiente&quot;, permitiendo que sean verificados de nuevo.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction onClick={handleResetContainer}>Sí, reiniciar</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
                                            </CardFooter>
                                        </Card>
                                    )}
                                </Droppable>
                            ))}
                        </div>
                    </DragDropContext>
                </TabsContent>
            </Tabs>
        </div>
    );
}
