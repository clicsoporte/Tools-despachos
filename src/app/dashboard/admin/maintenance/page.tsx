/**
 * @fileoverview System maintenance page for administrators.
 * This page provides critical, high-risk functionalities such as database
 * backup, restore, and factory reset. It is designed to be modular to support
 * future tools with separate databases.
 */
"use client";

import { useState, useCallback, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select"
import { useToast } from "@/modules/core/hooks/use-toast";
import { logError, logInfo, logWarn } from "@/modules/core/lib/logger";
import { UploadCloud, RotateCcw, Loader2, Save, LifeBuoy, Trash2 as TrashIcon, Download, Skull, AlertTriangle, FileUp, ShieldCheck, CheckCircle, Wrench, FileArchive } from "lucide-react";
import { useDropzone } from 'react-dropzone';
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { restoreAllFromUpdateBackup, listAllUpdateBackups, deleteOldUpdateBackups, restoreDatabase, backupAllForUpdate, factoryReset, getDbModules, getCurrentVersion, runDatabaseAudit, runSingleModuleMigration, cleanupAllExportFiles } from '@/modules/core/lib/db';
import type { UpdateBackupInfo, DatabaseModule, AuditResult } from '@/modules/core/types';
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from "@/lib/utils";
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { shutdownServer } from '@/modules/core/lib/actions';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';


export default function MaintenancePage() {
    const { isAuthorized, hasPermission } = useAuthorization(['admin:maintenance:backup', 'admin:maintenance:restore', 'admin:maintenance:reset']);
    const { user } = useAuth();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingAction, setProcessingAction] = useState<string | null>(null);
    const { setTitle } = usePageTitle();

    // State for update backups
    const [systemVersion, setSystemVersion] = useState<string | null>(null);
    const [updateBackups, setUpdateBackups] = useState<UpdateBackupInfo[]>([]);
    const [dbModules, setDbModules] = useState<Omit<DatabaseModule, 'schema'>[]>([]);
    const [isRestoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
    const [isClearBackupsConfirmOpen, setClearBackupsConfirmOpen] = useState(false);
    const [isClearExportsConfirmOpen, setClearExportsConfirmOpen] = useState(false);
    
    // State for module reset
    const [isResetConfirmOpen, setResetConfirmOpen] = useState(false);
    const [resetStep, setResetStep] = useState(0);
    const [resetConfirmationText, setResetConfirmationText] = useState('');
    const [moduleToReset, setModuleToReset] = useState<string>('');

    // State for full reset
    const [isFullResetConfirmOpen, setFullResetConfirmOpen] = useState(false);
    const [fullResetStep, setFullResetStep] = useState(0);
    const [fullResetConfirmationText, setFullResetConfirmationText] = useState('');

    const [showAllRestorePoints, setShowAllRestorePoints] = useState(false);
    const [selectedRestoreTimestamp, setSelectedRestoreTimestamp] = useState<string>('');

    // State for single module restore
    const [isSingleRestoreOpen, setIsSingleRestoreOpen] = useState(false);
    const [moduleToRestore, setModuleToRestore] = useState<string>('');
    const [fileToRestore, setFileToRestore] = useState<File | null>(null);
    const [singleRestoreStep, setSingleRestoreStep] = useState(0);
    const [singleRestoreConfirmationText, setSingleRestoreConfirmationText] = useState('');
    
    // State for audit
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResults, setAuditResults] = useState<AuditResult[] | null>(null);


    const fetchMaintenanceData = useCallback(async () => {
        setIsProcessing(true);
        setProcessingAction('load');
        try {
            const [backups, modules, version] = await Promise.all([
                listAllUpdateBackups(),
                getDbModules(),
                getCurrentVersion()
            ]);
            setUpdateBackups(backups);
            setDbModules(modules);
            setSystemVersion(version);
            if (backups.length > 0) {
                const latestTimestamp = backups.reduce((latest: string, current: UpdateBackupInfo) => new Date(current.date) > new Date(latest) ? current.date : latest, backups[0].date);
                setSelectedRestoreTimestamp(latestTimestamp);
            }
        } catch(error: any) {
            logError("Error fetching maintenance data", { error: error.message });
            toast({ title: "Error", description: "No se pudieron cargar los datos de mantenimiento.", variant: "destructive" });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    }, [toast]);

    useEffect(() => {
        setTitle("Mantenimiento del Sistema");
        if(isAuthorized) {
            fetchMaintenanceData();
        }
    }, [setTitle, fetchMaintenanceData, isAuthorized]);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        setFileToRestore(acceptedFiles[0]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'], 'application/octet-stream': ['.db', '.sqlite', '.sqlite3'] },
        maxFiles: 1,
    });
    
    const handleFullBackup = async () => {
        setIsProcessing(true);
        setProcessingAction('full-backup');
        try {
            await backupAllForUpdate();
            await fetchMaintenanceData();
            toast({
                title: "Backup Completo Creado",
                description: `Se creó un nuevo punto de restauración para la actualización.`
            });
            await logInfo(`User ${user?.name} created a new full backup for update.`);
        } catch (error: any) {
             toast({
                title: "Error de Backup",
                description: `No se pudo crear el backup completo. ${error.message}`,
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    };
    
    const handleFullRestore = async () => {
        if (!selectedRestoreTimestamp) {
            toast({ title: "Error", description: "Debe seleccionar un punto de restauración.", variant: "destructive" });
            return;
        }
        setIsProcessing(true);
        setProcessingAction('full-restore');
        
        try {
            await restoreAllFromUpdateBackup(selectedRestoreTimestamp);

            toast({
                title: "Restauración Iniciada",
                description: "Los datos han sido restaurados. Por favor, reinicie manualmente el servidor de la aplicación para aplicar los cambios.",
                duration: 10000,
            });
            
            await logWarn(`System restore initiated by ${user?.name} from backup point ${selectedRestoreTimestamp}. A manual server restart is required.`);

        } catch (error: any) {
             toast({
                title: "Error de Restauración",
                description: `No se pudo completar la restauración. ${error.message}`,
                variant: "destructive"
            });
        } finally {
             setIsProcessing(false);
             setProcessingAction(null);
        }
    };

    const handleClearOldBackups = async () => {
        if (uniqueTimestamps.length <= 1) {
            toast({ title: "Acción no necesaria", description: "No hay backups antiguos para eliminar.", variant: "default"});
            return;
        }

        setIsProcessing(true);
        setProcessingAction('clear-backups');
        try {
            const count = await deleteOldUpdateBackups();
            await fetchMaintenanceData();
            await logInfo(`User ${user?.name} cleared ${count} old backup sets.`);
            toast({
                title: "Limpieza Completada",
                description: `Se han eliminado ${count} puntos de restauración antiguos.`
            });
        } catch (error: any) {
             toast({
                title: "Error al Limpiar",
                description: `No se pudieron eliminar los backups. ${error.message}`,
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    };

    const handleClearExportFiles = async () => {
        setIsProcessing(true);
        setProcessingAction('clear-exports');
        try {
            const count = await cleanupAllExportFiles();
            toast({
                title: "Limpieza Completada",
                description: `Se han eliminado ${count} archivos de exportación temporales.`
            });
            await logInfo(`User ${user?.name} cleared ${count} temporary export files.`);
        } catch (error: any) {
            toast({
                title: "Error al Limpiar",
                description: `No se pudieron eliminar los archivos de exportación. ${error.message}`,
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    }

    const handleSingleModuleRestore = async () => {
        if (singleRestoreStep !== 2 || singleRestoreConfirmationText !== 'RESTAURAR' || !moduleToRestore || !fileToRestore) {
            toast({ title: "Confirmación requerida", description: "Debe seleccionar un módulo, un archivo y seguir los pasos para confirmar.", variant: "destructive" });
            return;
        }
        setIsProcessing(true);
        setProcessingAction('single-restore');
        try {
            const moduleName = dbModules.find(m => m.id === moduleToRestore)?.name || moduleToRestore;
            
            await restoreDatabase(moduleToRestore, fileToRestore);

            toast({
                title: "Módulo Restaurado",
                description: `La base de datos de "${moduleName}" ha sido restaurada. Por favor, reinicie manualmente el servidor.`,
                duration: 10000,
            });

            await logWarn(`Module ${moduleName} was restored by ${user?.name} from a file backup. A manual server restart is required.`);
            
        } catch (error: any) {
             toast({ title: "Error de Restauración", description: error.message, variant: "destructive" });
            logError("Single module restore failed.", { error: error.message, module: moduleToRestore });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    };

    const handleFactoryReset = async () => {
        if (resetStep !== 2 || resetConfirmationText !== 'RESETEAR' || !moduleToReset) {
            toast({ title: "Confirmación requerida", description: "Debe seleccionar un módulo y seguir los pasos para confirmar la acción.", variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        setProcessingAction('factory-reset');
        try {
            const moduleName = dbModules.find(m => m.id === moduleToReset)?.name || moduleToReset;
            
            await factoryReset(moduleToReset);
            
            toast({
                title: "Módulo Reseteado",
                description: `Se ha borrado la base de datos de "${moduleName}". Por favor, reinicie manualmente el servidor.`,
                duration: 10000,
            });

            await logWarn(`MODULE FACTORY RESET initiated by user ${user?.name} for module ${moduleName}. A manual server restart is required.`);

        } catch (error: any) {
            toast({ title: "Error en el Reseteo", description: error.message, variant: "destructive" });
            logError("Factory reset failed.", { error: error.message, module: moduleToReset });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    }
    
    const handleFullFactoryReset = async () => {
        if (fullResetStep !== 2 || fullResetConfirmationText !== 'RESETEAR TODO') {
            toast({ title: "Confirmación Estricta Requerida", description: "Debe seguir todos los pasos para confirmar esta acción irreversible.", variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        setProcessingAction('full-factory-reset');
        try {
            await factoryReset('__all__');

            toast({
                title: "Reseteo de Fábrica Completado",
                description: "Se han borrado todas las bases de datos. Por favor, reinicie manualmente el servidor para reinicializar.",
                duration: 10000,
            });

            await logWarn(`FULL SYSTEM FACTORY RESET initiated by user ${user?.name}. All data will be wiped. A manual server restart is required.`);
        } catch (error: any) {
            toast({ title: "Error en el Reseteo Total", description: error.message, variant: "destructive" });
            logError("Full factory reset failed.", { error: error.message });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    };

    const handleRunAudit = async () => {
        if (!user) return;
        setIsAuditing(true);
        setAuditResults(null);
        try {
            const results = await runDatabaseAudit(user.name);
            setAuditResults(results);
        } catch (error: any) {
            logError("Error running database audit", { error: error.message });
            toast({ title: "Error en la Auditoría", description: "No se pudo completar el proceso de auditoría.", variant: "destructive" });
        } finally {
            setIsAuditing(false);
        }
    }

    const handleManualMigration = async (moduleId: string) => {
        if (!user) return;
        setIsAuditing(true); // Reuse auditing spinner
        try {
            await runSingleModuleMigration(moduleId);
            toast({ title: "Corrección Aplicada", description: `Se intentó aplicar la migración para el módulo. Ejecuta la auditoría de nuevo para verificar.` });
            // Re-run audit automatically after attempting fix
            await handleRunAudit();
        } catch (error: any) {
            logError(`Manual migration failed for module ${moduleId}`, { error: error.message, user: user.name });
            toast({ title: "Error al Corregir", description: `No se pudo aplicar la corrección. ${error.message}`, variant: "destructive" });
        } finally {
            setIsAuditing(false);
        }
    };
    
    const uniqueTimestamps = [...new Set(updateBackups.map(b => b.date))].sort((a,b) => new Date(b).getTime() - new Date(a).getTime());

    const oldBackupsCount = uniqueTimestamps.length > 1 ? uniqueTimestamps.length - 1 : 0;
    
    if (isAuthorized === null) {
        return null;
    }

    if (!isAuthorized) {
        return null;
    }
    
    const selectedBackupVersion = selectedRestoreTimestamp ? updateBackups.find(b => b.date === selectedRestoreTimestamp)?.version : null;
    const isVersionMismatch = systemVersion && selectedBackupVersion && systemVersion !== selectedBackupVersion;

    const hasAuditErrors = auditResults?.some(r => r.status === 'ERROR');

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-8">
                <Accordion type="multiple" defaultValue={['audit']} className="w-full space-y-6">
                     <Card>
                        <AccordionItem value="audit">
                            <AccordionTrigger className="p-6 hover:no-underline">
                                <div className="flex items-center gap-4">
                                    <ShieldCheck className="h-8 w-8 text-primary" />
                                    <div>
                                        <CardTitle>Centro de Actualización y Verificación</CardTitle>
                                        <CardDescription>
                                        Audita y repara la estructura de las bases de datos. Ideal después de una actualización.
                                        </CardDescription>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0 space-y-6">
                                <div className='flex flex-wrap gap-4 items-center'>
                                    <Button onClick={handleRunAudit} disabled={isAuditing}>
                                        {isAuditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                        Ejecutar Auditoría del Sistema
                                    </Button>
                                    {hasAuditErrors && (
                                        <Alert variant="destructive" className="flex-1">
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertTitle>¡Se encontraron problemas!</AlertTitle>
                                            <AlertDescription>Revisa los módulos marcados en rojo. Puedes intentar una reparación automática.</AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                                {auditResults && (
                                     <div className="space-y-4">
                                        {auditResults.map(result => (
                                            <Card key={result.moduleId} className={result.status === 'ERROR' ? 'border-destructive' : 'border-green-600'}>
                                                <CardHeader>
                                                    <CardTitle className="flex items-center justify-between">
                                                         <div className="flex items-center gap-2">
                                                            {result.status === 'OK' ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}
                                                            {result.moduleName} ({result.dbFile})
                                                         </div>
                                                          {result.status === 'ERROR' && (
                                                            <Button size="sm" variant="destructive" onClick={() => handleManualMigration(result.moduleId)} disabled={isAuditing}>
                                                                {isAuditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wrench className="mr-2 h-4 w-4"/>}
                                                                Intentar Reparación
                                                            </Button>
                                                        )}
                                                    </CardTitle>
                                                </CardHeader>
                                                {result.issues.length > 0 && (
                                                    <CardContent>
                                                        <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                                                            {result.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                                                        </ul>
                                                    </CardContent>
                                                )}
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Card>

                    <Card>
                        <AccordionItem value="backups">
                            <AccordionTrigger className="p-6 hover:no-underline">
                                <div className="flex items-center gap-4">
                                    <LifeBuoy className="h-8 w-8 text-blue-600" />
                                    <div>
                                        <CardTitle>Backups y Puntos de Restauración</CardTitle>
                                        <CardDescription>
                                        Crea puntos de restauración de todo el sistema, ideal antes de una actualización.
                                        </CardDescription>
                                    </div>
                                </div>
                            </AccordionTrigger>
                             <AccordionContent className="p-6 pt-0 space-y-6">
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-4 rounded-lg border p-4">
                                        <h3 className="font-semibold">Crear Punto de Restauración</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Crea una copia de seguridad de todas las bases de datos en un nuevo punto de restauración.
                                        </p>
                                        <Button onClick={handleFullBackup} disabled={isProcessing} className="w-full">
                                            {processingAction === 'full-backup' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                            Crear Punto de Restauración
                                        </Button>
                                    </div>
                                    <div className="space-y-4 rounded-lg border p-4">
                                        <h3 className="font-semibold">Restaurar Sistema Completo</h3>
                                        <div className="space-y-2">
                                            <Label>Punto de Restauración a Usar</Label>
                                            <Select value={selectedRestoreTimestamp} onValueChange={setSelectedRestoreTimestamp} disabled={isProcessing}>
                                                <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                                <SelectContent>
                                                    {uniqueTimestamps.slice(0, showAllRestorePoints ? undefined : 5).map(ts => {
                                                        const backupInfo = updateBackups.find(b => b.date === ts);
                                                        return (
                                                            <SelectItem key={ts} value={ts}>
                                                                {format(parseISO(ts), "dd/MM/yyyy 'a las' HH:mm:ss", { locale: es })}
                                                                {backupInfo?.version && <span className="ml-2 text-xs text-muted-foreground"> (v{backupInfo.version})</span>}
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                            <div className="flex items-center space-x-2 pt-1">
                                                <Checkbox id="show-all-restore-points" checked={showAllRestorePoints} onCheckedChange={(checked) => setShowAllRestorePoints(checked as boolean)} />
                                                <Label htmlFor="show-all-restore-points" className="text-sm font-normal">Mostrar todos los puntos</Label>
                                            </div>
                                        </div>
                                         {isVersionMismatch && (
                                            <Alert variant="destructive">
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertTitle>¡Cuidado! Incompatibilidad de Versiones</AlertTitle>
                                                <AlertDescription>
                                                   Estás intentando restaurar un backup de la versión <strong>v{selectedBackupVersion}</strong> sobre la versión actual del sistema <strong>v{systemVersion}</strong>. Esto puede causar errores o corrupción de datos. Procede solo si también vas a restaurar los archivos de la aplicación a la versión anterior.
                                                </AlertDescription>
                                            </Alert>
                                        )}
                                        <AlertDialog open={isRestoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" disabled={isProcessing || !selectedRestoreTimestamp} className="w-full">
                                                    <RotateCcw className="mr-2 h-4 w-4" />Restaurar desde Selección
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Confirmar Restauración del Sistema?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Esta acción reemplazará **TODAS** las bases de datos actuales con las del backup seleccionado. Se requiere un reinicio manual del servidor de la aplicación.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleFullRestore}>Sí, restaurar todo</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                                <Card>
                                    <CardHeader><CardTitle>Archivos de Puntos de Restauración</CardTitle></CardHeader>
                                    <CardContent>
                                        <ScrollArea className="h-60 w-full rounded-md border p-2">
                                            {updateBackups.length > 0 ? (
                                                <div className="space-y-2">
                                                    {updateBackups.map(b => (
                                                        <div key={b.fileName} className="flex items-center justify-between rounded-md p-2 hover:bg-muted">
                                                            <div>
                                                                <p className="font-semibold text-sm">{b.moduleName} {b.version && <span className="font-normal text-xs text-muted-foreground">(v{b.version})</span>}</p>
                                                                <p className="text-xs text-muted-foreground">{format(parseISO(b.date), "dd/MM/yyyy HH:mm:ss", { locale: es })}</p>
                                                            </div>
                                                            <a href={`/api/temp-backups?file=${encodeURIComponent(b.fileName)}`} download={b.fileName}>
                                                                <Button variant="ghost" size="icon"><Download className="h-4 w-4"/></Button>
                                                            </a>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <div className="flex h-full items-center justify-center"><p className="text-muted-foreground text-sm">No hay puntos de restauración.</p></div>}
                                        </ScrollArea>
                                    </CardContent>
                                    <CardFooter>
                                        <AlertDialog open={isClearBackupsConfirmOpen} onOpenChange={setClearBackupsConfirmOpen}>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="outline" disabled={isProcessing || oldBackupsCount === 0}>
                                                    <TrashIcon className="mr-2 h-4 w-4" />
                                                    Limpiar {oldBackupsCount > 0 ? `${oldBackupsCount} Puntos Antiguos` : 'Backups'}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Limpiar Backups Antiguos?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Se eliminarán todos los puntos de restauración excepto el más reciente. Esta acción no se puede deshacer.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleClearOldBackups}>Sí, limpiar</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </CardFooter>
                                </Card>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>
                    
                    {hasPermission('admin:maintenance:reset') && (
                        <Card className="border-destructive">
                            <AccordionItem value="danger-zone">
                                <AccordionTrigger className="p-6 hover:no-underline">
                                    <div className="flex items-center gap-4">
                                        <Skull className="h-8 w-8 text-destructive" />
                                        <div>
                                            <CardTitle>Zona de Peligro</CardTitle>
                                            <CardDescription>Acciones críticas e irreversibles. Usar con extrema precaución.</CardDescription>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-6 pt-0 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4 rounded-lg border p-4">
                                            <h3 className="font-semibold">Limpiar Archivos Temporales</h3>
                                            <p className="text-sm text-muted-foreground">Elimina todos los archivos generados por las exportaciones de reportes (Excel) que se han acumulado en el servidor.</p>
                                            <AlertDialog open={isClearExportsConfirmOpen} onOpenChange={setClearExportsConfirmOpen}>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="outline" className="w-full" disabled={isProcessing}>
                                                        <FileArchive className="mr-2 h-4 w-4" />Limpiar Exportaciones
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Limpiar Archivos de Exportación?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Se eliminarán todos los archivos temporales de la carpeta de exportaciones.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleClearExportFiles}>Sí, limpiar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                        <div className="space-y-4 rounded-lg border p-4">
                                            <h3 className="font-semibold">Restaurar Módulo Individual</h3>
                                            <p className="text-sm text-muted-foreground">Reemplaza la base de datos de un módulo con un archivo .db que subas desde tu computadora.</p>
                                            <Dialog open={isSingleRestoreOpen} onOpenChange={(open: boolean) => {
                                                if (!open) { setSingleRestoreStep(0); setSingleRestoreConfirmationText(''); setModuleToRestore(''); setFileToRestore(null); }
                                                setIsSingleRestoreOpen(open);
                                            }}>
                                                <DialogTrigger asChild>
                                                    <Button variant="destructive" className="w-full"><FileUp className="mr-2 h-4 w-4"/>Restaurar Módulo</Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle className="flex items-center gap-2"><AlertTriangle/>Confirmación de Restauración</DialogTitle>
                                                        <DialogDescription>Esta acción reemplazará la base de datos del módulo seleccionado. Todos los datos actuales en ese módulo se perderán.</DialogDescription>
                                                    </DialogHeader>
                                                    <div className="py-4 space-y-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="restore-module-select">Módulo a Restaurar</Label>
                                                            <Select value={moduleToRestore} onValueChange={setModuleToRestore}><SelectTrigger id="restore-module-select"><SelectValue placeholder="Seleccionar módulo..." /></SelectTrigger><SelectContent>{dbModules.map(m => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}</SelectContent></Select>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>Archivo de Backup (.db)</Label>
                                                            <div {...getRootProps()} className={cn("flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors", isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50')}>
                                                                <input {...getInputProps()} />
                                                                <UploadCloud className="w-8 h-8 text-muted-foreground" />
                                                                {fileToRestore ? <p className="mt-2 text-sm font-medium">{fileToRestore.name}</p> : <p className="mt-2 text-center text-sm text-muted-foreground">Arrastra un archivo .db aquí o haz clic para seleccionar</p>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <Checkbox id="restore-single-confirm-checkbox" onCheckedChange={(checked) => setSingleRestoreStep(checked ? 1 : 0)} disabled={!moduleToRestore || !fileToRestore}/>
                                                            <Label htmlFor="restore-single-confirm-checkbox" className="font-medium text-destructive">Entiendo las consecuencias y deseo continuar.</Label>
                                                        </div>
                                                        {singleRestoreStep > 0 && (
                                                            <div className="space-y-2">
                                                                <Label htmlFor="restore-single-confirmation-text">Para confirmar, escribe &quot;RESTAURAR&quot;:</Label>
                                                                <Input id="restore-single-confirmation-text" value={singleRestoreConfirmationText} onChange={(e) => { setSingleRestoreConfirmationText(e.target.value.toUpperCase()); if (e.target.value.toUpperCase() === 'RESTAURAR') {setSingleRestoreStep(2);} else {setSingleRestoreStep(1);}}} className="border-destructive focus-visible:ring-destructive" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <DialogFooter>
                                                        <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                                                        <Button variant="destructive" onClick={handleSingleModuleRestore} disabled={isProcessing || singleRestoreStep !== 2 || singleRestoreConfirmationText !== 'RESTAURAR'}>
                                                            {processingAction === 'single-restore' ? <Loader2 className="mr-2 animate-spin"/> : <RotateCcw className="mr-2"/>} Sí, Restaurar Módulo
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                    <div className="space-y-4 rounded-lg border p-4">
                                        <h3 className="font-semibold">Resetear Módulo Específico</h3>
                                        <p className="text-sm text-muted-foreground">Borra todos los datos de un módulo y lo devuelve a su estado inicial. Útil si un módulo está corrupto.</p>
                                        <div className='flex flex-wrap gap-4 items-end'>
                                            <div className="flex-1 min-w-[200px] space-y-2"><Label htmlFor="reset-module-select">Módulo a Resetear</Label><Select value={moduleToReset} onValueChange={setModuleToReset}><SelectTrigger id="reset-module-select"><SelectValue placeholder="Seleccionar..." /></SelectTrigger><SelectContent>{dbModules.map(m => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}</SelectContent></Select></div>
                                            <AlertDialog open={isResetConfirmOpen} onOpenChange={(open: boolean) => { setResetConfirmOpen(open); if(!open) { setResetStep(0); setResetConfirmationText(''); }}}>
                                                <AlertDialogTrigger asChild><Button variant="destructive" disabled={isProcessing || !moduleToReset}><TrashIcon className="mr-2 h-4 w-4" />Resetear Módulo</Button></AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Confirmación Final Requerida</AlertDialogTitle>
                                                        <AlertDialogDescription>Esta acción borrará **TODA** la información del módulo &quot;{dbModules.find(m => m.id === moduleToReset)?.name || ''}&quot;.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <div className="py-4 space-y-4">
                                                        <div className="flex items-center space-x-2"><Checkbox id="reset-confirm-checkbox" onCheckedChange={(checked) => setResetStep(checked ? 1 : 0)} /><Label htmlFor="reset-confirm-checkbox" className="font-medium text-destructive">Entiendo las consecuencias.</Label></div>
                                                        {resetStep > 0 && (<div className="space-y-2"><Label htmlFor="reset-confirmation-text">Para confirmar, escribe &quot;RESETEAR&quot;:</Label><Input id="reset-confirmation-text" value={resetConfirmationText} onChange={(e) => { setResetConfirmationText(e.target.value.toUpperCase()); if (e.target.value.toUpperCase() === 'RESETEAR') {setResetStep(2);} else {setResetStep(1);}}} className="border-destructive focus-visible:ring-destructive" /></div>)}
                                                    </div>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleFactoryReset} disabled={isProcessing || resetStep !== 2 || resetConfirmationText !== 'RESETEAR'}>{processingAction === 'factory-reset' ? <Loader2 className="mr-2 animate-spin"/> : <TrashIcon className="mr-2"/>}Sí, Borrar Módulo</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                     <div className="space-y-4 rounded-lg border p-4">
                                        <h3 className="font-semibold">Resetear Todo el Sistema</h3>
                                        <p className="text-sm text-muted-foreground">Devuelve la aplicación completa a su estado de fábrica. Se borrarán todos los usuarios, configuraciones y datos. Es una acción irreversible.</p>
                                        <AlertDialog open={isFullResetConfirmOpen} onOpenChange={(open: boolean) => { setFullResetConfirmOpen(open); if(!open) { setFullResetStep(0); setFullResetConfirmationText(''); }}}>
                                            <AlertDialogTrigger asChild><Button variant="destructive" className='w-full'><Skull className="mr-2 h-4 w-4" />Resetear Sistema de Fábrica</Button></AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>¡ACCIÓN IRREVERSIBLE!</AlertDialogTitle>
                                                    <AlertDialogDescription>Se borrarán **TODAS LAS BASES DE DATOS** y se perderá toda la información. La aplicación se reiniciará.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <div className="py-4 space-y-4">
                                                    <div className="flex items-center space-x-2"><Checkbox id="full-reset-confirm-checkbox" onCheckedChange={(checked) => setFullResetStep(checked ? 1 : 0)} /><Label htmlFor="full-reset-confirm-checkbox" className="font-medium text-destructive">Entiendo que esto borrará toda la información.</Label></div>
                                                    {fullResetStep > 0 && (<div className="space-y-2"><Label htmlFor="full-reset-confirmation-text">Para confirmar, escribe &quot;RESETEAR TODO&quot;:</Label><Input id="full-reset-confirmation-text" value={fullResetConfirmationText} onChange={(e) => { setFullResetConfirmationText(e.target.value.toUpperCase()); if (e.target.value.toUpperCase() === 'RESETEAR TODO') {setFullResetStep(2);} else {setFullResetStep(1);}}} className="border-destructive focus-visible:ring-destructive" /></div>)}
                                                </div>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleFullFactoryReset} disabled={isProcessing || fullResetStep !== 2 || fullResetConfirmationText !== 'RESETEAR TODO'}>{processingAction === 'full-factory-reset' ? <Loader2 className="mr-2 animate-spin"/> : <Skull className="mr-2"/>}Sí, Borrar Todo</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Card>
                    )}
                </Accordion>
            </div>
            
            {(isProcessing) && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-primary p-3 text-primary-foreground shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Procesando...</span>
                </div>
            )}
        </main>
    );
}
