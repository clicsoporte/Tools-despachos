
/**
 * @fileoverview Page for Cost Assistant settings.
 */
'use client';

import { useEffect, useState } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calculator, Save } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/modules/core/hooks/use-toast';
import { getCostAssistantSettings, saveCostAssistantSettings } from '@/modules/cost-assistant/lib/actions';
import type { CostAssistantSettings } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function CostAssistantSettingsPage() {
    const { isAuthorized } = useAuthorization(['admin:settings:cost-assistant']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const router = useRouter();
    const { user, isReady } = useAuth();
    const [settings, setSettings] = useState<Partial<CostAssistantSettings> | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setTitle("Configuración del Asistente de Costos");
        if (isReady && isAuthorized && user) {
            getCostAssistantSettings(user.id)
                .then(data => {
                    const completeSettings = {
                        draftPrefix: data.draftPrefix ?? 'AC-',
                        nextDraftNumber: data.nextDraftNumber ?? 1,
                    };
                    setSettings(completeSettings);
                })
                .catch(err => {
                    toast({ title: "Error", description: "No se pudieron cargar los ajustes.", variant: "destructive" });
                    console.error(err);
                })
                .finally(() => setIsLoading(false));
        }
    }, [setTitle, isAuthorized, toast, user, isReady]);

    const handleSave = async () => {
        if (!settings || !user) return;
        try {
            await saveCostAssistantSettings(user.id, settings as CostAssistantSettings);
            toast({ title: "Configuración Guardada", description: "Los ajustes del Asistente de Costos han sido actualizados." });
            router.refresh();
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        }
    };
    
    if (isAuthorized === false) {
      return null;
    }

    if (isLoading || !settings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Skeleton className="h-64 w-full max-w-2xl mx-auto" />
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-2xl">
                 <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calculator className="h-6 w-6"/>
                                Configuración del Asistente de Costos
                            </CardTitle>
                            <CardDescription>
                                Ajustes globales para el módulo de Asistente de Costos, incluyendo prefijos y consecutivos para borradores.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="draftPrefix">Prefijo de Borrador</Label>
                                    <Input
                                        id="draftPrefix"
                                        value={settings.draftPrefix || ''}
                                        onChange={(e) => setSettings(prev => prev ? { ...prev, draftPrefix: e.target.value } : null)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="nextDraftNumber">Próximo Número de Borrador</Label>
                                    <Input
                                        id="nextDraftNumber"
                                        type="number"
                                        value={settings.nextDraftNumber || 1}
                                        onChange={(e) => setSettings(prev => prev ? { ...prev, nextDraftNumber: Number(e.target.value) } : null)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit">
                                <Save className="mr-2 h-4 w-4"/>
                                Guardar Cambios
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </div>
        </main>
    );
}
