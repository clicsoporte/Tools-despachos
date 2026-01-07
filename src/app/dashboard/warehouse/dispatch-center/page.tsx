/**
 * @fileoverview Main page for the Dispatch Center, where checkers access their assigned routes.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useRouter } from 'next/navigation';
import { getContainers, getAssignmentsForContainer, lockEntity, releaseLock, moveAssignmentToContainer, getAssignmentsByIds, updateAssignmentStatus, resetContainerAssignments, unassignDocumentFromContainer, unassignAllFromContainer } from '@/modules/warehouse/lib/actions';
import type { DispatchContainer, DispatchAssignment, ErpInvoiceHeader, ErpInvoiceLine } from '@/modules/core/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Lock, Unlock, ArrowRight, ArrowLeft, CheckCircle, Package, AlertTriangle, Undo2, RefreshCcw, Trash2 } from 'lucide-react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getInvoicesByIds } from '@/modules/core/lib/db';
import { Badge } from '@/components/ui/badge';


export default function DispatchCenterPage() {
    const { isAuthorized, hasPermission } = useAuthorization(['warehouse:dispatch-check:use']);
    const { setTitle } = usePageTitle();
    const { user, isReady } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [containers, setContainers] = useState<DispatchContainer[]>([]);
    const [selectedContainer, setSelectedContainer] = useState<DispatchContainer | null>(null);
    const [assignments, setAssignments] = useState<DispatchAssignment[]>([]);
    const [erpHeaders, setErpHeaders] = useState<Map<string, ErpInvoiceHeader>>(new Map());

    const [assignmentToMove, setAssignmentToMove] = useState<DispatchAssignment | null>(null);
    const [containerToReset, setContainerToReset] = useState<DispatchContainer | null>(null);
    
    const fetchContainers = useCallback(async () => {
        setIsLoading(true);
        try {
            const fetchedContainers = await getContainers();
            setContainers(fetchedContainers);
        } catch (error: any) {
            toast({ title: "Error", description: `No se pudieron cargar los contenedores: ${error.message}`, variant: "destructive" });
        } finally {
            setIsLoading(false);
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
            const fetchedAssignments = await getAssignmentsForContainer(container.id!);
            
            if (fetchedAssignments.length > 0) {
                const documentIds = fetchedAssignments.map(a => a.documentId);
                const invoiceDetails = await getInvoicesByIds(documentIds);
                const headersMap = new Map<string, ErpInvoiceHeader>(invoiceDetails.map((h: ErpInvoiceHeader) => [h.FACTURA, h]));
                setErpHeaders(headersMap);
            }

            setAssignments(fetchedAssignments);
            setSelectedContainer(container);
            sessionStorage.setItem('activeDispatchContainer', String(container.id!));
        } catch (error: any) {
            toast({ title: "Error", description: `No se pudieron cargar las asignaciones: ${error.message}`, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [user, toast]);

    useEffect(() => {
        setTitle("Centro de Despacho");
        if (isReady && isAuthorized) {
            fetchContainers();
        } else if (isReady && !isAuthorized) {
            setIsLoading(false);
        }
    }, [setTitle, isReady, isAuthorized, fetchContainers]);

    useEffect(() => {
        const checkActiveSession = async () => {
            const activeContainerId = sessionStorage.getItem('activeDispatchContainer');
            if (activeContainerId && containers.length > 0) {
                const activeContainer = containers.find(c => c.id === Number(activeContainerId));
                if (activeContainer) {
                    await handleSelectContainer(activeContainer, true); // true to skip re-locking
                }
            }
        };
        if (containers.length > 0) {
            checkActiveSession();
        }
    }, [containers, handleSelectContainer]);

    const handleExitContainer = async () => {
        if (!user || !selectedContainer) return;
        try {
            await releaseLock([selectedContainer.id!], 'container', user.id);
            sessionStorage.removeItem('activeDispatchContainer');
            setSelectedContainer(null);
            setAssignments([]);
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
            setAssignments(prev => prev.filter(a => a.id !== assignmentToMove.id));
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
                setAssignments(fetchedAssignments);
            }
        } catch (error: any) {
            toast({ title: "Error al Reabrir", description: error.message, variant: "destructive" });
        }
    };
    
    const handleResetContainer = async () => {
        if (!containerToReset) return;
        try {
            await resetContainerAssignments(containerToReset.id!);
            toast({ title: 'Ruta Reiniciada', description: `Todos los documentos en "${containerToReset.name}" están pendientes de nuevo.` });
            setContainerToReset(null);
            await fetchContainers(); // Refresh the main view
        } catch (error: any) {
             toast({ title: "Error al Reiniciar", description: `No se pudo reiniciar la ruta. ${error.message}`, variant: "destructive" });
        }
    };
    
    const handleClearContainer = async (containerToClear: DispatchContainer) => {
        try {
            await unassignAllFromContainer(containerToClear.id!);
            toast({ title: 'Contenedor Limpiado', description: `Se desasignaron todos los documentos de "${containerToClear.name}".`, variant: "destructive"});
            fetchContainers(); // Refresh the container list to show updated counts
        } catch (error: any) {
            toast({ title: 'Error al Limpiar', description: `No se pudieron limpiar las asignaciones. ${error.message}`, variant: 'destructive'});
        }
    };

    if (isLoading && !selectedContainer) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }
    
    if (!isAuthorized) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-destructive">Acceso Denegado</h1>
                <p className="text-muted-foreground">No tienes permiso para usar el centro de despacho.</p>
            </div>
        );
    }
    
    if (selectedContainer) {
        const allCompleted = assignments.length > 0 && assignments.every(a => a.status === 'completed' || a.status === 'discrepancy');

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
                         <CardFooter className="justify-center mt-6">
                            <Button onClick={handleExitContainer}>Volver a la Selección de Rutas</Button>
                         </CardFooter>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {assignments.map(a => {
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
    
    return (
        <div className="p-4 md:p-8">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Centro de Despacho</h1>
                <p className="text-muted-foreground">Selecciona una ruta para comenzar la verificación de despachos.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {containers.map(c => {
                    const isRouteCompleted = c.assignmentCount ?? 0 > 0 && c.completedAssignmentCount === c.assignmentCount;
                    return (
                        <Card key={c.id} className={cn("flex flex-col transition-all", isRouteCompleted && 'border-green-500 bg-green-50')}>
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <CardTitle className="flex items-center gap-2">
                                        {isRouteCompleted && <CheckCircle className="h-6 w-6 text-green-600" />}
                                        {c.name}
                                    </CardTitle>
                                    {hasPermission('warehouse:dispatch-containers:manage') && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                                    <Trash2 className="h-4 w-4"/>
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Limpiar Contenedor?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Esta acción desasignará TODOS los documentos del contenedor "{c.name}", pero NO afectará el estado de las verificaciones ya completadas. Es útil para preparar la ruta para un nuevo día.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => {}}>Sí, Limpiar</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </div>
                                <CardDescription>Creado el {format(parseISO(c.createdAt), 'dd/MM/yyyy')}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-grow">
                                {c.isLocked ? (
                                    <div className="flex items-center gap-2 text-destructive">
                                        <Lock className="h-4 w-4"/>
                                        <span className="text-sm font-semibold">En uso por: {c.lockedBy}</span>
                                    </div>
                                ) : isRouteCompleted ? (
                                     <div className="text-sm text-green-700 font-semibold space-y-1">
                                        <p>Ruta Completada</p>
                                        <p className="text-xs font-normal">por {c.lastVerifiedBy || 'N/A'} el {c.lastVerifiedAt ? format(parseISO(c.lastVerifiedAt), 'dd/MM/yy') : 'N/A'}</p>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Package className="h-4 w-4" />
                                        <span className="text-sm font-semibold">
                                            {c.assignmentCount || 0} documento(s)
                                        </span>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex flex-col gap-2 items-stretch">
                                <Button className="w-full" onClick={() => handleSelectContainer(c)} disabled={c.isLocked && c.lockedByUserId !== user?.id}>
                                    {isRouteCompleted ? 'Ver Documentos' : (c.isLocked && c.lockedByUserId === user?.id ? 'Reanudar Sesión' : 'Iniciar Verificación')}
                                </Button>
                                {isRouteCompleted && hasPermission('warehouse:dispatch:reset') && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="outline" size="sm" onClick={() => setContainerToReset(c)}>
                                                <RefreshCcw className="mr-2 h-4 w-4" /> Reiniciar Ruta
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>¿Reiniciar esta ruta?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Todos los documentos en &quot;{c.name}&quot; volverán al estado pendiente. Esta acción es útil para volver a verificar una ruta completa.
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
                    )
                })}
            </div>
        </div>
    );
}
