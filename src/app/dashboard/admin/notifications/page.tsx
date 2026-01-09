/**
 * @fileoverview Admin page for managing configurable notification rules and scheduled tasks.
 */
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import type { NotificationRule, NotificationEventId, ScheduledTask } from '@/modules/core/types';
import { getAllNotificationRules, saveNotificationRule, deleteNotificationRule, getAllScheduledTasks, saveScheduledTask, deleteScheduledTask } from '@/modules/notifications/lib/actions';
import { NOTIFICATION_EVENTS } from '@/modules/notifications/lib/notification-events';
import { AVAILABLE_TASKS } from '@/lib/task-registry';
import { PlusCircle, Trash2, Edit, Loader2, Settings, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';

const emptyRule: Omit<NotificationRule, 'id'> = {
    name: '',
    event: 'onDispatchCompleted',
    action: 'sendEmail',
    recipients: [],
    subject: '',
    enabled: true,
};

const emptyTask: Omit<ScheduledTask, 'id'> = {
    name: '',
    schedule: '0 2 * * *', // Every day at 2 AM
    taskId: 'sync-erp',
    enabled: true,
};

export default function AutomationManagerPage() {
    useAuthorization(['admin:access']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // --- Notification Rules State ---
    const [rules, setRules] = useState<NotificationRule[]>([]);
    const [isRuleFormOpen, setIsRuleFormOpen] = useState(false);
    const [isEditingRule, setIsEditingRule] = useState(false);
    const [currentRule, setCurrentRule] = useState<Omit<NotificationRule, 'id'> | NotificationRule>(emptyRule);
    const [selectedModule, setSelectedModule] = useState('');
    const [ruleToDelete, setRuleToDelete] = useState<NotificationRule | null>(null);

    // --- Scheduled Tasks State ---
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
    const [isEditingTask, setIsEditingTask] = useState(false);
    const [currentTask, setCurrentTask] = useState<Omit<ScheduledTask, 'id'> | ScheduledTask>(emptyTask);
    const [taskToDelete, setTaskToDelete] = useState<ScheduledTask | null>(null);

    useEffect(() => {
        setTitle("Gestor de Automatización");
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [fetchedRules, fetchedTasks] = await Promise.all([
                    getAllNotificationRules(),
                    getAllScheduledTasks(),
                ]);
                setRules(fetchedRules);
                setTasks(fetchedTasks);
            } catch (error: any) {
                toast({ title: 'Error', description: 'No se pudieron cargar las reglas y tareas.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [setTitle, toast]);

    // --- Memoized values for Notification Rules ---
    const eventModules = useMemo(() => Array.from(new Set(NOTIFICATION_EVENTS.map(e => e.module))), []);
    const eventsForSelectedModule = useMemo(() => NOTIFICATION_EVENTS.filter(e => e.module === selectedModule), [selectedModule]);

    // --- Handlers for Notification Rules ---
    const handleRuleFormChange = (field: keyof typeof currentRule, value: any) => setCurrentRule(prev => ({ ...prev, [field]: value }));
    const handleModuleChange = (moduleName: string) => {
        setSelectedModule(moduleName);
        const firstEventOfModule = NOTIFICATION_EVENTS.find(e => e.module === moduleName)?.id;
        if (firstEventOfModule) handleRuleFormChange('event', firstEventOfModule);
    };

    const handleSaveRule = async () => {
        if (!currentRule.name || !currentRule.event || !currentRule.action || (currentRule.action === 'sendEmail' && currentRule.recipients.length === 0)) {
            toast({ title: 'Datos incompletos', description: 'Nombre, evento, acción y al menos un destinatario (para correos) son requeridos.', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        try {
            const savedRule = await saveNotificationRule(currentRule);
            setRules(prev => isEditingRule ? prev.map(r => r.id === savedRule.id ? savedRule : r) : [...prev, savedRule]);
            setIsRuleFormOpen(false);
            toast({ title: 'Regla Guardada', description: `La regla "${savedRule.name}" ha sido guardada.` });
        } catch (error: any) {
            toast({ title: 'Error al Guardar', description: error.message, variant: 'destructive' });
        } finally { setIsSubmitting(false); }
    };

    const handleDeleteRule = async () => {
        if (!ruleToDelete) return;
        setIsSubmitting(true);
        try {
            await deleteNotificationRule(ruleToDelete.id);
            setRules(rules.filter(r => r.id !== ruleToDelete.id));
            toast({ title: 'Regla Eliminada', variant: 'destructive' });
            setRuleToDelete(null);
        } catch (error: any) {
            toast({ title: 'Error al Eliminar', description: error.message, variant: 'destructive' });
        } finally { setIsSubmitting(false); }
    };

    const openRuleForm = (rule?: NotificationRule) => {
        if (rule) {
            setCurrentRule(rule);
            setSelectedModule(NOTIFICATION_EVENTS.find(e => e.id === rule.event)?.module || '');
            setIsEditingRule(true);
        } else {
            const firstModule = eventModules[0] || '';
            setCurrentRule(emptyRule);
            setSelectedModule(firstModule);
            handleModuleChange(firstModule);
            setIsEditingRule(false);
        }
        setIsRuleFormOpen(true);
    };

    // --- Handlers for Scheduled Tasks ---
    const handleTaskFormChange = (field: keyof typeof currentTask, value: any) => setCurrentTask(prev => ({ ...prev, [field]: value }));
    
    const handleSaveTask = async () => {
        if (!currentTask.name || !currentTask.schedule || !currentTask.taskId) {
            toast({ title: 'Datos incompletos', description: 'Nombre, horario y acción son requeridos.', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        try {
            const savedTask = await saveScheduledTask(currentTask);
            setTasks(prev => isEditingTask ? prev.map(t => t.id === savedTask.id ? savedTask : t) : [...prev, savedTask]);
            setIsTaskFormOpen(false);
            toast({ title: 'Tarea Guardada', description: `La tarea "${savedTask.name}" ha sido guardada.` });
        } catch (error: any) {
            toast({ title: 'Error al Guardar', description: error.message, variant: 'destructive' });
        } finally { setIsSubmitting(false); }
    };

    const handleDeleteTask = async () => {
        if (!taskToDelete) return;
        setIsSubmitting(true);
        try {
            await deleteScheduledTask(taskToDelete.id);
            setTasks(tasks.filter(t => t.id !== taskToDelete.id));
            toast({ title: 'Tarea Eliminada', variant: 'destructive' });
            setTaskToDelete(null);
        } catch (error: any) {
            toast({ title: 'Error al Eliminar', description: error.message, variant: 'destructive' });
        } finally { setIsSubmitting(false); }
    };

    const openTaskForm = (task?: ScheduledTask) => {
        if (task) {
            setCurrentTask(task);
            setIsEditingTask(true);
        } else {
            setCurrentTask(emptyTask);
            setIsEditingTask(false);
        }
        setIsTaskFormOpen(true);
    };


    if (isLoading) {
        return <main className="p-6"><Skeleton className="h-96 w-full" /></main>
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Card>
                <CardHeader>
                    <CardTitle>Gestor de Automatización</CardTitle>
                    <CardDescription>Gestiona reglas para enviar notificaciones automáticas y para ejecutar tareas programadas.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="notifications">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="notifications">Reglas de Notificación</TabsTrigger>
                            <TabsTrigger value="tasks">Tareas Programadas (Cron)</TabsTrigger>
                        </TabsList>
                        
                        {/* NOTIFICATION RULES TAB */}
                        <TabsContent value="notifications">
                            <div className="flex justify-end my-4 gap-2">
                                <Button variant="outline" asChild>
                                    <Link href="/dashboard/admin/notifications/settings"><Settings className="mr-2 h-4 w-4"/> Configurar Servicios</Link>
                                </Button>
                                <Button onClick={() => openRuleForm()}><PlusCircle className="mr-2 h-4 w-4"/> Nueva Regla</Button>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Evento</TableHead>
                                        <TableHead>Acción</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rules.length > 0 ? rules.map(rule => (
                                        <TableRow key={rule.id}>
                                            <TableCell className="font-medium">{rule.name}</TableCell>
                                            <TableCell>{NOTIFICATION_EVENTS.find(e => e.id === rule.event)?.name || rule.event}</TableCell>
                                            <TableCell>{rule.action === 'sendEmail' ? 'Correo' : 'Telegram'}</TableCell>
                                            <TableCell><Switch checked={rule.enabled} onCheckedChange={(checked) => saveNotificationRule({ ...rule, enabled: checked })}/></TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => openRuleForm(rule)}><Edit className="h-4 w-4"/></Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" onClick={() => setRuleToDelete(rule)}><Trash2 className="h-4 w-4 text-destructive"/></Button></AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>¿Eliminar esta regla?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDeleteRule} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Eliminar</AlertDialogAction></AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    )) : <TableRow><TableCell colSpan={5} className="text-center h-24">No hay reglas creadas.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </TabsContent>

                        {/* SCHEDULED TASKS TAB */}
                        <TabsContent value="tasks">
                            <Alert variant="destructive" className="my-4">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                    Los cambios en las tareas programadas (crear, editar, eliminar) solo se aplicarán después de que se **reinicie el servidor** de la aplicación.
                                </AlertDescription>
                            </Alert>
                             <div className="flex justify-end my-4">
                                <Button onClick={() => openTaskForm()}><PlusCircle className="mr-2 h-4 w-4"/> Nueva Tarea</Button>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre de la Tarea</TableHead>
                                        <TableHead>Horario (Cron)</TableHead>
                                        <TableHead>Acción a Ejecutar</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tasks.length > 0 ? tasks.map(task => (
                                        <TableRow key={task.id}>
                                            <TableCell className="font-medium">{task.name}</TableCell>
                                            <TableCell className="font-mono">{task.schedule}</TableCell>
                                            <TableCell>{AVAILABLE_TASKS[task.taskId]?.name || task.taskId}</TableCell>
                                            <TableCell><Switch checked={task.enabled} onCheckedChange={(checked) => saveScheduledTask({ ...task, enabled: checked })}/></TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => openTaskForm(task)}><Edit className="h-4 w-4"/></Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" onClick={() => setTaskToDelete(task)}><Trash2 className="h-4 w-4 text-destructive"/></Button></AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>¿Eliminar esta tarea?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDeleteTask} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Eliminar</AlertDialogAction></AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    )) : <TableRow><TableCell colSpan={5} className="text-center h-24">No hay tareas programadas.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Dialog for Notification Rules */}
             <Dialog open={isRuleFormOpen} onOpenChange={setIsRuleFormOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader><DialogTitle>{isEditingRule ? 'Editar Regla' : 'Nueva Regla de Notificación'}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label htmlFor="rule-name">Nombre de la Regla</Label><Input id="rule-name" value={currentRule.name} onChange={(e) => handleRuleFormChange('name', e.target.value)} placeholder="Ej: Notificar Despachos a Logística" /></div>
                        <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="rule-module">Módulo</Label><Select value={selectedModule} onValueChange={handleModuleChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{eventModules.map(module => <SelectItem key={module} value={module}>{module}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="rule-event">Disparador (Evento)</Label><Select value={currentRule.event} onValueChange={(val) => handleRuleFormChange('event', val as NotificationEventId)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{eventsForSelectedModule.map(event => <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>)}</SelectContent></Select></div></div>
                        <div className="space-y-2"><Label>Acción</Label><Select value={currentRule.action} onValueChange={(val) => handleRuleFormChange('action', val)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sendEmail">Enviar Correo Electrónico</SelectItem><SelectItem value="sendTelegram">Enviar a Telegram</SelectItem></SelectContent></Select></div>
                        {currentRule.action === 'sendEmail' && <div className="space-y-2"><Label htmlFor="rule-recipients">Destinatarios (Correos)</Label><Input id="rule-recipients" value={currentRule.recipients.join(', ')} onChange={(e) => handleRuleFormChange('recipients', e.target.value.split(',').map(s => s.trim()))} placeholder="correo1@ejemplo.com, correo2@ejemplo.com" /><p className="text-xs text-muted-foreground">Separar por comas.</p></div>}
                        {currentRule.action === 'sendEmail' && <div className="space-y-2"><Label htmlFor="rule-subject">Asunto del Correo (Opcional)</Label><Input id="rule-subject" value={currentRule.subject || ''} onChange={(e) => handleRuleFormChange('subject', e.target.value)} placeholder="Asunto personalizado..."/></div>}
                    </div>
                    <DialogFooter><DialogClose asChild><Button type="button" variant="ghost">Cancelar</Button></DialogClose><Button onClick={handleSaveRule} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Guardar Regla</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog for Scheduled Tasks */}
            <Dialog open={isTaskFormOpen} onOpenChange={setIsTaskFormOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{isEditingTask ? 'Editar Tarea Programada' : 'Nueva Tarea Programada'}</DialogTitle></DialogHeader>
                     <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label htmlFor="task-name">Nombre de la Tarea</Label><Input id="task-name" value={currentTask.name} onChange={(e) => handleTaskFormChange('name', e.target.value)} placeholder="Ej: Sincronización Diaria del ERP" /></div>
                        <div className="space-y-2"><Label htmlFor="task-schedule">Horario (Expresión Cron)</Label><Input id="task-schedule" className="font-mono" value={currentTask.schedule} onChange={(e) => handleTaskFormChange('schedule', e.target.value)} /><p className="text-xs text-muted-foreground">Formato: Minuto Hora DíaMes Mes DíaSemana. <a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer" className="underline">Ayuda de Cron</a>.</p></div>
                        <div className="space-y-2"><Label htmlFor="task-id">Acción a Ejecutar</Label><Select value={currentTask.taskId} onValueChange={(val) => handleTaskFormChange('taskId', val)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(AVAILABLE_TASKS).map(([id, task]) => <SelectItem key={id} value={id}>{task.name}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                    <DialogFooter><DialogClose asChild><Button type="button" variant="ghost">Cancelar</Button></DialogClose><Button onClick={handleSaveTask} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Guardar Tarea</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );
}
