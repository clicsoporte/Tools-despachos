/**
 * @fileoverview Admin page for viewing and managing user suggestions.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useToast } from '@/modules/core/hooks/use-toast';
import { getSuggestions, markSuggestionAsRead, deleteSuggestion as deleteSuggestionAction } from '@/modules/core/lib/suggestions-actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, CheckCircle2, MessageSquare, RefreshCw, Loader2 } from 'lucide-react';
import type { Suggestion } from '@/modules/core/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/modules/core/hooks/useAuth';

export default function SuggestionsPage() {
    const { isAuthorized } = useAuthorization(['admin:suggestions:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { updateUnreadSuggestionsCount } = useAuth(); // To update the badge count

    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [suggestionToDelete, setSuggestionToDelete] = useState<Suggestion | null>(null);

    const fetchSuggestions = useCallback(async (isRefreshAction = false) => {
        if (isRefreshAction) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        try {
            const data = await getSuggestions();
            setSuggestions(data);
            await updateUnreadSuggestionsCount();
        } catch (error) {
            toast({ title: "Error", description: "No se pudieron cargar las sugerencias.", variant: "destructive" });
        } finally {
            if (isRefreshAction) {
                setIsRefreshing(false);
            } else {
                setIsLoading(false);
            }
        }
    }, [toast, updateUnreadSuggestionsCount]);

    useEffect(() => {
        setTitle("Buzón de Sugerencias");
        if (isAuthorized) {
            fetchSuggestions(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthorized]);

    const handleMarkAsRead = async (id: number) => {
        await markSuggestionAsRead(id);
        setSuggestions(prev => prev.map(s => s.id === id ? { ...s, isRead: 1 } : s));
        await updateUnreadSuggestionsCount();
    };

    const handleDelete = async () => {
        if (!suggestionToDelete) return;
        await deleteSuggestionAction(suggestionToDelete.id);
        setSuggestions(prev => prev.filter(s => s.id !== suggestionToDelete.id));
        toast({ title: "Sugerencia Eliminada", variant: "destructive" });
        setSuggestionToDelete(null);
        await updateUnreadSuggestionsCount();
    };

    if (isAuthorized === null) {
        return null;
    }

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-4 w-96 mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </CardContent>
                </Card>
            </main>
        );
    }
    
    if (isAuthorized === false) {
        return null; // Or a dedicated access denied component
    }


    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Buzón de Sugerencias</CardTitle>
                        <CardDescription>Feedback y sugerencias enviadas por los usuarios.</CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => fetchSuggestions(true)} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
                        Refrescar
                    </Button>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[70vh]">
                        <div className="space-y-4 pr-4">
                            {suggestions.length > 0 ? (
                                suggestions.map(s => (
                                    <div key={s.id} className={cn("p-4 rounded-lg border flex flex-col sm:flex-row justify-between gap-4", s.isRead ? 'bg-muted/50' : 'bg-card')}>
                                        <div className="space-y-2 flex-1">
                                            <p className={cn("text-sm", s.isRead && 'text-muted-foreground')}>{s.content}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Enviado por <strong>{s.userName}</strong> el {format(parseISO(s.timestamp), 'dd/MM/yyyy \'a las\' HH:mm', { locale: es })}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {!s.isRead && (
                                                <Button variant="ghost" size="sm" onClick={() => handleMarkAsRead(s.id)}>
                                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600"/>
                                                    Marcar como leído
                                                </Button>
                                            )}
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSuggestionToDelete(s)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Eliminar sugerencia?</AlertDialogTitle>
                                                        <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel onClick={() => setSuggestionToDelete(null)}>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleDelete}>Sí, eliminar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center h-60 border-dashed border-2 rounded-lg">
                                    <MessageSquare className="h-12 w-12 text-muted-foreground"/>
                                    <p className="mt-4 text-muted-foreground">El buzón de sugerencias está vacío.</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </main>
    );
}
