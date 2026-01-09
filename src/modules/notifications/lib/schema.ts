/**
 * @fileoverview Defines the expected database schema for the Notifications module.
 * This is used by the central database audit system to verify integrity.
 */

import type { ExpectedSchema } from '@/modules/core/types';

export const notificationsSchema: ExpectedSchema = {
    'notification_rules': ['id', 'name', 'event', 'action', 'recipients', 'subject', 'enabled'],
    'notification_settings': ['service', 'config'],
    'scheduled_tasks': ['id', 'name', 'schedule', 'taskId', 'enabled'],
};
