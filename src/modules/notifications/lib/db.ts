'use server';

/**
 * @fileoverview Server-side functions for the notifications database.
 * This file handles all direct interactions with the `notifications.db` SQLite database,
 * including schema initialization, migrations, and CRUD operations for rules and settings.
 */

import { connectDb } from '@/modules/core/lib/db';
import type { NotificationRule, NotificationServiceConfig } from '@/modules/core/types';

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
    // Future migrations for this module will go here.
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
