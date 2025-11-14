/**
 * @fileoverview Server Actions for mutating (adding, updating) suggestions.
 * This file is separated to isolate functions that use `revalidatePath`, which
 * can cause build issues if imported into client components.
 */
"use server";

import { revalidatePath } from 'next/cache';
import { logInfo, logError } from './logger';
import { connectDb } from './db';

/**
 * Inserts a new suggestion into the database.
 * @param content - The text of the suggestion.
 * @param userId - The ID of the user submitting the suggestion.
 * @param userName - The name of the user submitting the suggestion.
 */
export async function addSuggestion(content: string, userId: number, userName: string): Promise<void> {
    const db = await connectDb();
    try {
        db.prepare(`
            INSERT INTO suggestions (content, userId, userName, isRead, timestamp)
            VALUES (?, ?, ?, 0, ?)
        `).run(content, userId, userName, new Date().toISOString());
        
        await logInfo('New suggestion submitted', { user: userName });
        // Revalidate the admin page to show the new suggestion immediately.
        revalidatePath('/dashboard/admin/suggestions');
    } catch (error: any) {
        logError("Failed to add suggestion to DB", { error: error.message });
        throw error;
    }
}
