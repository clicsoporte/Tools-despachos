/**
 * @fileoverview Admin page for managing notification service settings (e.g., Telegram).
 */
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import type { NotificationServiceConfig } from '@/modules/core/types';
import { getNotificationServiceSettings, saveNotificationServiceSettings } from '@/modules/notifications/lib/actions';
import { Save, Loader2, Bot, AtSign } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function NotificationSettingsPage() {
    useAuthorization(['admin:access']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [settings, setSettings] = useState<NotificationServiceConfig | null>(null);

    useEffect(() => {
        setTitle("Configuración de Servicios de Notificación");
        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                const telegramSettings = await getNotificationServiceSettings('telegram');
                setSettings({ telegram: telegramSettings.telegram || { botToken: '', chatId: '' } });
            } catch (error: any) {
                toast({ title: 'Error', description: 'No se pudieron cargar los ajustes.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, [setTitle, toast]);

    const handleTelegramChange = (field: 'botToken' | 'chatId', value: string) => {
        setSettings(prev => prev ? ({
            ...prev,
            telegram: { ...prev.telegram, [field]: value }
        }) : null);
    };

    const handleSave = async () => {
        if (!settings) return;
        setIsSubmitting(true);
        try {
            await saveNotificationServiceSettings('telegram', settings.telegram);
            toast({ title: 'Configuración Guardada', description: 'Los ajustes de Telegram han sido guardados.' });
        } catch (error: any) {
            toast({ title: 'Error al Guardar', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading || !settings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-2xl">
                    <Skeleton className="h-64 w-full" />
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                <div className="mx-auto max-w-2xl space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Bot className="h-6 w-6"/>Configuración de Telegram</CardTitle>
                            <CardDescription>Ingresa las credenciales de tu bot de Telegram para habilitar las notificaciones por este canal.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="botToken">Token del Bot</Label>
                                <Input
                                    id="botToken"
                                    type="password"
                                    value={settings.telegram?.botToken || ''}
                                    onChange={(e) => handleTelegramChange('botToken', e.target.value)}
                                    placeholder="Ej: 1234567890:ABC-DEF1234..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="chatId">Chat ID (Grupo o Canal)</Label>
                                <Input
                                    id="chatId"
                                    value={settings.telegram?.chatId || ''}
                                    onChange={(e) => handleTelegramChange('chatId', e.target.value)}
                                    placeholder="Ej: -1001234567890"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Para obtener el ID, puedes usar bots como @userinfobot en Telegram. Debe empezar con un guion (-) si es un canal o grupo.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardFooter>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Configuración
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </form>
        </main>
    );
}
