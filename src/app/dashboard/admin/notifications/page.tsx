/**
 * @fileoverview Admin page for managing configurable notification rules.
 */
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import type { NotificationRule, NotificationEventId } from '@/modules/core/types';
import { getAllNotificationRules, saveNotificationRule, deleteNotificationRule } from '@/modules/notifications/lib/actions';
import { NOTIFICATION_EVENTS } from '@/modules/notifications/lib/notification-events';
import { PlusCircle, Trash2, Edit, Loader2, Settings } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

const emptyRule: Omit<NotificationRule, 'id'> = {
    name: '',
    event: 'onDispatchCompleted',
    action: 'sendEmail',
    recipients: [],
    subject: '',
    enabled: true,
};

export default function NotificationRulesPage() {
    useAuthorization(['admin:access']); // Simple admin check for now
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [rules, setRules] = useState<NotificationRule[]>([]);
    
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentRule, setCurrentRule] = useState<Omit<NotificationRule, 'id'> | NotificationRule>(emptyRule);
    const [selectedModule, setSelectedModule] = useState('');
    const [ruleToDelete, setRuleToDelete] = useState<NotificationRule | null>(null);

    useEffect(() => {
        setTitle("Gestor de Notificaciones Automáticas");
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const fetchedRules = await getAllNotificationRules();
                setRules(fetchedRules);
            } catch (error: any) {
                toast({ title: 'Error', description: 'No se pudieron cargar las reglas.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [setTitle, toast]);

    const eventModules = useMemo(() => Array.from(new Set(NOTIFICATION_EVENTS.map(e => e.module))), []);
    const eventsForSelectedModule = useMemo(() => 
        NOTIFICATION_EVENTS.filter(e => e.module === selectedModule), 
    [selectedModule]);

    const handleFormChange = (field: keyof typeof currentRule, value: any) => {
        setCurrentRule(prev => ({ ...prev, [field]: value }));
    };

    const handleModuleChange = (moduleName: string) => {
        setSelectedModule(moduleName);
        const firstEventOfModule = NOTIFICATION_EVENTS.find(e => e.module === moduleName)?.id;
        if (firstEventOfModule) {
            handleFormChange('event', firstEventOfModule);
        }
    };

    const handleSave = async () => {
        if (!currentRule.name || !currentRule.event || !currentRule.action || currentRule.recipients.length === 0) {
            toast({ title: 'Datos incompletos', description: 'Nombre, evento, acción y al menos un destinatario son requeridos.', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        try {
            const savedRule = await saveNotificationRule(currentRule);
            if (isEditing) {
                setRules(rules.map(r => r.id === savedRule.id ? savedRule : r));
            } else {
                setRules([...rules, savedRule]);
            }
            setIsFormOpen(false);
            toast({ title: 'Regla Guardada', description: `La regla "${savedRule.name}" ha sido guardada.` });
        } catch (error: any) {
            toast({ title: 'Error al Guardar', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!ruleToDelete) return;
        setIsSubmitting(true);
        try {
            await deleteNotificationRule(ruleToDelete.id);
            setRules(rules.filter(r => r.id !== ruleToDelete.id));
            toast({ title: 'Regla Eliminada', variant: 'destructive' });
            setRuleToDelete(null);
        } catch (error: any) {
            toast({ title: 'Error al Eliminar', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const openForm = (rule?: NotificationRule) => {
        if (rule) {
            const eventModule = NOTIFICATION_EVENTS.find(e => e.id === rule.event)?.module || '';
            setCurrentRule(rule);
            setSelectedModule(eventModule);
            setIsEditing(true);
        } else {
            const firstModule = eventModules[0] || '';
            setCurrentRule(emptyRule);
            setSelectedModule(firstModule);
            handleModuleChange(firstModule); // Set initial event
            setIsEditing(false);
        }
        setIsFormOpen(true);
    };

    if (isLoading) {
        return <main className="p-6"><Skeleton className="h-64 w-full" /></main>
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle>Reglas de Notificación</CardTitle>
                            <CardDescription>Crea y gestiona reglas para enviar notificaciones automáticas cuando ocurren eventos en el sistema.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                             <Button variant="outline" asChild>
                                <Link href="/dashboard/admin/notifications/settings">
                                    <Settings className="mr-2 h-4 w-4"/> Configurar Servicios
                                </Link>
                            </Button>
                             <Button onClick={() => openForm()}>
                                <PlusCircle className="mr-2 h-4 w-4"/> Nueva Regla
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
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
                                    <TableCell>
                                        <Switch
                                            checked={rule.enabled}
                                            onCheckedChange={(checked) => saveNotificationRule({ ...rule, enabled: checked })}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => openForm(rule)}><Edit className="h-4 w-4"/></Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={() => setRuleToDelete(rule)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Eliminar esta regla?</AlertDialogTitle>
                                                    <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleDelete} disabled={isSubmitting}>
                                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                                        Eliminar
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow><TableCell colSpan={5} className="text-center h-24">No hay reglas creadas.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

             <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{isEditing ? 'Editar Regla' : 'Nueva Regla de Notificación'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="rule-name">Nombre de la Regla</Label>
                            <Input id="rule-name" value={currentRule.name} onChange={(e) => handleFormChange('name', e.target.value)} placeholder="Ej: Notificar Despachos a Logística" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="rule-module">Módulo</Label>
                                <Select value={selectedModule} onValueChange={handleModuleChange}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {eventModules.map(module => <SelectItem key={module} value={module}>{module}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rule-event">Disparador (Evento)</Label>
                                <Select value={currentRule.event} onValueChange={(val) => handleFormChange('event', val as NotificationEventId)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {eventsForSelectedModule.map(event => <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Acción</Label>
                            <Select value={currentRule.action} onValueChange={(val) => handleFormChange('action', val)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sendEmail">Enviar Correo Electrónico</SelectItem>
                                    <SelectItem value="sendTelegram">Enviar a Telegram</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rule-recipients">Destinatarios</Label>
                            <Input id="rule-recipients" value={currentRule.recipients.join(', ')} onChange={(e) => handleFormChange('recipients', e.target.value.split(',').map(s => s.trim()))} placeholder="correo1@ejemplo.com, correo2@ejemplo.com" />
                            <p className="text-xs text-muted-foreground">Separar por comas. Para Telegram, este campo no se utiliza.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rule-subject">Asunto del Correo (Opcional)</Label>
                            <Input id="rule-subject" value={currentRule.subject || ''} onChange={(e) => handleFormChange('subject', e.target.value)} placeholder="Asunto personalizado..."/>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="ghost">Cancelar</Button></DialogClose>
                        <Button onClick={handleSave} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Guardar Regla
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );
}