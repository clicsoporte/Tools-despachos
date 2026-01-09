/**
 * @fileoverview Client-side functions for interacting with the notifications module's server-side DB functions.
 */
'use server';

import type { NotificationRule, NotificationServiceConfig, ScheduledTask } from '@/modules/core/types';
import { logInfo } from '@/modules/core/lib/logger';
import {
    getAllNotificationRules as getAllRulesServer,
    saveNotificationRule as saveRuleServer,
    deleteNotificationRule as deleteRuleServer,
    getAllScheduledTasks as getAllTasksServer,
    saveScheduledTask as saveTaskServer,
    deleteScheduledTask as deleteTaskServer,
    getNotificationServiceSettings as getServiceSettingsServer,
    saveNotificationServiceSettings as saveServiceSettingsServer
} from './db';
import { revalidatePath } from 'next/cache';

// --- Rules ---

export async function getAllNotificationRules(): Promise<NotificationRule[]> {
    return getAllRulesServer();
}

export async function saveNotificationRule(rule: Omit<NotificationRule, 'id'> | NotificationRule): Promise<NotificationRule> {
    const savedRule = await saveRuleServer(rule);
    await logInfo(`Notification rule saved: ${savedRule.name}`, { ruleId: savedRule.id, event: savedRule.event });
    revalidatePath('/dashboard/admin/notifications');
    return savedRule;
}

export async function deleteNotificationRule(id: number): Promise<void> {
    await deleteRuleServer(id);
    await logInfo(`Notification rule deleted`, { ruleId: id });
    revalidatePath('/dashboard/admin/notifications');
}

// --- Scheduled Tasks ---

export async function getAllScheduledTasks(): Promise<ScheduledTask[]> {
    return getAllTasksServer();
}

export async function saveScheduledTask(task: Omit<ScheduledTask, 'id'> | ScheduledTask): Promise<ScheduledTask> {
    const savedTask = await saveTaskServer(task);
    await logInfo(`Scheduled task saved: ${savedTask.name}`, { taskId: savedTask.id, schedule: savedTask.schedule });
    revalidatePath('/dashboard/admin/notifications');
    return savedTask;
}

export async function deleteScheduledTask(id: number): Promise<void> {
    await deleteTaskServer(id);
    await logInfo(`Scheduled task deleted`, { taskId: id });
    revalidatePath('/dashboard/admin/notifications');
}


// --- Settings ---

export async function getNotificationServiceSettings(service: 'telegram'): Promise<NotificationServiceConfig> {
    return getServiceSettingsServer(service);
}

export async function saveNotificationServiceSettings(service: 'telegram', config: any): Promise<void> {
    await saveServiceSettingsServer(service, config);
    await logInfo(`Notification service settings updated for: ${service}`);
    revalidatePath('/dashboard/admin/notifications/settings');
}
