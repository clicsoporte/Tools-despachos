/**
 * @fileoverview Server Actions for the notification system.
 */
"use server";

import { revalidatePath } from 'next/cache';
import { getNotifications as dbGetNotifications, markNotificationsAsRead as dbMarkAsRead, createNotification as dbCreateNotification, getNotificationById, deleteNotificationById } from './db';
import { getAllUsers as dbGetAllUsers } from './auth';
import type { Notification, User } from '../types';
import { updateStatus as updatePlannerStatus } from '@/modules/planner/lib/db';
import { updateStatus as updateRequestStatus } from '@/modules/requests/lib/db';
import { logError } from './logger';

/**
 * Creates a new notification for a single user.
 * @param notificationData - The data for the notification.
 */
export async function createNotification(notificationData: Omit<Notification, 'id' | 'timestamp' | 'isRead'>): Promise<void> {
    await dbCreateNotification(notificationData);
}

/**
 * Creates a notification for all users who have a specific role.
 * @param roleId - The ID of the role to target.
 * @param message - The notification message.
 * @param href - An optional URL for the notification to link to.
 * @param entityId - The ID of the entity this notification relates to (e.g., order ID).
 * @param entityType - The type of entity (e.g., 'production-order').
 * @param taskType - A specific identifier for the task (e.g., 'approve').
 */
export async function createNotificationForRole(
    roleId: string, 
    message: string, 
    href: string,
    entityId: number,
    entityType: string,
    taskType: string
): Promise<void> {
    const allUsers = await dbGetAllUsers();
    const targetUsers = allUsers.filter((user: User) => user.role === roleId || user.role === 'admin');

    for (const user of targetUsers) {
        await dbCreateNotification({ 
            userId: user.id, 
            message, 
            href,
            entityId,
            entityType,
            taskType,
        });
    }
}


/**
 * Fetches all unread notifications for a specific user.
 * @param userId - The ID of the user.
 * @returns A promise that resolves to an array of notifications.
 */
export async function getNotificationsForUser(userId: number): Promise<Notification[]> {
    return dbGetNotifications(userId);
}

/**
 * Marks a specific notification as read.
 * @param notificationId - The ID of the notification to mark as read.
 * @param userId - The ID of the user who owns the notification, for security.
 */
export async function markNotificationAsRead(notificationId: number, userId: number): Promise<void> {
    await dbMarkAsRead([notificationId], userId);
    revalidatePath('/dashboard');
}

/**
 * Marks all of a user's notifications as read.
 * @param userId - The ID of the user whose notifications should be marked as read.
 */
export async function markAllNotificationsAsRead(userId: number): Promise<void> {
    const notifications = await dbGetNotifications(userId);
    const unreadIds = notifications.filter(n => !n.isRead && typeof n.id === 'number').map(n => n.id as number);
    if (unreadIds.length > 0) {
        await dbMarkAsRead(unreadIds, userId);
        revalidatePath('/dashboard');
    }
}

/**
 * Executes a specific action related to a notification, like approving or rejecting a request.
 * @param notificationId - The ID of the notification triggering the action.
 * @param actionType - The action to perform ('approve' or 'reject').
 * @param updatedBy - The name of the user performing the action.
 * @param userId - The ID of the user performing the action (for validation).
 */
export async function executeNotificationAction(notificationId: number, actionType: 'approve' | 'reject', updatedBy: string, userId: number): Promise<{ success: boolean, message: string }> {
    const notification = await getNotificationById(notificationId);

    if (!notification || notification.userId !== userId) {
        return { success: false, message: 'Notificación no encontrada o no autorizada.' };
    }
    
    if (!notification.entityId || !notification.entityType || !notification.taskType) {
        return { success: false, message: 'La notificación no es accionable.' };
    }

    try {
        if (notification.entityType === 'production-order') {
            if (notification.taskType === 'cancellation-request') {
                const targetStatus = actionType === 'approve' ? 'canceled' : 'approved'; // Revert to approved if rejected
                await updatePlannerStatus({
                    orderId: notification.entityId,
                    status: targetStatus,
                    notes: `Solicitud de cancelación ${actionType === 'approve' ? 'aprobada' : 'rechazada'} por ${updatedBy} desde notificaciones.`,
                    updatedBy,
                    reopen: false
                });
            }
        } else if (notification.entityType === 'purchase-request') {
             if (notification.taskType === 'cancellation-request') {
                const targetStatus = actionType === 'approve' ? 'canceled' : 'approved';
                await updateRequestStatus({
                    requestId: notification.entityId,
                    status: targetStatus,
                    notes: `Solicitud de cancelación ${actionType === 'approve' ? 'aprobada' : 'rechazada'} por ${updatedBy} desde notificaciones.`,
                    updatedBy,
                    reopen: false
                });
            }
        }

        // Action was successful, delete the notification as it's been handled.
        await deleteNotificationById(notificationId);
        revalidatePath('/dashboard'); // Revalidate to update UI everywhere
        return { success: true, message: 'Acción completada.' };

    } catch (error: any) {
        logError('Error executing notification action', { error: error.message, notificationId, actionType });
        return { success: false, message: 'Error al procesar la acción.' };
    }
}
