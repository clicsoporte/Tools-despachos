/**
 * @fileoverview Service for sending messages via a Telegram bot.
 */
'use server';

import TelegramBot from 'node-telegram-bot-api';
import { getNotificationServiceSettings } from './db';
import { logError, logInfo } from '@/modules/core/lib/logger';

/**
 * Removes HTML tags from a string.
 * @param html - The HTML string to clean.
 * @returns Plain text string.
 */
function stripHtml(html: string): string {
    return html.replace(/<[^>]*>?/gm, '');
}

/**
 * Sends a message to the configured Telegram chat.
 * @param message - The message content (can be HTML, will be stripped for plain text, but sent as HTML).
 */
export async function sendTelegramMessage(message: string) {
    try {
        const settings = await getNotificationServiceSettings('telegram');
        const { botToken, chatId } = settings.telegram || {};

        if (!botToken || !chatId) {
            logError('Telegram service not configured.', { botToken: !!botToken, chatId: !!chatId });
            throw new Error('El servicio de Telegram no está configurado (falta Token o Chat ID).');
        }

        const bot = new TelegramBot(botToken);

        const maxLength = 4096;
        const truncatedMessage = message.length > maxLength 
            ? message.substring(0, maxLength - 3) + '...' 
            : message;

        await bot.sendMessage(chatId, truncatedMessage, { parse_mode: 'HTML' });
        
        logInfo('Successfully sent message to Telegram.', { chatId });

    } catch (error: any) {
        logError('Failed to send Telegram message', { error: error.message });
        // We re-throw the error so the calling function can handle it if needed.
        throw new Error(`Error al enviar mensaje a Telegram: ${error.message}`);
    }
}
