/**
 * @fileoverview Page for managing active locks in the warehouse population wizard.
 * Allows authorized users to view and forcibly release locks.
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getActiveLocks, forceReleaseLock } from '@/modules/warehouse/lib/actions';
import type { WarehouseLocation } from '@/modules/core/types';
import { Loader2, RefreshCw, Unlock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LockManagementPage() {
    const { hasPermission } = useAuthorization(['warehouse:locks:manage']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isReleasing, setIsReleasing] = useState<number | null>(null);
    const [locks, setLocks] = useState<WarehouseLocation[]>([]);

    const fetchLocks = useCallback(async () => {
        setIsLoading(true);
        try {
            const activeLocks = await getActiveLocks();
            setLocks(activeLocks);
        } catch (error: any) {
            logError("Failed to fetch active locks", { error: error.message });
            toast({ title: "Error", description: "No se pudieron cargar los bloqueos activos.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        setTitle("Gestión de Bloqueos de Almacén");
        if (hasPermission) {
            fetchLocks();
        }
    }, [setTitle, fetchLocks, hasPermission]);

    const handleReleaseLock = async (locationId: number) => {
        setIsReleasing(locationId);
        try {
            await forceReleaseLock(locationId);
            toast({ title: "Bloqueo Liberado", description: "La ubicación está disponible." });
            await fetchLocks(); // Refresh the list
        } catch (error: any) {
            logError("Failed to force release lock", { error: error.message, locationId });
            toast({ title: "Error", description: "No se pudo liberar el bloqueo.", variant: "destructive" });
        } finally {
            setIsReleasing(null);
        }
    };
    
    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                 <Skeleton className="h-64 w-full max-w-4xl mx-auto" />
            </main>
        )
    }

    if (!hasPermission) {
        return null;
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-8">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div>
                                <CardTitle>Ubicaciones Bloqueadas</CardTitle>
                                <CardDescription>
                                    Aquí puedes ver qué ubicaciones están siendo pobladas y por quién. Puedes liberar bloqueos si es necesario.
                                </CardDescription>
                            </div>
                            <Button onClick={() => fetchLocks()} disabled={isLoading}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refrescar
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Ubicación</TableHead>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Bloqueado por</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {locks.length > 0 ? locks.map(lock => (
                                    <TableRow key={lock.id}>
                                        <TableCell className="font-medium">{lock.name}</TableCell>
                                        <TableCell className="font-mono">{lock.code}</TableCell>
                                        <TableCell>{lock.lockedBy || 'Desconocido'}</TableCell>
                                        <TableCell className="text-right">
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="sm" disabled={isReleasing === lock.id}>
                                                        {isReleasing === lock.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
                                                        Liberar
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Forzar Liberación?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción finalizará la sesión de <strong>{lock.lockedBy}</strong> en la ubicación <strong>{lock.name}</strong>. El usuario podría perder progreso no guardado.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleReleaseLock(lock.id)}>Sí, liberar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            No hay ubicaciones bloqueadas en este momento.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
