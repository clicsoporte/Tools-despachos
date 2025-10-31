/**
 * @fileoverview A component for displaying a notification bell icon with a badge
 * and a dropdown list of recent notifications.
 */
"use client";

import { useAuth } from "@/modules/core/hooks/useAuth";
import { markNotificationAsRead, markAllNotificationsAsRead, executeNotificationAction } from "@/modules/core/lib/notifications-actions";
import { markSuggestionAsRead } from "@/modules/core/lib/suggestions-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, CheckCheck, MessageSquare, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Notification, ProductionOrderStatus, PurchaseRequestStatus } from "@/modules/core/types";
import { useToast } from "@/modules/core/hooks/use-toast";
import React, { useState } from "react";
import { Badge } from "../ui/badge";

const statusTranslations: { [key: string]: string } = {
  'canceled': 'Cancelada',
  'completed': 'Completada',
  'received-in-warehouse': 'En Bodega',
  'entered-erp': 'Ingresada ERP'
};

export function NotificationBell() {
    const { user, unreadNotificationsCount, notifications, fetchUnreadNotifications, unreadSuggestions, updateUnreadSuggestionsCount } = useAuth();
    const { toast } = useToast();
    const [isActionLoading, setIsActionLoading] = useState<number | null>(null);
    const totalUnread = unreadNotificationsCount + unreadSuggestions.length;

    const combinedNotifications = [
        ...notifications,
        ...unreadSuggestions.map(s => ({
            id: `sugg-${s.id}`,
            userId: s.userId,
            message: `Nueva sugerencia de ${s.userName}`,
            href: '/dashboard/admin/suggestions',
            isRead: 0,
            timestamp: s.timestamp,
            isSuggestion: true,
            suggestionId: s.id,
        }) as Notification)
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());


    const handleMarkAsRead = async (notification: Notification) => {
        if (!user || notification.isRead) return;

        if (notification.isSuggestion && notification.suggestionId) {
            await markSuggestionAsRead(notification.suggestionId);
            await updateUnreadSuggestionsCount();
        } else if (!notification.isSuggestion && typeof notification.id === 'number') {
            await markNotificationAsRead(notification.id, user.id);
        }
        await fetchUnreadNotifications();
    };

    const handleMarkAllAsRead = async () => {
        if (!user || unreadNotificationsCount === 0) return;
        await markAllNotificationsAsRead(user.id);
        await fetchUnreadNotifications();
    };

    const handleActionClick = async (e: React.MouseEvent, notification: Notification, action: 'approve' | 'reject') => {
        e.preventDefault(); // Prevent link navigation
        e.stopPropagation(); // Prevent parent onClick
        if (!user || typeof notification.id !== 'number') return;
        
        setIsActionLoading(notification.id);
        const result = await executeNotificationAction(notification.id, action, user.name, user.id);
        if (result.success) {
            toast({ title: 'Acción Realizada', description: result.message });
            await fetchUnreadNotifications(); // Refresh notifications
        } else {
            toast({ title: 'Error', description: result.message, variant: 'destructive' });
        }
        setIsActionLoading(null);
    };

    const renderActionButtons = (notification: Notification) => {
        if (notification.isRead || !notification.taskType || isActionLoading === notification.id) {
            return null;
        }

        if (notification.taskType.includes('cancellation-request')) {
            return (
                 <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={(e) => handleActionClick(e, notification, 'approve')}>
                        <ThumbsUp className="mr-1 h-3 w-3" /> Aprobar Cancelación
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={(e) => handleActionClick(e, notification, 'reject')}>
                        <ThumbsDown className="mr-1 h-3 w-3" /> Rechazar
                    </Button>
                </div>
            );
        }

        // Add other task types here in the future
        return null;
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className={cn("h-5 w-5", totalUnread > 0 && "animate-pulse fill-yellow-400 text-yellow-600")} />
                    {totalUnread > 0 && (
                        <div className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                            {totalUnread}
                        </div>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0">
                <div className="p-4 border-b">
                    <h4 className="font-medium leading-none">Notificaciones</h4>
                    <p className="text-sm text-muted-foreground">
                        Tienes {totalUnread} {totalUnread === 1 ? 'notificación' : 'notificaciones'} sin leer.
                    </p>
                </div>
                <ScrollArea className="h-80">
                    <div className="p-2 space-y-1">
                        {combinedNotifications.length > 0 ? combinedNotifications.map(n => (
                             <Link key={n.id} href={n.href} passHref>
                                <div className="p-2 rounded-md hover:bg-muted cursor-pointer" onClick={() => handleMarkAsRead(n)}>
                                    <div className="flex items-start gap-2">
                                        {n.isSuggestion && <MessageSquare className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0" />}
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <p className={cn("text-sm", n.isRead === 0 && "font-bold")}>{n.message}</p>
                                                {n.entityStatus && ['canceled', 'completed', 'received-in-warehouse', 'entered-erp'].includes(n.entityStatus) && (
                                                    <Badge variant="secondary" className="ml-2 whitespace-nowrap">{statusTranslations[n.entityStatus] || n.entityStatus}</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true, locale: es })}
                                            </p>
                                            {isActionLoading === n.id ? (
                                                <div className="flex justify-center mt-2"><Loader2 className="h-5 w-5 animate-spin" /></div>
                                            ) : renderActionButtons(n)}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        )) : (
                            <p className="text-center text-sm text-muted-foreground py-8">No hay notificaciones.</p>
                        )}
                    </div>
                </ScrollArea>
                {unreadNotificationsCount > 0 && (
                    <div className="p-2 border-t text-center">
                        <Button variant="link" size="sm" onClick={handleMarkAllAsRead}>
                            <CheckCheck className="mr-2 h-4 w-4" />
                            Marcar todas como leídas
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
