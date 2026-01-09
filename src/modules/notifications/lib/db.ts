'use server';

/**
 * @fileoverview Server-side functions for the notifications database.
 * This file handles all direct interactions with the `notifications.db` SQLite database,
 * including schema initialization, migrations, and CRUD operations for rules and settings.
 */

import { connectDb, getUnreadSuggestions as dbGetUnreadSuggestions } from '@/modules/core/lib/db';
import type { Notification, NotificationRule, NotificationServiceConfig, ScheduledTask, Suggestion } from '@/modules/core/types';

const NOTIFICATIONS_DB_FILE = 'notifications.db';

export async function initializeNotificationsDb(db: import('better-sqlite3').Database) {
    const schema = `
        CREATE TABLE IF NOT EXISTS notification_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            event TEXT NOT NULL,
            action TEXT NOT NULL,
            recipients TEXT NOT NULL,
            subject TEXT,
            enabled INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS notification_settings (
            service TEXT PRIMARY KEY,
            config TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS scheduled_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            schedule TEXT NOT NULL,
            taskId TEXT NOT NULL,
            enabled INTEGER DEFAULT 1
        );
    `;
    db.exec(schema);
    
    // Default Telegram settings (empty)
    db.prepare(`
        INSERT OR IGNORE INTO notification_settings (service, config) 
        VALUES ('telegram', ?)
    `).run(JSON.stringify({ botToken: '', chatId: '' }));

    console.log(`Database ${NOTIFICATIONS_DB_FILE} initialized for Notifications Engine.`);
}

export async function runNotificationsMigrations(db: import('better-sqlite3').Database) {
    try {
        if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_tasks'`).get()) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS scheduled_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    schedule TEXT NOT NULL,
                    taskId TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1
                );
            `);
        }
    } catch (error) {
        console.error('Error during notifications DB migrations:', error);
    }
}

// --- Rules ---
export async function getAllNotificationRules(): Promise<NotificationRule[]> {
    const db = await connectDb(NOTIFICATIONS_DB_FILE);
    const rows = db.prepare('SELECT * FROM notification_rules ORDER BY name ASC').all() as any[];
    return rows.map(row => ({
        ...row,
        enabled: Boolean(row.enabled),
        recipients: JSON.parse(row.recipients),
    }));
}

export async function saveNotificationRule(rule: Omit<NotificationRule, 'id'> | NotificationRule): Promise<NotificationRule> {
    const db = await connectDb(NOTIFICATIONS_DB_FILE);
    const dataToSave = {
        ...rule,
        recipients: JSON.stringify(rule.recipients),
        enabled: rule.enabled ? 1 : 0,
    };

    if ('id' in rule && rule.id) {
        // Update existing rule
        db.prepare(`
            UPDATE notification_rules SET
                name = @name,
                event = @event,
                action = @action,
                recipients = @recipients,
                subject = @subject,
                enabled = @enabled
            WHERE id = @id
        `).run(dataToSave);
        return rule as NotificationRule;
    } else {
        // Create new rule
        const info = db.prepare(`
            INSERT INTO notification_rules (name, event, action, recipients, subject, enabled)
            VALUES (@name, @event, @action, @recipients, @subject, @enabled)
        `).run(dataToSave);
        return { ...rule, id: info.lastInsertRowid as number };
    }
}

export async function deleteNotificationRule(id: number): Promise<void> {
    const db = await connectDb(NOTIFICATIONS_DB_FILE);
    db.prepare('DELETE FROM notification_rules WHERE id = ?').run(id);
}

// --- Scheduled Tasks ---
export async function getAllScheduledTasks(): Promise<ScheduledTask[]> {
    const db = await connectDb(NOTIFICATIONS_DB_FILE);
    const rows = db.prepare('SELECT * FROM scheduled_tasks ORDER BY name ASC').all() as any[];
    return rows.map(row => ({
        ...row,
        enabled: Boolean(row.enabled),
    }));
}

export async function saveScheduledTask(task: Omit<ScheduledTask, 'id'> | ScheduledTask): Promise<ScheduledTask> {
    const db = await connectDb(NOTIFICATIONS_DB_FILE);
    const dataToSave = { ...task, enabled: task.enabled ? 1 : 0 };

    if ('id' in task && task.id) {
        db.prepare(`UPDATE scheduled_tasks SET name = @name, schedule = @schedule, taskId = @taskId, enabled = @enabled WHERE id = @id`).run(dataToSave);
        return task as ScheduledTask;
    } else {
        const info = db.prepare(`INSERT INTO scheduled_tasks (name, schedule, taskId, enabled) VALUES (@name, @schedule, @taskId, @enabled)`).run(dataToSave);
        return { ...task, id: info.lastInsertRowid as number };
    }
}

export async function deleteScheduledTask(id: number): Promise<void> {
    const db = await connectDb(NOTIFICATIONS_DB_FILE);
    db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

// --- Settings ---
export async function getNotificationServiceSettings(service: 'telegram'): Promise<NotificationServiceConfig> {
    const db = await connectDb(NOTIFICATIONS_DB_FILE);
    const row = db.prepare('SELECT config FROM notification_settings WHERE service = ?').get(service) as { config: string } | undefined;
    if (row) {
        return JSON.parse(row.config);
    }
    // Return default structure if not found
    return { telegram: { botToken: '', chatId: '' } };
}

export async function saveNotificationServiceSettings(service: 'telegram', config: any): Promise<void> {
    const db = await connectDb(NOTIFICATIONS_DB_FILE);
    db.prepare('INSERT OR REPLACE INTO notification_settings (service, config) VALUES (?, ?)').run(service, JSON.stringify(config));
}


// --- Notification CRUD (from main db) ---

export async function getNotifications(userId: number): Promise<Notification[]> {
    const db = await connectDb();
    const suggestions = await dbGetUnreadSuggestions();
    const notifications = await db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY timestamp DESC').all(userId) as Notification[];
    
    const suggestionNotifications: Notification[] = suggestions.map(s => ({
        id: `suggestion-${s.id}`,
        userId: userId,
        message: `Nueva sugerencia de: ${s.userName}`,
        href: '/dashboard/admin/suggestions',
        isRead: 0,
        timestamp: s.timestamp,
        isSuggestion: true,
        suggestionId: s.id,
    }));
    
    const allNotifications = [...notifications, ...suggestionNotifications].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return JSON.parse(JSON.stringify(allNotifications));
}

export async function markNotificationsAsRead(notificationIds: number[], userId: number): Promise<void> {
  const db = await connectDb();
  if (notificationIds.length === 0) return;
  const placeholders = notificationIds.map(() => '?').join(',');
  db.prepare(`UPDATE notifications SET isRead = 1 WHERE id IN (${placeholders}) AND userId = ?`).run(...notificationIds, userId);
}

export async function createNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>): Promise<void> {
    const db = await connectDb();
    db.prepare(
        `INSERT INTO notifications (userId, message, href, isRead, timestamp, entityId, entityType, entityStatus, taskType) 
         VALUES (@userId, @message, @href, 0, datetime('now'), @entityId, @entityType, @entityStatus, @taskType)`
    ).run(notification);
}

export async function getNotificationById(id: number): Promise<Notification | null> {
    const db = await connectDb();
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Notification | undefined;
    return notification || null;
}

export async function deleteNotificationById(id: number): Promise<void> {
    const db = await connectDb();
    db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
}
