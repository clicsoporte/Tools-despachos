/**
 * @fileoverview Page for the Dispatch Classifier.
 * This component allows logistics managers to view unassigned ERP documents (invoices, etc.)
 * and assign them to specific dispatch containers (routes).
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getContainers, getUnassignedDocuments, getAssignmentsForContainer, assignDocumentsToContainer, updateAssignmentOrder, moveAssignmentToContainer } from '@/modules/warehouse/lib/actions';
import type { DispatchContainer, ErpInvoiceHeader, DispatchAssignment } from '@/modules/core/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Search, CalendarIcon, Package, Truck, AlertTriangle } from 'lucide-react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parseISO, startOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { useDebounce } from 'use-debounce';
import { Badge } from '@/components/ui/badge';
import { getInvoicesByIds } from '@/modules/core/lib/db';

const DraggableItem = ({ item, erpHeaders, index }: { item: DispatchAssignment, erpHeaders: Map<string, ErpInvoiceHeader>, index: number }) => {
    const erpHeader = erpHeaders.get(item.documentId);
    const isCancelled = erpHeader?.ANULADA === 'S';

    return (
        <Draggable draggableId={item.documentId} index={index}>
            {(provided) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={cn(
                        "p-3 mb-2 rounded-md shadow-sm border",
                        isCancelled ? 'bg-destructive/10 border-destructive' : 'bg-card'
                    )}
                >
                    <div className="flex justify-between items-start">
                        <div className="flex-1">
                            <p className="font-semibold">{item.documentId}</p>
                            <p className="text-sm text-muted-foreground">{item.clientName}</p>
                        </div>
                        {isCancelled && <Badge variant="destructive" className="ml-2 flex-shrink-0"><AlertTriangle className="mr-1 h-3 w-3" /> ANULADA</Badge>}
                    </div>
                </div>
            )}
        </Draggable>
    );
};

export default function DispatchClassifierPage() {
    useAuthorization(['warehouse:dispatch-classifier:use']);
    const { setTitle } = usePageTitle();
    const { user } = useAuth();
    const { toast } = useToast();

    const [containers, setContainers] = useState<DispatchContainer[]>([]);
    const [assignments, setAssignments] = useState<Record<string, DispatchAssignment[]>>({});
    const [unassignedDocs, setUnassignedDocs] = useState<ErpInvoiceHeader[]>([]);
    const [erpHeaders, setErpHeaders] = useState<Map<string, ErpInvoiceHeader>>(new Map());
    
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDocs, setIsLoadingDocs] = useState(false);
    
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: startOfDay(subDays(new Date(), 7)), to: new Date() });
    
    useEffect(() => {
        setTitle("Clasificador de Despachos");
        const loadInitialData = async () => {
            setIsLoading(true);
            try {
                const fetchedContainers = await getContainers();
                setContainers(fetchedContainers);

                const assignmentsByContainer: Record<string, DispatchAssignment[]> = {};
                const allDocumentIds: string[] = [];

                for (const container of fetchedContainers) {
                    const containerAssignments = await getAssignmentsForContainer(container.id!);
                    assignmentsByContainer[container.id!] = containerAssignments;
                    allDocumentIds.push(...containerAssignments.map(a => a.documentId));
                }
                
                const invoiceDetails = await getInvoicesByIds(allDocumentIds);
                const headersMap = new Map<string, ErpInvoiceHeader>(invoiceDetails.map((h: ErpInvoiceHeader) => [h.FACTURA, h]));

                setAssignments(assignmentsByContainer);
                setErpHeaders(headersMap);

            } catch (error: any) {
                toast({ title: 'Error', description: `No se pudieron cargar los datos iniciales: ${error.message}`, variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, [setTitle, toast]);

    const handleFetchDocuments = useCallback(async () => {
        if (!dateRange?.from) {
            toast({ title: "Fecha requerida", description: "Por favor, selecciona un rango de fechas.", variant: "destructive" });
            return;
        }
        setIsLoadingDocs(true);
        try {
            const docs = await getUnassignedDocuments(dateRange);
            setUnassignedDocs(docs);
        } catch (error: any) {
             toast({ title: 'Error', description: `No se pudieron cargar los documentos del ERP: ${error.message}`, variant: 'destructive' });
        } finally {
            setIsLoadingDocs(false);
        }
    }, [dateRange, toast]);

    const onDragEnd = async (result: any) => {
        const { source, destination } = result;
        if (!destination) return;
        if (!user) return;

        const sourceId = source.droppableId;
        const destId = destination.droppableId;

        if (sourceId === destId) {
            // Reordering within the same container
            const items = Array.from(assignments[sourceId] || []);
            const [reorderedItem] = items.splice(source.index, 1);
            items.splice(destination.index, 0, reorderedItem);
            
            setAssignments(prev => ({ ...prev, [sourceId]: items }));
            
            await updateAssignmentOrder(Number(sourceId), items.map(item => item.documentId));

        } else {
            // Moving between containers
            if (sourceId === 'unassigned') {
                const docToAssign = unassignedDocs[source.index];
                
                await assignDocumentsToContainer([docToAssign.FACTURA], Number(destId), user.name);

                setUnassignedDocs(prev => prev.filter((_, i) => i !== source.index));
                
                const newAssignment: DispatchAssignment = {
                    id: -1, // Temporary ID
                    containerId: Number(destId),
                    documentId: docToAssign.FACTURA,
                    documentType: docToAssign.TIPO_DOCUMENTO,
                    documentDate: typeof docToAssign.FECHA === 'string' ? docToAssign.FECHA : (docToAssign.FECHA as Date).toISOString(),
                    clientId: docToAssign.CLIENTE,
                    clientName: docToAssign.NOMBRE_CLIENTE,
                    assignedBy: user.name,
                    assignedAt: new Date().toISOString(),
                    sortOrder: 0,
                    status: 'pending',
                };
                
                const destItems = Array.from(assignments[destId] || []);
                destItems.splice(destination.index, 0, newAssignment);
                setAssignments(prev => ({ ...prev, [destId]: destItems }));

            } else { // Moving from one container to another
                const sourceItems = Array.from(assignments[sourceId] || []);
                const [movedItem] = sourceItems.splice(source.index, 1);
                
                await moveAssignmentToContainer(movedItem.id, Number(destId));
                
                const destItems = Array.from(assignments[destId] || []);
                destItems.splice(destination.index, 0, movedItem);

                setAssignments(prev => ({
                    ...prev,
                    [sourceId]: sourceItems,
                    [destId]: destItems
                }));
            }
        }
    };
    
    if (isLoading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex flex-col h-screen">
                <header className="p-4 border-b">
                    <h1 className="text-2xl font-bold">Clasificador de Despachos</h1>
                    <p className="text-muted-foreground">Arrastra los documentos del ERP a sus contenedores de ruta correspondientes.</p>
                </header>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-[350px_1fr] gap-4 p-4 overflow-auto">
                    <div className="flex flex-col gap-4">
                        <Card>
                             <CardHeader>
                                <CardTitle>Documentos Pendientes del ERP</CardTitle>
                                <CardDescription>Facturas y remisiones sin asignar.</CardDescription>
                            </CardHeader>
                             <CardContent className="space-y-4">
                                <div className="flex flex-wrap items-center gap-4">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button id="date" variant={'outline'} className={cn('w-full justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, 'LLL dd, y', { locale: es })} - ${format(dateRange.to, 'LLL dd, y', { locale: es })}`) : format(dateRange.from, 'LLL dd, y', { locale: es })) : (<span>Rango de Fechas</span>)}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                                    </Popover>
                                    <Button onClick={handleFetchDocuments} disabled={isLoadingDocs} className="w-full">
                                        {isLoadingDocs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                        Buscar Documentos
                                    </Button>
                                </div>
                             </CardContent>
                        </Card>
                        <Droppable droppableId="unassigned">
                            {(provided) => (
                                <Card ref={provided.innerRef} {...provided.droppableProps} className="flex-1 bg-muted/20">
                                    <CardContent className="p-4 h-full overflow-y-auto">
                                        {unassignedDocs.map((doc, index) => (
                                            <Draggable key={doc.FACTURA} draggableId={doc.FACTURA} index={index}>
                                                {(provided) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        className={cn("p-3 mb-2 rounded-md shadow-sm border", doc.ANULADA === 'S' ? 'bg-destructive/10 border-destructive' : 'bg-card')}
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex-1">
                                                                <p className="font-semibold">{doc.FACTURA}</p>
                                                                <p className="text-sm text-muted-foreground">{doc.NOMBRE_CLIENTE}</p>
                                                            </div>
                                                            {doc.ANULADA === 'S' && <Badge variant="destructive" className="ml-2 flex-shrink-0"><AlertTriangle className="mr-1 h-3 w-3" /> ANULADA</Badge>}
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </CardContent>
                                </Card>
                            )}
                        </Droppable>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto">
                        {containers.map(container => (
                            <Droppable key={container.id} droppableId={String(container.id)}>
                                {(provided) => (
                                    <Card ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col h-full">
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5"/>{container.name}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="flex-1 p-4 bg-muted/40 rounded-b-lg overflow-y-auto">
                                            {(assignments[container.id!] || []).map((item, index) => (
                                                <DraggableItem key={item.documentId} item={item} erpHeaders={erpHeaders} index={index} />
                                            ))}
                                            {provided.placeholder}
                                        </CardContent>
                                    </Card>
                                )}
                            </Droppable>
                        ))}
                    </div>
                </div>
            </div>
        </DragDropContext>
    );
}
