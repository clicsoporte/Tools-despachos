
/**
 * @fileoverview Server-side functions for the cost assistant database.
 * This file handles all direct interactions with the `cost_assistant.db` SQLite database,
 * including schema initialization, migrations, and CRUD operations for settings and drafts.
 */
"use server";

import { connectDb } from '@/modules/core/lib/db';
import type { CostAnalysisDraft, CostAssistantSettings } from '@/modules/core/types';

const COST_ASSISTANT_DB_FILE = 'cost_assistant.db';

/**
 * Initializes the database for the Cost Assistant module.
 * This function is called automatically when the DB is first created.
 * @param db - The database instance.
 */
export async function initializeCostAssistantDb(db: import('better-sqlite3').Database) {
    const schema = `
        CREATE TABLE IF NOT EXISTS drafts (
            id TEXT PRIMARY KEY,
            userId INTEGER NOT NULL,
            name TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `;
    db.exec(schema);
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('nextDraftNumber', '1')`).run();
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('draftPrefix', 'AC-')`).run();
    console.log(`Database ${COST_ASSISTANT_DB_FILE} initialized for Cost Assistant.`);
}

/**
 * Checks for and applies necessary database schema migrations for the Cost Assistant module.
 * @param db - The database instance to migrate.
 */
export async function runCostAssistantMigrations(db: import('better-sqlite3').Database) {
    try {
        const settingsTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='settings'`).get();
        if (!settingsTable) {
            console.log("MIGRATION (cost_assistant.db): Creating 'settings' table.");
            db.exec(`
                CREATE TABLE settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            `);
            db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('nextDraftNumber', '1')`).run();
            db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('draftPrefix', 'AC-')`).run();
        }
    } catch (error) {
        console.error("Error during cost assistant migrations:", error);
    }
}


export async function getAllDrafts(userId: number): Promise<CostAnalysisDraft[]> {
    const db = await connectDb(COST_ASSISTANT_DB_FILE);
    try {
        const rows = db.prepare(`SELECT * FROM drafts WHERE userId = ? ORDER BY createdAt DESC`).all(userId) as any[];
        return rows.map(row => {
            const data = JSON.parse(row.data);
            return {
                id: row.id,
                userId: row.userId,
                name: row.name,
                createdAt: row.createdAt,
                ...data
            };
        });
    } catch (error) {
        console.error("Failed to get cost assistant drafts:", error);
        return [];
    }
}

export async function saveDraft(draft: Omit<CostAnalysisDraft, 'id' | 'createdAt'>, draftPrefix: string, nextDraftNumber: number): Promise<CostAnalysisDraft> {
    const db = await connectDb(COST_ASSISTANT_DB_FILE);
    const id = `${draftPrefix}${String(nextDraftNumber).padStart(5, '0')}`;
    const createdAt = new Date().toISOString();
    
    const { userId, name, ...dataToStore } = draft;

    db.prepare(`
        INSERT OR REPLACE INTO drafts (id, userId, name, data, createdAt)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, name, JSON.stringify(dataToStore), createdAt);

    // Increment the draft number
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'nextDraftNumber'`).run(nextDraftNumber + 1);
    
    return { id, createdAt, ...draft };
}

export async function deleteDraft(id: string): Promise<void> {
    const db = await connectDb(COST_ASSISTANT_DB_FILE);
    db.prepare(`DELETE FROM drafts WHERE id = ?`).run(id);
}


export async function getNextDraftNumber(): Promise<number> {
    const settings = await getCostAssistantDbSettings();
    return settings.nextDraftNumber || 1;
}

export async function getCostAssistantDbSettings(): Promise<Partial<CostAssistantSettings>> {
    const db = await connectDb(COST_ASSISTANT_DB_FILE);
    const settings: Partial<CostAssistantSettings> = {};
    try {
        // Run migration logic directly here to ensure table exists before querying.
        // This is a defensive check in case the main connection flow didn't run.
        await runCostAssistantMigrations(db);

        const rows = db.prepare(`SELECT key, value FROM settings`).all() as {key: string, value: string}[];
        for (const row of rows) {
            if (row.key === 'draftPrefix') {
                settings.draftPrefix = row.value;
            } else if (row.key === 'nextDraftNumber') {
                settings.nextDraftNumber = Number(row.value);
            }
        }
    } catch (error) {
        console.error("Error fetching cost assistant DB settings:", error);
        // Return default values if reading fails, but the table should now exist.
        return { draftPrefix: 'AC-', nextDraftNumber: 1 };
    }
    return settings;
}

export async function saveCostAssistantDbSettings(settings: Partial<CostAssistantSettings>): Promise<void> {
    const db = await connectDb(COST_ASSISTANT_DB_FILE);
    const transaction = db.transaction(() => {
        if (settings.draftPrefix !== undefined) {
            db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('draftPrefix', ?)`).run(settings.draftPrefix);
        }
        if (settings.nextDraftNumber !== undefined) {
            db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('nextDraftNumber', ?)`).run(settings.nextDraftNumber);
        }
    });
    transaction();
}
